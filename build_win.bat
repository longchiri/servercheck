@echo off
REM ============================================================
REM  iDRAC Viewer - Windows .exe 빌드 스크립트 (PySide6 기반)
REM
REM  사용 방법:
REM   1) Windows 10/11 PC에 Python 3.11 이상 설치
REM      https://www.python.org/downloads/windows/
REM      ※ 설치 시 "Add Python to PATH" 체크 꼭 할 것
REM   2) 이 폴더 전체를 Windows PC 로 복사
REM   3) build_win.bat 를 더블클릭
REM
REM  결과: dist\iDRAC_Viewer.exe   (단일 실행 파일)
REM ============================================================

cd /d "%~dp0"

set APP_NAME=Server_Check
set ENTRY=dell_viewer.py

echo.
echo === [1/5] Python 확인 ===
where python >nul 2>&1
if errorlevel 1 (
    echo.
    echo [X] Python 이 설치되어 있지 않거나 PATH 에 없습니다.
    echo     https://www.python.org/downloads/windows/  에서 설치 후
    echo     "Add Python to PATH" 옵션을 체크해 주세요.
    echo.
    pause
    exit /b 1
)
python --version

echo.
echo === [2/5] 가상환경 생성 ===
if not exist .venv_qt_win (
    python -m venv .venv_qt_win
)
call .venv_qt_win\Scripts\activate.bat

echo.
echo === [3/5] 패키지 설치 (PySide6, requests, openpyxl, pyinstaller) ===
python -m pip install --upgrade pip
python -m pip install PySide6 requests requests-toolbelt openpyxl pyinstaller

echo.
echo === [4/5] 기존 빌드 정리 ===
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist %APP_NAME%.spec del /q %APP_NAME%.spec

echo.
echo === [5/5] PyInstaller 빌드 (수 분 소요) ===
set ICON_ARG=
if exist iDRAC_Viewer.ico set ICON_ARG=--icon=iDRAC_Viewer.ico

set ADD_DATA_ARG=
if exist iDRAC_Viewer.ico set ADD_DATA_ARG=%ADD_DATA_ARG% --add-data "iDRAC_Viewer.ico;."
if exist iDRAC_Viewer.png set ADD_DATA_ARG=%ADD_DATA_ARG% --add-data "iDRAC_Viewer.png;."
if exist iDRAC_Viewer.icns set ADD_DATA_ARG=%ADD_DATA_ARG% --add-data "iDRAC_Viewer.icns;."

pyinstaller ^
  --windowed ^
  --onefile ^
  --noconfirm ^
  --clean ^
  --name "%APP_NAME%" ^
  %ICON_ARG% ^
  %ADD_DATA_ARG% ^
  "%ENTRY%"

if errorlevel 1 (
    echo.
    echo [X] 빌드 실패. 위의 오류 메시지를 확인하세요.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo [V] 완료!
echo.
echo  생성된 실행 파일: %CD%\dist\%APP_NAME%.exe
echo.
echo  더블클릭하면 바로 실행됩니다.
echo  바탕화면이나 다른 폴더로 옮겨도 동작합니다.
echo ============================================================
echo.
pause
