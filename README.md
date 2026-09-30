# Vietnamese Discord Game Bot

Phiên bản bot độc lập chỉ dành cho trò chơi và hệ thống xu. Không cần dữ liệu item hay dịch vụ đồng bộ bên ngoài.

## Trò chơi

- Bầu cua, Tài xỉu, Chinchiro, Oẳn tù tì
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

## Bắt đầu và tiến độ

- `/batdau`: hướng dẫn người mới và nhận một lần 500 xu cùng màu hồ sơ Xanh Băng.
- `/trogiup`: chọn tab để xem lệnh theo từng nhóm; `/huongdan` vẫn là bản tóm tắt ngắn.
- `/choi`: một lệnh chung để chọn đủ 9 game.
- `/vatpham`: cửa hàng, mua, túi đồ, sử dụng, tặng và quay Gacha.
- Vật phẩm bậc R–SSR mới: Máy Đếm Tiếng, Đồng Hồ Gia Hạn (Vua tiếng Việt); Máy Quét Hàng/Cột (Mines); Kính Lúp Nứt, Bảo Hiểm Trắng Tay (Bầu cua); Ống Ngắm Tổng Điểm, Bảo Hiểm Sát Nút (Tài xỉu); Vé Khán Đài (Đua ngựa); Bùa Giảm Đau (Oẳn tù tì); Miếng Đệm Quắc (Xì dách); Phiếu Bỏ Bài (Poker); Nước Thanh Tẩy (hủy hiệu ứng đang chờ). Vật phẩm bảo hiểm chỉ tiêu hao khi thực sự được hoàn. Vé Gacha ×10 bảo đảm ít nhất một SSR, nhân đôi trọng số UR và không thể trao đổi.
- `/nhiemvu`: nhiệm vụ, điểm danh, thành tựu và thưởng vai trò hàng tuần; `kiemtra` mở menu xem/nhận nhanh mọi thưởng chưa nhận, `nhan` nhận tất cả hoặc theo loại (nhiệm vụ, thành tựu, thưởng vai trò), `tanthu` nhận thưởng tân thủ (1 vé Gacha ×10 + 3000 kim cương, một lần).
- `/xephang`: bảng xếp hạng chung có dropdown để chuyển giữa tài sản và từng game.
- `/xu vanchoi`: xem kết quả, tiền cược và payout của 10 ván gần nhất.
- `/hoso [nguoidung]`: thẻ hồ sơ, huy hiệu và bảng thống kê đủ 9 game gồm số ván, thắng/thua/hòa, tỷ lệ thắng, tổng cược, tổng nhận và dòng xu ròng.
- `/vatpham quay luot:<1|10>`: quay bằng kim cương; gói 10 lượt bảo đảm tối thiểu một phần thưởng SR.
- `/choi chinchiro xu:<số xu>`: chơi Xúc Xắc Ngầm với Nhà cái trong một embed; người chơi chỉ bấm lắc khi Nhà cái cần so điểm.
- Admin dùng `!addgem @người_chơi <số lượng>` để cộng kim cương. Mọi thay đổi kim cương và lượt gacha đều có operation ID chống xử lý trùng.
- **Gacha: tỷ lệ theo độ hiếm là cố định.** Mặc định XU 50% · R 22% · SR 14% · SSR 10% · UR 4%. Bậc được chọn trước theo tỷ lệ này, rồi vật phẩm trong bậc được chọn **ngẫu nhiên đều**; thêm hay bớt vật phẩm không làm đổi tỷ lệ bậc (bậc có nhiều vật phẩm chỉ chia nhỏ tỷ lệ cho từng vật phẩm). Admin đổi tỷ lệ bậc bằng `/quantri config` với `GACHA_RATE_XU|R|SR|SSR|UR` (trọng số, tự chuẩn hóa về 100%; SR/SSR/UR tối thiểu 0.1), `/quantri themgacha` để thêm vật phẩm catalog vào bậc, `/quantri batgacha` để bật/tắt một phần thưởng và `/quantri xemgacha` để xem tỷ lệ từng bậc và từng vật phẩm.
- **Thưởng sự kiện sau ván:** mỗi ván hợp lệ roll độc lập khả năng rơi thêm xu, gem (chỉnh bằng `/quantri config`) và **vật phẩm riêng của chính game đó** (không rơi vật phẩm dùng chung như vé Gacha). Mỗi game có tỷ lệ riêng: Bầu cua, Tài xỉu, Xì dách, Dò mìn, Chinchiro 4% · Đua ngựa, Poker 6% · Cò quay Nga 5% · Oẳn tù tì, Vua tiếng Việt 3% · Sinh tồn chưa có vật phẩm riêng nên không rơi. Độ hiếm rơi cố định R 60% · SR 28% · SSR 9% · UR 3% (game không có vật phẩm ở độ hiếm nào thì bỏ qua và chuẩn hóa lại), vật phẩm trong độ hiếm chọn ngẫu nhiên đều. Hệ số chung `GAME_ITEM_DROP_MULTIPLIER` (mặc định 1, 0 để tắt) nhân tất cả tỷ lệ này.
- `/quantri datbuff` bật hệ số nhân có thời hạn: **xu drop**, **gem drop** (nhân số lượng khi đã roll trúng), **tỷ lệ rơi vật phẩm game** (nhân tỷ lệ rơi vật phẩm, tối đa 100%) và **tăng tỷ lệ ra vật phẩm Gacha** (nhân tỷ lệ các bậc R–UR so với bậc XU). Dùng `/quantri datbuff` với hành động `Xem buff đang chạy` để xem thời gian còn lại.
- Admin dùng `/quantri datthuongvaitro` để gắn mức xu riêng, `/quantri xemthuongvaitro` để xem và `/quantri xoathuongvaitro` để xóa. Người chơi phải dùng `/nhiemvu nhan` (loại Thưởng vai trò) trong tuần để nhận; quên nhận sẽ mất phần tuần đó.

## Kiểm chứng công bằng

Các game cược tiếp tục dùng seed và HMAC-SHA256 nội bộ để tạo kết quả xác định. Thông tin kỹ thuật về seed/commit không hiển thị trên embed game để giao diện ngắn gọn hơn.

### Oẳn tù tì solo

- Đấu với bot: `/choi ott xu:<số xu> chon:<bua|keo|bao>`
- Thách đấu người khác: `/choi ott xu:<số xu> doithu:@người_chơi`
- Với prefix: `!ott solo @người_chơi <số xu>`

Đối thủ có 60 giây để chấp nhận. Sau khi chấp nhận, cả hai có 2 phút để bí mật chọn Búa, Kéo hoặc Bao. Bot giữ cược của hai người, trả toàn bộ cho người thắng và tự hoàn tiền nếu ván hết hạn.

### Xì dách

- Chọn đối thủ bằng `chedochoi`: **nhà cái bot** (mặc định, chơi một mình với gấp đôi và tách bài) hoặc **người chơi khác**: `/choi xidach ante:<số xu> chedochoi:nguoichoi` mở bàn, bạn làm nhà cái, tối đa 3 người vào bàn trong 30 giây.
- Ở bàn nhiều người, bài mỗi người được giữ kín: bấm **Xem bài của tôi** để xem bài và Rút bài/Dừng trong bảng riêng (chỉ bạn thấy); bot nhắc người đến lượt trong kênh và bài chỉ lộ khi ván kết thúc.
- Với prefix: `!xidach <số xu> [bot|nguoichoi]` (mặc định bot).

Trong ván với nhà cái, thắng thường nhận 1,9× tổng cược, Xì dách tự nhiên nhận 2,5× và người chơi quắc trên 21 luôn thua ngay, kể cả khi nhà cái cũng quắc sau đó. Ngũ linh (đủ 5 lá không quắc) thắng nhà cái không có Ngũ linh. Trong ván 1v1, mỗi người xem tay bài bằng nút riêng, sau đó chọn Rút bài hoặc Dừng. Người có tay gần 21 nhất thắng toàn bộ tiền cược; Xì dách tự nhiên được ưu tiên cao nhất. Nếu ván hết hạn, cược được hoàn cho cả hai.

### Poker

`/choi poker` chơi với hai bot và hỗ trợ Texas Hold’em, Poker 6+, Crazy Pineapple và Omaha 5 lá. Lệnh không cần nhập buy-in: mỗi người tự đóng ante 50 xu (đổi bằng `POKER_ANTE`), sau đó xu chỉ bị trừ thêm khi Call hoặc Raise. Ngay từ Flop, mỗi bot lật công khai một lá tẩy và giữ nguyên lá đó trong suốt ván. Ván có ba hành động Tố, Theo/Check và Bỏ bài; Turn và River có vòng cược riêng. Nhập toàn bộ stack trong cửa sổ Tố để All-in. Giao diện đánh giá bộ bài mạnh nhất hiện tại của người chơi sau mỗi lượt. Bot cân nhắc sức mạnh bài, draw sảnh/thùng, pot odds, áp lực stack, phong cách riêng và bluff; bot Crazy Pineapple tự chọn lá bỏ tốt nhất nhưng không được bỏ lá đã công khai. Hệ thống tự động hoàn phần cược không ai theo, tạo Main Pot và nhiều Side Pot theo mức đóng góp, rồi xét riêng những người đủ điều kiện cho từng pot khi Showdown. Omaha bắt buộc dùng đúng hai lá tẩy và ba lá chung.

`/choi domin` có một ô đặc biệt không trùng vị trí mìn. Mở một ô cùng hàng hoặc cùng cột với ô đặc biệt sẽ phát cảnh báo trong mục tín hiệu riêng, còn ô trên bàn vẫn hiển thị 💎 như mọi ô an toàn khác. Tìm đúng ô 🌟 sẽ nhân thêm x1.50 vào multiplier hiện tại cho đến khi rút thưởng. Hệ số cơ sở đã tính xác suất nhận bonus và giảm dần theo số ô mở để tránh chiến thuật rút thưởng tạo xu vô hạn. Bỏ ván ngay không tính EXP hay tiến độ nhiệm vụ.

`/choi coquay cuoc:<xu>` (hoặc `!coquay <xu>`) là Cò quay Nga kiểu Buckshot Roulette: bạn và Bot mỗi bên 3 máu, cược một lần từ đầu, thắng nhận x2. Tự bắn đạn lép thì giữ lượt; tự bắn đạn thật mất 1 máu và mất lượt; bắn đối phương thì luôn chuyển lượt. Mỗi đợt nạp công khai số đạn thật/lép (đợt 1: 2–3 viên, đợt 2: 4–5, từ đợt 3: 6–8; luôn có ít nhất 1 thật và 1 lép). Bot chỉ dùng thông tin công khai và chọn nước tối ưu. Vật phẩm Gacha dùng bằng nút trong ván, mỗi loại 1 lần/ván: Kính Lúp Soi Nòng (SR), Bia Đỡ Đạn (SR), Cưa Cầm Tay (SSR), Còng Số 8 (UR).

Dò mìn dùng 2–7 mìn trên bàn 20 ô. Giáp Chống Nổ chỉ vô hiệu hóa **một** quả mìn đầu tiên bạn chạm trên mỗi bản đồ; quả mìn thứ hai vẫn phát nổ như bình thường.

### Đua ngựa trực tiếp

Sau 30 giây nhận cược, bot khóa cược và hiển thị cuộc đua trực tiếp trong 18 giây qua 9 chặng. Hệ thống có 20 ngựa thường và 1 Thiên Mã đặc biệt; mỗi ván chọn đúng 6 con. Thiên Mã có 7% cơ hội xuất hiện và chiếm một trong sáu vị trí. Mỗi ngựa có kỹ năng và nhịp chạy riêng: xuất phát nhanh, ôm cua, giữ sức, núp gió, chống sự cố hoặc lội ngược dòng. Hệ số được tạo riêng cho từng ván theo RNG, ngày, khung giờ và phong độ hiện tại rồi được khóa trong suốt ván. Trong cuộc đua có thể xuất hiện các biến cố gây giảm tốc như đau bụng, vấp chân, dừng gặm cỏ, chạy nhầm làn hoặc mải tạo dáng. Khi cán đích, bot công bố bục vinh quang, khoảnh khắc quyết định, thông số nhà vô địch và thanh toán cược.

Ngựa được chia thành các hệ Cân bằng, Tốc độ, Bền bỉ, Kỹ thuật, Bí ẩn, Phòng thủ, Đột biến và Thần thoại. Sau khi khóa cược, bot mới RNG và công bố debuff của đường đua như mưa lớn, bùn lầy, gió ngược, cua gắt, nắng nóng, sương mù, mặt đường trơn hoặc khán đài náo loạn. Debuff tăng hoặc giảm cơ hội chiến thắng theo hệ ngựa và không được tiết lộ trong thời gian đặt cược.

Sinh tồn được giảm độ khó trong 10 tầng đầu: boss đầu có ít máu và sát thương hơn, Barbarian khởi đầu mạnh hơn, người chơi có 3 bình máu và nhận hồi phục cùng 1 bình sau khi thắng boss tầng 5 và 10. Bài mô phỏng chính sách chơi thận trọng nằm trong `scripts/simulate-hardcore.js`.

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

SQLite được tạo tự động tại `data/game-bot.sqlite`. Bot sao lưu nhất quán khi khởi động và sau mỗi 24 giờ vào `data/backups`, mặc định giữ 14 bản gần nhất. Có thể đổi lịch và số bản giữ lại bằng `DB_BACKUP_INTERVAL_HOURS`, `DB_BACKUP_RETENTION` và `DB_BACKUP_DIR`.
`/quantri ketthucvan mavan:<mã>` buộc kết thúc và hoàn cược mọi loại ván có mã (Xì dách với bot và bàn nhiều người, Xì dách và Oẳn tù tì đấu người, Poker, Dò mìn, Cò quay Nga, Chinchiro, Sinh tồn, Bầu cua, Tài xỉu, Đua ngựa). Ván Xì dách với bot, Dò mìn, Cò quay Nga, Chinchiro và Sinh tồn không hoạt động quá `SOLO_SESSION_TTL_MINUTES` phút (mặc định 10; 2 phút nếu tin nhắn ván chưa gửi được) sẽ tự đóng và **người chơi mất tiền cược** (để không thể bỏ ván đang thua rồi đòi hoàn); riêng ván chưa có tin nhắn vì lỗi gửi thì hoàn cược. Với Oẳn tù tì và Xì dách đấu người, bàn Xì dách và bàn Poker hết hạn giữa chừng, người còn nợ một hành động mất cược, người đã hoàn tất lượt được hoàn; hết hạn ở lời mời hoặc sảnh chờ thì hoàn cho tất cả. Admin kết thúc ván bằng `ketthucvan` vẫn hoàn cược cho mọi người.

Duel Oẳn tù tì, duel và bàn Xì dách đã kết thúc được giữ `GAME_RECORD_RETENTION_DAYS` ngày (mặc định 7) rồi tự xóa cùng dữ liệu bộ bài/tay bài. Lịch sử kim cương và gacha mặc định được giữ 180 ngày; điều chỉnh bằng `DIAMOND_LOG_RETENTION_DAYS` và `GACHA_HISTORY_RETENTION_DAYS`.

Khi nhận `SIGINT` hoặc `SIGTERM`, bot dừng các tác vụ nền, chờ bản sao lưu đang chạy hoàn tất, đóng kết nối Discord và SQLite trước khi thoát.

## Emoji của ứng dụng (Developer Portal → Bot → Emojis)

Emoji tải lên ở Developer Portal dùng được ở mọi server mà bot có mặt. Khi khởi động bot tự tải danh sách và tra id theo **tên**, nên chỉ cần đặt đúng tên. Xúc xắc Chinchiro dùng `dieWhite1`–`dieWhite6`; thiếu emoji nào thì tự dùng emoji chuẩn (`:one:`…). Trong code dùng `appEmoji('tên', 'dự phòng')` (chuỗi `<:tên:id>`) hoặc `appEmojiObject('tên')` cho nút/menu (`src/utils/appEmoji.js`).
