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

REM Node 24 doc sai file .mjs neu duong dan co dau cach (vi du "PM TRAVEL").
echo %cd% | find " " >nul
if not errorlevel 1 (
  echo Duong dan co dau cach. Gan o dia ao de Node 24 doc dung JavaScript.
  for %%D in (P Q R S T) do (
    subst %%D: "%cd%" >nul 2>&1
    if exist %%D:\package.json (
      %%D:
      cd \
      echo Dang cai tu %%D:\
      goto mapped
    )
    subst %%D: /d >nul 2>&1
  )
  echo Khong gan duoc o dia ao. Doi thu muc sang F:\pmai roi chay lai.
  pause
  exit /b 1
)
:mapped

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

echo [2/3] Kiem tra Playwright. Khong chay "npx playwright install chrome" — lenh do loi tren Node 24.
node scripts\ensure-playwright.cjs
if errorlevel 2 (
  echo Playwright hong hoac thieu. Dang cai lai playwright@1.63.0 ...
  if exist node_modules\playwright rmdir /s /q node_modules\playwright
  if exist node_modules\playwright-core rmdir /s /q node_modules\playwright-core
  call npm install playwright@1.63.0 --save-dev --no-fund --no-audit
  node scripts\ensure-playwright.cjs
  if errorlevel 1 (
    echo Van loi. Xoa ca thu muc node_modules roi chay lai file nay.
    pause
    exit /b 1
  )
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
