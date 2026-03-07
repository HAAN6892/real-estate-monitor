# Claude Code 통합 작업 프롬프트 — 2026.02.20

## 작업 순서
1. 지역별 LTV 자동 적용 (대시보드)
2. 모니터링 지역 확대 (배치 + 대시보드)
3. 기존 이슈 수정 (좌표 오류 + 지도 전체화면)
4. 파일 분리 리팩토링 (토큰 최적화)

**순서 중요**: 1→2→3 모두 끝낸 뒤 4(파일 분리) 진행. 기능 변경이 다 끝난 뒤 분리해야 충돌 없음.

---

## 작업 1: 지역별 LTV 자동 적용

### 배경
현재 settings.json의 LTV가 70% 하나로 고정되어 모든 매물에 동일 적용됨.
실제로는 투기과열지구/비규제지역에 따라 LTV가 다름.

### 2025년 10.15 대책 기준 규제 등급

**투기과열지구 (LTV 40%) — 서울 전역 + 경기 12곳:**
- 서울 25개구 전역 (강남, 서초, 송파, 강동, 동작, 관악, 금천, 성북, 강서, 노원, 도봉, 영등포, 구로, 용산 등)
- 경기 과천시
- 경기 광명시
- 경기 성남시 (수정구, 중원구, 분당구)
- 경기 수원시 (영통구, 장안구, 팔달구)
- 경기 안양시 동안구
- 경기 용인시 수지구
- 경기 의왕시
- 경기 하남시

**비규제지역 (LTV 70%):**
- 경기 안양시 만안구
- 경기 용인시 기흥구
- 경기 광주시
- 경기 구리시
- 경기 군포시
- 경기 부천시
- 경기 고양시 (일산동구 포함)
- 수원 권선구 (10.15 대책에서 팔달·영통·장안만 지정, 권선은 비규제)
- 인천 서구
- 인천 남동구

### 구현

#### 1-1. REGULATION_MAP 추가

index.html 상단에 규제 매핑 객체 추가. **서울은 전역 투기과열이므로 기본값을 서울=투기과열로 처리하면 효율적.**

```javascript
const REGULATION_MAP = {
  // === 투기과열지구 (LTV 40%) ===
  // 서울 전역
  '서울 강남구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 서초구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 송파구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 강동구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 동작구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 관악구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 금천구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 성북구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 강서구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 노원구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 도봉구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 영등포구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '서울 구로구': { zone: '투기과열', ltv: 40, dsr: 40 },
  // 경기 투기과열
  '경기 과천시': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 광명시': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 성남시 수정구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 성남시 중원구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 성남시 분당구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 수원시 영통구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 수원시 장안구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 수원시 팔달구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 안양시 동안구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 용인시 수지구': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 의왕시': { zone: '투기과열', ltv: 40, dsr: 40 },
  '경기 하남시': { zone: '투기과열', ltv: 40, dsr: 40 },

  // === 비규제지역 (LTV 70%) ===
  '경기 안양시 만안구': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 용인시 기흥구': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 광주시': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 구리시': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 군포시': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 부천시': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 고양시 일산동구': { zone: '비규제', ltv: 70, dsr: 40 },
  '경기 수원시 권선구': { zone: '비규제', ltv: 70, dsr: 40 },
  '인천 서구': { zone: '비규제', ltv: 70, dsr: 40 },
  '인천 남동구': { zone: '비규제', ltv: 70, dsr: 40 },
};
```

#### 1-2. getRegulation 함수

```javascript
function getRegulation(sggName) {
  if (!sggName) return { zone: '비규제', ltv: 70, dsr: 40 };
  // 정확한 매칭 우선
  for (const [key, val] of Object.entries(REGULATION_MAP)) {
    if (sggName.includes(key) || key.includes(sggName)) return val;
  }
  // 서울이면 투기과열 (전역이므로)
  if (sggName.startsWith('서울')) return { zone: '투기과열', ltv: 40, dsr: 40 };
  // 매칭 안 되면 기본값
  return { zone: '비규제', ltv: 70, dsr: 40 };
}
```

#### 1-3. 시뮬레이션 계산 수정

기존: `settings.ltv` 하나로 계산
변경: 각 매물의 `sgg_name`으로 REGULATION_MAP 조회 → 해당 LTV 사용

```javascript
// AS-IS
const ltvRate = settings.ltv / 100;

// TO-BE  
const autoLtv = document.getElementById('autoLtvCheckbox')?.checked !== false;
const reg = getRegulation(item.sgg_name);
const ltvRate = autoLtv ? reg.ltv / 100 : settings.ltv / 100;
```

#### 1-4. 카드/테이블에 규제 배지 표시

카드에 규제 배지 추가:
- 투기과열: 🔴 빨간 배지 "투기과열 LTV40%"
- 비규제: 🟢 초록 배지 "비규제 LTV70%"

카드 단지명 줄 또는 태그 영역에 작은 배지로 표시.
테이블에도 규제 컬럼 추가 (또는 지역 컬럼에 병합).

#### 1-5. settings 패널 LTV 슬라이더

LTV 슬라이더는 유지하되:
- 체크박스: "☑ 지역별 LTV 자동 적용" (기본 ON)
- ON이면 슬라이더 비활성(disabled) + "지역별 자동 적용 중" 안내
- OFF이면 슬라이더 값 일괄 적용 (기존 동작)

#### 1-6. 전세 모드에서는 LTV 미적용

전세 모드에서는 LTV 개념 없으므로 매수 모드에서만 적용.

### 커밋 메시지
```
feat: 지역별 규제등급 자동 적용 (투기과열 LTV40% / 비규제 LTV70%)
```

---

## 작업 2: 모니터링 지역 확대

### 배경
강남역 기준 대중교통 1시간 10분 이내 출퇴근 가능 지역으로 범위 확대.
리포트에서 언급된 재건축 유망 단지 포함.

### 현재 regions (22개)

```
서울: 강남구, 서초구, 송파구, 강동구, 동작구, 관악구
경기: 과천, 광명, 안양 만안구, 안양 동안구, 군포, 의왕, 성남 수정구, 성남 중원구, 성남 분당구, 하남, 구리, 수지구, 기흥구, 광주, 수원 영통구, 수원 장안구
```

### 추가할 지역 (12개)

| 지역 | code | sgg_name | 강남역 소요 | 비고 |
|------|------|----------|------------|------|
| 서울 금천구 | 11545 | 서울 금천구 | ~40분 | 럭키 재건축, 신안산선 |
| 서울 성북구 | 11290 | 서울 성북구 | ~35분 | 정릉풍림 |
| 서울 강서구 | 11500 | 서울 강서구 | ~40분 | 등촌주공8, 9호선 |
| 서울 노원구 | 11350 | 서울 노원구 | ~50분 | 상계·중계 재건축 |
| 서울 도봉구 | 11320 | 서울 도봉구 | ~55분 | 창동주공3, GTX-C |
| 서울 영등포구 | 11560 | 서울 영등포구 | ~30분 | 2호선·9호선 |
| 서울 구로구 | 11530 | 서울 구로구 | ~35분 | 2호선·7호선 |
| 수원 권선구 | 41113 | 경기 수원시 권선구 | ~60분 | 신분당선 연장, 비규제 |
| 경기 부천시 | 41190 | 경기 부천시 | ~55분 | 은하마을 재건축 |
| 경기 고양 일산동구 | 41285 | 경기 고양시 일산동구 | ~65분 | 강촌라이프 재건축 |
| 인천 서구 | 28260 | 인천 서구 | ~65분 | 검단신도시 |
| 인천 남동구 | 28200 | 인천 남동구 | ~60분 | 간석, GTX-B |

### 수정할 파일: `.github/workflows/monitor.yml`

config.json 생성 부분의 regions 배열에 12개 지역 추가:

```json
{"name": "서울 금천구", "code": "11545", "sgg_name": "서울 금천구"},
{"name": "서울 성북구", "code": "11290", "sgg_name": "서울 성북구"},
{"name": "서울 강서구", "code": "11500", "sgg_name": "서울 강서구"},
{"name": "서울 노원구", "code": "11350", "sgg_name": "서울 노원구"},
{"name": "서울 도봉구", "code": "11320", "sgg_name": "서울 도봉구"},
{"name": "서울 영등포구", "code": "11560", "sgg_name": "서울 영등포구"},
{"name": "서울 구로구", "code": "11530", "sgg_name": "서울 구로구"},
{"name": "수원 권선구", "code": "41113", "sgg_name": "경기 수원시 권선구"},
{"name": "경기 부천시", "code": "41190", "sgg_name": "경기 부천시"},
{"name": "고양 일산동구", "code": "41285", "sgg_name": "경기 고양시 일산동구"},
{"name": "인천 서구", "code": "28260", "sgg_name": "인천 서구"},
{"name": "인천 남동구", "code": "28200", "sgg_name": "인천 남동구"}
```

### 대시보드 필터 업데이트

index.html의 지역 필터 드롭다운에 새 지역들 자동 반영되는지 확인.
만약 하드코딩된 부분이 있으면 추가.

### REGULATION_MAP 업데이트

작업 1에서 이미 새 지역들의 규제등급이 포함되어 있으므로 추가 작업 없음.
다만 data.json에 새 지역 매물이 들어오면 sgg_name 매칭이 정상 작동하는지 확인.

### 커밋 메시지
```
feat: 모니터링 지역 확대 (22개 → 34개, 강남역 70분 이내)
```

---

## 작업 3: 기존 이슈 수정

### 3-1. 건영2 좌표 오류 수정

**문제**: 서울 관악구 신림동 건영2 아파트의 좌표가 coord_cache.json에서 잘못 매핑됨 (금천구 쪽에 핀이 찍힘).

**수정 방법**:
1. coord_cache.json에서 "건영2" 또는 "서울 관악구 신림동 건영2" 키 찾기
2. 올바른 좌표로 수정

**올바른 위치**: 서울 관악구 신림동 1703 (서울대입구역 남서쪽)
- 대략 lat: 37.4778, lon: 126.9292 (실제 주소로 카카오맵 지오코딩 재실행 권장)

**방법**: coord_cache.json에서 해당 키 찾아서:
- 값이 있으면 올바른 좌표로 수정
- 또는 해당 항목 삭제 → 다음 배치에서 카카오맵 API가 자동으로 올바른 좌표 생성

삭제 후 재생성이 더 안전. 캐시에서 해당 항목만 제거하면 됨.

```bash
# coord_cache.json에서 건영2 항목 확인
grep -n "건영2" coord_cache.json
# 해당 줄 주변 확인 후 잘못된 좌표 항목 제거
```

### 3-2. 지도 전체화면 토글

**목표**: PC에서 지도를 전체화면으로 크게 볼 수 있는 버튼.

**구현**:
1. 지도 컨테이너 우상단에 "⛶" (또는 🔲) 전체화면 버튼 추가
2. 클릭 시:
   - 지도 컨테이너가 viewport 전체로 확장 (position: fixed, z-index 최상위)
   - 카드 리스트 숨김
   - 상단에 "✕ 닫기" 버튼 표시
3. 다시 클릭 또는 ✕ 클릭:
   - 원래 좌우 분할 레이아웃으로 복귀
4. 전체화면에서도 핀 클릭 → 팝업 정보 표시 정상 동작
5. ESC 키로도 전체화면 해제

```css
.map-fullscreen {
  position: fixed !important;
  top: 0;
  left: 0;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 9999;
}
```

```javascript
function toggleMapFullscreen() {
  const mapContainer = document.getElementById('mapContainer'); // 실제 ID 확인 필요
  mapContainer.classList.toggle('map-fullscreen');
  // 카카오맵 relayout() 호출 필요 (크기 변경 후)
  if (map) map.relayout();
}
```

### 커밋 메시지
```
fix: 건영2 좌표 오류 수정 + feat: 지도 전체화면 토글
```

---

## 작업 4: 파일 분리 리팩토링

### 배경
현재 index.html 단일 파일이 작업 1~3 완료 후 1,800줄+ 예상.
Claude Code 토큰 절약을 위해 3파일로 분리.

### 목표
```
index.html  → HTML 구조만 (head + body, script/link 태그로 연결)
style.css   → 모든 CSS (테마 CSS 변수, 미디어쿼리, 전체화면 등)
app.js      → 모든 JavaScript (REGULATION_MAP, 시뮬레이션 로직, 지도, 이벤트 등)
```

### 주의사항
- **GitHub Pages 정적 배포**이므로 빌드 불필요. script/link 태그로 연결만 하면 됨.
- **기존 기능 절대 깨지면 안 됨** — 분리 전후 동작 동일해야 함
- CSS 변수(테마 스왑), 카카오맵 초기화, 모든 이벤트 핸들러 동작 확인 필수
- inline style이나 onclick 속성이 있다면 적절히 처리

### 분리 순서
1. `<style>` 태그 내용 전체 → `style.css`로 이동
2. `<script>` 태그 내용 전체 → `app.js`로 이동
3. index.html에 `<link rel="stylesheet" href="style.css">` 추가
4. index.html에 `<script src="app.js"></script>` 추가 (body 끝)
5. 카카오맵 SDK script 태그는 index.html에 유지 (app.js보다 먼저 로드되어야 함)
6. 동작 확인 (로컬에서 python -m http.server 등으로 테스트)

### 커밋 메시지
```
refactor: index.html → HTML + style.css + app.js 파일 분리
```

---

## 전체 작업 순서 요약

| 순서 | 작업 | 커밋 메시지 | 예상 변경 |
|:---:|------|-----------|----------|
| 1 | LTV 자동 적용 | feat: 지역별 규제등급 자동 적용 | index.html 수정 (~100줄 추가) |
| 2 | 지역 확대 | feat: 모니터링 지역 확대 (22→34개) | monitor.yml 수정 |
| 3a | 건영2 좌표 수정 | fix: 건영2 좌표 오류 수정 | coord_cache.json 수정 |
| 3b | 지도 전체화면 | feat: 지도 전체화면 토글 | index.html 수정 (~30줄) |
| 4 | 파일 분리 | refactor: 파일 분리 | index.html 축소, style.css + app.js 신규 |

각 작업 완료 후 커밋/푸시. 작업 4 이후 GitHub Pages에서 정상 동작 확인 필수.

---

## 참고 파일 경로 (레포 내)

- 대시보드: `index.html` (루트)
- 배치 설정: `.github/workflows/monitor.yml`
- 좌표 캐시: `coord_cache.json`
- 설정: `settings.json`
- 데이터: `data.json`, `data-rent.json`
