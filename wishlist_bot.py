"""
텔레그램 관심 매물 봇
- 네이버부동산 URL 감지 → API 파싱 → 매물 등록
- /list, /delete, /clear, /help 명령어
- wishlist.json에 누적 저장
- polling 방식 (로컬 PC에서 실행)
"""

import json
import logging
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from naver_parser import extract_article_id, format_price, parse_article

load_dotenv()

# ── 설정 ──────────────────────────────────────
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
BASE_DIR = Path(__file__).parent
WISHLIST_PATH = BASE_DIR / "wishlist.json"

# ── 로깅 ──────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── URL 패턴 ─────────────────────────────────
NAVER_PATTERNS = [
    re.compile(r'new\.land\.naver\.com/complexes/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'fin\.land\.naver\.com/articles/(\d+)'),
    re.compile(r'm\.land\.naver\.com/complex/info/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'm\.land\.naver\.com.*articleNo=(\d+)'),
]

URL_PATTERN = re.compile(r'https?://\S+')


# ── wishlist.json 관리 ────────────────────────

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


# ── 등록 함수 ─────────────────────────────────

def parse_and_register(url: str, user_name: str) -> dict:
    """URL 파싱 → wishlist.json에 저장 → 저장된 항목 반환."""
    wishlist = load_wishlist()

    # 중복 체크
    existing_urls = {item.get("url") for item in wishlist["items"]}
    if url in existing_urls:
        # URL 완전 일치로 중복 검출
        for item in wishlist["items"]:
            if item.get("url") == url:
                return {"duplicate": True, "name": item.get("name", "")}

    # URL에서 articleId, complexNo 추출
    article_id, complex_no = extract_article_id(url)
    if not article_id:
        return None

    # article_id 중복 체크
    existing_articles = {
        item.get("article_id") for item in wishlist["items"] if item.get("article_id")
    }
    if article_id in existing_articles:
        for item in wishlist["items"]:
            if item.get("article_id") == article_id:
                return {"duplicate": True, "name": item.get("name", "")}

    # 네이버 API 파싱
    article_info = parse_article(article_id, complex_no, url=url)
    if not article_info or not article_info.get("name"):
        return None

    # wishlist에 저장
    new_id = get_next_id(wishlist)
    item = {
        "id": new_id,
        "article_id": article_info.get("article_id", ""),
        "complex_no": article_info.get("complex_no", ""),
        "name": article_info.get("name", "(단지명 미확인)"),
        "region": article_info.get("region") or "",
        "dong": article_info.get("dong") or "",
        "trade_type": article_info.get("trade_type") or "",
        "price": article_info.get("price") or 0,
        "area_m2": article_info.get("area_m2") or 0,
        "area_pyeong": article_info.get("area_pyeong") or 0,
        "floor": article_info.get("floor") or "",
        "direction": article_info.get("direction") or "",
        "built_year": article_info.get("built_year") or 0,
        "households": article_info.get("households") or 0,
        "lat": article_info.get("lat") or 0,
        "lng": article_info.get("lng") or 0,
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
        "direction": "",
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


# ── 텔레그램 응답 포맷 ────────────────────────

def format_success_card(item: dict) -> str:
    """파싱 성공 시 상세 요약 카드."""
    if item.get("duplicate"):
        return f"\u26a0\ufe0f 이미 등록된 매물입니다: {item.get('name', '')}"

    name = item.get("name", "")
    region = item.get("region", "")
    trade = item.get("trade_type", "")
    price = item.get("price", 0)
    area_m2 = item.get("area_m2", 0)
    area_py = item.get("area_pyeong", 0)
    floor_info = item.get("floor", "")
    direction = item.get("direction", "")
    built = item.get("built_year", 0)
    households = item.get("households", 0)
    url = item.get("url", "")
    item_id = item.get("id", "?")

    price_str = format_price(price) if price > 0 else "가격 미확인"

    area_str = ""
    if area_m2 > 0 and area_py > 0:
        area_str = f"전용 {area_m2}\u33a1({area_py:.0f}평)"
    elif area_m2 > 0:
        area_str = f"전용 {area_m2}\u33a1"

    lines = [
        f"\U0001f4cc 관심 매물 등록! (#{item_id})",
        "",
        f"\U0001f3e0 {name}" + (f" | {region}" if region else ""),
        f"\U0001f4b0 {trade} {price_str}" + (f" | {area_str}" if area_str else ""),
    ]

    meta_parts = []
    if built > 0:
        meta_parts.append(f"{built}년")
    if households > 0:
        meta_parts.append(f"{households:,}세대")
    if meta_parts:
        lines.append(f"\U0001f3d7\ufe0f {' | '.join(meta_parts)}")

    if floor_info:
        floor_line = f"\U0001f4d0 {floor_info}층"
        if direction:
            floor_line += f" | {direction}"
        lines.append(floor_line)

    lines.append(f"\U0001f4ce {url}")
    lines.append("")

    wishlist = load_wishlist()
    lines.append(f"현재 관심 매물: {len(wishlist['items'])}건")

    return "\n".join(lines)


def format_fallback_card(item: dict) -> str:
    """파싱 실패 시 URL만 표시."""
    if item.get("duplicate"):
        return "\u26a0\ufe0f 이미 등록된 URL입니다."

    item_id = item.get("id", "?")
    url = item.get("url", "")

    wishlist = load_wishlist()
    count = len(wishlist["items"])

    return (
        f"\U0001f4cc 관심 매물 등록! (#{item_id})\n"
        f"(상세 정보 파싱 실패 \u2014 링크만 저장)\n\n"
        f"\U0001f4ce {url}\n\n"
        f"현재 관심 매물: {count}건"
    )


# ── 메시지 핸들러 ─────────────────────────────

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
            processing_msg = await update.message.reply_text(
                "\u23f3 매물 정보 파싱 중..."
            )

            try:
                parsed = parse_and_register(url, update.effective_user.first_name)

                if parsed and parsed.get("duplicate"):
                    reply = format_success_card(parsed)
                elif parsed and parsed.get("name") and parsed["name"] != "(파싱 전)":
                    reply = format_success_card(parsed)
                else:
                    item = register_url_only(url, update.effective_user.first_name)
                    reply = format_fallback_card(item)

            except Exception as e:
                logger.error("파싱 에러: %s", e, exc_info=True)
                item = register_url_only(url, update.effective_user.first_name)
                reply = format_fallback_card(item)

            await processing_msg.delete()
            await update.message.reply_text(reply)

        elif "asil.kr" in url or "hogangnono" in url:
            item = register_url_only(url, update.effective_user.first_name)
            reply = format_fallback_card(item)
            await update.message.reply_text(reply)


# ── 명령어 핸들러 ─────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """봇 시작 안내."""
    text = (
        "\U0001f3e0 관심 매물 봇에 오신 것을 환영합니다!\n\n"
        "네이버부동산 링크를 보내시면 자동으로 매물 정보를 수집합니다.\n\n"
        "\U0001f4cb 명령어:\n"
        "/list \u2014 관심 매물 목록\n"
        "/delete [번호] \u2014 매물 삭제\n"
        "/clear \u2014 전체 초기화\n"
        "/help \u2014 도움말"
    )
    await update.message.reply_text(text)


async def cmd_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """관심 매물 전체 리스트."""
    wishlist = load_wishlist()
    items = wishlist["items"]

    if not items:
        await update.message.reply_text("\U0001f4cb 등록된 관심 매물이 없습니다.")
        return

    # 가격 높은 순 (가격 0은 뒤로)
    sorted_items = sorted(
        items,
        key=lambda x: (x.get("price", 0) > 0, x.get("price", 0)),
        reverse=True,
    )

    lines = [f"\U0001f4cb 관심 매물 ({len(items)}건)\n"]

    for item in sorted_items:
        item_id = item["id"]
        name = item.get("name", "(파싱 전)")
        trade = item.get("trade_type", "")
        price = item.get("price", 0)
        area_py = item.get("area_pyeong", 0)

        price_str = format_price(price) if price > 0 else "가격 미확인"
        area_str = f"{area_py:.0f}평" if area_py > 0 else ""

        parts = [f"#{item_id} {name}"]
        if trade or price > 0:
            parts.append(f"{trade} {price_str}")
        if area_str:
            parts.append(area_str)

        lines.append("  " + " \u2014 ".join(parts))

    lines.append("\n삭제: /delete [번호]")

    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3950] + "\n\n... (더 많은 매물은 대시보드에서 확인)"

    await update.message.reply_text(text)


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
        await update.message.reply_text(f"\u274c #{target_id} 매물을 찾을 수 없습니다.")
        return

    save_wishlist(wishlist)
    await update.message.reply_text(
        f"\U0001f5d1\ufe0f #{target_id} 매물 삭제 완료!\n"
        f"남은 관심 매물: {len(wishlist['items'])}건"
    )


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """전체 초기화 (확인 절차 포함)."""
    wishlist = load_wishlist()
    count = len(wishlist["items"])

    if count == 0:
        await update.message.reply_text("\U0001f4cb 이미 비어있습니다.")
        return

    if context.args and context.args[0] == "confirm":
        wishlist["items"] = []
        save_wishlist(wishlist)
        await update.message.reply_text(
            f"\U0001f5d1\ufe0f 관심 매물 {count}건 전체 삭제 완료!"
        )
    else:
        await update.message.reply_text(
            f"\u26a0\ufe0f 관심 매물 {count}건을 모두 삭제하시겠습니까?\n\n"
            f"확인하려면: /clear confirm"
        )


def git_push_wishlist() -> bool:
    """wishlist.json을 GitHub에 push."""
    try:
        cwd = str(BASE_DIR)
        subprocess.run(["git", "add", "wishlist.json"], check=True, cwd=cwd)
        subprocess.run(
            ["git", "commit", "-m", "update: wishlist"],
            check=True, cwd=cwd,
        )
        subprocess.run(["git", "push"], check=True, cwd=cwd)
        logger.info("wishlist.json pushed to GitHub")
        return True
    except subprocess.CalledProcessError as e:
        logger.warning("git push 실패: %s", e)
        return False


async def cmd_push(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """wishlist.json을 GitHub에 push -> 대시보드 반영."""
    await update.message.reply_text("\u23f3 GitHub에 업로드 중...")
    success = git_push_wishlist()
    if success:
        await update.message.reply_text(
            "\u2705 대시보드에 반영 완료!\n"
            "\U0001f517 https://haan6892.github.io/real-estate-monitor/"
        )
    else:
        await update.message.reply_text(
            "\u274c push 실패. 변경사항이 없거나 수동으로 push 해주세요."
        )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """도움말."""
    text = (
        "\U0001f3e0 관심 매물 봇 사용법\n\n"
        "\U0001f4cc 매물 등록:\n"
        "  네이버부동산 링크를 채팅에 보내면 자동 등록됩니다.\n"
        "  (new.land / fin.land / m.land 모두 지원)\n\n"
        "\U0001f4cb 명령어:\n"
        "/list \u2014 관심 매물 목록 (가격순)\n"
        "/delete [번호] \u2014 특정 매물 삭제\n"
        "/clear \u2014 전체 초기화\n"
        "/push \u2014 대시보드에 반영 (GitHub push)\n"
        "/help \u2014 이 도움말\n\n"
        "\U0001f4a1 팁:\n"
        "  네이버부동산 앱에서 '공유' \u2192 이 채팅방에 보내기"
    )
    await update.message.reply_text(text)


# ── 메인 실행부 ───────────────────────────────

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
    app.add_handler(CommandHandler("push", cmd_push))
    app.add_handler(CommandHandler("help", cmd_help))

    # 일반 메시지 핸들러 (URL 감지)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("관심 매물 봇 시작! (polling 모드)")
    logger.info("Ctrl+C로 종료")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
