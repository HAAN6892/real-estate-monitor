# Claude Code 프롬프트 — 위시리스트 봇 Step 2: 텔레그램 봇 기본 뼈대

## 현재 상태 (Step 1 완료)

- `api/naver_parser.py` — 네이버부동산 URL 파싱 모듈 완성
  - URL 패턴 4가지 감지 (new.land, fin.land, m.land+complex, m.land)
  - m.land API로 complexNo 기반 매물 파싱 (안정적)
  - fin.land API는 보조 (429 차단 가능성)
  - `parse_price()`, `format_price()` 유틸리티 함수
- `api/test_naver_api.py` — 파싱 테스트 스크립트

## Step 2 작업 목표

텔레그램 봇의 **메시지 수신 + 명령어 처리** 기본 구조를 만들어줘.
아직 네이버 API 파싱과는 연결하지 않아도 돼 (Step 3에서 통합).
이 단계에서는 **봇이 메시지를 받고, URL을 감지하고, 명령어에 응답하는 뼈대**만 구현.

## 프로젝트 위치

레포: `HAAN6892/real-estate-monitor` (이미 클론되어 있음)

## 환경 변수

텔레그램 봇 토큰은 이미 GitHub Secrets에 `TELEGRAM_BOT_TOKEN`으로 있어.
로컬에서는 `.env` 파일이나 환경변수로 설정.

```bash
# .env (gitignore에 이미 포함되어 있을 거야)
TELEGRAM_BOT_TOKEN=기존_봇_토큰
TELEGRAM_CHAT_ID=기존_채팅_ID
```

## 만들 파일

### 1. `wishlist_bot.py` (신규 — 프로젝트 루트)

python-telegram-bot 라이브러리 (v20+, async 버전) 사용.
**polling 방식**으로 메시지 수신 (로컬 PC에서 실행).

#### 전체 구조

```python
import os
import json
import re
import logging
from datetime import datetime
from pathlib import Path
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

# ── 설정 ──────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
WISHLIST_PATH = Path("wishlist.json")

# ── 로깅 ──────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── URL 패턴 (Step 1에서 검증된 것들) ─────────
NAVER_PATTERNS = [
    re.compile(r'new\.land\.naver\.com/complexes/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'fin\.land\.naver\.com/articles/(\d+)'),
    re.compile(r'm\.land\.naver\.com/complex/info/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'm\.land\.naver\.com.*articleNo=(\d+)'),
]

# URL을 메시지 텍스트에서 찾는 범용 패턴
URL_PATTERN = re.compile(r'https?://\S+')
```

#### wishlist.json 관리 함수

```python
def load_wishlist() -> dict:
    """wishlist.json 로드. 없으면 빈 구조 반환."""
    if WISHLIST_PATH.exists():
        with open(WISHLIST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"updated_at": "", "items": []}

def save_wishlist(data: dict):
    """wishlist.json 저장."""
    data["updated_at"] = datetime.now().isoformat(timespec="seconds")
    with open(WISHLIST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_next_id(data: dict) -> int:
    """다음 항목 ID 반환."""
    if not data["items"]:
        return 1
    return max(item["id"] for item in data["items"]) + 1
```

#### 메시지 핸들러 — URL 감지

```python
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """일반 메시지에서 부동산 URL 감지."""
    text = update.message.text
    if not text:
        return

    # URL 추출
    urls = URL_PATTERN.findall(text)
    if not urls:
        return

    for url in urls:
        # 네이버부동산 URL인지 확인
        is_naver = any(p.search(url) for p in NAVER_PATTERNS)

        if is_naver:
            # Step 3에서 여기에 네이버 API 파싱 로직 연결
            # 지금은 URL만 저장하는 스텁
            await register_stub(update, url)
        elif "asil.kr" in url or "land" in url:
            # 네이버 외 부동산 URL → 링크만 저장
            await register_stub(update, url)
        # 부동산 URL이 아니면 무시


async def register_stub(update: Update, url: str):
    """파싱 없이 URL만 등록하는 임시 함수 (Step 3에서 교체 예정)."""
    wishlist = load_wishlist()
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
        "added_by": update.effective_user.first_name or "Unknown",
        "memo": "",
    }

    wishlist["items"].append(item)
    save_wishlist(wishlist)

    count = len(wishlist["items"])
    reply = (
        f"📌 관심 매물 등록! (#{new_id})\n\n"
        f"📎 {url}\n\n"
        f"⏳ 상세 정보는 Step 3에서 자동 파싱 예정\n"
        f"현재 관심 매물: {count}건"
    )
    await update.message.reply_text(reply)
```

#### 명령어 핸들러

```python
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """봇 시작 안내."""
    text = (
        "🏠 관심 매물 봇에 오신 것을 환영합니다!\n\n"
        "네이버부동산 링크를 보내시면 자동으로 매물 정보를 수집합니다.\n\n"
        "📋 명령어:\n"
        "/list — 관심 매물 목록\n"
        "/delete [번호] — 매물 삭제\n"
        "/clear — 전체 초기화\n"
        "/help — 도움말"
    )
    await update.message.reply_text(text)


async def cmd_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """관심 매물 전체 리스트 (가격 높은 순)."""
    wishlist = load_wishlist()
    items = wishlist["items"]

    if not items:
        await update.message.reply_text("📋 등록된 관심 매물이 없습니다.")
        return

    # 가격 높은 순 정렬 (가격 0인 건 뒤로)
    sorted_items = sorted(items, key=lambda x: x.get("price", 0), reverse=True)

    lines = [f"📋 관심 매물 목록 ({len(items)}건)\n"]
    for item in sorted_items:
        name = item.get("name", "(파싱 전)")
        price = item.get("price", 0)
        trade = item.get("trade_type", "")
        area = item.get("area_pyeong", 0)

        if price > 0:
            # format_price는 Step 3에서 naver_parser에서 import
            억 = price // 10000
            만 = price % 10000
            price_str = f"{억}억" if 만 == 0 else f"{억}억 {만:,}만" if 억 > 0 else f"{만:,}만"
        else:
            price_str = "가격 미확인"

        if area > 0:
            area_str = f" | {area}평"
        else:
            area_str = ""

        line = f"  #{item['id']} {name} — {trade} {price_str}{area_str}"
        lines.append(line)

    lines.append(f"\n삭제: /delete [번호]")
    await update.message.reply_text("\n".join(lines))


async def cmd_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """특정 매물 삭제."""
    if not context.args:
        await update.message.reply_text("사용법: /delete [번호]\n예: /delete 3")
        return

    try:
        target_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("번호를 숫자로 입력해주세요.\n예: /delete 3")
        return

    wishlist = load_wishlist()
    original_count = len(wishlist["items"])
    wishlist["items"] = [item for item in wishlist["items"] if item["id"] != target_id]

    if len(wishlist["items"]) == original_count:
        await update.message.reply_text(f"❌ #{target_id} 매물을 찾을 수 없습니다.")
        return

    save_wishlist(wishlist)
    await update.message.reply_text(
        f"🗑️ #{target_id} 매물 삭제 완료!\n"
        f"남은 관심 매물: {len(wishlist['items'])}건"
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """전체 초기화 (확인 절차 포함)."""
    wishlist = load_wishlist()
    count = len(wishlist["items"])

    if count == 0:
        await update.message.reply_text("📋 이미 비어있습니다.")
        return

    # 간단한 확인: /clear confirm 으로 실행
    if context.args and context.args[0] == "confirm":
        wishlist["items"] = []
        save_wishlist(wishlist)
        await update.message.reply_text(f"🗑️ 관심 매물 {count}건 전체 삭제 완료!")
    else:
        await update.message.reply_text(
            f"⚠️ 관심 매물 {count}건을 모두 삭제하시겠습니까?\n\n"
            f"확인하려면: /clear confirm"
        )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """도움말."""
    text = (
        "🏠 관심 매물 봇 사용법\n\n"
        "📌 매물 등록:\n"
        "  네이버부동산 링크를 채팅에 보내면 자동 등록됩니다.\n"
        "  (new.land / fin.land / m.land 모두 지원)\n\n"
        "📋 명령어:\n"
        "/list — 관심 매물 목록 (가격순)\n"
        "/delete [번호] — 특정 매물 삭제\n"
        "/clear — 전체 초기화\n"
        "/help — 이 도움말\n\n"
        "💡 팁:\n"
        "  네이버부동산 앱에서 '공유' → 이 채팅방에 보내기"
    )
    await update.message.reply_text(text)
```

#### 메인 실행부

```python
def main():
    """봇 실행."""
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다.")
        logger.info("설정 방법: export TELEGRAM_BOT_TOKEN=your_token_here")
        return

    app = Application.builder().token(BOT_TOKEN).build()

    # 명령어 핸들러
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("list", cmd_list))
    app.add_handler(CommandHandler("delete", cmd_delete))
    app.add_handler(CommandHandler("clear", cmd_clear))
    app.add_handler(CommandHandler("help", cmd_help))

    # 일반 메시지 핸들러 (URL 감지)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("🏠 관심 매물 봇 시작! (polling 모드)")
    logger.info("Ctrl+C로 종료")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
```

### 2. `.env.example` (신규)

```bash
# 텔레그램 봇 설정 (기존 알림 봇과 동일한 토큰 사용)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

**주의**: `.env`는 gitignore에 있는지 확인하고, 없으면 추가해줘.

### 3. `requirements.txt` 업데이트

기존 파일에 아래 패키지 추가 (이미 있으면 스킵):

```
python-telegram-bot>=20.0
python-dotenv>=1.0.0
```

## 테스트 방법

### 로컬 테스트

```bash
# 1. 환경변수 설정
export TELEGRAM_BOT_TOKEN=실제_토큰
export TELEGRAM_CHAT_ID=실제_채팅ID

# 2. 의존성 설치
pip install python-telegram-bot python-dotenv

# 3. 봇 실행
python wishlist_bot.py

# 4. 텔레그램에서 테스트
#    - 봇에 /start 보내기
#    - 아무 네이버부동산 링크 보내기
#    - /list 로 목록 확인
#    - /delete 1 로 삭제
#    - /help 로 도움말 확인
```

### 확인할 것

1. `/start` → 안내 메시지 정상 출력
2. 네이버부동산 링크 전송 → "📌 관심 매물 등록!" 응답
3. `/list` → 등록된 매물 목록 출력
4. `/delete 1` → 삭제 성공 메시지
5. `/clear confirm` → 전체 삭제
6. `wishlist.json` 파일 생성·수정 확인
7. 네이버부동산 외 링크 → 반응 없음 (무시)

## 주의사항

- 기존 `monitor.py` 등의 텔레그램 **발신 전용** 코드에는 영향 없어야 해. `wishlist_bot.py`는 완전 독립 스크립트.
- 같은 봇 토큰을 사용하므로, **기존 GitHub Actions의 텔레그램 알림(send_message)과 충돌 없는지** 확인.
  - polling 모드로 실행하면 webhook과 충돌할 수 있으니, 기존이 webhook이면 주의 필요.
  - 기존이 단순 send_message API 호출이면 충돌 없음 → 현재 구조가 이거일 거야.
- `wishlist.json`에 한글이 포함되므로 `ensure_ascii=False` 필수.
- dotenv 로드: 파일 상단에 `from dotenv import load_dotenv; load_dotenv()` 추가해줘.

## 커밋

완료되면 커밋 메시지: `feat: 텔레그램 관심 매물 봇 기본 구조`
