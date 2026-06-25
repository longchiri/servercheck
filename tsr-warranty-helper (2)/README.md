# TSR Warranty Helper — Chrome 확장 설치 가이드

tsr-cloud 앱의 워런티 미등록 서버를 Dell 공식 페이지에서 자동 조회해 저장합니다.

## 설치 방법 (개발자 모드)

1. 크롬 주소창에 다음 입력 후 Enter:
   ```
   chrome://extensions/
   ```

2. 우측 상단 **"개발자 모드"** 토글 ON

3. 좌측 상단 **"압축해제된 확장 프로그램 로드"** 클릭

4. 이 폴더를 선택:
   ```
   ~/Desktop/tsr-cloud/extension/
   ```

5. 설치 완료. 확장 목록에 **"Dell 서버관리 — 워런티 자동 조회"** 표시됨.

6. 우측 상단 퍼즐 🧩 아이콘 → 확장 옆 📌 핀 클릭 (툴바에 고정)

## 사용 방법

1. **tsr-cloud 앱** 열기: https://tsr-cloud.pages.dev/

2. 관리자로 로그인 (관리자만 사용 가능)

3. 좌측 사이드바 하단 → **"Dell 워런티 일괄 조회"** 메뉴 클릭

4. **"자동 조회 시작"** 버튼 클릭

5. 진행 상황 화면에 실시간 표시 — 끝나면 결과 리포트

## 동작 흐름

```
사용자
  ↓ 1. 자동 조회 시작 클릭
tsr-cloud 앱 (미등록 서버 목록)
  ↓ 2. 확장에 큐 전달
Chrome 확장 (background.js)
  ↓ 3. Dell 페이지 한 건씩 백그라운드 탭에서 오픈
Dell 페이지 (content_dell.js)
  ↓ 4. 자동으로 "서비스 관리" 클릭 → 데이터 추출
확장 → 앱에 결과 전달
  ↓ 5. Firestore 저장
완료
```

## 주의

- 본인이 **tsr-cloud 앱에 관리자로 로그인된 상태** 여야 워런티 저장 가능
- Dell 사이트가 갱신되면 데이터 추출 로직 업데이트 필요할 수 있음
- 한 번에 처리하면 Dell 측에서 일시적 차단 가능 → 확장이 자동으로 간격 두고 진행

## 파일 구성

- `manifest.json` — 확장 기본 정보 + 권한
- `background.js` — 백그라운드 워커, 큐 관리
- `content_dell.js` — Dell 페이지에서 데이터 추출
- `content_app.js` — tsr-cloud 앱과의 메시지 브릿지
- `popup.html` / `popup.js` — 확장 아이콘 클릭 시 팝업 UI
