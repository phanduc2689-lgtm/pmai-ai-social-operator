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
