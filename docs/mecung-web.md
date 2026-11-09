# Mê cung — dựng cho đối thủ

Game đối kháng 2 người lấy cảm hứng từ việc dò mê cung trong Usogui. Đây là bộ luật của bot, không mô phỏng mọi luật trong truyện. Dùng cùng máy chủ web/Tailscale, xác nhận tài khoản, avatar, khán giả và đồng hồ với các game web hiện có. Không cược và không trả thưởng xu.

## Mở phòng

- `/mecung choi`: mặc định 9×9, tối đa 30 đoạn tường mỗi người, ai tới đích trước thắng, 30 phút/người.
- `/mecung choi luat:Ít lượt hơn kichthuoc:Nhỏ sotuong:20 thoigian:15`: đổi luật thắng, cỡ bàn, giới hạn tường và đồng hồ khi mở ván.
- `kichthuoc`: Nhỏ 7×7, Vừa 9×9, Lớn 11×11.
- `sotuong`: 0–60 đoạn/người; không bắt buộc đặt hết.
- `thoigian`: 1–180 phút/người, không cộng giờ.
- `/mecung phong`: danh sách phòng đang mở của kênh, 5 phòng/trang.
- `/webgame`: luật và điều khiển.
- `/mecung cauhinh phongtoida:10 kenh:#kenh`: quản trị giới hạn 1–20 phòng/kênh, mặc định 5. Giảm giới hạn không đóng phòng đang mở. Mỗi người tối đa một phòng Mê cung/server, độc lập game khác.

Có bản prefix tương ứng: `!mecung choi luat=turns kichthuoc=small sotuong=20 thoigian=15`. Giá trị `luat` trong prefix là `race` hoặc `turns`; cỡ bàn là `small`, `medium`, `large`. `!mecung` mở phòng mặc định.

Tin phòng Discord có Tham gia, nút URL Mở bàn cờ, Kết nối tài khoản và Hủy phòng khi đang chờ. Người chơi lấy mã từ chính tab web của mình và nhập tại nút Kết nối tài khoản trong Discord. Khán giả không cần đăng nhập để xem trực tiếp. Bot cần quyền View Channel để cập nhật tin phòng sau khi thông tin tương tác Discord hết hạn.

## Dựng mê cung

Sau khi đủ 2 người, mỗi người có 5 phút để dựng mê cung cho đối thủ. Chọn công cụ Đầu hoặc Đích rồi chạm ô; hai ô phải khác nhau. Chọn Tường rồi chạm khe giữa hai ô liền kề để thêm/xóa đoạn tường. Có thể dùng Gợi ý tường ngẫu nhiên hoặc Xóa tường trước khi xác nhận. Điểm mặc định là hai góc đối diện, có thể sửa tùy ý trong bàn.

Mỗi lần sửa đều được máy chủ kiểm tra: đúng phạm vi, không trùng tường, không quá giới hạn và còn ít nhất một đường từ đầu tới đích. Không yêu cầu mọi ô trong bàn phải nối với nhau. Tường có thể gặp nhau ở nút giao; mỗi đoạn chỉ chặn việc đi giữa hai ô chung cạnh.

Khóa & xác nhận có hộp xem lại. Khóa xong không sửa được; trận bắt đầu khi cả hai khóa. Nếu hết 5 phút, bên đã khóa thắng khi bên kia chưa khóa; cả hai chưa khóa thì phòng đóng. Phòng chờ chưa đủ người tự đóng sau 10 phút.

## Dò đường và tính kết quả

Người dò xanh đi trước. Mỗi thao tác chỉ đi một ô ngang/dọc. Không có tường thì vị trí thay đổi và người đó tiếp tục đi trong cùng lượt. Chạm tường thì đứng nguyên, lộ đúng đoạn vừa chạm và đổi lượt. Chạm lại tường đã biết vẫn mất lượt. Mép ngoài đã biết: không thể đi ra ngoài và lựa chọn ngoài bàn không tính mất lượt.

Ô bắt đầu được khám phá khi trận bắt đầu; chỉ ô đã đi tới mới được đánh dấu. Lối đi qua thành công cũng được ghi lại. Đi ngược đường cũ không làm tăng số ô đã khám phá. Trong lúc thi đấu, không tự lộ tường quanh ô hoặc đích. Khi ván kết thúc và có người thắng (đến đích, hết giờ, đầu hàng hoặc hết giờ dựng có bên thắng), toàn bộ tường và đầu–đích của cả hai bản đồ được mở cho người chơi và khán giả. Ván hòa/hủy không tự mở tường.

- **Đến đích trước:** người đầu tiên tới đích thắng ngay.
- **Ít lượt hơn:** số lượt bắt đầu từ 1 khi được đi lần đầu. Tới đích ghi lại số lượt đã dùng. Nếu người đi trước tới đích, đối thủ được hoàn thành lượt tương ứng để có cơ hội hòa. Tới đích cùng số lượt thì hòa; chạm tường trong lượt gỡ hòa thì thua. Nếu người đi sau tới đích khi người đi trước đã dùng hết cùng số lượt mà chưa tới đích, người đi sau thắng ngay. Không so số bước.

Đồng hồ riêng chỉ chạy khi tới lượt; đi liên tục vẫn dùng cùng ngân hàng thời gian. Không cộng giờ khi di chuyển hoặc đổi lượt. Hết giờ hoặc đầu hàng thì đối thủ thắng. Mất mạng/khởi động lại bot không hoàn thời gian. Người đã tới đích trong luật ít lượt hơn dừng đồng hồ trong lúc đối thủ gỡ hòa.

WASD, phím mũi tên, nút hướng hoặc chạm ô chung cạnh với vị trí hiện tại để đi. Nút Phóng to mở rộng bàn trong vùng cuộn trên điện thoại. Viền vàng đánh dấu ô vừa tới hoặc tường vừa chạm. Trên PC (từ 901 px), hai bản đồ thi đấu hiển thị cạnh nhau, có tiêu đề và lịch sử khám phá riêng; người chơi chỉ điều khiển được bản đồ của mình. Điện thoại vẫn chọn từng bản đồ để dễ nhìn. Selector cũng cho phép mở bản dựng kín của chính mình; lúc dựng chỉ hiển thị bản dựng cá nhân.

## Giữ kín và lưu ván

`store.snapshot` là ranh giới giữ kín: chỉ người dựng nhận `design` đầy đủ của chính họ. Đối thủ/khán giả chỉ nhận điểm đầu–đích sau khi trận bắt đầu, vị trí, ô đã khám phá, lối đã đi và tường đã chạm. Không có danh sách nước đi hợp lệ dựa trên tường ẩn. Tường chưa chạm chỉ được gửi đầy đủ sau khi trạng thái ván là kết thúc và có người thắng; trước đó vẫn giữ kín cả HTTP và SSE, kể cả khi một bên đang chờ lượt gỡ hòa. Việc mở tường không thay đổi lịch sử đã khám phá trong bản lưu. SSE và phản hồi thao tác dùng cùng phép chiếu này; không gửi dữ liệu thô từ SQLite ra web.

Migration 66 thêm `mecung_rooms`, `mecung_seats`, `mecung_channel_settings`. Lưu bản dựng, revision riêng mỗi người, bước thử, lượt, thời gian, ô khám phá và kết quả trong SQLite. Revision riêng giúp hai người dựng đồng thời mà không ghi đè nhau. Khi giải, mỗi thao tác cần đúng người, đúng lượt và phiên bản bàn hiện tại. Dùng chung sao lưu database, đặt lại dữ liệu người chơi và đếm phiên đang mở trong healthcheck.

Di chuyển liên tiếp dùng ngân sách HTTP có giới hạn riêng tối đa 600 yêu cầu/phút/phiên; game khác giữ mặc định 120. CSRF, xác nhận tài khoản và quyền người chơi vẫn áp dụng.

## Kiểm tra và bật lệnh

`npm run test:mecung` kiểm tra ánh xạ tường, đường nối bằng BFS độc lập, dựng đồng thời, giữ kín cả HTTP/SSE, tiếp tục/đổi lượt, ô khám phá, cả hai luật và hòa cân bằng lượt, đồng hồ, hết hạn, khôi phục, giới hạn phòng, prefix, cập nhật Discord, healthcheck/reset và di chuyển nhanh. Chạy thêm các test game web hiện có cùng `npm run test:web:pairing` và `npm run test:web:players`.

`npm run test:mecung:ui` là test Chrome thật tùy chọn: chuột/cảm ứng dựng đầu–đích–tường, từ chối cắt hết đường, ngẫu nhiên/xóa, khóa bản dựng, kiểm tra DOM không có tường ẩn, phím tắt, giữ/đổi lượt, ô khám phá, SSE, điện thoại, phóng to, kết quả và tải lại dưới vai trò khán giả. Dùng `CHROME_PATH` để chỉ định Chrome. Muốn lưu ảnh, đặt `MECUNG_SCREENSHOT_DIR` tới thư mục có sẵn thuộc tài khoản của bạn.

Sau cập nhật, chạy `npm run register`, khởi động lại tiến trình bot hiện có và tải lại web. Không cần thêm cổng hay thay URL Tailscale.
