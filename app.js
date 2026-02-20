// ─── 지역별 규제등급 매핑 (2025.10.15 대책 기준) ───
const REGULATION_MAP={
  // 투기과열지구 (LTV 40%) — 서울 전역은 fallback 처리
  '서울 강남구':{zone:'투기과열',ltv:40},'서울 서초구':{zone:'투기과열',ltv:40},'서울 송파구':{zone:'투기과열',ltv:40},
  '서울 강동구':{zone:'투기과열',ltv:40},'서울 동작구':{zone:'투기과열',ltv:40},'서울 관악구':{zone:'투기과열',ltv:40},
  '서울 금천구':{zone:'투기과열',ltv:40},'서울 성북구':{zone:'투기과열',ltv:40},'서울 강서구':{zone:'투기과열',ltv:40},
  '서울 노원구':{zone:'투기과열',ltv:40},'서울 도봉구':{zone:'투기과열',ltv:40},'서울 영등포구':{zone:'투기과열',ltv:40},
  '서울 구로구':{zone:'투기과열',ltv:40},'서울 용산구':{zone:'투기과열',ltv:40},
  // 경기 투기과열
  '경기 과천시':{zone:'투기과열',ltv:40},'경기 광명시':{zone:'투기과열',ltv:40},
  '성남 수정구':{zone:'투기과열',ltv:40},'성남 중원구':{zone:'투기과열',ltv:40},'성남 분당구':{zone:'투기과열',ltv:40},
  '수원 영통구':{zone:'투기과열',ltv:40},'수원 장안구':{zone:'투기과열',ltv:40},'수원 팔달구':{zone:'투기과열',ltv:40},
  '경기 안양 동안구':{zone:'투기과열',ltv:40},'용인 수지구':{zone:'투기과열',ltv:40},
  '경기 의왕시':{zone:'투기과열',ltv:40},'경기 하남시':{zone:'투기과열',ltv:40},
  // 비규제지역 (LTV 70%)
  '경기 안양 만안구':{zone:'비규제',ltv:70},'용인 기흥구':{zone:'비규제',ltv:70},
  '경기 광주시':{zone:'비규제',ltv:70},'경기 구리시':{zone:'비규제',ltv:70},'경기 군포시':{zone:'비규제',ltv:70},
  '부천 원미구':{zone:'비규제',ltv:70},'부천 소사구':{zone:'비규제',ltv:70},'부천 오정구':{zone:'비규제',ltv:70},'고양 일산동구':{zone:'비규제',ltv:70},'수원 권선구':{zone:'비규제',ltv:70},
  '인천 서구':{zone:'비규제',ltv:70},'인천 남동구':{zone:'비규제',ltv:70}
};
function getRegulation(region){
  if(!region)return{zone:'비규제',ltv:70};
  if(REGULATION_MAP[region])return REGULATION_MAP[region];
  if(region.startsWith('서울'))return{zone:'투기과열',ltv:40};
  return{zone:'비규제',ltv:70};
}

let currentMode='buy',isMarried=true,PROPERTIES=[],RENT_PROPERTIES=[],DATA_LOADED=false,RENT_DATA_LOADED=false,DATA_UPDATED_AT='',RENT_UPDATED_AT='',currentSort='value',rentSort='value',searchQuery='',regionFilterVal='',verdictFilterVal='',rentTypeFilterVal='',rentVerdictFilterVal='',areaUnit='py',pageSize=20,currentPage=1,rentPage=1,currentView='card';
let markerMap={},filteredBuyProps=[],filteredRentProps=[],hlTimer=null,COMMUTE_DATA={};

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
  currentMode=mode;
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
  if(tabId==='properties'){document.getElementById('tabBtnProperties').classList.add('active');initMapIfNeeded();if(kakaoMap)setTimeout(()=>kakaoMap.relayout(),50);}
  else document.getElementById('tabBtnPolicy').classList.add('active');
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
function setRentTypeFilter(btn){document.querySelectorAll('#rentTypeChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rentTypeFilterVal=btn.dataset.val;rentPage=1;update();}
function setRentVerdictFilter(btn){document.querySelectorAll('#rentVerdictChips .filter-chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');rentVerdictFilterVal=btn.dataset.val;rentPage=1;update();}
function setView(v){currentView=v;document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));update();}
function onBuyFilterChange(){currentPage=1;update();}
function onRentFilterChange(){rentPage=1;update();}
function highlightSelects(){
  document.querySelectorAll('.filter-bar .filter-select').forEach(s=>{s.classList.toggle('active',s.selectedIndex>0);});
  const buyActive=['regionFilter','areaFilter','buyVerdictSelect','buyBuiltYearFilter','buyCommuteFilter'].some(id=>{const el=document.getElementById(id);return el&&el.selectedIndex>0;})||document.getElementById('searchInput').value!=='';
  const rentActive=['rentRegionFilter','rentAreaFilter','rentVerdictSelect','rentTypeSelect','rentBuiltYearFilter','rentCommuteFilter'].some(id=>{const el=document.getElementById(id);return el&&el.selectedIndex>0;})||document.getElementById('rentSearchInput').value!=='';
  const bb=document.getElementById('buyResetBtn'),rb=document.getElementById('rentResetBtn');
  if(bb)bb.style.display=buyActive?'':'none';
  if(rb)rb.style.display=rentActive?'':'none';
}
function resetBuyFilters(){
  ['regionFilter','areaFilter','buyVerdictSelect','buyBuiltYearFilter','buyCommuteFilter','buySortSelect'].forEach(id=>{const el=document.getElementById(id);if(el)el.selectedIndex=0;});
  document.getElementById('searchInput').value='';currentPage=1;update();
}
function resetRentFilters(){
  ['rentRegionFilter','rentAreaFilter','rentVerdictSelect','rentTypeSelect','rentBuiltYearFilter','rentCommuteFilter','rentSortSelect'].forEach(id=>{const el=document.getElementById(id);if(el)el.selectedIndex=0;});
  const ac=document.getElementById('rentShowAnomaly');if(ac)ac.checked=false;
  document.getElementById('rentSearchInput').value='';rentPage=1;update();
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
  let need=false;
  if(currentMode==='buy'&&currentPage!==targetPage){currentPage=targetPage;need=true;}
  else if(currentMode!=='buy'&&rentPage!==targetPage){rentPage=targetPage;need=true;}
  if(need)update();
  setTimeout(()=>{const el=document.querySelector('[data-prop-id="'+propId+'"]');if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});highlightEl(el);},need?120:20);
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
    if(p.households)meta.push(p.households+'세대');
    const mColor=p.pMonthly>mr?'var(--red)':p.pMonthly>mr*0.85?'var(--yellow)':'var(--green)';
    const details='대출 '+fmtShort(p.pLoan)+' · 자기 '+fmtShort(p.pEquityNeeded)+' · <span style="color:'+mColor+'">월 '+p.pMonthly+'만</span>';
    const tBtn=p.trade_count>1?'<button class="expand-btn" onclick="toggleHistory(this)">▶ 거래내역 '+p.trade_count+'건</button>':'';
    let hH='';if(p.trade_count>1){const rows=p.trades.map((t,i)=>{let d='';if(i<p.trades.length-1){const df=t.price-p.trades[i+1].price;d=df>0?'<span class="trade-delta up">+'+fmtShort(df)+'</span>':df<0?'<span class="trade-delta down">'+fmtShort(df)+'</span>':'<span class="trade-delta same">±0</span>';}return '<div class="trade-row"><span class="trade-date">'+(t.date||'')+'</span><span class="trade-price">'+fmtShort(t.price)+'</span><span class="trade-floor">'+t.floor+'층</span>'+d+'</div>';}).join('');hH='<div class="trade-history"><div class="trade-history-title"><span>📊 거래 히스토리</span></div>'+rows+'</div>';}
    const card=document.createElement('div');card.className='prop-card pc-compact';card.dataset.propId=getPropId(p);
    card.addEventListener('mouseenter',()=>bounceMarker(getMarkerKey(p)));card.addEventListener('mouseleave',()=>stopBounce());
    const regBadge=p.regZone==='투기과열'?'<span class="tag tag-reg tag-reg-hot">투기과열 LTV'+p.pLTV+'%</span>':'<span class="tag tag-reg tag-reg-free">비규제 LTV'+p.pLTV+'%</span>';
    card.innerHTML='<div class="pc-line"><span class="pc-badge-sm '+bc+'">'+p.verdict+'</span><span class="pc-cname">'+p.name+'</span><span class="pc-cregion">'+p.region+'</span>'+regBadge+'</div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">매매 '+fmtShort(p.price)+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'');
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
    if(p.households)meta.push(p.households+'세대');
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
    card.innerHTML='<div class="pc-line"><span class="pc-badge-sm '+bc+'">'+p.verdict+'</span>'+anomalyBadge+jrBadge+'<span class="pc-cname">'+typeIcon+' '+p.name+'</span><span class="pc-cregion">'+p.region+'</span></div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">'+priceStr+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'');
    cg.appendChild(card);
  });
}

async function loadSettings(){
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
  update();
}
function update(){
  if(currentMode==='buy')updateBuy();else updateRent();
  updatePolicy();updatePolicyTimeline();updateStatus();updateMarriageBar();
  const sl=document.getElementById('splitLayout');
  if(sl){if(currentMode==='rent'&&(!RENT_DATA_LOADED||RENT_PROPERTIES.length===0))sl.style.display='none';else sl.style.display='';}
  if(mapInitialized)updateMapMarkers();
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
function commuteMatch(p,cv){if(!cv)return true;if(cv==='transit60')return p.commuteTransit!=null&&p.commuteTransit<=60;if(cv==='subway60')return p.commuteSubway!=null&&p.commuteSubway<=60;if(cv==='transit45')return p.commuteTransit!=null&&p.commuteTransit<=45;return true;}
function updatePropTable(eq,fL,eLTV,rate,term,mr){
  const scrollEl=document.getElementById('splitList'),savedScroll=_preserveScroll&&scrollEl?scrollEl.scrollTop:0;
  const sq=document.getElementById('searchInput').value.toLowerCase(),rv=document.getElementById('regionFilter').value,av=(document.getElementById('areaFilter')||{}).value||'',vv=(document.getElementById('buyVerdictSelect')||{}).value||'',cv=(document.getElementById('buyCommuteFilter')||{}).value||'',byv=(document.getElementById('buyBuiltYearFilter')||{}).value||'',sv=(document.getElementById('buySortSelect')||{}).value||'value';
  let f=PROPERTIES.filter(p=>{if(sq&&!(p.name+' '+p.region+' '+p.dong).toLowerCase().includes(sq))return false;if(rv&&p.region!==rv)return false;if(!areaMatch(p.area_py,av))return false;if(!builtYearMatch(p.built_year,byv))return false;if(!commuteMatch(p,cv))return false;return true;});
  const autoLtv=document.getElementById('autoLtvCheckbox')?.checked!==false;
  const wv=f.map(p=>{const reg=getRegulation(p.region);const pL=autoLtv?reg.ltv:(p.regulated?Math.min(eLTV,50):eLTV);const pLn=Math.min(Math.floor(p.price*pL/100),fL),pEq=p.price-pLn,pM=Math.floor(monthlyPayment(pLn,rate,term));let v,vt;if(pEq>eq){v='자금부족';vt='tag-danger';}else if(pM>mr){v='상환초과';vt='tag-danger';}else if(pM>mr*0.85){v='빠듯함';vt='tag-warn';}else{v='매수가능';vt='tag-ok';}return{...p,pLTV:pL,pLoan:pLn,pEquityNeeded:pEq,pMonthly:pM,verdict:v,verdictTag:vt,regZone:reg.zone};});
  let filtered=vv?wv.filter(p=>p.verdict===vv):wv;
  if(mapBoundsFilter&&mapBounds)filtered=filtered.filter(p=>inBounds(p));
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
  pi.forEach(p=>{const ex=[];if(p.built_year)ex.push(p.built_year+'년');if(p.households)ex.push(p.households+'세대');if(p.trade_count>1)ex.push(p.trade_count+'건');
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
  const rav=(document.getElementById('rentAreaFilter')||{}).value||'',rvv=(document.getElementById('rentVerdictSelect')||{}).value||'',rtv=(document.getElementById('rentTypeSelect')||{}).value||'',rbyv=(document.getElementById('rentBuiltYearFilter')||{}).value||'',rcv=(document.getElementById('rentCommuteFilter')||{}).value||'',rsv=(document.getElementById('rentSortSelect')||{}).value||'value';
  const showAnomaly=document.getElementById('rentShowAnomaly')?.checked||false;
  let anomalyHidden=0;
  let f=RENT_PROPERTIES.filter(p=>{if(!showAnomaly&&p.priceAnomaly){anomalyHidden++;return false;}if(sq&&!(p.name+' '+p.region+' '+p.dong).toLowerCase().includes(sq.toLowerCase()))return false;if(rf&&p.region!==rf)return false;if(rtv&&p.rent_type!==rtv)return false;if(!areaMatch(p.area_py,rav))return false;if(!builtYearMatch(p.built_year,rbyv))return false;if(!commuteMatch(p,rcv))return false;return true;});
  const wv=f.map(p=>{let v,vt;if(p.deposit>budget){v='예산초과';vt='tag-danger';}else if(p.deposit>budget*0.9){v='빠듯함';vt='tag-warn';}else{v='가능';vt='tag-ok';}return{...p,verdict:v,verdictTag:vt};});
  let filtered=rvv?wv.filter(p=>p.verdict===rvv):wv;
  if(mapBoundsFilter&&mapBounds)filtered=filtered.filter(p=>inBounds(p));
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
  pi.forEach(p=>{const ex=[];if(p.built_year)ex.push(p.built_year+'년');if(p.households)ex.push(p.households+'세대');if(p.trade_count>1)ex.push(p.trade_count+'건');
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
}
function updatePolicyTimeline(){
  const tl=document.getElementById('policyTimeline');
  const policies=[
    {date:'2025.10.15',level:'high',title:'10.15 주택시장 안정화 대책',impact:'서울 전역 + 경기 12곳 규제지역 지정',detail:'→ 성남·안양 LTV 40~50%, 용인 수지·경기 광주는 비규제 유지 (70%)',myImpactType:'negative',myImpactBuy:'성남·안양 매수 시 LTV 40~50% → 자기자금 비중 증가. 비규제(용인 수지·광주) 매수가 유리',myImpactRent:'전세대출에는 직접 영향 없음. 다만 규제지역 전세가 안정화 가능성'},
    {date:'2025.07',level:'high',title:'신혼부부 버팀목 소득 기준 1억 완화안 무산',impact:'가계부채 관리 강화 기조로 시행 취소',detail:'→ 7,500만원 기준 유지, 부부합산 8,740만원 초과로 자격 불가',myImpactType:'negative',myImpactBuy:'해당 없음 (매수용 아닌 전세 정책)',myImpactRent:'합산 8,740만 > 7,500만 → 신혼부부 버팀목 전세대출 이용 불가 유지'},
    {date:'2025.06.27',level:'high',title:'6.27 가계부채 관리 강화',impact:'수도권 주담대 한도 6억 제한, 생애최초 LTV 80%→70%',detail:'→ 자기자금 비중 상승, 매수가능 가격대 하향 압박',myImpactType:'negative',myImpactBuy:'주담대 한도 6억 제한은 우리 가격대(~5억)에는 영향 적음. 생애최초 LTV 하락은 불리',myImpactRent:'전세대출에는 직접 영향 없음'},
    {date:'2025.11',level:'mid',title:'기준금리 인하 3.0% → 2.75%',impact:'',detail:'→ 월 상환 부담 소폭 경감, 3.5억 기준 월 ~8만원 절감',myImpactType:'positive',myImpactBuy:'주담대 금리 하락 → 월 상환 부담 소폭 경감',myImpactRent:'전세대출 금리도 연동 하락 가능 → 월 이자 부담 감소'},
    {date:'2025.01',level:'mid',title:'신생아 특례대출 한도 상향',impact:'구입대출 한도 1.3억→2.5억, 전세 한도 변경 없음',detail:'→ 2025년 이후 출산 가구, 소득 2억 이하 맞벌이 가능',myImpactType:'positive',myImpactBuy:'출산 시 합산 8,740만 < 2억 → 자격 충족. 한도 최대 2.5억으로 대폭 상향',myImpactRent:'출산 시 전세 특례도 활용 가능 (소득 1.3억 이하, 맞벌이 2억)'}
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
document.getElementById('searchInput').addEventListener('input',()=>{currentPage=1;update();});
document.getElementById('regionFilter').addEventListener('change',()=>{currentPage=1;update();});
const rsi=document.getElementById('rentSearchInput');if(rsi)rsi.addEventListener('input',()=>{rentPage=1;update();});
const rrf=document.getElementById('rentRegionFilter');if(rrf)rrf.addEventListener('change',()=>{rentPage=1;update();});

// ─── 카카오맵 ───
let kakaoMap=null,mapMarkers=[],mapInfoWindow=null,mapFilterVal='',mapInitialized=false,geocodingDone=false,mapBoundsFilter=true,mapBounds=null,mapFullscreen=false,mapIdleTimer=null,_preserveScroll=false;
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
  content.innerHTML='<div class="pc-compact"><div class="pc-line"><span class="pc-badge-sm '+bc+'">'+p.verdict+'</span>'+fsAnomaly+fsJr+'<span class="pc-cname">'+p.name+'</span><span class="pc-cregion">'+p.region+'</span>'+regBadge+'</div><div class="pc-line"><span class="pc-cmeta">'+meta.join(' · ')+'</span></div><div class="pc-line"><span class="pc-cprice">'+priceStr+'</span><span class="pc-cdetails">'+details+'</span></div><div class="pc-cfoot"><span>'+tBtn+'</span>'+commuteHtml(p)+'<div class="pc-links">'+makeLinks(p)+'</div></div>'+(hH?'<div class="pc-history">'+hH+'</div>':'')+'</div>';
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
function toggleMapBounds(on){mapBoundsFilter=on;if(on&&kakaoMap){mapBounds=kakaoMap.getBounds();}else{mapBounds=null;}currentPage=1;rentPage=1;update();}
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
function getMarkerSVG(color){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="'+color+'"/><circle cx="12" cy="11" r="5" fill="white" opacity="0.9"/></svg>');}
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
    const color=MARKER_COLORS[verdict];
    const img=new kakao.maps.MarkerImage(getMarkerSVG(color),new kakao.maps.Size(24,32));
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
  const extra=[];if(p.built_year)extra.push(p.built_year+'년');if(p.households)extra.push(p.households+'세대');
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
loadSettings().then(()=>loadData().then(()=>{
  initMapIfNeeded();
}));
