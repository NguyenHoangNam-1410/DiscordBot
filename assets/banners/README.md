# Banner graphics

Mỗi banner có thư mục theo banner ID: `assets/banners/<id>/`.

- `banner.jpg`: ảnh dùng trong Discord, tỉ lệ 3:1; Venance 1500 × 500 px.
- `original.png`: ảnh gốc từ imagegen.
- `generation.json`: prompt và kích thước gốc.

Cấu hình `graphic` trong `src/hardcore/gacha/banners.json` dùng đường dẫn tương đối từ thư mục này. Bot gửi ảnh bằng attachment, không cần dịch vụ host ảnh riêng. Khi đưa code lên server, đưa cả thư mục assets/banners.
