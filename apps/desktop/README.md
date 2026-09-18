# PMAI desktop (Electron)

Runtime entry: `apps/desktop/dist-main/main.cjs` (package.json `"main"`).

Trên Windows:

```
npm install
npx playwright install chrome
CAI-DAT-WINDOWS.bat
```

Main process quét Chrome User Data, tự chọn hồ sơ `facebookLikely`, gắn CDP `9222` hoặc spawn Chrome với `--remote-debugging-port=9222`. Không copy cookie.

Renderer không import `playwright`. Domain engine không import adapter Node.
