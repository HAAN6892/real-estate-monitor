# 중계 4단지 호가 알림봇 구현

## 배경

중계동 매수 타겟 확정(중계주공 5·6·7·8단지). 이 4개 단지의 네이버 호가 매물을 
매일 1회 스캔해서 전일 대비 변동(신규/가격인하/가격인상/소멸)을 텔레그램으로 알림.

- 일반 실거래가 배치(main.py)는 국토부 API 기반, 이미 돌고 있음
- 이 작업은 **호가**(네이버 부동산)를 별도로 추적하는 신규 파이프라인
- 차단 리스크 있으니 보수적으로 설계

## 작업 범위

신규 파일 3개 생성:
1. `jungge_price_monitor.py` — 메인 스크립트
2. `jungge_snapshot.json` — 이전 스냅샷 저장 (최초 실행 시 빈 구조로 생성)
3. `.github/workflows/jungge_monitor.yml` — GitHub Actions 배치

기존 파일 변경 금지:
- `naver_parser.py` (읽기만, 재활용 목적)
- `main.py`, `monitor.yml`, `app.js` 등 **절대 수정 금지**

## 타겟 단지

```python
JUNGGE_COMPLEXES = [
    {"complex_no": "245",  "name": "중계주공5단지"},
    {"complex_no": "1110", "name": "중계주공6단지"},
    {"complex_no": "1111", "name": "중계주공7단지"},
    {"complex_no": "246",  "name": "중계주공8단지"},
]
```

## Hans 매수 조건 (배지 표시용)

```python
MATCH_CRITERIA = {
    "max_price_man": 60000,     # 6억 이하 (만원)
    "min_area_m2": 49,          # 전용 49㎡ 이상
    "max_area_m2": 84,          # 전용 84㎡ 이하
    "trade_types": ["매매"],     # 매매만 (전세는 스킵)
}
```

매물이 위 조건 **모두 충족** 시 알림에 ⭐ 배지 표시.
필터링은 안 함 — 전체 잡고 배지로만 표시.

## 구현 세부사항

### 1. jungge_price_monitor.py

#### 1-A. 모듈 import

```python
import json
import os
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
```

naver_parser.py의 함수가 재활용 가능하면 import해서 쓰고, 
불가능하면 이 파일 안에 독립적으로 m.land API 호출 구현.

#### 1-B. m.land 매물 리스트 API 호출

엔드포인트 (기존 naver_parser.py에 있는 것과 동일한 패턴 사용):

```
https://m.land.naver.com/complex/getComplexArticleList
```

쿼리 파라미터:
- `hscpNo`: complex_no (예: 245)
- `order`: date (최신순)
- `realEstateType`: APT
- `tradeType`: A1:B1  (A1=매매, B1=전세 — 둘 다)
- `page`: 1부터 순회

헤더: naver_parser.py의 기존 HEADERS 재활용 (Chrome UA).

각 페이지 호출 사이 **1.5초 sleep**.  
단지 하나 끝나면 **2.5초 sleep** 후 다음 단지.  
429/5xx 발생 시 지수 백오프 재시도 (5초 → 15초 → 45초).  
3회 실패 시 해당 단지 스킵 + 에러 로그, 다른 단지는 계속 진행.

페이지네이션: 응답의 `more` 필드가 true면 다음 페이지, false면 종료. 
최대 10페이지까지만 호출 (safety).

#### 1-C. 매물 데이터 정규화

m.land API 응답에서 필요한 필드만 추출해 딕셔너리로 변환:

```python
{
    "article_no": "2609xxxxxx",       # 유니크 키
    "trade_type": "매매",              # 매매/전세/월세
    "price_man": 55000,                # 가격 (만원 단위, 정수)
    "area_supply_m2": 79.3,            # 공급면적
    "area_exclusive_m2": 59.8,         # 전용면적
    "floor_info": "8/15",              # 현재/전체층
    "direction": "남향",
    "title": "로얄층 올수리",          # 매물 제목
    "tags": ["25년이상", "방3"],       # 특징 태그
    "confirmed_at": "2026-04-15",      # 네이버 확인일
    "is_match": True,                  # Hans 매수조건 부합 여부
    "first_seen": "2026-04-19",        # 최초 감지일 (이 배치에서 채움)
    "url": "https://new.land.naver.com/complexes/245?articleNo=2609xxxxxx"
}
```

⚠️ m.land API 응답 필드명은 실제 응답 보고 맞춰야 함 (예: `tradTpNm`, `prcInfo`, 
`spc1`, `spc2`, `atclNo`, `flrInfo` 등). **절대 추측하지 말고** 첫 실행 시 
응답 JSON 일부를 로그로 출력해서 구조 확인 후 매핑.

**중요**: 기존 naver_parser.py는 `prcInfo` 필드로 가격을 잡는다는 주석이 있음. 
이걸 반드시 참고할 것.

가격 파싱: "5억 5,000" → 55000 (만원 단위 정수) 로 변환.  
이 변환 로직이 naver_parser.py에 이미 있으면 재활용.

#### 1-D. 스냅샷 비교 로직

```python
def diff_snapshots(prev, curr):
    """
    반환:
    {
        "new": [article_dict, ...],           # 신규
        "price_down": [(old, new), ...],      # 가격 인하
        "price_up": [(old, new), ...],        # 가격 인상
        "removed": [article_dict, ...],       # 소멸
    }
    """
```

비교 기준: `article_no`를 key로 prev/curr 딕셔너리 비교.

- prev에 없고 curr에 있으면 → new
- prev에 있고 curr에 없으면 → removed
- 둘 다 있는데 `price_man`이 다르면 → 인하/인상 (부호로 구분)
- 둘 다 있고 가격 동일하면 → 변동 없음 (알림 대상 아님)

신규 매물의 `first_seen`은 오늘 날짜로 채움.  
기존 매물이 가격 변동만 있을 경우 `first_seen`은 prev에서 이어받음.

#### 1-E. 텔레그램 알림 전송

환경변수에서 봇 토큰/채팅ID 읽기:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

GitHub Actions에서는 secrets로 주입됨. 로컬 테스트 시 .env 파일 활용.

#### 1-F. 알림 메시지 포맷

**신규 매물** (⭐ 배지는 is_match=True일 때만):
```
🆕 {단지명} 신규 매물 {⭐ 매수조건 부합}

🏠 {매매/전세} {가격}
📐 전용 {면적}㎡ ({평}평) · {층}
💬 "{title}"
🏷️ {tags 쉼표 구분}
📅 확인 {confirmed_at}

🔗 {url}
```

**가격 인하** (중요, 항상 눈에 띄게):
```
📉 {단지명} 가격 인하! {⭐}

🏠 {매매/전세} {old 가격} → {new 가격} ({차액 ±}만, {변동률 %})
📐 전용 {면적}㎡ · {층}
💬 "{title}"
📅 최초 감지 {first_seen} ({경과일}일차)

🔗 {url}
```

**가격 인상**:
```
📈 {단지명} 가격 인상 {⭐}

🏠 {매매/전세} {old 가격} → {new 가격} (+{차액}만, +{변동률 %})
📐 전용 {면적}㎡
📅 최초 감지 {first_seen} ({경과일}일차)

🔗 {url}
```

**매물 소멸**:
```
❌ {단지명} 매물 소멸 {⭐}

🏠 {매매/전세} {가격} (전용 {면적}㎡)
📅 감지 {first_seen} → 소멸 {오늘} ({경과일}일 경과)
👉 실거래 체결 또는 매도 철회 가능성
```

가격 표기: 55000(만원) → "5억 5,000만" 형식으로 변환.  
면적: 소수점 1자리 (㎡), 평은 반올림 정수.  
배지 ⭐: is_match가 true일 때만 표시, false면 생략.

#### 1-G. 봇 오류 알림

아래 경우 ⚠️ 알림 1개 전송 후 종료 (정상 종료가 아닌 에러 종료):
- 4단지 전부 스캔 실패 (3회 재시도 모두 429/5xx)
- 스냅샷 파일 읽기/쓰기 실패
- 예상치 못한 Exception

```
⚠️ 중계 호가 봇 오류

📅 {오늘 날짜} {실행시각}
🐛 {에러 내용 요약}
👉 GitHub Actions 로그 확인 필요
```

**정상 케이스(변동 0건)에는 아무 알림도 보내지 않음**. 
Hans 결정: 변동 있을 때만 알림.

#### 1-H. 실행 흐름

```
1. jungge_snapshot.json 로드 (없으면 빈 구조 {"complexes": {}} 생성)
2. 4개 단지 순회:
   a. m.land API로 매물 리스트 수집 (페이지네이션)
   b. 정규화
   c. is_match 계산
3. 이전 스냅샷과 diff
4. 변동 있으면 이벤트별로 텔레그램 전송 (각 이벤트 = 별도 메시지)
   - 변동 이벤트 총 20건 초과 시: 묶음 요약 메시지 1개로 전환 
     ("🆕 신규 5건, 📉 인하 3건, ..." + 상세는 상위 5건만)
5. 새 스냅샷 저장 (first_seen 이어받기 반영)
6. 에러 발생 시 ⚠️ 오류 알림 후 non-zero exit
```

변동 이벤트가 많아서 텔레그램 rate limit(초당 30건)에 걸릴 수 있으므로 
**알림 간 0.5초 sleep**.

### 2. jungge_snapshot.json 초기 구조

최초 실행 전 빈 파일로 커밋해둠:

```json
{
  "last_updated": null,
  "complexes": {
    "245":  {"name": "중계주공5단지", "articles": {}},
    "1110": {"name": "중계주공6단지", "articles": {}},
    "1111": {"name": "중계주공7단지", "articles": {}},
    "246":  {"name": "중계주공8단지", "articles": {}}
  }
}
```

첫 실행에서는 prev가 비어있으므로 **모든 매물이 "신규"로 잡혀 알림이 폭주**할 수 있음. 
이를 방지하기 위해 아래 로직 적용:

```python
# 첫 실행 감지: last_updated가 null이면 초기화 모드
if prev.get("last_updated") is None:
    # 알림은 "🎬 중계 호가 봇 최초 스캔 완료: {총 매물 수}건" 1개만
    # 개별 신규 알림은 보내지 않음
    # 스냅샷만 저장
```

### 3. .github/workflows/jungge_monitor.yml

```yaml
name: 중계 호가 모니터

on:
  schedule:
    - cron: '0 12 * * *'   # UTC 12:00 = KST 21:00 (오후 9시)
  workflow_dispatch:

jobs:
  monitor:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # 스냅샷 커밋용

    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: Python 설정
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: 패키지 설치
        run: pip install requests

      - name: 중계 호가 스캔 실행
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: python jungge_price_monitor.py

      - name: 스냅샷 커밋
        if: success()
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add jungge_snapshot.json
          git diff --staged --quiet || git commit -m "chore: 중계 호가 스냅샷 업데이트 $(date +%Y-%m-%d)"
          git push
```

## 커밋 전략

총 3개 파일을 **하나의 커밋**으로:

```bash
git add jungge_price_monitor.py jungge_snapshot.json .github/workflows/jungge_monitor.yml
git commit -m "feat: 중계 4단지 호가 일일 모니터 추가

- jungge_price_monitor.py: m.land API로 중계주공 5·6·7·8단지 매물 스캔
- jungge_snapshot.json: 이전 스냅샷 저장 (신규/인하/인상/소멸 감지용)
- .github/workflows/jungge_monitor.yml: 매일 KST 21:00 배치

감지 이벤트별 텔레그램 알림 (변동 있을 때만):
  🆕 신규 / 📉 인하 / 📈 인상 / ❌ 소멸
Hans 매수조건(6억 이하, 49~84㎡, 매매) 부합 시 ⭐ 배지
배치 실패 시 ⚠️ 오류 알림"
git push
```

## 테스트 방법 (커밋 후)

Claude Code가 아래 명령어로 수동 실행 테스트:

```bash
# 환경변수 세팅 (.env가 있으면 source, 없으면 manual export)
python jungge_price_monitor.py
```

로컬 실행 시 GitHub Actions secrets가 없으므로, Hans가 나중에 
GitHub Actions 페이지에서 "Run workflow" 수동 실행으로 초기 테스트 진행 예정.

## 주의사항

- **naver_parser.py는 절대 수정 금지**. import해서 쓰거나 코드 구조만 참고.
- m.land API의 실제 응답 필드명은 **첫 실행 시 print로 확인**하고 매핑. 
  추측 금지. naver_parser.py의 prcInfo 등 기존 매핑을 최대한 재활용.
- 스냅샷 첫 실행 시 대량 알림 방지 로직(last_updated null 체크) 반드시 적용.
- 텔레그램 알림 각 메시지 사이 0.5초 sleep.
- GitHub Actions의 GITHUB_TOKEN은 기본으로 contents:write 권한을 줘야 
  jungge_snapshot.json 커밋이 푸시됨. workflow에 permissions 명시 필요.

## 멈춤 조건 (반드시 지킬 것)

아래 경우 작업 중단하고 Hans에게 보고:

- naver_parser.py의 기존 API 호출 패턴을 재활용 불가능한 상황
- m.land API 응답 구조가 기존 패턴과 완전히 달라서 필드 매핑 애매
- GitHub Actions workflow의 permissions 설정이 레포 설정상 막혀있는 경우
- 스냅샷 파일 커밋 푸시 과정에 충돌 발생
- 예상 외 파일이 변경됨

그 외에는 중간 확인 없이 진행.

## 최종 보고 내용

1. 커밋 해시 (짧은 형식)
2. 푸시 결과
3. 생성된 파일 3개의 라인 수
4. m.land API 응답에서 실제로 사용한 필드명 매핑표
5. naver_parser.py에서 재활용한 함수명 (없으면 "독립 구현"으로 표기)
6. 로컬 테스트 실행 결과 (성공 시 감지된 매물 수, 실패 시 에러 내용)
7. 다르게 처리한 부분이 있으면 이유
