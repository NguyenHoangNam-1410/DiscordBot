# Walls / Wall Go

Game đối kháng hai người trên web dùng chung với caro. Không thêm cổng, địa chỉ Tailscale, thư viện hoặc thông tin đăng nhập mới. Không cược, không thưởng xu trong bản này.

## Lệnh

- `/walls choi`: bàn cố định 9×9, tường mặc định dài 2 ô, mỗi người 10 tường.
- `/walls choi daituong:1 sotuong:10`: độ dài chỉ 1 hoặc 2; số tường mỗi người 0–20. Luật cố định theo phòng.
- `/walls phong`: danh sách phân trang, mở đúng bàn hoặc tin phòng để tham gia. Mặc định 5 phòng/kênh; mỗi người tối đa một phòng Walls/server (độc lập caro).
- `/walls cauhinh phongtoida:10 kenh:#kenh`: quản trị chỉnh 1–20 phòng đang mở theo kênh; bỏ tham số để xem cấu hình. Giảm giới hạn không đóng ván hiện có.
- `/walls luat` hoặc `/luat trochoi:Walls`: luật ngắn. Mọi lệnh có bản `!walls ...` khi bật prefix, ví dụ `!walls choi daituong=1 sotuong=10`.

## Luật

X xuất phát ở giữa hàng 9, O ở giữa hàng 1; X đi trước. X thắng ngay khi tới bất kỳ ô nào ở hàng 1, O tới hàng 9. Mỗi lượt chỉ di chuyển hoặc đặt một tường.

Di chuyển một ô ngang/dọc nếu không có tường và ô đích trống. Khi sát đối thủ mà không có tường ở giữa, được nhảy thẳng qua. Nếu ô phía sau đối thủ bị tường hoặc mép bàn chặn, được nhảy vòng sang trái/phải của đối thủ, miễn không xuyên tường. Không đi chéo ở tình huống khác. Luật nhảy đối chiếu [hướng dẫn chính thức của Gigamic](https://export.gigamic.com/wp-content/uploads/2021/01/INS-RULES-QUORIDOR_10-2016.pdf); độ dài tường tùy chọn là biến thể của bot.

Tường đặt giữa các ô; có thể chạm đầu nhau nhưng không chồng hoặc cắt xuyên nhau. Sau mỗi lần đặt, máy chủ tìm đường cho cả hai người tới hàng đích, bỏ qua vị trí quân tạm thời khi kiểm tra. Không được khóa hết đường của đối thủ hoặc chính mình. Đặt không hợp lệ không mất tường, không đổi lượt, không đặt lại thời gian. Hết tường chỉ được di chuyển.

Mỗi lượt 90 giây; hết lượt xử thua. Hết 30 phút xử hòa. Phòng chờ 10 phút tự đóng. Đầu hàng trên web hoặc hủy phòng chờ trong Discord/web. Đồng hồ không dừng khi mất mạng hay bot khởi động lại.

## Web và tài khoản

Nút Mở bàn dẫn trực tiếp tới `/walls/room/<UUID>`. Khán giả thấy quân, tường và kết quả cập nhật trực tiếp qua SSE; không có quyền di chuyển, đặt tường hoặc đầu hàng. Người chơi xác nhận bằng mã trên web nhập vào nút Kết nối tài khoản của đúng phòng Discord. Phiên tài khoản dùng chung với caro, nhưng phải có ghế trong phòng Walls mới được thao tác.

Mã xác nhận riêng cho từng tab/phòng, không bị tab Caro hoặc Walls khác ghi đè. Nếu Discord đã xác nhận nhưng web gặp lỗi mạng, web tiếp tục thử lại trong thời hạn 5 phút của mã; tải lại đúng tab vẫn khôi phục được. Khi mã hết hạn hoặc trình duyệt chặn cookie phiên, web báo rõ cách xử lý thay vì chờ mãi.

Chọn Di chuyển và bấm ô sáng để đi. Chọn Đặt tường → hướng ngang/dọc → khe trên bàn → Xác nhận đặt tường. Máy chủ luôn kiểm tra lại lượt, phiên bản bàn, tường còn lại, va chạm và đường đi trước khi lưu.

Phím tắt: `WASD` hoặc mũi tên để đi (tự nhảy thẳng qua đối thủ khi hợp lệ); `R` xoay tường, giữ vị trí xem trước gần nhất; `F` đổi chế độ đi/đặt; `Enter` xác nhận tường; `Esc` hủy chọn. `Q/E/Z/C` chọn các hướng nhảy vòng chéo khi luật cho phép. Không xử lý khi gõ trong ô nhập/chọn, mở hộp thoại, giữ phím lặp, chưa tới lượt hoặc là khán giả. Mỗi lần bấm chỉ gửi một hành động, máy chủ kiểm tra lại như khi bấm chuột.

Tường xanh thuộc X, tường cam thuộc O; hàng đích có nhãn rõ trên/dưới bàn. Bản lưu SQLite gồm vị trí, tường, số tường còn lại, lượt, luật và thời hạn. Tin Discord cập nhật người tham gia/kết quả bằng hạ tầng chung; bot vẫn cần quyền Xem kênh để sửa lâu dài và sau restart.

## Triển khai và kiểm tra

Chạy `npm run test:walls`, `npm run test:caro`, `npm run test:changelog` để kiểm tra. Bộ Walls dùng SQLite trong bộ nhớ và HTTP localhost, không truy cập Discord thật. Bao gồm nhảy bốn hướng, tường chồng/cắt, chạm đầu, khóa đường cả hai bên, đầu/đích, lượt và bản cũ, tồn kho, timeout, lưu/đọc lại, khán giả, HTTP/SSE, command và prefix.

Cập nhật code, chạy `npm run register`, khởi động lại bot. Migration 62 thêm các bảng riêng `walls_rooms`, `walls_seats`, `walls_channel_settings`; không đổi dữ liệu caro. Giữ nguyên cổng web thì không cần đổi Tailscale/Funnel. Trang chủ web tự có thêm Walls.
