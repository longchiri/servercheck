@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  iDRAC Toolkit - Windows 자동 설치 스크립트
REM
REM  사용: 이 파일(install_win.bat)을 더블클릭하면 자동으로:
REM    1. %LOCALAPPDATA%\iDRAC_Toolkit\ 로 이동 (사용자 권한, 관리자 X)
REM    2. 바탕화면에 바로가기 생성
REM    3. Windows Defender SmartScreen "확인되지 않은 게시자" 경고 안내
REM ============================================================

echo.
echo ================================================
echo   iDRAC Toolkit - Windows 설치 스크립트
echo ================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "EXE_NAME=iDRAC_Toolkit.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\iDRAC_Toolkit"

REM 1) .exe 파일 확인
if not exist "%SCRIPT_DIR%%EXE_NAME%" (
    echo [X] "%EXE_NAME%" 을 찾을 수 없습니다.
    echo     이 스크립트를 zip 압축을 푼 폴더에서 실행하세요.
    echo.
    echo     현재 위치: %SCRIPT_DIR%
    echo.
    pause
    exit /b 1
)

REM 2) 기존 설치 확인
if exist "%INSTALL_DIR%" (
    echo [!] 기존 설치 발견 - 제거 중...
    rmdir /s /q "%INSTALL_DIR%"
)

REM 3) 폴더 생성 + 파일 복사
echo [1/4] 앱을 %INSTALL_DIR% 로 설치 중...
mkdir "%INSTALL_DIR%"
copy /y "%SCRIPT_DIR%%EXE_NAME%" "%INSTALL_DIR%\%EXE_NAME%" >nul

REM 4) 바탕화면 바로가기 생성
echo [2/4] 바탕화면 바로가기 생성 중...
set "SHORTCUT=%USERPROFILE%\Desktop\iDRAC Toolkit.lnk"
powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT%'); $Shortcut.TargetPath = '%INSTALL_DIR%\%EXE_NAME%'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%INSTALL_DIR%\%EXE_NAME%'; $Shortcut.Description = 'iDRAC Toolkit - Dell PowerEdge Server Management'; $Shortcut.Save()"

REM 5) 시작 메뉴 바로가기 생성
echo [3/4] 시작 메뉴 바로가기 생성 중...
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\iDRAC Toolkit.lnk"
powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%START_MENU%'); $Shortcut.TargetPath = '%INSTALL_DIR%\%EXE_NAME%'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%INSTALL_DIR%\%EXE_NAME%'; $Shortcut.Description = 'iDRAC Toolkit'; $Shortcut.Save()"

REM 6) 완료
echo [4/4] 설치 완료!
echo.
echo ================================================
echo   [V] 설치 완료
echo ================================================
echo.
echo   설치 위치: %INSTALL_DIR%
echo   바탕화면 바로가기: iDRAC Toolkit
echo   시작 메뉴: iDRAC Toolkit
echo.
echo ================================================
echo   [!] 처음 실행 시 안내
echo ================================================
echo.
echo   Windows SmartScreen 이 "확인되지 않은 게시자" 경고를 띄우면:
echo.
echo     1. "추가 정보" (More info) 클릭
echo     2. "실행" (Run anyway) 클릭
echo.
echo   한 번만 하면 다음부터는 그냥 실행됩니다.
echo.
echo ================================================
echo   [!] Windows Defender 오탐지 시
echo ================================================
echo.
echo   Defender 가 파일을 격리했다면 (파이인스톨러 앱은 종종 오탐지됨):
echo.
echo     1. Windows 보안 열기
echo     2. 바이러스 및 위협 방지 - 보호 기록
echo     3. 항목 선택 - "복원" 클릭
echo     4. 또는 폴더 예외 등록:
echo        Windows 보안 - 바이러스 및 위협 방지
echo        - 설정 관리 - 제외 - 제외 추가 - 폴더
echo        - %INSTALL_DIR% 선택
echo.
echo ================================================
echo.

REM 7) 앱 실행할지 물어보기
choice /c YN /m "지금 iDRAC Toolkit 을 실행하시겠습니까? (Y/N)"
if errorlevel 2 goto :end
if errorlevel 1 (
    echo.
    echo iDRAC Toolkit 실행 중...
    start "" "%INSTALL_DIR%\%EXE_NAME%"
)

:end
echo.
echo 아무 키나 누르면 이 창을 닫습니다.
pause >nul
endlocal
