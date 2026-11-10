# Nhạc nền web game

Đặt tệp MP3, OGG, WAV hoặc M4A trong assets/bgm rồi khởi động lại bot để cập nhật danh sách. Chỉ phục vụ tệp nhạc trực tiếp trong thư mục này; không mở toàn bộ thư mục assets. Máy chủ truyền tệp theo từng phần để trình duyệt tua và tiếp tục phát sau tải lại.

Mỗi tab mới xáo trộn toàn bộ danh sách. Hết một bài sẽ chuyển bài tiếp theo, dùng hết danh sách mới xáo lại; tránh phát lại ngay bài vừa kết thúc khi có nhiều bài. Bài không phát được được bỏ qua trong phiên hiện tại.

Tiến trình gồm thứ tự, bài đang phát và vị trí được lưu trong sessionStorage dùng chung cho các trang game của cùng tab. Reload hoặc chuyển game trong cùng tab sẽ tiếp tục tại vị trí đã lưu. Đóng tab rồi mở lại có thể bắt đầu danh sách mới. Dữ liệu hỏng hoặc danh sách tệp thay đổi sẽ tạo danh sách mới.

Nút ♫ trên thanh đầu bật/tắt riêng BGM. Tắt rồi bật giữ vị trí; tùy chọn bật/tắt được nhớ qua localStorage. Âm lượng mặc định 15%. Nếu trình duyệt chặn tự phát, nút hiển thị đang chờ và nhạc bắt đầu sau thao tác người dùng; không ảnh hưởng đồng hồ hay nước đi. Không có danh sách hoặc toàn bộ tệp lỗi thì nút nhạc bị vô hiệu hóa.

Kiểm tra: npm run test:web:bgm và npm run test:web:feedback:ui. Suite trình duyệt xác minh tải/giải mã tệp thật, tiếp tục sau reload, một vòng không lặp và nút bật/tắt.
