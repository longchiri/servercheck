#!/usr/bin/env bash
# ============================================================
# 폴더 정리 스크립트 — 옛 파일/빌드 부산물/무관 파일 삭제
# 사용: chmod +x cleanup.sh && ./cleanup.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "🧹 불필요한 파일 정리 시작..."
echo ""

# 옛 Tkinter 버전 파일 (이제 PySide6 버전 dell_viewer.py 만 사용)
rm -f dell_app.py
rm -f build_mac_app.sh

# PyInstaller 빌드 부산물 (다시 빌드하면 재생성됨)
rm -rf build/
rm -rf dist/
rm -f "Server Check.spec"
rm -f "Dell관리시스템.spec"
rm -f "Dell관리시스템 2.spec"
rm -f "iDRAC Viewer.spec"

# 파이썬 캐시
rm -rf __pycache__/
find . -name "*.pyc" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true

# 옛 가상환경들 (빌드 스크립트가 재생성함)
rm -rf .venv/
rm -rf .venv_qt/
rm -rf .venv_qt_win/

# 무관한 옛 앱들
rm -rf "DellTSRAnalyzer.app"
rm -rf "DellTSRAnalyzer 2.app"
rm -f "DellTSRAnalyzer.zip"
rm -f "DellTSRAnalyzer_Windows.zip"

echo "✅ 정리 완료!"
echo ""
echo "남은 파일:"
ls -la | grep -v "^d.*\..$\|^d.*\.\.$\|^total" | awk '{print "  ", $NF}'
echo ""
echo "💡 이제 정리된 폴더에서 ./build_mac.sh 로 빌드하세요."
