"""
네이버부동산 매물 파싱 모듈
- URL에서 articleId/complexNo 추출
- m.land.naver.com API (주력) + fin.land API (보조)
- Graceful degradation: 파싱 실패 시 None 반환
"""

import logging
import re
import time

import requests

logger = logging.getLogger(__name__)

# ─── API 엔드포인트 ───

# 주 API (m.land — 안정적)
MLAND_ARTICLE_LIST = (
    "https://m.land.naver.com/complex/getComplexArticleList"
    "?hscpNo={complex_no}&tradTpCd=&order=prc&showR0=Y&page={page}"
)
NEWLAND_COMPLEX_API = (
    "https://new.land.naver.com/api/complexes/{complex_no}"
    "?sameAddressGroup=false"
)

# 보조 API (fin.land — 429 차단 가능성 있음)
FIN_KEY_API = "https://fin.land.naver.com/front-api/v1/article/key?articleId={article_id}"
FIN_BASIC_API = "https://fin.land.naver.com/front-api/v1/article/basicInfo?articleId={article_id}"
FIN_COMPLEX_API = "https://fin.land.naver.com/front-api/v1/complex?complexNumber={complex_no}"

# ─── 세션 ───
session = requests.Session()
session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
})

# ─── URL 패턴 ───
NAVER_PATTERNS = [
    re.compile(r'new\.land\.naver\.com/complexes/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'fin\.land\.naver\.com/articles/(\d+)'),
    re.compile(r'm\.land\.naver\.com/complex/info/(\d+)\?.*articleNo=(\d+)'),
    re.compile(r'm\.land\.naver\.com.*articleNo=(\d+)'),
]


# ─── URL 파싱 ───

def extract_article_id(url: str) -> tuple[str | None, str | None]:
    """URL에서 (articleId, complexNo) 추출."""
    for i, pattern in enumerate(NAVER_PATTERNS):
        m = pattern.search(url)
        if m:
            if i == 0:    # new.land: groups=(complexNo, articleNo)
                return m.group(2), m.group(1)
            elif i == 1:  # fin.land: groups=(articleId,)
                return m.group(1), None
            elif i == 2:  # m.land with complexNo
                return m.group(2), m.group(1)
            elif i == 3:  # m.land articleNo only
                return m.group(1), None
    return None, None


# ─── m.land API (주력) ───

def fetch_mland_article_list(
    complex_no: str, article_id: str | None = None, max_pages: int = 5
) -> tuple[list[dict], dict | None]:
    """m.land 단지 매물 리스트 조회 (페이지네이션).

    article_id 지정 시 해당 매물을 찾을 때까지 페이지를 넘김.
    Returns: (전체 매물 리스트, 매칭된 매물 또는 None)
    """
    all_articles = []
    matched = None

    for page in range(1, max_pages + 1):
        url = MLAND_ARTICLE_LIST.format(complex_no=complex_no, page=page)
        logger.info("m.land 매물 리스트 조회: hscpNo=%s page=%d", complex_no, page)
        try:
            resp = session.get(
                url, headers={"Referer": "https://m.land.naver.com/"}, timeout=10
            )
            if resp.status_code != 200:
                logger.warning("m.land status=%d", resp.status_code)
                break
            data = resp.json()
            articles = data.get("result", {}).get("list", [])
            if not articles:
                break
            all_articles.extend(articles)

            if article_id:
                for art in articles:
                    if str(art.get("atclNo")) == str(article_id):
                        matched = art
                        break
                if matched:
                    break

            total = int(data.get("result", {}).get("totAtclCnt", 0) or 0)
            if len(all_articles) >= total:
                break

            time.sleep(0.5)
        except Exception as e:
            logger.error("m.land 호출 실패: %s", e)
            break

    logger.info("m.land 총 %d건 조회, 매칭=%s", len(all_articles), matched is not None)
    return all_articles, matched


def fetch_complex_info(complex_no: str) -> dict | None:
    """단지 정보 조회 (좌표, 세대수, 준공년도).

    new.land API → fin.land API 순으로 시도.
    """
    # 1차: new.land API (429 가능)
    url = NEWLAND_COMPLEX_API.format(complex_no=complex_no)
    logger.info("new.land 단지 정보 조회: complexNo=%s", complex_no)
    try:
        for attempt in range(2):
            resp = session.get(
                url,
                headers={"Referer": f"https://new.land.naver.com/complexes/{complex_no}"},
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429 and attempt == 0:
                logger.info("new.land complex 429 → 5초 대기")
                time.sleep(5)
                continue
            logger.info("new.land complex status=%d", resp.status_code)
            break
    except Exception as e:
        logger.error("new.land complex 호출 실패: %s", e)

    # 2차: fin.land complex API
    fin_data = _fetch_fin(FIN_COMPLEX_API.format(complex_no=complex_no), "COMPLEX")
    if fin_data:
        return fin_data

    return None


def parse_mland_article(article: dict) -> dict:
    """m.land 매물 데이터 → 표준 형식 변환."""
    area_m2 = float(article.get("spc2", 0)) if article.get("spc2") else None
    return {
        "article_id": article.get("atclNo"),
        "name": article.get("atclNm", ""),
        "building": article.get("bildNm", ""),
        "trade_type": article.get("tradTpNm", ""),
        "price": parse_price(article.get("prcInfo", "")),
        "area_m2": round(area_m2, 1) if area_m2 else None,
        "area_pyeong": round(area_m2 / 3.3058, 1) if area_m2 else None,
        "floor": article.get("flrInfo", ""),
        "direction": article.get("direction", ""),
        "description": article.get("atclFetrDesc", ""),
        "agent": article.get("rltrNm", ""),
        "tags": article.get("tagList", []),
        "confirmed_date": article.get("cfmYmd", ""),
    }


# ─── fin.land API (보조) ───

def _fetch_fin(url: str, label: str) -> dict | None:
    """fin.land API 호출 (429 시 지수 백오프 3회 재시도)."""
    try:
        for attempt in range(3):
            resp = session.get(
                url,
                headers={
                    "Referer": "https://fin.land.naver.com/",
                    "Origin": "https://fin.land.naver.com",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429 and attempt < 2:
                wait = 3 * (2 ** attempt)  # 3초, 6초, 12초
                logger.info("fin.land %s 429 → %d초 대기 (%d/3)", label, wait, attempt + 1)
                time.sleep(wait)
                continue
            logger.info("fin.land %s status=%d", label, resp.status_code)
            return None
    except Exception as e:
        logger.error("fin.land %s 호출 실패: %s", label, e)
    return None


# ─── 통합 파서 ───

def _merge_complex_info(result: dict, complex_data: dict):
    """단지 정보 API 응답을 result에 병합 (new.land / fin.land 호환)."""
    body = complex_data.get("result", complex_data)
    if not result["name"]:
        result["name"] = (
            body.get("complexName")
            or body.get("hscpNm")
            or ""
        )
    if not result["built_year"]:
        raw = body.get("useApproveYmd") or body.get("useApproveYear") or body.get("approveYear") or ""
        result["built_year"] = _safe_int(str(raw)[:4]) if raw else None
    if not result["households"]:
        result["households"] = _safe_int(
            body.get("totalHouseholdCount")
            or body.get("householdCount")
            or body.get("totHsehCnt")
        )
    if not result["lat"]:
        result["lat"] = _safe_float(
            body.get("latitude") or body.get("lat")
        )
    if not result["lng"]:
        result["lng"] = _safe_float(
            body.get("longitude") or body.get("lng")
        )
    if not result["region"]:
        result["region"] = (
            body.get("address")
            or body.get("roadAddress")
            or body.get("cortarAddress")
            or ""
        )


def extract_coords_from_url(url: str) -> tuple[float | None, float | None]:
    """URL의 ms= 파라미터에서 좌표 추출. 예: ms=37.27,127.12,18"""
    m = re.search(r'[?&]ms=([0-9.]+),([0-9.]+)', url)
    if m:
        return _safe_float(m.group(1)), _safe_float(m.group(2))
    return None, None


def parse_article(
    article_id: str, complex_no: str | None = None, url: str | None = None
) -> dict:
    """매물 정보 파싱 (다중 API 전략).

    Returns:
        필드가 채워진 dict. 파싱 실패한 필드는 None.
    """
    result = {
        "article_id": article_id,
        "complex_no": complex_no,
        "name": None,
        "region": None,
        "dong": None,
        "trade_type": None,
        "price": None,
        "area_m2": None,
        "area_pyeong": None,
        "floor": None,
        "direction": None,
        "built_year": None,
        "households": None,
        "lat": None,
        "lng": None,
    }

    # ── 전략 1: m.land API (complexNo 필요) ──
    if complex_no:
        logger.info("[전략1] m.land API complexNo=%s", complex_no)

        # 1-a. 매물 리스트 (페이지네이션으로 정확한 매물 검색)
        articles, matched = fetch_mland_article_list(complex_no, article_id)
        time.sleep(1)

        if matched:
            logger.info("매물 찾음: %s %s", matched.get("atclNm"), matched.get("prcInfo"))
            parsed = parse_mland_article(matched)
            result.update({k: v for k, v in parsed.items() if v})
        elif articles:
            # 매칭 실패 → 같은 단지 매물 중 첫 번째 가격을 참고값으로 사용
            logger.info("articleId=%s 미매칭 → 동일 단지 매물 가격 참고", article_id)
            fallback = articles[0]
            result["name"] = fallback.get("atclNm", "")
            fallback_price = parse_price(fallback.get("prcInfo", ""))
            if fallback_price:
                result["price"] = fallback_price
                result["trade_type"] = fallback.get("tradTpNm", "")

        # 1-b. 단지 정보 (좌표, 세대수, 준공년도)
        complex_data = fetch_complex_info(complex_no)
        time.sleep(1)
        if complex_data:
            _merge_complex_info(result, complex_data)

    # ── 전략 2: fin.land API ──
    logger.info("[전략2] fin.land API")

    # KEY API → complexNo 획득
    if not complex_no:
        key_data = _fetch_fin(FIN_KEY_API.format(article_id=article_id), "KEY")
        time.sleep(1)
        if key_data:
            body = key_data.get("result", key_data)
            complex_no = str(body.get("complexNumber", "") or body.get("complexNo", ""))
            if complex_no:
                result["complex_no"] = complex_no
            if not result["trade_type"]:
                result["trade_type"] = body.get("tradeTypeName", "")

    # BASIC API → 매물 상세
    basic_data = _fetch_fin(FIN_BASIC_API.format(article_id=article_id), "BASIC")
    time.sleep(1)
    if basic_data:
        body = basic_data.get("result", basic_data)
        if not result["name"]:
            result["name"] = body.get("complexName", body.get("articleName", ""))
        if not result["price"]:
            price_str = body.get("dealPrice", body.get("price", body.get("formattedPrice", "")))
            if price_str:
                result["price"] = parse_price(str(price_str))
        if not result["trade_type"]:
            result["trade_type"] = body.get("tradeTypeName", "")

        area = body.get("exclusiveArea", body.get("area2", 0))
        if area and not result["area_m2"]:
            result["area_m2"] = round(float(area), 1)
            result["area_pyeong"] = round(float(area) / 3.3058, 1)

        floor_info = body.get("floor", body.get("floorInfo", ""))
        total_floor = body.get("totalFloor", body.get("maxFloor", ""))
        if floor_info and not result["floor"]:
            result["floor"] = f"{floor_info}/{total_floor}" if total_floor else str(floor_info)

        region_parts = []
        for key in ("cityName", "divisionName", "sectionName"):
            if body.get(key):
                region_parts.append(body[key])
        if region_parts and not result["region"]:
            result["region"] = " ".join(region_parts)

        result["dong"] = result["dong"] or body.get("legalDivisionName", body.get("dongName", ""))

    # 단지 정보 보완 (전략1에서 못 가져온 경우)
    if complex_no and (not result["lat"] or not result["built_year"]):
        complex_data = fetch_complex_info(complex_no)
        if complex_data:
            _merge_complex_info(result, complex_data)

    # m.land에서 complexNo 새로 확보했으면 매물+단지 재시도
    if complex_no and complex_no != result.get("complex_no") and not result.get("price"):
        result["complex_no"] = complex_no
        articles, matched = fetch_mland_article_list(complex_no, article_id)
        if matched:
            parsed = parse_mland_article(matched)
            result.update({k: v for k, v in parsed.items() if v})
        elif articles:
            fallback_price = parse_price(articles[0].get("prcInfo", ""))
            if fallback_price and not result["price"]:
                result["price"] = fallback_price

        if not result["lat"]:
            cinfo = fetch_complex_info(complex_no)
            if cinfo:
                _merge_complex_info(result, cinfo)

    # ── 최종 폴백: URL에서 좌표 추출 ──
    if url and not result["lat"]:
        url_lat, url_lng = extract_coords_from_url(url)
        if url_lat and url_lng:
            logger.info("URL에서 좌표 추출: lat=%s, lng=%s", url_lat, url_lng)
            result["lat"] = url_lat
            result["lng"] = url_lng

    return result


# ─── 유틸리티 ───

def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_price(price_str: str) -> int | None:
    """가격 문자열 → 만원 단위 정수.
    예: '4억 2,800' → 42800, '2억' → 20000, '8,500' → 8500
    """
    if not price_str:
        return None
    price_str = price_str.replace(",", "").replace(" ", "")
    total = 0
    if "억" in price_str:
        parts = price_str.split("억")
        eok = int(parts[0]) if parts[0] else 0
        total += eok * 10000
        remainder = parts[1].strip() if len(parts) > 1 else ""
        if remainder:
            try:
                total += int(remainder)
            except ValueError:
                pass
    else:
        try:
            total = int(price_str)
        except ValueError:
            return None
    return total if total > 0 else None


def format_price(price: int | None) -> str:
    """만원 단위 정수 → 표시 문자열."""
    if not price:
        return "가격 미확인"
    if price >= 10000:
        eok = price // 10000
        remainder = price % 10000
        return f"{eok}억" + (f" {remainder:,}" if remainder else "")
    return f"{price:,}"
