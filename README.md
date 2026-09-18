# PMAI — AI Social Operator

Desktop app: soạn bài Facebook bằng AI, **bạn duyệt**, rồi **Chrome trên máy bạn** mới đăng.

- Không lấy mật khẩu Facebook
- Không copy cookie / token giữa hồ sơ
- Tự quét Chrome User Data, **chọn sẵn hồ sơ đã login Facebook**
- Composer Facebook không mở trước khi bạn bấm Duyệt

Repo: https://github.com/phanduc2689-lgtm/pmai-ai-social-operator

## Cài trên Windows (cách đang dùng)

Cần: [Node.js 22](https://nodejs.org/), Google Chrome, Git.

```bat
git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
npm install
npx playwright install chrome
CAI-DAT-WINDOWS.bat
```

Hoặc `npm run electron:dev` sau khi **đóng hết cửa sổ Chrome**.

### Kết nối Chrome đã login

1. PMAI quét `%LOCALAPPDATA%\Google\Chrome\User Data`.
2. Hồ sơ có dấu hiệu Facebook (chỉ kiểm tra host `facebook.com` trong file Cookies — **không đọc/ghi giá trị cookie**) được chọn sẵn.
3. Bấm **Kết nối hồ sơ đã chọn**.
4. Nếu Chrome đang mở và khóa profile:
   - Đóng hết Chrome rồi kết nối lại, **hoặc**
   - Chạy `open-chrome-debug.bat` (mở Chrome với `--remote-debugging-port=9222`) rồi kết nối. PMAI ưu tiên CDP `9222`.
5. Nếu Facebook đã login, bước 2 tự xong. Nếu thấy màn login: login tay trên cửa sổ Chrome.
6. Dán URL **Page Facebook thật** → chọn trang → Tạo bài đăng → Gửi duyệt → **Duyệt & cho phép đăng**.

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
npm run electron:dev
```
