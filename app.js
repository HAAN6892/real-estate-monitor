// ─── 지역별 규제등급 매핑 (2025.10.15 대책 기준) ───
const REGULATION_MAP={
  // 서울 투기과열지구 (LTV 40%) — 서울 전역은 fallback 처리
  '서울 강남구':{zone:'투기과열',ltv:40},'서울 서초구':{zone:'투기과열',ltv:40},'서울 송파구':{zone:'투기과열',ltv:40},
  '서울 강동구':{zone:'투기과열',ltv:40},'서울 관악구':{zone:'투기과열',ltv:40},'서울 금천구':{zone:'투기과열',ltv:40},
  '서울 노원구':{zone:'투기과열',ltv:40},'서울 도봉구':{zone:'투기과열',ltv:40},
  '서울 강북구':{zone:'투기과열',ltv:40},'서울 중랑구':{zone:'투기과열',ltv:40},
  '서울 광진구':{zone:'투기과열',ltv:40},'서울 동대문구':{zone:'투기과열',ltv:40},'서울 양천구':{zone:'투기과열',ltv:40},
};
function getRegulation(region){
  if(!region)return{zone:'비규제',ltv:70};
  if(REGULATION_MAP[region])return REGULATION_MAP[region];
  if(region.startsWith('서울'))return{zone:'투기과열',ltv:40};
  return{zone:'비규제',ltv:70};
}

// ─── 구별 색상 (지역 배지 · 지도 핀) ───
const DISTRICT_COLORS={
  '서울 노원구':'#3B82F6','서울 도봉구':'#8B5CF6','서울 강북구':'#EC4899',
  '서울 중랑구':'#F59E0B','서울 광진구':'#10B981','서울 동대문구':'#6366F1',
  '서울 양천구':'#0EA5E9','서울 관악구':'#F97316','서울 금천구':'#A855F7',
  '서울 강동구':'#EF4444',
  '서울 강남구':'#6B7280','서울 서초구':'#6B7280','서울 송파구':'#6B7280',
};
const DISTRICT_GROUPS={
  '동북권':['서울 노원구','서울 도봉구','서울 강북구','서울 중랑구','서울 광진구','서울 동대문구'],
  '남서권':['서울 양천구','서울 관악구','서울 금천구'],
};
function getDistrictColor(region){return DISTRICT_COLORS[region]||'#9CA3AF';}
function districtBadge(region){
  const color=getDistrictColor(region);
  const short=(region||'').replace(/^서울 /,'').replace(/^경기 /,'');
  return '<span class="dc-badge" style="background:'+color+'">'+short+'</span>';
}

let currentMode='buy',isMarried=true,PROPERTIES=[],RENT_PROPERTIES=[],DATA_LOADED=false,RENT_DATA_LOADED=false,DATA_UPDATED_AT='',RENT_UPDATED_AT='',currentSort='value',rentSort='value',searchQuery='',regionFilterVal='',verdictFilterVal='',rentTypeFilterVal='',rentVerdictFilterVal='',districtFilterVal='',areaUnit='py',pageSize=20,currentPage=1,rentPage=1,currentView='card';
let markerMap={},filteredBuyProps=[],filteredRentProps=[],hlTimer=null,COMMUTE_DATA={};
// ─── 북마크 ───
let BOOKMARKS=new Set(JSON.parse(localStorage.getItem('bookmarks')||'[]'));
function saveBookmarks(){localStorage.setItem('bookmarks',JSON.stringify([...BOOKMARKS]));}
function toggleBookmark(pid,e){if(e)e.stopPropagation();if(BOOKMARKS.has(pid))BOOKMARKS.delete(pid);else BOOKMARKS.add(pid);saveBookmarks();update();updateBookmarkCount();}
function isBookmarked(pid){return BOOKMARKS.has(pid);}
function bmBtn(p){const pid=getPropId(p);const on=isBookmarked(pid);return '<button class="bm-btn'+(on?' on':'')+'" onclick="toggleBookmark(\''+pid.replace(/'/g,"\\'")+'\',event)" title="북마크">'+(on?'★':'☆')+'</button>';}
function updateBookmarkCount(){const c=BOOKMARKS.size;const b1=document.getElementById('buyBmCount'),b2=document.getElementById('rentBmCount');if(b1)b1.textContent=c>0?c+'건':'';if(b2)b2.textContent=c>0?c+'건':'';}

function setMarriage(married){
  isMarried=married;
  document.querySelectorAll('.marriage-btn').forEach(b=>b.classList.toggle('active', (b.dataset.married==='1')===married));
  updateMarriageBar();
  if(currentMode==='rent'){if(married){document.getElementById('rentLoanType').value='bank';onRentTypeChange();}}
  update();
}
function updateMarriageBar(){
  const i1=getVal('income1'),i2=getVal('income2'),ti=i1+i2,mi=Math.min(i1,i2);
  const info=document.getElementById('marriageInfo'),badge=document.getElementById('marriageIncomeBadge');
  if(isMarried){info.innerHTML='부부합산 소득 적용 → 정책대출 대부분 <strong>소득 초과</strong>';badge.textContent='합산 '+fmtShort(ti);badge.className='marriage-income-badge married';}
  else{info.innerHTML='단독 소득 적용 가능 → 배우자('+fmtShort(mi)+') 기준 정책대출 <strong>자격 가능</strong>';badge.textContent='단독 '+fmtShort(mi);badge.className='marriage-income-badge single';}
}
function applyTheme(mode){
  const themes={buy:{accent:'#2563eb',accentLight:'#eff6ff',bg:'#f0f4ff',border:'#dbe4f0',stripe:'#2563eb'},rent:{accent:'#059669',accentLight:'#ecfdf5',bg:'#f0faf6',border:'#d1e7dd',stripe:'#059669'}};
  const t=themes[mode],r=document.documentElement.style;
  r.setProperty('--mode-accent',t.accent);r.setProperty('--mode-accent-light',t.accentLight);r.setProperty('--mode-bg',t.bg);r.setProperty('--mode-border',t.border);r.setProperty('--mode-header-stripe',t.stripe);
}
function switchMode(mode){
  _focusedPropId=null;currentMode=mode;
  applyTheme(mode);
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  document.body.classList.toggle('mode-rent',mode==='rent');
  document.getElementById('logoText').textContent=mode==='buy'?'🏠 우리 집 사기':'🔑 우리 집 구하기';
  const tabBtnProp=document.getElementById('tabBtnProperties');
  if(mode==='rent'){
    if(RENT_DATA_LOADED&&RENT_PROPERTIES.length>0){tabBtnProp.style.display='';tabBtnProp.textContent='📊 전세 실거래';switchTab('properties');}
    else{tabBtnProp.style.display='none';switchTab('policy');}
  }else{tabBtnProp.style.display='';tabBtnProp.textContent='📊 매물 시뮬레이션';}
  update();
  if(kakaoMap)setTimeout(()=>kakaoMap.relayout(),100);
}
function toggleSettings(){document.getElementById('settingsOverlay').classList.toggle('open')}
function closeSettingsOutside(e){if(e.target===document.getElementById('settingsOverlay'))toggleSettings()}
function onRentTypeChange(){
  const type=document.getElementById('rentLoanType').value,ref=document.getElementById('rentTypeRef');
  if(type==='policy'){
    ref.innerHTML='<div class="policy-ref-title">정책대출 기준 (버팀목 등)</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--green)"></span> 금리: 1.5~3.5%</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--blue)"></span> 한도: 수도권 최대 2.5억 (보증금 80%)</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--text-mid)"></span> DSR 미적용</div>'+(isMarried?'<div class="policy-ref-row" style="color:var(--red)"><span class="ref-dot" style="background:var(--red)"></span> ⚠️ 합산 소득 초과로 대부분 탈락</div>':'<div class="policy-ref-row" style="color:var(--green)"><span class="ref-dot" style="background:var(--green)"></span> ✅ 단독 소득 기준 자격 가능</div>');
    setRV('rentRate',2.5);setRV('rentLoanRatio',80);setRV('rentLoanLimit',20000);
  }else{
    ref.innerHTML='<div class="policy-ref-title">시중은행 전세대출 기준</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--yellow)"></span> 금리: 3.3~4.5%</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--blue)"></span> 한도: 보증한도 내 (HUG/HF/SGI)</div><div class="policy-ref-row"><span class="ref-dot" style="background:var(--text-mid)"></span> DSR 미적용, 소득 제한 없음</div>';
    setRV('rentRate',3.8);setRV('rentLoanRatio',80);setRV('rentLoanLimit',30000);
  }
  update();
}
function setRV(id,v){const s=document.getElementById(id),i=document.getElementById(id+'Val');if(s)s.value=v;if(i)i.value=v;}
function toggleAreaUnit(){areaUnit=areaUnit==='py'?'m2':'py';document.getElementById('areaUnitLabel').textContent=areaUnit==='py'?'평':'㎡';update();}
function fmtArea(p){return areaUnit==='py'?(p.area_py?p.area_py+'평':p.area):p.area;}
function toggleHistory(btn){let h=btn.closest('.prop-card,tr')?.querySelector('.trade-history');if(!h)h=btn.nextElementSibling;if(!h||!h.classList.contains('trade-history'))return;h.classList.toggle('open');btn.textContent=h.classList.contains('open')?'▼ 거래내역 접기':'▶ 거래내역 '+h.querySelectorAll('.trade-row').length+'건';}
function switchTab(tabId){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  document.getElementById('tab-'+tabId).classList.add('active');
  if(tabId==='properties'){
    document.getElementById('tabBtnProperties').classList.add('active');
    // 관심 매물 탭에서 돌아올 때 기존 마커 복원
    if(_wishlistTabActive){_wishlistTabActive=false;if(mapInitialized)updateMapMarkers();}
    initMapIfNeeded();if(kakaoMap)setTimeout(()=>kakaoMap.relayout(),50);
  }else if(tabId==='wishlist'){
    document.getElementById('tabBtnWishlist').classList.add('active');
    _wishlistTabActive=true;
    initWishlistMapIfNeeded();
    renderWishlistCards();
    renderWishlistMap();
  }else if(tabId==='flagship'){
    document.getElementById('tabBtnFlagship').classList.add('active');
    if(_wishlistTabActive){_wishlistTabActive=false;if(mapInitialized)updateMapMarkers();}
    if(!FLAGSHIP_HISTORY){loadFlagshipData().then(()=>renderFlagshipTab());}
    else{renderFlagshipTab();}
  }else{
    document.getElementById('tabBtnPolicy').classList.add('active');
    if(_wishlistTabActive){_wishlistTabActive=false;if(mapInitialized)updateMapMarkers();}
  }
}
function changePageSize(v){pageSize=parseInt(v);currentPage=1;update();}
function changeRentPageSize(v){pageSize=parseInt(v);rentPage=1;update();}
function getVal(id){const i=document.getElementById(id+'Val');if(i&&i.value!=='')return parseFloat(i.value);const e=document.getElementById(id);return e?parseFloat(e.value):0;}
function fmtShort(n){if(n>=10000){const u=Math.floor(n/10000),m=n%10000;return m===0?u+'억':u+'억 '+m.toLocaleString()+'만';}return n.toLocaleString()+'만';}
function monthlyPayment(p,r,y){if(p<=0)return 0;const mr=r/100/12,n=y*12;if(mr===0)return p/n;return p*mr*Math.pow(1+mr,n)/(Math.pow(1+mr,n)-1);}
function maxLoanFromMonthly(m,r,y){const mr=r/100/12,n=y*12;if(mr===0)return m*n;return m*(Math.pow(1+mr,n)-1)/(mr*Math.pow(1+mr,n));}
function makeLinks(p){const q=encodeURIComponent((p.dong||'')+' '+p.name);return '<a href="https://m.land.naver.com/search/result/'+q+'" target="_blank" class="link-icon" title="네이버 부동산">N</a>';}
function fmtCommute(min){if(min==null)return'<span style="color:var(--text-dim)">—</span>';const c=min<=60?'var(--green)':min<=90?'var(--yellow)':'var(--text-dim)';return'<span style="color:'+c+'">'+min+'분</span>';}
function commuteHtml(p){return'<span class="pc-commute">🚇'+fmtCommute(p.commuteSubway)+' 🚌'+fmtCommute(p.commuteTransit)+'</span>';}
function jeonseRateBadge(p){if(p.jeonseRate==null)return'';if(p.jeonseRate>=70)return'<span class="tag tag-jr tag-jr-danger">전세가율 '+p.jeonseRate+'%</span>';if(p.jeonseRate<=50)return'<span class="tag tag-jr tag-jr-safe">전세가율 '+p.jeonseRate+'%</span>';return'<span class="tag tag-jr">전세가율 '+p.jeonseRate+'%</span>';}
function findBuyMatch(p){
  if(!DATA_LOADED||PROPERTIES.length===0)return null;
  const py=parseFloat(p.area_py)||0;
  // 1순위: 같은 이름+같은 면적
  let m=PROPERTIES.find(b=>b.name===p.name&&b.area_py===p.area_py);
  if(m)return m;
  // 2순위: 같은 이름+유사면적(±3평)
  m=PROPERTIES.find(b=>b.name===p.name&&Math.abs((parseFloat(b.area_py)||0)-py)<=3);
  return m||null;
}
function showBuyCompare(pid){
  const rp=RENT_PROPERTIES.find(p=>getPropId(p)===pid);if(!rp)return;
  const bp=findBuyMatch(rp);
  const eq=getVal('cash'),interior=getVal('interior'),eqBuy=Math.max(0,eq-interior);
  const rate=getVal('rate'),term=getVal('term');
  const rr=getVal('rentRate'),rlr=getVal('rentLoanRatio'),rll=getVal('rentLoanLimit');
  // 전세 계산
  const rf=rlr/100;const mbr=rf<1?eqBuy/(1-rf):eqBuy+rll;const aLR=Math.min(Math.floor(mbr*rf),rll);const rentBudget=eqBuy+aLR;
  const rentNeedEq=Math.max(0,rp.deposit-rentBudget+eqBuy);const rentLoan=rp.deposit-rentNeedEq;const rentMi=Math.round(rentLoan*rr/100/12);
  let html='<div class="compare-popup"><div class="compare-title">📊 전세 vs 매수 비교</div><div class="compare-name">'+rp.name+' · '+rp.area+' · '+rp.region+'</div>';
  html+='<div class="compare-section"><div class="compare-label">🔑 전세</div><div class="compare-row"><span>보증금</span><span class="mono">'+fmtShort(rp.deposit)+'</span></div><div class="compare-row"><span>대출</span><span class="mono">'+fmtShort(rentLoan)+'</span></div><div class="compare-row"><span>자기자금</span><span class="mono">'+fmtShort(rentNeedEq)+'</span></div><div class="compare-row highlight"><span>월 이자</span><span class="mono" style="color:var(--accent2)">'+rentMi+'만</span></div></div>';
  if(bp){
    const reg=getRegulation(bp.region);const bLtv=reg.ltv;const bLoan=Math.min(Math.floor(bp.price*bLtv/100),60000);const bEqN=bp.price-bLoan;const bMo=Math.floor(monthlyPayment(bLoan,rate,term));
    const diff=bMo-rentMi;const jr=Math.round(rp.deposit/bp.price*100);
    html+='<div class="compare-section"><div class="compare-label">🏠 매수</div><div class="compare-row"><span>매매가</span><span class="mono">'+fmtShort(bp.price)+'</span></div><div class="compare-row"><span>대출 (LTV '+bLtv+'%)</span><span class="mono">'+fmtShort(bLoan)+'</span></div><div class="compare-row"><span>자기자금</span><span class="mono">'+fmtShort(bEqN)+'</span></div><div class="compare-row highlight"><span>월 상환</span><span class="mono" style="color:var(--accent)">'+bMo+'만</span></div></div>';
    html+='<div class="compare-diff"><div class="compare-row"><span>전세가율</span><span class="mono">'+jr+'%</span></div><div class="compare-row highlight"><span>매수 시 월 추가 부담</span><span class="mono" style="color:'+(diff>0?'var(--red)':'var(--green)')+'">'+( diff>0?'+':'')+diff+'만</span></div><div class="compare-note">'+(diff<=30?'💡 월 '+Math.abs(diff)+'만 차이로 내 집 마련 가능':'⚠️ 월 상환 부담이 크게 증가')+'</div></div>';
  }else{
    html+='<div class="compare-section"><div class="compare-label">🏠 매수</div><div class="compare-empty">매매 시세 정보 없음</div></div>';
  }
  html+='<button class="compare-close" onclick="this.closest(\'.compare-overlay\').remove()">닫기</button></div>';
  const overlay=document.createElement('div');overlay.className='compare-overlay';overlay.innerHTML=html;
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
  document.body.appendChild(overlay);
}
function matchCommute(p){
  if(!COMMUTE_DATA.data)return null;const d=COMMUTE_DATA.data;
  const key=p.region+' '+p.dong;if(d[key])return d[key];
  const normR=s=>s.replace(/시(\s|$)/g,'$1').replace(/^경기\s+/,'').replace(/\s+/g,' ').trim();
  const nk=normR(key);for(const[k,v]of Object.entries(d)){if(normR(k)===nk)return v;}
  return null;
}
function setSort(btn){btn.closest('.filter-chip-group').querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentSort=btn.dataset.sort;currentPage=1;update();}
function setRentSort(btn){btn.closest('.filter-chip-group').querySelectorAll('.filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rentSort=btn.dataset.sort;rentPage=1;update();}
function setVerdictFilter(btn){document.querySelectorAll('#verdictChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');verdictFilterVal=btn.dataset.val;currentPage=1;update();}
function setRentTypeFilter(btn){_focusedPropId=null;document.querySelectorAll('#rentTypeChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rentTypeFilterVal=btn.dataset.val;rentPage=1;update();}
function setRentVerdictFilter(btn){_focusedPropId=null;document.querySelectorAll('#rentVerdictChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rentVerdictFilterVal=btn.dataset.val;rentPage=1;update();}
function setView(v){_focusedPropId=null;currentView=v;document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));update();}
function onBuyFilterChange(){_focusedPropId=null;currentPage=1;update();}
function onRentFilterChange(){_focusedPropId=null;rentPage=1;update();}
function setDistrictFilter(btn){
  document.querySelectorAll('#districtChips .dc-chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  districtFilterVal=btn.dataset.val;
  _focusedPropId=null;currentPage=1;update();
}
function highlightSelects(){
  document.querySelectorAll('.filter-bar .filter-select').forEach(s=>{s.classList.toggle('active',s.selectedIndex>0);});
  const buyActive=['regionFilter','areaFilter','buyVerdictSelect','buyBuiltYearFilter','buyCommuteFilter','buyHouseholdFilter'].some(id=>{const el=document.getElementById(id);return el&&el.selectedIndex>0;})||document.getElementById('searchInput').value!==''||districtFilterVal!=='';
  const rentActive=['rentRegionFilter','rentAreaFilter','rentVerdictSelect','rentTypeSelect','rentBuiltYearFilter','rentCommuteFilter','rentHouseholdFilter'].some(id=>{const el=document.getElementById(id);return el&&el.selectedIndex>0;})||document.getElementById('rentSearchInput').value!=='';
  const bb=document.getElementById('buyResetBtn'),rb=document.getElementById('rentResetBtn');
  if(bb)bb.style.display=buyActive?'':'none';
  if(rb)rb.style.display=rentActive?'':'none';
}
function resetBuyFilters(){
  ['regionFilter','areaFilter','buyVerdictSelect','buyBuiltYearFilter','buyCommuteFilter','buyHouseholdFilter','buySortSelect'].forEach(id=>{const el=document.getElementById(id);if(el)el.selectedIndex=0;});
  const bb=document.getElementById('buyBmOnly');if(bb)bb.checked=false;
  const bne=document.getElementById('buyExcludeNaholo');if(bne)bne.checked=true;
  districtFilterVal='';
  document.querySelectorAll('#districtChips .dc-chip').forEach((b,i)=>{b.classList.toggle('active',i===0);});
  document.getElementById('searchInput').value='';_focusedPropId=null;currentPage=1;update();
}
function resetRentFilters(){
  ['rentRegionFilter','rentAreaFilter','rentVerdictSelect','rentTypeSelect','rentBuiltYearFilter','rentCommuteFilter','rentHouseholdFilter','rentSortSelect'].forEach(id=>{const el=document.getElementById(id);if(el)el.selectedIndex=0;});
  const ac=document.getElementById('rentShowAnomaly');if(ac)ac.checked=false;
  const rne=document.getElementById('rentExcludeNaholo');if(rne)rne.checked=true;
  const rb=document.getElementById('rentBmOnly');if(rb)rb.checked=false;
  document.getElementById('rentSearchInput').value='';_focusedPropId=null;rentPage=1;update();
}
function areaMatch(py,val){if(!val)return true;const p=parseFloat(py)||0;if(val==='small')return p<=18;if(val==='mid')return p>18&&p<=25;if(val==='large')return p>25;return true;}
function builtYearMatch(by,val){if(!val)return true;if(!by)return false;const cy=new Date().getFullYear();if(val==='old')return cy-by>=20;return cy-by<=parseInt(val);}
function getPropId(p){return (p.name+'_'+(p.dong||'')+'_'+(p.area_py||'')).replace(/\s/g,'');}
function getMarkerKey(p){return p.name+'_'+p.region;}
function focusCard(mKey){
  const props=currentMode==='buy'?filteredBuyProps:filteredRentProps;
  const idx=props.findIndex(p=>getMarkerKey(p)===mKey);
  if(idx<0)return;
  const targetPage=Math.floor(idx/pageSize)+1,propId=getPropId(props[idx]);
  _focusedPropId=propId;
  if(mapIdleTimer)clearTimeout(mapIdleTimer);
  let need=false;
  if(currentMode==='buy'&&currentPage!==targetPage){currentPage=targetPage;need=true;}
  else if(currentMode!=='buy'&&rentPage!==targetPage){rentPage=targetPage;need=true;}
  if(need)update();
  else restoreFocus();
}
function restoreFocus(){
  if(!_focusedPropId)return;
  const el=document.querySelector('[data-prop-id="'+_focusedPropId+'"]');
  if(!el)return;
  _autoScrolling=true;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  highlightEl(el);
  setTimeout(()=>{_autoScrolling=false;},800);
}
function highlightEl(el){document.querySelectorAll('.highlight').forEach(e=>e.classList.remove('highlight'));if(hlTimer)clearTimeout(hlTimer);el.classList.add('highlight');hlTimer=setTimeout(()=>{if(el.classList)el.classList.remove('highlight');},2500);}
function bounceMarker(mKey){stopBounce();const m=markerMap[mKey];if(m&&m.a)m.a.style.animation='markerBounce 0.6s ease infinite';}
function stopBounce(){Object.values(markerMap).forEach(m=>{try{if(m.a)m.a.style.animation='';}catch(e){}});}
function renderBuyCards(items,eq,mr){
  const cg=document.getElementById('propertyCards');cg.innerHTML='';
  items.forEach(p=>{
    const bc=p.verdict==='매수가능'?'ok':p.verdict==='빠듯함'?'warn':'danger';
    const meta=[];
    if(p.station_name)meta.push((p.line?p.line+' ':'')+'도보 '+(p.walk_min||'?')+'분');
    if(p.built_year)meta.push(p.built_year+'년');
    if(p.area_py)meta.push(p.area_py+'평'+(p.area?'('+p.area+')':''));
    if(p.households>0)meta.push(p.households+'세대');else if(p.households===0&&isLikelyNaholo(p))meta.push('<span class="tag tag-danger" style="font-size:10px;padding:1px 4px">⚠️ 소단지 추정</span>');else if(p.households===0)meta.push('<span style="color:var(--text-dim)">세대수 미확인</span>');
    const mColor=p.pMonthly>mr?'var(--red)':p.pMonthly>mr*0.85?'var(--yellow)':'var(--green)';
    const details='대출 '+fmtShort(p.pLoan)+' · 자기 '+fmtShort(p.pEquityNeeded)+' · <span style="color:'+mColor+'">월 '+p.pMonthly+'만</span>';
    const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
    let hH='';if(p.trade_count>1){const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const df=t.price-p.trades[i+1].price;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'')+'</span><span class="trade-price">'+fmtShort(t.price)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span></div>'+rows+'</div>';}
    const card=document.createElement('div');card.className='prop-card pc-compact';card.dataset.propId=getPropId(p);
    card.addEventListener('mouseenter',()=>bounceMarker(getMarkerKey(p)));card.addEventListener('mouseleave',()=>stopBounce());
    const regBadge=p.regZone==='투기과열'?'<span class="tag tag-reg tag-reg-hot">투기과열 LTV'+p.pLTV+'%</span>':'<span class="tag tag-reg tag-reg-free">비규제 LTV'+p.pLTV+'%</span>';
    card.innerHTML='<div class="pc-line">'+bmBtn(p)+'<span class="pc-badge-sm '+bc+'">'+p.verdict+'</span>'+districtBadge(p.region)+'<span class="pc-cname">'+p.name+'</span><span class="pc-cregion">'+p.region+'</span>'+regBadge+'</div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">매매 '+fmtShort(p.price)+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'');
    cg.appendChild(card);
  });
}
function renderRentCards(items,equity,budget){
  const cg=document.getElementById('rentPropertyCards');cg.innerHTML='';
  items.forEach(p=>{
    const bc=p.verdict==='가능'?'ok':p.verdict==='빠듯함'?'warn':'danger';
    const typeIcon=p.rent_type==='월세'?'💳':'🔑';
    const meta=[];
    if(p.station_name)meta.push((p.line?p.line+' ':'')+'도보 '+(p.walk_min||'?')+'분');
    if(p.built_year)meta.push(p.built_year+'년');
    if(p.area_py)meta.push(p.area_py+'평'+(p.area?'('+p.area+')':''));
    if(p.households>0)meta.push(p.households+'세대');else if(p.households===0&&isLikelyNaholo(p))meta.push('<span class="tag tag-danger" style="font-size:10px;padding:1px 4px">⚠️ 소단지 추정</span>');else if(p.households===0)meta.push('<span style="color:var(--text-dim)">세대수 미확인</span>');
    const needEq=Math.max(0,p.deposit-budget+equity);const loanAmt=p.deposit-needEq;const rr=getVal('rentRate');const mi=Math.round(loanAmt*rr/100/12);
    const miColor=mi<=50?'var(--green)':mi<=80?'var(--yellow)':'var(--red)';
    const priceStr=p.rent_type==='월세'?'월세 '+fmtShort(p.deposit)+'/'+p.monthly_rent+'만':'전세 '+fmtShort(p.deposit);
    const details='대출 '+fmtShort(loanAmt)+' · 자기 '+fmtShort(needEq)+' · <span style="color:'+miColor+'">이자 '+mi+'만</span>';
    const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
    let hH='';if(p.trade_count>1){const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const df=t.deposit-p.trades[i+1].deposit;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'')+'</span><span class="trade-price">'+fmtShort(t.deposit)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span></div>'+rows+'</div>';}
    const card=document.createElement('div');card.className='prop-card pc-compact';card.dataset.propId=getPropId(p);
    card.addEventListener('mouseenter',()=>bounceMarker(getMarkerKey(p)));card.addEventListener('mouseleave',()=>stopBounce());
    const anomalyBadge=p.priceAnomaly?'<span class="tag tag-anomaly">⚠️ 이상가격</span>':'';
    const jrBadge=jeonseRateBadge(p);
    const cmpBtn=p.rent_type==='전세'?'<button class="expand-btn" onclick="showBuyCompare(\''+getPropId(p).replace(/'/g,"\\'")+'\')">📊 매수비교</button>':'';
    card.innerHTML='<div class="pc-line">'+bmBtn(p)+'<span class="pc-badge-sm '+bc+'">'+p.verdict+'</span>'+anomalyBadge+jrBadge+'<span class="pc-cname">'+typeIcon+' '+p.name+'</span><span class="pc-cregion">'+p.region+'</span></div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">'+priceStr+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+cmpBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'');
    cg.appendChild(card);
  });
}

function saveSettings(){
  const userSettings={
    income1:+document.getElementById('income1').value,
    income2:+document.getElementById('income2').value,
    cash:+document.getElementById('cash').value,
    interior:+(document.getElementById('interior')?.value||5000),
    rate:+(document.getElementById('rate')?.value||4),
    term:+(document.getElementById('term')?.value||30),
    monthlyLimit:+(document.getElementById('monthlyLimit')?.value||200),
    mgmt:+(document.getElementById('mgmt')?.value||35),
    houseCount:+(document.getElementById('houseCount')?.value||1),
  };
  localStorage.setItem('userSettings',JSON.stringify(userSettings));
}
function resetSettings(){
  localStorage.removeItem('userSettings');
  fetch('settings.json').then(r=>r.json()).then(s=>{
    ['income1','income2','cash','interior','rate','term','monthlyLimit','mgmt','ltv','dsr'].forEach(id=>{if(s[id]!==undefined){const sl=document.getElementById(id),ip=document.getElementById(id+'Val');if(sl)sl.value=s[id];if(ip)ip.value=s[id];}});
    if(s.houseCount!==undefined)document.getElementById('houseCount').value=s.houseCount;
    update();
  }).catch(()=>{update();});
}
async function loadSettings(){
  const saved=localStorage.getItem('userSettings');
  if(saved){
    try{
      const s=JSON.parse(saved);
      ['income1','income2','cash','interior','rate','term','monthlyLimit','mgmt','ltv','dsr'].forEach(id=>{if(s[id]!==undefined){const sl=document.getElementById(id),ip=document.getElementById(id+'Val');if(sl)sl.value=s[id];if(ip)ip.value=s[id];}});
      if(s.houseCount!==undefined)document.getElementById('houseCount').value=s.houseCount;
      return;
    }catch(e){/* 파싱 실패 시 settings.json 폴백 */}
  }
  try{const r=await fetch('settings.json');if(!r.ok)throw 0;const s=await r.json();
  ['income1','income2','cash','interior','rate','term','monthlyLimit','mgmt','ltv','dsr'].forEach(id=>{if(s[id]!==undefined){const sl=document.getElementById(id),ip=document.getElementById(id+'Val');if(sl)sl.value=s[id];if(ip)ip.value=s[id];}});
  if(s.houseCount!==undefined)document.getElementById('houseCount').value=s.houseCount;
  if(s.married!==undefined){isMarried=s.married;document.querySelectorAll('.marriage-btn').forEach(b=>b.classList.toggle('active',(b.dataset.married==='1')===isMarried));}
  }catch(e){console.warn('settings.json 없음, 기본값 사용');}
}
function groupProperties(raw){
  const g={};raw.forEach(i=>{const k=i.region+'_'+i.name+'_'+i.area_m2;if(!g[k])g[k]={name:i.name,region:i.region,area:Math.round(i.area_m2)+'㎡',area_py:i.area_py,regulated:i.regulated||false,station:i.walk_min?'도보 '+i.walk_min+'분':'역정보 없음',station_name:i.station||'',line:i.line||'',walk_min:i.walk_min,dong:i.dong||'',built_year:i.built_year||0,households:i.households||0,link:i.link||'',lat:i.lat||null,lon:i.lon||null,prices:[],floors:[],dates:[],trades:[]};g[k].prices.push(i.price);g[k].floors.push(i.floor);g[k].dates.push(i.trade_date);g[k].trades.push({price:i.price,floor:i.floor,date:i.trade_date});});
  return Object.values(g).map(v=>{const avg=Math.round(v.prices.reduce((a,b)=>a+b,0)/v.prices.length);const tr=v.trades.sort((a,b)=>(b.date||'').localeCompare(a.date||''));return{name:v.name,region:v.region,area:v.area,area_py:v.area_py,price:avg,regulated:v.regulated,station:v.station,station_name:v.station_name,line:v.line,walk_min:v.walk_min,dong:v.dong,built_year:v.built_year,households:v.households,link:v.link,lat:v.lat,lon:v.lon,trade_count:v.prices.length,min_price:Math.min(...v.prices),max_price:Math.max(...v.prices),latest_date:v.dates.sort().reverse()[0]||'',price_per_py:v.area_py>0?Math.round(avg/v.area_py):0,trades:tr};}).sort((a,b)=>a.price-b.price);
}
function flagRentAnomalies(){
  // 같은 지역 + 면적대(±5㎡) 전세 중위 보증금 대비 50% 미만 = 이상가격
  const groups={};
  RENT_PROPERTIES.forEach(p=>{
    if(p.rent_type!=='전세')return;
    const band=Math.round((parseFloat(p.area_py)||0)/5)*5;
    const key=p.region+'_'+band;
    if(!groups[key])groups[key]=[];
    groups[key].push(p.deposit);
  });
  const medians={};
  for(const [key,deps] of Object.entries(groups)){
    if(deps.length<3)continue;
    const s=[...deps].sort((a,b)=>a-b);
    const m=Math.floor(s.length/2);
    medians[key]=s.length%2!==0?s[m]:Math.round((s[m-1]+s[m])/2);
  }
  let cnt=0;
  RENT_PROPERTIES.forEach(p=>{
    const band=Math.round((parseFloat(p.area_py)||0)/5)*5;
    const key=p.region+'_'+band;
    const med=medians[key];
    p.priceAnomaly=!!(med&&p.deposit<med*0.5);
    if(p.priceAnomaly)cnt++;
  });
  if(cnt>0)console.log(`이상가격 감지: ${cnt}건 (중위 보증금 50% 미만)`);
}
function calcJeonseRate(){
  if(!DATA_LOADED||PROPERTIES.length===0){RENT_PROPERTIES.forEach(p=>{p.jeonseRate=null;});return;}
  // 매매 데이터를 name+area_py 기준으로 맵 구성 (같은 단지+면적 → 매매가)
  const buyMap={};
  PROPERTIES.forEach(p=>{const k=p.name+'_'+p.area_py;if(!buyMap[k])buyMap[k]=[];buyMap[k].push(p.price);});
  let matched=0;
  RENT_PROPERTIES.forEach(p=>{
    if(p.rent_type!=='전세'){p.jeonseRate=null;return;}
    // 1순위: 같은 단지명 + 같은 면적
    const k1=p.name+'_'+p.area_py;
    if(buyMap[k1]){const avg=Math.round(buyMap[k1].reduce((a,b)=>a+b,0)/buyMap[k1].length);p.jeonseRate=Math.round(p.deposit/avg*100);matched++;return;}
    // 2순위: 같은 단지명 + 유사 면적 (±3평)
    const py=parseFloat(p.area_py)||0;
    for(const[bk,prices]of Object.entries(buyMap)){
      if(!bk.startsWith(p.name+'_'))continue;
      const bpy=parseFloat(bk.split('_')[1])||0;
      if(Math.abs(bpy-py)<=3){const avg=Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);p.jeonseRate=Math.round(p.deposit/avg*100);matched++;return;}
    }
    p.jeonseRate=null;
  });
  console.log(`전세가율 매칭: ${matched}/${RENT_PROPERTIES.filter(p=>p.rent_type==='전세').length}건`);
}
function groupRentProperties(raw){
  const g={};raw.forEach(i=>{const k=i.region+'_'+i.name+'_'+i.area_m2+'_'+(i.rent_type||'전세');if(!g[k])g[k]={name:i.name,region:i.region,area:Math.round(i.area_m2)+'㎡',area_py:i.area_py,rent_type:i.rent_type||'전세',station:i.walk_min?'도보 '+i.walk_min+'분':'역정보 없음',station_name:i.station||'',line:i.line||'',walk_min:i.walk_min,dong:i.dong||'',built_year:i.built_year||0,households:i.households||0,lat:i.lat||null,lon:i.lon||null,deposits:[],monthlys:[],floors:[],dates:[],trades:[]};g[k].deposits.push(i.deposit||0);g[k].monthlys.push(i.monthly_rent||0);g[k].floors.push(i.floor);g[k].dates.push(i.trade_date);g[k].trades.push({deposit:i.deposit||0,monthly:i.monthly_rent||0,floor:i.floor,date:i.trade_date});});
  return Object.values(g).map(v=>{const avgD=Math.round(v.deposits.reduce((a,b)=>a+b,0)/v.deposits.length);const avgM=Math.round(v.monthlys.reduce((a,b)=>a+b,0)/v.monthlys.length);const tr=v.trades.sort((a,b)=>(b.date||'').localeCompare(a.date||''));return{name:v.name,region:v.region,area:v.area,area_py:v.area_py,rent_type:v.rent_type,deposit:avgD,monthly_rent:avgM,station:v.station,station_name:v.station_name,line:v.line,walk_min:v.walk_min,dong:v.dong,built_year:v.built_year,households:v.households,lat:v.lat,lon:v.lon,trade_count:v.deposits.length,min_deposit:Math.min(...v.deposits),max_deposit:Math.max(...v.deposits),latest_date:v.dates.sort().reverse()[0]||'',trades:tr};}).sort((a,b)=>a.deposit-b.deposit);
}
async function loadData(){
  let coordCache={};
  try{const cr=await fetch('coord_cache.json');if(cr.ok)coordCache=await cr.json();}catch(e){}
  try{const cr=await fetch('commute_time.json');if(cr.ok)COMMUTE_DATA=await cr.json();}catch(e){}
  try{const r=await fetch('data.json');if(!r.ok)throw 0;const d=await r.json();DATA_UPDATED_AT=d.updated_at||'';PROPERTIES=groupProperties(d.properties||[]);DATA_LOADED=true;
  const regions=[...new Set(PROPERTIES.map(p=>p.region))].sort();const sel=document.getElementById('regionFilter');regions.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;sel.appendChild(o);});
  }catch(e){PROPERTIES=[];DATA_LOADED=false;}
  try{const r=await fetch('data-rent.json');if(!r.ok)throw 0;const d=await r.json();RENT_UPDATED_AT=d.updated_at||'';RENT_PROPERTIES=groupRentProperties(d.properties||[]);RENT_DATA_LOADED=RENT_PROPERTIES.length>0;
  if(RENT_DATA_LOADED){flagRentAnomalies();calcJeonseRate();const rr=[...new Set(RENT_PROPERTIES.map(p=>p.region))].sort();const s1=document.getElementById('regionFilter'),s2=document.getElementById('rentRegionFilter');rr.forEach(r=>{if(![...s1.options].some(o=>o.value===r)){const o=document.createElement('option');o.value=r;o.textContent=r;s1.appendChild(o);}const o2=document.createElement('option');o2.value=r;o2.textContent=r;s2.appendChild(o2);});}
  }catch(e){RENT_PROPERTIES=[];RENT_DATA_LOADED=false;}
  // coord_cache 좌표 매핑 (캐시 키: "경기 수원시 장안구 동신2단지" 형태, 법정동 없음)
  if(Object.keys(coordCache).length>0){
    const ccEntries=Object.entries(coordCache);
    // 지역명 정규화: "수원시 장안구" → "수원 장안구" (시 제거로 축약형 매칭)
    const normR=s=>s.replace(/시(\s|$)/g,'$1').replace(/\s+/g,' ').trim();
    [PROPERTIES,RENT_PROPERTIES].forEach(props=>{
      props.forEach(p=>{
        if(p.lat&&p.lon)return;
        // 1순위: name으로 끝나고 정규화된 region 포함
        const nr=normR(p.region);
        for(const[k,v]of ccEntries){if(k.endsWith(p.name)&&normR(k).includes(nr)){p.lat=v.lat;p.lon=v.lon;break;}}
        // 2순위: dong+name suffix (기존 키 호환)
        if(!p.lat){const suffix=p.dong+' '+p.name;for(const[k,v]of ccEntries){if(k.endsWith(suffix)){p.lat=v.lat;p.lon=v.lon;break;}}}
      });
    });
  }
  // 출퇴근 소요시간 매핑
  [PROPERTIES,RENT_PROPERTIES].forEach(props=>{
    props.forEach(p=>{const c=matchCommute(p);p.commuteSubway=c?c.subway:null;p.commuteTransit=c?c.transit:null;});
  });
  updateBookmarkCount();
  update();
}
function update(){
  if(currentMode==='buy')updateBuy();else updateRent();
  updatePolicy();updatePolicyTimeline();updateStatus();updateMarriageBar();
  const sl=document.getElementById('splitLayout');
  if(sl){if(currentMode==='rent'&&(!RENT_DATA_LOADED||RENT_PROPERTIES.length===0))sl.style.display='none';else sl.style.display='';}
  if(mapInitialized)updateMapMarkers();
  saveSettings();
}
function updateStatus(){
  const s=document.getElementById('dataStatus');
  if(currentMode==='buy'){if(DATA_LOADED){s.textContent='📊 '+PROPERTIES.length+'개 단지 · 갱신: '+DATA_UPDATED_AT;s.style.color='var(--green)';}else{s.textContent='⚠️ 배치 실행 후 데이터 표시';s.style.color='var(--yellow)';}}
  else{if(RENT_DATA_LOADED){s.textContent='🔑 전세 '+RENT_PROPERTIES.length+'개 단지 · 갱신: '+RENT_UPDATED_AT;s.style.color='var(--green)';}else{s.textContent='🔑 전세 시뮬레이션 모드 · 실거래 데이터 대기 중';s.style.color='var(--accent2)';}}
}
function updateBuy(){
  const i1=getVal('income1'),i2=getVal('income2'),ti=i1+i2,cash=getVal('cash'),interior=getVal('interior'),eq=Math.max(0,cash-interior);
  const rate=getVal('rate'),term=getVal('term'),ml=getVal('monthlyLimit'),mg=getVal('mgmt'),lp=getVal('ltv'),dp=getVal('dsr'),hc=parseInt(document.getElementById('houseCount').value),mr=ml-mg;
  const autoLtv=document.getElementById('autoLtvCheckbox')?.checked!==false;
  const arm=ti*dp/100,mrd=arm/12,dsrL=Math.floor(maxLoanFromMonthly(mrd,rate,term)),mlL=Math.floor(maxLoanFromMonthly(mr,rate,term));
  // auto LTV: 비규제(70%) 기준으로 요약 표시, 개별 매물은 지역별 적용
  const summaryLtv=autoLtv?70:lp;
  let ltvL,eLTV=summaryLtv;if(hc>=2){eLTV=0;ltvL=0;}else if(summaryLtv>=100||summaryLtv<=0){ltvL=0;}else{ltvL=Math.floor(eq/(1-summaryLtv/100)*summaryLtv/100);}
  const fL=Math.min(dsrL,mlL,ltvL),fM=Math.floor(monthlyPayment(fL,rate,term)),mpp=fL+eq;
  document.getElementById('totalIncome').textContent=fmtShort(ti);document.getElementById('totalIncomeSub').textContent='본인 '+i1.toLocaleString()+' + 배우자 '+i2.toLocaleString();
  document.getElementById('equityLabel').textContent='투입 가능 자기자금';document.getElementById('equity').textContent=fmtShort(eq);document.getElementById('equitySub').textContent='총 '+cash.toLocaleString()+' - 인테리어 '+interior.toLocaleString();
  document.getElementById('mainPriceLabel').textContent='최대 매수 가능가';document.getElementById('maxPrice').textContent=fmtShort(mpp);document.getElementById('maxPrice').style.color=mpp>=30000?'var(--green)':mpp>=20000?'var(--yellow)':'var(--red)';
  document.getElementById('maxPriceSub').textContent='자기자금 '+fmtShort(eq)+' + 대출 '+fmtShort(fL)+(autoLtv?' (비규제 기준)':'');document.getElementById('maxPriceBar').style.width=Math.min(100,mpp/600*100)+'%';
  document.getElementById('monthlyLabel').textContent='월 상환 여력';document.getElementById('monthlyLeft').textContent=mr+'만';document.getElementById('monthlyLeft').style.color=mr>=150?'var(--green)':mr>=100?'var(--yellow)':'var(--red)';
  document.getElementById('monthlyLeftSub').textContent='한도 '+ml+'만 - 관리비 '+mg+'만';document.getElementById('monthlyBar').style.width=Math.min(100,mr/250*100)+'%';document.getElementById('monthlyBar').style.background='var(--green)';
  const ltvLabel=autoLtv?'지역별 자동 (40~70%)':'LTV '+eLTV+'%';
  document.getElementById('ltvMax').textContent=fmtShort(ltvL);document.getElementById('ltvDetail').innerHTML=ltvLabel+'<br><span>자기자금 '+fmtShort(eq)+' → 매매가 '+fmtShort(Math.floor(eq/(1-eLTV/100)))+'까지</span>';document.getElementById('ltvCard').className='loan-card '+(ltvL>=fL?'ok':'warn');
  document.getElementById('dsrMax').textContent=fmtShort(dsrL);document.getElementById('dsrDetail').innerHTML='DSR '+dp+'% · 연소득 '+fmtShort(ti)+'<br><span>월 '+Math.floor(mrd)+'만 상환 가능</span>';document.getElementById('dsrCard').className='loan-card '+(dsrL>=fL?'ok':'warn');
  document.getElementById('monthlyMax').textContent=fmtShort(mlL);document.getElementById('monthlyDetail').innerHTML='월 '+mr+'만 상환 가능<br><span>금리 '+rate+'% · '+term+'년</span>';document.getElementById('monthlyCard').className='loan-card '+(mlL>=fL?'ok':'warn');
  document.getElementById('finalLoan').textContent=fmtShort(fL);document.getElementById('finalDetail').innerHTML='월 '+fM+'만 · 매수가능 '+fmtShort(mpp)+'<br><span>LTV·DSR·월상환 중 최솟값</span>';
  let bn='LTV';if(fL===dsrL)bn='DSR';if(fL===mlL)bn='월상환';document.getElementById('loanBadge').textContent='병목: '+bn;
  updatePropTable(eq,fL,eLTV,rate,term,mr);
}
function isLikelyNaholo(item){if(item.households>0)return false;if(/\(\d+(-\d+)?\)/.test(item.name)&&!item.name.includes('단지'))return true;if(item.name.length<=3&&!item.name.includes('단지')&&!item.name.includes('주공'))return true;return false;}
function commuteMatch(p,cv){if(!cv)return true;if(cv==='transit60')return p.commuteTransit!=null&&p.commuteTransit<=60;if(cv==='subway60')return p.commuteSubway!=null&&p.commuteSubway<=60;if(cv==='transit45')return p.commuteTransit!=null&&p.commuteTransit<=45;return true;}
function updatePropTable(eq,fL,eLTV,rate,term,mr){
  const scrollEl=document.getElementById('splitList'),savedScroll=_preserveScroll&&scrollEl?scrollEl.scrollTop:0;
  const sq=document.getElementById('searchInput').value.toLowerCase(),rv=document.getElementById('regionFilter').value,av=(document.getElementById('areaFilter')||{}).value||'',vv=(document.getElementById('buyVerdictSelect')||{}).value||'',cv=(document.getElementById('buyCommuteFilter')||{}).value||'',byv=(document.getElementById('buyBuiltYearFilter')||{}).value||'',sv=(document.getElementById('buySortSelect')||{}).value||'value',hhv=parseInt((document.getElementById('buyHouseholdFilter')||{}).value||'0')||0;
  let f=PROPERTIES.filter(p=>{if(sq&&!(p.name+' '+p.region+' '+p.dong).toLowerCase().includes(sq))return false;if(rv&&p.region!==rv)return false;if(!areaMatch(p.area_py,av))return false;if(!builtYearMatch(p.built_year,byv))return false;if(!commuteMatch(p,cv))return false;if(hhv>0&&(p.households===0||p.households<hhv))return false;if(document.getElementById('buyExcludeNaholo')?.checked!==false&&isLikelyNaholo(p))return false;return true;});
  const autoLtv=document.getElementById('autoLtvCheckbox')?.checked!==false;
  const wv=f.map(p=>{const reg=getRegulation(p.region);const pL=autoLtv?reg.ltv:(p.regulated?Math.min(eLTV,50):eLTV);const pLn=Math.min(Math.floor(p.price*pL/100),fL),pEq=p.price-pLn,pM=Math.floor(monthlyPayment(pLn,rate,term));let v,vt;if(pEq>eq){v='자금부족';vt='tag-danger';}else if(pM>mr){v='상환초과';vt='tag-danger';}else if(pM>mr*0.85){v='빠듯함';vt='tag-warn';}else{v='매수가능';vt='tag-ok';}return{...p,pLTV:pL,pLoan:pLn,pEquityNeeded:pEq,pMonthly:pM,verdict:v,verdictTag:vt,regZone:reg.zone};});
  let filtered=vv?wv.filter(p=>p.verdict===vv):wv;
  if(districtFilterVal){if(DISTRICT_GROUPS[districtFilterVal]){filtered=filtered.filter(p=>DISTRICT_GROUPS[districtFilterVal].includes(p.region));}else{filtered=filtered.filter(p=>p.region===districtFilterVal);}}
  if(mapBoundsFilter&&mapBounds)filtered=filtered.filter(p=>inBounds(p));
  const bmOnly=document.getElementById('buyBmOnly')?.checked;if(bmOnly)filtered=filtered.filter(p=>isBookmarked(getPropId(p)));
  const vo={'매수가능':0,'빠듯함':1,'상환초과':2,'자금부족':2};
  if(sv==='value')filtered.sort((a,b)=>(vo[a.verdict]??9)-(vo[b.verdict]??9)||(parseFloat(b.area_py)||0)-(parseFloat(a.area_py)||0));
  else if(sv==='price-asc')filtered.sort((a,b)=>a.price-b.price);else if(sv==='price-desc')filtered.sort((a,b)=>b.price-a.price);
  else if(sv==='area-desc')filtered.sort((a,b)=>(parseFloat(b.area_py)||0)-(parseFloat(a.area_py)||0));
  else if(sv==='walk')filtered.sort((a,b)=>(a.walk_min||999)-(b.walk_min||999));
  else if(sv==='commute')filtered.sort((a,b)=>(a.commuteTransit||999)-(b.commuteTransit||999));
  else if(sv==='latest')filtered.sort((a,b)=>(b.latest_date||'').localeCompare(a.latest_date||''));
  filteredBuyProps=filtered;
  highlightSelects();
  const ti=filtered.length,tp=Math.max(1,Math.ceil(ti/pageSize));if(currentPage>tp)currentPage=tp;const si=(currentPage-1)*pageSize,pi=filtered.slice(si,si+pageSize);
  const cardEl=document.getElementById('propertyCards'),tableEl=document.getElementById('buyTableWrap');
  if(currentView==='card'){cardEl.style.display='';tableEl.style.display='none';renderBuyCards(pi,eq,mr);}
  else{cardEl.style.display='none';tableEl.style.display='';
  const tb=document.getElementById('propertyBody');tb.innerHTML='';
  pi.forEach(p=>{const ex=[];if(p.built_year)ex.push(p.built_year+'년');if(p.households>0)ex.push(p.households+'세대');else if(p.households===0&&isLikelyNaholo(p))ex.push('<span class="tag tag-danger" style="font-size:10px;padding:1px 4px">⚠️ 소단지 추정</span>');else if(p.households===0)ex.push('<span style="color:var(--text-dim)">세대수 미확인</span>');if(p.trade_count>1)ex.push(p.trade_count+'건');
    const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
    let hH='';if(p.trade_count>1){const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const df=t.price-p.trades[i+1].price;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'날짜없음')+'</span><span class="trade-price">'+fmtShort(t.price)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');const pd=p.max_price-p.min_price;hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span><span style="font-size:10px;color:var(--text-dim)">'+(pd>0?'변동폭: '+fmtShort(pd):'동일가')+'</span></div>'+rows+'</div>';}
    const stTxt=p.station_name?(p.station_name+(p.walk_min?' '+p.walk_min+'분':'')):'—';
    const tr=document.createElement('tr');tr.dataset.propId=getPropId(p);tr.addEventListener('mouseenter',()=>bounceMarker(getMarkerKey(p)));tr.addEventListener('mouseleave',()=>stopBounce());
    const tRegBadge=p.regZone==='투기과열'?'<span class="tag tag-reg tag-reg-hot">투기과열 '+p.pLTV+'%</span>':'<span class="tag tag-reg tag-reg-free">비규제 '+p.pLTV+'%</span>';
    tr.innerHTML='<td data-label="판정"><span class="tag '+p.verdictTag+'">'+p.verdict+'</span></td><td data-label="단지명"><strong>'+p.name+'</strong><br><span style="font-size:10px;color:var(--text-dim)">'+(p.line?p.line+' ':'')+p.station+(ex.length?' · '+ex.join(' · '):'')+'</span><br>'+tBtn+hH+'</td><td data-label="지역"><span class="tag tag-region">'+p.region+'</span> '+tRegBadge+'</td><td data-label="면적">'+fmtArea(p)+'</td><td data-label="매매가" class="mono">'+fmtShort(p.price)+'</td><td data-label="월상환" class="mono" style="color:'+(p.pMonthly>mr?'var(--red)':p.pMonthly>mr*0.85?'var(--yellow)':'var(--green)')+'">'+p.pMonthly+'만</td><td data-label="역세권">'+stTxt+'</td><td data-label="연식">'+(p.built_year||'—')+'</td><td data-label="세대">'+(p.households||'—')+'</td><td data-label="링크"><div class="link-icons">'+makeLinks(p)+'</div></td>';
    tb.appendChild(tr);
  });}
  document.getElementById('propertyBadge').textContent=DATA_LOADED?(mapBoundsFilter&&mapBounds?'지도 영역 내 '+ti+'건':ti+'/'+PROPERTIES.length+'개 표시'):'데이터 없음';
  document.getElementById('pageInfo').textContent=ti>0?(si+1)+'-'+Math.min(si+pageSize,ti)+' / '+ti+'건':'0건';
  const pb=document.getElementById('pageBtns');pb.innerHTML='';
  if(tp>1){const pv=document.createElement('button');pv.className='page-btn';pv.textContent='◀';pv.disabled=currentPage<=1;pv.onclick=()=>{currentPage--;update();};pb.appendChild(pv);for(let i=1;i<=tp;i++){if(tp>7&&i>2&&i<tp-1&&Math.abs(i-currentPage)>1){if(i===3||i===tp-2){const d=document.createElement('span');d.className='page-info';d.textContent='…';pb.appendChild(d);}continue;}const b=document.createElement('button');b.className='page-btn'+(i===currentPage?' active':'');b.textContent=i;b.onclick=()=>{currentPage=i;update();};pb.appendChild(b);}const nx=document.createElement('button');nx.className='page-btn';nx.textContent='▶';nx.disabled=currentPage>=tp;nx.onclick=()=>{currentPage++;update();};pb.appendChild(nx);}
  if(_preserveScroll&&scrollEl)scrollEl.scrollTop=savedScroll;
  if(_focusedPropId)setTimeout(restoreFocus,50);
}
function updateRent(){
  const i1=getVal('income1'),i2=getVal('income2'),ti=i1+i2,cash=getVal('cash'),eq=cash;
  const rr=getVal('rentRate'),rlr=getVal('rentLoanRatio'),rll=getVal('rentLoanLimit');
  const rf=rlr/100;let mbr=rf<1?eq/(1-rf):eq+rll;let lfr=Math.floor(mbr*rf);const aL=Math.min(lfr,rll),rb=eq+aL,mi=Math.round(aL*rr/100/12);
  document.getElementById('totalIncome').textContent=fmtShort(ti);document.getElementById('totalIncomeSub').textContent='본인 '+i1.toLocaleString()+' + 배우자 '+i2.toLocaleString();
  document.getElementById('equityLabel').textContent='자기자금 (전세보증금용)';document.getElementById('equity').textContent=fmtShort(eq);document.getElementById('equitySub').textContent='총 가용 자금 전액 투입';
  document.getElementById('mainPriceLabel').textContent='최대 전세 예산';document.getElementById('maxPrice').textContent=fmtShort(rb);document.getElementById('maxPrice').style.color=rb>=35000?'var(--green)':rb>=25000?'var(--yellow)':'var(--mode-accent)';
  document.getElementById('maxPriceSub').textContent='자기자금 '+fmtShort(eq)+' + 대출 '+fmtShort(aL);document.getElementById('maxPriceBar').style.width=Math.min(100,rb/500*100)+'%';
  document.getElementById('monthlyLabel').textContent='월 이자 부담';document.getElementById('monthlyLeft').textContent=mi+'만';document.getElementById('monthlyLeft').style.color=mi<=50?'var(--green)':mi<=80?'var(--yellow)':'var(--red)';
  document.getElementById('monthlyLeftSub').textContent='대출 '+fmtShort(aL)+' × '+rr+'%';document.getElementById('monthlyBar').style.width=Math.min(100,mi/150*100)+'%';document.getElementById('monthlyBar').style.background=mi<=50?'var(--green)':mi<=80?'var(--yellow)':'var(--red)';
  const tn=document.getElementById('rentLoanType').value==='policy'?'정책대출':'시중은행';
  document.getElementById('rentLimitMax').textContent=fmtShort(aL);document.getElementById('rentLimitDetail').innerHTML=tn+' · 보증금의 '+rlr+'%<br><span>상한: '+fmtShort(rll)+'</span>';document.getElementById('rentLimitCard').className='loan-card '+(aL>=rll?'warn':'ok');
  document.getElementById('rentInterest').textContent=mi+'만';document.getElementById('rentInterestDetail').innerHTML='연 '+rr+'% · 이자만 납부<br><span>DSR 미적용 (전세대출)</span>';document.getElementById('rentInterestCard').className='loan-card '+(mi<=50?'ok':mi<=80?'warn':'danger');
  document.getElementById('rentBudget').textContent=fmtShort(rb);document.getElementById('rentBudgetDetail').innerHTML='자기자금 '+fmtShort(eq)+' + 대출 '+fmtShort(aL)+'<br><span>이 금액 이하 전세 탐색</span>';document.getElementById('rentBudgetCard').className='loan-card ok';
  document.getElementById('rentLoanBadge').textContent=tn+' · '+rr+'%';
  updateRentTable(eq,rb);
}
function updateRentTable(equity,budget){
  const scrollEl=document.getElementById('splitList'),savedScroll=_preserveScroll&&scrollEl?scrollEl.scrollTop:0;
  const placeholder=document.getElementById('rentPlaceholder');
  const tableWrap=document.getElementById('rentTableWrap');
  if(!RENT_DATA_LOADED||RENT_PROPERTIES.length===0){if(placeholder)placeholder.style.display='';if(tableWrap)tableWrap.style.display='none';return;}
  if(placeholder)placeholder.style.display='none';if(tableWrap)tableWrap.style.display='';
  const tabBtnProp=document.getElementById('tabBtnProperties');tabBtnProp.style.display='';tabBtnProp.textContent='📊 전세 실거래';
  const sq=(document.getElementById('rentSearchInput')||{}).value||'';const rf=(document.getElementById('rentRegionFilter')||{}).value||'';
  const rav=(document.getElementById('rentAreaFilter')||{}).value||'',rvv=(document.getElementById('rentVerdictSelect')||{}).value||'',rtv=(document.getElementById('rentTypeSelect')||{}).value||'',rbyv=(document.getElementById('rentBuiltYearFilter')||{}).value||'',rcv=(document.getElementById('rentCommuteFilter')||{}).value||'',rsv=(document.getElementById('rentSortSelect')||{}).value||'value',rhhv=parseInt((document.getElementById('rentHouseholdFilter')||{}).value||'0')||0;
  const showAnomaly=document.getElementById('rentShowAnomaly')?.checked||false;
  let anomalyHidden=0;
  let f=RENT_PROPERTIES.filter(p=>{if(!showAnomaly&&p.priceAnomaly){anomalyHidden++;return false;}if(sq&&!(p.name+' '+p.region+' '+p.dong).toLowerCase().includes(sq.toLowerCase()))return false;if(rf&&p.region!==rf)return false;if(rtv&&p.rent_type!==rtv)return false;if(!areaMatch(p.area_py,rav))return false;if(!builtYearMatch(p.built_year,rbyv))return false;if(!commuteMatch(p,rcv))return false;if(rhhv>0&&(p.households===0||p.households<rhhv))return false;if(document.getElementById('rentExcludeNaholo')?.checked!==false&&isLikelyNaholo(p))return false;return true;});
  const wv=f.map(p=>{let v,vt;if(p.deposit>budget){v='예산초과';vt='tag-danger';}else if(p.deposit>budget*0.9){v='빠듯함';vt='tag-warn';}else{v='가능';vt='tag-ok';}return{...p,verdict:v,verdictTag:vt};});
  let filtered=rvv?wv.filter(p=>p.verdict===rvv):wv;
  if(mapBoundsFilter&&mapBounds)filtered=filtered.filter(p=>inBounds(p));
  const bmOnly=document.getElementById('rentBmOnly')?.checked;if(bmOnly)filtered=filtered.filter(p=>isBookmarked(getPropId(p)));
  const rvo={'가능':0,'빠듯함':1,'예산초과':2};
  if(rsv==='value')filtered.sort((a,b)=>(rvo[a.verdict]??9)-(rvo[b.verdict]??9)||(parseFloat(b.area_py)||0)-(parseFloat(a.area_py)||0));
  else if(rsv==='price-asc')filtered.sort((a,b)=>a.deposit-b.deposit);else if(rsv==='price-desc')filtered.sort((a,b)=>b.deposit-a.deposit);
  else if(rsv==='area-desc')filtered.sort((a,b)=>(parseFloat(b.area_py)||0)-(parseFloat(a.area_py)||0));
  else if(rsv==='walk')filtered.sort((a,b)=>(a.walk_min||999)-(b.walk_min||999));
  else if(rsv==='commute')filtered.sort((a,b)=>(a.commuteTransit||999)-(b.commuteTransit||999));
  else if(rsv==='latest')filtered.sort((a,b)=>(b.latest_date||'').localeCompare(a.latest_date||''));
  filteredRentProps=filtered;
  highlightSelects();
  const ti=filtered.length,tp=Math.max(1,Math.ceil(ti/pageSize));if(rentPage>tp)rentPage=tp;const si=(rentPage-1)*pageSize,pi=filtered.slice(si,si+pageSize);
  const cardEl=document.getElementById('rentPropertyCards'),tableEl=document.getElementById('rentTableWrapInner');
  if(currentView==='card'){cardEl.style.display='';tableEl.style.display='none';renderRentCards(pi,equity,budget);}
  else{cardEl.style.display='none';tableEl.style.display='';
  const tb=document.getElementById('rentPropertyBody');if(!tb)return;tb.innerHTML='';
  pi.forEach(p=>{const ex=[];if(p.built_year)ex.push(p.built_year+'년');if(p.households>0)ex.push(p.households+'세대');else if(p.households===0&&isLikelyNaholo(p))ex.push('<span class="tag tag-danger" style="font-size:10px;padding:1px 4px">⚠️ 소단지 추정</span>');else if(p.households===0)ex.push('<span style="color:var(--text-dim)">세대수 미확인</span>');if(p.trade_count>1)ex.push(p.trade_count+'건');
    const typeTag=p.rent_type==='월세'?'<span class="tag tag-warn" style="font-size:10px">월세</span>':'<span class="tag tag-ok" style="font-size:10px">전세</span>';
    const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
    let hH='';if(p.trade_count>1){const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const df=t.deposit-p.trades[i+1].deposit;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'날짜없음')+'</span><span class="trade-price">'+fmtShort(t.deposit)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');const pd=p.max_deposit-p.min_deposit;hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span><span style="font-size:10px;color:var(--text-dim)">'+(pd>0?'변동폭: '+fmtShort(pd):'동일가')+'</span></div>'+rows+'</div>';}
    const stTxt=p.station_name?(p.station_name+(p.walk_min?' '+p.walk_min+'분':'')):'—';
    const tr=document.createElement('tr');tr.dataset.propId=getPropId(p);tr.addEventListener('mouseenter',()=>bounceMarker(getMarkerKey(p)));tr.addEventListener('mouseleave',()=>stopBounce());
    const anomTag=p.priceAnomaly?' <span class="tag tag-anomaly" style="font-size:9px">⚠️ 이상</span>':'';
    const jrTag=jeonseRateBadge(p);
    tr.innerHTML='<td data-label="판정"><span class="tag '+p.verdictTag+'">'+p.verdict+'</span>'+anomTag+'</td><td data-label="단지명"><strong>'+p.name+'</strong>'+jrTag+'<br><span style="font-size:10px;color:var(--text-dim)">'+(p.line?p.line+' ':'')+p.station+(ex.length?' · '+ex.join(' · '):'')+'</span><br>'+tBtn+hH+'</td><td data-label="지역"><span class="tag tag-region">'+p.region+'</span></td><td data-label="면적">'+fmtArea(p)+'</td><td data-label="유형">'+typeTag+'</td><td data-label="보증금" class="mono">'+fmtShort(p.deposit)+'</td><td data-label="월세" class="mono">'+(p.monthly_rent>0?p.monthly_rent+'만':'—')+'</td><td data-label="역세권">'+stTxt+'</td><td data-label="연식">'+(p.built_year||'—')+'</td><td data-label="세대">'+(p.households||'—')+'</td><td data-label="링크"><div class="link-icons">'+makeLinks(p)+'</div></td>';
    tb.appendChild(tr);
  });}
  const totalAnomaly=RENT_PROPERTIES.filter(p=>p.priceAnomaly).length;
  const atl=document.getElementById('anomalyToggleLabel');if(atl)atl.style.display=totalAnomaly>0?'':'none';
  const anomalyLabel=anomalyHidden>0?' (이상가격 '+anomalyHidden+'건 숨김)':'';
  document.getElementById('rentPropertyBadge').textContent=(mapBoundsFilter&&mapBounds?'지도 영역 내 '+ti+'건':ti+'/'+RENT_PROPERTIES.length+'개 표시')+anomalyLabel;
  document.getElementById('rentPageInfo').textContent=ti>0?(si+1)+'-'+Math.min(si+pageSize,ti)+' / '+ti+'건':'0건';
  const pb=document.getElementById('rentPageBtns');pb.innerHTML='';
  if(tp>1){const pv=document.createElement('button');pv.className='page-btn';pv.textContent='◀';pv.disabled=rentPage<=1;pv.onclick=()=>{rentPage--;update();};pb.appendChild(pv);for(let i=1;i<=tp;i++){if(tp>7&&i>2&&i<tp-1&&Math.abs(i-rentPage)>1){if(i===3||i===tp-2){const d=document.createElement('span');d.className='page-info';d.textContent='…';pb.appendChild(d);}continue;}const b=document.createElement('button');b.className='page-btn'+(i===rentPage?' active':'');b.textContent=i;b.onclick=()=>{rentPage=i;update();};pb.appendChild(b);}const nx=document.createElement('button');nx.className='page-btn';nx.textContent='▶';nx.disabled=rentPage>=tp;nx.onclick=()=>{rentPage++;update();};pb.appendChild(nx);}
  if(_preserveScroll&&scrollEl)scrollEl.scrollTop=savedScroll;
  if(_focusedPropId)setTimeout(restoreFocus,50);
}
function updatePolicyTimeline(){
  const tl=document.getElementById('policyTimeline');
  const policies=[
    {date:'2026.03',level:'high',title:'스트레스 DSR 3단계 효과 본격화',impact:'수도권 규제지역 스트레스 금리 3.0% 적용 중',detail:'→ 2026년 1분기 30대 신규 주담대 전분기比 약 11% 감소. 같은 소득에서 대출한도 약 2~3천만원 축소.',myImpactType:'negative',myImpactBuy:'DSR 40% 기준 대출한도가 실질적으로 줄어듦. 시뮬레이션에서 스트레스 DSR 반영 필요 (향후 개선 사항)',myImpactRent:'전세대출 한도에도 간접 영향. 스트레스 금리 적용 시 실질 한도 축소 가능'},
    {date:'2026.02.26',level:'mid',title:'기준금리 2.50% 동결 (6회 연속)',impact:'한국은행 추가 인하 문구 삭제 → 동결 장기화 시사',detail:'→ 2024년 10월 이후 100bp 인하 후 2025년 5월부터 동결 유지.',myImpactType:'neutral',myImpactBuy:'대출금리 추가 인하 기대 어려움. 현재 시뮬레이션 금리(4%) 유지 적절. 하반기 인하 가능성은 남아있으나 불확실.',myImpactRent:'전세대출 금리 추가 하락 기대 어려움. 현 수준 유지 가능성 높음.'},
    {date:'2026.01',level:'mid',title:'신생아 특례 순자산 기준 상향 (4.88억→5.11억)',impact:'2026년 자산심사 기준 변경',detail:'→ 순자산가액 4.88억 → 5.11억으로 상향. 청약통장 우대금리 기준 강화, 중도상환수수료 인하.',myImpactType:'positive',myImpactBuy:'자산 기준 완화로 출산 시 자격 충족 가능성 높아짐.',myImpactRent:'자산 기준 완화로 출산 시 전세 특례 자격 충족 가능성 높아짐.'},
    {date:'2026.01',level:'mid',title:'은행권 주담대 위험가중치 15%→20% 조기 시행',impact:'당초 2026년 4월 예정이었으나 1월로 앞당겨 시행',detail:'→ 은행의 자본비용 증가 → 대출 문턱 상승.',myImpactType:'negative',myImpactBuy:'은행별 주담대 한도 소폭 축소 가능. 직접적 LTV/DSR 변경은 아니지만 실질 대출 승인율에 영향.',myImpactRent:'전세대출에는 직접 영향 없음.'},
    {date:'2025.12',level:'low',title:'지방 주담대 스트레스 DSR 유예 6개월 연장',impact:'지방(서울·경기·인천 제외) 주담대 스트레스 금리 3단계(1.5%) 적용을 2026.6.30까지 유예',detail:'→ 2단계(0.75%) 유지. 수도권 규제지역은 3.0% 그대로.',myImpactType:'info',myImpactBuy:'수도권 매수 타겟이므로 직접 영향 없음.',myImpactRent:'수도권 매수 타겟이므로 직접 영향 없음. 대구 매도에는 간접 긍정 (지방 매수 수요 유지).'},
    {date:'2025.10.15',level:'high',title:'10.15 주택시장 안정화 대책',impact:'서울 전역 + 경기 12곳 규제지역 지정',detail:'→ 성남·안양 LTV 40~50%, 용인 수지·경기 광주는 비규제 유지 (70%)',myImpactType:'negative',myImpactBuy:'성남·안양 매수 시 LTV 40~50% → 자기자금 비중 증가. 비규제(용인 수지·광주) 매수가 유리',myImpactRent:'전세대출에는 직접 영향 없음. 다만 규제지역 전세가 안정화 가능성'},
    {date:'2025.07',level:'mid',title:'신생아 특례 한도 축소 (5억→4억)',impact:'구입대출 한도 최대 5억 → 4억으로 축소. 수도권·규제지역 LTV 70%',detail:'→ 2025.6.28 이후 매매계약 체결분부터 적용. 생애최초도 LTV 80% 혜택 사라짐.',myImpactType:'negative',myImpactBuy:'출산 후 신생아 특례 활용해도 수도권 최대 4억 한도. 생애최초 LTV 80% 혜택 사라짐 (Hans는 어차피 해당 없음).',myImpactRent:'전세 특례 한도는 변동 없음.'},
    {date:'2025.07',level:'mid',title:'스트레스 DSR 3단계 시행',impact:'전 업권 모든 가계대출에 스트레스 금리 1.5% 적용',detail:'→ 수도권 규제지역은 10.15 대책으로 3.0% 적용 중. 지방 주담대는 0.75%로 유예 (→ 2026.6.30까지 연장).',myImpactType:'negative',myImpactBuy:'DSR 40% 기준 대출한도 실질적 축소. 변동금리 선택 시 한도 약 11% 감소. 고정금리 선택이 유리.',myImpactRent:'전세대출 한도에도 간접 영향. 스트레스 금리 적용 시 실질 한도 축소 가능.'},
    {date:'2025.07',level:'high',title:'신혼부부 버팀목 소득 기준 1억 완화안 무산',impact:'가계부채 관리 강화 기조로 시행 취소',detail:'→ 7,500만원 기준 유지, 부부합산 8,740만원 초과로 자격 불가',myImpactType:'negative',myImpactBuy:'해당 없음 (매수용 아닌 전세 정책)',myImpactRent:'합산 8,740만 > 7,500만 → 신혼부부 버팀목 전세대출 이용 불가 유지'},
    {date:'2025.06.27',level:'high',title:'6.27 가계부채 관리 강화',impact:'수도권 주담대 한도 6억 제한, 생애최초 LTV 80%→70%',detail:'→ 자기자금 비중 상승, 매수가능 가격대 하향 압박',myImpactType:'negative',myImpactBuy:'주담대 한도 6억 제한은 우리 가격대(~5억)에는 영향 적음. 생애최초 LTV 하락은 불리',myImpactRent:'전세대출에는 직접 영향 없음'},
    {date:'2025.03',level:'mid',title:'신생아 특례 금리 인상 + 디딤돌 실거주 2년',impact:'특례금리 1.6~4.3% → 1.8~4.5%로 인상',detail:'→ 디딤돌대출 실거주 의무 1년 → 2년으로 강화.',myImpactType:'negative',myImpactBuy:'출산 후 신생아 특례 활용 시 금리 부담 소폭 증가. 실거주 2년 의무 → 전세 놓기 어려움.',myImpactRent:'실거주 의무 강화로 구입 후 전세 임대 전략에 제약.'},
    {date:'2025.11',level:'mid',title:'기준금리 인하 3.0% → 2.75%',impact:'',detail:'→ 월 상환 부담 소폭 경감, 3.5억 기준 월 ~8만원 절감',myImpactType:'positive',myImpactBuy:'주담대 금리 하락 → 월 상환 부담 소폭 경감',myImpactRent:'전세대출 금리도 연동 하락 가능 → 월 이자 부담 감소'},
    {date:'2025.01',level:'mid',title:'신생아 특례대출 한도 상향',impact:'구입대출 한도 1.3억→2.5억, 전세 한도 변경 없음',detail:'→ 2025년 이후 출산 가구, 소득 2억 이하 맞벌이 가능',myImpactType:'positive',myImpactBuy:'출산 시 합산 8,740만 < 2억 → 자격 충족. 한도 최대 2.5억→4억. 단 2025.7월 이후 계약분은 한도 4억, 수도권 LTV 70%로 축소됨',myImpactRent:'출산 시 전세 특례도 활용 가능 (소득 1.3억 이하, 맞벌이 2억)'}
  ];
  tl.innerHTML='';
  policies.forEach(p=>{const myImpact=currentMode==='buy'?p.myImpactBuy:p.myImpactRent;const item=document.createElement('div');item.className='tl-item';item.innerHTML='<div class="tl-dot '+p.level+'"></div><div class="tl-date">'+p.date+'</div><div class="tl-body"><div class="tl-title">'+p.title+'</div><div class="tl-impact">'+(p.impact?p.impact+'<br>':'')+'<em>'+p.detail+'</em></div><div class="tl-my-impact '+p.myImpactType+'"><div class="impact-label">'+(p.myImpactType==='positive'?'✅':p.myImpactType==='negative'?'⚠️':'ℹ️')+' 우리 상황 영향</div><div>'+myImpact+'</div></div></div>';tl.appendChild(item);});
}
function updatePolicy(){
  const i1=getVal('income1'),i2=getVal('income2'),ti=i1+i2,mi=Math.min(i1,i2),hc=parseInt(document.getElementById('houseCount').value);
  const assessedIncome=isMarried?ti:mi;const pg=document.getElementById('policyGrid');pg.innerHTML='';let ec=0;
  const loans=currentMode==='buy'?[
    {name:'디딤돌 대출',icon:'🏠',incomeLimit:6000,desc:'부부합산 6,000만 이하',maxLoan:'최대 2억',rate:'2.85~4.15%',conditions:['무주택','주택 5억 이하','LTV 70%'],houseReq:0,note:'생애최초: 소득 7,000만·한도 2.4억·LTV 80%'},
    {name:'보금자리론',icon:'🛡️',incomeLimit:7000,desc:'부부합산 7,000만 이하',maxLoan:'최대 3.6억',rate:'4.05~4.35%',conditions:['무주택/1주택 처분','주택 6억 이하','LTV 70%'],houseReq:1,note:'생애최초: 한도 4.2억·LTV 80%'},
    {name:'신혼부부 구입',icon:'💍',incomeLimit:8500,desc:'부부합산 8,500만 이하',maxLoan:'최대 3.2억',rate:'1.85~3.65%',conditions:['혼인 7년 이내','무주택','6억 이하','LTV 80%'],houseReq:0,note:'혼인신고 필수'},
    {name:'신생아 특례',icon:'👶',incomeLimit:13000,incomeLimitDual:20000,desc:'1.3억 이하 (맞벌이 2억)',maxLoan:'최대 2.5억',rate:'1.80~4.50%',conditions:['2년 내 출산','무주택','9억 이하'],houseReq:0,special:'출산 시 활용 가능',note:'2025년 이후 출산, 한도 1.3억→2.5억 상향'}
  ]:[
    {name:'청년 버팀목',icon:'🧑‍💼',incomeLimit:5000,singleOnly:true,desc:'단독 5,000만 이하',maxLoan:'최대 2억 (80%)',rate:'2.2~3.3%',conditions:['만 19~34세','무주택','보증금 3억 이하'],houseReq:0,note:'소득 2천만 이하 시 금리 2.2%'},
    {name:'일반 버팀목',icon:'🏠',incomeLimit:5000,desc:(isMarried?'부부합산':'단독')+' 5,000만 이하',maxLoan:'최대 1.2억 (70%)',rate:'2.5~3.5%',conditions:['무주택','보증금 3억 이하'],houseReq:0},
    {name:'신혼부부 버팀목',icon:'💍',incomeLimit:7500,marriedOnly:true,desc:'부부합산 7,500만 이하',maxLoan:'최대 2.5억 (80%)',rate:'1.9~3.3%',conditions:['혼인 7년 이내','무주택'],houseReq:0,note:'소득 1억 완화안 무산 (2025.7)'},
    {name:'신생아 특례 전세',icon:'👶',incomeLimit:13000,incomeLimitDual:20000,desc:'1.3억 이하 (맞벌이 2억)',maxLoan:'최대 2.4억 (80%)',rate:'1.6~3.1%',conditions:['2년 내 출산','무주택'],houseReq:0,special:'출산 시 활용 가능'},
    {name:'중기청 전세',icon:'🏢',incomeLimit:5000,singleOnly:true,desc:'단독 5,000만 이하',maxLoan:'최대 1억 (100%)',rate:'1.5% 고정',conditions:['중소기업 재직','무주택','만 19~34세'],houseReq:0,note:'보증금 전액 대출 가능'},
    {name:'청년 월세',icon:'💳',incomeLimit:5000,singleOnly:true,desc:'단독 5,000만 이하',maxLoan:'보증금 4,500만',rate:'1.3%',conditions:['만 19~34세','무주택'],houseReq:0,note:'월세 지원 목적, 보증금 소액'}
  ];
  loans.forEach(loan=>{
    const eil=loan.incomeLimitDual||loan.incomeLimit;let effectiveIncome;if(loan.singleOnly){effectiveIncome=isMarried?ti:mi;}else if(loan.marriedOnly){effectiveIncome=ti;}else{effectiveIncome=isMarried?ti:mi;}
    const gap=effectiveIncome-eil,iOk=gap<=0,hOk=hc<=(loan.houseReq||0),isSp=!!loan.special,needsMarriage=!!loan.marriedOnly;
    let sc,st,cc;if(needsMarriage&&!isMarried){sc='no';st='❌ 혼인신고 필요';cc='ineligible';}else if(iOk&&hOk&&!isSp){sc='yes';st='✅ 자격 충족';cc='eligible';ec++;}else if(isSp){sc='check';st='⏳ '+loan.special;cc='checking';}else if(iOk&&!hOk){sc='maybe';st='⏳ 무주택 시 가능';cc='conditional';}else if(!iOk&&gap<=1000){sc='maybe';st='⚠️ 소득 근접';cc='conditional';}else{sc='no';st='❌ 소득 초과';cc='ineligible';}
    let gt,gc;if(gap>0){gt=gap.toLocaleString()+'만 초과';gc=gap<=1000?'close':'over';}else if(gap===0){gt='기준 딱 맞음';gc='close';}else{gt=Math.abs(gap).toLocaleString()+'만 여유';gc='under';}
    const nH=loan.note?'<div style="font-size:10px;color:var(--accent2);margin-top:4px">💡 '+loan.note+'</div>':'';
    let whatIfH='';if(isMarried&&!iOk&&!isSp){const altGap=mi-eil;if(altGap<=0)whatIfH='<div class="policy-what-if">💭 미혼 시 단독('+fmtShort(mi)+') → 자격 충족 가능했음 (참고용)</div>';}else if(!isMarried&&iOk&&loan.singleOnly){const altGap=ti-eil;if(altGap>0)whatIfH='<div class="policy-what-if">⚠️ 혼인신고 시 합산('+fmtShort(ti)+') → 소득 '+altGap.toLocaleString()+'만 초과로 탈락</div>';}
    const incLabel=isMarried?'합산 '+fmtShort(effectiveIncome):'단독 '+fmtShort(effectiveIncome);
    const c=document.createElement('div');c.className='policy-card '+cc;c.innerHTML='<div class="policy-name">'+loan.icon+' '+loan.name+' <span class="policy-status '+sc+'">'+st+'</span></div><div class="policy-detail">'+loan.desc+' · '+loan.maxLoan+' · '+loan.rate+'<br>조건: '+loan.conditions.join(' / ')+'<br>심사소득: '+incLabel+'</div>'+nH+whatIfH+'<div class="policy-gap '+gc+'">소득 '+gt+'</div>';pg.appendChild(c);
  });
  document.getElementById('policyBadge').textContent=ec>0?ec+'개 자격 충족!':'자동 판정';
  document.getElementById('policyDateLabel').textContent='📅 기준: 2026년 2월 · '+(isMarried?'혼인신고 완료 (부부합산)':'미혼 (단독 소득)')+' · 출처: 주택도시기금·한국주택금융공사 공시';
}
const PAIRS=[['income1','income1Val'],['income2','income2Val'],['cash','cashVal'],['interior','interiorVal'],['rate','rateVal'],['term','termVal'],['monthlyLimit','monthlyLimitVal'],['mgmt','mgmtVal'],['ltv','ltvVal'],['dsr','dsrVal'],['rentRate','rentRateVal'],['rentLoanRatio','rentLoanRatioVal'],['rentLoanLimit','rentLoanLimitVal']];
PAIRS.forEach(([s,i])=>{const sl=document.getElementById(s),ip=document.getElementById(i);if(sl&&ip){sl.addEventListener('input',()=>{ip.value=sl.value;update();});ip.addEventListener('input',()=>{sl.value=ip.value;update();});}});
document.getElementById('houseCount').addEventListener('change',update);
document.getElementById('autoLtvCheckbox').addEventListener('change',function(){
  const on=this.checked,sl=document.getElementById('ltv'),ip=document.getElementById('ltvVal'),hint=document.getElementById('ltvHint');
  sl.disabled=on;ip.disabled=on;
  hint.textContent=on?'지역별 자동 적용 중':'시뮬레이션용';
  update();
});
document.getElementById('searchInput').addEventListener('input',()=>{_focusedPropId=null;currentPage=1;update();});
document.getElementById('regionFilter').addEventListener('change',()=>{_focusedPropId=null;currentPage=1;update();});
const rsi=document.getElementById('rentSearchInput');if(rsi)rsi.addEventListener('input',()=>{_focusedPropId=null;rentPage=1;update();});
const rrf=document.getElementById('rentRegionFilter');if(rrf)rrf.addEventListener('change',()=>{_focusedPropId=null;rentPage=1;update();});

// ─── 카카오맵 ───
let kakaoMap=null,mapMarkers=[],mapInfoWindow=null,mapFilterVal='',mapInitialized=false,geocodingDone=false,mapBoundsFilter=true,mapBounds=null,mapFullscreen=false,mapIdleTimer=null,_preserveScroll=false,_focusedPropId=null,_autoScrolling=false;
(function(){const sl=document.getElementById('splitList');if(sl)sl.addEventListener('scroll',()=>{if(!_autoScrolling)_focusedPropId=null;},{passive:true});})();
function toggleMapFullscreen(){
  mapFullscreen=!mapFullscreen;
  const layout=document.getElementById('splitLayout'),btn=document.getElementById('mapFullscreenBtn'),mapEl=document.querySelector('.split-map');
  if(mapFullscreen){layout.classList.add('map-full');mapEl.classList.add('map-fullscreen');btn.textContent='✕ 닫기';}
  else{layout.classList.remove('map-full');mapEl.classList.remove('map-fullscreen');btn.textContent='⛶ 전체';hideFullscreenPopup();}
  setTimeout(()=>{if(kakaoMap)kakaoMap.relayout();},150);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('fsMapPopup')?.classList.contains('show'))hideFullscreenPopup();else if(mapFullscreen)toggleMapFullscreen();}});
function showFullscreenPopup(p){
  const popup=document.getElementById('fsMapPopup'),content=document.getElementById('fsMapPopupContent');
  if(!popup)return;
  const bc=currentMode==='buy'?(p.verdict==='매수가능'?'ok':p.verdict==='빠듯함'?'warn':'danger'):(p.verdict==='가능'?'ok':p.verdict==='빠듯함'?'warn':'danger');
  const meta=[];
  if(p.station_name)meta.push((p.line?p.line+' ':'')+'도보 '+(p.walk_min||'?')+'분');
  if(p.built_year)meta.push(p.built_year+'년');
  if(p.area_py)meta.push(p.area_py+'평'+(p.area?'('+p.area+')':''));
  if(p.households)meta.push(p.households+'세대');
  let priceStr='',details='';
  if(currentMode==='buy'){
    priceStr='매매 '+fmtShort(p.price);
    const mr=getVal('monthlyLimit')-getVal('mgmt');
    const mColor=p.pMonthly>mr?'var(--red)':p.pMonthly>mr*0.85?'var(--yellow)':'var(--green)';
    details='대출 '+fmtShort(p.pLoan)+' · 자기 '+fmtShort(p.pEquityNeeded)+' · <span style="color:'+mColor+'">월 '+p.pMonthly+'만</span>';
  }else{
    const typeIcon=p.rent_type==='월세'?'💳':'🔑';
    priceStr=p.rent_type==='월세'?'월세 '+fmtShort(p.deposit)+'/'+p.monthly_rent+'만':typeIcon+' 전세 '+fmtShort(p.deposit);
    const eq=getVal('cash'),rr=getVal('rentRate'),rlr=getVal('rentLoanRatio'),rll=getVal('rentLoanLimit'),rf=rlr/100;
    const mbr=rf<1?eq/(1-rf):eq+rll;const aL=Math.min(Math.floor(mbr*rf),rll),budget=eq+aL;
    const needEq=Math.max(0,p.deposit-budget+eq);const loanAmt=p.deposit-needEq;const mi=Math.round(loanAmt*rr/100/12);
    const miColor=mi<=50?'var(--green)':mi<=80?'var(--yellow)':'var(--red)';
    details='대출 '+fmtShort(loanAmt)+' · 자기 '+fmtShort(needEq)+' · <span style="color:'+miColor+'">이자 '+mi+'만</span>';
  }
  const regBadge=currentMode==='buy'?(p.regZone==='투기과열'?'<span class="tag tag-reg tag-reg-hot">투기과열 LTV'+p.pLTV+'%</span>':'<span class="tag tag-reg tag-reg-free">비규제 LTV'+p.pLTV+'%</span>'):'';
  const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
  let hH='';
  if(p.trade_count>1){
    const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const price=currentMode==='buy'?t.price:t.deposit;const prev=currentMode==='buy'?p.trades[i+1].price:p.trades[i+1].deposit;const df=price-prev;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'')+'</span><span class="trade-price">'+fmtShort(currentMode==='buy'?t.price:t.deposit)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');
    hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span></div>'+rows+'</div>';
  }
  const fsAnomaly=p.priceAnomaly?'<span class="tag tag-anomaly">⚠️ 이상가격</span>':'';
  const fsJr=currentMode==='rent'?jeonseRateBadge(p):'';
  content.innerHTML='<div class="pc-compact"><div class="pc-line">'+bmBtn(p)+'<span class="pc-badge-sm '+bc+'">'+p.verdict+'</span>'+fsAnomaly+fsJr+'<span class="pc-cname">'+p.name+'</span><span class="pc-cregion">'+p.region+'</span>'+regBadge+'</div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">'+priceStr+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'')+'</div>';
  popup.classList.add('show');
}
function hideFullscreenPopup(){const popup=document.getElementById('fsMapPopup');if(popup)popup.classList.remove('show');}
document.addEventListener('DOMContentLoaded',()=>{const btn=document.getElementById('fsMapPopupClose');if(btn)btn.addEventListener('click',hideFullscreenPopup);});
const MARKER_COLORS={ok:'#34d399',warn:'#fbbf24',danger:'#f87171',station:'#60a5fa'};
const MAP_STATIONS=[
  {name:"강남",lat:37.4979,lon:127.0276},{name:"양재",lat:37.4842,lon:127.0353},{name:"판교",lat:37.3948,lon:127.1112},
  {name:"정자",lat:37.3669,lon:127.1085},{name:"미금",lat:37.3510,lon:127.1095},{name:"동천",lat:37.3383,lon:127.1085},
  {name:"수지구청",lat:37.3220,lon:127.0960},{name:"성복",lat:37.3114,lon:127.0786},{name:"상현",lat:37.3005,lon:127.0653},
  {name:"광교중앙",lat:37.2886,lon:127.0492},{name:"모란",lat:37.4321,lon:127.1293},{name:"야탑",lat:37.4112,lon:127.1272}
];
function setMapFilter(btn){document.querySelectorAll('#mapVerdictChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');mapFilterVal=btn.dataset.val;updateMapMarkers();}
function toggleMapBounds(on){_focusedPropId=null;mapBoundsFilter=on;if(on&&kakaoMap){mapBounds=kakaoMap.getBounds();}else{mapBounds=null;}currentPage=1;rentPage=1;update();}
function onMapIdle(){if(!mapBoundsFilter||!kakaoMap)return;if(mapIdleTimer)clearTimeout(mapIdleTimer);mapIdleTimer=setTimeout(()=>{mapBounds=kakaoMap.getBounds();_preserveScroll=true;update();_preserveScroll=false;},500);}
function inBounds(p){if(!mapBounds||!p.lat||!p.lon)return true;const sw=mapBounds.getSouthWest(),ne=mapBounds.getNorthEast();return p.lat>=sw.getLat()&&p.lat<=ne.getLat()&&p.lon>=sw.getLng()&&p.lon<=ne.getLng();}
function geocodeUnmatchedProps(){
  if(geocodingDone)return;
  geocodingDone=true;
  const allProps=[...PROPERTIES,...RENT_PROPERTIES];
  // 중복 제거: dong+name 기준
  const seen={};const toGeocode=[];
  allProps.forEach(p=>{
    if(p.lat&&p.lon)return;
    const k=p.region+'_'+p.dong+'_'+p.name;if(seen[k])return;seen[k]=p;
    toGeocode.push(p);
  });
  if(toGeocode.length===0)return;
  const ps=new kakao.maps.services.Places();
  let idx=0,found=0;
  function next(){
    if(idx>=toGeocode.length){
      if(found>0){_preserveScroll=true;update();_preserveScroll=false;}
      document.getElementById('mapBadge').textContent+=' (지오코딩 완료)';
      return;
    }
    const p=toGeocode[idx++];
    const query=p.region+' '+p.dong+' '+p.name;
    ps.keywordSearch(query,function(data,status){
      if(status===kakao.maps.services.Status.OK&&data.length>0){
        const lat=parseFloat(data[0].y),lon=parseFloat(data[0].x);
        // 같은 dong+name을 공유하는 모든 속성에 좌표 적용
        allProps.forEach(ap=>{if(ap.region===p.region&&ap.dong===p.dong&&ap.name===p.name&&!ap.lat){ap.lat=lat;ap.lon=lon;}});
        found++;
      }
      if(idx%30===0&&found>0){_preserveScroll=true;update();_preserveScroll=false;found=0;}
      setTimeout(next,80);
    },{size:1});
  }
  next();
}
function initMapIfNeeded(){
  if(mapInitialized)return;
  if(typeof kakao==='undefined'||!kakao.maps){document.getElementById('mapBadge').textContent='카카오맵 로딩 실패';return;}
  kakao.maps.load(()=>{
    const container=document.getElementById('mapContainer');
    kakaoMap=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(37.38,127.08),level:8});
    kakao.maps.event.addListener(kakaoMap,'idle',onMapIdle);
    kakao.maps.event.addListener(kakaoMap,'click',()=>{hideFullscreenPopup();});
    mapInfoWindow=new kakao.maps.InfoWindow({zIndex:1});
    // 역 마커
    MAP_STATIONS.forEach(st=>{
      const m=new kakao.maps.Marker({map:kakaoMap,position:new kakao.maps.LatLng(st.lat,st.lon),image:new kakao.maps.MarkerImage('https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',new kakao.maps.Size(24,35))});
      kakao.maps.event.addListener(m,'click',()=>{mapInfoWindow.setContent('<div style="padding:4px 8px;font-size:12px;white-space:nowrap">🚇 '+st.name+'역</div>');mapInfoWindow.open(kakaoMap,m);});
    });
    mapInitialized=true;
    updateMapMarkers();
    setTimeout(()=>kakaoMap.relayout(),50);
    geocodeUnmatchedProps();
  });
}
function getMarkerSVG(color,bm){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="'+color+'"'+(bm?' stroke="#FFD700" stroke-width="2"':'')+'/>'+(bm?'<text x="12" y="15" text-anchor="middle" fill="#FFD700" font-size="14" font-weight="bold">★</text>':'<circle cx="12" cy="11" r="5" fill="white" opacity="0.9"/>')+'</svg>');}
function updateMapMarkers(){
  if(!kakaoMap)return;
  mapMarkers.forEach(m=>m.setMap(null));mapMarkers=[];markerMap={};
  const props=currentMode==='buy'?filteredBuyProps:filteredRentProps;
  if(!props||props.length===0){document.getElementById('mapBadge').textContent='매물 데이터 없음';return;}
  const seen={};let cnt=0;
  props.forEach(p=>{
    if(!p.lat||!p.lon)return;
    const mKey=getMarkerKey(p);if(seen[mKey])return;seen[mKey]=true;
    const verdict=currentMode==='buy'?(p.verdict==='매수가능'?'ok':p.verdict==='빠듯함'?'warn':'danger'):(p.verdict==='가능'?'ok':p.verdict==='빠듯함'?'warn':'danger');
    if(mapFilterVal&&verdict!==mapFilterVal)return;
    const color=getDistrictColor(p.region);const bm=isBookmarked(getPropId(p));
    const img=new kakao.maps.MarkerImage(getMarkerSVG(color,bm),new kakao.maps.Size(24,32));
    const marker=new kakao.maps.Marker({map:kakaoMap,position:new kakao.maps.LatLng(p.lat,p.lon),image:img});
    const priceStr=currentMode==='buy'?fmtShort(p.price):fmtShort(p.deposit);
    const label=currentMode==='buy'?'매매 ':'보증금 ';
    kakao.maps.event.addListener(marker,'click',()=>{
      if(mapFullscreen){showFullscreenPopup(p);return;}
      if(isMobile()){showMobileMapPopup(p);return;}
      mapInfoWindow.setContent('<div style="padding:8px 12px;font-size:12px;line-height:1.5;max-width:220px"><strong>'+p.name+'</strong><br><span style="color:#666">'+p.region+' · '+p.area+'</span><br><span style="font-weight:700">'+label+priceStr+'</span>'+(p.station?' · '+p.station:'')+'</div>');
      mapInfoWindow.open(kakaoMap,marker);
      focusCard(mKey);
    });
    markerMap[mKey]=marker;
    mapMarkers.push(marker);cnt++;
  });
  document.getElementById('mapBadge').textContent=cnt+'개 매물 표시';
}
let mobileSplitMode='list';
function isMobile(){return window.innerWidth<=768;}
function switchMobileSplit(mode){
  mobileSplitMode=mode;
  const sl=document.getElementById('splitLayout');
  if(!sl)return;
  document.querySelectorAll('.mobile-split-tab').forEach(b=>b.classList.toggle('active',b.dataset.split===mode));
  sl.classList.remove('mobile-map','mobile-list');
  sl.classList.add('mobile-'+mode);
  if(mode==='map'){
    if(!mapInitialized)initMapIfNeeded();
    if(kakaoMap)setTimeout(()=>{kakaoMap.relayout();if(mapInitialized)updateMapMarkers();},200);
  }
  const popup=document.getElementById('mobileMapPopup');if(popup)popup.classList.remove('show');
}
function showMobileMapPopup(p){
  const popup=document.getElementById('mobileMapPopup'),content=document.getElementById('mobileMapPopupContent');
  const bc=currentMode==='buy'?(p.verdict==='매수가능'?'ok':p.verdict==='빠듯함'?'warn':'danger'):(p.verdict==='가능'?'ok':p.verdict==='빠듯함'?'warn':'danger');
  const priceLabel=currentMode==='buy'?'매매 ':'전세 ';
  const priceVal=currentMode==='buy'?p.price:p.deposit;
  const meta=[];if(p.area_py)meta.push(p.area_py+'평');if(p.area)meta.push('('+p.area+')');
  const station=[];if(p.station_name)station.push(p.station_name);if(p.walk_min)station.push('도보 '+p.walk_min+'분');
  const extra=[];if(p.built_year)extra.push(p.built_year+'년');if(p.households>0)extra.push(p.households+'세대');else if(p.households===0&&isLikelyNaholo(p))extra.push('<span class="tag tag-danger" style="font-size:10px;padding:1px 4px">⚠️ 소단지 추정</span>');else if(p.households===0)extra.push('<span style="color:var(--text-dim)">세대수 미확인</span>');
  let financeInfo='';
  if(currentMode==='buy'&&p.pLoan!==undefined){financeInfo='대출 '+fmtShort(p.pLoan)+' · 자기 '+fmtShort(p.pEquityNeeded)+' · 월 '+p.pMonthly+'만';}
  else if(currentMode!=='buy'){const eq=getVal('cash'),rr=getVal('rentRate'),rlr=getVal('rentLoanRatio'),rll=getVal('rentLoanLimit'),rf=rlr/100;const mbr=rf<1?eq/(1-rf):eq+rll;const aL=Math.min(Math.floor(mbr*rf),rll),budget=eq+aL;const needEq=Math.max(0,p.deposit-budget+eq);const loanAmt=p.deposit-needEq;const mi=Math.round(loanAmt*rr/100/12);financeInfo='대출 '+fmtShort(loanAmt)+' · 이자 '+mi+'만/월';}
  content.innerHTML='<div class="pc-compact" style="padding:4px 0"><div class="pc-line"><span class="pc-badge-sm '+bc+'">'+p.verdict+'</span><span class="pc-cname">'+p.name+'</span><span class="pc-cregion">'+p.region+'</span></div><div class="pc-line" style="margin-top:4px"><span class="pc-cprice">'+priceLabel+fmtShort(priceVal)+'</span><span class="pc-cdetails">'+meta.join(' ')+'</span></div><div class="pc-line" style="margin-top:2px"><span class="pc-cmeta">'+(station.length?'🚇 '+station.join(' '):'')+(extra.length?' · '+extra.join(' · '):'')+'</span></div>'+(financeInfo?'<div class="pc-line" style="margin-top:2px"><span class="pc-cmeta" style="color:var(--text-mid)">'+financeInfo+'</span></div>':'')+'<div class="pc-links" style="margin-top:8px">'+makeLinks(p)+'</div></div>';
  popup.classList.add('show');
  setTimeout(()=>{document.addEventListener('click',dismissMobilePopup,{once:true});},100);
}
function dismissMobilePopup(e){const popup=document.getElementById('mobileMapPopup');if(popup&&!popup.contains(e.target))popup.classList.remove('show');}
window.addEventListener('resize',()=>{
  if(kakaoMap)kakaoMap.relayout();
  const sl=document.getElementById('splitLayout');
  if(window.innerWidth>768){sl.classList.remove('mobile-map','mobile-list');}
  else if(!sl.classList.contains('mobile-map')&&!sl.classList.contains('mobile-list')){switchMobileSplit(mobileSplitMode);}
});
// 모바일: 즉시 리스트 모드 적용 (데이터 로드 전에도 올바른 레이아웃)
if(isMobile())switchMobileSplit('list');

// ─── 관심 매물 (wishlist) ───
let wishlistData={items:[]},_wishlistTabActive=false,wishlistMap=null,wishlistMapInitialized=false,wishlistMapMarkers=[],wishlistMarkerMap={},_wlFocusedId=null;

async function loadWishlist(){
  try{
    const res=await fetch('wishlist.json?'+Date.now());
    if(res.ok)wishlistData=await res.json();
    else wishlistData={items:[]};
  }catch(e){
    console.log('wishlist.json 로드 실패 (아직 생성 안 됨)');
    wishlistData={items:[]};
  }
  updateWishlistCount();
}
function updateWishlistCount(){
  const el=document.getElementById('wishlistCount');
  if(el)el.textContent=wishlistData.items.length>0?'('+wishlistData.items.length+'건)':'';
}
function getWishlistMarkerSVG(){
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#f59e0b"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="12" font-weight="bold">★</text></svg>');
}
function initWishlistMapIfNeeded(){
  if(wishlistMapInitialized)return;
  if(typeof kakao==='undefined'||!kakao.maps)return;
  kakao.maps.load(()=>{
    const container=document.getElementById('wishlistMapContainer');
    if(!container)return;
    wishlistMap=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(37.38,127.08),level:8});
    wishlistMapInitialized=true;
    renderWishlistMap();
  });
}
function renderWishlistMap(){
  if(!wishlistMap)return;
  wishlistMapMarkers.forEach(m=>m.setMap(null));
  wishlistMapMarkers=[];wishlistMarkerMap={};
  const items=wishlistData.items.filter(i=>i.lat&&i.lng&&i.lat!==0&&i.lng!==0);
  if(items.length===0){document.getElementById('wishlistMapBadge').textContent='표시할 매물 없음';return;}
  const img=new kakao.maps.MarkerImage(getWishlistMarkerSVG(),new kakao.maps.Size(28,36),{offset:new kakao.maps.Point(14,36)});
  const bounds=new kakao.maps.LatLngBounds();
  items.forEach(item=>{
    const pos=new kakao.maps.LatLng(item.lat,item.lng);
    bounds.extend(pos);
    const marker=new kakao.maps.Marker({map:wishlistMap,position:pos,image:img});
    const priceStr=item.price?fmtShort(item.price):'가격 미확인';
    kakao.maps.event.addListener(marker,'click',()=>{
      focusWishlistCard(item.id);
    });
    wishlistMarkerMap[item.id]=marker;
    wishlistMapMarkers.push(marker);
  });
  wishlistMap.setBounds(bounds,80);
  document.getElementById('wishlistMapBadge').textContent=items.length+'개 매물 표시';
}
function focusWishlistCard(id){
  _wlFocusedId=id;
  const el=document.querySelector('.wishlist-card[data-id="'+id+'"]');
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  document.querySelectorAll('.wishlist-card.highlight').forEach(e=>e.classList.remove('highlight'));
  el.classList.add('highlight');
  setTimeout(()=>{if(el.classList)el.classList.remove('highlight');},2500);
}
function renderWishlistCards(){
  const cg=document.getElementById('wishlistCards');
  const empty=document.getElementById('wishlistEmpty');
  const summary=document.getElementById('wishlistSummary');
  const splitLayout=document.getElementById('wishlistSplitLayout');
  if(!cg)return;
  const items=[...wishlistData.items];
  if(items.length===0){
    cg.innerHTML='';
    if(empty)empty.style.display='';
    if(splitLayout)splitLayout.style.display='none';
    if(summary)summary.innerHTML='';
    return;
  }
  if(empty)empty.style.display='none';
  if(splitLayout)splitLayout.style.display='';
  // 정렬
  const sortVal=(document.getElementById('wishlistSort')||{}).value||'date-desc';
  if(sortVal==='date-desc')items.sort((a,b)=>(b.added_at||'').localeCompare(a.added_at||''));
  else if(sortVal==='date-asc')items.sort((a,b)=>(a.added_at||'').localeCompare(b.added_at||''));
  else if(sortVal==='price-desc')items.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(sortVal==='price-asc')items.sort((a,b)=>(a.price||0)-(b.price||0));
  else if(sortVal==='user')items.sort((a,b)=>(a.added_by||'').localeCompare(b.added_by||''));
  // 요약
  const buyCount=items.filter(i=>i.trade_type==='매매').length;
  const rentCount=items.filter(i=>i.trade_type==='전세').length;
  const latest=items.reduce((a,b)=>(a.added_at||'')>(b.added_at||'')?a:b,{});
  const latestDate=latest.added_at?latest.added_at.split('T')[0]:'—';
  if(summary)summary.innerHTML='📌 관심 매물 <span class="wl-stat">'+items.length+'건</span> | 매매 <span class="wl-stat">'+buyCount+'건</span> · 전세 <span class="wl-stat">'+rentCount+'건</span> | 최근 등록: <span class="wl-stat">'+latestDate+'</span>';
  // 카드 렌더링
  cg.innerHTML='';
  items.forEach(item=>{
    const card=document.createElement('div');
    if(item.name==='(파싱 전)'){
      card.className='wishlist-card wishlist-card--unparsed';
      card.dataset.id=item.id;
      card.innerHTML='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="wishlist-id">#'+item.id+'</span><span style="color:var(--text-dim)">(파싱 전)</span><a href="'+escHtml(item.url)+'" target="_blank" class="naver-link">📎 링크 열기</a><span class="added-by" style="margin-left:auto">👤 '+(item.added_by||'—')+' | '+(item.added_at?item.added_at.split('T')[0]:'—')+'</span></div>';
    }else{
      card.className='wishlist-card';
      card.dataset.id=item.id;
      const typeClass=item.trade_type==='매매'?'buy':'rent';
      const priceStr=item.price?fmtShort(item.price):'가격 미확인';
      const areaStr=item.area_m2?item.area_m2+'㎡'+(item.area_pyeong?'('+item.area_pyeong+'평)':''):'';
      const floorStr=item.floor||'';
      const builtStr=item.built_year?item.built_year+'년':'';
      const hhStr=item.households>0?item.households+'세대':item.households===0?'세대수 미확인':'';
      const details=[areaStr,floorStr?floorStr+'층':'',builtStr,hhStr].filter(Boolean);
      card.innerHTML='<div class="wishlist-card-header"><span class="wishlist-id">#'+item.id+'</span><span class="wishlist-name">'+(item.name||'—')+'</span><span class="wishlist-region">'+(item.region||'')+'</span></div><div class="wishlist-card-body"><div class="wishlist-price"><span class="trade-type '+typeClass+'">'+(item.trade_type||'—')+'</span><span class="price">'+priceStr+'</span></div><div class="wishlist-details">'+details.map(d=>'<span>'+d+'</span>').join('')+'</div></div><div class="wishlist-card-footer"><span class="added-by">👤 '+(item.added_by||'—')+'</span><span class="added-at">'+(item.added_at?item.added_at.split('T')[0]:'—')+'</span><a href="'+escHtml(item.url)+'" target="_blank" class="naver-link">📎 네이버부동산</a></div>'+(item.memo?'<div class="wishlist-memo"><textarea placeholder="메모...">'+escHtml(item.memo)+'</textarea></div>':'<div class="wishlist-memo"><textarea placeholder="메모..."></textarea></div>');
    }
    // 카드 클릭 → 지도 연동
    card.addEventListener('click',e=>{
      if(e.target.tagName==='A'||e.target.tagName==='TEXTAREA')return;
      if(item.lat&&item.lng&&item.lat!==0&&item.lng!==0&&wishlistMap){
        wishlistMap.setCenter(new kakao.maps.LatLng(item.lat,item.lng));
        wishlistMap.setLevel(5);
        // 마커 바운스
        const m=wishlistMarkerMap[item.id];
        if(m&&m.a)m.a.style.animation='markerBounce 0.6s ease infinite';
        setTimeout(()=>{if(m&&m.a)m.a.style.animation='';},1800);
      }
    });
    card.addEventListener('mouseenter',()=>{
      const m=wishlistMarkerMap[item.id];
      if(m&&m.a)m.a.style.animation='markerBounce 0.6s ease infinite';
    });
    card.addEventListener('mouseleave',()=>{
      const m=wishlistMarkerMap[item.id];
      if(m&&m.a)try{m.a.style.animation='';}catch(e){}
    });
    cg.appendChild(card);
  });
}
function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
let wlMobileSplitMode='list';
function switchWlMobileSplit(mode){
  wlMobileSplitMode=mode;
  const sl=document.getElementById('wishlistSplitLayout');if(!sl)return;
  document.querySelectorAll('#wlMobileSplitTabs .mobile-split-tab').forEach(b=>b.classList.toggle('active',b.dataset.split===mode));
  sl.classList.remove('mobile-map','mobile-list');sl.classList.add('mobile-'+mode);
  if(mode==='map'){initWishlistMapIfNeeded();if(wishlistMap)setTimeout(()=>{wishlistMap.relayout();renderWishlistMap();},200);}
}

// ─── 시세 추이 (Flagship) ───
const FG_GU_GROUPS={
  '동북권':['노원구','도봉구','강북구','중랑구','광진구','동대문구','강동구'],
  '남서권':['양천구','관악구','금천구'],
};
const FG_GU_COLORS={
  '노원구':'#3B82F6','도봉구':'#8B5CF6','강북구':'#EC4899',
  '중랑구':'#F59E0B','광진구':'#10B981','동대문구':'#6366F1',
  '강동구':'#EF4444','양천구':'#0EA5E9','관악구':'#F97316','금천구':'#A855F7',
};
const FG_GU_ORDER=['노원구','도봉구','강북구','중랑구','광진구','동대문구','강동구','양천구','관악구','금천구'];

let FLAGSHIP_HISTORY=null;
let flagshipChartInstance=null;
let currentFgFilter='all';
let _fgEntryMonthMaps=[];

function fgMonthKeys(){
  const now=new Date(),keys=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    keys.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return keys;
}
function fgMonthLabels(){
  return fgMonthKeys().map(k=>{const[y,m]=k.split('-');return String(y).slice(-2)+'.'+m;});
}
function fgPrevMonth(dateStr){
  const[y,m]=dateStr.split('-').map(Number);
  if(m===1)return(y-1)+'-12';
  return y+'-'+String(m-1).padStart(2,'0');
}
function fgFmtPrice(v){
  if(v>=10000){const a=v/10000;return(a===Math.floor(a)?Math.floor(a):a.toFixed(1))+'억';}
  return v.toLocaleString()+'만';
}

async function loadFlagshipData(){
  try{
    const res=await fetch('flagship_history.json');
    if(!res.ok)throw new Error(res.status);
    FLAGSHIP_HISTORY=await res.json();
    initFlagshipGuChips();
  }catch(e){
    console.warn('flagship_history.json 로드 실패:',e);
    FLAGSHIP_HISTORY=null;
  }
}

function initFlagshipGuChips(){
  const wrap=document.getElementById('fgGuChips');
  if(!wrap||!FLAGSHIP_HISTORY)return;
  const watchlist=FLAGSHIP_HISTORY.watchlist||[];
  const gus=[...new Set(watchlist.map(e=>e.gu))].sort((a,b)=>{
    const ia=FG_GU_ORDER.indexOf(a),ib=FG_GU_ORDER.indexOf(b);
    return(ia<0?99:ia)-(ib<0?99:ib);
  });
  wrap.innerHTML=gus.map(gu=>{
    const color=FG_GU_COLORS[gu]||'#9CA3AF';
    return`<button class="fg-chip fg-gu" data-gu="${gu}" onclick="setFgFilter('${gu}')" style="--fg-color:${color}">${gu.replace('구','')}</button>`;
  }).join('');
}

function setFgFilter(gu){
  currentFgFilter=gu;
  document.querySelectorAll('.fg-chip').forEach(b=>b.classList.toggle('active',b.dataset.gu===gu));
  renderFlagshipTab();
}

function getFlagshipChartEntries(){
  if(!FLAGSHIP_HISTORY)return[];
  const watchlist=FLAGSHIP_HISTORY.watchlist||[];
  // 전체 · 그룹: 구당 대표 1개 (거래 많은 단지), 거래 없는 단지 제외
  if(currentFgFilter==='all'||FG_GU_GROUPS[currentFgFilter]){
    const pool=currentFgFilter==='all'
      ?watchlist
      :watchlist.filter(e=>FG_GU_GROUPS[currentFgFilter].includes(e.gu));
    const byGu={};
    pool.filter(e=>e.transactions.length>0).forEach(e=>{
      if(!byGu[e.gu]||e.transactions.length>byGu[e.gu].transactions.length)byGu[e.gu]=e;
    });
    return FG_GU_ORDER.map(g=>byGu[g]).filter(Boolean);
  }
  // 개별 구: 해당 구 모든 단지 표시
  return watchlist.filter(e=>e.gu===currentFgFilter);
}

function getFlagshipCardEntries(){
  if(!FLAGSHIP_HISTORY)return[];
  const watchlist=FLAGSHIP_HISTORY.watchlist||[];
  if(currentFgFilter==='all')return watchlist;
  if(FG_GU_GROUPS[currentFgFilter])return watchlist.filter(e=>FG_GU_GROUPS[currentFgFilter].includes(e.gu));
  return watchlist.filter(e=>e.gu===currentFgFilter);
}

function renderFlagshipTab(){
  const cardsEl=document.getElementById('flagshipCards');
  // 구 칩 active 동기화
  document.querySelectorAll('.fg-chip').forEach(b=>b.classList.toggle('active',b.dataset.gu===currentFgFilter));

  if(!FLAGSHIP_HISTORY){
    if(flagshipChartInstance){flagshipChartInstance.destroy();flagshipChartInstance=null;}
    const wrap=document.querySelector('.flagship-chart-wrap');
    if(wrap)wrap.innerHTML='<canvas id="flagshipChart"></canvas>';
    if(cardsEl)cardsEl.innerHTML='<div class="fg-empty">데이터 수집 중...<br>GitHub Actions에서 <strong>flagship-backfill</strong> 워크플로우를 먼저 실행해주세요.</div>';
    return;
  }
  const watchlist=FLAGSHIP_HISTORY.watchlist||[];
  if(watchlist.length===0){
    if(cardsEl)cardsEl.innerHTML='<div class="fg-empty">거래 데이터가 없습니다.</div>';
    return;
  }
  renderFlagshipChart(getFlagshipChartEntries());
  renderFlagshipCards(getFlagshipCardEntries());
}

function renderFlagshipChart(entries){
  // canvas 복원 (이전에 에러 메시지로 교체된 경우 대비)
  const wrap=document.querySelector('.flagship-chart-wrap');
  if(wrap&&!document.getElementById('flagshipChart')){
    wrap.innerHTML='<canvas id="flagshipChart"></canvas>';
  }
  const canvas=document.getElementById('flagshipChart');
  if(!canvas)return;

  if(flagshipChartInstance){flagshipChartInstance.destroy();flagshipChartInstance=null;}

  if(typeof Chart==='undefined'){
    wrap.innerHTML='<div class="fg-empty fg-chart-error">Chart.js를 불러올 수 없습니다. 인터넷 연결을 확인해주세요.</div>';
    return;
  }

  const monthKeys=fgMonthKeys();
  const monthLabels=fgMonthLabels();

  // 단지별 월→최고가 거래 맵
  _fgEntryMonthMaps=entries.map(entry=>{
    const m={};
    (entry.transactions||[]).forEach(t=>{if(!m[t.date]||t.price>m[t.date].price)m[t.date]=t;});
    return m;
  });

  const datasets=entries.map((entry,i)=>{
    const color=FG_GU_COLORS[entry.gu]||'#9CA3AF';
    return{
      label:entry.name,
      data:monthKeys.map(k=>_fgEntryMonthMaps[i][k]?_fgEntryMonthMaps[i][k].price:null),
      borderColor:color,
      backgroundColor:color+'18',
      borderWidth:2.5,
      pointRadius:4,
      pointHoverRadius:6,
      pointBackgroundColor:color,
      tension:0.3,
      spanGaps:true,
      segment:{
        borderDash:ctx=>(ctx.p0.skip||ctx.p1.skip)?[6,4]:undefined,
        borderColor:ctx=>(ctx.p0.skip||ctx.p1.skip)?color+'88':color,
      },
    };
  });

  // Y축 범위: 현재 데이터 min/max에 10% 여백
  const allPrices=[];
  _fgEntryMonthMaps.forEach(m=>Object.values(m).forEach(tx=>allPrices.push(tx.price)));
  let yMin,yMax;
  if(allPrices.length){
    const lo=Math.min(...allPrices),hi=Math.max(...allPrices);
    const pad=Math.max((hi-lo)*0.1,1000);
    yMin=Math.max(0,Math.floor((lo-pad)/1000)*1000);
    yMax=Math.ceil((hi+pad)/1000)*1000;
  }

  const isMobile=window.innerWidth<768;
  flagshipChartInstance=new Chart(canvas,{
    type:'line',
    data:{labels:monthLabels,datasets},
    options:{
      responsive:true,
      maintainAspectRatio:true,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{
          display:true,
          position:isMobile?'top':'right',
          align:isMobile?'center':'start',
          labels:{
            color:'#a0a0b8',
            font:{size:isMobile?10:11,family:"'Noto Sans KR',sans-serif"},
            boxWidth:isMobile?10:14,
            padding:isMobile?6:10,
            usePointStyle:true,
            pointStyle:'line',
          },
        },
        tooltip:{
          backgroundColor:'#0d0d14',
          borderColor:'#232336',
          borderWidth:1,
          titleColor:'#7a7a95',
          bodyColor:'#eeeef5',
          padding:10,
          callbacks:{
            title(items){return items[0]?.label?'20'+items[0].label:'';},
            label(ctx){
              if(ctx.raw==null)return null;
              const entry=entries[ctx.datasetIndex];
              const monthKey=monthKeys[ctx.dataIndex];
              const tx=_fgEntryMonthMaps[ctx.datasetIndex][monthKey];
              if(!tx)return null;
              return` ${entry.name}  ${fmtShort(tx.price)}  ${tx.floor}층`;
            },
          },
        },
      },
      scales:{
        x:{ticks:{color:'#7a7a95',font:{size:isMobile?9:11}},grid:{color:'#232336'}},
        y:{
          min:yMin,
          max:yMax,
          ticks:{
            color:'#7a7a95',
            font:{size:isMobile?9:11},
            callback(v){
              if(v>=10000){const a=v/10000;return(a===Math.floor(a)?Math.floor(a):a.toFixed(1))+'억';}
              return v.toLocaleString();
            },
          },
          grid:{color:'#232336'},
        },
      },
    },
  });
}

function renderFlagshipCards(entries){
  const container=document.getElementById('flagshipCards');
  if(!container)return;
  const sorted=[...entries].sort((a,b)=>(b.transactions[0]?.date||'').localeCompare(a.transactions[0]?.date||''));
  if(!sorted.length){container.innerHTML='<div class="fg-empty">표시할 단지가 없습니다.</div>';return;}

  container.innerHTML=sorted.map(entry=>{
    const color=FG_GU_COLORS[entry.gu]||'#9CA3AF';
    const guShort=entry.gu.replace('구','');
    const tx=entry.transactions[0];
    if(!tx){
      return`<div class="flagship-card"><div class="fc-header"><span class="dc-badge" style="background:${color}">${guShort}</span><span class="fc-name">${entry.name}</span><span class="fc-area">${entry.area_target}㎡</span></div><div class="fc-empty">거래 없음</div></div>`;
    }
    const prevTx=entry.transactions.find(t=>t.date===fgPrevMonth(tx.date));
    let diffHtml='';
    if(prevTx){
      const diff=tx.price-prevTx.price;
      if(diff>0)diffHtml=`<div class="fc-diff"><span class="price-up">▲ ${fmtShort(diff)}</span><span class="fc-diff-vs"> vs 전월</span></div>`;
      else if(diff<0)diffHtml=`<div class="fc-diff"><span class="price-down">▼ ${fmtShort(Math.abs(diff))}</span><span class="fc-diff-vs"> vs 전월</span></div>`;
      else diffHtml=`<div class="fc-diff"><span class="price-flat">→ 보합</span><span class="fc-diff-vs"> vs 전월</span></div>`;
    }
    const q=encodeURIComponent(entry.name);
    const qDong=encodeURIComponent(entry.dong+' '+entry.name);
    return`<div class="flagship-card">
  <div class="fc-header"><span class="dc-badge" style="background:${color}">${guShort}</span><span class="fc-name">${entry.name}</span><span class="fc-area">${entry.area_target}㎡</span></div>
  <div class="fc-price">${fmtShort(tx.price)}</div>
  <div class="fc-meta">${tx.floor}층&nbsp;|&nbsp;${tx.date.replace('-','.')} (${tx.deal_day}일)</div>
  ${diffHtml}
  <div class="fc-links">
    <a href="https://m.land.naver.com/search/result/${qDong}" target="_blank" class="fc-link">네이버</a>
    <a href="https://hogangnono.com/search?q=${q}" target="_blank" class="fc-link">호갱</a>
    <a href="https://asil.kr/search/${q}" target="_blank" class="fc-link">아실</a>
  </div>
</div>`;
  }).join('');
}

loadSettings().then(()=>loadData().then(()=>{
  initMapIfNeeded();
  loadWishlist();
}));
