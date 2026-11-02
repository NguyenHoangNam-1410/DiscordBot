# Dots & Boxes / Nối ô

Game đấu hai người dùng chung máy chủ web, địa chỉ Tailscale, tài khoản Discord, SSE và SQLite với Caro, Walls và Battleship. Không cần thêm cổng, tên miền, khóa đăng nhập hay thư viện. Không cược/thưởng xu, EXP hay thành tích.

## Mở bàn

- `/dots choi`: mặc định **5×5 ô**, tương ứng 6×6 chấm.
- `/dots choi kichthuoc:3 thoigian:15`: bàn nhỏ 3×3 ô, 15 phút mỗi người. Discord cung cấp lựa chọn 3×3, 5×5, 7×7 ô; `thoigian` từ 1–180 phút, mặc định 30 phút/người.
- Người khác bấm **Tham gia** trong tin phòng. X đi trước.
- **Mở bàn cờ** mở `/dots/room/<UUID>`; ai có link đều có thể xem trực tiếp hoặc xem lại kết quả.
- Người chơi bấm **Xác nhận người chơi** trên web và nhập mã của tab mình qua nút **Kết nối tài khoản** trong tin Discord. Dùng chung phiên xác nhận của các game khác; vẫn phải có ghế trong phòng Dots & Boxes mới được nối cạnh hoặc đầu hàng.
- `/dots phong`: danh sách phòng của kênh, phân trang 5 phòng/trang. Nút điều khiển danh sách chỉ dành cho người mở.
- `/dots cauhinh phongtoida:10 kenh:#kenh`: quản trị đặt tối đa 1–20 phòng đang mở tại kênh, mặc định 5. Giảm giới hạn không đóng phòng đang chơi. Mỗi người tối đa một phòng Dots & Boxes/server, độc lập các game khác.
- `/dots luat` hoặc `/luat trochoi:Dots & Boxes / Nối ô`: luật ngắn. Các lệnh có bản prefix tương ứng khi bot bật lệnh tin nhắn, ví dụ `!dots choi kichthuoc=3 thoigian=15`.

## Luật

Mỗi lượt bấm nối một cạnh ngang hoặc dọc giữa hai chấm kề nhau. Cạnh đã nối không thể chọn lại. Khi cạnh vừa vẽ khép kín ô, người vừa nối chiếm ô đó và nhận **1 điểm mỗi ô**, bất kể các cạnh trước đó do ai vẽ.

Ghi điểm được **đi tiếp**. Một cạnh có thể khép hai ô, được 2 điểm nhưng không tích thêm hai lượt. Tiếp tục giữ lượt chừng nào mỗi cạnh mới vẫn khép được ô. Nếu không chiếm ô nào, lượt chuyển sang đối thủ.

Ván chỉ kết thúc khi toàn bộ cạnh đã nối, cũng là khi toàn bộ ô đã có chủ. Bên có nhiều ô hơn thắng; không kết thúc sớm khi một bên mới vượt quá nửa số ô. Các cỡ bàn hiện có đều có tổng ô lẻ nên ván chơi hết bàn luôn có người thắng. Đầu hàng hoặc hết đồng hồ có thể kết thúc sớm, kể cả người đang dẫn điểm.

Cạnh và ô giữ màu X/O của người nối/chiếm. Web hiển thị điểm, cạnh vừa nối, đồng hồ hai người; khán giả không thể thao tác. Trên điện thoại có nút phóng to/thu nhỏ bàn. Cạnh là nút bấm, có nhãn hàng/cột và có thể chọn bằng Tab rồi Enter/Space.

Nguồn đối chiếu luật: [Wolfram MathWorld — Dots and Boxes](https://mathworld.wolfram.com/DotsandBoxes.html). Không sử dụng hình minh họa của nguồn.

## Đồng hồ, lưu trận và Discord

Mỗi người có thời gian riêng. Chỉ đồng hồ bên đang có lượt giảm, **kể cả chuỗi ăn ô đi tiếp**; không cộng giờ và không khôi phục thời gian sau mỗi cạnh. Hết thời gian của mình thì thua. Mất kết nối hoặc bot tắt không làm đồng hồ dừng. Phòng chờ hết hạn sau 10 phút.

Mỗi cạnh, chủ sở hữu ô, điểm, lượt và thời gian đều được lưu trong một giao dịch SQLite trước khi đẩy cập nhật cho người chơi/khán giả. Tải lại trang lấy lại đúng trạng thái đã lưu. Khi bot khởi động lại, kết nối tài khoản lại nếu phiên cũ mất hiệu lực; trận vẫn được giữ và xử hết giờ theo thời hạn thực tế.

Tin phòng Discord cập nhật khi có đối thủ, khi ghi điểm và khi kết thúc. Tác vụ định kỳ thử gửi lại nếu Discord gặp lỗi tạm thời. Bot cần quyền **Xem kênh** tại kênh/luồng của phòng để cập nhật dài hạn.

## Cập nhật trên VM

Nếu ba game cũ đã chạy, giữ nguyên Tailscale/Funnel và các biến `WEB_*` (hoặc `CARO_*` cũ). Sau khi code được push lên nhánh đang dùng:

```sh
git pull --ff-only
npm ci
npm run test:dots
npm run test:changelog
npm run register
```

Restart tiến trình bot đang dùng rồi thử `/dots choi`. Không mở thêm bản bot thứ hai. Migration 64 tự thêm bảng riêng `dots_rooms`, `dots_seats`, `dots_channel_settings`, không sửa/xóa dữ liệu game khác. Database được backup cùng cơ chế hiện có.

Nếu chưa có web, xem [cấu hình web chung](web-games.md) và [hướng dẫn Funnel](caro-web.md). Không cần thay địa chỉ public chỉ vì thêm game này.

## Kiểm tra

`npm run test:dots` dùng database thử riêng, kiểm tra nhận diện cạnh, không nối qua mép, khép một/hai ô, điểm và lượt đi tiếp, đồng hồ không cộng giờ, chơi hết bàn cả ba cỡ, khóa phòng/người chơi, lưu/khôi phục, hết hạn, quyền người chơi/khán giả, kết nối tài khoản, HTTP/SSE hai người và khán giả, lệnh/nút Discord. `npm run test:web:pairing` kiểm tra thêm luồng giao diện Dots & Boxes, gồm mất phản hồi, tải lại tab và sự kiện khán giả cũ.
