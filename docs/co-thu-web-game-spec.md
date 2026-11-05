# Đặc tả triển khai Cờ thú trên web

Ngày soạn: 05/11/2026. Trạng thái: **tài liệu đề xuất để triển khai; chưa phải chức năng đã phát hành**.

Mã game đề xuất: `cothu`. Bộ luật: `cothu-vn-v1`. Tài liệu này chốt một bộ luật nhất quán cho bản web hai người, dựa trên Cờ thú phổ biến tại Việt Nam. Các điểm có nhiều biến thể được ghi rõ ở mục 4; khi triển khai dùng đúng lựa chọn trong tài liệu, không trộn luật từ các nguồn khác nhau.

## 1. Phạm vi và kết quả mong muốn

- Hai người thật đấu trực tuyến, mỗi bên 8 quân; bàn cố định 7 cột × 9 hàng.
- Mở phòng từ Discord, chơi trên web hiện có, khán giả xem trực tiếp.
- Không cược, không thưởng xu/gem/EXP/thành tựu. Không liên kết số quân bị ăn với tài nguyên tài khoản.
- Tận dụng HTTP/SSE, kết nối tài khoản, đồng hồ, cập nhật tin phòng, mobile UI và luật chơi dùng chung. Không tạo server/cổng/Funnel mới.
- Bản đầu chưa có AI, xếp hạng, ghép trận tự động, cờ úp, biến thể quân hoặc tùy chỉnh luật giữa ván.
- Có danh sách nước đi và mở lại kết quả phòng. Chưa yêu cầu xuất HTML replay riêng.

Tham chiếu kiến trúc đang có: [web-games.md](web-games.md), [santorini-web.md](santorini-web.md), [caro-web.md](caro-web.md).

## 2. Mở phòng và quyền người chơi

Các lệnh sau là **đầu việc cần bổ sung**, chưa được đăng ký ở bản tài liệu:

| Lệnh | Hành vi |
| --- | --- |
| `/cothu choi` | Tạo phòng, gửi tin mời với nút Tham gia, Mở bàn cờ, Kết nối tài khoản, Hủy phòng |
| `/cothu phong` | Danh sách phòng của kênh, phân trang theo mẫu game web hiện có |
| `/cothu luat` | Giải thích luật đã chốt, các ngoại lệ và điều kiện kết thúc |
| `/cothu cauhinh phongtoida:<n>` | Quản trị đặt giới hạn phòng/kênh, 1–20, mặc định 5 |

- Tùy chọn `nguoitruoc`: `host` mặc định, `guest`, `random`. Người được chọn cầm Đỏ và đi trước; người còn lại cầm Xanh. Bốc ngẫu nhiên một lần, lưu kết quả, không bốc lại khi refresh/restart.
- Tùy chọn `thoigian`: 1–180 phút/người, mặc định 30, không cộng giờ. Dùng cùng quy ước và cấu hình đồng hồ của các game web đang có.
- Mỗi người tối đa một phòng Cờ thú đang chờ/đang đấu trong một server. Không dùng giới hạn này để chặn họ chơi game khác.
- Phòng chờ hết hạn sau 10 phút. Chủ phòng được hủy trước khi có đối thủ; sau khi bắt đầu phải dùng Đầu hàng.
- Khi đối thủ tham gia thành công, chuyển sang đang đấu và bắt đầu đồng hồ của Đỏ. Tin mời phải thông báo rõ thời điểm đồng hồ bắt đầu.
- Luồng prefix tương ứng khi bot bật prefix: `!cothu choi nguoitruoc=host thoigian=30`.
- Web dự kiến: `/cothu/room/<UUID>`. Ai có link được xem bàn; chỉ hai ghế đã kết nối đúng tài khoản mới được đi quân/đầu hàng.
- Tái sử dụng mã kết nối theo tab/phòng, phiên HttpOnly và kiểm tra ghế của runtime web chung. Không thêm Discord OAuth hoặc gửi token tài khoản trong URL.

## 3. Bàn cờ và bố trí ban đầu

### 3.1. Tọa độ chuẩn

Cột `a` đến `g`, hàng `1` đến `9`. Khi Đỏ ở dưới, `a1` là góc dưới trái, `g9` là góc trên phải. Tọa độ tuyệt đối không thay đổi khi người chơi xoay bàn.

Chỉ số nội bộ đề xuất: `index = (9 - row) * 7 + column`, với `column` từ 0 đến 6; `a9 = 0`, `g1 = 62`. Bộ chuyển đổi phải round-trip được cả 63 ô. Không dùng cộng/trừ chỉ số đơn thuần để xét ngang vì có thể tràn sang hàng khác.

### 3.2. Địa hình

| Loại | Ô |
| --- | --- |
| Hang Đỏ | d1 |
| Bẫy của Đỏ | c1, e1, d2 |
| Hang Xanh | d9 |
| Bẫy của Xanh | c9, e9, d8 |
| Sông trái | b4, c4, b5, c5, b6, c6 |
| Sông phải | e4, f4, e5, f5, e6, f6 |
| Đất | Các ô còn lại |

Hai sông đều rộng 2 ô, dài 3 ô. Cột d và hai mép a/g là đường đất; bẫy/hang không phải nước.

### 3.3. Quân và sức mạnh

| Bậc | Tên | Mã loại |
| ---: | --- | --- |
| 8 | Voi | elephant |
| 7 | Sư tử | lion |
| 6 | Hổ | tiger |
| 5 | Báo | leopard |
| 4 | Chó | dog |
| 3 | Sói | wolf |
| 2 | Mèo | cat |
| 1 | Chuột | rat |

Một số nguồn đổi bậc Chó/Sói. Bản web này cố định **Chó 4, Sói 3**, hiển thị số bậc trên mọi quân.

| Quân | Đỏ | Xanh |
| --- | --- | --- |
| Voi | a3 | g7 |
| Sư tử | g1 | a9 |
| Hổ | a1 | g9 |
| Báo | e3 | c7 |
| Chó | f2 | b8 |
| Sói | c3 | e7 |
| Mèo | b2 | f8 |
| Chuột | g3 | a7 |

Bố trí Xanh là phép quay 180° của Đỏ. Không có lượt đặt quân hoặc xáo vị trí. Tổng cộng 16 quân; mỗi loại đúng một quân mỗi bên.

## 4. Bộ luật đã chốt cho engine

### 4.1. Di chuyển thường

- Mỗi lượt bắt buộc di chuyển đúng một quân của mình.
- Đi một ô ngang hoặc dọc; được tiến/lùi; không đi chéo hoặc bỏ lượt.
- Không vào ô có quân mình, không ra ngoài bàn, không vào hang của mình.
- Đến ô trống là đi thường. Đến ô có quân địch là ăn quân nếu vượt qua toàn bộ kiểm tra ở dưới.

### 4.2. Ăn quân và thứ tự ưu tiên

Quân ăn được quân địch có cấp bằng hoặc thấp hơn mình, với ngoại lệ Chuột/Voi và bẫy.

Thứ tự kiểm tra bắt quân phải thống nhất:

1. Kiểm tra hình học nước đi, đường nhảy, địa hình và quân cùng bên.
2. Nếu đầu hoặc cuối nước đi là nước: chỉ Chuột được tham gia. Chỉ cho bắt khi **cả hai ô đều là nước**, khi đó mục tiêu phải là Chuột. Không bắt trong bước đi từ nước lên đất hoặc từ đất xuống nước.
3. Tính sức mạnh hiệu dụng tại **ô xuất phát hiện tại** của quân đánh và ô hiện tại của mục tiêu. Quân đứng trong bẫy địch có sức mạnh 0; các quân khác dùng bậc gốc.
4. Quân đánh có sức mạnh 0 không được bắt quân. Nếu mục tiêu có sức mạnh 0, quân đánh có sức mạnh lớn hơn 0 được bắt bất kể loại.
5. Nếu chưa giải quyết bởi bẫy: Chuột bắt Voi trên đất; Voi không bắt Chuột.
6. Các trường hợp còn lại: bậc quân đánh phải lớn hơn hoặc bằng bậc mục tiêu.

Bẫy ưu tiên hơn ngoại lệ Voi/Chuột: Voi được bắt Chuột đang mắc bẫy của bên Voi. Chuột đang mắc bẫy địch không được dùng ngoại lệ để bắt Voi ngoài bẫy.

### 4.3. Chuột và nước

- Chỉ Chuột được đi vào sông, vẫn từng ô ngang/dọc.
- Chuột được đi từ đất xuống ô nước trống hoặc từ nước lên ô đất trống.
- Hai Chuột cùng dưới nước được ăn nhau.
- Hai Chuột cùng trên đất được ăn nhau.
- Chuột dưới nước không được lao lên ăn Voi hoặc Chuột trên đất; chiều ngược lại cũng không bắt qua ranh giới nước/đất.
- Chuột dưới nước không thể bị quân trên đất ăn.

### 4.4. Sư tử và Hổ nhảy sông

- Cả Sư tử và Hổ được nhảy ngang hoặc dọc, qua toàn bộ dải nước thẳng trước mặt.
- Xuất phát ở đất sát sông, đáp xuống **ô đất đầu tiên** bên kia; không đáp giữa sông, không nhảy chéo hoặc bỏ qua ô đất để đi xa hơn.
- Mọi ô nước trên đường nhảy phải không có Chuột, kể cả Chuột cùng bên. Chỉ Chuột nằm đúng đường nhảy mới chặn; Chuột ở hàng/cột khác trong cùng sông không chặn.
- Ô đáp có quân mình: cấm. Có quân địch: áp dụng đầy đủ luật bắt quân.
- Nhảy là một nước đi, không có thao tác riêng trên giao diện.
- Ví dụ nhảy dọc: b3 → b7, kiểm tra b4/b5/b6. Nhảy ngang: a5 → d5, kiểm tra b5/c5.

### 4.5. Bẫy

- Ba bẫy quanh hang thuộc bên sở hữu hang đó.
- Quân vào bẫy của địch không bị xóa ngay; chỉ mất sức mạnh và dễ bị ăn.
- Quân ở bẫy nhà không bị suy yếu.
- Ra khỏi bẫy phục hồi bậc gốc. Không sửa vĩnh viễn `rank` trong dữ liệu quân; sức mạnh hiệu dụng được suy từ vị trí hiện tại.
- **Lựa chọn riêng đã chốt cho v1:** sức mạnh khi bắt xét tại ô xuất phát. Vì vậy quân đang mắc bẫy có thể đi ra ô trống nhưng không thể vừa ra vừa bắt quân bình thường. Không áp dụng biến thể phục hồi sức mạnh trước khi xét bắt.

### 4.6. Thắng, thua và hòa

Sau một nước đi hợp lệ, kiểm tra theo thứ tự:

1. Vào hang địch: thắng ngay (`den`).
2. Địch không còn quân: thắng (`elimination`).
3. Địch không có bất kỳ nước đi hợp lệ nào: địch thua (`no_legal_moves`). Không có nước bỏ lượt.
4. Nếu chưa thắng: cùng thế cờ xuất hiện lần thứ ba thì hòa (`threefold`). Khóa thế cờ gồm vị trí/loại/màu của mọi quân, bên đến lượt và `rulesId`; không gồm đồng hồ, thời điểm hoặc số version. Thế xuất phát tính là lần đầu.
5. Nếu chưa kết thúc: 100 nước liên tiếp không ăn quân thì hòa (`no_capture_limit`). Đếm **100 lượt đơn**, không phải 100 cặp lượt; bắt quân đặt bộ đếm về 0.

Thắng do vào hang/ăn hết/bí nước ưu tiên hơn hòa tự động trong cùng nước đi. Quy tắc bí nước và hòa ở trên là lựa chọn cho sản phẩm web, vì luật bàn giấy có nhiều biến thể.

Ngoài bàn: đầu hàng (`resign`) hoặc hết giờ (`timeout`) đều thua. Mất mạng không tự đầu hàng và không dừng đồng hồ. Không có đề nghị hòa hoặc đi lại trong MVP. Không bổ sung luật đuổi quân phức tạp ngoài quy tắc ba lần lặp.

## 5. Vòng đời phòng và đồng hồ

- `waiting` → `playing` khi có đủ hai người.
- `waiting` → `cancelled` khi chủ hủy; → `expired` khi hết hạn.
- `playing` → `finished` khi có thắng/thua/hòa. Lưu `winner` hoặc null khi hòa, `endReason`, `endedAt` và đồng hồ cuối.
- Phòng đã kết thúc vẫn xem được bàn và lịch sử; không nhận nước đi mới.
- Không đổi người chơi hoặc luật giữa ván. Nút Chơi lại tạo phòng mới, không xóa lịch sử phòng cũ.
- Giảm giới hạn phòng không đóng các phòng đang tồn tại.
- Đồng hồ chỉ trừ cho bên đến lượt. Nước sai không đổi version/bàn/turn; thời gian thực vẫn trôi, không được reset mốc đồng hồ để hoàn giờ.
- Máy chủ quyết định hết giờ trước khi nhận nước đi. Nếu deadline đã qua, xử lý timeout; một nước thắng gửi muộn không cứu được người hết giờ.
- Lưu phần thời gian còn lại và mốc bắt đầu/deadline theo mẫu store hiện có. Refresh, disconnect hoặc restart không cấp thêm thời gian. Không tin đồng hồ do client gửi.

## 6. Giao diện web

### 6.1. Bố cục

- Desktop: bàn 7×9 và cụm thao tác ở một phía; avatar, tên, đồng hồ, lượt và lịch sử ở phía còn lại theo shell hiện có.
- Mobile dọc/ngang: dùng chung mobile UI để bàn nằm trong khung nhìn; phần thông tin dài cuộn trong menu. Bàn chữ nhật không bị kéo giãn thành hình vuông.
- Đỏ ở dưới với người cầm Đỏ; Xanh ở dưới với người cầm Xanh; khán giả mặc định Đỏ ở dưới. Cho xoay bàn thủ công, chỉ thay cách nhìn, không đổi tọa độ hoặc dữ liệu.
- Quân có icon thú, tên và số bậc; phân biệt bên bằng màu và viền/ký hiệu, không chỉ màu. Tài nguyên SVG/CSS hoặc icon tự có; chưa yêu cầu bộ ảnh riêng.
- Nước có nền xanh, bẫy có biểu tượng riêng và màu chủ sở hữu, hang khác biệt rõ. Quân mắc bẫy hiển thị bậc hiệu dụng 0, tooltip vẫn nêu bậc gốc.
- Hiển thị nước vừa đi bằng viền ở ô đi/đến; quân bị ăn xuất hiện trong danh sách quân đã mất.

### 6.2. Một lượt thao tác

1. Chọn quân của mình trong lượt mình.
2. Tô sáng các ô đi hợp lệ từ engine: đi thường, ăn quân và nhảy sông có ký hiệu phân biệt.
3. Chọn ô đích để xem trước; đánh dấu quân sắp bị ăn, đường nhảy hoặc cảnh báo đi vào bẫy.
4. Bấm **Xác nhận** gửi đúng một hành động. Hủy/Escape chỉ hủy lựa chọn cục bộ, không tác động bàn hoặc đồng hồ.
5. Trong lúc chờ phản hồi, khóa nút gửi lặp. Nếu thất bại do version cũ, lấy snapshot mới và xóa preview; không tự áp lại nước cũ.

Không tự gửi nước đi chỉ vì nhấp quân/ô đích. Không tự đổi lượt lạc quan trước xác nhận máy chủ. Khi khán giả hoặc chưa kết nối tài khoản, có thể xem luật/lịch sử nhưng không gửi thao tác chơi.

### 6.3. Thông tin và hỗ trợ tiếp cận

- Luôn thấy bên đến lượt, đồng hồ hai người, trạng thái kết nối và kết quả.
- Nút Luật chơi dùng rules UI chung, nêu rõ Chuột/Voi, bẫy, nước, nhảy sông và luật hòa v1.
- Phím mũi tên đổi focus theo hướng nhìn, Enter/Space chọn quân/ô, Escape hủy preview hoặc đóng menu.
- Khi menu/ô nhập mở, phím bàn cờ không được xử lý.
- Nhãn ô ví dụ: “b5, nước, Chuột Xanh bậc 1”. Kết quả nước đi dùng vùng thông báo để trình đọc màn hình đọc được.
- Âm báo dùng feedback chung, tắt/mở được, không phát lặp khi refresh hoặc nhận lại cùng SSE version.

## 7. Kiến trúc và dữ liệu đề xuất

Thêm module `src/cothu/` theo cấu trúc Santorini:

| Thành phần dự kiến | Trách nhiệm |
| --- | --- |
| `rules.js` | Địa hình, cấp bậc, vị trí khởi tạo và luật `cothu-vn-v1` |
| `engine.js` | Hàm thuần tạo thế cờ, sinh nước hợp lệ, áp dụng nước, xét kết thúc/lặp thế |
| `store.js` | Phòng/ghế, đồng hồ, transaction, version, lịch sử, snapshot theo người xem |
| `discord.js` | Tin phòng, danh sách phòng, nút tham gia/hủy/kết nối và kết quả |
| `webGame.js` | Adapter đăng ký game với HTTP/SSE và đồng bộ Discord chung |
| `runtime.js` | Tạo runtime/module theo mẫu hiện có |
| `public/` | HTML/CSS/JS bàn Cờ thú dùng shell và tài nguyên chung |

Đăng ký thêm ở `src/webGames/index.js`, catalog/hướng dẫn web và registry slash/prefix tương ứng. Không sửa luật các game đã tồn tại.

Dữ liệu tối thiểu trong phòng:

- `schemaVersion`, `rulesId`, `id`, `guildId`, `channelId`, trạng thái và version tăng dần.
- Hai ghế gắn tài khoản ở dữ liệu máy chủ, `firstPlayer` đã chốt và map ghế → Đỏ/Xanh.
- `pieces`: ID ổn định, loại, bên, vị trí hoặc null nếu bị bắt. Bậc gốc lấy từ rules, không nhận từ client.
- `turn`, `ply`, `noCapturePly`, bảng đếm khóa thế cờ.
- Đồng hồ, `createdAt`, hạn phòng chờ, `endedAt`, `winner`, `endReason`.
- `lastMove` và lịch sử `{ply, side, pieceId, from, to, capturedPieceId, jumped, at, clocksAfter}`.
- Thông tin đồng bộ Discord theo mẫu module chung; không lưu token tương tác vào SQLite hoặc log.

Migration mới cần tạo `cothu_rooms`, `cothu_seats`, `cothu_channel_settings` theo mẫu schema hiện có. Chọn số migration tiếp theo **tại thời điểm triển khai**, không dùng số cố định từ tài liệu. Phòng/ghế/lịch sử nằm trong SQLite đang backup; không dùng cache RAM làm nguồn dữ liệu duy nhất.

Engine API gợi ý: `createState(rules)`, `legalMoves(state, side)`, `moveError(state, side, from, to)`, `applyMove(state, move)`, `positionKey(state)`. `applyMove` trả state mới và kết quả; không đọc DB, gọi Discord hoặc lấy thời gian thực.

Bất biến: không hai quân cùng ô; không quân ngoài bàn; chỉ Chuột ở nước; không quân ở hang nhà; ván đang chơi không có người thắng; ván kết thúc không nhận nước đi. Một nước chỉ di chuyển một quân và bắt tối đa một quân.

## 8. HTTP/SSE và xử lý nước đi

Dùng route chung của web game, với ID game `cothu`:

- `GET /api/games/cothu/state?room=<UUID>`: snapshot hiện tại.
- `GET /api/games/cothu/events?room=<UUID>`: SSE hiện tại và các cập nhật theo cơ chế chung.
- POST `pair`, `pair/status`, `login`: dùng lại luồng tài khoản của runtime, không tạo giao thức riêng.
- `POST /api/games/cothu/move`: body gồm `roomId`, `version`, `from`, `to`, cùng thông tin CSRF do runtime yêu cầu. Payload cụ thể phải khớp bộ đọc body chung khi triển khai; không suy danh tính từ `side` hoặc `userId` client gửi.
- `POST /api/games/cothu/leave`: đầu hàng khi đang đấu; quyền hủy phòng chờ theo store và runtime chung.

Một nước đi trên máy chủ:

1. Xác thực phiên/CSRF/Origin theo runtime; lấy danh tính từ phiên và xác minh đúng ghế trong đúng game/phòng.
2. Trong transaction, đọc phòng mới nhất và kiểm tra trạng thái, deadline/timeout, version, lượt và tọa độ nguyên hợp lệ.
3. Gọi engine kiểm tra toàn bộ nước đi, gồm đường nhảy và bắt quân. Không tin danh sách ô được tô sáng do client gửi.
4. Cập nhật bàn, quân bị bắt, đồng hồ, lượt, đếm thế cờ và kết quả. Tăng version đúng một lần, lưu lịch sử/đánh dấu Discord cần cập nhật cùng transaction.
5. Commit rồi mới phát SSE/cập nhật Discord. Lỗi Discord không rollback nước đã commit; hàng đợi thử lại theo cơ chế chung.

Mã lỗi miền đề xuất: `NOT_PLAYER`, `NOT_YOUR_TURN`, `STALE_VERSION`, `ROOM_FINISHED`, `INVALID_COORDINATE`, `OWN_PIECE`, `OWN_DEN`, `WATER_FORBIDDEN`, `WATER_CAPTURE_FORBIDDEN`, `JUMP_BLOCKED`, `INSUFFICIENT_RANK`. Ánh xạ sang HTTP/message theo chuẩn runtime đang có, không phát minh status code riêng.

Hai tab cùng đi với một version: chỉ một nước được ghi; request còn lại nhận trạng thái mới/lỗi cũ, không đi hai lần. Mất phản hồi sau commit: client tải lại snapshot; không tự gửi lại với version mới.

DTO công khai chỉ gồm dữ liệu hiển thị, bên đến lượt, cấu hình/luật, đồng hồ, lịch sử và kết quả. Không gửi Discord User ID, token hoặc khóa phiên. Danh tính viewer do runtime xác định; khán giả không có quyền chơi dù toàn bộ bàn cờ đều công khai. SSE reconnect lấy snapshot chuẩn, bỏ event/version cũ theo cơ chế chung.

## 9. Ma trận kiểm thử bắt buộc

| Nhóm | Ca chấp nhận |
| --- | --- |
| Khởi tạo | Đúng 16 quân, đúng bậc/ô, đủ 12 ô nước, 6 bẫy, 2 hang; map Đỏ/Xanh nhất quán khi guest đi trước |
| Hình học | Đi bốn hướng hợp lệ; cấm chéo, ra biên, nhảy qua ô đất, tràn hàng do index |
| Cấp bậc | Mạnh ăn yếu, bằng ăn bằng, yếu không ăn mạnh; Chó 4 ăn Sói 3 |
| Chuột/Voi | Chuột đất ăn Voi; Voi không ăn Chuột bình thường; Chuột vẫn thua Mèo |
| Nước | Chuột xuống/lên ô trống; Chuột nước ăn Chuột nước; cấm bắt qua bờ hai chiều; mọi quân khác cấm xuống nước |
| Nhảy | Sư tử/Hổ nhảy ngang và dọc; đúng ô đáp; bắt đúng bậc; cấm đáp quân mình; Chuột hai bên trên đường chặn; Chuột ngoài đường không chặn |
| Bẫy | Vào bẫy địch không mất quân ngay; bậc hiệu dụng 0; bẫy nhà vô hại; rời bẫy phục hồi; quân mắc bẫy không bắt ra ngoài; Voi bắt được Chuột mắc bẫy |
| Hang | Không vào hang nhà; vào hang địch thắng ngay kể cả quân Chuột |
| Kết thúc | Ăn quân cuối; địch bí toàn bộ nước; đầu hàng; timeout; không đi thêm sau kết thúc |
| Hòa | Lần lặp thứ ba đúng bên đến lượt; khác lượt không cùng khóa; bộ đếm 100 lượt đơn; bắt reset về 0; thắng ưu tiên hơn hòa |
| Transaction | Nước sai không đổi bàn/turn/version/lịch sử; double-click/hai tab ghi đúng một nước; rollback DB không phát SSE giả |
| Thời gian | Request sau deadline không thắng; nước sai không hoàn giờ; restart/reconnect giữ thời gian; timeout qua sweep và qua request nhất quán |
| Quyền | Khán giả, tài khoản khác, đúng tài khoản nhưng sai phòng/game không được đi hoặc đầu hàng; client không tự chọn side |
| Lưu trữ | Restart giữ bàn, ghế, version, clocks, repetition và lịch sử; phòng kết thúc vẫn xem được; Chơi lại không sửa phòng cũ |
| Discord | Tạo/tham gia/hủy, danh sách phòng, giới hạn kênh/người, thiếu quyền kênh, cập nhật kết quả và khôi phục hàng đợi sau restart |
| Web | Desktop, mobile dọc/ngang; xoay bàn vẫn gửi đúng tọa độ; preview không gửi nước; xác nhận/hủy; keyboard/menu; luật/avatar/âm báo |

Cần kiểm tra engine với một bộ xét nước độc lập hoặc bảng fixture tự tính, không chỉ dùng `legalMoves` để chứng minh lại `applyMove`. Những ca bẫy, bờ nước và nhảy sông phải có assertion rõ ô đi/đến, quân bị bắt và bên thắng.

## 10. Thứ tự triển khai và nghiệm thu

1. Engine thuần + fixture luật/biên và khóa thế cờ.
2. Store/migration + ghế/version/đồng hồ + rollback/restart.
3. Adapter web/Discord + quyền xem/quyền đánh + SSE.
4. Bàn 7×9 responsive, preview/xác nhận, highlight, lịch sử, luật chơi và tài khoản dùng chung.
5. Kiểm thử tích hợp, Chrome thật trên desktop/mobile, audit DTO và giới hạn phòng.
6. Changelog đúng loại/scope, đăng ký lệnh và deploy theo quy trình web game hiện có.

Gợi ý script khi thực sự triển khai: `test:cothu` và `test:cothu:ui`. Chưa thêm các script này chỉ để hoàn thiện tài liệu.

Nghiệm thu khi: hai người mở phòng và kết nối được, chơi tới kết quả với đúng mọi ngoại lệ, không chi tài nguyên, không nhân đôi nước, không mất ván sau restart, khán giả không đánh được, và bàn sử dụng được trên mobile dọc/ngang.

Deploy dùng `WEB_ENABLED`/`WEB_PUBLIC_URL` và cổng/Funnel đang có. Sau khi code được triển khai mới chạy `npm run register`, restart bot và tải lại web; tài liệu này không tự đăng ký hoặc phát hành game.

## 11. Nguồn tham khảo và ranh giới biến thể

- [Hướng dẫn Cờ thú tại Việt Nam – Thế Giới Di Động](https://www.thegioididong.com/game-app/huong-dan-cach-choi-co-thu-thu-thuat-luat-choi-co-ban-1317796): thứ bậc Chó 4/Sói 3, bắt quân, bẫy và mục tiêu.
- [Yellow Mountain Imports – How to Play Jungle](https://www.ymimports.com/pages/how-to-play-jungle): bàn cờ, đi quân và ngoại lệ.
- [Cultural Games – Dou Shou Qi](https://playculturalgames.com/how-to-play/dou-shou-qi/): nhảy sông, Chuột, ranh giới nước/đất và bẫy.
- [Leiden University – About Dou Shou Qi](https://liacs.leidenuniv.nl/~visjk/doushouqi/about): đối chiếu cấu trúc bàn và các biến thể, gồm cách xử lý hòa khác nhau.

Không khẳng định có một luật chính thức duy nhất. Bản web áp dụng đúng `cothu-vn-v1`: Chó trên Sói; Voi không ăn Chuột bình thường; chỉ Chuột bơi; Sư tử/Hổ nhảy cả hai hướng; mọi Chuột trên đường đều chặn; bẫy chỉ hại địch; quân đang mắc bẫy không bắt ra ngoài; bí nước thua; ba lần lặp/100 lượt không bắt thì hòa. Thay đổi các lựa chọn này sau phát hành phải có rules ID mới và không sửa luật ván đang chơi.
