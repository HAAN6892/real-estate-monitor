# Claude Code 작업 프롬프트 — 지오코딩 정확도 + 모바일 카드 UX 개선

> ⚠️ Claude Code 실행 시 확인 프롬프트 생략:
> ```
> claude --dangerously-skip-permissions
> ```

## 작업 1: 지오코딩 정확도 개선 (동명이인 단지 문제)

### 문제
카카오 지오코딩에 `dong + name` (예: "동신2단지")만 보내서, 다른 지역의 동명 단지 좌표가 잡히는 경우가 있음.
실제 사례: "동신2단지"가 수원 장안구 매물인데 성남 서현역 근처 좌표로 표시됨.

### 원인
index.html의 `geocodeUnmatchedProps()` 함수에서 검색어가 `p.dong + ' ' + p.name` 형태임.
dong(법정동)이 다른 지역과 겹칠 수 있고, 단지명도 전국적으로 중복이 흔함.

### 해결 — 검색어에 지역명(region) 추가

```javascript
// AS-IS (약 line 570 근처 geocodeUnmatchedProps 내부)
const query = p.dong + ' ' + p.name;

// TO-BE
const query = p.region + ' ' + p.dong + ' ' + p.name;
// 예: "수원 장안구 동신2단지" → 정확한 좌표 반환
```

### 추가 — coord_cache.json 매칭도 동일하게 개선

현재 coord_cache 매칭이 `dong + name` suffix 기준인데, 이것도 region을 포함해서 매칭해야 함.

```javascript
// AS-IS (loadData 내 coord_cache 매칭, 약 line 480 근처)
const suffix = p.dong + ' ' + p.name;
for (const [k, v] of ccEntries) {
  if (k.endsWith(suffix)) { p.lat = v.lat; p.lon = v.lon; break; }
}

// TO-BE — region도 포함해서 매칭 (더 정확)
const suffix = p.dong + ' ' + p.name;
const fullKey = p.region + ' ' + p.dong + ' ' + p.name;
for (const [k, v] of ccEntries) {
  // 정확한 매칭 우선, 없으면 suffix 매칭 fallback
  if (k === fullKey || k.endsWith(fullKey)) { p.lat = v.lat; p.lon = v.lon; break; }
}
if (!p.lat) {
  for (const [k, v] of ccEntries) {
    if (k.endsWith(suffix)) { p.lat = v.lat; p.lon = v.lon; break; }
  }
}
```

### main.py 지오코딩도 확인
main.py에서 카카오 지오코딩 API 호출할 때도 동일하게 `sgg_name + dong + apt_name` 형태로 검색어를 보내고 있는지 확인.
만약 dong + apt_name만 보내고 있다면 sgg_name을 앞에 추가.

### 기존 coord_cache.json 오염 데이터 처리
이미 잘못 저장된 좌표가 있을 수 있음. 
- coord_cache.json에서 key에 region이 포함되지 않은 항목은 다음 배치 실행 시 재지오코딩되도록 처리
- 또는 coord_cache.json을 비우고 다음 배치에서 전부 재생성 (가장 깔끔)

### 검증
수정 후 대시보드에서 "동신2단지" 검색 → 핀이 수원 장안구에 찍히는지 확인.

---

## 작업 2: 모바일 카드 UX 개선

### 문제
모바일에서 지도 핀 클릭 시 하단 팝업(mobile-map-popup)이:
1. 정보가 너무 생략됨 (단지명, 가격, 지역 정도만)
2. 카드 영역이 너무 작아서 매물 비교가 어려움
3. 면적, 층수, 역세권, 연식 등 핵심 정보가 빠져있음

### 현재 코드 (showMobileMapPopup 함수, 약 line 610 근처)

```javascript
function showMobileMapPopup(p){
  // ... 현재는 pc-compact 스타일로 2줄만 표시
  // 1줄: 판정배지 + 단지명 + 지역
  // 2줄: 가격 + meta(면적, 역세권)
  // 3줄: N, H 링크 아이콘
}
```

### 개선 — 정보량 확대 + 카드 높이 증가

showMobileMapPopup 함수를 수정하여 더 많은 정보 표시:

```javascript
function showMobileMapPopup(p){
  const popup=document.getElementById('mobileMapPopup'),content=document.getElementById('mobileMapPopupContent');
  
  // 판정 배지 색상
  const bc = currentMode==='buy'
    ? (p.verdict==='매수가능'?'ok':p.verdict==='빠듯함'?'warn':'danger')
    : (p.verdict==='가능'?'ok':p.verdict==='빠듯함'?'warn':'danger');
  
  // 가격 표시
  const priceLabel = currentMode==='buy' ? '매매 ' : '전세 ';
  const priceVal = currentMode==='buy' ? p.price : p.deposit;
  
  // 메타 정보 (면적, 역세권, 연식, 세대수)
  const meta = [];
  if(p.area_py) meta.push(p.area_py + '평');
  if(p.area) meta.push('(' + p.area + ')');
  
  const station = [];
  if(p.station_name) station.push(p.station_name);
  if(p.walk_min) station.push('도보 ' + p.walk_min + '분');
  
  const extra = [];
  if(p.built_year) extra.push(p.built_year + '년');
  if(p.households) extra.push(p.households + '세대');
  
  // 대출/자기자금 정보 (매수 모드)
  let financeInfo = '';
  if(currentMode === 'buy' && p.pLoan !== undefined) {
    financeInfo = '대출 ' + fmtShort(p.pLoan) + ' · 자기 ' + fmtShort(p.pEquityNeeded) + ' · 월 ' + p.pMonthly + '만';
  } else if(currentMode !== 'buy') {
    // 전세 모드 — 대출/이자 계산
    const rr = getVal('rentRate');
    const budget = parseFloat(document.getElementById('rentBudget')?.textContent) || 0;
    const equity = getVal('cash');
    const needEq = Math.max(0, p.deposit - (equity + getVal('rentLoanLimit')));
    const loanAmt = p.deposit - needEq;
    const mi = Math.round(loanAmt * rr / 100 / 12);
    financeInfo = '대출 ' + fmtShort(loanAmt) + ' · 이자 ' + mi + '만/월';
  }
  
  content.innerHTML = `
    <div class="pc-compact" style="padding:4px 0">
      <div class="pc-line">
        <span class="pc-badge-sm ${bc}">${p.verdict}</span>
        <span class="pc-cname">${p.name}</span>
        <span class="pc-cregion">${p.region}</span>
      </div>
      <div class="pc-line" style="margin-top:4px">
        <span class="pc-cprice">${priceLabel}${fmtShort(priceVal)}</span>
        <span class="pc-cdetails">${meta.join(' ')}</span>
      </div>
      <div class="pc-line" style="margin-top:2px">
        <span class="pc-cmeta">${station.length ? '🚇 ' + station.join(' ') : ''} ${extra.length ? ' · ' + extra.join(' · ') : ''}</span>
      </div>
      ${financeInfo ? '<div class="pc-line" style="margin-top:2px"><span class="pc-cmeta" style="color:var(--text-mid)">' + financeInfo + '</span></div>' : ''}
      <div class="pc-links" style="margin-top:8px">${makeLinks(p)}</div>
    </div>
  `;
  popup.classList.add('show');
  setTimeout(()=>{document.addEventListener('click',dismissMobilePopup,{once:true});},100);
}
```

### CSS 수정 — 모바일 팝업 높이/스타일 개선

```css
/* 기존 mobile-map-popup 스타일 수정 */
.mobile-map-popup {
  /* 기존 padding:12px 16px → 더 넉넉하게 */
  padding: 16px 20px;
  /* 최대 높이 제한 (화면의 35%까지) */
  max-height: 35vh;
  overflow-y: auto;
}

/* 팝업 내 핸들 바 추가 (드래그 힌트) */
.mobile-map-popup::before {
  content: '';
  display: block;
  width: 40px;
  height: 4px;
  background: var(--border-hover);
  border-radius: 2px;
  margin: 0 auto 12px;
}
```

### 추가 개선 — 지도 영역 비율 조정

현재 모바일 지도 높이: `calc(100vh - 220px)`
카드가 올라오면 지도가 가려지므로, 지도 높이를 약간 줄여서 팝업 공간 확보:

```css
@media(max-width:768px) {
  .split-map {
    /* AS-IS: height: calc(100vh - 220px) */
    /* TO-BE: 팝업 공간 고려하여 조정 */
    height: calc(100vh - 180px);
  }
}
```

---

## 작업 순서

1. index.html의 `geocodeUnmatchedProps()` 검색어 수정 (region 추가)
2. index.html의 coord_cache 매칭 로직 수정 (region 포함 매칭)
3. main.py의 카카오 지오코딩 호출 확인 및 수정 (sgg_name 추가)
4. index.html의 `showMobileMapPopup()` 정보 확대
5. index.html CSS의 `.mobile-map-popup` 스타일 개선
6. 기존 기능 깨지지 않는지 확인

## 주의사항
- 기존 PC/태블릿 레이아웃 절대 깨지면 안 됨
- 모바일 팝업 외의 카드(리스트 탭)는 변경 없음
- coord_cache.json은 다음 배치 실행 시 자동으로 재생성됨

## 커밋 메시지
2개로 분리 커밋:
1. "fix: 지오코딩 검색어에 지역명 추가 (동명이인 단지 좌표 오류 수정)"
2. "improve: 모바일 지도 팝업 정보량 확대 및 UX 개선"
