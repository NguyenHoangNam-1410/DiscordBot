# Ô ăn quan trên web

- `/oanquan choi [nguoitruoc:host|guest|random] [thoigian:1–180]`: mở phòng. Mặc định chủ phòng đi trước, 30 phút/người.
- `/oanquan phong`: phòng của kênh, 5 phòng/trang; `/oanquan cauhinh phongtoida:<1–20> [kenh]`: quản trị chỉnh giới hạn (mặc định 5). Mỗi người một phòng Ô ăn quan/server; nhiều phòng/kênh.
- Các lệnh có bản `!`. Không có lệnh con luật; đọc tại nút **Luật chơi** hoặc `/webgame`.
- Dùng chung web/Tailscale, mã xác nhận có nút sao chép, avatar, âm thanh, SSE cho hai người/khán giả và cập nhật tin phòng Discord. Không cược, thưởng tài nguyên, vật phẩm hay thành tựu.

## Bộ luật oanquan-v1

10 ô dân, mỗi ô 5 dân; hai đầu mỗi ô 1 quan. 1 dân = 1 điểm; 1 quan = 10 điểm. **Cho ăn quan non**, theo lựa chọn của chủ dự án.

Mỗi lượt chọn ô dân bên mình có quân và một trong hai hướng. Rải từng viên vào các ô kế tiếp, kể cả ô quan. Hết nắm, bốc tiếp nếu ô kế là ô dân có quân; ô kế là ô quan thì dừng. Nếu ô kế là ô dân trống, ăn toàn bộ ô ngay sau có quân; lặp chuỗi trống–có quân. Hai ô trống liên tiếp hoặc hết chuỗi thì đổi lượt.

Hàng Xanh: 1–5; hàng Cam: 7–11; quan trái 0, phải 6. Vòng 0→1→…→11→0 là hướng +1. Giao diện chỉ dùng tên Xanh/Cam và mũi tên theo góc nhìn, không dùng tên X/O. Máy chủ giữ X/O làm khóa ghế chung của hệ thống.

Đến lượt mà cả hàng trống: dùng 5 dân đã ăn để đặt mỗi ô 1 dân, thiếu thì vay đúng phần thiếu từ kho đối thủ. Quan không đổi thành dân để rải. Dân vay chuyển thật giữa kho và bàn; nợ chỉ quyết toán khi tính điểm: điểm = dân + 10×quan − nợ mình + nợ đối thủ.

Khi hai quân quan đã bị ăn, thu dân mỗi hàng về bên đó. Để xác định rõ trường hợp dân được rải vào ô quan đã mất quan: dân còn trong ô quan trái về Xanh, phải về Cam. Không đủ dân để rải lại kể cả vay, lặp thế/kho/nợ/bên đi 3 lần, hoặc đủ 500 lượt cũng thu quân và chốt điểm. Nhiều điểm thắng, bằng điểm hòa. Một chuỗi bốc rải tự lặp được dừng để chuyển lượt; dữ liệu và số quân không bị đổi thêm.

Tham khảo cơ chế trò chơi dân gian và vay dân: [Tạp chí Đại học Hải Phòng](https://vjol.info.vn/index.php/dhhp/article/download/78037/66504). Giá trị quan, ăn quan non, thu dân ô quan và giới hạn chống lặp phía trên là bộ luật cụ thể của bản web.

## Animation và đồng hồ

Máy chủ xử lý một lượt nguyên tử, lưu bàn trước lượt và danh sách pickup/sow/capture/refill/seed/collect có mốc thời gian. Mỗi viên rải có chuyển động và nhịp sáng; ăn quân có hiệu ứng đập ô trống, ô bị ăn và quân bay về kho. Khán giả nhận cùng replay. Đồng hồ đối thủ chỉ bắt đầu sau replay, tối đa 14 giây/lượt; API chặn đi tiếp trong thời gian này. Không cộng thời gian suy nghĩ.

SSE và phản hồi POST trùng không phát lại lượt. Refresh/kết nối lại chỉ phát phần animation còn lại theo giờ máy chủ, không kéo dài lượt. Tab chạy nền tự bắt kịp khi quay lại; prefers-reduced-motion giảm chuyển động nhưng giữ nhịp và thời hạn chung. Dữ liệu lưu SQLite (migration 71), nên reload/restart giữ ván và kết quả.

PC dùng bàn ngang; điện thoại dùng vòng dọc, luôn thấy bàn và nút chọn hướng/xác nhận. Thông tin, lịch sử và tài khoản ở menu mở/đóng. Có xoay góc nhìn, xem điểm/kho/nợ và dialog đầu hàng. Phòng chờ hết hạn sau 10 phút; đồng hồ hết giờ hoặc đầu hàng xử thua.

## Kiểm tra

`npm run test:oanquan` kiểm tra luật, bảo toàn quân, vay/nợ, server replay/đồng hồ, rollback, SSE, auth, Discord/prefix, lưu ván và reset. `npm run test:oanquan:ui` chạy Chrome kiểm tra PC/mobile, chọn hướng, animation, spectator, dialog và kết quả. Chạy `npm run register` sau cập nhật và restart bot.
