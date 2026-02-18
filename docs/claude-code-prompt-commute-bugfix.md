# Claude Code 작업 프롬프트 — 출퇴근 소요시간 버그 수정

## 현상
commute_update.py가 GitHub Actions에서 매번 실행되지만, 모든 동이 "좌표 매칭 실패"로 기록되어 ODsay API가 한 번도 호출되지 않고 있음. 대시보드에서 출퇴근 시간이 전부 `—`로 표시됨.

## 원인 2가지

### 버그 1: coord_cache.json 키 불일치 (`lon` vs `lng`)

coord_cache.json은 좌표를 `lat` / `lon`으로 저장:
```json
{"경기 안양시 만안구 금호타운": {"lat": 37.399, "lon": 126.901}}
```

그런데 commute_update.py의 `find_coord_for_dong()` 함수에서는 `lng`로 읽음:
```python
return coords.get("lng"), coords.get("lat")  # lng → 항상 None!
```

→ 좌표가 항상 None → "좌표 매칭 실패" 기록 → ODsay API 미호출

### 버그 2: 실패 항목 재시도 안 됨

"좌표 매칭 실패"로 기록된 항목도 `existing_data`에 들어가서, 다음 실행 때 `new_dongs` 필터에서 "이미 있음"으로 판단하고 스킵함:
```python
new_dongs = [d for d in dong_list if d not in existing_data]
# → 실패 항목도 existing_data에 있으니 재시도 안 됨
```

## 수정 사항

### 1. `find_coord_for_dong()` — `lon`과 `lng` 모두 대응

파일: `commute_update.py`

```python
# AS-IS (2군데)
return coords.get("lng"), coords.get("lat")

# TO-BE (2군데 모두 동일하게 수정)
return coords.get("lng") or coords.get("lon"), coords.get("lat")
```

### 2. `main()` — 실패 항목 재시도 로직

```python
# AS-IS
new_dongs = [d for d in dong_list if d not in existing_data]

# TO-BE
new_dongs = [d for d in dong_list 
             if d not in existing_data 
             or existing_data[d].get("note") == "좌표 매칭 실패"]
```

### 3. `commute_time.json` — 기존 실패 데이터 초기화

기존에 "좌표 매칭 실패"로 채워진 58개 동 데이터를 정리해야 다음 실행에서 재시도함.

가장 간단한 방법: commute_time.json의 data를 비워서 커밋:
```json
{
  "destination": "강남역 미림타워",
  "address": "서울 강남구 역삼동 826",
  "survey_basis": "ODsay API 대중교통 길찾기 (자동)",
  "updated": "",
  "data": {}
}
```

또는 수정 2번이 적용되면 "좌표 매칭 실패" 항목은 자동 재시도되므로, 굳이 초기화하지 않아도 됨. 다만 깔끔하게 시작하려면 초기화 추천.

## 검증

1. 커밋/푸시 후 GitHub Actions → "부동산 모니터링" → "Run workflow" 수동 실행
2. "출퇴근 소요시간 업데이트" 단계 로그 확인:
   - `신규 조회 대상: 56개 동` (기존 0개가 아닌 실제 숫자)
   - `경기 안양시 만안구 박달동 (126.90, 37.39)` 같은 좌표 출력
   - `→ 지하철 45분 대중교통 38분` 같은 실제 소요시간 출력
3. 대시보드 새로고침 → 카드에 🚇/🚌 아이콘 옆에 실제 시간 표시

## 커밋 메시지
"fix: commute_update.py 좌표 키 불일치(lon/lng) 및 실패 항목 재시도 버그 수정"
