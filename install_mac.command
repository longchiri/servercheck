#!/usr/bin/env bash
# ============================================================
#  iDRAC Toolkit — macOS 자동 설치 스크립트
#
#  사용:  이 파일(install_mac.command)을 더블클릭하면 자동으로:
#    1. /Applications/iDRAC Toolkit.app 로 이동
#    2. 격리 속성 제거 (Gatekeeper 경고 회피)
#    3. Ad-hoc 서명 (자체 서명)
#    4. Finder 로 앱 표시
#
#  → 이후로는 "확인되지 않은 개발자" 경고 없이 그냥 더블클릭으로 실행!
# ============================================================

set -e
cd "$(dirname "$0")"

APP_NAME="iDRAC Toolkit.app"
DEST="/Applications/$APP_NAME"

# 예쁘게 출력
echo ""
echo "================================================"
echo "  🔧 iDRAC Toolkit — macOS 설치 스크립트"
echo "================================================"
echo ""

# 1) 앱 파일 확인
if [ ! -d "./$APP_NAME" ]; then
    echo "❌ '$APP_NAME' 를 찾을 수 없습니다."
    echo "   이 스크립트를 zip 압축을 푼 폴더에서 실행해야 합니다."
    echo ""
    echo "   현재 위치: $(pwd)"
    echo ""
    read -n 1 -s -r -p "아무 키나 누르면 창이 닫힙니다..."
    exit 1
fi

# 2) 기존 앱 제거
if [ -d "$DEST" ]; then
    echo "🟡 기존 앱 발견 — 제거 중..."
    rm -rf "$DEST"
fi

# 3) 앱 복사
echo "🟡 앱을 /Applications/ 로 복사 중..."
cp -R "./$APP_NAME" /Applications/

# 4) 격리 속성 제거 (Gatekeeper 우회)
echo "🟡 격리 속성 제거 중..."
xattr -cr "$DEST" 2>/dev/null || true

# 5) Ad-hoc 자체 서명
echo "🟡 Ad-hoc 서명 적용 중..."
codesign --deep --force --sign - "$DEST" 2>/dev/null || {
    echo "   (서명 실패해도 계속 진행 — 격리 속성 제거만으로 대부분 해결됨)"
}

# 6) 완료
echo ""
echo "================================================"
echo "  ✅ 설치 완료!"
echo "================================================"
echo ""
echo "  이제 응용프로그램 → iDRAC Toolkit 을 클릭하면"
echo "  경고 없이 바로 실행됩니다."
echo ""
echo "  Dock 에 추가하려면:"
echo "  응용프로그램 → iDRAC Toolkit 을 Dock 으로 드래그"
echo ""

# 7) Finder 에서 앱 위치 표시
open -R "$DEST"

echo ""
read -n 1 -s -r -p "아무 키나 누르면 이 창을 닫습니다..."
echo ""
