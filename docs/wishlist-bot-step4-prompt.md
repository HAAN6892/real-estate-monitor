# Claude Code 프롬프트 — 위시리스트 봇 Step 4: 대시보드 관심 매물 탭 추가

## 현재 상태

### Step 1~3 완료
- `naver_parser.py` — 네이버부동산 API 파싱 모듈
- `wishlist_bot.py` — 텔레그램 봇 (polling, URL 감지→파싱→저장→카드 회신)
- `wishlist.json` — 관심 매물 데이터 (봇이 자동 생성/관리)

### 대시보드 현재 구조
- **배포**: https://haan6892.github.io/real-estate-monitor/
- **파일**: `index.html` (단일 파일, 모든 HTML+CSS+JS 포함)
- **모드**: 매수(파랑) / 전세(초록) 토글
- **레이아웃**: 지도(58%) + 카드 리스트(42%) 좌우 분할
- **탭**: 매물 시뮬레이션 / 정책·대출
- **지도**: 카카오맵, 핀 색상 (가능/빡빡함/예산초과), 양방향 연동
- **기존 북마크**: ⭐ localStorage 북마크 기능 이미 있음

## Step 4 작업 목표

대시보드에 **"📌 관심 매물"** 탭을 추가해서, 텔레그램 봇으로 수집한 `wishlist.json`을 지도+카드로 확인할 수 있게 만들어줘.

## 수정할 파일

### `index.html` 수정

⚠️ **먼저 현재 `index.html`의 전체 구조를 파악**해줘:
```bash
cat index.html | head -100    # 상단 구조 파악
grep -n "탭\|tab\|Tab" index.html    # 탭 관련 코드 위치
grep -n "switchMode\|switchTab" index.html    # 탭 전환 함수 위치
grep -n "bookmark\|⭐\|wishlist" index.html    # 기존 북마크 코드 확인
```

#### 1. 탭 메뉴에 "📌 관심 매물" 추가

기존 탭 구조 옆에 새 탭 버튼 추가:

```
[매물 시뮬레이션] [정책·대출] [📌 관심 매물 (N건)]
```

- `N건`은 wishlist.json의 items 수를 동적으로 표시
- 탭 활성화 시 기존 두 탭의 콘텐츠 숨기고, 관심 매물 영역 표시
- 탭 색상: 골드/오렌지 계열 (#f59e0b 또는 #d97706)로 차별화

#### 2. 관심 매물 탭 — 카드 리스트 영역

기존 매물 카드와 동일한 좌우 분할 레이아웃 유지:
- **좌측 58%**: 카카오맵 (관심 매물 핀만 표시)
- **우측 42%**: 관심 매물 카드 리스트

카드 디자인:

```html
<div class="wishlist-card" data-id="{id}">
  <div class="wishlist-card-header">
    <span class="wishlist-id">#{id}</span>
    <span class="wishlist-name">{단지명}</span>
    <span class="wishlist-region">{지역}</span>
  </div>
  <div class="wishlist-card-body">
    <div class="wishlist-price">
      <span class="trade-type">{매매/전세}</span>
      <span class="price">{가격}</span>
    </div>
    <div class="wishlist-details">
      <span>전용 {면적}㎡({평}평)</span>
      <span>{층}층</span>
      <span>{준공년도}년 | {세대수}세대</span>
    </div>
  </div>
  <div class="wishlist-card-footer">
    <span class="added-by">👤 {등록자}</span>
    <span class="added-at">{등록일}</span>
    <a href="{url}" target="_blank" class="naver-link">📎 네이버부동산</a>
  </div>
  <div class="wishlist-memo">
    <textarea placeholder="메모...">{memo}</textarea>
  </div>
</div>
```

파싱 실패 매물 (name이 "(파싱 전)")은 간소화된 카드로 표시:

```html
<div class="wishlist-card wishlist-card--unparsed">
  <span>#{id} (파싱 전)</span>
  <a href="{url}" target="_blank">📎 링크 열기</a>
  <span class="added-by">👤 {등록자} | {등록일}</span>
</div>
```

#### 3. 관심 매물 탭 — 지도 핀

관심 매물 전용 마커:
- **색상**: 골드(#f59e0b) 또는 오렌지 — 기존 매물 핀(파랑/초록/빨강)과 구분
- **모양**: 별(⭐) 모양 또는 하트(💛) → 카카오맵 커스텀 마커 이미지 또는 SVG 마커
- 좌표(lat, lng)가 0인 매물은 지도에 표시하지 않음

카카오맵 커스텀 마커 구현:

```javascript
// SVG 데이터 URI로 골드 마커 생성
const wishlistMarkerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="#f59e0b"/>
  <text x="14" y="18" text-anchor="middle" fill="white" font-size="14">⭐</text>
</svg>`;

const wishlistMarkerImage = new kakao.maps.MarkerImage(
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(wishlistMarkerSvg),
  new kakao.maps.Size(28, 36),
  { offset: new kakao.maps.Point(14, 36) }
);
```

마커 클릭 시: 우측 카드에 해당 매물 하이라이트 + 스크롤 (기존 양방향 연동 패턴 동일)

#### 4. wishlist.json 로딩

```javascript
let wishlistData = { items: [] };

async function loadWishlist() {
  try {
    const res = await fetch('wishlist.json?' + Date.now()); // 캐시 방지
    if (res.ok) {
      wishlistData = await res.json();
    }
  } catch (e) {
    console.log('wishlist.json 로드 실패 (아직 생성 안 됨)');
    wishlistData = { items: [] };
  }
  updateWishlistTab();
}
```

⚠️ `wishlist.json`이 아직 없을 수 있음 (봇 실행 전). fetch 실패 시 빈 배열로 처리.

#### 5. 탭 전환 로직

기존 `switchTab()` 함수에 관심 매물 탭 분기 추가:

```javascript
function switchTab(tabName) {
  // 기존 탭 처리...

  if (tabName === 'wishlist') {
    // 기존 매물 시뮬레이션/정책 컨텐츠 숨김
    // 관심 매물 영역 표시
    // 지도 핀을 관심 매물 전용으로 교체
    renderWishlistMap();
    renderWishlistCards();
  } else {
    // 관심 매물 영역 숨김
    // 기존 매물 핀 복원
  }
}
```

**핵심**: 관심 매물 탭 진입 시 지도 마커를 **관심 매물 핀으로 교체**하고, 다른 탭으로 돌아가면 **기존 매물 핀 복원**. 기존 마커 배열을 보존했다가 복원하는 방식.

#### 6. 카드 정렬

기본: 등록일 최신순 (added_at desc)
추가 정렬 옵션 (드롭다운):
- 등록일순 (최신/오래된순)
- 가격순 (높은/낮은순)
- 등록자별

#### 7. 관심 매물 요약 (상단)

탭 전환 시 상단에 간단 요약:

```
📌 관심 매물 {N}건 | 매매 {X}건 · 전세 {Y}건 | 최근 등록: {날짜}
```

#### 8. CSS 스타일링

관심 매물 탭 전용 색상 테마 (골드/오렌지):
- 탭 활성: `#f59e0b` 배경
- 카드 테두리: `#fbbf24` (밝은 골드)
- 카드 hover: `#fffbeb` 배경
- 파싱 전 카드: `#f3f4f6` 배경 (회색)

```css
.wishlist-card {
  border: 1px solid #fbbf24;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  background: white;
  transition: background 0.2s;
}
.wishlist-card:hover { background: #fffbeb; }
.wishlist-card--unparsed {
  background: #f9fafb;
  border-color: #e5e7eb;
}
.wishlist-card-header .wishlist-id {
  font-weight: bold;
  color: #d97706;
}
.wishlist-card .trade-type {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}
.wishlist-card .trade-type.매매 { background: #dbeafe; color: #1d4ed8; }
.wishlist-card .trade-type.전세 { background: #d1fae5; color: #065f46; }
```

## wishlist.json → GitHub Pages 배포

봇이 로컬에서 `wishlist.json`을 생성/수정하므로, 대시보드에서 접근하려면 GitHub에 push 해야 해.

### `/push` 명령어를 wishlist_bot.py에 추가

```python
import subprocess

def git_push_wishlist() -> bool:
    """wishlist.json을 GitHub에 push."""
    try:
        subprocess.run(["git", "add", "wishlist.json"], check=True, cwd=REPO_DIR)
        subprocess.run(["git", "commit", "-m", "update: wishlist"], check=True, cwd=REPO_DIR)
        subprocess.run(["git", "push"], check=True, cwd=REPO_DIR)
        logger.info("wishlist.json pushed to GitHub")
        return True
    except subprocess.CalledProcessError as e:
        logger.warning(f"git push 실패: {e}")
        return False

async def cmd_push(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """wishlist.json을 GitHub에 push → 대시보드 반영."""
    await update.message.reply_text("⏳ GitHub에 업로드 중...")
    success = git_push_wishlist()
    if success:
        await update.message.reply_text(
            "✅ 대시보드에 반영 완료!\n"
            "🔗 https://haan6892.github.io/real-estate-monitor/"
        )
    else:
        await update.message.reply_text("❌ push 실패. 수동으로 push 해주세요.")
```

⚠️ `REPO_DIR`은 `wishlist_bot.py`가 실행되는 디렉토리의 git 레포 루트. 봇 파일이 레포 루트에 있으면 `cwd` 생략 가능.

핸들러 등록: `app.add_handler(CommandHandler("push", cmd_push))`
`/help` 메시지에도 `/push` 설명 추가.

## 테스트

### 1. 테스트용 wishlist.json 생성

```bash
cat > wishlist.json << 'EOF'
{
  "updated_at": "2026-02-22T12:00:00",
  "items": [
    {
      "id": 1, "article_id": "12345", "complex_no": "152005",
      "name": "기흥역파크푸르지오", "region": "경기 용인 기흥구", "dong": "구갈동",
      "trade_type": "매매", "price": 72000, "area_m2": 84.0, "area_pyeong": 25.4,
      "floor": "15/25", "built_year": 2018, "households": 768,
      "lat": 37.2753, "lng": 127.1160,
      "station": "", "walk_min": 0,
      "url": "https://new.land.naver.com/complexes/152005",
      "added_at": "2026-02-22T10:00:00", "added_by": "Hans",
      "memo": "기흥역 도보 5~7분"
    },
    {
      "id": 2, "article_id": "67890", "complex_no": "",
      "name": "기흥파크뷰", "region": "경기 용인 기흥구", "dong": "신갈동",
      "trade_type": "전세", "price": 33000, "area_m2": 75.0, "area_pyeong": 22.7,
      "floor": "8/20", "built_year": 2004, "households": 915,
      "lat": 37.2690, "lng": 127.1080,
      "station": "", "walk_min": 0,
      "url": "https://fin.land.naver.com/articles/67890",
      "added_at": "2026-02-22T11:00:00", "added_by": "배우자", "memo": ""
    },
    {
      "id": 3, "article_id": "", "complex_no": "",
      "name": "(파싱 전)", "region": "", "dong": "",
      "trade_type": "", "price": 0, "area_m2": 0, "area_pyeong": 0,
      "floor": "", "built_year": 0, "households": 0,
      "lat": 0, "lng": 0,
      "station": "", "walk_min": 0,
      "url": "https://fin.land.naver.com/articles/99999",
      "added_at": "2026-02-22T12:00:00", "added_by": "Hans", "memo": ""
    }
  ]
}
EOF
```

### 2. 확인 체크리스트

1. [ ] "📌 관심 매물 (3건)" 탭 표시
2. [ ] 탭 클릭 시 기존 매물 핀 → 관심 매물 골드 핀으로 교체
3. [ ] 좌표 있는 매물(#1, #2) → 지도에 핀 표시
4. [ ] 좌표 없는 매물(#3) → 지도에 표시 안 됨, 카드만 표시
5. [ ] 카드 3개: 파싱 성공 2개 (상세) + 파싱 전 1개 (간소)
6. [ ] 카드 클릭 → 지도 핀 하이라이트 (양방향 연동)
7. [ ] 네이버부동산 링크 → 새 탭 열림
8. [ ] 다른 탭 전환 시 기존 매물 핀 복원
9. [ ] wishlist.json 없을 때 → "관심 매물이 없습니다" 안내
10. [ ] 반응형: 모바일에서도 정상 표시

## 주의사항

- `index.html`이 단일 파일이므로, 적절한 위치에 코드 삽입 (CSS → style 태그 내, JS → script 태그 내)
- 기존 지도 마커 배열을 보존했다가 복원하는 로직 필요
- `wishlist.json`의 `price`는 만원 단위. 기존 `format_price()` 함수 있으면 재활용
- 기존 ⭐ 북마크(localStorage)와 📌 관심 매물(wishlist.json)은 **별개 기능** — 혼동 방지
- 카카오맵 JS API는 이미 로드되어 있음, 별도 로드 불필요

## 커밋

완료되면 커밋 메시지: `feat: 대시보드 관심 매물 탭 추가`
