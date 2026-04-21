# Claude Code 작업 프롬프트 — 대시보드 3가지 수정

## 프로젝트 위치
레포: HAAN6892/real-estate-monitor
배포: https://haan6892.github.io/real-estate-monitor/
파일 구조: index.html + style.css + app.js (Phase 4에서 분리 완료)

---

## 작업 1: 시세추이 탭 모바일 가독성 개선

### 문제
📈 시세 추이 탭의 대장아파트 차트(Chart.js)가 모바일에서 가독성이 떨어짐:
- **범례(legend)가 `position: 'right'`** → 모바일에서 차트 영역이 좁아지고 범례 텍스트가 잘림
- 범례 fontSize 11, boxWidth 14 → 한글 아파트명(포레나노원, 사가정센트럴아이파크 등)이 길어서 overflow
- 카드 내부 폰트(.fc-price 20px, .fc-name 13px) 모바일에서 축소 없음
- 구 필터 칩(.fg-chip)도 모바일에서 비좁음

### 현재 코드 위치

**app.js — `renderFlagshipChart` 함수 (약 88533 위치)**
Chart.js 인스턴스 생성: `new Chart(canvas, {...})` (약 90489 위치)
캔버스 ID: `flagshipChart`

현재 chart options:
```js
options:{
  responsive:true,
  maintainAspectRatio:true,
  plugins:{
    legend:{
      display:true,
      position:'right',
      align:'start',
      labels:{
        color:'#a0a0b8',
        font:{size:11,family:"'Noto Sans KR',sans-serif"},
        boxWidth:14,
        padding:10,
        usePointStyle:true,
        pointStyle:'line',
      },
    },
    // ...tooltip 등
  },
  scales:{
    x:{ticks:{font:{size:11}}},
    y:{ticks:{font:{size:11}}},
  }
}
```

**style.css — 마지막 섹션 (38585 위치~끝)**
현재 모바일 미디어쿼리:
```css
@media(max-width:1024px){
  .flagship-cards{grid-template-columns:repeat(2,1fr)}
  .flagship-chart-wrap{height:360px}
  .flagship-chart-wrap canvas{max-height:320px}
}
@media(max-width:768px){
  .flagship-cards{grid-template-columns:1fr}
  .flagship-gu-bar{flex-wrap:nowrap;overflow-x:auto;padding-bottom:8px}
  .flagship-chart-wrap{height:320px;padding:12px 8px}
  .flagship-chart-wrap canvas{max-height:280px}
}
```

### 수정사항

**A) app.js — Chart.js 옵션을 반응형으로 변경**

`renderFlagshipChart` 함수 내에서 차트 생성 전에 모바일 감지:
```js
const isMobile = window.innerWidth < 768;
```

chart options의 legend를 다음으로 변경:
```js
legend:{
  display:true,
  position: isMobile ? 'top' : 'right',
  align: isMobile ? 'center' : 'start',
  labels:{
    color:'#a0a0b8',
    font:{size: isMobile ? 10 : 11, family:"'Noto Sans KR',sans-serif"},
    boxWidth: isMobile ? 10 : 14,
    padding: isMobile ? 6 : 10,
    usePointStyle:true,
    pointStyle:'line',
  },
},
```

scales tick font도:
```js
x:{ticks:{font:{size: isMobile ? 9 : 11}}},
y:{ticks:{font:{size: isMobile ? 9 : 11}}},
```

**B) style.css — 768px 미디어쿼리에 추가**

기존 `@media(max-width:768px)` 블록에 다음 추가:
```css
.fc-price{font-size:16px}
.fc-name{font-size:11px}
.fc-meta{font-size:10px}
.fc-diff{font-size:10px}
.fc-area{font-size:9px}
.fc-link{font-size:10px;padding:2px 6px}
.fc-links{gap:4px}
.fg-chip{font-size:10px;padding:3px 7px}
.flagship-chart-wrap{height:260px;padding:10px 6px}
.flagship-chart-wrap canvas{max-height:220px}
.flagship-cards{gap:8px}
```

---

## 작업 2: 시뮬레이션 설정 localStorage 저장

### 문제
설정 패널(⚙️ 설정 버튼 → settingsOverlay 모달)에서 값을 변경해도 새로고침하면 settings.json 기본값으로 리셋됨.
현재 `loadSettings()` 함수는 있지만 `saveSettings()`는 없음.

### 현재 구조
- settings.json: `{income1:4740, income2:4000, cash:15000, interior:5000, rate:4, term:30, monthlyLimit:200, mgmt:35, ltv:70, dsr:40, houseCount:1}`
- `loadSettings()` 함수: app.js 24668 위치, fetch('settings.json')으로 로드
- 설정 input IDs: `income1`, `income2`, `cash`, `cashVal`, `income1Val`, `income2Val` 등
- localStorage 현재 키: `bookmarks`, `isWhitelist`, `__not_first_visit__`

### 수정사항

**A) `saveSettings()` 함수 추가**
```js
function saveSettings() {
  const userSettings = {
    income1: +document.getElementById('income1').value,
    income2: +document.getElementById('income2').value,
    cash: +document.getElementById('cash').value,
    interior: +document.getElementById('interior')?.value || 5000,
    rate: +document.getElementById('rate')?.value || 4,
    term: +document.getElementById('term')?.value || 30,
    monthlyLimit: +document.getElementById('monthlyLimit')?.value || 200,
    mgmt: +document.getElementById('mgmt')?.value || 35,
    houseCount: +document.getElementById('houseCount')?.value || 1,
  };
  localStorage.setItem('userSettings', JSON.stringify(userSettings));
}
```

**B) `loadSettings()` 수정**
기존 fetch('settings.json') 전에 localStorage 체크:
```js
// loadSettings 함수 시작 부분에 추가
const saved = localStorage.getItem('userSettings');
if (saved) {
  try {
    const userSettings = JSON.parse(saved);
    // userSettings로 input값 세팅 후 update() 호출
    // settings.json fetch는 스킵
    return;
  } catch(e) { /* 파싱 실패 시 settings.json 폴백 */ }
}
// 기존 fetch('settings.json') 로직 유지
```

**C) input 변경 시 자동 저장**
설정 input들에 이벤트 리스너 추가. `update()` 호출되는 곳 근처에 `saveSettings()` 호출 추가.
혹은 `update()` 함수 끝에 `saveSettings()` 호출.

**D) "기본값 복원" 버튼**
설정 모달(settingsOverlay) 하단에 버튼 추가:
```html
<button onclick="resetSettings()" style="...">🔄 기본값 복원</button>
```
```js
function resetSettings() {
  localStorage.removeItem('userSettings');
  // settings.json 다시 fetch 후 적용
  fetch('settings.json').then(r=>r.json()).then(data => {
    // 기존 loadSettings 로직으로 input 값 세팅
    update();
  });
}
```

---

## 작업 3: 정책 변동 섹션 최신화

### 문제
정책 탭(tab-policy)의 "📜 최근 정책 변동" 타임라인이 2025.10.15가 마지막.
그 이후 중요한 변동이 있었으나 반영되지 않음.

### 현재 위치
- **index.html** 내 `<div id="tab-policy">` → `<div id="policyTimeline">` 안에 하드코딩된 타임라인 아이템들
- `.tl-item`, `.tl-dot`, `.tl-date` 등 클래스 사용

### 추가할 정책 변동 (기존 타임라인 맨 위에 삽입)

**1) 2026.02.26 — 기준금리 2.50% 동결 (5회 연속)**
```
날짜: 2026.02.26
제목: 기준금리 2.50% 동결 (5회 연속)
내용: 한국은행 추가 인하 문구 삭제 → 동결 장기화 시사. 2024년 10월 이후 100bp 인하 후 2025년 5월부터 동결 유지.
영향도: 중간 (medium)
우리 상황 영향: 대출금리 추가 인하 기대 어려움. 현재 시뮬레이션 금리(4%) 유지 적절. 하반기 인하 가능성은 남아있으나 불확실.
```

**2) 2026.01 — 주담대 위험가중치 하한 조기 시행**
```
날짜: 2026.01
제목: 은행권 주담대 위험가중치 15%→20% 조기 시행
내용: 당초 2026년 4월 예정이었으나 1월로 앞당겨 시행. 은행의 자본비용 증가 → 대출 문턱 상승.
영향도: 중간 (medium)
우리 상황 영향: 은행별 주담대 한도 소폭 축소 가능. 직접적 LTV/DSR 변경은 아니지만 실질 대출 승인율에 영향.
```

**3) 2026.01~03 — 스트레스 DSR 3단계 본격 효과**
```
날짜: 2026.03
제목: 스트레스 DSR 3단계 효과 본격화
내용: 수도권 규제지역 스트레스 금리 3.0% 적용 중. 2026년 1분기 30대 신규 주담대 전분기比 약 11% 감소. 같은 소득에서 대출한도 약 2~3천만원 축소.
영향도: 높음 (high)
우리 상황 영향: DSR 40% 기준 대출한도가 실질적으로 줄어듦. 시뮬레이션에서 스트레스 DSR 반영 필요 (향후 개선 사항).
```

기존 `.tl-item` HTML 패턴을 참고하여 동일한 구조로 추가. 날짜가 최신인 것이 맨 위에 오도록 배치.

---

## 커밋 전략

3개 작업을 개별 커밋으로:
1. `fix: 시세추이 탭 모바일 가독성 개선 (차트 범례 위치, 카드 폰트)`
2. `feat: 시뮬레이션 설정 localStorage 저장 + 기본값 복원`
3. `content: 정책 변동 타임라인 2026.01~03 최신화`

## 주의사항
- app.js는 94,532자(1,182줄)로 큰 파일 — 변경 최소화
- style.css 기존 미디어쿼리 블록에 추가하는 방식으로 (새 블록 X)
- index.html의 정책 타임라인은 기존 패턴(`.tl-item` 구조) 그대로 따를 것
- settings.json 자체는 수정하지 않음 (기본값 역할 유지)
- `married` 필드는 settings.json에 없지만 현재 true로 동작 중 — localStorage에도 포함 불필요 (별도 토글로 관리)
