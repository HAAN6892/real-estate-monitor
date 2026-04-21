# 정책대출 판정 로직 업데이트 + 커밋/푸시

## 배경

Task 1 완료 상태 (커밋 전):
- settings.json: income1 4740 → 3833
- .github/workflows/monitor.yml: max_price 70000 → 60000
- index.html: "매매가 7억 이하" → "매매가 6억 이하 (정책대출 기준)"

이번 작업에서 app.js 정책대출 로직에 "신혼 우대 자동 적용"을 추가하고,
Task 1+2 변경사항을 커밋 2개로 나눠서 푸시.

## 문제 상황

부부합산 소득 7,833만원 기준:
- 디딤돌 일반(6천만): 초과
- 보금자리론 일반(7천만): 초과
- 신혼부부 구입(8,500만): 충족

실제로는 혼인 7년 이내면 디딤돌·보금자리론 모두 "신혼 우대"로 8,500만 이하까지 적용 가능.
settings.json의 married: true를 감지해서 자동 우대 적용 로직 추가 필요.

## 작업 1: app.js 수정

### 1-A. 디딤돌·보금자리론 loan 객체에 필드 추가

디딤돌 대출:
- incomeLimitNewlywed: 8500 필드를 신규 추가
- desc 문자열을 '부부합산 6,000만 이하'에서 '부부합산 6,000만 이하 (신혼 8,500만)'으로 변경
- 다른 필드(icon, maxLoan, rate, conditions, houseReq, note 등)는 모두 그대로 유지

보금자리론:
- incomeLimitNewlywed: 8500 필드를 신규 추가
- desc 문자열을 '부부합산 7,000만 이하'에서 '부부합산 7,000만 이하 (신혼 8,500만)'으로 변경
- 다른 필드는 모두 그대로 유지

### 1-B. eil 소득 기준 결정 로직 수정

현재 app.js는 다음과 같이 한 줄로 eil을 계산하고 있음:

```javascript
const eil = loan.incomeLimitDual || loan.incomeLimit;
```

이 한 줄을 아래 로직으로 교체:

```javascript
// 소득 기준 결정: 신생아 맞벌이 > 신혼 우대 > 일반
let eil;
if (loan.incomeLimitDual) {
  eil = loan.incomeLimitDual;
} else if (isMarried && loan.incomeLimitNewlywed) {
  eil = loan.incomeLimitNewlywed;
} else {
  eil = loan.incomeLimit;
}

// 신혼 우대로 통과한 케이스 감지 (UI 배지용)
const usingNewlywedRate = isMarried
  && loan.incomeLimitNewlywed
  && !loan.incomeLimitDual
  && effectiveIncome > loan.incomeLimit;
```

우선순위: 신생아 맞벌이 기준 > 신혼 우대 > 일반 기준.
usingNewlywedRate는 "신혼 우대 덕분에 통과한 케이스"를 감지하기 위한 플래그.

### 1-C. UI 렌더링에서 신혼 우대 배지 추가

자격 충족 케이스(✅)에서 usingNewlywedRate가 true이면
결과 표시에 "💑 신혼 우대" 배지 또는 텍스트를 추가.

구체 구현은 현재 app.js의 렌더링 패턴에 맞춰 자연스럽게 처리.
기존 스타일/CSS 클래스를 재활용하고 새 CSS는 만들지 말 것.

### 1-D. 절대 건드리지 말 것

- 전세 대출 목록 (marriedOnly: true로 이미 정상 작동)
- 신생아 특례의 incomeLimitDual: 20000
- 소득 계산 로직 (ti, mi, effectiveIncome)
- 주택수 판정 로직 (hOk)
- 혼인 필요 조건 (needsMarriage)
- REGULATION_MAP, DISTRICT_GROUPS
- Task 1에서 이미 수정한 파일 (settings.json, monitor.yml, index.html)

## 작업 2: git 확인, 커밋 2개, 푸시

### 2-A. 변경 파일 확인

`git status`로 변경 파일 확인.

예상 파일 4개:
- settings.json
- .github/workflows/monitor.yml
- index.html
- app.js

예상 외 파일이 변경되어 있으면 커밋 중단하고 상황 보고.

### 2-B. 커밋 1 — 설정 및 필터 업데이트

```bash
git add settings.json .github/workflows/monitor.yml index.html
git commit -m "설정 업데이트: 연봉 3833만원 반영, 매매 필터 6억(정책대출 기준)

- settings.json: income1 4740 → 3833 (2025년 세전 연봉)
- monitor.yml: max_price 7억 → 6억 (디딤돌·보금자리론 신혼 상한)
- index.html: 조건 칩 '매매가 6억 이하 (정책대출 기준)'"
```

### 2-C. 커밋 2 — 정책대출 신혼 우대

```bash
git add app.js
git commit -m "정책대출 판정: 혼인신고 시 신혼 우대 기준 자동 적용

- 디딤돌·보금자리론 loan 객체에 incomeLimitNewlywed: 8500 추가
- isMarried + incomeLimitNewlywed 있으면 우대 기준으로 판정
- 신혼 우대 통과 시 '💑 신혼 우대' 배지 표시
- 부부합산 7833만원 → 신혼 우대로 두 상품 모두 자격 충족"
```

### 2-D. 푸시

```bash
git push
```

## 작업 3: 최종 보고

- 커밋 해시 2개 (짧은 형식)
- 푸시 결과 (성공/실패)
- 변경 파일 4개와 각 파일 주요 변경 요약
- 스킵했거나 다르게 처리한 부분 있으면 이유 명시

## 멈춤 조건

아래 경우에만 작업 중단하고 상황 보고:
- app.js 구조가 위 명시된 패턴과 크게 달라서 수정 불가
- git 충돌이나 push 에러
- 예상 외 파일이 변경되어 커밋 분리 어려울 때

그 외에는 확인 없이 끝까지 진행.
