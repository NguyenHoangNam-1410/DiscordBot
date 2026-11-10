# Cò quay Nga trên web

Mở bằng `/coquay choi mau:5 vatpham:4 thoigian:30`, hoặc `!coquay choi mau=5 vatpham=4 thoigian=30`.

- Hai người đấu trực tiếp; chủ phòng cầm súng trước. HP tối đa 1–20 (mặc định 5), số đạo cụ chưa dùng tối đa 1–12/người (mặc định 4).
- Đồng hồ riêng 1–180 phút/người, mặc định 30, chỉ giảm khi tới lượt và không cộng giờ. Dùng đạo cụ không đặt lại thời gian đã tiêu. Phòng chờ đóng sau 10 phút.
- `/coquay phong`: danh sách có phân trang, mở web để chơi/xem; vào ghế qua tin phòng Discord. Người chơi kết nối bằng mã của tab web. Khán giả không được thao tác.
- `/coquay cauhinh phongtoida`: quản trị giới hạn 1–20 phòng/kênh, mặc định 5; mỗi người chỉ ở một phòng Cò quay Nga/server.
- Mở phòng tại kênh Discord hiện tại như các game web khác; không cần `/quantri datkenh` và không dùng danh mục kênh/bảo trì của game Discord cũ. Không cược xu hoặc ghi thành tựu, không cấp xu/kim cương từ ván web.

## Engine và hiệp đấu

`src/services/coquayEngine.js` chứa lõi luật thuần, cũng đang được sự kiện Gambler của Sinh tồn dùng; giới hạn cân bằng đạn được bật riêng cho bàn web, phân bố đạn của Gambler giữ nguyên. `src/coquay/engine.js` ánh xạ hai ghế vào các khóa nội bộ player/bot; không có AI trong phòng web.

Mỗi hiệp là một đợt nạp đạn: 2–3 viên ở hiệp 1, 4–5 ở hiệp 2, 6–8 từ hiệp 3. Mỗi đợt có ít nhất một viên thật và một viên lép; số lượng hai loại chênh nhau tối đa 2 viên khi nạp, áp dụng cả lần nạp do bắn hết đạn hoặc dùng bia. Chọn ngẫu nhiên đều trong các cách chia hợp lệ, rồi xáo trộn thứ tự phía máy chủ. Ví dụ 8 viên chỉ có 3 thật/5 lép, 4 thật/4 lép hoặc 5 thật/3 lép. Đạn còn lại sau khi bắn, loại hoặc đảo đạn vẫn theo kết quả thao tác. HP được giữ giữa các hiệp. Không nạp tiếp khi một người đã chết.

Bắn đạn thật gây 1 DMG. Tự bắn đạn lép giữ lượt; các phát bắn còn lại chuyển súng, trừ khi đối thủ đang bị còng. Cưa tăng DMG lên 2 cho phát tiếp theo và bị tiêu hiệu ứng kể cả khi gặp lép. Chết, hết đồng hồ hoặc đầu hàng kết thúc ván.

## Hộp đạo cụ

Đầu hiệp 1 và ngay khi nạp hiệp tiếp theo, máy chủ bốc chung một số lượng (ngẫu nhiên đều 1 hoặc 2 món) cho cả hai người. Mỗi bên mở một hộp cùng số món; từng món chọn độc lập, ngẫu nhiên đều trong 9 loại, có thể trùng. Số món bốc được bằng nhau trước khi xét sức chứa; mỗi bên tự bỏ phần vượt sức chứa, nên số món thực nhận có thể khác nhau nếu túi còn số chỗ trống khác nhau. Món cũ chưa dùng được giữ; phần bị bỏ không chuyển thành tiền hay thưởng khác. Giao diện Đạo cụ & hộp đồ ghi món nhận và số món bị bỏ ở hiệp mới nhất.

Bộ dùng cho bàn hai người là **1v1 + Double or Nothing**. Không trộn Jammer/Remote của Multiplayer. Giấy General Release of Liability và khẩu súng không phải đạo cụ tiêu hao để phát vào hộp.

| Đạo cụ                  | Tên gốc          | Công dụng                                                                                                                       |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Kính lúp                | Magnifying Glass | Chỉ người dùng biết viên hiện tại. Có thể soi lại, vẫn tiêu một món.                                                            |
| Cưa cầm tay             | Hand Saw         | Viên hiện tại gây 2 DMG nếu thật; bắn hoặc dùng bia loại viên thì hết cưa.                                                      |
| Còng tay                | Handcuffs        | Đối thủ bỏ một lượt khi súng chuyển sang họ; không cộng dồn, một còng mỗi lượt liên tục của người dùng.                         |
| Gói thuốc lá            | Cigarette Pack   | Hồi 1 HP, tối đa HP của bàn; dùng lúc đầy HP vẫn tiêu món.                                                                      |
| Lon bia                 | Beer             | Loại và công bố viên hiện tại, giữ lượt; hết đạn nạp hiệp mới.                                                                  |
| Bộ đảo đạn              | Inverter         | Đảo viên hiện tại thật ↔ lép; cập nhật thông tin đã biết về viên đó.                                                            |
| Adrenaline              | Adrenaline       | Chọn một món của đối thủ và dùng ngay cho mình; không cướp Adrenaline hoặc món chưa thể dùng.                                   |
| Điện thoại dùng một lần | Burner Phone     | Cho riêng người dùng biết vị trí/loại một viên ngẫu nhiên sau viên hiện tại. Một viên cuối không có dự đoán nhưng vẫn tiêu món. |
| Thuốc hết hạn           | Expired Medicine | 50% hồi 2 HP (có giới hạn tối đa), 50% mất 1 HP; có thể chết.                                                                   |

Đạo cụ dùng trong lượt của chủ sở hữu, dùng xong mất một món và không mất lượt nếu còn sống. Adrenaline cướp và dùng trong một request/transaction/version, không chiếm ô túi; chọn sai hoặc request cũ không tiêu món. Còng chỉ được dùng lại sau khi đối phương đã có lượt rồi quyền chơi quay về người đó; nạp hiệp mới không đặt lại hạn này.

Thông tin kính lúp/điện thoại chỉ gửi trong DTO của chính người sở hữu, không nằm trong `lastAction` công khai. Vị trí điện thoại tính từ viên hiện tại, tự giảm sau mỗi lần bắn/loại; khi trở thành viên hiện tại vẫn giữ dự đoán đúng. Đảo đạn cập nhật riêng các gợi ý đã biết về viên hiện tại, không công bố giá trị cho người khác. Nạp hiệp mới xóa mọi gợi ý. Các ô chưa biết không được đoán hoặc gửi qua HTTP/SSE.

Tham chiếu cơ chế: [Wiki Adrenaline](https://buckshot-roulette.fandom.com/wiki/Adrenaline), [Burner Phone](https://buckshot-roulette.fandom.com/wiki/Burner_Phone), [Hand Saw](https://buckshot-roulette.fandom.com/wiki/Hand_Saw), [Expired Medicine](https://buckshot-roulette.fandom.com/wiki/Expired_Medicine). Các giới hạn HP, số đồ phát mỗi hiệp, sức chứa và đồng hồ vẫn theo cấu hình bàn web.

## Giao diện và âm thanh

Một bàn 2D, hai khay đạo cụ, thanh HP và ảnh đại diện; nút xoay 180° trên thanh đầu chỉ đổi góc nhìn, giữ chữ dễ đọc và không gửi thao tác game. Súng trượt tới làn gần người đang cầm lượt; tự bắn đạn lép hoặc còng giữ lượt thì súng ở lại. Tổng số đạn thật/lép đứng cố định giữa bàn, không thể hiện thứ tự đạn. Chạm đạo cụ để xem ảnh/công dụng rồi bấm Sử dụng. Menu mở hộp, luật, kết nối và đầu hàng nằm gần bàn trên điện thoại; điện thoại ngang dùng cột điều khiển bên phải.

Sang hiệp mới: nạp các vỏ đạn trung tính vào súng rồi mở hộp, đạo cụ bay vào đúng ô được cấp của từng người; vật phẩm vượt sức chứa không có hiệu ứng nhận. Dùng đạo cụ có hiệu ứng bay từ khay về avatar. Gói thuốc lá có hình gói thuốc, nhãn +1 và hiệu ứng hồi máu; Thuốc hết hạn có hình lọ thuốc riêng. Adrenaline mở danh sách chọn đồ đối thủ, kèm mô tả món sẽ cướp và hiệu ứng đồ bay về người dùng. Bảng Đạo cụ & hộp đồ có mục tra cứu cả 9 loại với tên tiếng Anh để đối chiếu.

Hiệu ứng theo kết quả đã được máy chủ chấp nhận, không chặn thao tác/đặt lại đồng hồ. Phản hồi HTTP và SSE trùng nhau không chạy lại; tải lại trang hoặc kết nối lại tài khoản không phát lại lịch sử. Đổi ván, kết thúc hoặc bật giảm chuyển động sẽ dọn hiệu ứng còn lại và hiện đủ vật phẩm. Cuộn trang giữ hình bay căn theo vị trí trang; xoay bàn/đổi kích thước sẽ dọn hình tạm, không thay đổi trạng thái ván.

Súng và chín đạo cụ là SVG gốc trong index.html, không cần tải ảnh bên ngoài. Hiệu ứng chớp nòng, rung/nháy vị trí người bị thương áp dụng cho thao tác đã được máy chủ chấp nhận; tôn trọng prefers-reduced-motion. Âm súng dùng nhiễu ngắn cùng âm trầm, âm lép/nạp/đạo cụ và thắng/thua qua Web Audio chung. Nút loa nhớ lựa chọn của người dùng xuyên game; âm chỉ bắt đầu sau tương tác đầu tiên, không phát lại lịch sử sau tải lại.

## Dữ liệu và triển khai

Migration 67 tạo coquay_rooms, coquay_seats, coquay_channel_settings. Migration 68 xóa cấu hình kênh và cờ bảo trì Cò quay Nga cũ; giữ nguyên phòng web và giới hạn phòng theo kênh. Phòng lưu SQLite, dùng chung máy chủ web/Tailscale, phiên kết nối, kiểm tra phiên bản, SSE và cập nhật tin Discord.

Khi khởi động phiên bản này, migration xóa phiên Discord cũ và bốn vật phẩm coquay_magnifier/coquay_decoy/coquay_saw/coquay_cuffs khỏi túi, shop, pool cấu hình và hiệu ứng cũ, **không hoàn trả**. Gỡ khỏi catalog và pool mặc định; các override cũ không thể phát lại vật phẩm không còn trong catalog. Lịch sử quay, giao dịch và phần thưởng thành tựu đã nhận được giữ làm lịch sử; web không phát thành tựu. Cò quay Nga không còn thuộc bộ đếm thành tựu game cược hoặc số loại game. Các nút Discord cũ chỉ hướng dẫn mở phòng mới, không thể bắt đầu lại game cược.

Các phòng đã lưu được chuẩn hóa một lần khi đọc: `medicine` cũ đổi thành `cigarettes`, bỏ `shield` trong túi/hộp và hiệu ứng chắn. Giữ HP, lượt, đạn, hiệp và phần thời gian còn lại; không phát thêm đồ hoặc hoàn trả tài nguyên. Lõi `src/services/coquayEngine.js` của sự kiện Gambler Sinh tồn giữ nguyên.

Khởi động lại bot và tải lại web sau khi cập nhật. Không thay schema lệnh Discord, không cần đăng ký lại lệnh, Funnel hay cổng mới.

Kiểm tra: `npm run test:coquay`, `npm run test:coquay:ui` (Chrome cục bộ); các suite chung test:web:feedback, test:web:pairing, test:web:public và test:web:clocks. Mọi fixture dùng dữ liệu thử nghiệm; không truy cập tài khoản Discord thật.
