# Cờ tướng trên web

- `/cotuong choi [nguoitruoc:host|guest|random] [thoigian:1–180]`: mở phòng, mặc định chủ phòng cầm Đỏ và 30 phút/người. Đỏ luôn đi trước.
- `/cotuong phong`: xem phòng của kênh, phân trang 5 phòng/trang. `/cotuong cauhinh phongtoida:<1–20> [kenh]`: quản trị đặt giới hạn, mặc định 5. Mỗi người một phòng Cờ tướng/server; độc lập game khác.
- Có bản prefix `!cotuong`; không có lệnh con luật. Dùng `/webgame` hoặc nút **Luật chơi** trên web.

## Tương tác

Bàn giao điểm 9×10 có sông, hai cung và quân tròn hai vòng. Dùng lại chính nét chữ Hán từ `assets/xiangqi/characters.json` và ánh xạ của `src/xiangqi/view.js`, đóng gói thành SVG để không phụ thuộc font trên máy người chơi. Noto Serif CJK TC theo giấy phép SIL OFL 1.1 hiện có tại `assets/xiangqi/OFL.txt`.

Kéo quân → thả vào giao điểm hợp lệ là gửi nước đi ngay. Chạm quân rồi chạm ô đích cũng đi ngay. Không có bước xem trước/xác nhận, không có nút xác nhận. Thả ra ngoài, sai ô, pointercancel hoặc mất quyền đi khi kéo sẽ hủy thao tác. Chưa được server chấp nhận thì không đổi bàn; lỗi mạng/thao tác trùng cập nhật lại trạng thái thật.

Có viền ô đi/đến gần nhất, tô Tướng đang bị chiếu, các đích hợp lệ, danh sách quân đã mất và lịch sử nước đi. Phía Đen tự xoay về dưới; tọa độ ICCS không đổi khi xoay. Hỗ trợ chuột, cảm ứng, Tab/Space/Enter và phím mũi tên; Escape bỏ chọn. Giao diện PC và mobile dùng chung avatar, âm báo, menu lịch sử/thông tin/tài khoản, sao chép mã và dialog luật/đầu hàng. Khán giả xem SSE trực tiếp, không được gửi nước đi.

## Bộ luật và trạng thái

Dùng ffish-es6 0.7.10 sẵn có, không thêm thư viện. Kiểm tra cung, sông, chân Mã, mắt Tượng, ngòi Pháo, hai Tướng đối mặt, tự chiếu, chiếu bí và hết nước đi. Engine được khởi tạo trước khi tạo phòng/đánh; việc đăng ký lệnh và đọc bàn đã lưu không phải nạp WASM.

Mỗi nước được dựng lại từ FEN ban đầu + toàn bộ chuỗi ICCS đã lưu để giữ ngữ cảnh lặp. Kết quả engine `isGameOver(true)` / `result(true)` quyết định chiếu bí, hết nước (thua), lặp thế, lặp chiếu/đuổi, thiếu lực và giới hạn không ăn quân. Không tự viết một bộ luật gần đúng, không tuyên bố tương đương mọi bộ luật trọng tài giải đấu. [API Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/ffishjs.cpp).

Dùng chung transport HTTP/SSE, đăng nhập Discord, Tailscale và đồng hồ của web game. Hết giờ hoặc đầu hàng thì thua. Không tăng thời gian sau nước đi; phòng chờ hết hạn sau 10 phút. SQLite lưu FEN, lịch sử, nước hợp lệ, đồng hồ, ghế và kết quả; restart/reload không mất ván. Không cược/thưởng xu/gem hoặc tiến độ thành tựu mới.

## Chuyển từ puzzle

Migration 72 đóng các puzzle cờ tướng đang mở, xóa khóa lấy thế và cấu hình kênh/thưởng/bảo trì cũ. Giữ các bản ghi lịch sử, thưởng đã nhận, thành tích và tài nguyên người chơi. Bảng xếp hạng/tra cứu cũ ghi rõ **Cờ tướng · Puzzle cũ**. Không nhận lời giải cờ tướng từ tin nhắn và không chạy timer puzzle nữa. Cờ vua vẫn là puzzle Lichess như trước.

Các công cụ tạo/kiểm chứng thế và catalog cũ trong `src/xiangqi` còn dùng cho kiểm thử engine/asset, không đăng ký game Discord puzzle. Các lệnh cũ như `xem`, `boqua`, `huongdan` chỉ hướng dẫn sang UI mới, không tạo phòng ngoài ý muốn.

Chạy `npm run register`, rồi restart bot. `npm run test:cotuong` kiểm tra luật, lưu/đồng hồ, HTTP/SSE, auth, Discord/prefix, retirement. `npm run test:cotuong:ui` kiểm tra kéo thả chuột/cảm ứng, hủy thao tác, commit tức thì, tọa độ/asset và giao diện PC/mobile bằng Chrome.
