@echo off
chcp 65001 >nul
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Khong thay chrome.exe. Cai Google Chrome roi thu lai.
  pause
  exit /b 1
)

echo Dong HET cua so Chrome hien tai (neu khong, cong 9222 se khong mo).
pause

start "" "%CHROME%" --remote-debugging-port=9222 --profile-directory=Default https://www.facebook.com/
echo.
echo Chrome debug 9222. Quay lai PMAI, bam Ket noi ho so da chon.
echo Neu Facebook nam o Profile 1/2: chon dung ho so trong app — app se tu gan.
pause
