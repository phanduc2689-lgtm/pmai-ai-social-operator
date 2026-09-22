# PMAI 1.2.9 — 2026-09-22

Fanpage: popup «Chat trực tiếp với khách hàng» hiện **ngay khi bấm Đăng** (và có thể sau Tiếp). Không đợi modal đóng 30s.

- Bấm **Lúc khác** (không Thêm nút)
- Bấm **Đăng** lại
- Cùng xử lý nếu popup hiện sau Tiếp

Profile / Group không đổi.

# PMAI 1.2.8 — 2026-09-22

Chỉ **Fanpage**. Profile / Group không đổi.

Popup «Chat trực tiếp với khách hàng» (Thêm nút / Lúc khác) có thể hiện khi đăng ảnh hoặc video. PMAI kiểm tra; nếu có thì bấm **Lúc khác**, không bấm Thêm nút, rồi Đăng.

# PMAI 1.2.7 — 2026-09-22

Chỉ **Fanpage + video + caption**. Profile / Group / Fanpage ảnh+chữ giữ nguyên.

Sau «Tiếp» Facebook mở **Chỉnh sửa thước phim** (không phải Cài đặt bài viết):

1. Tạo bài viết → Tiếp
2. Chỉnh sửa thước phim → Tiếp
3. Cài đặt thước phim → Đăng (cặp Lưu + Đăng)

# PMAI 1.2.6 — 2026-09-22

- **Khóa** luồng đăng Trang cá nhân và Group (chữ / ảnh / video) — không sửa thêm.
- Fanpage: nhận cả URL doanh nghiệp (`facebook.com/ten-trang`) và fanpage cá nhân (`profile.php?id=…`). Chỉ chặn URL group.

# PMAI 1.2.5 — 2026-09-22

Ảnh **đã hiện trong modal** (nút «Chỉnh sửa») nhưng PMAI báo chưa thấy ảnh nên **không gõ caption**.

- Nhận thumbnail Facebook: overlay «Chỉnh sửa», «Thêm ảnh bìa», ảnh nền — không chỉ `<img>` 72px.
- Có preview thì mới điền caption rồi Đăng.

# PMAI 1.2.4 — 2026-09-21

Sửa **không gắn được ảnh/video trong modal Tạo bài viết**.

- Bấm «Ảnh/video» trên toàn trang (không chỉ role=dialog).
- `setInputFiles` vào input ẩn kể cả khi `accept` chỉ có ảnh (Playwright không mở hộp Open Windows).
- Video không còn bị loại chỉ vì picker Facebook là image-only.

# PMAI 1.2.3 — 2026-09-21

Bài kèm ảnh/video: **gắn media trước**, điền caption sau, rồi mới Đăng.

- Bấm «Ảnh/video» trong «Thêm vào bài viết của bạn» (không dùng input cover/avatar).
- Chặn filechooser Playwright — không để hộp Open Windows treo.
- Sau khi có thumbnail mới gõ nội dung.

# PMAI 1.2.2 — 2026-09-21

Sửa **ảnh upload nhưng không hiện trong composer** (PROFILE `MEDIA_PREVIEW_READY` timeout → không bấm Đăng).

- Gắn ảnh vào `input[type=file]` **trong modal Tạo bài viết**, không vào input cover/avatar của trang.
- Chờ thumbnail lớn (bỏ qua avatar 40px). Thiếu preview → không đăng bài chỉ có chữ.
- Profile: «Bạn đang nghĩ gì?» → Tạo bài viết → caption → Ảnh/video → Đăng. Không dùng «Chia sẻ suy nghĩ…».
- Group: «Bạn viết gì đi…» → Tạo bài viết → Đăng.
- Fanpage: Tiếp → Cài đặt bài viết → Đăng (giữ nguyên).

# PMAI 1.2.1 — 2026-09-21

Sửa **không mở được composer** trên group/profile (lỗi `Không thấy ô soạn Bạn đang nghĩ gì`).

- Chờ feed Facebook hydrate sau khi mở URL.
- Nhận cả placeholder tiếng Anh (Write something / Create a public post) và tiếng Việt.
- Không bấm nhầm «Tạo nhóm mới» / «Đăng ẩn danh».
- Fanpage Tiếp → Đăng giữ nguyên.

# PMAI 1.2.0 — 2026-09-21

Mở rộng đích đăng Facebook: **Trang cá nhân + Fanpage + Group**.

- Tài khoản: Chrome profile → Facebook identity → đích (PROFILE / PAGE / GROUP).
- Composer lọc đích theo loại. Fanpage giữ luồng cũ: Tiếp → Cài đặt bài viết → Đăng.
- Trang cá nhân / Group: modal Tạo bài viết → Đăng (không bấm Tiếp, không bật Đăng ẩn danh).
- Không phá Page publishing, approval, media upload, CDP.

# PMAI 1.0.1 — 2026-09-20

Sửa **upload video + caption**: không còn mở hộp Open Windows (picker ảnh `.tif/.jfif`), không đăng bài chỉ có chữ.

- Gắn mp4/mov vào `input[type=file]` nhận video (`setInputFiles`), không bấm nhầm ô ảnh.
- Chờ player / «Đang tải» trước khi bấm Tiếp/Đăng. Thiếu video thì dừng, không auto đăng.
- Luồng ảnh và đăng bài giữ nguyên.

# PMAI 1.0.0 — 2026-09-20

Bản chốt bước đầu: **soạn bài + ảnh/video → duyệt tay → đăng lên Facebook Page thành công**.

## Đã xong trong 1.0

- Gắn Chrome đã login (CDP). Không lưu mật khẩu / cookie Facebook.
- Soạn caption, đính ảnh hoặc video từ máy (`localPath`). Không upload id nội bộ `med_*`.
- Bắt buộc duyệt trước khi mở composer.
- Luồng Page composer: **Tạo bài viết → Tiếp → Cài đặt bài viết → Đăng** (nút footer, cặp Lưu + Đăng).
- Không bấm nhầm «Đăng ngay» / «Tiếp cận nhiều người…».
- Sai trang → `ACCOUNT_MISMATCH`. CAPTCHA / checkpoint dừng, không bypass.
- Đăng xong không tự retry. Task `NEEDS_VERIFICATION` phải xác nhận tay.

## Cách lấy đúng bản này

Tải ZIP gắn tag (đừng dùng thư mục ZIP cũ):

https://github.com/phanduc2689-lgtm/pmai-ai-social-operator/releases/tag/v1.0.0

Hoặc:

```bat
git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
git checkout v1.0.0
CAI-DAT-WINDOWS.bat
```
