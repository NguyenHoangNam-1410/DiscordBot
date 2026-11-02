# Máy chủ web dùng chung cho game Discord

Một tiến trình bot, một cổng HTTP, một địa chỉ HTTPS/Tailscale. Hiện có Caro và [Walls / Wall Go](walls-web.md); Battleship chưa được triển khai. Không cần mở thêm Funnel hay server khi đăng ký game mới.

## Cấu hình và đường dẫn

| Biến mới         | Mặc định                | Biến cũ được hỗ trợ |
| ---------------- | ----------------------- | ------------------- |
| `WEB_ENABLED`    | `false`                 | `CARO_WEB_ENABLED`  |
| `WEB_PUBLIC_URL` | `http://127.0.0.1:3000` | `CARO_PUBLIC_URL`   |
| `WEB_HOST`       | `127.0.0.1`             | `CARO_WEB_HOST`     |
| `WEB_PORT`       | `3000`                  | `CARO_WEB_PORT`     |

Biến mới được ưu tiên khi tồn tại, kể cả `WEB_ENABLED=false`. URL phải là HTTPS gốc (HTTP chỉ cho localhost). Giữ cổng cũ thì không cần đổi Tailscale. Sau khi cập nhật code, chạy `npm run register` để thêm tùy chọn mới của `/caro choi`, rồi khởi động lại bot.

- `/`: danh sách game đã đăng ký.
- `/<game>/`, `/<game>/room/<UUID>`: trang game và phòng.
- `/<game>/app.js`, `/<game>/style.css`: tài nguyên theo game.
- `/api/games/<game>/state?room=<UUID>` và `events?room=<UUID>`: đọc trạng thái và SSE.
- POST `/api/games/<game>/pair`, `pair/status`, `login`: mã kết nối/vé và phiên Discord dùng chung.
- POST `/api/games/<game>/<action>`: hành động do game khai báo, phải có phiên người chơi và ghế trong đúng phòng.
- `/healthz`: kiểm tra HTTP. Chỉ phục vụ game đã đăng ký; tên game không được dùng để đọc tùy ý đường dẫn trên máy.

Tương thích caro cũ: `/room/<UUID>` chuyển tới `/caro/room/<UUID>`; `/api/*`, `/app.js`, `/style.css` vẫn là alias của caro. Vé cũ dạng `/#ticket=...` được trang chủ chuyển vào caro. Không đổi ID phòng, không xóa dữ liệu SQLite; các phòng caro không có `rules` dùng luật mặc định cũ.

Caro hỗ trợ nhiều phòng mỗi kênh (mặc định 5, quản trị chỉnh 1–20 bằng `/caro cauhinh phongtoida`). `/caro phong` liệt kê phòng với phân trang. Migration 61 đổi chỉ mục một phòng/kênh thành chỉ mục tìm kiếm và thêm cấu hình kênh; giữ nguyên phòng, nước đi và ghế của ván hiện có. Giới hạn mỗi người một phòng caro/server vẫn được bảo vệ bởi bảng ghế. Quy tắc này thuộc module caro, không phải giới hạn của máy chủ web chung.

## Các phần chính

- `src/webGames/config.js`: đọc cấu hình triển khai.
- `src/webGames/http.js`: định tuyến, phiên trình duyệt, mã kết nối/vé, CSRF/Origin, giới hạn yêu cầu, SSE và trang chủ.
- `src/webGames/runtime.js`: vòng đời server, timeout qua store, hàng đợi cập nhật tin Discord, sửa bằng tương tác rồi dự phòng bằng bot. Token chỉ ở bộ nhớ.
- `src/webGames/index.js`: nơi đăng ký các module game thực tế.
- `src/caro/webGame.js`: adapter luật/hành động/store/Discord của caro.
- `src/walls/webGame.js`: adapter Walls; đường `/walls/room/<UUID>`, API `move`, `wall`, `leave`; dùng chung phiên tài khoản, SSE và cập nhật Discord.
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

Ưu tiên cookie `web_game_session` còn hiệu lực, không phụ thuộc thứ tự cookie do trình duyệt gửi. Cookie `caro_session` cũ chỉ dùng dự phòng nếu còn hợp lệ; cookie cũ hết hạn không được che khuất phiên mới sau xác nhận. Nhờ vậy người từng đăng nhập trước khi chuyển sang nền tảng chung không bị giữ ở chế độ khán giả.

Mỗi lần lấy mã trả `pairingToken` riêng cho tab/phòng, dùng trong body của `pair/status` cùng `roomId`. Không dùng mã 8 ký tự để đổi trực tiếp phiên web. Bằng chứng kết nối được giữ trong `sessionStorage` của đúng tab/phòng trong tối đa 5 phút để khôi phục sau tải lại; không đặt trong URL hoặc log, xóa khi hoàn tất/hết hạn. Cookie cũ chỉ là đường tương thích, không quyết định mã của tab mới. Xác nhận lại cùng tài khoản và thử lại HTTP an toàn: không đổi chủ mã, không tạo thêm phiên cho mỗi lần poll, không gia hạn thời hạn mã/phiên. Giới hạn poll tách theo bằng chứng thay vì IP chung của Funnel/proxy.

Web chỉ hoàn tất khi đã nhận được trạng thái người chơi; lỗi mạng khi tải trạng thái vẫn tự thử lại tới khi mã hết hạn. Đóng luồng khán giả cũ trước khi chuyển sang luồng đã đăng nhập, bỏ qua sự kiện từ luồng cũ. Nếu trình duyệt không nhận cookie phiên, hiển thị lỗi rõ để người chơi cho phép cookie và lấy mã mới thay vì chờ vô hạn. Mã hết hạn hoặc sai phòng không được dùng để xác nhận.

Các hàm `discord.pending()` trả các mã phòng chưa gửi; `acknowledge(room)` chỉ xác nhận khi phiên bản đã gửi vẫn khớp bản lưu. `restore()` đánh dấu các tin phòng đang mở để cập nhật lại sau restart. `runtime.bindInteraction(gameId, roomId, interaction)` chỉ nhận tương tác đã được defer đúng vào tin phòng (hoặc phản hồi tạo phòng). Quyền Xem kênh của bot vẫn cần cho cập nhật dài hạn/sau restart; vòng lặp ghi log mã lỗi và thông tin phòng, không ghi token.

## Kiểm tra

`npm run test:web:pairing` kiểm tra luồng Discord → web với HTTP thật và giao diện của cả Caro/Walls: mất phản hồi, tải lại tab, nhiều tab dùng chung cookie, thử lại, hết hạn, giới hạn poll qua cùng IP proxy và sự kiện SSE cũ. `npm run test:caro` kiểm tra luật tùy chọn, dữ liệu cũ, HTTP/SSE, khán giả, phiên xuyên game và cô lập mã kết nối/cập nhật Discord giữa game. `node scripts/test-env-example.js` kiểm tra cấu hình triển khai. Không đăng ký command thật hoặc chạm dữ liệu người chơi khi chạy các kiểm tra này.
