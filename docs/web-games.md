# Máy chủ web dùng chung cho game Discord

Một tiến trình bot, một cổng HTTP, một địa chỉ HTTPS/Tailscale. Hiện có Caro, [Walls / Wall Go](walls-web.md) và [Battleship / Bắn tàu](battleship-web.md). Không cần mở thêm Funnel hay server khi đăng ký game mới.

## Cấu hình và đường dẫn

| Biến mới         | Mặc định                | Biến cũ được hỗ trợ |
| ---------------- | ----------------------- | ------------------- |
| `WEB_ENABLED`    | `false`                 | `CARO_WEB_ENABLED`  |
| `WEB_PUBLIC_URL` | `http://127.0.0.1:3000` | `CARO_PUBLIC_URL`   |
| `WEB_HOST`       | `127.0.0.1`             | `CARO_WEB_HOST`     |
| `WEB_PORT`       | `3000`                  | `CARO_WEB_PORT`     |

Biến mới được ưu tiên khi tồn tại, kể cả `WEB_ENABLED=false`. URL phải là HTTPS gốc (HTTP chỉ cho localhost). Giữ cổng cũ thì không cần đổi Tailscale. Sau khi cập nhật code, khởi động lại bot. Chạy thêm `npm run register` nếu cập nhật có thêm hoặc đổi lệnh Discord; chỉ cập nhật trang web thì không cần đăng ký lại lệnh.

- `/`: danh sách game đã đăng ký.
- `/<game>/`, `/<game>/room/<UUID>`: trang game và phòng.
- `/<game>/app.js`, `/<game>/style.css`: tài nguyên theo game.
- `/api/games/<game>/state?room=<UUID>` và `events?room=<UUID>`: đọc trạng thái và SSE.
- POST `/api/games/<game>/pair`, `pair/status`, `login`: mã kết nối/vé và phiên Discord dùng chung.
- POST `/api/games/<game>/<action>`: hành động do game khai báo, phải có phiên người chơi và ghế trong đúng phòng.
- `/healthz`: kiểm tra HTTP. Chỉ phục vụ game đã đăng ký; tên game không được dùng để đọc tùy ý đường dẫn trên máy.
- `/terms`, `/privacy`: Điều khoản sử dụng và Chính sách riêng tư công khai, không cần đăng nhập. Trang chủ có liên kết tới hai trang và thông tin hỗ trợ.

## Điều khoản và chính sách công khai

Hai trang dùng chung web và địa chỉ Funnel của các game. Sau khi cập nhật code và khởi động lại tiến trình bot hiện có, điền vào Discord Developer Portal:

| Trường                        | URL                                        |
| ----------------------------- | ------------------------------------------ |
| Terms of Service URL          | Giá trị `WEB_PUBLIC_URL` + `/terms`        |
| Privacy Policy URL            | Giá trị `WEB_PUBLIC_URL` + `/privacy`      |
| Interactions Endpoint URL     | Giữ trống khi bot tiếp tục dùng Gateway    |
| Linked Roles Verification URL | Giữ trống khi chưa triển khai Linked Roles |

Ví dụ với `WEB_PUBLIC_URL=https://ten-may.ten-tailnet.ts.net`, hai URL là `https://ten-may.ten-tailnet.ts.net/terms` và `https://ten-may.ten-tailnet.ts.net/privacy`. Không cần thêm Funnel, cổng, cơ sở dữ liệu hay đăng ký lại slash command cho cập nhật này. Các trang cần được truy cập công khai bằng trình duyệt ngoài tailnet, không chỉ qua Tailscale Serve riêng tư. Máy chủ phải đang chạy để phục vụ trang.

Thông tin công khai nằm trong `src/webGames/publicSite.json`: tên ứng dụng hiển thị, link server hỗ trợ, email và ngày cập nhật chính sách (`YYYY-MM-DD`). Các giá trị này xuất hiện trên website; không đặt token hay thông tin bí mật vào đây. Đổi tên hiển thị không đổi tên bot trên Discord. Nội dung hai trang nằm trong `src/webGames/publicPages.js`; kiểu trình bày dùng `src/webGames/public/site.css`.

Chính sách mô tả các dữ liệu đang được xử lý, hồ sơ/kết quả công khai, việc chuyển nội dung cho nhà cung cấp AI khi dùng chatbot, phiên web, lưu giữ và sao lưu. Kênh liên hệ dùng thông tin được chủ bot cung cấp. Yêu cầu xem/sửa/xóa được gửi tới người vận hành để xác minh và xử lý thủ công; việc xuất bản trang không tạo thêm chức năng tự động xóa dữ liệu. Khi thay đổi nội dung hoặc cách xử lý dữ liệu, cập nhật nội dung và `updatedAt` tương ứng.

Kiểm tra bằng `npm run test:web:public`. Bộ kiểm tra không dùng database hay Discord thật; kiểm tra truy cập ẩn danh, liên hệ, GET/HEAD, đường dẫn có dấu `/` cuối, header bảo vệ và tương thích trang chủ cũ. Discord yêu cầu chính sách mô tả đúng cách xử lý dữ liệu và cách yêu cầu xóa: [Discord Developer Terms](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service). Trang công khai không thay thế quy trình xác minh ứng dụng riêng của Discord.

## Tương thích dữ liệu và phòng cũ

Tương thích caro cũ: `/room/<UUID>` chuyển tới `/caro/room/<UUID>`; `/api/*`, `/app.js`, `/style.css` vẫn là alias của caro. Vé cũ dạng `/#ticket=...` được trang chủ chuyển vào caro. Không đổi ID phòng, không xóa dữ liệu SQLite; các phòng caro không có `rules` dùng luật mặc định cũ.

Caro hỗ trợ nhiều phòng mỗi kênh (mặc định 5, quản trị chỉnh 1–20 bằng `/caro cauhinh phongtoida`). `/caro phong` liệt kê phòng với phân trang. Migration 61 đổi chỉ mục một phòng/kênh thành chỉ mục tìm kiếm và thêm cấu hình kênh; giữ nguyên phòng, nước đi và ghế của ván hiện có. Giới hạn mỗi người một phòng caro/server vẫn được bảo vệ bởi bảng ghế. Quy tắc này thuộc module caro, không phải giới hạn của máy chủ web chung.

## Các phần chính

- `src/webGames/config.js`: đọc cấu hình triển khai.
- `src/webGames/http.js`: định tuyến, phiên trình duyệt, mã kết nối/vé, CSRF/Origin, giới hạn yêu cầu, SSE và trang chủ.
- `src/webGames/runtime.js`: vòng đời server, timeout qua store, hàng đợi cập nhật tin Discord, sửa bằng tương tác rồi dự phòng bằng bot. Token chỉ ở bộ nhớ.
- `src/webGames/index.js`: nơi đăng ký các module game thực tế.
- `src/webGames/playerIdentity.js`: lưu tên và ảnh đại diện Discord, tạo dữ liệu hiển thị theo người chơi và tên vai trò riêng cho game. Caro giữ X/O; Walls dùng Quân xanh/Quân cam; Battleship dùng Hạm đội xanh/Hạm đội cam. Khóa ghế trong bản lưu vẫn giữ nguyên để tiếp tục phòng cũ.
- `/players.js`, `/players.css`: giao diện ảnh đại diện dùng chung. Chỉ chấp nhận ảnh từ CDN Discord, không gửi mã vào bàn trong Referer; ảnh lỗi dùng chữ cái đầu của tên. Ảnh được lưu khi mở/tham gia phòng và cập nhật lại khi xác nhận tài khoản; phòng cũ chưa có ảnh dùng ảnh mặc định cho tới lần xác nhận tiếp theo. Thêm game mới cần khai báo tên vai trò phù hợp thay vì đưa khóa ghế ra UI.
- `/board-ui.js`, `/board-ui.css`: badge cấu hình bàn dùng chung, hiển thị giá trị của phòng hiện tại và không phải nút sửa luật giữa ván. Caro làm nổi ô vừa đánh, Walls làm nổi quân hoặc tường vừa đặt, Battleship làm nổi đúng ô đã bắn ở lượt gần nhất; viền vàng chuyển sang đối tượng mới khi có hành động tiếp theo. Highlight không mở thêm ô hoặc thuyền bí mật. Trên điện thoại, nút đổi biển chỉ dẫn tới bản đồ có phát bắn mới khi bản đồ đó đang ẩn.
- `src/caro/webGame.js`: adapter luật/hành động/store/Discord của caro.
- `src/walls/webGame.js`: adapter Walls; đường `/walls/room/<UUID>`, API `move`, `wall`, `leave`; dùng chung phiên tài khoản, SSE và cập nhật Discord.
- `src/battleship/webGame.js`: adapter Battleship; bố trí riêng tư, xác nhận, bắn, khán giả. Mọi HTTP/SSE dùng snapshot theo người xem để giữ kín thuyền chưa bị bắn. Hạn bố trí tách riêng đồng hồ chiến đấu.
- `src/dots/webGame.js`: adapter Dots & Boxes / Nối ô; nối cạnh, chiếm một/hai ô và giữ lượt khi ghi điểm. Dùng bảng riêng, chung phiên xác nhận, đồng hồ, SSE và cập nhật điểm/kết quả Discord. Xem [dots-web.md](dots-web.md).
- `src/caro/config.js`, `http.js`, `runtime.js`: các lớp tương thích API nội bộ cũ, không mở thêm máy chủ.

## Thêm một game

Tạo module riêng cho luật, store, giao diện và command. Adapter cung cấp:

```js
{
  id: "ten-game", // chữ thường a–z, số, dấu -, duy nhất
  name: "Tên hiển thị",
  publicDir, // index.html, app.js, style.css; dùng URL có tiền tố game
  errors, // code -> thông báo lỗi nghiệp vụ
  isOpen: room => /* còn đang chờ/đang chơi */,
  store: { get, seat, snapshot, sweep, events },
  actions: { /* tên hành động -> (roomId, userId, data) => room mới */ },
  discord: { payload, pending, acknowledge, discard, restore } // tùy chọn
}
```

Đăng ký adapter trong `src/webGames/index.js`. Store dùng UUID cho mã phòng, có `version`, `messageId`, `channelId` khi dùng Discord; tự lưu dữ liệu và thực thi lượt/quyền/timeout trong giao dịch. Sau khi commit, phát `events.emit(room.id, room)` và `events.emit("changed", room)`. Không dùng chung bảng caro cho game mới.

`snapshot(room, userId)` là ranh giới quyền xem: máy chủ luôn gọi nó cho đúng người trước khi gửi HTTP/SSE. Khán giả có `userId=null` hoặc không có ghế. Với Battleship, không gửi vị trí tàu đối phương/chưa lộ hoặc đáp án bí mật rồi trông chờ giao diện che lại. Bộ kiểm tra có module giả dùng cùng mã phòng để kiểm tra định tuyến, quyền xem và phiên dùng chung; module đó không xuất hiện ở bản chạy thật.

Phiên HttpOnly 12 giờ xác nhận tài khoản Discord, không tự cấp ghế trong game mới. Mã kết nối và vé ràng buộc đúng game/phòng; không đổi được bằng endpoint của game khác. SSE gọi lại `snapshot` ở mỗi sự kiện. Cookie dùng chung nên mỗi trình duyệt đại diện một tài khoản đang đăng nhập; không mở nhiều tài khoản trong cùng hồ sơ trình duyệt.

`npm run test:web:players` kiểm tra ảnh Discord, chặn nguồn ảnh không hợp lệ, ảnh dự phòng, cập nhật hồ sơ phòng cũ và tên vai trò hiển thị. Các trường ảnh/vai trò không thay thế ranh giới riêng tư của `snapshot`, đặc biệt với hạm đội bí mật trong Battleship.

Ưu tiên cookie `web_game_session` còn hiệu lực, không phụ thuộc thứ tự cookie do trình duyệt gửi. Cookie `caro_session` cũ chỉ dùng dự phòng nếu còn hợp lệ; cookie cũ hết hạn không được che khuất phiên mới sau xác nhận. Nhờ vậy người từng đăng nhập trước khi chuyển sang nền tảng chung không bị giữ ở chế độ khán giả.

Mỗi lần lấy mã trả `pairingToken` riêng cho tab/phòng, dùng trong body của `pair/status` cùng `roomId`. Không dùng mã 8 ký tự để đổi trực tiếp phiên web. Bằng chứng kết nối được giữ trong `sessionStorage` của đúng tab/phòng trong tối đa 5 phút để khôi phục sau tải lại; không đặt trong URL hoặc log, xóa khi hoàn tất/hết hạn. Cookie cũ chỉ là đường tương thích, không quyết định mã của tab mới. Xác nhận lại cùng tài khoản và thử lại HTTP an toàn: không đổi chủ mã, không tạo thêm phiên cho mỗi lần poll, không gia hạn thời hạn mã/phiên. Giới hạn poll tách theo bằng chứng thay vì IP chung của Funnel/proxy.

Web chỉ hoàn tất khi đã nhận được trạng thái người chơi; lỗi mạng khi tải trạng thái vẫn tự thử lại tới khi mã hết hạn. Đóng luồng khán giả cũ trước khi chuyển sang luồng đã đăng nhập, bỏ qua sự kiện từ luồng cũ. Nếu trình duyệt không nhận cookie phiên, hiển thị lỗi rõ để người chơi cho phép cookie và lấy mã mới thay vì chờ vô hạn. Mã hết hạn hoặc sai phòng không được dùng để xác nhận.

Các hàm `discord.pending()` trả các mã phòng chưa gửi; `acknowledge(room)` chỉ xác nhận khi phiên bản đã gửi vẫn khớp bản lưu. `restore()` đánh dấu các tin phòng đang mở để cập nhật lại sau restart. `runtime.bindInteraction(gameId, roomId, interaction)` chỉ nhận tương tác đã được defer đúng vào tin phòng (hoặc phản hồi tạo phòng). Quyền Xem kênh của bot vẫn cần cho cập nhật dài hạn/sau restart; vòng lặp ghi log mã lỗi và thông tin phòng, không ghi token.

## Kiểm tra

`npm run test:web:pairing` kiểm tra luồng Discord → web với HTTP thật và giao diện của cả Caro/Walls: mất phản hồi, tải lại tab, nhiều tab dùng chung cookie, thử lại, hết hạn, giới hạn poll qua cùng IP proxy và sự kiện SSE cũ. `npm run test:caro` kiểm tra luật tùy chọn, dữ liệu cũ, HTTP/SSE, khán giả, phiên xuyên game và cô lập mã kết nối/cập nhật Discord giữa game. `node scripts/test-env-example.js` kiểm tra cấu hình triển khai. Không đăng ký command thật hoặc chạm dữ liệu người chơi khi chạy các kiểm tra này.
