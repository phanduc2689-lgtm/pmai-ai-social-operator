# PMAI desktop (Electron)

Runtime: `apps/desktop/dist-main/main.cjs` (`package.json` `"main"`).

Trên Windows:

```
git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat
```

Main process quét Chrome User Data, tự chọn hồ sơ `facebookLikely`, gắn CDP `9222` hoặc spawn Chrome với `--remote-debugging-port=9222`. Không copy cookie. Renderer không import Playwright.
