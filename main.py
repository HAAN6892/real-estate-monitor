"""
수도권 부동산 실거래가 모니터링 봇 v4
- 국토교통부 실거래가 API 데이터 수집
- 카카오 로컬 API로 아파트 좌표 → 최근접 역 거리 계산
- 동일 단지 묶기, 가격대별 그룹핑, 평당가 계산
- 텔레그램: 간소화 알림 (요약 + 대시보드 링크)
- [v4] data.json 파일로 매물 데이터 저장
"""

import json
import math
import os
import requests
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ─── 경로 설정 ───
BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
HISTORY_PATH = BASE_DIR / "sent_history.json"
COORD_CACHE_PATH = BASE_DIR / "coord_cache.json"
APT_INFO_CACHE_PATH = BASE_DIR / "apt_info_cache.json"
DATA_JSON_PATH = BASE_DIR / "data.json"

# ─── 대시보드 URL ───
DASHBOARD_URL = "https://haan6892.github.io/real-estate-monitor/"

# ─── 신분당선 + 주요 지하철역 좌표 ───
STATIONS = [
    # 신분당선
    {"name": "강남", "lat": 37.4979, "lon": 127.0276, "line": "신분당선"},
    {"name": "양재", "lat": 37.4842, "lon": 127.0353, "line": "신분당선"},
    {"name": "양재시민의숲", "lat": 37.4700, "lon": 127.0386, "line": "신분당선"},
    {"name": "청계산입구", "lat": 37.4474, "lon": 127.0562, "line": "신분당선"},
    {"name": "판교", "lat": 37.3948, "lon": 127.1112, "line": "신분당선"},
    {"name": "정자", "lat": 37.3669, "lon": 127.1085, "line": "신분당선"},
    {"name": "미금", "lat": 37.3510, "lon": 127.1095, "line": "신분당선"},
    {"name": "동천", "lat": 37.3383, "lon": 127.1085, "line": "신분당선"},
    {"name": "수지구청", "lat": 37.3220, "lon": 127.0960, "line": "신분당선"},
    {"name": "성복", "lat": 37.3114, "lon": 127.0786, "line": "신분당선"},
    {"name": "상현", "lat": 37.3005, "lon": 127.0653, "line": "신분당선"},
    {"name": "광교중앙", "lat": 37.2886, "lon": 127.0492, "line": "신분당선"},
    {"name": "광교", "lat": 37.2831, "lon": 127.0446, "line": "신분당선"},
    # 분당선 주요역
    {"name": "야탑", "lat": 37.4112, "lon": 127.1272, "line": "분당선"},
    {"name": "이매", "lat": 37.3952, "lon": 127.1275, "line": "분당선"},
    {"name": "서현", "lat": 37.3845, "lon": 127.1237, "line": "분당선"},
    {"name": "수내", "lat": 37.3775, "lon": 127.1155, "line": "분당선"},
    {"name": "오리", "lat": 37.3397, "lon": 127.1090, "line": "분당선"},
    {"name": "죽전", "lat": 37.3249, "lon": 127.1076, "line": "분당선"},
    {"name": "보정", "lat": 37.3127, "lon": 127.1084, "line": "분당선"},
    {"name": "구성", "lat": 37.3005, "lon": 127.1085, "line": "분당선"},
    {"name": "모란", "lat": 37.4321, "lon": 127.1293, "line": "분당선"},
    {"name": "태평", "lat": 37.4431, "lon": 127.1268, "line": "분당선"},
    # 8호선 (송파/강동)
    {"name": "잠실", "lat": 37.5133, "lon": 127.1001, "line": "2호선"},
    {"name": "석촌", "lat": 37.5056, "lon": 127.1070, "line": "8호선"},
    {"name": "송파", "lat": 37.5014, "lon": 127.1125, "line": "8호선"},
    {"name": "가락시장", "lat": 37.4926, "lon": 127.1183, "line": "8호선"},
    {"name": "문정", "lat": 37.4857, "lon": 127.1228, "line": "8호선"},
    {"name": "장지", "lat": 37.4784, "lon": 127.1264, "line": "8호선"},
    {"name": "복정", "lat": 37.4706, "lon": 127.1265, "line": "8호선"},
    {"name": "산성", "lat": 37.4573, "lon": 127.1498, "line": "8호선"},
    {"name": "남한산성입구", "lat": 37.4502, "lon": 127.1578, "line": "8호선"},
    {"name": "단대오거리", "lat": 37.4441, "lon": 127.1565, "line": "8호선"},
    # 5호선 (강동/하남)
    {"name": "강동", "lat": 37.5354, "lon": 127.1320, "line": "5호선"},
    {"name": "둔촌동", "lat": 37.5271, "lon": 127.1366, "line": "5호선"},
    {"name": "올림픽공원", "lat": 37.5165, "lon": 127.1312, "line": "5호선"},
    {"name": "방이", "lat": 37.5084, "lon": 127.1268, "line": "5호선"},
    {"name": "미사", "lat": 37.5608, "lon": 127.1900, "line": "5호선"},
    {"name": "하남풍산", "lat": 37.5519, "lon": 127.2048, "line": "5호선"},
    {"name": "하남시청", "lat": 37.5393, "lon": 127.2149, "line": "5호선"},
    {"name": "하남검단산", "lat": 37.5249, "lon": 127.2242, "line": "5호선"},
    # 4호선 (과천/안양)
    {"name": "과천", "lat": 37.4340, "lon": 126.9877, "line": "4호선"},
    {"name": "정부과천청사", "lat": 37.4265, "lon": 126.9899, "line": "4호선"},
    {"name": "인덕원", "lat": 37.4175, "lon": 126.9892, "line": "4호선"},
    {"name": "평촌", "lat": 37.3947, "lon": 126.9635, "line": "4호선"},
    {"name": "범계", "lat": 37.3898, "lon": 126.9515, "line": "4호선"},
    {"name": "금정", "lat": 37.3717, "lon": 126.9416, "line": "4호선"},
    # 3호선 (강남/서초)
    {"name": "교대", "lat": 37.4937, "lon": 127.0146, "line": "3호선"},
    {"name": "남부터미널", "lat": 37.4856, "lon": 127.0148, "line": "3호선"},
    {"name": "양재", "lat": 37.4842, "lon": 127.0353, "line": "3호선"},
    {"name": "매봉", "lat": 37.4872, "lon": 127.0473, "line": "3호선"},
    {"name": "도곡", "lat": 37.4915, "lon": 127.0553, "line": "3호선"},
    {"name": "대치", "lat": 37.4948, "lon": 127.0628, "line": "3호선"},
    {"name": "학여울", "lat": 37.4969, "lon": 127.0713, "line": "3호선"},
    {"name": "대청", "lat": 37.4921, "lon": 127.0818, "line": "3호선"},
    {"name": "일원", "lat": 37.4837, "lon": 127.0876, "line": "3호선"},
    {"name": "수서", "lat": 37.4870, "lon": 127.1018, "line": "3호선"},
    # 2호선 (강남)
    {"name": "역삼", "lat": 37.5006, "lon": 127.0365, "line": "2호선"},
    {"name": "선릉", "lat": 37.5045, "lon": 127.0490, "line": "2호선"},
    {"name": "삼성", "lat": 37.5088, "lon": 127.0631, "line": "2호선"},
    {"name": "종합운동장", "lat": 37.5108, "lon": 127.0735, "line": "2호선"},
    # 경강선 (광주)
    {"name": "초월", "lat": 37.3702, "lon": 127.2810, "line": "경강선"},
    {"name": "곤지암", "lat": 37.3381, "lon": 127.3230, "line": "경강선"},
    {"name": "신둔도예촌", "lat": 37.3194, "lon": 127.3651, "line": "경강선"},
    {"name": "이천", "lat": 37.2750, "lon": 127.4433, "line": "경강선"},
    {"name": "경기광주", "lat": 37.4090, "lon": 127.2540, "line": "경강선"},
]


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_history():
    if HISTORY_PATH.exists():
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(history):
    history = history[-3000:]
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def load_coord_cache():
    if COORD_CACHE_PATH.exists():
        with open(COORD_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_coord_cache(cache):
    with open(COORD_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def load_apt_info_cache():
    if APT_INFO_CACHE_PATH.exists():
        with open(APT_INFO_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_apt_info_cache(cache):
    with open(APT_INFO_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


# ─── data.json 로드/저장 ───
def load_data_json():
    if DATA_JSON_PATH.exists():
        with open(DATA_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"updated_at": "", "properties": []}


def save_data_json(data):
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  [data.json] 저장 완료 ({len(data['properties'])}건)")


def fetch_region_apt_list(api_key, sigungu_code, apt_list_cache):
    if sigungu_code in apt_list_cache:
        return apt_list_cache[sigungu_code]

    url = "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3"
    all_items = []
    page = 1

    while True:
        params = {
            "serviceKey": api_key,
            "sigunguCode": sigungu_code,
            "numOfRows": "200",
            "pageNo": str(page),
            "type": "json"
        }
        try:
            resp = requests.get(url, params=params, timeout=15)
            data = resp.json()
            items = data.get("response", {}).get("body", {}).get("items", [])
            if not items:
                break
            if isinstance(items, dict):
                items = [items]
            all_items.extend(items)
            total = data.get("response", {}).get("body", {}).get("totalCount", 0)
            if len(all_items) >= total:
                break
            page += 1
        except Exception as e:
            print(f"    [목록조회 실패] {sigungu_code}: {e}")
            break

    apt_list_cache[sigungu_code] = all_items
    print(f"    [목록] {sigungu_code}: {len(all_items)}개 단지 로드")
    return all_items


def find_kapt_code(apt_name, apt_list):
    def clean(name):
        return name.replace(" ", "").replace("(", "").replace(")", "").lower()

    clean_name = clean(apt_name)

    for apt in apt_list:
        if clean(apt.get("kaptName", "")) == clean_name:
            return apt["kaptCode"]

    for apt in apt_list:
        kname = clean(apt.get("kaptName", ""))
        if clean_name in kname or kname in clean_name:
            return apt["kaptCode"]

    name_words = [w for w in clean_name if len(w) >= 2]
    best_score = 0
    best_code = None
    for apt in apt_list:
        kname = clean(apt.get("kaptName", ""))
        score = sum(1 for w in name_words if w in kname)
        if score > best_score:
            best_score = score
            best_code = apt["kaptCode"]

    if best_score >= 2:
        return best_code

    return None


def get_apt_household_count(api_key, apt_name, sigungu_code, apt_info_cache, apt_list_cache):
    cache_key = f"{sigungu_code}_{apt_name}"
    if cache_key in apt_info_cache:
        return apt_info_cache[cache_key]

    apt_list = fetch_region_apt_list(api_key, sigungu_code, apt_list_cache)
    kapt_code = find_kapt_code(apt_name, apt_list)

    if not kapt_code:
        print(f"    [세대수] {apt_name}: 단지코드 못 찾음")
        result = {"세대수": 0, "단지코드": ""}
        apt_info_cache[cache_key] = result
        return result

    url = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4"
    params = {
        "serviceKey": api_key,
        "kaptCode": kapt_code,
        "type": "json"
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        item = data.get("response", {}).get("body", {}).get("item", {})
        household = int(float(item.get("kaptdaCnt", 0) or 0))
        result = {"세대수": household, "단지코드": kapt_code}
        apt_info_cache[cache_key] = result
        print(f"    [세대수] {apt_name} → {household}세대")
        return result

    except Exception as e:
        print(f"    [세대수 조회 실패] {apt_name}: {e}")

    result = {"세대수": 0, "단지코드": kapt_code}
    apt_info_cache[cache_key] = result
    return result


def fetch_trades(api_key, region_code, deal_ymd):
    url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
    params = {
        "serviceKey": api_key,
        "LAWD_CD": region_code,
        "DEAL_YMD": deal_ymd,
        "pageNo": "1",
        "numOfRows": "9999"
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"  [오류] API 호출 실패 ({region_code}): {e}")
        return []

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        print(f"  [오류] XML 파싱 실패 ({region_code})")
        return []

    result_code = root.findtext(".//resultCode")
    if result_code and result_code not in ("00", "000"):
        result_msg = root.findtext(".//resultMsg", "알 수 없는 오류")
        print(f"  [오류] API 에러 ({region_code}): {result_msg}")
        return []

    items = root.findall(".//item")
    trades = []

    for item in items:
        try:
            trade = {
                "아파트": (item.findtext("aptNm") or "").strip(),
                "면적": float(item.findtext("excluUseAr") or 0),
                "거래금액": int((item.findtext("dealAmount") or "0").strip().replace(",", "")),
                "층": int(item.findtext("floor") or 0),
                "건축년도": int(item.findtext("buildYear") or 0),
                "거래년도": int(item.findtext("dealYear") or 0),
                "거래월": int(item.findtext("dealMonth") or 0),
                "거래일": int(item.findtext("dealDay") or 0),
                "법정동": (item.findtext("umdNm") or "").strip(),
                "지번": (item.findtext("jibun") or "").strip(),
                "도로명": (item.findtext("roadNm") or "").strip(),
            }
            trades.append(trade)
        except (ValueError, TypeError):
            continue

    return trades


def filter_trades(trades, filters):
    filtered = []
    today = datetime.now().date()
    max_days = filters.get("max_days_ago", 14)

    for t in trades:
        try:
            trade_date = datetime(t["거래년도"], t["거래월"], t["거래일"]).date()
            if (today - trade_date).days > max_days:
                continue
        except (ValueError, TypeError):
            continue

        if t["면적"] < filters["min_area"] or t["면적"] > filters["max_area"]:
            continue
        if t["거래금액"] < filters["min_price"] or t["거래금액"] > filters["max_price"]:
            continue
        if t["층"] < filters.get("min_floor", 1):
            continue
        max_by = filters.get("max_build_year", 9999)
        if max_by != 9999 and t["건축년도"] > max_by:
            continue
        filtered.append(t)
    return filtered


def make_trade_id(trade, region_name):
    return f"{region_name}_{trade['아파트']}_{trade['면적']}_{trade['거래금액']}_{trade['층']}_{trade['거래년도']}{trade['거래월']:02d}{trade['거래일']:02d}"


# ─── 카카오 API로 주소 → 좌표 변환 ───
def get_coordinates(kakao_key, address, coord_cache):
    if address in coord_cache:
        return coord_cache[address]

    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {kakao_key}"}
    params = {"query": address}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=5)
        data = resp.json()
        if data.get("documents"):
            doc = data["documents"][0]
            result = {"lat": float(doc["y"]), "lon": float(doc["x"])}
            coord_cache[address] = result
            return result
    except Exception:
        pass

    url2 = "https://dapi.kakao.com/v2/local/search/keyword.json"
    try:
        resp = requests.get(url2, headers=headers, params=params, timeout=5)
        data = resp.json()
        if data.get("documents"):
            doc = data["documents"][0]
            result = {"lat": float(doc["y"]), "lon": float(doc["x"])}
            coord_cache[address] = result
            return result
    except Exception:
        pass

    return None


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def find_nearest_station(lat, lon):
    nearest = None
    min_dist = float("inf")
    for st in STATIONS:
        dist = haversine(lat, lon, st["lat"], st["lon"])
        if dist < min_dist:
            min_dist = dist
            nearest = st
    walk_min = round(min_dist * 15)
    return nearest, min_dist, walk_min


# ─── 포맷팅 함수 ───
def format_price(price_man):
    if price_man >= 10000:
        억 = price_man // 10000
        나머지 = price_man % 10000
        if 나머지 > 0:
            return f"{억}억 {나머지:,}"
        return f"{억}억"
    return f"{price_man:,}만"


def to_pyeong(m2):
    return round(m2 / 3.3058, 1)


def price_group_label(price_man):
    억 = price_man // 10000
    return f"{억}억대"


# ─── 단지별 묶기 + 요약 ───
def group_by_complex(trades):
    groups = {}
    for t in trades:
        key = f"{t['아파트']}_{t['면적']}"
        if key not in groups:
            groups[key] = {
                "아파트": t["아파트"],
                "면적": t["면적"],
                "건축년도": t["건축년도"],
                "법정동": t["법정동"],
                "도로명": t.get("도로명", ""),
                "거래": []
            }
        groups[key]["거래"].append(t)
    return groups


def build_region_data(region_name, complex_groups, kakao_key, coord_cache, sgg_name, api_key, apt_info_cache, min_households, region_code, apt_list_cache):
    """한 지역의 data.json 저장용 데이터 생성 (텔레그램 메시지 생성 제거)"""

    data_items = []
    skipped_small = 0

    for key, group in complex_groups.items():
        apt_info = get_apt_household_count(api_key, group["아파트"], region_code, apt_info_cache, apt_list_cache)
        household = apt_info["세대수"]

        if household > 0 and household < min_households:
            skipped_small += 1
            continue

        trades = group["거래"]
        pyeong = to_pyeong(group["면적"])

        address = f"{sgg_name} {group['법정동']} {group['아파트']}"
        coord = get_coordinates(kakao_key, address, coord_cache)

        walk_min = 999
        nearest_station_name = ""
        nearest_station_line = ""
        if coord:
            nearest, dist_km, walk_min = find_nearest_station(coord["lat"], coord["lon"])
            nearest_station_name = nearest["name"]
            nearest_station_line = nearest["line"]

        for t in trades:
            try:
                trade_date_str = f"{t['거래년도']}-{t['거래월']:02d}-{t['거래일']:02d}"
            except (ValueError, TypeError):
                trade_date_str = ""

            search_query = urllib.parse.quote(f"{group['법정동']} {group['아파트']}")
            naver_link = f"https://m.land.naver.com/search/result/{search_query}"

            data_items.append({
                "name": group["아파트"],
                "region": region_name,
                "dong": group["법정동"],
                "area_m2": group["면적"],
                "area_py": pyeong,
                "price": t["거래금액"],
                "price_per_py": round(t["거래금액"] / pyeong) if pyeong > 0 else 0,
                "floor": t["층"],
                "built_year": group["건축년도"],
                "households": household,
                "station": nearest_station_name,
                "line": nearest_station_line,
                "walk_min": walk_min if walk_min < 999 else None,
                "trade_date": trade_date_str,
                "link": naver_link,
                "regulated": False,
            })

    if skipped_small > 0:
        print(f"    ℹ️ {min_households}세대 미만 {skipped_small}개 단지 제외")

    return data_items


# ─── 텔레그램 전송 ───
def send_telegram(bot_token, chat_id, message):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown", "disable_web_page_preview": True}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code != 200:
            print(f"  [오류] 텔레그램 전송 실패: {resp.text}")
            return False
        return True
    except requests.exceptions.RequestException as e:
        print(f"  [오류] 텔레그램 전송 실패: {e}")
        return False


# ─── 메인 ───
def main():
    print("=" * 50)
    print("🏠 부동산 실거래가 모니터링 v4 (data.json)")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    config = load_config()
    api_key = config["api_key"]
    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]
    kakao_key = config.get("kakao_key", "")
    filters = config["filters"]
    regions = config["regions"]

    history = load_history()
    history_set = set(history)
    coord_cache = load_coord_cache()
    apt_info_cache = load_apt_info_cache()
    apt_list_cache = {}
    min_households = filters.get("min_households", 200)

    # [v4] 기존 data.json 로드
    existing_data = load_data_json()
    existing_properties = existing_data.get("properties", [])

    existing_keys = set()
    for p in existing_properties:
        key = f"{p['region']}_{p['name']}_{p['area_m2']}_{p['price']}_{p['floor']}_{p['trade_date']}"
        existing_keys.add(key)

    KST = timezone(timedelta(hours=9))
    now = datetime.now(KST)
    months = [now.strftime("%Y%m"), (now - timedelta(days=30)).strftime("%Y%m")]
    months = list(dict.fromkeys(months))

    total_new = 0
    total_checked = 0
    all_new_items = []
    region_results = {}

    for region in regions:
        region_name = region["name"]
        region_code = region["code"]
        sgg_name = region.get("sgg_name", region_name)
        print(f"\n📍 {region_name} ({region_code}) 조회 중...")

        new_trades = []
        for month in months:
            print(f"  📅 {month} 데이터 조회...")
            trades = fetch_trades(api_key, region_code, month)
            print(f"  → {len(trades)}건 조회됨")
            filtered = filter_trades(trades, filters)
            total_checked += len(trades)
            print(f"  → {len(filtered)}건 필터 통과")

            for trade in filtered:
                trade_id = make_trade_id(trade, region_name)
                if trade_id in history_set:
                    continue
                new_trades.append(trade)
                history.append(trade_id)
                history_set.add(trade_id)
                total_new += 1

        if new_trades:
            region_results[region_name] = {"trades": new_trades, "sgg_name": sgg_name, "region_code": region_code}
            print(f"  ✅ 새 거래 {len(new_trades)}건")

    # ─── 텔레그램 간소화 알림 ───
    if total_new > 0:
        # 지역별 건수 요약
        region_lines = []
        for rname, rdata in region_results.items():
            region_lines.append(f"  • {rname}: {len(rdata['trades'])}건")

        message = (
            f"🏠 *매물 업데이트*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"⏰ {now.strftime('%Y-%m-%d %H:%M')}\n"
            f"🆕 신규 거래 *{total_new}건*\n\n"
            + "\n".join(region_lines) +
            f"\n\n📊 [대시보드에서 확인]({DASHBOARD_URL})"
        )
    else:
        message = (
            f"🏠 *매물 업데이트*\n"
            f"━━━━━━━━━━━━━━━\n"
            f"⏰ {now.strftime('%Y-%m-%d %H:%M')}\n"
            f"신규 거래 없음\n\n"
            f"📊 [대시보드 보기]({DASHBOARD_URL})"
        )

    send_telegram(bot_token, chat_id, message)
    print(f"  📤 텔레그램 알림 전송 완료")

    # ─── data.json용 데이터 수집 ───
    if region_results:
        for rname, rdata in region_results.items():
            complex_groups = group_by_complex(rdata["trades"])
            data_items = build_region_data(
                rname, complex_groups, kakao_key, coord_cache,
                rdata["sgg_name"], api_key, apt_info_cache,
                min_households, rdata["region_code"], apt_list_cache
            )
            for item in data_items:
                item_key = f"{item['region']}_{item['name']}_{item['area_m2']}_{item['price']}_{item['floor']}_{item['trade_date']}"
                if item_key not in existing_keys:
                    all_new_items.append(item)
                    existing_keys.add(item_key)

    # ─── data.json 업데이트 ───
    all_properties = existing_properties + all_new_items

    cutoff_date = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    all_properties = [
        p for p in all_properties
        if p.get("trade_date", "9999") >= cutoff_date or not p.get("trade_date")
    ]

    all_properties.sort(key=lambda x: x.get("trade_date", ""), reverse=True)

    data_json = {
        "updated_at": now.strftime("%Y-%m-%d %H:%M"),
        "total_count": len(all_properties),
        "new_count": len(all_new_items),
        "properties": all_properties
    }
    save_data_json(data_json)

    # 저장
    save_history(history)
    save_coord_cache(coord_cache)
    save_apt_info_cache(apt_info_cache)

    print(f"\n{'=' * 50}")
    print(f"✅ 완료! 새 알림 {total_new}건 / data.json {len(all_properties)}건")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
