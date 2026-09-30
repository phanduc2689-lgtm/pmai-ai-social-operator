@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PMAI

echo.
echo === PMAI AI Social Operator ===
echo Thu muc: %cd%
echo.

if not exist package.json (
  echo Thieu package.json. Mo dung thu muc repo (co CAI-DAT-WINDOWS.bat).
  pause
  exit /b 1
)

if exist .git (
  echo Dang git pull ban moi...
  git pull
) else (
  echo.
  echo ! CANH BAO: Thu muc nay KHONG phai git clone.
  echo Ban dang chay ZIP cu — crash GPU se con mai neu khong tai lai.
  echo Tai moi: https://github.com/phanduc2689-lgtm/pmai-ai-social-operator
  echo Hoac: git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
  echo.
  pause
)

echo %cd% | find " " >nul
if not errorlevel 1 (
  echo Duong dan co dau cach. Gan o dia ao de Node 24 doc dung JavaScript.
  for %%D in (P Q R S T) do (
    subst %%D: "%cd%" >nul 2>&1
    if exist %%D:\package.json (
      %%D:
      cd \
      echo Dang chay tu %%D:\
      goto mapped
    )
    subst %%D: /d >nul 2>&1
  )
  echo Khong gan duoc o dia ao. Doi thu muc sang F:\pmai roi chay lai.
  pause
  exit /b 1
)
:mapped

echo Dong electron.exe cu (neu con giu lock, cua so se khong hien)...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if not exist node_modules (
  echo Chua cai dat. Chay CAI-DAT-WINDOWS.bat truoc.
  pause
  exit /b 1
)

echo Mo PMAI (tat GPU Windows)...
echo Console phai co dong: PMAI boot gpu-swiftshader
echo Neu khong co dong do: chua lay duoc ban moi.
echo.
call npm start
if errorlevel 1 pause
