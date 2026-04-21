# 대시보드 4개 구 필터 + 지도 초기 위치 중계동 블록 이동

## 배경
중계동 매수 확정. 대시보드에는 여전히 과거 강남·서초 등 9개 구 데이터가 표시됨.
data.json은 보존하고 app.js의 프론트엔드에서만 필터링.
추가로 지도 초기 좌표를 현재 37.38,127.08(용인)에서 중계동 블록으로 이동.

## 작업 대상 파일
app.js 하나만 수정. 다른 파일은 건드리지 말 것.
index.html, style.css, data.json, settings.json 등 일체 건드리지 말 것.

## 작업 1: WATCHLIST_DISTRICTS 상수 추가 + 데이터 필터링

### 1-A. 상수 추가

app.js 상단(기존 REGULATION_MAP 근처)에 아래 상수를 추가:

```javascript
// 관심 지역(Watchlist) — 이 지역만 대시보드에 표시. data.json은 보존됨.
const WATCHLIST_DISTRICTS = ['노원구', '도봉구', '강북구', '중랑구'];
```

"서울 " 접두사 없이 구 이름만 담음. sgg_name이 "서울 노원구" 또는 "노원구" 형태 
어느 쪽이든 includes로 매칭되도록 하기 위함.

### 1-B. 데이터 로드 지점 파악 후 필터 적용

app.js에서 data.json과 data-rent.json을 fetch해서 배열에 담는 부분을 찾아,
해당 배열이 렌더링/필터링 로직으로 넘어가기 직전에 아래 필터를 한 번만 적용:

```javascript
// Watchlist 필터 — 4개 구만 표시
function isInWatchlist(item) {
  const sgg = item.sgg_name || item.region || '';
  return WATCHLIST_DISTRICTS.some(d => sgg.includes(d));
}
```

그리고 매매 데이터 배열, 전월세 데이터 배열 각각에 .filter(isInWatchlist)를 
한 번씩 적용. 필터는 데이터 로드 직후 한 번만 걸고, 이후 모든 렌더링/지도/테이블
/검색/정렬/페이지네이션은 필터된 배열을 기반으로 동작하게 할 것.

### 1-C. 주의사항

- item의 지역 필드가 sgg_name인지 region인지 확인 후 적절히 처리 (위 isInWatchlist는 둘 다 커버)
- 필터 적용은 반드시 로드 직후 한 번만 (렌더링마다 거는 건 비효율)
- 기존 지역 드롭다운/검색 필터는 그대로 유지 (필터된 배열 위에서 추가로 작동)
- 플래그십 단지 시세 트렌드(Chart.js 탭)도 Watchlist에 없는 단지는 안 보이게 할 것. 
  단, 이 부분이 별도 JSON(flagship_*.json 등)에서 읽고 있으면 패스해도 됨 — 
  그 경우 Watchlist 필터는 data.json / data-rent.json 기반 화면에만 적용.

## 작업 2: 지도 초기 좌표 변경

### 2-A. 현재 상태

app.js:720 근처:
```
kakaoMap=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(37.38,127.08),level:8});
```

### 2-B. 변경

위 한 줄에서 좌표와 줌만 교체:

```javascript
kakaoMap=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(37.6504,127.0770),level:4});
```

- 위도/경도: 37.6504, 127.0770 (중계주공 5·6·7·8단지 중심)
- 줌 레벨: 4 (중계 4단지 블록이 화면에 꽉 차게)

### 2-C. 절대 건드리지 말 것

- app.js:831의 wishlistMap 초기화는 그대로 유지 (37.38, 127.08, level 8). 이건 
  관심매물 페이지이고 bounds로 자동 재조정되므로 건드릴 필요 없음.
- 다른 new kakao.maps.LatLng(...) 호출은 전부 유지 (각각 마커/중심이동 용도).

## 작업 3: git 확인, 커밋, 푸시

### 3-A. 변경 파일 확인

git status로 변경 파일 확인. 예상: app.js 1개.
예상 외 파일이 변경되어 있으면 작업 중단하고 상황 보고.

### 3-B. 커밋 & 푸시

```bash
git add app.js
git commit -m "feat: Watchlist 4개 구 필터 + 지도 초기 위치 중계동 블록 이동

- app.js: WATCHLIST_DISTRICTS 상수로 노원·도봉·강북·중랑만 렌더링
- app.js: 지도 초기 좌표를 중계주공 5·6·7·8단지 블록으로 이동
  (37.6504, 127.0770, 줌 레벨 4)
- data.json 등 데이터 파일은 보존 (프론트 필터만 적용)"
git push
```

## 작업 4: 검증

푸시 후 아래만 확인해서 보고:
1. git diff HEAD~1 app.js 로 변경 라인 수 확인 (대략 5~20줄 추가 예상)
2. WATCHLIST_DISTRICTS 상수가 추가됐는지 grep으로 확인
3. 지도 초기 LatLng이 37.6504,127.0770로 바뀌었는지 확인

## 멈춤 조건 (반드시 지킬 것)

- data.json, data-rent.json 로드하는 정확한 지점을 못 찾으면 작업 중단하고 
  현재 로드 패턴을 보고
- item의 지역 필드가 sgg_name/region 둘 다 아니면 중단하고 실제 필드명 보고
- 필터 적용 지점이 여러 군데라 어디에 걸어야 할지 애매하면 중단하고 옵션 제시
- 예상 외 파일이 변경되어 커밋 분리 필요할 때 중단
- git 충돌이나 push 에러

그 외에는 확인 없이 끝까지 진행.

## 보고 내용

- 커밋 해시 (짧은 형식)
- 푸시 결과
- 변경된 app.js 줄 수 (추가/삭제)
- 필터가 걸린 지점(함수명 또는 라인 번호)
- 다르게 처리한 부분 있으면 이유
