# Cò quay Nga trên web

Mở bằng `/coquay choi mau:5 vatpham:4 thoigian:30`, hoặc `!coquay choi mau=5 vatpham=4 thoigian=30`.

- Hai người đấu trực tiếp; chủ phòng cầm súng trước. HP tối đa 1–20 (mặc định 5), số đạo cụ chưa dùng tối đa 1–12/người (mặc định 4).
- Đồng hồ riêng 1–180 phút/người, mặc định 30, chỉ giảm khi tới lượt và không cộng giờ. Dùng đạo cụ không đặt lại thời gian đã tiêu. Phòng chờ đóng sau 10 phút.
- `/coquay phong`: danh sách có phân trang, mở web để chơi/xem; vào ghế qua tin phòng Discord. Người chơi kết nối bằng mã của tab web. Khán giả không được thao tác.
- `/coquay cauhinh phongtoida`: quản trị giới hạn 1–20 phòng/kênh, mặc định 5; mỗi người chỉ ở một phòng Cò quay Nga/server.
- Mở phòng tại kênh Discord hiện tại như các game web khác; không cần `/quantri datkenh` và không dùng danh mục kênh/bảo trì của game Discord cũ. Không cược xu hoặc ghi thành tựu, không cấp xu/kim cương từ ván web.

## Engine và hiệp đấu

`src/services/coquayEngine.js` giữ nguyên lõi luật thuần, cũng đang được sự kiện Gambler của Sinh tồn dùng. `src/coquay/engine.js` ánh xạ hai ghế vào các khóa nội bộ player/bot; không có AI trong phòng web.

Mỗi hiệp là một đợt nạp đạn: 2–3 viên ở hiệp 1, 4–5 ở hiệp 2, 6–8 từ hiệp 3. Mỗi đợt có ít nhất một viên thật và một viên lép, thứ tự xáo trộn phía máy chủ. HP được giữ giữa các hiệp. Không nạp tiếp khi một người đã chết.

Bắn đạn thật gây 1 DMG. Tự bắn đạn lép giữ lượt; các phát bắn còn lại chuyển súng, trừ khi đối thủ đang bị còng. Cưa tăng DMG lên 2 cho phát tiếp theo và bị tiêu hiệu ứng kể cả khi gặp lép. Chắn chỉ đỡ 1 DMG từ đối thủ, không đỡ tự bắn. Chết, hết đồng hồ hoặc đầu hàng kết thúc ván.

## Hộp đạo cụ

Đầu hiệp 1 và ngay khi nạp hiệp tiếp theo, mỗi người tự mở một hộp: ngẫu nhiên đều 1 hoặc 2 món, mỗi món chọn đều trong 7 loại, có thể trùng. Món cũ chưa dùng được giữ; món vượt sức chứa bị bỏ, không chuyển thành tiền hay thưởng khác. Giao diện Đạo cụ & hộp đồ ghi món nhận và số món bị bỏ ở hiệp mới nhất.

| Đạo cụ         | Công dụng                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Kính lúp       | Chỉ người dùng biết viên tiếp theo. Một lần soi/người/viên; thông tin mất khi bắn, loại hoặc đảo viên. |
| Bia đỡ đạn     | Chặn 1 DMG từ một phát đạn thật của đối thủ.                                                           |
| Cưa cầm tay    | Phát bắn tiếp theo gây 2 DMG nếu là đạn thật, kể cả tự bắn.                                            |
| Còng số 8      | Bỏ qua một lần chuyển súng sang đối thủ; không cộng dồn.                                               |
| Thuốc hồi phục | Hồi 1 HP, không dùng khi đầy HP.                                                                       |
| Lon bia        | Loại viên tiếp theo, công bố thật/lép, giữ lượt; hết đạn sẽ nạp và mở hộp mới.                         |
| Bộ đảo đạn     | Đảo viên tiếp theo thật ↔ lép; xóa thông tin soi nòng cũ.                                              |

Tất cả đạo cụ dùng trong lượt của chủ sở hữu, dùng xong mất một món và không mất lượt. Đạo cụ không chuyển sang ván mới hoặc túi Discord.

## Giao diện và âm thanh

Một bàn 2D, hai khay đạo cụ, thanh HP và ảnh đại diện; nút xoay 180° chỉ đổi góc nhìn, giữ chữ dễ đọc và không gửi thao tác game. Chạm đạo cụ để xem ảnh/công dụng rồi bấm Sử dụng. Menu mở hộp, luật, kết nối và đầu hàng nằm gần bàn trên điện thoại; điện thoại ngang dùng cột điều khiển bên phải.

Súng và bảy đạo cụ là SVG gốc trong index.html, không cần tải ảnh bên ngoài. Hiệu ứng chớp nòng, rung/nháy vị trí người bị thương áp dụng cho thao tác đã được máy chủ chấp nhận; tôn trọng prefers-reduced-motion. Âm súng dùng nhiễu ngắn cùng âm trầm, âm lép/nạp/đạo cụ và thắng/thua qua Web Audio chung. Nút loa nhớ lựa chọn của người dùng xuyên game; âm chỉ bắt đầu sau tương tác đầu tiên, không phát lại lịch sử sau tải lại.

## Dữ liệu và triển khai

Migration 67 tạo coquay_rooms, coquay_seats, coquay_channel_settings. Migration 68 xóa cấu hình kênh và cờ bảo trì Cò quay Nga cũ; giữ nguyên phòng web và giới hạn phòng theo kênh. Phòng lưu SQLite, dùng chung máy chủ web/Tailscale, phiên kết nối, kiểm tra phiên bản, SSE và cập nhật tin Discord.

Khi khởi động phiên bản này, migration xóa phiên Discord cũ và bốn vật phẩm coquay_magnifier/coquay_decoy/coquay_saw/coquay_cuffs khỏi túi, shop, pool cấu hình và hiệu ứng cũ, **không hoàn trả**. Gỡ khỏi catalog và pool mặc định; các override cũ không thể phát lại vật phẩm không còn trong catalog. Lịch sử quay, giao dịch và phần thưởng thành tựu đã nhận được giữ làm lịch sử; web không phát thành tựu. Cò quay Nga không còn thuộc bộ đếm thành tựu game cược hoặc số loại game. Các nút Discord cũ chỉ hướng dẫn mở phòng mới, không thể bắt đầu lại game cược.

Cập nhật code, chạy `npm run register` để thay schema `/coquay`, rồi khởi động lại bot và tải lại web. Dùng WEB_ENABLED/WEB_PUBLIC_URL hiện tại, không cần một Funnel/cổng riêng.

Kiểm tra: `npm run test:coquay`, `npm run test:coquay:ui` (Chrome cục bộ); các suite chung test:web:feedback, test:web:pairing, test:web:public và test:web:clocks. Mọi fixture dùng dữ liệu thử nghiệm; không truy cập tài khoản Discord thật.
