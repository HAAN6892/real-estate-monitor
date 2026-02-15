# 🏠 수도권 부동산 매수 모니터링

신혼 실거주 매수를 위한 수도권 아파트 실거래가 모니터링 + 대출 시뮬레이션 대시보드

## 📌 주요 기능

**자동 모니터링 (GitHub Actions)**
- 국토교통부 실거래가 API로 매일 2회(08:00, 20:00 KST) 데이터 수집
- 카카오 로컬 API로 아파트 좌표 → 최근접 지하철역 도보시간 계산
- 공공 주택정보 API로 단지 세대수 조회
- 신규 거래 감지 시 텔레그램 알림

**웹 대시보드 (GitHub Pages)**
- 실거래 매물 테이블 (검색/필터/정렬)
- 대출 한도 실시간 시뮬레이션 (LTV·DSR·월상환 3중 계산)
- 정책대출 자격 자동 체크 (디딤돌, 보금자리론, 신혼부부 등)
- 부동산 사이트 바로가기 (네이버 부동산, 호갱노노, 아실, KB부동산)
- 모바일 반응형 지원

## 🗂️ 파일 구조

```
├── .github/workflows/
│   └── monitor.yml          # GitHub Actions 워크플로우
├── index.html               # 대시보드 (GitHub Pages)
├── main.py                  # 매물 모니터링 스크립트
├── policy_monitor.py        # 정책 모니터링 스크립트
├── settings.json            # 대시보드 기본 설정값
├── data.json                # 매물 데이터 (자동 생성)
├── config.json              # API 키/설정 (Actions에서 자동 생성)
├── coord_cache.json         # 좌표 캐시 (자동 생성)
├── apt_info_cache.json      # 단지정보 캐시 (자동 생성)
└── sent_history.json        # 알림 발송 이력 (자동 생성)
```

## 🔍 모니터링 대상 지역

서울 강남구·서초구·송파구·강동구, 경기 과천시·안양시·성남시·하남시·용인 수지구·기흥구·광주시

## 📊 필터 조건

- 면적: 59~84㎡ (약 18~25평)
- 매매가: 6억 이하
- 세대수: 200세대 이상
- 층수: 1층 이상

## ⚙️ 설정

`settings.json`에서 대시보드 기본값 관리:
- 가구 소득, 자기자금, 인테리어 예산
- 금리, 대출기간, 월 상환 한도
- LTV/DSR 비율

대시보드에서 슬라이더로 임시 시뮬레이션 가능 (저장되지 않음)

## 🔑 필요한 Secrets (GitHub Actions)

| Secret | 설명 |
|--------|------|
| `API_KEY` | 공공데이터포털 API 키 |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 텔레그램 채팅 ID |
| `KAKAO_KEY` | 카카오 로컬 API 키 |

## 🔗 대시보드

https://haan6892.github.io/real-estate-monitor/
