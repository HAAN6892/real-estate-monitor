"""
출퇴근 소요시간 자동 수집 스크립트
coord_cache.json + data.json → ODsay API → commute_time.json 업데이트
"""

import json
import time
import requests
import os

# 도착지: 강남역 미림타워
DEST_LNG = 127.0283
DEST_LAT = 37.4979

# ODsay API
ODSAY_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"

def load_config():
    with open("config.json", "r", encoding="utf-8") as f:
        return json.load(f)

def load_coord_cache():
    """coord_cache.json에서 매물 좌표 로드"""
    try:
        with open("coord_cache.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

def load_data():
    """data.json에서 매물 목록 로드 → 동(dong) 단위로 중복 제거"""
    try:
        with open("data.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("properties", [])
    except:
        return []

def load_existing_commute():
    """기존 commute_time.json 로드"""
    try:
        with open("commute_time.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {
            "destination": "강남역 미림타워",
            "address": "서울 강남구 역삼동 826",
            "survey_basis": "ODsay API 대중교통 길찾기 (자동)",
            "updated": "",
            "data": {}
        }

def search_transit(api_key, sx, sy, search_type=0):
    """
    ODsay 대중교통 길찾기 API 호출
    search_type: 0=전체, 1=지하철만, 2=버스만
    반환: 최소 소요시간(분) 또는 None
    """
    params = {
        "apiKey": api_key,
        "SX": sx,
        "SY": sy,
        "EX": DEST_LNG,
        "EY": DEST_LAT,
        "SearchType": 0,          # 도시내
        "SearchPathType": search_type
    }

    try:
        resp = requests.get(ODSAY_URL, params=params, timeout=15)
        result = resp.json()

        # 에러 체크
        if "result" not in result or "path" not in result["result"]:
            return None

        # 모든 경로 후보 중 최소 소요시간
        times = []
        for path in result["result"]["path"]:
            t = path.get("info", {}).get("totalTime")
            if t is not None:
                times.append(t)

        return min(times) if times else None

    except Exception as e:
        print(f"  API 에러: {e}")
        return None

def get_dong_key(prop):
    """매물의 동 단위 키 생성: 'sgg_name dong' 또는 'region dong'"""
    region = prop.get("sgg_name") or prop.get("region", "")
    dong = prop.get("dong", "")
    if dong:
        return f"{region} {dong}".strip()
    return region.strip()

def find_coord_for_dong(dong_key, coord_cache, properties):
    """
    해당 동의 대표 좌표를 찾는다.
    1차: coord_cache에서 해당 동에 속하는 매물 좌표 찾기
    2차: properties에서 해당 동의 매물 이름으로 coord_cache 검색
    """
    # 동에 해당하는 매물들의 이름 수집
    dong_props = [p for p in properties if get_dong_key(p) == dong_key]

    for prop in dong_props:
        name = prop.get("name", "")
        region = prop.get("sgg_name") or prop.get("region", "")
        dong = prop.get("dong", "")

        # coord_cache 키 매칭 시도
        for cache_key, coords in coord_cache.items():
            # 단지명이 포함되는 키 찾기
            if name and name in cache_key:
                return coords.get("lng") or coords.get("lon"), coords.get("lat")

        # region+dong으로 포함 매칭
        search = f"{dong}" if dong else region
        for cache_key, coords in coord_cache.items():
            # 정규화 매칭: "시" 제거 후 비교
            norm_key = cache_key.replace("시 ", " ").replace("경기 ", "")
            norm_search = search.replace("시 ", " ").replace("경기 ", "")
            if norm_search in norm_key or norm_key.endswith(search):
                return coords.get("lng") or coords.get("lon"), coords.get("lat")

    return None, None

def main():
    config = load_config()
    api_key = config.get("odsay_key")

    if not api_key:
        print("ODsay API 키가 config.json에 없습니다.")
        return

    coord_cache = load_coord_cache()
    properties = load_data()
    commute = load_existing_commute()
    existing_data = commute.get("data", {})

    if not properties:
        print("data.json에서 매물을 로드할 수 없습니다.")
        return

    # 동(dong) 단위로 중복 제거
    dong_set = set()
    dong_list = []
    for prop in properties:
        key = get_dong_key(prop)
        if key and key not in dong_set:
            dong_set.add(key)
            dong_list.append(key)

    print(f"총 매물: {len(properties)}개, 고유 동: {len(dong_list)}개")
    print(f"기존 데이터: {len(existing_data)}개 동")

    # 아직 데이터 없는 동만 처리
    new_dongs = [d for d in dong_list
                 if d not in existing_data
                 or existing_data[d].get("note") == "좌표 매칭 실패"]
    print(f"신규 조회 대상: {len(new_dongs)}개 동")

    if not new_dongs:
        print("모든 동의 출퇴근 데이터가 있습니다. 업데이트 없음.")
        return

    api_calls = 0
    success = 0

    for dong_key in new_dongs:
        # API 호출 한도 체크 (여유 있게 800회로)
        if api_calls >= 800:
            print(f"API 호출 한도 근접 ({api_calls}회). 나머지는 다음 실행에서.")
            break

        # 해당 동의 좌표 찾기
        lng, lat = find_coord_for_dong(dong_key, coord_cache, properties)

        if not lng or not lat:
            print(f"  {dong_key}: 좌표 없음, 스킵")
            existing_data[dong_key] = {
                "subway": None,
                "transit": None,
                "note": "좌표 매칭 실패"
            }
            continue

        print(f"  {dong_key} ({lng}, {lat})")

        # 1) 전체 경로 (버스+지하철)
        transit_time = search_transit(api_key, lng, lat, search_type=0)
        api_calls += 1
        time.sleep(0.5)

        # 2) 지하철만
        subway_time = search_transit(api_key, lng, lat, search_type=1)
        api_calls += 1
        time.sleep(0.5)

        existing_data[dong_key] = {
            "subway": subway_time,
            "transit": transit_time,
            "note": ""
        }

        subway_str = f"{subway_time}분" if subway_time else "—"
        transit_str = f"{transit_time}분" if transit_time else "—"
        print(f"    → 지하철 {subway_str}  대중교통 {transit_str}")

        success += 1

    # 저장
    from datetime import datetime, timezone, timedelta
    kst = timezone(timedelta(hours=9))
    commute["updated"] = datetime.now(kst).strftime("%Y-%m-%d %H:%M")
    commute["data"] = existing_data

    with open("commute_time.json", "w", encoding="utf-8") as f:
        json.dump(commute, f, ensure_ascii=False, indent=2)

    print(f"\n완료: {success}개 동 신규 조회 (API 호출: {api_calls}회)")
    print(f"commute_time.json 저장 완료 (총 {len(existing_data)}개 동)")

if __name__ == "__main__":
    main()
