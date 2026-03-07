# Claude Code 작업 프롬프트 — 텔레그램 관심 매물 봇

## 배경

부부가 네이버부동산/아실 등에서 마음에 드는 매물을 발견하면, 텔레그램 방에 링크를 보내면 자동으로 매물 정보를 파싱하고 정리해주는 봇.
수집된 관심 매물은 wishlist.json에 저장되어 대시보드에서 지도+리스트로 확인 가능.

## 작동 흐름

```
1. 한스 또는 배우자가 텔레그램 방에 네이버부동산 링크 보냄
2. 봇이 URL 감지 → articleNo/articleId 추출
3. 네이버부동산 비공식 API 호출 → 단지명·가격·면적·위치 등 파싱
4. 텔레그램에 요약 카드 즉시 회신
5. wishlist.json에 누적 저장 → GitHub Pages 배포
6. 대시보드 "📌 관심 매물" 탭에서 지도+리스트 확인
```

## 구현할 파일

### 1. `wishlist_bot.py` (신규)

기존 텔레그램 봇(알림 전용)과 별도로, **메시지 수신 기능이 있는 봇 스크립트**.
python-telegram-bot 라이브러리 사용 (polling 방식 or webhook).

#### URL 패턴 감지

```python
import re

NAVER_PATTERNS = [
    # 패턴 1: new.land.naver.com/complexes/{complexNo}?...&articleNo={articleNo}
    re.compile(r'new\.land\.naver\.com/complexes/(\d+)\?.*articleNo=(\d+)'),
    # 패턴 2: fin.land.naver.com/articles/{articleId}
    re.compile(r'fin\.land\.naver\.com/articles/(\d+)'),
    # 패턴 3: m.land.naver.com (모바일)
    re.compile(r'm\.land\.naver\.com.*articleNo=(\d+)'),
]

# 아실 패턴 (향후 추가 가능)
ASIL_PATTERNS = [
    re.compile(r'asil\.kr/.*'),
]
```

#### 네이버부동산 API 호출

```python
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://fin.land.naver.com/",
}

# 매물 키 정보 (realEstateType, tradeType 등 확인용)
KEY_API = "https://fin.land.naver.com/front-api/v1/article/key?articleId={article_id}"

# 매물 상세 정보
BASIC_API = "https://fin.land.naver.com/front-api/v1/article/basicInfo?articleId={article_id}"

# 단지 정보 (세대수, 준공년도, 좌표 등)
COMPLEX_API = "https://fin.land.naver.com/front-api/v1/complex?complexNumber={complex_no}"
```

**파싱 순서:**
1. URL에서 articleId 추출
2. KEY_API 호출 → complexNumber, realEstateType, tradeType 확인
3. BASIC_API 호출 → 단지명, 가격, 면적, 층, 방향, 중개사 등
4. COMPLEX_API 호출 → 세대수, 준공년도, 위도/경도, 주소

⚠️ **네이버 비공식 API 리스크**: 
- IP 차단 가능성 → 호출 간격 1~2초 sleep
- API 구조 변경 가능 → 파싱 실패 시 에러 처리 + 원본 링크만 저장
- GitHub Actions에서 차단될 수 있음 → 로컬 실행 또는 별도 서버 필요

#### 텔레그램 응답 포맷

```
📌 관심 매물 등록!

🏠 래미안메가트리아 | 경기 안양 만안구
💰 매매 4억 2,800만 | 전용 39㎡(12평)
🏗️ 2019년 | 4,253세대
🚇 명학역 도보 5분
📎 https://new.land.naver.com/...

현재 관심 매물: 5건
```

파싱 실패 시:
```
📌 관심 매물 등록! (상세 정보 파싱 실패)

📎 https://fin.land.naver.com/articles/2606928839

현재 관심 매물: 5건
```

#### 명령어

| 명령어 | 기능 |
|--------|------|
| (링크만 보내면) | 자동 등록 |
| `/list` | 현재 관심 매물 전체 리스트 (가격순) |
| `/delete 번호` | 특정 매물 삭제 |
| `/clear` | 전체 초기화 |
| `/help` | 사용법 안내 |

### 2. `wishlist.json` (신규 — 자동 생성)

```json
{
  "updated_at": "2026-02-19T12:00:00",
  "items": [
    {
      "id": 1,
      "article_id": "2608145454",
      "complex_no": "152005",
      "name": "래미안메가트리아",
      "region": "경기 안양 만안구",
      "dong": "안양동",
      "trade_type": "매매",
      "price": 42800,
      "area_m2": 39.0,
      "area_pyeong": 11.8,
      "floor": "10/25",
      "built_year": 2019,
      "households": 4253,
      "lat": 37.3962,
      "lng": 126.9265,
      "station": "명학역",
      "walk_min": 5,
      "url": "https://new.land.naver.com/complexes/152005?articleNo=2608145454",
      "added_at": "2026-02-19T12:00:00",
      "added_by": "Hans",
      "memo": ""
    }
  ]
}
```

### 3. 대시보드 연동 (index.html 수정)

**"📌 관심 매물" 탭 추가:**
- 기존 "매물 시뮬레이션" / "정책·대출" 탭 옆에 새 탭
- 지도에 관심 매물 핀 표시 (⭐ 별모양 또는 💛 노란색)
- 카드 리스트: 가격순 정렬, 메모 편집 가능
- wishlist.json fetch → 렌더링

## 실행 환경 고려사항

### 방법 A: GitHub Actions (polling은 불가)

텔레그램 봇의 메시지 수신(polling)은 상시 실행이 필요해서 GitHub Actions에는 부적합.
→ **wishlist.json 저장 + push**만 GitHub Actions에서 가능.

### 방법 B: 로컬 PC에서 봇 실행 ⭐ 현실적

```
1. 로컬 PC에서 python wishlist_bot.py 실행 (터미널 열어둠)
2. 텔레그램 메시지 수신 → 네이버 API 파싱 → 텔레그램 회신
3. wishlist.json 로컬 저장
4. 주기적으로 git add + commit + push (수동 또는 스크립트)
```

장점: 간단, 비용 없음
단점: PC 켜져있어야 함, push 수동

### 방법 C: 무료 서버 활용 (향후)

- Render.com 무료 tier
- Railway.app 무료 tier
- Oracle Cloud 무료 VM

→ 24시간 봇 실행 가능하지만 세팅이 복잡. 우선 방법 B로 시작.

## 구현 순서

### Step 1: 네이버 API 파싱 테스트
- `test_naver_api.py` 작성
- articleId 하나로 KEY_API → BASIC_API → COMPLEX_API 순서대로 호출
- 실제 응답 JSON 구조 확인 및 필요 필드 추출 검증

### Step 2: 텔레그램 봇 기본 뼈대
- python-telegram-bot 설치
- 메시지 수신 핸들러 (URL 감지)
- 명령어 핸들러 (/list, /delete, /clear)

### Step 3: 파싱 + 봇 통합
- URL 감지 → 네이버 API 호출 → 요약 카드 회신
- wishlist.json 저장

### Step 4: 대시보드 탭 추가
- wishlist.json fetch
- 관심 매물 지도 핀 + 카드 리스트

## 기존 인프라 활용

| 항목 | 기존 | 추가 |
|------|------|------|
| 텔레그램 봇 토큰 | ✅ 이미 있음 (알림용) | 같은 봇에 핸들러 추가 |
| GitHub repo | ✅ HAAN6892/real-estate-monitor | wishlist.json 추가 |
| GitHub Pages | ✅ 대시보드 배포 중 | wishlist.json도 자동 배포 |
| 카카오맵 | ✅ 대시보드에서 사용 중 | 관심 매물 핀도 같은 지도에 |

## 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| 네이버 API IP 차단 | 파싱 실패 시 원본 링크만 저장 + 수동 입력 폴백 |
| 네이버 API 구조 변경 | 파싱 함수 모듈화 → 변경 시 해당 함수만 수정 |
| 봇 상시 실행 필요 | 로컬 PC 실행으로 시작, 필요시 무료 서버 이전 |
| 아실 등 타 사이트 | 우선 네이버만 지원, 파싱 안 되는 URL은 링크만 저장 |

## 커밋 메시지
- Step 1: "feat: 네이버부동산 API 파싱 유틸리티"
- Step 2: "feat: 텔레그램 관심 매물 봇 기본 구조"
- Step 3: "feat: 매물 파싱 + 봇 통합 + wishlist.json 저장"
- Step 4: "feat: 대시보드 관심 매물 탭 추가"
