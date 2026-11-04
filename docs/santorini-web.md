# Santorini web · luật cơ bản, hai người

Phạm vi đã chọn: bàn 5×5, hai người, mỗi người hai thợ; không Thần lực, không biến thể 3–4 người. Dùng `/santorini choi`, `/santorini phong`, `/santorini luat`, `/santorini cauhinh`.

## Luật và thao tác

Hai bên lần lượt đặt hai thợ vào ô trống. Trong lượt, chọn một thợ để đi sang ô cạnh trống, kể cả chéo, rồi xây vào ô trống cạnh chính thợ vừa đi. Chỉ được leo một tầng, có thể xuống nhiều tầng. Không đi hay xây vào thợ hoặc mái vòm. Có thể xây ô vừa rời; chiều cao tháp được xây không phụ thuộc độ cao của thợ. Xây tầng 1, 2, 3 rồi mái vòm; số khối không giới hạn.

Đi từ tầng 2 lên tầng 3 thắng ngay và không xây nữa. Đi ngang giữa hai ô tầng 3 không tạo chiến thắng. Người không còn lượt đi và xây hợp lệ thua; không bỏ lượt.

Trên web: chọn thợ → ô đi → ô xây → Xác nhận. Xem trước và Hủy/Esc chỉ tác động trình duyệt; một lượt được gửi và kiểm tra trọn vẹn trên máy chủ. Nếu xây sai, cả bước đi chưa được thực hiện. Đích thắng cho xác nhận ngay sau chọn ô đi. Màu sáng chỉ ô hợp lệ; viền vàng đánh dấu vị trí thợ vừa đi và công trình vừa xây. Phím mũi tên đổi ô đang focus; Enter/Space chọn ô.

## Cấu hình và phòng

- `nguoitruoc`: Chủ phòng (`host`, mặc định), Khách (`guest`) hoặc Ngẫu nhiên (`random`). Người này đặt thợ và đi trước. Đây là cách thích nghi quy tắc người trẻ nhất của bản bàn giấy; bot không thu thập tuổi.
- `thoigian`: 1–180 phút/người, mặc định 30; chạy trong lượt đặt thợ và lượt đi/xây, không cộng giờ. Hết giờ hoặc đầu hàng thua. Phòng chờ đóng sau 10 phút.
- `/santorini cauhinh phongtoida:5`: quản trị đặt 1–20 phòng/kênh; mỗi người tối đa một phòng Santorini/server. Giảm giới hạn không đóng phòng hiện có.
- Không cần `/quantri datkenh`; không dùng catalog game Discord cũ. Không cược, thưởng xu hay thành tựu.
- Prefix tương ứng: `!santorini choi nguoitruoc=guest thoigian=15`; bỏ lệnh con mặc định `choi`.

Hai người tham gia qua tin phòng Discord; nút Mở bàn cờ là liên kết trực tiếp. Kết nối tài khoản bằng mã của tab web. Khán giả xem công khai, không có quyền đánh. Tin phòng tự cập nhật khi tham gia/kết thúc; người chơi cần quyền Xem kênh cho bot để đồng bộ lâu dài.

## Giao diện

PC ngang: bàn và thao tác bên trái, người chơi/đồng hồ/thông tin bên phải. Điện thoại dọc: bàn và thao tác trong vùng màn hình, hàng avatar/đồng hồ thu gọn, menu Thông tin/Tài khoản. Điện thoại ngang: thao tác nằm cạnh bàn để giữ kích thước ô; menu mở cạnh bên. Dùng chung nút âm thanh và trạng thái kết nối, thông báo lượt, kết quả, ảnh đại diện và mã kết nối như các game web khác. Tháp trắng, mái vòm xanh, số tầng và số thợ phân biệt rõ; ảnh và cấu trúc xây bằng SVG/CSS gốc.

## Kiến trúc và kiểm thử

Module `src/santorini` có engine thuần, store SQLite, adapter web/Discord và giao diện. Migration 69 thêm santorini_rooms, santorini_seats, santorini_channel_settings. Runtime chung quản lý HTTP/SSE, phiên, timeout và đồng bộ Discord. Kiểm tra người chơi, lượt, phiên bản và toàn bộ bước đi/xây trong giao dịch SQLite. Save giữ người đi trước đã bốc ngẫu nhiên và đồng hồ khi khởi động lại. Dữ liệu DTO không có Discord User ID; gợi ý lượt chỉ gửi cho người đang đánh. Reset server xóa phòng/ghế và giữ cấu hình kênh.

`npm run test:santorini`: luật, kiểm tra độc lập 80 ván hoàn chỉnh, lượt nguyên tử, timeout, restart, giới hạn phòng, HTTP/CSRF, ba luồng SSE, slash/prefix, đồng bộ Discord và reset. `npm run test:santorini:ui`: Chrome cục bộ, thao tác thật trên phone portrait/landscape và desktop, xem trước/xác nhận, ô vừa rời, thắng tầng 3, menu/avatar, tải lại và khán giả. `SANTORINI_SCREENSHOT_DIR` trỏ tới thư mục sẵn có để lưu ảnh QA.

Triển khai: chạy `npm run register`, khởi động lại bot, tải lại web. Dùng WEB_ENABLED/WEB_PUBLIC_URL và Funnel hiện có, không cần cổng mới.

## Nguồn luật

PDF người dùng cung cấp: https://s3.amazonaws.com/spinmasterstudioscdn/helpshift/Santorini.pdf (trả 403 khi triển khai). Đối chiếu phần cơ bản trang 1 và glossary trang 6 của [Santorini Classic 2017.02.05 do Roxley cung cấp](https://cdn.shopify.com/s/files/1/0246/2190/8043/files/Santorini_-_Rulebook_-_Print_-_2017.02.05_WEB.pdf?v=1702056099), liên kết từ https://roxley.com/products/santorini. Không áp dụng nội dung Thần lực hoặc mở rộng trong tài liệu đó.
