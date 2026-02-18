# Claude Code 작업 프롬프트 — 출퇴근 소요시간 자동 수집 (ODsay API)

레포: HAAN6892/real-estate-monitor
배포: https://haan6892.github.io/real-estate-monitor/

---

## 배경

현재 commute_time.json에 테스트 데이터 3건만 있음.
매물 ~180개의 출퇴근 소요시간을 수동으로 조사하는 건 비현실적.
ODsay LAB API (대중교통 길찾기)를 활용하여 자동으로 수집하는 배치를 구현.

**워크플로우:**
```
[자동] 모니터링 배치(main.py) 실행 후 → commute_update.py 실행
       → coord_cache.json의 매물 좌표들 → ODsay API 호출 → commute_time.json 업데이트
       → 커밋/푸시 → 대시보드에 자동 반영
```

---

## ODsay API 정보

### 엔드포인트
대중교통 길찾기: `https://api.odsay.com/v1/api/searchPubTransPathT`

### 파라미터
| 파라미터 | 필수 | 설명 |
|---------|:---:|------|
| apiKey | Y | ODsay API 키 |
| SX | Y | 출발지 경도 (longitude) |
| SY | Y | 출발지 위도 (latitude) |
| EX | Y | 도착지 경도 |
| EY | Y | 도착지 위도 |
| SearchType | N | 0: 도시내 (기본값, 이걸 사용) |
| SearchPathType | N | 0: 전체, 1: 지하철, 2: 버스 |

### 도착지 (고정)
강남역 미림타워: **경도 127.0283, 위도 37.4979**
(서울 강남구 역삼동 826)

### 응답 구조 (핵심 필드만)
```json
{
  "result": {
    "path": [
      {
        "pathType": 1,          // 1:지하철, 2:버스, 3:버스+지하철
        "info": {
          "totalTime": 55,      // 총 소요시간(분) ← 이것만 추출
          "totalDistance": 35000,
          "payment": 1250,
          "firstStartStation": "구갈역",
          "lastEndStation": "강남역"
        },
        "subPath": [...]        // 상세 경로 (필요시)
      },
      // ... 여러 경로 후보
    ]
  }
}
```

### 호출 전략

각 매물 좌표에 대해 **2번 호출**:
1. `SearchPathType=1` (지하철만) → 최소 totalTime 추출 → `subway` 값
2. `SearchPathType=0` (전체) → 최소 totalTime 추출 → `transit` 값

지하철만 경로가 없으면 subway = null.

### API 제한
- 무료: **일 1,000회**
- 매물 ~180개 × 2회 = ~360회 → **1일 한도 내 충분**
- 요청 간 0.5초 딜레이 (rate limit 방지)

---

## 구현할 파일

### 1. `commute_update.py` (신규)

```python
"""
출퇴근 소요시간 자동 수집 스크립트
coord_cache.json + data.json → ODsay API → commute_time.json 업데이트
"""

import json
import time
import requests
import os

# 도착지: 강남역 미림타워
DEST_LNG = 127.0283
DEST_LAT = 37.4979

# ODsay API
ODSAY_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"

def load_config():
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)

def load_coord_cache():
    """coord_cache.json에서 매물 좌표 로드"""
    try:
        with open("coord_cache.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def load_data():
    """data.json에서 매물 목록 로드 → 동(dong) 단위로 중복 제거"""
    try:
        with open("data.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("properties", [])
    except:
        return []

def load_existing_commute():
    """기존 commute_time.json 로드"""
    try:
        with open("commute_time.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {
            "destination": "강남역 미림타워",
            "address": "서울 강남구 역삼동 826",
            "survey_basis": "ODsay API 대중교통 길찾기 (자동)",
            "updated": "",
            "data": {}
        }

def search_transit(api_key, sx, sy, search_type=0):
    """
    ODsay 대중교통 길찾기 API 호출
    search_type: 0=전체, 1=지하철만, 2=버스만
    반환: 최소 소요시간(분) 또는 None
    """
    params = {
        "apiKey": api_key,
        "SX": sx,
        "SY": sy,
        "EX": DEST_LNG,
        "EY": DEST_LAT,
        "SearchType": 0,          # 도시내
        "SearchPathType": search_type
    }
    
    try:
        resp = requests.get(ODSAY_URL, params=params, timeout=15)
        result = resp.json()
        
        # 에러 체크
        if "result" not in result or "path" not in result["result"]:
            return None
        
        # 모든 경로 후보 중 최소 소요시간
        times = []
        for path in result["result"]["path"]:
            t = path.get("info", {}).get("totalTime")
            if t is not None:
                times.append(t)
        
        return min(times) if times else None
    
    except Exception as e:
        print(f"  API 에러: {e}")
        return None

def get_dong_key(prop):
    """매물의 동 단위 키 생성: 'sgg_name dong' 또는 'region dong'"""
    region = prop.get("sgg_name") or prop.get("region", "")
    dong = prop.get("dong", "")
    if dong:
        return f"{region} {dong}".strip()
    return region.strip()

def find_coord_for_dong(dong_key, coord_cache, properties):
    """
    해당 동의 대표 좌표를 찾는다.
    1차: coord_cache에서 해당 동에 속하는 매물 좌표 찾기
    2차: properties에서 해당 동의 매물 이름으로 coord_cache 검색
    """
    # 동에 해당하는 매물들의 이름 수집
    dong_props = [p for p in properties if get_dong_key(p) == dong_key]
    
    for prop in dong_props:
        name = prop.get("name", "")
        region = prop.get("sgg_name") or prop.get("region", "")
        dong = prop.get("dong", "")
        
        # coord_cache 키 매칭 시도
        for cache_key, coords in coord_cache.items():
            # 단지명이 포함되는 키 찾기
            if name and name in cache_key:
                return coords.get("lng"), coords.get("lat")
        
        # region+dong으로 포함 매칭
        search = f"{dong}" if dong else region
        for cache_key, coords in coord_cache.items():
            # 정규화 매칭: "시" 제거 후 비교
            norm_key = cache_key.replace("시 ", " ").replace("경기 ", "")
            norm_search = search.replace("시 ", " ").replace("경기 ", "")
            if norm_search in norm_key or norm_key.endswith(search):
                return coords.get("lng"), coords.get("lat")
    
    return None, None

def main():
    config = load_config()
    api_key = config.get("odsay_key")
    
    if not api_key:
        print("❌ ODsay API 키가 config.json에 없습니다.")
        return
    
    coord_cache = load_coord_cache()
    properties = load_data()
    commute = load_existing_commute()
    existing_data = commute.get("data", {})
    
    if not properties:
        print("❌ data.json에서 매물을 로드할 수 없습니다.")
        return
    
    # 동(dong) 단위로 중복 제거
    dong_set = set()
    dong_list = []
    for prop in properties:
        key = get_dong_key(prop)
        if key and key not in dong_set:
            dong_set.add(key)
            dong_list.append(key)
    
    print(f"📍 총 매물: {len(properties)}개, 고유 동: {len(dong_list)}개")
    print(f"📍 기존 데이터: {len(existing_data)}개 동")
    
    # 아직 데이터 없는 동만 처리
    new_dongs = [d for d in dong_list if d not in existing_data]
    print(f"📍 신규 조회 대상: {len(new_dongs)}개 동")
    
    if not new_dongs:
        print("✅ 모든 동의 출퇴근 데이터가 있습니다. 업데이트 없음.")
        return
    
    api_calls = 0
    success = 0
    
    for dong_key in new_dongs:
        # API 호출 한도 체크 (여유 있게 800회로)
        if api_calls >= 800:
            print(f"⚠️ API 호출 한도 근접 ({api_calls}회). 나머지는 다음 실행에서.")
            break
        
        # 해당 동의 좌표 찾기
        lng, lat = find_coord_for_dong(dong_key, coord_cache, properties)
        
        if not lng or not lat:
            print(f"  ⚠️ {dong_key}: 좌표 없음, 스킵")
            existing_data[dong_key] = {
                "subway": None,
                "transit": None,
                "note": "좌표 매칭 실패"
            }
            continue
        
        print(f"  🔍 {dong_key} ({lng}, {lat})")
        
        # 1) 전체 경로 (버스+지하철)
        transit_time = search_transit(api_key, lng, lat, search_type=0)
        api_calls += 1
        time.sleep(0.5)
        
        # 2) 지하철만
        subway_time = search_transit(api_key, lng, lat, search_type=1)
        api_calls += 1
        time.sleep(0.5)
        
        existing_data[dong_key] = {
            "subway": subway_time,
            "transit": transit_time,
            "note": ""
        }
        
        subway_str = f"{subway_time}분" if subway_time else "—"
        transit_str = f"{transit_time}분" if transit_time else "—"
        print(f"    → 🚇 {subway_str}  🚌 {transit_str}")
        
        success += 1
    
    # 저장
    from datetime import datetime, timezone, timedelta
    kst = timezone(timedelta(hours=9))
    commute["updated"] = datetime.now(kst).strftime("%Y-%m-%d %H:%M")
    commute["data"] = existing_data
    
    with open("commute_time.json", "w", encoding="utf-8") as f:
        json.dump(commute, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 완료: {success}개 동 신규 조회 (API 호출: {api_calls}회)")
    print(f"📁 commute_time.json 저장 완료 (총 {len(existing_data)}개 동)")

if __name__ == "__main__":
    main()
```

### 핵심 로직 설명

1. **동(dong) 단위 중복 제거**: 같은 동에 매물 10개 있어도 API는 1번만 호출. 180개 매물 → ~60개 동 → ~120회 API 호출
2. **증분 업데이트**: 이미 데이터 있는 동은 스킵. 새로 추가된 매물의 동만 조회
3. **좌표 매칭**: coord_cache.json에서 해당 동의 매물 좌표를 찾아서 API에 전달
4. **API 2회 호출**: 전체(버스+지하철)와 지하철만을 분리 조회

### 2. `.github/workflows/monitor.yml` 수정

기존 모니터링 워크플로우 끝에 commute_update.py 실행 추가:

```yaml
      - name: 모니터링 실행
        run: python main.py

      - name: 출퇴근 소요시간 업데이트
        run: python commute_update.py
        continue-on-error: true    # 실패해도 메인 배치는 영향 없게

      - name: 변경사항 커밋/푸시
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add commute_time.json
          git diff --staged --quiet || git commit -m "chore: update commute times"
          git push
```

### 3. config.json 생성 부분에 ODsay 키 추가

monitor.yml의 "config.json 생성" 스텝에서:

```yaml
      - name: config.json 생성
        env:
          MY_API_KEY: ${{ secrets.API_KEY }}
          MY_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          MY_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          MY_KAKAO_KEY: ${{ secrets.KAKAO_KEY }}
          MY_ODSAY_KEY: ${{ secrets.ODSAY_KEY }}
        run: |
          python3 << 'EOF'
          import json, os
          config = {
              "api_key": os.environ["MY_API_KEY"],
              "telegram": {
                  "bot_token": os.environ["MY_BOT_TOKEN"],
                  "chat_id": os.environ["MY_CHAT_ID"]
              },
              "kakao_key": os.environ["MY_KAKAO_KEY"],
              "odsay_key": os.environ.get("MY_ODSAY_KEY", ""),
              # ... 기존 filters, regions 등 유지
          }
          # ... 기존 코드 유지
          EOF
```

**주의**: 기존 config.json 생성 코드의 filters, regions 등은 그대로 유지하고, `"odsay_key"` 한 줄만 추가.

---

## 주의사항

1. **기존 monitor.yml 코드 깨뜨리지 말 것** — config.json 생성 부분에 odsay_key만 추가, 나머지 전부 유지
2. **main.py 수정 없음** — commute_update.py는 완전 독립 스크립트
3. **commute_time.json 기존 테스트 데이터** — API 결과로 덮어씀 (동일 키면 업데이트)
4. **continue-on-error: true** — ODsay API 장애 시에도 매물 모니터링은 정상 동작
5. **좌표 매칭 실패 시** — note에 "좌표 매칭 실패" 기록, 대시보드에서는 "—"로 표시
6. **commute_time.json은 git add 대상** — 배치 실행 후 자동 커밋/푸시

## 검증

1. `workflow_dispatch`로 수동 실행
2. commute_time.json에 ~60개 동 데이터가 채워지는지 확인
3. 대시보드에서 카드에 소요시간 표시되는지 확인
4. 필터 "🚌 1시간 이내"가 실제 데이터 기반으로 동작하는지

## 커밋
- monitor.yml 수정: "feat: 출퇴근 소요시간 자동 수집 (ODsay API 연동)"
- commute_update.py 신규: 같은 커밋에 포함
