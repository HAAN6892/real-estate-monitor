# Claude Code 작업 프롬프트 — 저장소 파일 정리

## 프로젝트 위치
- 레포: HAAN6892/real-estate-monitor
- 로컬: `~/OneDrive/바탕 화면/real_estate_monitor`
- 현재 브랜치: main

## 배경
저장소 루트에 두 종류의 파일이 쌓여 있어서 정리가 필요해:
1. 카카오톡/개인 스크린샷 이미지 파일들 (원래 커밋되면 안 되는 것들)
2. Claude Code 프롬프트 MD 파일들 (`docs/` 폴더로 이동해야 함)

---

## 작업 1: 개인 스크린샷 파일 git에서 제거 + .gitignore 설정

### 대상 파일 (루트에 있는 것들)
- `KakaoTalk_20260418_233315011_01.png`
- `KakaoTalk_20260418_233315011_02.png`
- `KakaoTalk_20260418_233315011_03.png`
- `KakaoTalk_20260418_233315011_04.png`
- `KakaoTalk_20260418_233315011_05.png`
- `KakaoTalk_20260418_233315011_06.png`
- `KakaoTalk_20260418_233315011_07.png`
- 기타 루트에 있는 `KakaoTalk_*.png` 전부

### 실행 순서

**1단계. 현재 상태 확인**
```bash
git status
ls -la *.png 2>/dev/null
```
→ 결과를 나한테 먼저 보여줘. 어떤 경로로 루트에 생겼는지, 몇 개인지 확인한 뒤 다음 단계로 진행.

**2단계. `.gitignore`에 다음 패턴 추가 (이미 있으면 스킵)**
```gitignore
# 개인 스크린샷
KakaoTalk_*.png
*.jpeg
/screenshots/
```

**3단계. 파일들을 `git rm --cached`로 스테이징에서만 제거 (로컬 파일은 유지)**
```bash
git rm --cached KakaoTalk_*.png
```
- `--cached` 플래그 필수: 로컬 파일은 지우지 않고 git 추적에서만 제외
- 절대 `git rm` (cached 없이) 쓰지 말 것 → 로컬 파일까지 삭제됨

**4단계. 로컬 파일 이동 여부는 나한테 먼저 물어봐**
- 프로젝트 외부 경로 (예: `~/Downloads/` 또는 `~/OneDrive/바탕 화면/screenshots/`)로 옮길지 결정 필요
- 내 결정 듣기 전엔 로컬 파일 건드리지 말 것

---

## 작업 2: Claude Code 프롬프트 MD 파일들을 `docs/` 폴더로 이동

### 대상 파일 (루트에 있는 것들)
- `claude-code-prompt-dashboard-fixes.md`
- `claude-code-prompt-junggye-price-monitor.md`
- `claude-code-prompt-policy-loan-newlywed.md`
- `claude-code-prompt-policy-update.md`
- `claude-code-prompt-watchlist-filter-….md` (정확한 파일명은 `git status`로 확인)

### 실행 순서

**1단계. `docs/` 폴더 존재 여부와 파일 위치 확인**
```bash
ls -la docs/ 2>/dev/null
ls -la claude-code-prompt-*.md
```
→ 프로젝트 규칙: 모든 Claude Code 프롬프트는 `docs/` 하위에 있어야 함

**2단계. 루트에 있는 MD 파일 전부 `docs/`로 이동 (`git mv` 사용)**
```bash
git mv claude-code-prompt-dashboard-fixes.md docs/
git mv claude-code-prompt-junggye-price-monitor.md docs/
git mv claude-code-prompt-policy-loan-newlywed.md docs/
git mv claude-code-prompt-policy-update.md docs/
git mv claude-code-prompt-watchlist-filter-*.md docs/
```
- `git mv`는 파일 이동 + 스테이징을 한 번에 처리해줌
- 실제 파일명이 위 리스트와 다르면 `git status` 결과대로 실행

**3단계. 커밋**
```bash
git commit -m "chore: move claude code prompts to docs/ folder"
```

---

## 제약사항 (필수 준수)
- **어떤 파일이든 삭제하기 전에 반드시 나한테 확인받을 것**
- 작업 후 `git status`로 깨끗한 상태인지 확인
- **푸시는 아직 하지 말 것** — 내가 최종 검토한 후 지시할 테니 로컬 커밋까지만 진행
- 각 단계마다 결과를 보여주고 다음으로 진행해도 되는지 확인받을 것

---

## 작업 요약 (체크리스트)
- [ ] 작업 1-1: `git status`로 현재 상태 공유
- [ ] 작업 1-2: `.gitignore` 패턴 추가
- [ ] 작업 1-3: `git rm --cached`로 스크린샷 제거
- [ ] 작업 1-4: 로컬 파일 이동 여부 확인 (Hans 결정 대기)
- [ ] 작업 2-1: `docs/` 폴더 및 MD 파일 위치 확인
- [ ] 작업 2-2: `git mv`로 MD 파일 전부 이동
- [ ] 작업 2-3: 커밋 (`chore: move claude code prompts to docs/ folder`)
- [ ] 최종: `git status` 깨끗한지 확인 + 푸시 대기
