"""
대장아파트 가격 추이 백필 스크립트
- flagship_config.json의 워치리스트 17단지
- 최근 12개월 실거래 데이터 수집 → flagship_history.json 저장
"""

import json
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
FLAGSHIP_CONFIG_PATH = BASE_DIR / "flagship_config.json"
FLAGSHIP_HISTORY_PATH = BASE_DIR / "flagship_history.json"

API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"


def load_api_key():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        key = config.get("api_key", "")
        if key:
            return key
    key = os.environ.get("MOLIT_API_KEY", "")
    if not key:
        raise RuntimeError("API 키를 찾을 수 없습니다. config.json 또는 MOLIT_API_KEY 환경변수를 설정하세요.")
    return key


def load_flagship_config():
    with open(FLAGSHIP_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_flagship_history():
    if FLAGSHIP_HISTORY_PATH.exists():
        with open(FLAGSHIP_HISTORY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"updated_at": "", "watchlist": []}


def save_flagship_history(data):
    with open(FLAGSHIP_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  [저장] flagship_history.json 저장 완료")


def generate_months(n=12):
    """현재 월부터 n개월 전까지 yyyyMM 리스트 반환 (오래된 순)"""
    KST = timezone(timedelta(hours=9))
    now = datetime.now(KST)
    months = []
    for i in range(n - 1, -1, -1):
        dt = now.replace(day=1) - timedelta(days=i * 28)
        # 정확한 월 계산
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year}{month:02d}")
    return months


def fetch_trades_for_code(api_key, region_code, deal_ymd):
    """특정 지역코드·월의 매매 실거래 전건 조회"""
    params = {
        "serviceKey": api_key,
        "LAWD_CD": region_code,
        "DEAL_YMD": deal_ymd,
        "pageNo": "1",
        "numOfRows": "9999",
    }
    try:
        resp = requests.get(API_URL, params=params, timeout=30)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"    [오류] API 호출 실패 ({region_code} {deal_ymd}): {e}")
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        print(f"    [오류] XML 파싱 실패 ({region_code} {deal_ymd})")
        return []

    result_code = root.findtext(".//resultCode")
    if result_code and result_code not in ("00", "000"):
        result_msg = root.findtext(".//resultMsg", "알 수 없는 오류")
        print(f"    [오류] API 에러 ({region_code} {deal_ymd}): {result_msg}")
        return []

    trades = []
    for item in root.findall(".//item"):
        try:
            trades.append({
                "aptNm": (item.findtext("aptNm") or "").strip(),
                "area": float(item.findtext("excluUseAr") or 0),
                "price": int((item.findtext("dealAmount") or "0").strip().replace(",", "")),
                "floor": int(item.findtext("floor") or 0),
                "year": int(item.findtext("dealYear") or 0),
                "month": int(item.findtext("dealMonth") or 0),
                "day": int(item.findtext("dealDay") or 0),
                "dong": (item.findtext("umdNm") or "").strip(),
            })
        except (ValueError, TypeError):
            continue
    return trades


def match_watchlist(trades, watchlist_items):
    """
    거래 목록에서 워치리스트 단지 매칭.
    반환: {item_id: [transaction, ...]}
    """
    result = {item["id"]: [] for item in watchlist_items}

    for trade in trades:
        apt_name = trade["aptNm"]
        for item in watchlist_items:
            # 단지명 부분 일치
            if item["name"] not in apt_name and apt_name not in item["name"]:
                continue
            # 면적 ±5㎡
            if abs(trade["area"] - item["area_target"]) > 5:
                continue
            result[item["id"]].append(trade)

    return result


def main():
    print("=" * 55)
    print("대장아파트 가격 추이 백필 (12개월)")
    KST = timezone(timedelta(hours=9))
    now = datetime.now(KST)
    print(f"실행 시각: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    api_key = load_api_key()
    flagship_cfg = load_flagship_config()
    watchlist = flagship_cfg["watchlist"]

    months = generate_months(12)
    print(f"수집 기간: {months[0]} ~ {months[-1]} ({len(months)}개월)")

    # 지역코드별로 워치리스트 아이템 묶기
    by_code = {}
    for item in watchlist:
        by_code.setdefault(item["code"], []).append(item)
    print(f"지역코드: {len(by_code)}개, 워치리스트: {len(watchlist)}개 단지")

    # 기존 history 로드
    history = load_flagship_history()
    history_map = {entry["id"]: entry for entry in history.get("watchlist", [])}

    # 워치리스트 항목 초기화 (없는 id 추가)
    for item in watchlist:
        if item["id"] not in history_map:
            history_map[item["id"]] = {
                "id": item["id"],
                "name": item["name"],
                "gu": item["gu"],
                "dong": item["dong"],
                "area_target": item["area_target"],
                "transactions": [],
            }

    total_new = 0
    total_calls = 0

    for code, items in sorted(by_code.items()):
        item_names = ", ".join(i["name"] for i in items)
        print(f"\n[{code}] {item_names}")

        for ym in months:
            print(f"  {ym} 조회 중...", end=" ", flush=True)
            trades = fetch_trades_for_code(api_key, code, ym)
            total_calls += 1
            print(f"{len(trades)}건 수신", end="")

            matched = match_watchlist(trades, items)
            month_new = 0

            for item in items:
                entry = history_map[item["id"]]
                existing_keys = {
                    f"{t['date']}_{t['floor']}_{t['price']}"
                    for t in entry["transactions"]
                }

                for trade in matched[item["id"]]:
                    date_str = f"{trade['year']}-{trade['month']:02d}"
                    key = f"{date_str}_{trade['floor']}_{trade['price']}"
                    if key in existing_keys:
                        continue
                    entry["transactions"].append({
                        "date": date_str,
                        "price": trade["price"],
                        "floor": trade["floor"],
                        "area": trade["area"],
                        "deal_day": f"{trade['day']:02d}",
                    })
                    existing_keys.add(key)
                    month_new += 1

            if month_new:
                print(f" → 신규 {month_new}건", end="")
            print()
            total_new += month_new

            time.sleep(0.5)

    # 날짜 내림차순 정렬
    for entry in history_map.values():
        entry["transactions"].sort(
            key=lambda x: (x["date"], x["deal_day"]), reverse=True
        )

    history["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%S")
    history["watchlist"] = list(history_map.values())

    save_flagship_history(history)

    print(f"\n{'=' * 55}")
    print(f"완료! API 호출 {total_calls}회, 신규 거래 {total_new}건 수집")
    total_tx = sum(len(e["transactions"]) for e in history_map.values())
    print(f"총 누적 거래: {total_tx}건")
    print("=" * 55)


if __name__ == "__main__":
    main()
