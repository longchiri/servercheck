#!/usr/bin/env bash
# ============================================================
# Mac에서 Windows .exe 빌드 (Wine 사용)
# 사용:  chmod +x build_win_on_mac.sh && ./build_win_on_mac.sh
# 결과:  dist_win/Server_Check.exe
#
# ⚠ 주의:
#  - PyInstaller는 원래 크로스 빌드를 지원하지 않습니다.
#    Wine으로 "Mac 안에 가상 Windows" 를 만들어서 빌드합니다.
#  - 처음 실행 시 Wine + Windows용 Python 설치까지 자동 진행되며
#    시간이 좀 걸립니다 (10~30분, 인터넷 속도에 따라).
#  - Apple Silicon(M1/M2/M3)은 Rosetta 2가 필요할 수 있습니다.
# ============================================================
set -e
cd "$(dirname "$0")"

APP_NAME="Server_Check"
ENTRY="dell_viewer.py"
PYTHON_VER="3.11.9"
PYTHON_INSTALLER="python-${PYTHON_VER}-amd64.exe"
PYTHON_URL="https://www.python.org/ftp/python/${PYTHON_VER}/${PYTHON_INSTALLER}"

# -------- 1) Homebrew 확인 --------
if ! command -v brew >/dev/null 2>&1; then
  echo "❌ Homebrew가 필요합니다. 설치 후 다시 시도:"
  echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi

# -------- 2) Wine 설치 --------
if ! command -v wine64 >/dev/null 2>&1 && ! command -v wine >/dev/null 2>&1; then
  echo "🟡 Wine 설치 중..."
  # Apple Silicon은 Rosetta 2 먼저
  if [[ "$(uname -m)" == "arm64" ]]; then
    softwareupdate --install-rosetta --agree-to-license 2>/dev/null || true
  fi

  # 최신 Homebrew는 --no-quarantine 플래그가 삭제됨. 설치 후 xattr 로 수동 해제
  if ! brew install --cask wine-stable; then
    # wine-stable 캐스크가 없으면 wine 캐스크 시도
    brew install --cask wine || {
      echo "❌ Wine 설치 실패."
      echo "   수동 설치 후 다시 시도하세요:"
      echo "   https://wiki.winehq.org/MacOS"
      exit 1
    }
  fi

  # 격리 속성 수동 제거 (gatekeeper 우회 — 안전한 캐스크 검증된 앱)
  for app in "/Applications/Wine Stable.app" "/Applications/Wine.app"; do
    [ -d "$app" ] && xattr -dr com.apple.quarantine "$app" 2>/dev/null || true
  done
fi

# wine 명령 선택
WINE_CMD="$(command -v wine64 || command -v wine)"
echo "✅ Wine: $WINE_CMD"
$WINE_CMD --version

# -------- 3) Wine prefix 초기화 --------
export WINEPREFIX="$HOME/.wine_server_check"
export WINEARCH=win64
export WINEDEBUG="-all"

if [ ! -d "$WINEPREFIX" ]; then
  echo "🟡 Wine prefix 초기화 중..."
  $WINE_CMD wineboot --init 2>&1 | tail -3
  sleep 2
fi

# -------- 4) Windows용 Python 설치 (Wine 내부) --------
if ! $WINE_CMD python --version 2>/dev/null | grep -q "Python"; then
  echo "🟡 Windows용 Python ${PYTHON_VER} 다운로드 중..."
  if [ ! -f "/tmp/${PYTHON_INSTALLER}" ]; then
    curl -L -o "/tmp/${PYTHON_INSTALLER}" "${PYTHON_URL}"
  fi

  echo "🟡 Wine 안에 Python 설치 중 (자동, 1~3분)..."
  $WINE_CMD "/tmp/${PYTHON_INSTALLER}" /quiet PrependPath=1 InstallAllUsers=1 Include_test=0 Include_doc=0 Include_launcher=0
  sleep 3
fi

# Python 경로 확인
echo "✅ Wine Python:"
$WINE_CMD python --version 2>&1 || {
  echo "❌ Wine 안에서 python 명령을 찾을 수 없습니다."
  echo "   ~/.wine_server_check 를 삭제 후 다시 시도하거나 Python을 수동 설치하세요."
  exit 1
}

# -------- 5) 필요한 패키지 설치 --------
echo "🟡 PySide6, requests, openpyxl, pyinstaller 설치 중..."
$WINE_CMD python -m pip install --upgrade pip 2>&1 | tail -2
$WINE_CMD python -m pip install PySide6 requests openpyxl pyinstaller 2>&1 | tail -3

# -------- 6) 빌드 --------
echo "🟡 PyInstaller로 .exe 빌드 중..."
rm -rf build/ dist_win/ "${APP_NAME}.spec"

ICON_ARG=""
[ -f "iDRAC_Viewer.ico" ] && ICON_ARG="--icon=iDRAC_Viewer.ico"

ADD_DATA_ARG=""
for f in iDRAC_Viewer.ico iDRAC_Viewer.png iDRAC_Viewer.icns; do
  [ -f "$f" ] && ADD_DATA_ARG="$ADD_DATA_ARG --add-data $f;."
done

$WINE_CMD python -m PyInstaller \
  --windowed \
  --onefile \
  --noconfirm \
  --clean \
  --distpath dist_win \
  --name "${APP_NAME}" \
  $ICON_ARG \
  $ADD_DATA_ARG \
  "${ENTRY}"

echo ""
if [ -f "dist_win/${APP_NAME}.exe" ]; then
  echo "✅ 완료!"
  echo "   생성된 파일: $(pwd)/dist_win/${APP_NAME}.exe"
  echo ""
  echo "💡 USB/메일/클라우드로 Windows PC에 옮긴 뒤 더블클릭하면 실행됩니다."
  ls -lh "dist_win/${APP_NAME}.exe"
else
  echo "❌ 빌드 실패. 위의 오류 메시지를 확인하세요."
  exit 1
fi
