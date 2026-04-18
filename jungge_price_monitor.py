"""
중계주공 5·6·7·8단지 호가 일일 모니터
- m.land.naver.com API로 매물 스캔
- 전일 스냅샷과 비교해 신규/인하/인상/소멸을 텔레그램으로 알림
- naver_parser.py의 session, parse_price, format_price 재활용
"""
import json
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Windows CP949 터미널에서 한글/이모지 출력 허용
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from naver_parser import session, parse_price, format_price

# ─── 타겟 단지 ───
JUNGGE_COMPLEXES = [
    {"complex_no": "245",  "name": "중계주공5단지"},
    {"complex_no": "1110", "name": "중계주공6단지"},
    {"complex_no": "1111", "name": "중계주공7단지"},
    {"complex_no": "246",  "name": "중계주공8단지"},
]
COMPLEXES_MAP = {c["complex_no"]: c["name"] for c in JUNGGE_COMPLEXES}

# ─── Hans 매수 조건 ───
MATCH_CRITERIA = {
    "max_price_man": 60000,
    "min_area_m2": 49,
    "max_area_m2": 84,
    "trade_types": ["매매"],
}

SNAPSHOT_PATH = Path("jungge_snapshot.json")
KST = timezone(timedelta(hours=9))

MLAND_LIST_URL = (
    "https://m.land.naver.com/complex/getComplexArticleList"
    "?hscpNo={complex_no}&tradTpCd=&order=date&showR0=Y&page={page}"
)


# ─── 유틸리티 ───

def today_kst() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def now_kst_str() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M")


def fmt_price_man(price_man: int) -> str:
    """55000 → '5억 5,000만'"""
    if not price_man:
        return "가격 미확인"
    eok = price_man // 10000
    rem = price_man % 10000
    if eok > 0 and rem > 0:
        return f"{eok}억 {rem:,}만"
    elif eok > 0:
        return f"{eok}억"
    return f"{price_man:,}만"


def fmt_area(area) -> str:
    if area is None:
        return "?"
    return f"{float(area):.1f}"


def days_elapsed(first_seen: str) -> int:
    try:
        d = datetime.strptime(first_seen, "%Y-%m-%d").date()
        return (datetime.now(KST).date() - d).days
    except Exception:
        return 0


# ─── 매수조건 판정 ───

def check_is_match(article: dict) -> bool:
    if article.get("trade_type") not in MATCH_CRITERIA["trade_types"]:
        return False
    price = article.get("price_man") or 0
    if price <= 0 or price > MATCH_CRITERIA["max_price_man"]:
        return False
    area = article.get("area_exclusive_m2") or 0
    if area < MATCH_CRITERIA["min_area_m2"] or area > MATCH_CRITERIA["max_area_m2"]:
        return False
    return True


# ─── m.land API 호출 ───

def fetch_complex_articles(complex_no: str, complex_name: str) -> list[dict]:
    """단지 전체 매물 수집. 페이지 간 1.5s, 429/5xx 지수 백오프."""
    all_articles = []

    for page in range(1, 11):
        url = MLAND_LIST_URL.format(complex_no=complex_no, page=page)
        resp = None
        wait = 5
        succeeded = False

        for attempt in range(3):
            try:
                resp = session.get(
                    url,
                    headers={"Referer": "https://m.land.naver.com/"},
                    timeout=10,
                )
                if resp.status_code == 200:
                    succeeded = True
                    break
                elif resp.status_code in (429, 500, 502, 503, 504):
                    print(
                        f"[{complex_name}] HTTP {resp.status_code} "
                        f"page={page} attempt={attempt+1} → {wait}s 대기"
                    )
                    time.sleep(wait)
                    wait *= 3
                else:
                    print(f"[{complex_name}] 예상 외 HTTP {resp.status_code} (page={page})")
                    break
            except Exception as e:
                print(f"[{complex_name}] 요청 예외 page={page}: {e}")
                time.sleep(wait)
                wait *= 3

        if not succeeded:
            print(f"[{complex_name}] page={page} 3회 실패 → 단지 스킵")
            return all_articles  # 지금까지 수집한 것만 반환

        try:
            data = resp.json()
        except Exception:
            data = None
        if not data:
            print(f"[{complex_name}] page={page} 응답 파싱 실패 → 중단")
            break
        result = data.get("result", {})
        articles = result.get("list", [])
        if not articles:
            break

        all_articles.extend(articles)

        total = int(result.get("totAtclCnt", 0) or 0)
        more = result.get("more", False)
        if not more and len(all_articles) >= total:
            break

        if page < 10:
            time.sleep(1.5)

    return all_articles


# ─── 정규화 ───

def normalize_article(raw: dict, complex_no: str, first_seen: str = None) -> dict:
    """m.land 매물 raw → 표준 dict. 필드명은 naver_parser.parse_mland_article 참고."""
    atcl_no = str(raw.get("atclNo", ""))
    trade_type = raw.get("tradTpNm", "")
    price_man = parse_price(raw.get("prcInfo", "")) or 0

    spc2 = raw.get("spc2")  # 전용면적 (parse_mland_article과 동일)
    spc1 = raw.get("spc1")  # 공급면적
    area_excl = round(float(spc2), 1) if spc2 else None
    area_supply = round(float(spc1), 1) if spc1 else None

    article = {
        "article_no": atcl_no,
        "trade_type": trade_type,
        "price_man": price_man,
        "area_supply_m2": area_supply,
        "area_exclusive_m2": area_excl,
        "floor_info": raw.get("flrInfo", ""),
        "direction": raw.get("direction", ""),
        "title": raw.get("atclNm", ""),
        "tags": raw.get("tagList", []),
        "confirmed_at": raw.get("cfmYmd", ""),
        "first_seen": first_seen or today_kst(),
        "url": f"https://new.land.naver.com/complexes/{complex_no}?articleNo={atcl_no}",
    }
    article["is_match"] = check_is_match(article)
    return article


# ─── 스냅샷 diff ───

def diff_snapshots(prev: dict, curr: dict) -> dict:
    prev_keys = set(prev.keys())
    curr_keys = set(curr.keys())

    new_list = [curr[k] for k in curr_keys - prev_keys]
    removed_list = [prev[k] for k in prev_keys - curr_keys]
    price_down = []
    price_up = []

    for k in prev_keys & curr_keys:
        p_old = prev[k].get("price_man") or 0
        p_new = curr[k].get("price_man") or 0
        if p_old > 0 and p_new > 0:
            if p_new < p_old:
                price_down.append((prev[k], curr[k]))
            elif p_new > p_old:
                price_up.append((prev[k], curr[k]))

    return {"new": new_list, "price_down": price_down, "price_up": price_up, "removed": removed_list}


# ─── 메시지 포매터 ───

def _star(art: dict) -> str:
    return " ⭐" if art.get("is_match") else ""


def _area_str(art: dict) -> str:
    area = art.get("area_exclusive_m2")
    if area is None:
        return "?"
    py = round(float(area) / 3.3058)
    return f"{fmt_area(area)}㎡ ({py}평)"


def make_new_msg(cx_name: str, art: dict) -> str:
    tags_str = ", ".join(art.get("tags") or [])
    lines = [
        f"🆕 {cx_name} 신규 매물{_star(art)}",
        "",
        f"🏠 {art.get('trade_type', '')} {fmt_price_man(art.get('price_man', 0))}",
        f"📐 전용 {_area_str(art)} · {art.get('floor_info', '')}",
    ]
    if art.get("title"):
        lines.append(f'💬 "{art["title"]}"')
    if tags_str:
        lines.append(f"🏷️ {tags_str}")
    if art.get("confirmed_at"):
        lines.append(f"📅 확인 {art['confirmed_at']}")
    lines += ["", f"🔗 {art.get('url', '')}"]
    return "\n".join(lines)


def make_price_down_msg(cx_name: str, old: dict, new: dict) -> str:
    diff = (new.get("price_man") or 0) - (old.get("price_man") or 0)
    pct = round(diff / old["price_man"] * 100, 1) if old.get("price_man") else 0
    elapsed = days_elapsed(new.get("first_seen", today_kst()))
    area = new.get("area_exclusive_m2")
    lines = [
        f"📉 {cx_name} 가격 인하!{_star(new)}",
        "",
        (f"🏠 {new.get('trade_type', '')} "
         f"{fmt_price_man(old.get('price_man', 0))} → {fmt_price_man(new.get('price_man', 0))} "
         f"({diff:+,}만, {pct:+.1f}%)"),
        f"📐 전용 {fmt_area(area)}㎡ · {new.get('floor_info', '')}",
    ]
    if new.get("title"):
        lines.append(f'💬 "{new["title"]}"')
    lines.append(f"📅 최초 감지 {new.get('first_seen', '')} ({elapsed}일차)")
    lines += ["", f"🔗 {new.get('url', '')}"]
    return "\n".join(lines)


def make_price_up_msg(cx_name: str, old: dict, new: dict) -> str:
    diff = (new.get("price_man") or 0) - (old.get("price_man") or 0)
    pct = round(diff / old["price_man"] * 100, 1) if old.get("price_man") else 0
    elapsed = days_elapsed(new.get("first_seen", today_kst()))
    area = new.get("area_exclusive_m2")
    lines = [
        f"📈 {cx_name} 가격 인상{_star(new)}",
        "",
        (f"🏠 {new.get('trade_type', '')} "
         f"{fmt_price_man(old.get('price_man', 0))} → {fmt_price_man(new.get('price_man', 0))} "
         f"(+{diff:,}만, +{pct:.1f}%)"),
        f"📐 전용 {fmt_area(area)}㎡",
        f"📅 최초 감지 {new.get('first_seen', '')} ({elapsed}일차)",
        "",
        f"🔗 {new.get('url', '')}",
    ]
    return "\n".join(lines)


def make_removed_msg(cx_name: str, art: dict) -> str:
    area = art.get("area_exclusive_m2")
    elapsed = days_elapsed(art.get("first_seen", today_kst()))
    lines = [
        f"❌ {cx_name} 매물 소멸{_star(art)}",
        "",
        f"🏠 {art.get('trade_type', '')} {fmt_price_man(art.get('price_man', 0))} (전용 {fmt_area(area)}㎡)",
        f"📅 감지 {art.get('first_seen', '')} → 소멸 {today_kst()} ({elapsed}일 경과)",
        "👉 실거래 체결 또는 매도 철회 가능성",
    ]
    return "\n".join(lines)


def make_summary_msg(all_events: dict) -> str:
    """20건 초과 시 묶음 요약 + 상위 5건."""
    new_cnt = sum(len(ev["new"]) for ev in all_events.values())
    down_cnt = sum(len(ev["price_down"]) for ev in all_events.values())
    up_cnt = sum(len(ev["price_up"]) for ev in all_events.values())
    rm_cnt = sum(len(ev["removed"]) for ev in all_events.values())

    lines = [f"📊 중계 호가 일일 요약", f"📅 {today_kst()}", ""]
    if new_cnt:
        lines.append(f"🆕 신규 {new_cnt}건")
    if down_cnt:
        lines.append(f"📉 인하 {down_cnt}건")
    if up_cnt:
        lines.append(f"📈 인상 {up_cnt}건")
    if rm_cnt:
        lines.append(f"❌ 소멸 {rm_cnt}건")

    # 상위 5건 (인하 우선 → 신규)
    top5 = []
    for cx_no, ev in all_events.items():
        cx_name = COMPLEXES_MAP.get(cx_no, cx_no)
        for old, new in ev["price_down"]:
            top5.append(("📉", cx_name, new))
        for art in ev["new"]:
            top5.append(("🆕", cx_name, art))

    if top5:
        lines.append("\n--- 주요 5건 ---")
        for emoji, cx_name, art in top5[:5]:
            p = fmt_price_man(art.get("price_man", 0))
            area = art.get("area_exclusive_m2")
            area_str = f" {fmt_area(area)}㎡" if area else ""
            star = " ⭐" if art.get("is_match") else ""
            lines.append(f"{emoji} {cx_name} {p}{area_str}{star}")

    return "\n".join(lines)


# ─── 텔레그램 ───

def send_telegram(text: str):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        print(f"[텔레그램 미설정] {text[:80]}")
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        resp = requests.post(
            url,
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"텔레그램 전송 실패: {resp.status_code} {resp.text[:100]}")
    except Exception as e:
        print(f"텔레그램 예외: {e}")


def send_error_alert(err_summary: str):
    msg = (
        f"⚠️ 중계 호가 봇 오류\n\n"
        f"📅 {now_kst_str()}\n"
        f"🐛 {err_summary}\n"
        f"👉 GitHub Actions 로그 확인 필요"
    )
    send_telegram(msg)


# ─── 스냅샷 I/O ───

def _empty_snapshot() -> dict:
    return {
        "last_updated": None,
        "complexes": {
            "245":  {"name": "중계주공5단지", "articles": {}},
            "1110": {"name": "중계주공6단지", "articles": {}},
            "1111": {"name": "중계주공7단지", "articles": {}},
            "246":  {"name": "중계주공8단지", "articles": {}},
        },
    }


def load_snapshot() -> dict:
    if not SNAPSHOT_PATH.exists():
        return _empty_snapshot()
    with open(SNAPSHOT_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_snapshot(snapshot: dict):
    snapshot["last_updated"] = now_kst_str()
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)


# ─── 메인 ───

def main():
    print(f"[{now_kst_str()}] 중계 호가 스캔 시작")

    try:
        snapshot = load_snapshot()
    except Exception as e:
        send_error_alert(f"스냅샷 로드 실패: {e}")
        raise SystemExit(1)

    is_first_run = snapshot.get("last_updated") is None
    if is_first_run:
        print("초기화 모드: 스냅샷 없음 → 알림 없이 저장만")

    # 디버그 플래그 (첫 단지 첫 매물의 필드명 확인용)
    debug_logged = False
    success_count = 0
    all_events: dict[str, dict] = {}

    for i, cx in enumerate(JUNGGE_COMPLEXES):
        cx_no = cx["complex_no"]
        cx_name = cx["name"]

        print(f"[{cx_name}] 스캔 시작...")
        raw_articles = fetch_complex_articles(cx_no, cx_name)

        if not raw_articles:
            print(f"[{cx_name}] 수집 0건 (API 실패 또는 실제 0건)")
            if i < len(JUNGGE_COMPLEXES) - 1:
                time.sleep(2.5)
            continue

        success_count += 1

        # 첫 실행 시 응답 필드 구조 출력
        if not debug_logged:
            print(f"[DEBUG] m.land 응답 샘플 필드: {list(raw_articles[0].keys())}")
            debug_logged = True

        prev_articles: dict = (
            snapshot.get("complexes", {}).get(cx_no, {}).get("articles", {})
        )

        # 정규화 (first_seen 이어받기)
        curr_articles: dict[str, dict] = {}
        for raw in raw_articles:
            atcl_no = str(raw.get("atclNo", ""))
            if not atcl_no:
                continue
            prev_first = prev_articles.get(atcl_no, {}).get("first_seen")
            art = normalize_article(raw, cx_no, first_seen=prev_first)
            curr_articles[atcl_no] = art

        print(f"[{cx_name}] {len(curr_articles)}건 수집")

        all_events[cx_no] = diff_snapshots(prev_articles, curr_articles)

        # 스냅샷 업데이트
        snapshot.setdefault("complexes", {}).setdefault(
            cx_no, {"name": cx_name, "articles": {}}
        )["articles"] = curr_articles

        if i < len(JUNGGE_COMPLEXES) - 1:
            time.sleep(2.5)

    if success_count == 0:
        send_error_alert("4단지 전부 스캔 실패 (API 응답 없음)")
        raise SystemExit(1)

    try:
        save_snapshot(snapshot)
        print(f"스냅샷 저장 완료: {SNAPSHOT_PATH}")
    except Exception as e:
        send_error_alert(f"스냅샷 저장 실패: {e}")
        raise SystemExit(1)

    # 첫 실행: 대량 신규 알림 방지 → 요약 1건만
    if is_first_run:
        total = sum(
            len(cx.get("articles", {}))
            for cx in snapshot["complexes"].values()
        )
        send_telegram(f"🎬 중계 호가 봇 최초 스캔 완료: {total}건\n📅 {today_kst()}")
        print("첫 실행 완료: 요약 1건만 전송")
        return

    total_events = sum(
        len(ev["new"]) + len(ev["price_down"]) + len(ev["price_up"]) + len(ev["removed"])
        for ev in all_events.values()
    )

    if total_events == 0:
        print("변동 없음 → 알림 없음")
        return

    print(f"변동 {total_events}건 감지 → 텔레그램 전송")

    # 20건 초과 → 묶음 요약
    if total_events > 20:
        send_telegram(make_summary_msg(all_events))
        return

    # 이벤트별 개별 메시지
    for cx_no, ev in all_events.items():
        cx_name = COMPLEXES_MAP.get(cx_no, cx_no)

        for art in ev["new"]:
            send_telegram(make_new_msg(cx_name, art))
            time.sleep(0.5)

        for old, new in ev["price_down"]:
            send_telegram(make_price_down_msg(cx_name, old, new))
            time.sleep(0.5)

        for old, new in ev["price_up"]:
            send_telegram(make_price_up_msg(cx_name, old, new))
            time.sleep(0.5)

        for art in ev["removed"]:
            send_telegram(make_removed_msg(cx_name, art))
            time.sleep(0.5)

    print("완료")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        send_error_alert(f"예상치 못한 오류: {type(e).__name__}: {e}")
        raise SystemExit(1)
