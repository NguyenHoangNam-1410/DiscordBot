# Battleship / Bắn tàu

Dùng chung máy chủ web, Tailscale, phiên xác nhận Discord, cập nhật trực tiếp và đồng hồ của Caro/Walls. Không cược, thưởng xu hoặc thay đổi tài khoản kinh tế.

## Mở phòng

- `/battleship choi kichthuoc:Nhỏ` hoặc `!battleship choi kichthuoc=nho`.
- Chỉ chọn Nhỏ / Vừa / Lớn. Mặc định Vừa. Không nhập số thuyền hoặc số ô tùy ý.
- Tùy chọn `thoigian` là 1–180 phút **mỗi người khi chiến đấu**, mặc định 30; không thay đổi hạn bố trí. Đồng hồ chỉ chạy khi tới lượt, không cộng giờ, vẫn chạy khi mất mạng/bot dừng.
- `/battleship phong`: danh sách phòng phân trang; mở trực tiếp bàn hoặc tin mời Discord để tham gia. Mặc định 5 phòng/kênh, mỗi người tối đa 1 phòng Battleship/server. Phòng chờ tự đóng sau 10 phút.
- `/battleship cauhinh phongtoida:10 kenh:#kenh`: quản trị chỉnh 1–20 phòng đang mở (chờ/bố trí/chiến đấu). Giảm giới hạn không đóng ván cũ.
- `/webgame`: đọc luật. Mọi lệnh có bản `!`.

| Cỡ bàn | Bàn   | Thuyền/người | Độ dài | Chuẩn bị |
| ------ | ----- | ------------ | ------ | -------- |
| Nhỏ    | 8×8   | 5            | 2–4 ô  | 100 giây |
| Vừa    | 10×10 | 7            | 2–5 ô  | 140 giây |
| Lớn    | 12×12 | 10           | 2–5 ô  | 200 giây |

Máy chủ sinh một danh sách độ dài chung, có ít nhất một thuyền ở mỗi độ dài hợp lệ; các thuyền còn lại chọn ngẫu nhiên. Hai người tự xếp vị trí riêng. Mũi bo góc có thể hướng trái, trên, phải hoặc dưới; mỗi lần xoay đổi 90°. Các ô thân vuông không biểu lộ hướng. Bản lưu cũ vẫn giữ đúng mũi trái/trên.

## Bố trí và chiến đấu

Hạn bố trí bắt đầu khi người thứ hai tham gia. Kéo thả thuyền mới hoặc thuyền đã đặt; giữ nguyên đoạn đang cầm khi xoay bằng R/chuột phải. Có cách chạm chọn thuyền → Xoay → chạm ô đặt, nút gỡ thuyền và xếp ngẫu nhiên cho điện thoại. Máy chủ kiểm tra nằm trong bàn, ngang/dọc, không chồng, không sát cạnh; chạm chéo được phép. Bản nháp được lưu sau mỗi thao tác hợp lệ, tải lại trang vẫn tiếp tục được.

Xác nhận chỉ khi đủ thuyền; sau xác nhận không đổi được bố trí. Cả hai xác nhận thì bắt đầu, hạm đội xanh bắn trước. Hết hạn bố trí: một bên đã xác nhận thì bên đó thắng; cả hai chưa xác nhận thì đóng phòng không người thắng. Đầu hàng được cả khi bố trí và chiến đấu. Phòng hết hạn/kết thúc giải phóng ghế.

Mỗi lượt bắn đúng một ô rồi đổi lượt, kể cả bắn trúng. Không bắn lặp. Chỉ ô thực sự bị bắn được hiển thị: trượt, thân vuông hoặc mũi bo góc có hướng. Không tự mở các ô xung quanh hay phần còn lại của thuyền. Thuyền chỉ chìm khi toàn bộ ô bị bắn; chìm hết hạm đội thì thua. Hết đồng hồ của mình cũng thua. Đồng hồ dừng khi ván kết thúc.

Khi bố trí, người chơi chỉ thấy biển của mình; không có nút đổi sang biển đối phương. Trên PC, khay tàu và các nút bố trí nằm cạnh biển để kéo thả; điện thoại dùng menu Hạm đội. Khán giả chỉ thấy thông báo chờ hai người bố trí. Sau khi cả hai xác nhận, PC hiển thị hai bản đồ cạnh nhau; điện thoại có nút chuyển biển của bạn/đối phương và tùy chọn tự đổi theo lượt. Hai bên được gọi là Hạm đội xanh và Hạm đội cam, có ảnh đại diện Discord và tên người chỉ huy; hạm đội xanh bắn trước. Tới lượt bắn tự mở biển đối phương; chờ đối thủ tự mở biển của mình. Trong ván, khán giả chỉ thấy các ô đã bị bắn. Khi ván kết thúc (kể cả đầu hàng hoặc hết giờ), vị trí mọi tàu đã đặt được mở cho hai người và khán giả; các ô trúng/trượt vẫn giữ nguyên, tàu chưa bị bắn hiện màu tàu. Góc phải mỗi biển có tooltip hạm đội chưa chìm theo độ dài; rê chuột, dùng bàn phím hoặc chạm để xem. Số tàu còn lại chỉ giảm khi toàn bộ ô của tàu đó đã bị bắn.

## Giữ kín và triển khai

`store.snapshot` là nơi duy nhất tạo dữ liệu HTTP/SSE. `placements` luôn chỉ chứa tàu của chính người xem; khán giả nhận danh sách rỗng. `revealedPlacements` là `null` khi đang chờ/bố trí/chiến đấu; chỉ khi `status=finished` mới chứa cả hai hạm đội cho mọi người xem. Không gửi vị trí ẩn, ID/độ dài/hướng thân tàu đối thủ trong ván; chỉ mũi đã bị bắn mới có hướng. Việc mở tàu cuối ván không thêm phát bắn, không đổi số hit hoặc tàu đã chìm. Mỗi bên có phiên bản bố trí riêng để thao tác đồng thời không gây lỗi bản cũ lẫn nhau; bắn dùng phiên bản chung để chống bắn hai lần/nhầm lượt.

Migration 63 thêm `battleship_rooms`, `battleship_seats`, `battleship_channel_settings`, không đổi dữ liệu Caro/Walls. Đăng ký module tại `src/webGames/index.js`. Đường dẫn `/battleship/room/<UUID>`, API `/api/games/battleship/...`. Tiếp tục dùng `WEB_*`, cùng cổng và Funnel; không cần thêm dịch vụ.

Kiểm tra: `npm run test:battleship`, `npm run test:caro`, `npm run test:walls`, `npm run test:web:clocks`, `npm run test:web:pairing`, `npm run test:changelog`. Bộ Battleship dùng database tạm, HTTP/SSE localhost và mã trình duyệt thật trong môi trường mô phỏng; không gửi tin Discord thật. Sau cập nhật code chạy `npm run register`, khởi động lại bot, tải lại web.
