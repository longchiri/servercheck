#!/usr/bin/env bash
# ============================================================
# iDRAC Viewer  -  macOS .app 빌드 스크립트  (PySide6 기반)
# 사용:
#   cd ~/Documents/Claude/Projects/델\ 관리시스템
#   chmod +x build_mac.sh
#   ./build_mac.sh
# 결과:  dist/iDRAC\ Viewer.app  (더블클릭으로 실행)
# ============================================================
set -e

APP_NAME="iDRAC Toolkit"
ENTRY="dell_viewer.py"
BUNDLE_ID="com.longchiri.idracviewer"

cd "$(dirname "$0")"

# 1) python 확인 (Homebrew Python 3.13 우선, 없으면 시스템 python3)
PY=""
for candidate in /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13 /opt/homebrew/bin/python3.12 /usr/local/bin/python3.12 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PY="$candidate"; break
  fi
done
if [ -z "$PY" ]; then
  echo "❌ python3 가 없습니다. https://www.python.org/downloads/macos/ 에서 설치하세요."
  exit 1
fi
echo "✅ Python: $PY ($($PY --version))"

# 2) venv (이름 .venv_qt 로 따로 만들어서 기존 .venv와 분리)
if [ ! -d ".venv_qt" ]; then
  echo "🟡 가상환경(.venv_qt) 생성 중..."
  "$PY" -m venv .venv_qt
fi
# shellcheck disable=SC1091
source .venv_qt/bin/activate

# 3) 패키지 설치
echo "🟡 PySide6, requests, openpyxl, pyinstaller 설치 중..."
pip install --upgrade pip >/dev/null
pip install PySide6 requests requests-toolbelt openpyxl pyinstaller >/dev/null

# 4) 기존 빌드 정리
rm -rf build dist "${APP_NAME}.spec"

# 5) PyInstaller 빌드 (.app)
echo "🟡 .app 번들 빌드 중... (수 분 소요)"
ICON_ARG=""
if [ -f "iDRAC_Viewer.icns" ]; then
  ICON_ARG="--icon=iDRAC_Viewer.icns"
fi

ADD_DATA_ARG=""
for f in iDRAC_Viewer.icns iDRAC_Viewer.png iDRAC_Viewer.ico; do
  if [ -f "$f" ]; then
    ADD_DATA_ARG="$ADD_DATA_ARG --add-data $f:."
  fi
done

pyinstaller \
  --windowed \
  --noconfirm \
  --clean \
  --name "${APP_NAME}" \
  --osx-bundle-identifier "${BUNDLE_ID}" \
  $ICON_ARG \
  $ADD_DATA_ARG \
  "${ENTRY}"

echo ""
echo "🟡 격리 속성 제거 + Ad-hoc 서명 적용 중..."
xattr -cr "dist/${APP_NAME}.app" 2>/dev/null || true
codesign --deep --force --sign - "dist/${APP_NAME}.app" 2>/dev/null || true

echo ""
echo "✅ 완료!"
echo "   생성된 앱: $(pwd)/dist/${APP_NAME}.app"
echo ""
echo "💡 실행 방법:"
echo "   open \"$(pwd)/dist/${APP_NAME}.app\""
echo ""
echo "💡 이 로컬 빌드는 자체 서명 + 격리 속성 제거된 상태입니다."
echo "   만약 그래도 경고가 뜨면:"
echo "   xattr -cr \"$(pwd)/dist/${APP_NAME}.app\""
