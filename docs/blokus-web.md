# Blokus Duo — hai người

Blokus dùng máy chủ web/Tailscale, xác nhận tài khoản, SSE, khán giả và đồng hồ chung với các game web khác. Không mở thêm cổng hoặc Funnel. Không cược và không trả thưởng xu.

## Lệnh

- `/blokus choi`: mở phòng, mặc định 30 phút/người.
- `/blokus choi thoigian:15`: chọn 1–180 phút/người, không cộng giờ.
- `/blokus phong`: phòng đang chờ/đang đấu trong kênh, 5 phòng/trang.
- `/blokus luat`, hoặc `/luat trochoi:Blokus Duo`: luật và cách tính điểm.
- `/blokus cauhinh phongtoida:10 kenh:#kenh`: quản trị đặt giới hạn 1–20 phòng/kênh, mặc định 5. Giảm giới hạn không đóng phòng đã mở. Mỗi người tối đa một phòng Blokus/server, độc lập game khác.

Các lệnh có bản prefix tương ứng, ví dụ `!blokus choi thoigian=15`; `!blokus` cũng mở phòng mặc định.

Tin Discord có Tham gia, nút URL Mở bàn cờ, Kết nối tài khoản và Hủy phòng khi đang chờ. Tin phòng cập nhật khi đủ người, điểm thay đổi và kết thúc. Người chơi lấy mã từ chính tab web của mình rồi nhập mã tại nút Kết nối tài khoản trong Discord. Khán giả có thể xem trực tiếp mà không đăng nhập.

## Luật

Áp dụng [hướng dẫn Blokus Duo của Mattel](https://service.mattel.com/instruction_sheets/R1984-0920.pdf). Bàn cố định 14×14; mỗi bộ 21 hình polyomino khác nhau: 1 quân một ô, 1 quân hai ô, 2 quân ba ô, 5 quân bốn ô và 12 quân năm ô, tổng 89 ô.

Quân xanh đi trước. Quân đầu phủ một dấu xuất phát E5/J10; đối thủ dùng dấu còn lại. Những quân sau phải chạm góc quân cùng màu, không chạm cạnh. Chạm cạnh đối phương được phép. Quân không chồng lên nhau, không ra ngoài bàn và không di chuyển sau khi đặt. Được xoay/lật trước khi xác nhận.

Máy chủ tự kiểm tra toàn bộ quân còn lại: hết nước thì tự bỏ lượt; đối thủ có thể đi liên tục. Cả hai hết nước thì kết thúc. Mỗi ô chưa đặt tính −1 điểm. Đặt hết 21 quân nhận +15 điểm; +20 nếu quân cuối là I1 (một ô). Điểm cao hơn thắng, bằng nhau hòa. Hết giờ hoặc đầu hàng thì đối thủ thắng, không so điểm. Phòng chờ hết hạn sau 10 phút.

## Điều khiển

Chọn quân trong bộ → chạm ô làm góc trên trái của khung quân → xem trước → Xác nhận. Ô xanh nhạt là vị trí hợp lệ, đỏ là không hợp lệ kèm lý do. Hình có khoảng trống ở góc trên trái vẫn dùng góc khung làm mốc; không phải mọi ô mốc đều thuộc quân.

Có thể kéo quân từ bộ lên bàn bằng chuột hoặc cảm ứng, hoặc kéo lại khối đang xem trước. Điểm đang cầm trên khối được giữ dưới con trỏ khi xoay/lật. Thả quân chỉ tạo bản xem trước, không gửi nước đi. Cụm Xoay/Lật/Bỏ/Đặt bám cạnh khối và được giữ trong màn hình; nhấn Đặt mới xác nhận. Thả ngoài bàn, hủy thao tác cảm ứng hoặc mất tiêu điểm sẽ trả về lựa chọn trước khi kéo.

Bản xem trước không hợp lệ hiện sọc đỏ kể cả khi chồng lên quân đã đặt của hai bên; vẫn có thể cầm chính ô chồng lấn để kéo sang vị trí khác. Trên máy tính, bộ quân của bạn nằm bên trái, bàn cờ ở giữa và bộ quân đối phương nằm bên phải để xem; quân đã dùng được làm mờ. Khán giả thấy bộ xanh bên trái và bộ cam bên phải.

Trên điện thoại, menu Bộ quân/Đã chọn/Thông tin/Tài khoản mở trong khung riêng; bàn vẫn nhìn thấy. Chạm chọn quân hoặc thả quân lên bàn sẽ đóng menu bộ quân để xem bàn rộng hơn. Thanh người chơi chỉ hiện avatar và đồng hồ; chạm avatar để xem tên, điểm và thông tin đầy đủ. Giao diện cũng hỗ trợ xoay ngang và trở lại bố cục máy tính khi mở rộng cửa sổ.

- R / nút Xoay: xoay 90°; F / nút Lật: đối xứng.
- WASD hoặc phím mũi tên: dịch vị trí xem trước; Enter: xác nhận; Esc: hủy vị trí.
- Phóng to: mở rộng bàn và cuộn trong khung trên điện thoại.
- Selector bộ quân trên điện thoại: xem quân chưa dùng/đã dùng của cả hai. Không có thông tin cần giữ kín trong Blokus.
- Viền vàng bao quanh các ô của quân vừa đặt; nhãn cho biết bản thân/đối phương vừa đi quân nào.

## Vận hành và kiểm tra

Migration 65 thêm `blokus_rooms`, `blokus_seats`, `blokus_channel_settings`. Ván, lượt, quân đã dùng, dấu xuất phát, trạng thái bị chặn và ngân hàng thời gian được lưu trong SQLite. Khi bot khởi động lại, đồng hồ tiếp tục tính theo mốc thời gian đã lưu; thời gian mất mạng không được hoàn lại. Sao lưu dùng cơ chế database hiện có.

Sau khi cập nhật, chạy `npm run register`, khởi động lại tiến trình bot hiện tại và tải lại web. Bot cần quyền View Channel để tiếp tục cập nhật tin phòng khi thông tin tương tác Discord hết hạn.

`npm run test:blokus` kiểm tra bộ quân bằng cách sinh độc lập toàn bộ polyomino đến 5 ô, hình xoay/lật, luật đặt quân, 12 ván hoàn chỉnh, soát nước hợp lệ bằng quét vét cạn độc lập, bỏ lượt, điểm, đồng hồ, khôi phục dữ liệu, quyền, HTTP/SSE, xác nhận tài khoản, prefix và cập nhật Discord. Chạy thêm `npm run test:web:pairing`, `npm run test:web:players` và các test game web hiện có.

`npm run test:blokus:ui` là kiểm tra trình duyệt thật tùy chọn, cần Chrome cài trên máy (`CHROME_PATH` để chỉ định executable). Kiểm tra chuột, cảm ứng, phím R/F, xoay/lật trên điện thoại, xem trước, gửi nước đi, SSE, highlight, phóng to và kết quả. Đặt `BLOKUS_SCREENSHOT_DIR` tới thư mục có sẵn thuộc tài khoản của bạn nếu muốn lưu ảnh kiểm tra.

Test trình duyệt còn kiểm tra kéo từ bộ quân, kéo lại bản xem trước, hủy kéo bằng cảm ứng, cụm nút nằm trong màn hình, mở/đóng menu và việc thả không tự gửi nước đi. `npm run test:web:mobile` kiểm tra thêm sáu game web trên điện thoại nhỏ, xoay ngang, menu không che hết bàn và khôi phục các nút về vị trí ban đầu khi chuyển sang máy tính.
