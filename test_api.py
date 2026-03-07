import requests, json

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"}
url = "https://m.land.naver.com/complex/getComplexArticleList?hscpNo=111334&tradTpCd=A1&order=prc&showR0=N&page=1"
r = requests.get(url, headers=headers)
data = r.json()
articles = data.get("result", {}).get("list", [])

print(f"총 {len(articles)}건")
print("\n=== 첫번째 매물 전체 필드 ===")
if articles:
    print(json.dumps(articles[0], indent=2, ensure_ascii=False))