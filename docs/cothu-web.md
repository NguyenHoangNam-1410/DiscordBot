# Cờ thú trên web

Triển khai theo [đặc tả cothu-vn-v1](co-thu-web-game-spec.md). Dùng cùng máy chủ HTTP/SSE, Tailscale, phiên Discord, mã xác nhận có nút sao chép và âm báo của các game web khác. Hai người thật, có khán giả; không cược và không thưởng tài nguyên.

- `/cothu choi [nguoitruoc:host|guest|random] [thoigian:1–180]`: mặc định chủ phòng cầm Đỏ và 30 phút/người. Người được chọn cầm Đỏ, đi trước; kết quả chọn được lưu ngay khi tạo phòng. Đồng hồ Đỏ bắt đầu khi người thứ hai tham gia.
- `/cothu phong`: phòng đang mở trong kênh, phân trang; `/webgame` đọc hướng dẫn. Có bản prefix `!cothu` và các lệnh con tương ứng.
- `/cothu cauhinh phongtoida:<1–20> [kenh]`: mặc định 5 phòng/kênh; mỗi người tối đa một phòng Cờ thú/server, không khóa game khác. Phòng chờ hết hạn sau 10 phút; giảm giới hạn không đóng phòng hiện có.

## Luật và bàn cờ

Đỏ ở dưới theo tọa độ tuyệt đối a1–g9; Xanh là phép quay 180°. Mọi quân có hình SVG riêng, tên, ký hiệu màu và bậc. Sông, bẫy và hang có nền/biểu tượng riêng. Người cầm Xanh tự nhìn quân mình ở dưới; nút xoay chỉ đổi góc nhìn. Bàn luôn giữ tỷ lệ 7:9 trên PC và điện thoại dọc/ngang, điều khiển vẫn ở cạnh bàn; thông tin/lịch sử/tài khoản trong menu mobile.

Đi ngang/dọc một ô, không vào hang nhà. Chó 4, Sói 3. Chuột đất ăn Voi; Voi không ăn Chuột bình thường. Chỉ Chuột bơi; không bắt qua bờ nước/đất. Sư tử/Hổ nhảy qua toàn dải sông ngang/dọc, mọi Chuột đúng đường đều chặn. Quân mắc bẫy địch có bậc hiệu dụng 0 tại ô xuất phát: không bắt được quân, chỉ ra ô trống rồi phục hồi; bẫy ưu tiên hơn ngoại lệ Chuột/Voi.

Vào hang, ăn hết quân hoặc làm đối thủ bí nước thì thắng, xét trước hòa. Cùng thế cờ và bên đến lượt xuất hiện lần ba, hoặc 100 lượt đơn không ăn quân thì hòa. Hết giờ/đầu hàng thì thua; mất mạng và đọc luật không dừng đồng hồ.

Chọn quân → ô đích để xem trước → Xác nhận mới gửi nước. Có dấu đi/ăn/nhảy, đường nhảy, cảnh báo bẫy, highlight ô đi/đến gần nhất, danh sách quân đã mất và lịch sử mới nhất trước. Hủy/Escape không gửi nước; phím mũi tên đổi focus theo góc nhìn, Enter/Space chọn ô. Hộp thoại/menu chặn phím chơi. Khán giả chỉ xem, không có nước hợp lệ để gửi.

## Dữ liệu và triển khai

Migration 70 tạo `cothu_rooms`, `cothu_seats`, `cothu_channel_settings`. Phòng lưu quân/bên cầm màu, clock, version, repetition, bộ đếm không bắt, lịch sử và kết quả trong SQLite đang backup. Nước sai không đổi bàn/version/đồng hồ gốc. Deadline được xử lý trước nước đi; cập nhật nước/histories trong transaction rồi mới phát SSE. DTO không chứa Discord User ID hay token. Kết thúc vẫn xem được; nút **Chơi lại · Phòng mới** trên tin kết quả Discord tạo phòng mới, giữ nguyên ván cũ.

Đường `/cothu/room/<UUID>`, API `/api/games/cothu/{state,events,move,leave,pair,pair/status,login}`. Web dùng cấu hình `WEB_*` hiện tại. Sau khi triển khai, chạy `npm run register`, khởi động lại bot, tải lại web. Không cần thêm cổng hay Funnel.

Kiểm tra: `npm run test:cothu` gồm fixture ngoại lệ, bộ xét nước độc lập, timeout/rollback/restart, HTTP và ba SSE, Discord/prefix/chơi lại, health/reset. `npm run test:cothu:ui` dùng Chrome thật kiểm tra SVG, preview/cancel/confirm, hai bên, xoay/tọa độ, bàn chữ nhật ở 360×640, 390×844, 844×390, 1280×900, menu/lịch sử, bẫy/nhảy/chiếm hang và khán giả. Đặt `COTHU_SCREENSHOT_DIR` là thư mục sẵn có để lưu ảnh; `CHROME_PATH` tùy chọn.
