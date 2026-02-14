"""
부동산 정책 모니터링 + 개인화 분석 + 노션 DB 저장
- 국토교통부, 금융위원회, 기획재정부 보도자료 RSS 모니터링
- 부동산/대출 관련 키워드 필터링
- 개인 상황 기반 영향도 분석
- 노션 데이터베이스에 저장
- 텔레그램 알림 전송
"""

import xml.etree.ElementTree as ET
import requests
import json
import os
import hashlib
from datetime import datetime, timezone, timedelta

# ============================================================
# 1. RSS 피드 소스 설정
# ============================================================
RSS_FEEDS = {
    "국토교통부": {
        "url": "https://www.korea.kr/rss/dept_molit.xml",
        "icon": "🏗️"
    },
    "금융위원회": {
        "url": "https://www.korea.kr/rss/dept_fsc.xml",
        "icon": "🏦"
    },
    "기획재정부": {
        "url": "https://www.korea.kr/rss/dept_moef.xml",
        "icon": "💰"
    }
}

# ============================================================
# 2. 키워드 설정 (카테고리별)
# ============================================================
KEYWORDS = {
    "대출규제": {
        "keywords": ["LTV", "DSR", "주택담보대출", "주담대", "대출 한도", "대출 규제",
                      "대출규제", "대출 강화", "대출 완화", "스트레스 금리", "가계대출",
                      "가계부채", "총부채", "원리금"],
        "icon": "🏦",
        "priority": "높음"
    },
    "규제지역": {
        "keywords": ["규제지역", "조정대상", "투기과열", "투기지역", "토지거래허가",
                      "규제 지정", "규제 해제", "규제완화", "규제 강화"],
        "icon": "📍",
        "priority": "높음"
    },
    "정책대출": {
        "keywords": ["디딤돌", "보금자리론", "신생아 특례", "신혼부부 대출",
                      "정책대출", "정책 대출", "특례대출", "특례 대출", "구입자금",
                      "서민대출", "생애최초"],
        "icon": "🎯",
        "priority": "높음"
    },
    "금리": {
        "keywords": ["기준금리", "금리 인하", "금리 인상", "금리 동결",
                      "코픽스", "COFIX", "MOR", "금통위"],
        "icon": "📊",
        "priority": "중간"
    },
    "세금": {
        "keywords": ["양도세", "양도소득세", "취득세", "종부세", "종합부동산세",
                      "보유세", "재산세", "공시가격", "세제 개편", "세제개편",
                      "증여세", "혼인 증여", "세금 완화", "세금 강화"],
        "icon": "🧾",
        "priority": "중간"
    },
    "공급정책": {
        "keywords": ["주택공급", "주택 공급", "재건축", "재개발", "신도시",
                      "분양", "착공", "공급대책", "공급 대책"],
        "icon": "🏠",
        "priority": "낮음"
    }
}

# ============================================================
# 3. 개인 프로필
# ============================================================
MY_PROFILE = {
    "합산소득": 8740,
    "자기자금": 15000,
    "인테리어예산": 9000,
    "투입가능자금": 6000,
    "월상환한도": 200,
    "월상환적정": 160,
    "현재주택수": 1,
    "무주택전환예정": "2026년 하반기",
    "혼인신고예정": "2026년 2~3월",
    "배우자직업": "교사",
    "관심지역": [
        "서울 강남구", "서울 서초구", "서울 송파구", "서울 강동구",
        "경기 과천시", "경기 안양시", "경기 성남시", "경기 하남시",
        "경기 용인시", "경기 광주시"
    ],
    "관심노선": "신분당선",
    "희망평형": "20평대 (59~84㎡)",
    "희망가격대": "3~5억",
}

# ============================================================
# 4. RSS 파싱
# ============================================================
def fetch_rss(url):
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        items = []
        for item in root.findall(".//item"):
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            description = item.findtext("description", "").strip()
            items.append({"title": title, "link": link, "pub_date": pub_date, "description": description})
        return items
    except Exception as e:
        print(f"  ⚠️ RSS 가져오기 실패: {e}")
        return []

# ============================================================
# 5. 키워드 매칭
# ============================================================
def classify_article(title, description=""):
    text = f"{title} {description}".upper()
    matched = []
    for category, info in KEYWORDS.items():
        for keyword in info["keywords"]:
            if keyword.upper() in text:
                matched.append({"category": category, "keyword": keyword, "icon": info["icon"], "priority": info["priority"]})
                break
    return matched

# ============================================================
# 6. 개인화 영향 분석
# ============================================================
def analyze_personal_impact(title, categories):
    impacts = []
    text = title.upper()

    for cat_info in categories:
        category = cat_info["category"]

        if category == "대출규제":
            if any(k in text for k in ["완화", "인하", "확대", "상향"]):
                impacts.append("✅ 대출 한도 늘어날 가능성 → 매수 가능 가격대 상승")
            elif any(k in text for k in ["강화", "축소", "제한", "인상"]):
                impacts.append("⚠️ 대출 한도 줄어들 수 있음 → DSR 40% 기준 월 291만원 한도 영향 확인")
            else:
                impacts.append("ℹ️ 대출 규제 변동 → 시중은행 주담대 계획에 영향 가능")
            if "DSR" in text:
                impacts.append(f"  → 부부합산 소득 {MY_PROFILE['합산소득']}만원 기준 DSR 한도 재계산 필요")
            if "LTV" in text:
                impacts.append(f"  → 자기자금 {MY_PROFILE['투입가능자금']}만원 대비 매수가능 가격 변동")

        elif category == "규제지역":
            region_mentioned = False
            for region in MY_PROFILE["관심지역"]:
                short_names = region.replace("경기 ", "").replace("서울 ", "").split("시")
                for name in short_names:
                    name = name.strip()
                    if name and name in text:
                        region_mentioned = True
                        if any(k in text for k in ["해제", "완화", "제외"]):
                            impacts.append(f"🎉 {region} 규제 완화! → LTV 상향, 대출 한도 증가 가능")
                        elif any(k in text for k in ["지정", "강화", "추가", "확대"]):
                            impacts.append(f"🔴 {region} 규제 강화 → LTV 하락, 대출 한도 감소 가능")
            if not region_mentioned:
                impacts.append("ℹ️ 규제지역 변동 → 관심지역(신분당선 라인) 해당 여부 확인 필요")

        elif category == "정책대출":
            if any(k in text for k in ["소득", "기준", "완화", "확대", "상향"]):
                impacts.append(f"🎯 정책대출 소득기준 변경 가능! 합산소득 {MY_PROFILE['합산소득']}만원")
                impacts.append("  → 디딤돌(6천만↓ ❌), 보금자리론(7천만↓ ❌) 기준 완화 시 자격 변동 확인")
            if any(k in text for k in ["신혼", "혼인"]):
                impacts.append(f"💍 신혼부부 대출 변경 → {MY_PROFILE['혼인신고예정']} 혼인신고 예정, 확인 필수")
            if any(k in text for k in ["신생아", "출산"]):
                impacts.append("👶 신생아 특례 변경 → 향후 출산 시 활용 가능")
            if any(k in text for k in ["생애최초", "생애 최초"]):
                impacts.append("ℹ️ 생애최초 대출 변경 → 대구매도 후 무주택 시 해당 가능성")

        elif category == "금리":
            if any(k in text for k in ["인하", "내림", "내려"]):
                impacts.append("📉 금리 인하 → 월 상환액 감소, 매수 타이밍 유리")
                impacts.append("  → 3.5억 대출 기준 0.5%p 인하 시 월 약 10~17만원 절감")
            elif any(k in text for k in ["인상", "올림", "올려"]):
                impacts.append(f"📈 금리 인상 → 월 상환 한도 {MY_PROFILE['월상환적정']}만원 초과 가능성")
            else:
                impacts.append(f"ℹ️ 금리 변동 → 월 상환 적정선 {MY_PROFILE['월상환적정']}만원 기준 영향 확인")

        elif category == "세금":
            if any(k in text for k in ["양도", "양도세"]):
                impacts.append("🧾 양도세 변경 → 대구 매도(2026.3~) 시 영향, 증여가 1.5억 기준 재계산")
            if any(k in text for k in ["취득세"]):
                impacts.append("🧾 취득세 변경 → 수도권 매수 시 부담 변동")
            if any(k in text for k in ["종부세", "보유세", "재산세", "공시가"]):
                impacts.append("🧾 보유세 변경 → 대구 보유 중 & 수도권 매수 후 영향")
            if any(k in text for k in ["증여", "혼인"]):
                impacts.append(f"🧾 증여/혼인 세제 변경 → {MY_PROFILE['혼인신고예정']} 혼인신고 전 확인 필수")

        elif category == "공급정책":
            if any(k in text for k in ["신분당", "성남", "용인", "수지", "판교", "광주"]):
                impacts.append("🏗️ 관심지역 공급 변동 → 중장기 시세에 영향 가능")
            else:
                impacts.append("ℹ️ 주택 공급 정책 → 관심지역 해당 여부 확인")

    if not impacts:
        impacts.append("ℹ️ 부동산 관련 정책 → 상세 내용 확인 권장")
    return impacts

# ============================================================
# 7. 중복 확인
# ============================================================
SENT_FILE = "policy_sent_ids.json"

def load_sent_ids():
    try:
        with open(SENT_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save_sent_ids(sent_ids):
    with open(SENT_FILE, "w") as f:
        json.dump(sent_ids[-500:], f)

def get_article_id(article):
    raw = f"{article['title']}{article['link']}"
    return hashlib.md5(raw.encode()).hexdigest()

# ============================================================
# 8. 노션 DB 저장
# ============================================================
def setup_notion_db(notion_api_key, notion_db_id):
    """노션 DB에 필요한 속성(컬럼)들을 자동 생성"""
    url = f"https://api.notion.com/v1/databases/{notion_db_id}"
    headers = {
        "Authorization": f"Bearer {notion_api_key}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"  ❌ 노션 DB 접근 실패: {response.status_code}")
            return False
        current_props = response.json().get("properties", {})
    except Exception as e:
        print(f"  ❌ 노션 DB 확인 오류: {e}")
        return False

    properties_to_add = {}
    if "출처" not in current_props:
        properties_to_add["출처"] = {"select": {"options": [
            {"name": "국토교통부", "color": "blue"},
            {"name": "금융위원회", "color": "green"},
            {"name": "기획재정부", "color": "orange"}
        ]}}
    if "분류" not in current_props:
        properties_to_add["분류"] = {"multi_select": {"options": [
            {"name": "대출규제", "color": "red"},
            {"name": "규제지역", "color": "purple"},
            {"name": "정책대출", "color": "blue"},
            {"name": "금리", "color": "yellow"},
            {"name": "세금", "color": "orange"},
            {"name": "공급정책", "color": "green"}
        ]}}
    if "중요도" not in current_props:
        properties_to_add["중요도"] = {"select": {"options": [
            {"name": "높음", "color": "red"},
            {"name": "중간", "color": "yellow"},
            {"name": "낮음", "color": "green"}
        ]}}
    if "날짜" not in current_props:
        properties_to_add["날짜"] = {"date": {}}
    if "링크" not in current_props:
        properties_to_add["링크"] = {"url": {}}

    if not properties_to_add:
        print("  ✅ 노션 DB 속성 이미 설정됨")
        return True

    payload = {"properties": properties_to_add}
    try:
        response = requests.patch(url, headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            print(f"  ✅ 노션 DB 속성 설정 완료 ({len(properties_to_add)}개 추가)")
            return True
        else:
            print(f"  ❌ 노션 DB 속성 설정 실패: {response.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ 노션 DB 속성 설정 오류: {e}")
        return False


def save_to_notion(notion_api_key, notion_db_id, source_name, article, categories, impacts):
    """노션 데이터베이스에 정책 기사 저장"""
    url = "https://api.notion.com/v1/pages"
    headers = {
        "Authorization": f"Bearer {notion_api_key}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    max_priority = "낮음"
    for cat in categories:
        if cat["priority"] == "높음":
            max_priority = "높음"
            break
        elif cat["priority"] == "중간":
            max_priority = "중간"

    cat_names = [c["category"] for c in categories]
    impact_text = "\n".join(impacts)
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst).strftime("%Y-%m-%d")

    payload = {
        "parent": {"database_id": notion_db_id},
        "properties": {
            "제목": {"title": [{"text": {"content": article["title"][:100]}}]},
            "출처": {"select": {"name": source_name}},
            "분류": {"multi_select": [{"name": name} for name in cat_names]},
            "중요도": {"select": {"name": max_priority}},
            "날짜": {"date": {"start": now_kst}},
            "링크": {"url": article["link"] if article["link"] else None}
        },
        "children": [
            {"object": "block", "type": "heading_2", "heading_2": {
                "rich_text": [{"type": "text", "text": {"content": "📋 우리 상황 영향 분석"}}]
            }},
            {"object": "block", "type": "paragraph", "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": impact_text[:2000]}}]
            }},
            {"object": "block", "type": "divider", "divider": {}},
            {"object": "block", "type": "heading_3", "heading_3": {
                "rich_text": [{"type": "text", "text": {"content": "📌 현재 우리 상황"}}]
            }},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
                "rich_text": [{"type": "text", "text": {"content": f"합산소득: {MY_PROFILE['합산소득']}만원/년"}}]
            }},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
                "rich_text": [{"type": "text", "text": {"content": f"투입가능 자기자금: ~{MY_PROFILE['투입가능자금']}만원"}}]
            }},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
                "rich_text": [{"type": "text", "text": {"content": f"월상환 한도: {MY_PROFILE['월상환적정']}만원"}}]
            }},
            {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
                "rich_text": [{"type": "text", "text": {"content": f"주택: {MY_PROFILE['현재주택수']}주택 → 무주택 전환 {MY_PROFILE['무주택전환예정']}"}}]
            }},
            {"object": "block", "type": "divider", "divider": {}},
            {"object": "block", "type": "bookmark", "bookmark": {"url": article["link"]}}
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            print(f"  ✅ 노션 저장 성공")
            return True
        else:
            print(f"  ❌ 노션 저장 실패: {response.status_code}")
            print(f"     {response.text[:300]}")
            return False
    except Exception as e:
        print(f"  ❌ 노션 저장 오류: {e}")
        return False

# ============================================================
# 9. 텔레그램 전송
# ============================================================
def send_telegram(bot_token, chat_id, message):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message, "parse_mode": "HTML", "disable_web_page_preview": True}
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"  ✅ 텔레그램 전송 성공")
        else:
            print(f"  ❌ 텔레그램 전송 실패: {response.status_code}")
    except Exception as e:
        print(f"  ❌ 텔레그램 전송 오류: {e}")

# ============================================================
# 10. 메시지 포맷
# ============================================================
def format_message(source_name, source_icon, article, categories, impacts):
    priority_map = {"높음": "🔴", "중간": "🟡", "낮음": "🟢"}
    max_priority = "낮음"
    for cat in categories:
        if cat["priority"] == "높음":
            max_priority = "높음"
            break
        elif cat["priority"] == "중간":
            max_priority = "중간"

    priority_icon = priority_map.get(max_priority, "⚪")
    cat_tags = " ".join([f"{c['icon']}{c['category']}" for c in categories])

    lines = [
        f"{priority_icon} <b>부동산 정책 알림</b> {priority_icon}",
        "",
        f"📰 <b>{article['title']}</b>",
        f"출처: {source_icon} {source_name} | 중요도: {max_priority}",
        f"분류: {cat_tags}",
        "",
        "📋 <b>우리 상황 영향 분석</b>",
    ]
    for impact in impacts:
        lines.append(impact)
    lines.append("")
    lines.append(f"🔗 <a href=\"{article['link']}\">원문 보기</a> | 📒 노션에 저장됨")

    return "\n".join(lines)

# ============================================================
# 11. 메인 실행
# ============================================================
def main():
    kst = timezone(timedelta(hours=9))
    print("=" * 50)
    print("🏠 부동산 정책 모니터링 시작")
    print(f"⏰ {datetime.now(kst).strftime('%Y-%m-%d %H:%M KST')}")
    print("=" * 50)

    try:
        with open("config.json", "r", encoding="utf-8") as f:
            config = json.load(f)
    except FileNotFoundError:
        print("❌ config.json 파일이 없습니다")
        return

    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]

    notion_api_key = os.environ.get("NOTION_API_KEY", "")
    notion_db_id = os.environ.get("NOTION_DB_ID", "")
    use_notion = bool(notion_api_key and notion_db_id)

    if use_notion:
        print("\n📒 노션 DB 설정 확인 중...")
        setup_notion_db(notion_api_key, notion_db_id)
    else:
        print("\n⚠️ 노션 설정 없음 → 텔레그램만 사용")

    sent_ids = load_sent_ids()
    new_sent_ids = list(sent_ids)
    total_found = 0
    total_sent = 0

    for source_name, source_info in RSS_FEEDS.items():
        print(f"\n📡 {source_info['icon']} {source_name} RSS 확인 중...")
        articles = fetch_rss(source_info["url"])
        print(f"  총 {len(articles)}개 기사 수신")

        for article in articles:
            article_id = get_article_id(article)
            if article_id in sent_ids:
                continue

            categories = classify_article(article["title"], article["description"])
            if not categories:
                continue

            total_found += 1
            print(f"\n  🎯 매칭: {article['title']}")

            impacts = analyze_personal_impact(article["title"], categories)

            if use_notion:
                save_to_notion(notion_api_key, notion_db_id, source_name, article, categories, impacts)

            message = format_message(source_name, source_info["icon"], article, categories, impacts)
            send_telegram(bot_token, chat_id, message)
            total_sent += 1
            new_sent_ids.append(article_id)

    save_sent_ids(new_sent_ids)

    print(f"\n{'=' * 50}")
    print(f"✅ 완료 | 매칭: {total_found}건 | 전송: {total_sent}건 | 노션: {'✅' if use_notion else '❌'}")
    print(f"{'=' * 50}")

    if total_sent == 0:
        print("  ℹ️ 새로운 부동산 정책 뉴스가 없습니다.")

if __name__ == "__main__":
    main()
