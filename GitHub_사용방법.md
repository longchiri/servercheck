# 🚀 GitHub Actions 로 Mac/Windows 자동 빌드

이 폴더를 GitHub 저장소에 올리면 push 할 때마다 **Mac .app 과 Windows .exe 가 자동 빌드** 됩니다. M1/M2/M3 Apple Silicon 도 문제없습니다.

---

## 📋 처음 1번만 해야 할 셋업

### 1단계: GitHub 계정 + 저장소 만들기

1. https://github.com/signup 에서 가입 (이미 있으면 로그인)
2. https://github.com/new 에서 **새 저장소 생성**
   - **Repository name**: `server-check` (또는 원하는 이름)
   - **Private** 선택 (회사 정보가 들어갈 수 있으니 비공개 권장)
   - "Create repository" 클릭
3. 만들어진 저장소 페이지에서 보이는 **HTTPS URL 복사**
   - 예: `https://github.com/내아이디/server-check.git`

### 2단계: 터미널에서 코드 push

```bash
cd ~/Documents/Claude/Projects/델\ 관리시스템

# 빌드 부산물 정리 (한 번만)
./cleanup.sh

# Git 초기화 + 첫 커밋
git init -b main
git add .
git commit -m "초기 커밋"

# GitHub 저장소 연결 (URL 은 위에서 복사한 본인 거)
git remote add origin https://github.com/내아이디/server-check.git

# Push (처음에는 GitHub 로그인 창이 뜸 — Personal Access Token 사용)
git push -u origin main
```

> **💡 인증 토큰 필요할 때:**
> - https://github.com/settings/tokens 에서 "Generate new token (classic)"
> - 권한: `repo` 전체 체크
> - 토큰 복사 → 터미널에 비밀번호 대신 붙여넣기

### 3단계: GitHub 에서 빌드 시작 확인

1. 본인 저장소 페이지 → 상단 **Actions** 탭 클릭
2. "Build Server Check" 워크플로우가 자동 실행 중인 게 보임 (노란색 점)
3. **5~10분 기다리면** 초록색 ✓ 로 바뀜
4. 클릭하면 빌드 로그 볼 수 있음

### 4단계: 빌드된 파일 다운로드

빌드 완료된 workflow run 페이지 맨 아래 **"Artifacts"** 섹션에:

- 📦 **Server_Check_macOS** — 클릭하면 zip 다운로드 (안에 `Server Check.app`)
- 📦 **Server_Check_Windows** — 클릭하면 `Server_Check.exe` 다운로드

→ Mac .app 은 풀어서 `/Applications/` 로 옮기고 사용
→ Windows .exe 는 USB/메일로 윈도우 PC 에 옮기면 끝

---

## 🔄 이후 변경사항 반영 방법

코드 수정한 후 다시 빌드하고 싶으면:

```bash
cd ~/Documents/Claude/Projects/델\ 관리시스템
git add .
git commit -m "수정한 내용"
git push
```

→ 또 자동으로 5~10분 안에 새 빌드 생성됨

---

## 🏷 정식 릴리즈로 배포하고 싶을 때

태그를 붙여서 push 하면 **"Releases" 페이지에 자동으로 등록** 됩니다 (URL 만 공유해도 다운로드 가능):

```bash
git tag v1.0.0
git push origin v1.0.0
```

→ 저장소의 "Releases" 페이지에 `v1.0.0` 이 생성되고 `.app.zip` / `.exe` 가 자동 첨부됨

---

## ⏱ 빌드 시간

| 환경 | 첫 빌드 | 이후 |
|---|---|---|
| Mac (Apple Silicon) | 4~7분 | 3~5분 |
| Windows | 5~8분 | 3~5분 |
| 동시 실행됨 | 약 8분 후 양쪽 다 완료 | |

---

## 💰 비용

- **공개 저장소**: 100% 무료
- **비공개 저장소** (회사 데이터 있으면 권장): 월 2,000분 무료 (한 번 빌드 ~10분이니 월 200회 빌드 가능, 충분)

---

## ❓ 자주 묻는 질문

**Q. push 할 때 "Permission denied" 라고 나와요**
A. GitHub 가 비밀번호 인증을 막아서, **Personal Access Token** 을 만들어 비밀번호 자리에 넣어야 해요. (위 2단계 💡 참고)

**Q. Actions 가 빨간색으로 실패했어요**
A. 클릭해서 로그 확인 후 에러 메시지 복사해서 알려주세요. 보통 의존성 버전 문제예요.

**Q. macOS 빌드 받아서 실행하니 "확인되지 않은 개발자" 경고가 떠요**
A. Finder 에서 .app **우클릭 → 열기** 한 번만 하면 됩니다.
또는 터미널에서: `xattr -cr "/Applications/Server Check.app"`

**Q. 윈도우 .exe 가 SmartScreen 에 막혀요**
A. "추가 정보" → "실행" 클릭하면 됩니다.

---

## 📂 이 워크플로우의 동작 원리

`.github/workflows/build.yml` 파일이 모든 걸 정의합니다. 트리거는:

| 트리거 | 동작 |
|---|---|
| `main` 브랜치에 push | Mac + Windows 양쪽 빌드 |
| `v*` 태그 push (예: v1.0.0) | 빌드 + **자동 Release 생성** |
| Actions 탭에서 수동 실행 | "Run workflow" 버튼으로 언제든 |

코드를 push 안 해도 Actions 탭에서 수동 실행 버튼이 있어서 편합니다.
