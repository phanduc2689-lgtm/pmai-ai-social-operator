@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Can Node.js 22: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dang npm install ...
  call npm install
  if errorlevel 1 (
    echo npm install loi.
    pause
    exit /b 1
  )
)

echo Cai Chrome cho Playwright (lan dau)...
call npx playwright install chrome

echo.
echo QUAN TRONG: Dong HET cua so Google Chrome truoc khi tiep tuc.
echo Neu muon giu Chrome dang mo, hay dung open-chrome-debug.bat roi quay lai.
echo.
pause

call npm run electron:dev
if errorlevel 1 pause
