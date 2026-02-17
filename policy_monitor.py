"""
정책 변경 감지 배치
- 주택도시기금 / 금융위원회 / 국토교통부 공식 사이트 크롤링
- 키워드 매칭으로 관련 공지만 필터링
- 새 공지 감지 시 텔레그램 알림
"""

import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timezone, timedelta

CONFIG_PATH = "config.json"
CACHE_PATH = "policy_cache.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                  " (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

SOURCES = {
    "주택도시기금": {
        "url": "https://nhuf.molit.go.kr/FP/FP08/FP0804/FP080402.jsp?id=3&mode=L",
        "base_url": "https://nhuf.molit.go.kr",
        "icon": "🏠",
    },
    "금융위원회": {
        "url": "https://www.fsc.go.kr/no010101",
        "base_url": "https://www.fsc.go.kr",
        "icon": "🏦",
    },
    "국토교통부": {
        "url": "https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp",
        "base_url": "https://www.molit.go.kr/USR/NEWS/m_71/",
        "icon": "🏗️",
    },
}

KEYWORDS = [
    "LTV", "DSR", "대출", "담보", "버팀목", "디딤돌", "보금자리",
    "신생아", "신혼", "전세", "규제지역", "투기과열", "조정대상",
    "주택담보", "주택구입", "금리", "소득기준", "한도",
    "부동산 대책", "가계부채",
]

# ── 설정 / 캐시 ─────────────────────────────────────────

def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_cache():
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_checked": None, "sources": {}}


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


# ── 크롤링 함수 (소스별) ────────────────────────────────

def fetch_nhuf():
    """주택도시기금 공지사항"""
    src = SOURCES["주택도시기금"]
    resp = requests.get(src["url"], headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items = []
    for row in soup.select("table tbody tr"):
        title_tag = row.select_one("td.subject a")
        date_tag = row.select_one("td.date")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        href = title_tag.get("href", "")
        link = src["base_url"] + href if href.startswith("/") else href
        date = date_tag.get_text(strip=True) if date_tag else ""
        items.append({"title": title, "date": date, "url": link})
    return items


def fetch_fsc():
    """금융위원회 보도자료"""
    src = SOURCES["금융위원회"]
    resp = requests.get(src["url"], headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items = []
    for li in soup.select("div.board-list-wrap ul > li"):
        title_tag = li.select_one("div.subject a")
        date_tag = li.select_one("div.day")
        if not title_tag:
            continue
        title = title_tag.get("title", "") or title_tag.get_text(strip=True)
        href = title_tag.get("href", "")
        link = src["base_url"] + href if href.startswith("/") else href
        date = date_tag.get_text(strip=True) if date_tag else ""
        items.append({"title": title, "date": date, "url": link})
    return items


def fetch_molit():
    """국토교통부 보도자료"""
    src = SOURCES["국토교통부"]
    session = requests.Session()
    session.headers.update(HEADERS)
    resp = session.get(src["url"], timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items = []
    for row in soup.select("table.bd_tbl tbody tr"):
        title_tag = row.select_one("td.bd_title a")
        date_tag = row.select_one("td.bd_date")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        href = title_tag.get("href", "")
        link = src["base_url"] + href if not href.startswith("http") else href
        date = date_tag.get_text(strip=True) if date_tag else ""
        items.append({"title": title, "date": date, "url": link})
    return items


FETCHERS = {
    "주택도시기금": fetch_nhuf,
    "금융위원회": fetch_fsc,
    "국토교통부": fetch_molit,
}

# ── 키워드 매칭 ──────────────────────────────────────────

def matches_keyword(title):
    upper = title.upper()
    return any(kw.upper() in upper for kw in KEYWORDS)


# ── 텔레그램 ─────────────────────────────────────────────

def send_telegram(bot_token, chat_id, message):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            print("  ✅ 텔레그램 전송 성공")
        else:
            print(f"  ❌ 텔레그램 전송 실패: {resp.status_code}")
    except Exception as e:
        print(f"  ❌ 텔레그램 전송 오류: {e}")


# ── 메인 ─────────────────────────────────────────────────

def main():
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)
    print("=" * 50)
    print("📋 정책 변경 감지 배치 시작")
    print(f"⏰ {now_kst.strftime('%Y-%m-%d %H:%M KST')}")
    print("=" * 50)

    config = load_config()
    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]

    cache = load_cache()
    is_first_run = cache["last_checked"] is None
    if is_first_run:
        print("\n🆕 첫 실행 — 현재 공지를 캐시에 저장만 합니다 (알림 없음)")

    new_items_by_source = {}
    errors = []

    for source_name, fetch_fn in FETCHERS.items():
        icon = SOURCES[source_name]["icon"]
        print(f"\n{icon} {source_name} 크롤링 중...")
        try:
            raw = fetch_fn()
            print(f"  수집: {len(raw)}건")

            filtered = [it for it in raw if matches_keyword(it["title"])]
            print(f"  키워드 매칭: {len(filtered)}건")

            cached_urls = set(cache.get("sources", {}).get(source_name, []))
            new = [it for it in filtered if it["url"] not in cached_urls]
            print(f"  신규: {len(new)}건")

            if new and not is_first_run:
                new_items_by_source[source_name] = new

            # 캐시: 기존 URL + 새 URL (최대 500건)
            all_urls = list(cached_urls | {it["url"] for it in filtered})
            cache.setdefault("sources", {})[source_name] = all_urls[-500:]
        except Exception as e:
            print(f"  ⚠️ 크롤링 실패: {e}")
            errors.append(f"{source_name}: {e}")

    # 새 항목 알림
    if new_items_by_source:
        lines = ["📋 부동산 정책 변경 감지", ""]
        for src, items in new_items_by_source.items():
            icon = SOURCES[src]["icon"]
            lines.append(f"🔔 {src}")
            for it in items:
                lines.append(f"• {it['title']} ({it['date']})")
                lines.append(f"  → {it['url']}")
            lines.append("")
        lines.append("⚠️ 확인 후 대시보드 반영 필요 시 Claude Code로 수정")
        send_telegram(bot_token, chat_id, "\n".join(lines))
    elif not is_first_run:
        print("\n  ℹ️ 새로운 정책 공지가 없습니다.")

    # 전체 실패 시 에러 알림
    if len(errors) == len(FETCHERS):
        msg = "⚠️ 정책 모니터링 전체 실패\n\n" + "\n".join(f"• {e}" for e in errors)
        send_telegram(bot_token, chat_id, msg)

    cache["last_checked"] = now_kst.strftime("%Y-%m-%d %H:%M KST")
    save_cache(cache)

    total_new = sum(len(v) for v in new_items_by_source.values())
    print(f"\n{'=' * 50}")
    print(f"✅ 완료 | 신규: {total_new}건 | 에러: {len(errors)}건")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
