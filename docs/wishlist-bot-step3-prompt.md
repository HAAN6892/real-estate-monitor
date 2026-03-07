# Claude Code 프롬프트 — 위시리스트 봇 Step 3: 파싱 + 봇 통합

## 현재 상태

### Step 1 완료: `api/naver_parser.py`
- URL 패턴 4가지 감지 (new.land, fin.land, m.land+complex, m.land)
- **m.land API**: complexNo 기반 매물 파싱 (안정적, 주력)
- **fin.land API**: articleId 기반 파싱 (429 차단 가능, 보조)
- `parse_price()`, `format_price()` 유틸리티
- Graceful degradation: fin.land 실패 시 URL만 저장 폴백

### Step 2 완료: `wishlist_bot.py`
- polling 방식 텔레그램 봇
- URL 감지 → `register_stub()`으로 URL만 저장 (파싱 없음)
- 명령어: /start, /list, /delete, /clear, /help
- `wishlist.json` CRUD

## Step 3 작업 목표

Step 1의 `naver_parser.py`와 Step 2의 `wishlist_bot.py`를 **통합**해서:
1. 네이버부동산 링크 수신 → **자동으로 API 파싱** → 매물 상세정보 포함 등록
2. 파싱 성공 시 **상세 요약 카드** 회신
3. 파싱 실패 시 **URL만 저장** (기존 폴백 유지)
4. `/list` 출력에 파싱된 정보 반영

## 수정할 파일

### 1. `wishlist_bot.py` — 핵심 수정

#### import 추가

```python
# 기존 import에 추가
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.naver_parser import parse_naver_url, fetch_article_info, format_price
```

⚠️ `api/naver_parser.py`의 실제 함수명과 반환 구조를 먼저 확인해줘.
`cat api/naver_parser.py` 로 현재 코드를 읽고, 실제 함수 시그니처에 맞춰 import.

#### `handle_message()` 수정 — 파싱 로직 추가

기존 `register_stub()` 호출 대신 **파싱 시도 → 성공/실패 분기** 구조로 변경:

```python
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """일반 메시지에서 부동산 URL 감지 → 파싱 → 등록."""
    text = update.message.text
    if not text:
        return

    urls = URL_PATTERN.findall(text)
    if not urls:
        return

    for url in urls:
        is_naver = any(p.search(url) for p in NAVER_PATTERNS)

        if is_naver:
            # "파싱 중..." 메시지 먼저 보내기 (API 호출 시간 소요)
            processing_msg = await update.message.reply_text("⏳ 매물 정보 파싱 중...")

            try:
                # Step 1의 파싱 함수 호출
                parsed = parse_and_register(url, update.effective_user.first_name)

                if parsed and parsed.get("name") and parsed["name"] != "(파싱 전)":
                    # 파싱 성공 → 상세 카드
                    reply = format_success_card(parsed)
                else:
                    # 파싱 실패 → URL만 저장
                    parsed = register_url_only(url, update.effective_user.first_name)
                    reply = format_fallback_card(parsed)

            except Exception as e:
                logger.error(f"파싱 에러: {e}")
                parsed = register_url_only(url, update.effective_user.first_name)
                reply = format_fallback_card(parsed)

            # "파싱 중..." 메시지 삭제 후 결과 전송
            await processing_msg.delete()
            await update.message.reply_text(reply)

        elif "asil.kr" in url or "hogangnono" in url:
            # 네이버 외 부동산 URL → URL만 저장
            item = register_url_only(url, update.effective_user.first_name)
            reply = format_fallback_card(item)
            await update.message.reply_text(reply)
```

#### 새 함수: `parse_and_register()`

```python
def parse_and_register(url: str, user_name: str) -> dict:
    """URL 파싱 → wishlist.json에 저장 → 저장된 항목 반환."""
    # 1. naver_parser로 파싱 시도
    #    ⚠️ naver_parser.py의 실제 함수 구조에 맞춰 호출
    #    예: parse_naver_url(url) → article_id 추출
    #        fetch_article_info(article_id) → 매물 정보 dict
    url_info = parse_naver_url(url)
    if not url_info:
        return None

    # article_id 또는 complex_no로 API 호출
    # ⚠️ naver_parser.py의 반환 구조에 따라 키 이름이 다를 수 있음
    article_info = fetch_article_info(url_info)
    if not article_info:
        return None

    # 2. wishlist.json에 저장
    wishlist = load_wishlist()
    new_id = get_next_id(wishlist)

    # 중복 체크: 같은 URL이나 article_id가 이미 있으면 스킵
    existing_urls = {item.get("url") for item in wishlist["items"]}
    existing_articles = {item.get("article_id") for item in wishlist["items"] if item.get("article_id")}

    if url in existing_urls or (article_info.get("article_id") and article_info["article_id"] in existing_articles):
        # 이미 등록된 매물
        return {"duplicate": True, "name": article_info.get("name", "")}

    item = {
        "id": new_id,
        "article_id": article_info.get("article_id", ""),
        "complex_no": article_info.get("complex_no", ""),
        "name": article_info.get("name", "(단지명 미확인)"),
        "region": article_info.get("region", ""),
        "dong": article_info.get("dong", ""),
        "trade_type": article_info.get("trade_type", ""),
        "price": article_info.get("price", 0),
        "area_m2": article_info.get("area_m2", 0),
        "area_pyeong": article_info.get("area_pyeong", 0),
        "floor": article_info.get("floor", ""),
        "built_year": article_info.get("built_year", 0),
        "households": article_info.get("households", 0),
        "lat": article_info.get("lat", 0),
        "lng": article_info.get("lng", 0),
        "station": "",       # 향후 카카오 API 연동
        "walk_min": 0,       # 향후 카카오 API 연동
        "url": url,
        "added_at": datetime.now().isoformat(timespec="seconds"),
        "added_by": user_name or "Unknown",
        "memo": "",
    }

    wishlist["items"].append(item)
    save_wishlist(wishlist)
    return item
```

#### 새 함수: `register_url_only()`

기존 `register_stub()`을 리네이밍하고 dict 반환하도록 수정:

```python
def register_url_only(url: str, user_name: str) -> dict:
    """파싱 실패 시 URL만 저장."""
    wishlist = load_wishlist()

    # 중복 체크
    existing_urls = {item.get("url") for item in wishlist["items"]}
    if url in existing_urls:
        return {"duplicate": True, "url": url}

    new_id = get_next_id(wishlist)
    item = {
        "id": new_id,
        "article_id": "",
        "complex_no": "",
        "name": "(파싱 전)",
        "region": "",
        "dong": "",
        "trade_type": "",
        "price": 0,
        "area_m2": 0,
        "area_pyeong": 0,
        "floor": "",
        "built_year": 0,
        "households": 0,
        "lat": 0,
        "lng": 0,
        "station": "",
        "walk_min": 0,
        "url": url,
        "added_at": datetime.now().isoformat(timespec="seconds"),
        "added_by": user_name or "Unknown",
        "memo": "",
    }
    wishlist["items"].append(item)
    save_wishlist(wishlist)
    return item
```

#### 새 함수: 텔레그램 응답 포맷터

```python
def format_success_card(item: dict) -> str:
    """파싱 성공 시 상세 요약 카드."""
    if item.get("duplicate"):
        return f"⚠️ 이미 등록된 매물입니다: {item.get('name', '')}"

    name = item.get("name", "")
    region = item.get("region", "")
    trade = item.get("trade_type", "")
    price = item.get("price", 0)
    area_m2 = item.get("area_m2", 0)
    area_py = item.get("area_pyeong", 0)
    floor_info = item.get("floor", "")
    built = item.get("built_year", 0)
    households = item.get("households", 0)
    url = item.get("url", "")
    item_id = item.get("id", "?")

    # 가격 포맷
    if price > 0:
        price_str = format_price(price)
    else:
        price_str = "가격 미확인"

    # 면적 포맷
    if area_m2 > 0 and area_py > 0:
        area_str = f"전용 {area_m2}㎡({area_py:.0f}평)"
    elif area_m2 > 0:
        area_str = f"전용 {area_m2}㎡"
    else:
        area_str = ""

    # 단지 정보
    complex_info = ""
    if built > 0:
        complex_info += f"🏗️ {built}년"
    if households > 0:
        complex_info += f" | {households:,}세대"

    # 층 정보
    floor_str = f"📐 {floor_info}층" if floor_info else ""

    wishlist = load_wishlist()
    count = len(wishlist["items"])

    lines = [
        f"📌 관심 매물 등록! (#{item_id})",
        "",
        f"🏠 {name}" + (f" | {region}" if region else ""),
        f"💰 {trade} {price_str}" + (f" | {area_str}" if area_str else ""),
    ]

    if complex_info:
        lines.append(complex_info)
    if floor_str:
        lines.append(floor_str)

    lines.extend([
        f"📎 {url}",
        "",
        f"현재 관심 매물: {count}건",
    ])

    return "\n".join(lines)


def format_fallback_card(item: dict) -> str:
    """파싱 실패 시 URL만 표시."""
    if item.get("duplicate"):
        return f"⚠️ 이미 등록된 URL입니다."

    item_id = item.get("id", "?")
    url = item.get("url", "")

    wishlist = load_wishlist()
    count = len(wishlist["items"])

    return (
        f"📌 관심 매물 등록! (#{item_id})\n"
        f"(상세 정보 파싱 실패 — 링크만 저장)\n\n"
        f"📎 {url}\n\n"
        f"현재 관심 매물: {count}건"
    )
```

#### `/list` 명령어 개선

파싱된 정보가 있는 매물은 더 풍부하게 표시:

```python
async def cmd_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """관심 매물 전체 리스트."""
    wishlist = load_wishlist()
    items = wishlist["items"]

    if not items:
        await update.message.reply_text("📋 등록된 관심 매물이 없습니다.")
        return

    # 가격 높은 순 (0은 뒤로)
    sorted_items = sorted(
        items,
        key=lambda x: (x.get("price", 0) > 0, x.get("price", 0)),
        reverse=True,
    )

    lines = [f"📋 관심 매물 ({len(items)}건)\n"]

    for item in sorted_items:
        item_id = item["id"]
        name = item.get("name", "(파싱 전)")
        trade = item.get("trade_type", "")
        price = item.get("price", 0)
        area_py = item.get("area_pyeong", 0)

        if price > 0:
            price_str = format_price(price)
        else:
            price_str = "가격 미확인"

        area_str = f"{area_py:.0f}평" if area_py > 0 else ""

        parts = [f"#{item_id} {name}"]
        if trade or price > 0:
            parts.append(f"{trade} {price_str}")
        if area_str:
            parts.append(area_str)

        lines.append("  " + " — ".join(parts))

    lines.append(f"\n삭제: /delete [번호]")

    # 텔레그램 메시지 길이 제한 (4096자) 대응
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3950] + "\n\n... (더 많은 매물은 대시보드에서 확인)"

    await update.message.reply_text(text)
```

### 2. `api/naver_parser.py` — 수정 필요 여부 확인

**먼저 `cat api/naver_parser.py`로 현재 코드를 확인**하고:

1. `parse_naver_url(url)` → 반환값이 뭔지 (article_id? dict?)
2. `fetch_article_info(...)` → 인자와 반환 구조
3. `format_price(price)` → 존재 여부, 시그니처

이 세 가지를 확인한 뒤, `wishlist_bot.py`의 import와 호출 코드를 **실제 함수에 맞게** 조정해줘.

만약 `naver_parser.py`에 없는 기능이 있다면:
- `format_price()`가 없으면 `wishlist_bot.py` 내에 직접 구현
- `parse_naver_url()`의 반환값이 단순 string이면 `parse_and_register()`의 호출 방식 조정
- m.land API 호출 시 sleep이 필요하면 `asyncio.sleep()` 또는 `time.sleep()` 적용

### 3. `api/__init__.py` (필요 시 생성)

`api` 폴더를 패키지로 인식시키기 위해 빈 `__init__.py`가 없으면 생성:

```python
# api/__init__.py
```

## 테스트 시나리오

### 성공 케이스

```
# 텔레그램에 전송:
https://new.land.naver.com/complexes/152005?ms=a&articleNo=2608145454

# 기대 응답:
📌 관심 매물 등록! (#1)

🏠 래미안메가트리아 | 경기 안양 만안구
💰 매매 4억 2,800만 | 전용 39㎡(12평)
🏗️ 2019년 | 4,253세대
📎 https://new.land.naver.com/...

현재 관심 매물: 1건
```

### 실패 폴백 케이스

```
# 파싱 실패하는 URL 전송:
https://fin.land.naver.com/articles/9999999999

# 기대 응답:
📌 관심 매물 등록! (#2)
(상세 정보 파싱 실패 — 링크만 저장)

📎 https://fin.land.naver.com/articles/9999999999

현재 관심 매물: 2건
```

### 중복 등록 방지

```
# 같은 URL 다시 전송:
https://new.land.naver.com/complexes/152005?ms=a&articleNo=2608145454

# 기대 응답:
⚠️ 이미 등록된 매물입니다: 래미안메가트리아
```

### /list 파싱 정보 반영

```
/list

# 기대 응답:
📋 관심 매물 (2건)

  #1 래미안메가트리아 — 매매 4억 2,800만 — 12평
  #2 (파싱 전) — 가격 미확인

삭제: /delete [번호]
```

## 구현 순서 (권장)

1. `cat api/naver_parser.py`로 현재 파싱 함수 구조 확인
2. `api/__init__.py` 생성 (없으면)
3. `wishlist_bot.py`에 naver_parser import 추가
4. `parse_and_register()` 함수 구현 (naver_parser 실제 구조에 맞춰)
5. `register_url_only()` 리팩터링 (기존 register_stub 대체)
6. `format_success_card()`, `format_fallback_card()` 구현
7. `handle_message()` 수정 (파싱 로직 연결)
8. `cmd_list()` 개선
9. 로컬 테스트 (`python wishlist_bot.py`)
10. 실제 네이버부동산 URL로 텔레그램 테스트

## 주의사항

- **naver_parser.py의 실제 코드를 먼저 읽고** 함수 시그니처에 맞춰 통합할 것
- 네이버 API 호출에 1~2초 sleep이 포함되어 있을 거야. 텔레그램 응답이 느려질 수 있으니 "파싱 중..." 메시지를 먼저 보내는 UX 구현
- `wishlist.json`에 동시 접근 이슈는 로컬 실행이라 없을 거지만, save 시 전체 파일을 다시 쓰는 구조 유지
- 텔레그램 메시지 길이 제한 4096자 대응 필요

## 커밋

완료되면 커밋 메시지: `feat: 매물 파싱 + 봇 통합 + wishlist.json 저장`
