# Vietnamese Discord Game Bot

Phiên bản bot độc lập chỉ dành cho trò chơi và hệ thống xu. Không cần dữ liệu item hay dịch vụ đồng bộ bên ngoài.

## Trò chơi

- Bầu cua, Tài xỉu, Chinchiro
- Xì dách, Đua ngựa nhiều người, Dò mìn, Cò quay Nga
- Vua tiếng Việt
- Sinh tồn

## Cài đặt

1. Cài Node.js 18.17 trở lên.
2. Giải nén và chạy `npm install`.
3. Sao chép `.env.example` thành `.env`, sau đó điền token và ID Discord.
4. Chạy `npm run register` để đăng ký slash command cho server.
5. Chạy `npm start`.

### Chạy bằng Docker

1. Tạo `.env` từ `.env.example` và đăng ký lệnh một lần bằng `npm run register`.
2. Chạy `docker compose up -d --build`.
3. Database, WAL, backup và log được giữ ngoài container trong `./data` và `./logs`.
4. Dùng `docker compose logs -f gamebot` để theo dõi; `docker compose down` sẽ gửi SIGTERM và cho bot tối đa 30 giây để đóng sạch.

Bot cần bật **Message Content Intent** trong Discord Developer Portal nếu muốn dùng prefix command và trả lời trực tiếp trong Vua tiếng Việt.

## Lịch sử cập nhật

Người chơi dùng `/changelog` để xem thời gian và nội dung cập nhật bằng tiếng Việt. Mỗi trang có 3 bản cập nhật, mới nhất ở trang 1, hiển thị giờ Việt Nam (UTC+7). Có nút Trước/Sau, Mới nhất/Cũ nhất và tùy chọn `/changelog trang:2`.

Sau mỗi lần cập nhật, audit thay đổi rồi ghi lịch sử trước khi commit/push:

```sh
npm run changelog:add -- --title "Sinh tồn: cập nhật cân bằng" --change "Mô tả thay đổi cho người chơi" --change "Nội dung bổ sung"
```

Công cụ tự ghi thời gian cập nhật và audit. Khi bổ sung lịch sử cũ, thêm `--commit <SHA>` để lấy thời gian commit từ Git; không sửa nội dung lịch sử để phản ánh thay đổi mới. Dữ liệu ở `src/changelog.json`, không cần thêm bảng database. Chạy `npm run test:changelog` để kiểm tra dữ liệu và phân trang.

Để lệnh mới xuất hiện trên Discord: sau khi pull, chạy `npm run register` trên server đã có env Discord rồi restart bot.

## Lệnh tin nhắn (prefix)

Mọi lệnh slash đang đăng ký đều có bản prefix dùng chung handler, quyền quản trị, kiểm tra bảo trì và tham số với slash. Đặt `ENABLE_MESSAGE_COMMANDS=true` (hoặc `ENABLE_PREFIX_COMMANDS=true`) và bật Message Content Intent; `COMMAND_PREFIX` mặc định là `!`.

- Game: `!baucua`, `!taixiu`, `!chinchiro`, `!xidach`, `!poker`, `!duangua`, `!domin`, `!coquay`, `!sinhton`, `!vtv`.
- Người chơi: `!batdau`, `!hoso`, `!xu`, `!vatpham`, `!nhiemvu`, `!xephang`, `!anxin`, `!gacha`.
- Hướng dẫn/quản trị: `!trogiup`, `!huongdan`, `!luat`, `!quantri`.
- Chức năng con giữ nguyên tên slash: `!sinhton batdau`, `!sinhton thap`, `!sinhton tieptuc`, `!nhiemvu diemdanh`, `!gacha lichsu`, `!quantri baotri`.
- Tham số theo thứ tự trong slash: `!domin 1000 3`, `!gacha quay 10`, `!xu chuyen @nguoinhan 1000`, `!quantri datkenh sinhton #kenh`.
- Có thể ghi tên tham số để bỏ qua tùy chọn: `!sinhton hoso nguoidung=@user`, `!quantri suavatpham vatpham=item_id gia=50000` hoặc `--gia 50000`. Cú pháp `ten:giá_trị` cũng được hỗ trợ.
- Chuỗi nhiều từ đặt trong ngoặc kép: `!quantri suavatpham vatpham=item_id ten="Tên vật phẩm mới"`. Choice nhận giá trị hoặc tên lựa chọn; vật phẩm dùng ID đã hiển thị trong cửa hàng/túi đồ. Prefix không có autocomplete của Discord.
- Khi thiếu chức năng/tham số hoặc giá trị ngoài giới hạn, bot trả cách dùng. Các tên gọi cũ như `!hc`, `!blackjack`, `!mines`, `!use`, `!addgem` vẫn được hỗ trợ.

Tin trả lời prefix hiển thị trong kênh, kể cả bảng vốn là ephemeral của slash. Những nút mở bảng riêng tiếp tục dùng tương tác Discord và kiểm tra người sở hữu như trước.

## Bắt đầu và tiến độ

- `/batdau`: hướng dẫn người mới và nhận một lần 500 xu cùng màu hồ sơ Xanh Băng.
- `/trogiup`: chọn tab để xem lệnh theo từng nhóm; `/huongdan` vẫn là bản tóm tắt ngắn.
- Lệnh game riêng: `/baucua`, `/taixiu`, `/chinchiro`, `/xidach`, `/poker`, `/duangua`, `/domin`, `/coquay`, `/sinhton` và `/vtv`.
- `/vatpham`: cửa hàng, mua, túi đồ, sử dụng, tặng và quay Gacha.
- Vật phẩm bậc R–SSR mới: Kính Soi Chữ, Đồng Hồ Gia Hạn (Vua tiếng Việt); Máy Quét Hàng/Cột (Mines); Kính Lúp Nứt, Bảo Hiểm Trắng Tay (Bầu cua); Ống Ngắm Tổng Điểm, Bảo Hiểm Sát Nút (Tài xỉu); Vé Khán Đài (Đua ngựa); Miếng Đệm Quắc (Xì dách); Phiếu Bỏ Bài (Poker); Nước Thanh Tẩy (hủy hiệu ứng đang chờ). Vật phẩm bảo hiểm chỉ tiêu hao khi thực sự được hoàn. Vé Gacha ×10 bảo đảm ít nhất một SSR, nhân đôi trọng số UR và không thể trao đổi.
- `/nhiemvu`: nhiệm vụ, điểm danh, thành tựu và thưởng vai trò hàng tuần; `kiemtra` mở menu xem/nhận nhanh mọi thưởng chưa nhận, `nhan` nhận tất cả hoặc theo loại (nhiệm vụ, thành tựu, thưởng vai trò), `tanthu` nhận thưởng tân thủ (1 vé Gacha ×10 + 3000 kim cương, một lần).
- `/xephang`: bảng xếp hạng chung có dropdown để chuyển giữa tài sản và từng game.
- `/xu vanchoi`: xem kết quả, tiền cược và payout của 10 ván gần nhất.
- `/hoso [nguoidung]`: thẻ hồ sơ, huy hiệu và bảng thống kê đủ 9 game gồm số ván, thắng/thua/hòa, tỷ lệ thắng, tổng cược, tổng nhận và dòng xu ròng.
- `/vatpham quay luot:<1|10>`: quay bằng kim cương; gói 10 lượt bảo đảm tối thiểu một phần thưởng SR.
- `/chinchiro xu:<số xu>`: chơi Xúc Xắc Ngầm với Nhà cái trong một embed; người chơi chỉ bấm lắc khi Nhà cái cần so điểm.
- Admin dùng `!addgem @người_chơi <số lượng>` để cộng kim cương. Mọi thay đổi kim cương và lượt gacha đều có operation ID chống xử lý trùng.
- **Gacha: tỷ lệ theo độ hiếm là cố định.** Mặc định XU 50% · R 22% · SR 14% · SSR 10% · UR 4%. Bậc được chọn trước theo tỷ lệ này, rồi vật phẩm trong bậc được chọn **ngẫu nhiên đều**; thêm hay bớt vật phẩm không làm đổi tỷ lệ bậc (bậc có nhiều vật phẩm chỉ chia nhỏ tỷ lệ cho từng vật phẩm). Admin đổi tỷ lệ bậc bằng `/quantri config` với `GACHA_RATE_XU|R|SR|SSR|UR` (trọng số, tự chuẩn hóa về 100%; SR/SSR/UR tối thiểu 0.1), `/quantri themgacha` để thêm vật phẩm catalog vào bậc, `/quantri batgacha` để bật/tắt một phần thưởng và `/quantri xemgacha` để xem tỷ lệ từng bậc và từng vật phẩm.
- **Thưởng sự kiện sau ván:** mỗi ván hợp lệ roll độc lập khả năng rơi thêm xu, gem (chỉnh bằng `/quantri config`) và **vật phẩm riêng của chính game đó** (không rơi vật phẩm dùng chung như vé Gacha). Mỗi game có tỷ lệ riêng: Bầu cua, Tài xỉu, Xì dách, Dò mìn, Chinchiro 4% · Đua ngựa, Poker 6% · Cò quay Nga 5% · Vua tiếng Việt 3% · Sinh tồn chưa có vật phẩm riêng nên không rơi. Độ hiếm rơi cố định R 60% · SR 28% · SSR 9% · UR 3% (game không có vật phẩm ở độ hiếm nào thì bỏ qua và chuẩn hóa lại), vật phẩm trong độ hiếm chọn ngẫu nhiên đều. Hệ số chung `GAME_ITEM_DROP_MULTIPLIER` (mặc định 1, 0 để tắt) nhân tất cả tỷ lệ này.
- `/quantri datbuff` bật hệ số nhân có thời hạn: **xu drop**, **gem drop** (nhân số lượng khi đã roll trúng), **tỷ lệ rơi vật phẩm game** (nhân tỷ lệ rơi vật phẩm, tối đa 100%) và **tăng tỷ lệ ra vật phẩm Gacha** (nhân tỷ lệ các bậc R–UR so với bậc XU). Dùng `/quantri datbuff` với hành động `Xem buff đang chạy` để xem thời gian còn lại.
- Admin dùng `/quantri xemthuongvaitro` để mở bảng thưởng vai trò hàng tuần: xem danh sách và dùng các nút **Thêm / Sửa vai trò** (chọn vai trò rồi nhập số xu) hoặc **Xóa vai trò**; ba lệnh riêng lẻ cũ đã được gộp vào bảng này để nhường chỗ cho lệnh mới. Người chơi phải dùng `/nhiemvu nhan` (loại Thưởng vai trò) trong tuần để nhận; quên nhận sẽ mất phần tuần đó.

## Kiểm chứng công bằng

Các game cược tiếp tục dùng seed và HMAC-SHA256 nội bộ để tạo kết quả xác định. Thông tin kỹ thuật về seed/commit không hiển thị trên embed game để giao diện ngắn gọn hơn.

### Xì dách

- Chọn đối thủ bằng `chedochoi`: **nhà cái bot** (mặc định, chơi một mình với tách bài) hoặc **người chơi khác**: `/xidach ante:<số xu> chedochoi:nguoichoi` mở bàn, bạn làm nhà cái, tối đa 3 người vào bàn trong 30 giây.
- Ở bàn nhiều người, bài mỗi người được giữ kín: bấm **Xem bài của tôi** để xem bài và Rút bài/Dừng trong bảng riêng (chỉ bạn thấy); bot nhắc người đến lượt trong kênh và bài chỉ lộ khi ván kết thúc.
- Với prefix: `!xidach <số xu> [bot|nguoichoi]` (mặc định bot).

Trong ván với nhà cái bot, thắng thường nhận 2× tổng cược, Xì dách tự nhiên nhận 2,5×. Người chơi chỉ được Dừng khi có ít nhất 16 điểm nhà cái rút đến khi có ít nhất 15 điểm. Người chơi quắc trên 21 thua, nhưng nếu nhà cái cũng quắc thì **hòa** và hoàn cược; khi quắc mọi nút thao tác bị khóa. Luật 16/15 và cùng quắc = hòa áp dụng cho cả bàn nhiều người và đấu người (đấu người vốn đã hòa khi cả hai quắc). Lưu ý cân bằng: với hệ số 2× và luật mới, mô phỏng cho RTP khoảng 108% với chiến thuật cơ bản (người chơi có lợi); hạ `REGULAR_WIN_MULTIPLIER` xuống 1,8 để về khoảng 99%. Ngũ linh (đủ 5 lá không quắc) thắng nhà cái không có Ngũ linh. Trong ván 1v1, mỗi người xem tay bài bằng nút riêng, sau đó chọn Rút bài hoặc Dừng. Người có tay gần 21 nhất thắng toàn bộ tiền cược; Xì dách tự nhiên được ưu tiên cao nhất. Nếu ván hết hạn, cược được hoàn cho cả hai.

### Poker

`/poker` chơi với hai bot và hỗ trợ Texas Hold’em, Poker 6+, Crazy Pineapple và Omaha 5 lá. Lệnh không cần nhập buy-in: mỗi người tự đóng ante 50 xu (đổi bằng `POKER_ANTE`), sau đó xu chỉ bị trừ thêm khi Call hoặc Raise. Ngay từ Flop, mỗi bot lật công khai một lá tẩy và giữ nguyên lá đó trong suốt ván. Ván có ba hành động Tố, Theo/Check và Bỏ bài; Turn và River có vòng cược riêng. Nhập toàn bộ stack trong cửa sổ Tố để All-in. Giao diện đánh giá bộ bài mạnh nhất hiện tại của người chơi sau mỗi lượt. Bot cân nhắc sức mạnh bài, draw sảnh/thùng, pot odds, áp lực stack, phong cách riêng và bluff; bot Crazy Pineapple tự chọn lá bỏ tốt nhất nhưng không được bỏ lá đã công khai. Hệ thống tự động hoàn phần cược không ai theo, tạo Main Pot và nhiều Side Pot theo mức đóng góp, rồi xét riêng những người đủ điều kiện cho từng pot khi Showdown. Omaha bắt buộc dùng đúng hai lá tẩy và ba lá chung.

`/domin` có một ô đặc biệt không trùng vị trí mìn. Mở một ô cùng hàng hoặc cùng cột với ô đặc biệt sẽ phát cảnh báo trong mục tín hiệu riêng, còn ô trên bàn vẫn hiển thị 💎 như mọi ô an toàn khác. Tìm đúng ô 🌟 sẽ nhân thêm x1.50 vào multiplier hiện tại cho đến khi rút thưởng. Hệ số cơ sở đã tính xác suất nhận bonus và giảm dần theo số ô mở để tránh chiến thuật rút thưởng tạo xu vô hạn. Bỏ ván ngay không tính EXP hay tiến độ nhiệm vụ.

`/coquay cuoc:<xu>` (hoặc `!coquay <xu>`) là Cò quay Nga kiểu Buckshot Roulette: bạn và Bot mỗi bên 3 máu, cược một lần từ đầu, thắng nhận x2. Tự bắn đạn lép thì giữ lượt; tự bắn đạn thật mất 1 máu và mất lượt; bắn đối phương thì luôn chuyển lượt. Mỗi đợt nạp công khai số đạn thật/lép (đợt 1: 2–3 viên, đợt 2: 4–5, từ đợt 3: 6–8; luôn có ít nhất 1 thật và 1 lép). Bot chỉ dùng thông tin công khai và chọn nước tối ưu. Vật phẩm Gacha dùng bằng nút trong ván, mỗi loại 1 lần/ván: Kính Lúp Soi Nòng (SR), Bia Đỡ Đạn (SR), Cưa Cầm Tay (SSR), Còng Số 8 (UR).

Dò mìn dùng 2–7 mìn trên bàn 20 ô. Giáp Chống Nổ chỉ vô hiệu hóa **một** quả mìn đầu tiên bạn chạm trên mỗi bản đồ; quả mìn thứ hai vẫn phát nổ như bình thường.

### Đua ngựa trực tiếp

Sau 30 giây nhận cược, bot khóa cược và hiển thị cuộc đua trực tiếp trong 18 giây qua 9 chặng. Hệ thống có 20 ngựa thường và 1 Thiên Mã đặc biệt; mỗi ván chọn đúng 6 con. Thiên Mã có 7% cơ hội xuất hiện và chiếm một trong sáu vị trí. Mỗi ngựa có kỹ năng và nhịp chạy riêng: xuất phát nhanh, ôm cua, giữ sức, núp gió, chống sự cố hoặc lội ngược dòng. Hệ số được tạo riêng cho từng ván theo RNG, ngày, khung giờ và phong độ hiện tại rồi được khóa trong suốt ván. Trong cuộc đua có thể xuất hiện các biến cố gây giảm tốc như đau bụng, vấp chân, dừng gặm cỏ, chạy nhầm làn hoặc mải tạo dáng. Khi cán đích, bot công bố bục vinh quang, khoảnh khắc quyết định, thông số nhà vô địch và thanh toán cược.

Ngựa được chia thành các hệ Cân bằng, Tốc độ, Bền bỉ, Kỹ thuật, Bí ẩn, Phòng thủ, Đột biến và Thần thoại. Sau khi khóa cược, bot mới RNG và công bố debuff của đường đua như mưa lớn, bùn lầy, gió ngược, cua gắt, nắng nóng, sương mù, mặt đường trơn hoặc khán đài náo loạn. Debuff tăng hoặc giảm cơ hội chiến thắng theo hệ ngựa và không được tiết lộ trong thời gian đặt cược.

Sinh tồn bắt đầu bằng `/sinhton batdau`: chọn class, nhập cược rồi xác nhận trên UI riêng. Mỗi 5 tầng có checkpoint hồi đầy HP và tăng chỉ số; boss mỗi 50 tầng, tầng 999 là Deimoss dạng Final Boss. Pool surprise có 15 sự kiện; Wrong Portal 50/50. Phòng thủ nhân đôi Defense, miễn chí mạng và giảm thêm 40% sát thương. Payout tính cả checkpoint, đạt hệ số ×12 ở tầng 100 rồi giữ nguyên hệ số trong Overrun; trần 10.000.000 xu.

Trang bị Sinh tồn dùng catalog riêng `src/hardcore/item.js`: 100 món (32 R, 28 SR, 24 SSR, 16 UR), nhặt lại tăng level. UR có buff và curse tách riêng; chỉ Goblin’s Debt và Crown of Ruin giảm payout. Purifier dùng payout để gỡ một lớp curse và giữ buff. Vật phẩm chỉ tồn tại trong run; session cũ vẫn đọc định nghĩa trang bị đã lưu, không cần xóa hoặc migration SQLite. `/sinhton tieptuc` tạo UI mới, giữ kết quả ẩn đã roll. Lost Adventurer: cứu mất 2 bình nhận R 80% / SR 20%; cướp nhận SSR 25%, không có gì 75%. Kim cương là tổng thưởng tạm giữ: tầng 100/200/300/400/500/600/700/800/900 giữ 100/200/400/800/1.600/3.200/6.400/12.800/25.600; hạ boss tầng 999 giữ 51.200. Chỉ rút thưởng mới cộng kim cương vào tài khoản; chết/bỏ run/hết hạn mất toàn bộ. Phí dịch vụ không trừ kim cương. `/hoso` hiển thị tầng cao nhất đã vượt, tự dùng khung cao nhất đã mở: Bạc 333, Vàng 666, Kim cương 999. Thành tích và khung được giữ sau khi run kết thúc. Vé Thoát Hiểm giữ tối đa 1; bình tối đa 5. Run không thao tác 7 ngày sẽ mất cược.

## Thiết lập kênh

Dùng `/quantri datkenh` để đặt kênh riêng cho từng game. Đua ngựa là bàn chung nhiều người và nhận cược trong 30 giây. Sinh tồn là game cá nhân có cược, trang bị hỗ trợ và bảng xếp hạng tầng.

Các lệnh thông thường có trong `/trogiup` (chọn mục bằng dropdown) và `/huongdan` (bản tóm tắt). Quản trị viên dùng một lệnh `/quantri` để cấu hình kênh, phần thưởng, giới hạn cược, cửa hàng và vận hành. Các prefix command cũ vẫn có thể bật để tương thích.

`/hoso` lấy cấp độ và thanh EXP làm tiến trình chính thay cho tỷ lệ thắng tổng. EXP cần cho cấp kế tiếp bằng cấp hiện tại nhân hệ số cấu hình; mỗi mốc cấp tự hiển thị phần thưởng kế tiếp. Mỗi ván thua/hòa nhận 10 EXP; ván thắng nhận `10 + floor(xu lãi / 2.000)`, tối đa 500 EXP/ván. Kết quả EXP và cấp mới được ghi ngay trên embed kết quả. Vua Tiếng Việt không nhận EXP trực tiếp từ ván chơi và trang chi tiết chỉ ghi tổng xu đã kiếm được, không hiển thị tỷ lệ thắng/thua.

Quản trị viên có thể dùng `/quantri kinhte` để xem tổng cung và dòng xu trong 24 giờ, hoặc `/quantri trangthai` để kiểm tra tính toàn vẹn database, backup gần nhất, phiên đang hoạt động và lỗi runtime.

Các biến cân bằng game không còn bắt buộc phải sửa file rồi khởi động lại bot. Dùng `/quantri xemcauhinh` để xem và chỉnh giá trị bằng menu, hoặc `/quantri khoiphuc` để trở về giá trị `.env`/mặc định theo từng server. Hiện hỗ trợ cấu hình economy, phần thưởng game, tỷ lệ câu khó, ante Poker và hệ số EXP/level; thay đổi áp dụng ngay, riêng xu khởi đầu chỉ áp dụng cho tài khoản được tạo mới.

Admin dùng `/quantri xoadulieu` để xóa xu, kim cương, EXP/cấp của một người chơi. Bỏ trống người chơi để xem trước số tài khoản bị ảnh hưởng và xác nhận thao tác trên toàn server.

`/quantri xoadulieu dulieu:RESET SERVER` (bỏ trống người chơi) xóa **mọi dữ liệu người chơi** của server: tài khoản xu, kim cương, cấp/EXP, túi đồ, hiệu ứng, lịch sử và pity Gacha, nhiệm vụ, thành tựu, thống kê, xếp hạng, quà đã nhận và ván đang chơi. **Cấu hình được giữ nguyên**: channel game, phần thưởng, giới hạn cược, cân bằng game, cửa hàng, pool Gacha, buff sự kiện và thưởng theo role. Có bước xác nhận và không thể hoàn tác.

## Vận hành và cân bằng

- `npm run test:coverage`: chạy test và bắt buộc đạt ngưỡng coverage trong CI.
- `npm run test:stress -- 1000 12`: mô phỏng 1.000 người trên 12 kết nối, double-click xu/kim cương/gacha, SQLite bị giữ khóa và tiến trình khởi động lại sau thanh toán.
- `npm run simulate:rtp -- 1000000`: mô phỏng RTP và làm CI thất bại khi vượt `RTP_MAX_PERCENT`. Các cửa cược xúc xắc được liệt kê chính xác toàn bộ kết quả để tránh cảnh báo sai do nhiễu Monte Carlo. Xì dách với nhà cái được mô phỏng bằng đúng luật của game (bộ bài 6 bộ không hoàn lại, quắc luôn thua, Ngũ linh, split, double; không tính vật phẩm) và có test đối chiếu từng ván với engine thật; RTP ước tính khoảng 91–95% tùy chiến thuật.
- `/luat` mở luật ngắn theo từng game. Kết quả có nút chơi lại; thành tựu mới hiện ngay và huy hiệu xuất hiện trên `/hoso`.

SQLite được tạo tự động tại `data/game-bot.sqlite`, dùng WAL và `synchronous=FULL` để đồng bộ mỗi commit trước khi báo thành công. Bot sao lưu nhất quán khi khởi động (không chờ Discord kết nối), sau mỗi 24 giờ và khi dừng bình thường vào `data/backups`, mặc định giữ 14 bản gần nhất. Mỗi bản được kiểm tra `integrity_check`, hoàn tất thành một file độc lập, fsync và xuất bản trước khi dọn bản cũ. Snapshot tại chỗ được gửi thêm qua DM Discord nếu có cấu hình người nhận; chỉ bản DM đã gửi thành công bảo vệ khi mất ổ đĩa/toàn bộ máy chủ.
`/quantri ketthucvan mavan:<mã>` buộc kết thúc và hoàn cược mọi loại ván có mã (Xì dách với bot và bàn nhiều người, Xì dách đấu người, Poker, Dò mìn, Cò quay Nga, Chinchiro, Sinh tồn, Bầu cua, Tài xỉu, Đua ngựa). Ván Xì dách với bot, Dò mìn, Cò quay Nga, Chinchiro và Sinh tồn không hoạt động quá `SOLO_SESSION_TTL_MINUTES` phút (mặc định 10; 2 phút nếu tin nhắn ván chưa gửi được) sẽ tự đóng và **người chơi mất tiền cược** (để không thể bỏ ván đang thua rồi đòi hoàn); riêng ván chưa có tin nhắn vì lỗi gửi thì hoàn cược. Với Xì dách đấu người, bàn Xì dách và bàn Poker hết hạn giữa chừng, người còn nợ một hành động mất cược, người đã hoàn tất lượt được hoàn; hết hạn ở lời mời hoặc sảnh chờ thì hoàn cho tất cả. Admin kết thúc ván bằng `ketthucvan` vẫn hoàn cược cho mọi người.

Duel và bàn Xì dách đã kết thúc được giữ `GAME_RECORD_RETENTION_DAYS` ngày (mặc định 7) rồi tự xóa cùng dữ liệu bộ bài/tay bài. Lịch sử kim cương và gacha mặc định được giữ 180 ngày; điều chỉnh bằng `DIAMOND_LOG_RETENTION_DAYS` và `GACHA_HISTORY_RETENTION_DAYS`.

Khi nhận `SIGINT` hoặc `SIGTERM`, bot ngừng nhận thao tác mới, dừng timer, chờ tối đa 10 giây cho handler đang chạy, chờ backup đang thực hiện rồi tạo một backup mới trước khi đóng Discord/SQLite và kênh IPC. Nếu handler quá hạn, chỉ dữ liệu đã commit được bảo vệ. Khi có `uncaughtException`, bot chờ backup đang chạy và đóng database nhưng không tạo thêm bản mới từ tiến trình lỗi. Mất điện/`SIGKILL` không chạy được bước shutdown; SQLite phục hồi transaction đã commit từ WAL trên ổ đĩa còn nguyên.

## Emoji của ứng dụng (Developer Portal → Bot → Emojis)

Emoji tải lên ở Developer Portal dùng được ở mọi server mà bot có mặt. Khi khởi động bot tự tải danh sách và tra id theo **tên**, nên chỉ cần đặt đúng tên. Xúc xắc Chinchiro dùng `dieWhite1`–`dieWhite6`; thiếu emoji nào thì tự dùng emoji chuẩn (`:one:`…). Trong code dùng `appEmoji('tên', 'dự phòng')` (chuỗi `<:tên:id>`) hoặc `appEmojiObject('tên')` cho nút/menu (`src/utils/appEmoji.js`).

## Định dạng tin nhắn kết quả và thưởng

Mọi game dùng chung `src/utils/rewardText.js`: metric luôn đi kèm icon (xu `:coin:`, kim cương `:gem:`, EXP `:test_tube:`) và kết quả mỗi người gọn trên một dòng, ví dụ:

```
<người chơi> thắng: +102.000 :coin: +11 :test_tube:
🎉 BUFF SỰ KIỆN: +3 :gem: · 🟠 [SSR] Trúng Đậm
```

Số xu là **thay đổi ròng** (tiền nhận về − tiền cược): thắng `+`, thua `-` (mất cược), hòa `±0`. Vật phẩm rơi hiện icon độ hiếm: nếu đã tải emoji ứng dụng tên `r_icon`, `sr_icon`, `ssr_icon`, `ur_icon` thì bot dùng chúng, không thì dùng vòng tròn màu (🔵🟣🟠🔴).

## Hệ số thắng cược 1-1 với nhà cái

`/quantri hesothang` mở bảng (menu + modal) để admin chỉnh **hệ số thắng** của các game đấu 1-1 với nhà cái. Hệ số là tổng tiền nhận về / tiền cược khi thắng (x2 = ăn 1 đền 1), cho phép từ **x1,1 đến x3**:

| Game | Mặc định | Phạm vi áp dụng |
|---|---|---|
| Xì dách (với bot) | x2 | Thắng thường và Ngũ linh; Xì dách tự nhiên = hệ số + 0,5 |
| Chinchiro | x1,8 | Thắng bằng điểm cao hơn nhà cái; Shigoro, Bão, Pin-Zoro giữ nguyên |
| Cò quay Nga | x2 | Hạ Bot về 0 máu |
| Tài xỉu | x2 | Cửa Tài/Xỉu/Chẵn/Lẻ (ra bộ ba vẫn thua); Bộ ba và Tổng cụ thể giữ nguyên |

Hệ số được khóa vào ván lúc bắt đầu (Tài xỉu: lúc mở ván), nên ván đang chơi không bị đổi giữa chừng. Bảng hiển thị RTP ước tính khi chơi tối ưu và không dùng vật phẩm, kèm cảnh báo ⚠️ nếu trên 100% (người chơi có lợi). Giá trị được lưu theo từng server và có nút **Khôi phục mặc định**. Chênh lệch nhỏ vì làm tròn xu xuống số nguyên.

### Rift Paradox v2 và Tháp Định Mệnh (05/10/2026)

Paradox mới xuất hiện sau checkpoint/nâng thuộc tính tại mốc 25–975: chọn một trong hai luật thuộc một cặp được khóa bằng Fair RNG (mỗi cặp 25%). Tám luật chỉ có hiệu lực trong năm tầng tiếp theo, không sửa stat gốc hoặc payout. Paradox cũ đang hoạt động và lựa chọn cũ đã lưu tiếp tục xử lý theo v1.

`/choi sinhton thap` hoặc `/sinhton thap` mở/tiếp tục mode độc lập 15 tầng; có thể chơi đồng thời với Sinh tồn 999. Tuần đầu **Sổ Nợ Arcane** mở từ 00:00 ngày 05/10 đến 00:00 ngày 12/10 (UTC+7), không cược, không loadout, không RNG. Hoàn thành nhận **500.000 xu + 250 kim cương một lần mỗi guild/người/tuần**. Replay không trả thêm thưởng. Sau hết hạn có 24 giờ xem lại; không hành động hoặc nhận thưởng. UI có nút chơi lại và bảng xếp hạng tuần.

Migration 35 tạo `hardcore_tower_sessions` và `hardcore_tower_results`, tự chạy khi bot khởi động. Sau pull bản mới: chạy `npm run register` trên server có env Discord rồi restart bot. Không cần upload asset/emoji mới.

Chạy `npm run test:hardcore:paradox`, `npm run test:hardcore:tower`, `npm run solve:hardcore:tower`. Solver duyệt toàn bộ hành động hợp lệ và chỉ đăng ký challenge khi có đúng một lời giải, khớp chuỗi chuẩn và final state. Kịch bản nằm trong `src/hardcore/tower/`, catalog trong `src/hardcore/towerChallenges.js`; các tuần sau thêm dữ liệu mới, phiên bản/ID riêng và mốc `startsAt`/`endsAt` rõ timezone. `endsAt` hỗ trợ season hai tuần. Hiện chỉ đăng ký tuần 41; không tự tạo kịch bản khi sang tuần chưa có nội dung. History lưu fingerprint SHA-256 từng hành động; session không lưu chuỗi lời giải dạng plaintext.


## Chẩn đoán phản hồi chậm của Sinh tồn

Sinh tồn dùng hàng đợi riêng cho battle và bảng chi tiết: cập nhật bảng riêng không giữ lượt chơi chờ, còn cập nhật battle vẫn theo thứ tự để tránh ghi đè bằng lượt cũ. Các nút trùng lượt trong cùng hàng đợi được xác nhận nhưng không gửi lại bảng đã cập nhật thành công. Nút cũ ở lần bấm sau vẫn có thể khôi phục UI hiện tại.

Bot ghi `slow hardcore interaction` khi một tương tác mất từ 1 giây, đến handler muộn từ 1 giây, hoặc xử lý lượt mất từ 100 ms. Log thường ở mức debug (`hardcore interaction timing`); đặt `LOG_LEVEL=debug` khi cần xem mọi lượt, restart bot và đổi về `info` sau khi kiểm tra. Log nằm trong `LOG_DIR/bot.log` (mặc định `logs/bot.log`, trừ khi đổi `LOG_FILE_NAME`).

- `gameMs`: xử lý hành động và transaction SQLite.
- `renderMs`: dựng battle hoặc bảng chi tiết.
- `queueMs`: chờ các thao tác trước trong cùng hàng đợi.
- `ackMs`: chờ Discord xác nhận đã nhận tương tác.
- `discordMs`: tổng thời gian chờ các lời gọi Discord, gồm cả xác nhận, mạng, retry và hàng đợi REST. Vì đã bao gồm `ackMs`, không cộng hai số này.
- `ingressAgeMs`: tuổi tương tác lúc handler bắt đầu; có thể bao gồm độ trễ giao nhận hoặc event loop bị nghẽn, chưa đủ để kết luận nguyên nhân.
- `totalMs`: thời gian từ khi handler bắt đầu tới khi hoàn tất. `duplicateUpdateSkipped` cho biết bot đã bỏ cập nhật trùng.

Log `discord REST rate limited` xác nhận thư viện đang chờ giới hạn API; có thời gian phải đợi, không ghi URL webhook/token. `discordMs` cao nhưng không có log rate limit có thể do mạng, Discord hoặc retry. `gameMs` cao cần kiểm tra CPU/SQLite/ổ đĩa trên server. Đây là các số đo để chẩn đoán, không phải cam kết về thời gian phản hồi.

Chạy `npm run test:hardcore:latency` để kiểm tra Discord chậm, bấm trùng, thứ tự cập nhật, phục hồi lỗi và xác nhận rút thưởng. Script cũng báo thời gian xử lý lượt đơn giản/dựng battle trên SQLite trong RAM; số này không đo mạng hoặc ổ đĩa server.


### Backup và phục hồi khi server lỗi

Không copy riêng file `game-bot.sqlite` khi bot đang chạy: giao dịch mới có thể còn trong `-wal`. Dùng `npm run db:backup` để tạo snapshot nhất quán bằng SQLite Backup API; chạy từ thư mục bot với cùng `DB_PATH`/env. `/quantri trangthai` hiển thị lần backup thành công, lỗi, lịch sao lưu và chế độ ghi; trạng thái toàn vẹn không đồng nghĩa đã có backup ngoài server.

Có thể cấu hình trên server:

```dotenv
DB_BACKUP_INTERVAL_MINUTES=15
DB_BACKUP_RETENTION=14
# DB_BACKUP_DIR=/duong-dan-luu-backup
```

`DB_BACKUP_INTERVAL_MINUTES` (1–10080) ưu tiên hơn `DB_BACKUP_INTERVAL_HOURS`; bỏ trống sẽ dùng cấu hình giờ cũ, mặc định 24 giờ. Retention là số bản, không phải số ngày: 14 bản mỗi 15 phút giữ khoảng 3,5 giờ, và restart/shutdown tạo thêm bản làm khoảng thời gian lưu ngắn hơn. Tăng retention (2–90) nếu ổ đĩa đủ dung lượng. Theo dõi dung lượng ổ đĩa vì mỗi snapshot là toàn bộ database, không phải bản tăng dần. Không ghi live SQLite lên filesystem mạng; chỉ chuyển file backup đã hoàn tất ra ngoài.

Với PM2, đặt `kill_timeout: 120000` trong cấu hình ứng dụng hiện có để bot có thời gian drain và backup trước khi bị kill. Mặc định PM2 chỉ đợi khoảng 1,6 giây. Nếu chạy Docker, cấp `stop_grace_period` đủ dài tương ứng. Thời gian cần thực tế phụ thuộc kích thước database/ổ đĩa; không thể cam kết backup hoàn tất trước khi supervisor cưỡng bức dừng.

Khi cần phục hồi:

1. Dừng bot bằng PM2 và giữ bot dừng trong lúc phục hồi.
2. Chọn một bản backup nguyên vẹn; giữ database cũ và các sidecar để có thể điều tra.
3. Chạy `npm run db:restore -- "/duong-dan/backup.sqlite" "/duong-dan/game-bot-restored.sqlite"`. Thư mục đích phải tồn tại, file đích và các sidecar chưa được tồn tại. Công cụ kiểm tra source, tạo snapshot độc lập rồi xuất bản nguyên tử; không ghi đè database cũ và không tự chạy migration.
4. Đặt `DB_PATH` tới file mới, khởi động bot và kiểm tra `/quantri trangthai`, xu/túi đồ/lượt chơi. Bot sẽ chạy migration bình thường nếu phiên bản code mới hơn bản backup.

Phục hồi backup sẽ mất những thay đổi sau thời điểm snapshot. Nếu ổ đĩa còn nguyên, hãy ưu tiên phục hồi live SQLite cùng WAL của nó trước khi quay về bản backup cũ. Nếu mất hẳn server/ổ đĩa, cần một bản sao ngoài server; bot đã hỗ trợ gửi file qua DM Discord như hướng dẫn bên dưới. Muốn giảm mất dữ liệu xuống gần 0 khi mất máy chủ cần cơ chế sao chép liên tục/commit sang một hệ thống độc lập, khác với snapshot định kỳ.

Chạy `npm run test:db:recovery`: kiểm tra kill tiến trình giữa transaction, phục hồi xu/lượt chơi, bản backup độc lập, retention, lỗi backup, shutdown khi Discord chưa ready và chờ thao tác đang chạy. Kiểm tra SIGKILL không mô phỏng được mất điện thật hoặc lỗi phần cứng.

Tham khảo: [SQLite WAL](https://www.sqlite.org/wal.html), [SQLite synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous), [SQLite Backup API](https://www.sqlite.org/backup.html), [PM2 graceful shutdown](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/).


### Nhận backup qua DM Discord

Bot này mặc định gửi backup tới User ID `697794640148955206`, theo cấu hình `src/discordBackupConfig.json`. Có thể đổi bằng `DB_BACKUP_DISCORD_USER_ID`; đặt biến này thành chuỗi rỗng để tắt gửi DM. Không suy ra người nhận từ danh sách admin và không gửi ra channel công khai. Cấu hình chỉ chứa User ID, không chứa token.

Sau khi kết nối Discord, bot gửi bản snapshot mới nhất đã kiểm tra, rồi gửi các bản theo lịch backup và bản cuối lúc dừng bình thường. Gửi chạy nền, không giữ handler game phải chờ. Lịch mặc định vẫn 24 giờ; đặt `DB_BACKUP_INTERVAL_MINUTES=15` nếu muốn gửi mỗi 15 phút. `npm run db:backup` tạo snapshot tại chỗ, không tự đăng nhập Discord để gửi DM; scheduler trong bot mới thực hiện gửi.

File được nén bằng gzip qua stream; mỗi phần upload tối đa 8 MiB để giữ RAM thấp, mỗi request chỉ gửi một phần. Một backup tối đa 100 phần; file quá lớn sẽ báo lỗi và vẫn giữ snapshot local. Với một phần, file `.sqlite.gz` và `.manifest.json` nằm trong cùng tin nhắn. Với nhiều phần, bot gửi `.gz.part001`, `.gz.part002`... và cuối cùng gửi manifest xác nhận hoàn tất. Không coi những phần chưa có manifest cuối là một backup hoàn chỉnh.

Manifest chứa kích thước, thứ tự file và SHA-256 của từng phần, file nén và database gốc. Nén gzip không phải mã hóa. Đây là toàn bộ database của bot, chỉ gửi tới chủ bot đã chỉ định. `/quantri trangthai` hiển thị riêng backup local và DM thành công gần nhất, cùng lỗi gửi. Bot không tự xóa những DM backup cũ.

Nếu DM bị chặn, lỗi mạng, file bị Discord từ chối hoặc timeout, local backup vẫn giữ nguyên; bot báo lỗi và thử gửi bản mới nhất sau 5 phút. Mỗi lần gửi có deadline mặc định 60 giây, đổi bằng `DB_BACKUP_DISCORD_TIMEOUT_SECONDS` (5–600); snapshot được ghi nhận đã gửi chỉ sau khi Discord chấp nhận toàn bộ file/manifest. Khi Discord chưa kết nối, bot vẫn backup local và chờ kết nối để gửi. Mất điện/SIGKILL không thể gửi bản cuối; phục hồi ngoài server chỉ đến bản DM đã hoàn tất gần nhất.

Bật quyền nhận DM từ bot, cùng server với bot và không chặn bot. Sau khi pull/restart, kiểm tra DM đầu tiên và `/quantri trangthai`; kiểm tra giả lập không thay thế cho việc xác nhận nhận file thật. Với PM2 nên đặt `kill_timeout: 180000` cho cấu hình timeout mặc định để có thời gian chờ lượt chơi, upload đang chạy và upload snapshot cuối; tăng tương ứng nếu tăng deadline hoặc database lớn.

Để phục hồi trên máy mới:

1. Mở các tin nhắn DM backup và tải file nén/tất cả các phần cùng manifest, giữ nguyên tên file, đặt chung một thư mục. URL CDN đính kèm có hạn; mở lại tin nhắn để lấy link mới, không dùng một URL đã lưu lâu làm nơi lưu duy nhất.
2. Dừng bot, giữ database cũ. Chạy `npm run db:restore:discord -- "/thu-muc/backup.manifest.json" "/thu-muc/game-bot-restored.sqlite"`. Thư mục đích phải tồn tại; file đích và sidecar chưa được tồn tại.
3. Công cụ kiểm tra phần thiếu/hỏng và SHA-256, ghép/giải nén bằng stream rồi kiểm tra SQLite; file hỏng không được xuất bản và database cũ không bị ghi đè.
4. Đặt `DB_PATH` tới database đã phục hồi, khởi động bot và kiểm tra dữ liệu.

Có thể giải nén một file `.sqlite.gz` rồi dùng `db:restore` như trước; công cụ manifest giúp kiểm tra thêm hash. Dữ liệu sau thời điểm snapshot sẽ không có trong bản phục hồi. Giữ DM và nên tải thêm bản quan trọng về máy: Discord là một nơi nhận file độc lập với server bot, không phải cam kết lưu trữ database vĩnh viễn.

Chạy `npm run test:db:discord` để kiểm tra recipient, gzip/chia file, checksum/phục hồi, lỗi DM, deadline, retry và gửi khi shutdown. Test dùng transport giả lập, không gửi dữ liệu thật.

Tham khảo: [Discord Create DM](https://docs.discord.com/developers/resources/user#create-dm), [upload file](https://docs.discord.com/developers/reference#uploading-files), [URL đính kèm có thời hạn](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls).
