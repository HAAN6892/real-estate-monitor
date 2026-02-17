# Claude Code 작업 프롬프트 — 정책 변경 감지 배치

## 배경
현재 부동산 대시보드의 정책 정보(LTV/DSR 규제, 정책대출 소득기준/금리/한도 등)는 코드에 하드코딩되어 있음.
정책이 바뀌면 수동으로 코드를 수정해야 하는데, 변경 사실 자체를 모를 수 있음.
→ 공식 소스를 주 1회 크롤링해서 변경이 감지되면 텔레그램으로 알림을 보내는 배치를 구현.

**전체 워크플로우:**
```
[자동] 주 1회(월요일) 크롤링 → 변경 감지 → 텔레그램 알림 (원문 링크 포함)
[수동] Hans가 원문 확인 → claude.ai 또는 Claude Code로 대시보드 코드 수정
```

이 배치는 **감지 + 알림**만 담당. 대시보드 반영은 수동.

## 구현할 파일 3개

### 1. `policy_monitor.py` (신규)

#### 크롤링 대상 — 공식 소스만 (팩트 기반)

| 소스 | URL | 수집 대상 |
|------|-----|-----------|
| 주택도시기금 공지사항 | https://nhuf.molit.go.kr/FP/FP07/FP0701/FP070101.do | 기금대출 상품 변경 공지 |
| 금융위원회 보도자료 | https://www.fsc.go.kr/no010101 | DSR/LTV 규제 변경 |
| 국토교통부 보도자료 | https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp | 부동산 대책, 규제지역 변경 |

#### 키워드 필터
제목에 아래 키워드가 포함된 공지만 수집 (관련 없는 공지 제외):
```python
KEYWORDS = [
    'LTV', 'DSR', '대출', '담보', '버팀목', '디딤돌', '보금자리',
    '신생아', '신혼', '전세', '규제지역', '투기과열', '조정대상',
    '주택담보', '주택구입', '금리', '소득기준', '한도',
    '부동산 대책', '가계부채'
]
```

#### 핵심 로직
```python
def main():
    # 1. policy_cache.json 로드 (이전 크롤링 결과)
    # 2. 각 소스 크롤링 → 최신 공지 10~20건의 제목+날짜+URL 추출
    # 3. 키워드 필터링 (제목에 KEYWORDS 중 하나라도 포함된 것만)
    # 4. 이전 캐시와 비교 → 새로운 항목만 추출
    # 5. 새 항목이 있으면 텔레그램 발송
    # 6. 현재 결과를 policy_cache.json에 저장
    
    # 첫 실행(캐시 비어있음)이면 현재 공지를 캐시에 저장만 하고 알림은 안 보냄
```

#### 텔레그램 알림 포맷
```
📋 부동산 정책 변경 감지

🔔 주택도시기금
• 2026년 1분기 기금대출 금리 변경 안내 (2026.03.15)
  → https://nhuf.molit.go.kr/...

🔔 국토교통부
• 수도권 규제지역 조정 방안 발표 (2026.03.14)
  → https://www.molit.go.kr/...

⚠️ 확인 후 대시보드 반영 필요 시 Claude Code로 수정
```

변경 감지 없으면 알림 안 보냄 (기존 매물 배치와 동일 패턴).

#### 에러 처리
- 크롤링 실패(사이트 점검 등): 해당 소스만 스킵, 나머지 계속 진행
- 전체 실패: 에러 알림 텔레그램 발송
- requests timeout: 30초
- 파싱 실패: 해당 소스 스킵 + 로그 출력

#### 크롤링 구현 참고
- BeautifulSoup으로 HTML 파싱
- 각 사이트 HTML 구조가 다르므로 소스별 파싱 함수 분리
- **사이트 구조가 바뀔 수 있으므로** 파싱 실패 시 에러만 로그하고 계속 진행
- 실제 구현 시 각 사이트 접속해서 HTML 구조 확인 필요 (requests + BeautifulSoup)
- User-Agent 헤더 설정 필수 (봇 차단 방지)

### 2. `.github/workflows/policy-monitor.yml` (신규)

```yaml
name: 정책 모니터링

on:
  schedule:
    - cron: '0 0 * * 1'       # 월요일 09:00 KST (UTC 월요일 0시)
  workflow_dispatch:            # 수동 실행 가능

jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - name: 코드 체크아웃
        uses: actions/checkout@v4

      - name: Python 설정
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: 패키지 설치
        run: pip install requests beautifulsoup4

      - name: config.json 생성
        env:
          MY_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          MY_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: |
          python3 << 'EOF'
          import json, os
          config = {
              "telegram": {
                  "bot_token": os.environ["MY_BOT_TOKEN"],
                  "chat_id": os.environ["MY_CHAT_ID"]
              }
          }
          with open("config.json", "w", encoding="utf-8") as f:
              json.dump(config, f, ensure_ascii=False, indent=2)
          EOF

      - name: 정책 모니터링 실행
        run: python policy_monitor.py

      - name: 캐시 업데이트 커밋
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add policy_cache.json
          git diff --staged --quiet || git commit -m "chore: update policy cache"
          git push
```

### 3. `policy_cache.json` (신규 — 초기 빈 파일)

첫 실행 시 현재 공지들을 수집하여 저장만 함 (첫 실행은 알림 안 보냄).

```json
{
  "last_checked": null,
  "sources": {}
}
```

## 기존 파일 수정 없음
- main.py 수정 없음
- monitor.yml 수정 없음  
- index.html 수정 없음
- 완전히 독립된 배치로 동작

## 테스트
1. 구현 후 `workflow_dispatch`로 수동 실행
2. policy_cache.json에 데이터 쌓이는지 확인
3. 캐시 있는 상태에서 한 번 더 실행 → 새 공지 없으면 알림 안 보내는지 확인
4. 캐시에서 항목 하나 삭제 후 재실행 → 텔레그램 알림 오는지 확인

## 커밋 메시지
"feat: 정책 변경 감지 배치 추가 (주 1회 크롤링 → 텔레그램 알림)"
