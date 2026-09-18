# PMAI — AI Social Operator

Desktop app: soạn bài Facebook bằng AI, **bạn duyệt**, rồi **Chrome trên máy bạn** mới đăng.

- Không lấy mật khẩu Facebook
- Không copy cookie / token giữa hồ sơ
- Tự quét Chrome User Data, **chọn sẵn và kết nối hồ sơ đã login Facebook**
- Composer Facebook không mở trước khi bạn bấm Duyệt

Repo: https://github.com/phanduc2689-lgtm/pmai-ai-social-operator

## Cài trên Windows (cách đang dùng)

Cần: [Node.js 22+](https://nodejs.org/), [Google Chrome](https://www.google.com/chrome/). Git không bắt buộc nếu bạn tải ZIP.

Mở **Command Prompt**:

```bat
git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat
```

Hoặc tải ZIP từ GitHub → giải nén → vào **thư mục có file** `CAI-DAT-WINDOWS.bat` + `package.json` → chạy file đó.

File `CAI-DAT-WINDOWS.bat` sẽ: `npm install` → cài Chrome cho Playwright → mở app Electron.

### Nếu đã cài bản cũ (lỗi spawn EINVAL)

Đó là lỗi Node 24 trên Windows khi gọi `npx.cmd`. Bản mới đã sửa. Lấy lại source rồi chạy:

```bat
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat
```

Nếu tải ZIP: tải lại file ZIP mới nhất, giải nén đè lên thư mục cũ, chạy lại `CAI-DAT-WINDOWS.bat`.

### Kết nối Chrome đã login

1. **Đóng hết cửa sổ Google Chrome** trước khi bấm kết nối (hoặc chạy `open-chrome-debug.bat`).
2. PMAI quét `%LOCALAPPDATA%\Google\Chrome\User Data`.
3. Hồ sơ có dấu hiệu Facebook (chỉ kiểm tra host `facebook.com` trong file Cookies — **không đọc/ghi giá trị cookie**) được **chọn sẵn và tự kết nối**.
4. Nếu Chrome đang mở và khóa profile:
   - Đóng hết Chrome rồi kết nối lại, **hoặc**
   - Chạy `open-chrome-debug.bat` (mở Chrome với `--remote-debugging-port=9222`) rồi kết nối. PMAI ưu tiên CDP `9222`.
5. Nếu Facebook đã login, bước 2 tự xong. Nếu thấy màn login: login tay trên cửa sổ Chrome.
6. Dán URL **Page Facebook thật** → chọn trang → Tạo bài đăng → Gửi duyệt → **Duyệt & cho phép đăng**. Lúc đó Playwright mới gõ bài trên Chrome.

Thanh trạng thái trên cùng hiện `Chrome đã gắn · CDP 9222` khi kết nối thành công.

## Không làm

- Không bypass CAPTCHA / checkpoint
- Không export cookie
- Không đăng khi chưa duyệt
- Không kèm API key trong repo

LLM: tự dán API key (BYOK) trong Cài đặt, hoặc dùng Demo.

## Lệnh khác

```bat
npm test
npm run typecheck
npm start
```
