@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PMAI - Cai dat Windows

where node >nul 2>&1
if errorlevel 1 (
  echo Can Node.js 22+: https://nodejs.org
  pause
  exit /b 1
)

echo.
echo === PMAI AI Social Operator ===
echo Thu muc: %cd%
echo.

if not exist package.json (
  echo Thieu package.json.
  echo Neu ban tai ZIP: vao dung thu muc co file CAI-DAT-WINDOWS.bat va package.json.
  echo Hoac: git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Dang npm install ...
  call npm install
  if errorlevel 1 (
    echo npm install loi.
    pause
    exit /b 1
  )
) else (
  echo [1/3] node_modules da co.
)

echo [2/3] Cai Chrome cho Playwright (lan dau)...
call npx playwright install chrome
if errorlevel 1 (
  echo playwright install chrome loi — van co the dung neu da cai Google Chrome.
)

echo.
echo [3/3] QUAN TRONG: Dong HET cua so Google Chrome truoc khi tiep tuc.
echo Neu muon giu Chrome dang mo, chay open-chrome-debug.bat roi quay lai.
echo App se tu chon ho so da login Facebook va ket noi CDP 9222.
echo.
pause

echo Dong electron.exe cu (tranh cua so an)...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 1 /nobreak >nul

call npm start
if errorlevel 1 pause
