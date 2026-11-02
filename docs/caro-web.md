# Caro hai người trên web (thử nghiệm)

Bot và web chạy trong **cùng một tiến trình Node.js trên VM GCP hiện có**. Caro là module của [máy chủ web dùng chung](web-games.md): cùng địa chỉ Tailscale, phiên đăng nhập, SSE và đồng bộ Discord với các game đăng ký sau này. SQLite hiện có lưu từng nước đi và thời hạn của trận.

## Luật và cách chơi

- `/caro choi`: tạo một phòng tại kênh hiện tại. Mặc định tối đa **5 phòng chờ/đang đấu mỗi kênh**; mỗi người chỉ tham gia **1 phòng caro trong mỗi server**. Phòng đã kết thúc/hết hạn không chiếm chỗ.
- `/caro phong` (hoặc `!caro phong`): danh sách phòng tại kênh hiện tại, phân trang 5 phòng/trang; có trạng thái, hai người chơi, luật, nút mở bàn và liên kết tới tin mời để tham gia. Nút Làm mới lấy trạng thái mới nhất; danh sách riêng trong Discord chỉ người mở điều khiển được.
- Quản trị dùng `/caro cauhinh phongtoida:10` để đặt giới hạn 1–20 phòng tại kênh hiện tại; thêm `kenh:#kenh` nếu muốn chỉnh kênh khác. Bỏ `phongtoida` để xem cấu hình. Cấu hình lưu riêng theo server/kênh và giữ sau restart. Giảm giới hạn không đóng ván cũ, chỉ chặn mở thêm tới khi số phòng xuống dưới giới hạn. Prefix tương đương: `!caro cauhinh phongtoida=10`.
- Tùy chọn khi tạo: `kichthuoc` 9–25 ô mỗi cạnh (mặc định 15), `sothang` 3–6 quân liên tiếp (mặc định 5), `chan2dau`, `bienchan`, `dungsoquan` (mặc định đều tắt). Luật cố định trong suốt ván và hiển thị trước khi tham gia.
- `chan2dau:true`: nối đủ quân nhưng cả hai đầu đều có quân đối thủ thì không thắng. `bienchan:true` tính mép bàn là chặn khi bật `chan2dau`. `dungsoquan:true` yêu cầu đúng số quân, nối dài hơn không thắng. Kiểm tra độc lập cả bốn hướng; chỉ cần một hướng thỏa luật.
- Ví dụ: `/caro choi kichthuoc:19 sothang:5 chan2dau:true bienchan:false dungsoquan:true`.
- Người khác bấm **Tham gia**. Chủ phòng cầm X, đối thủ cầm O, X đi trước.
- **Mở bàn cờ** là nút liên kết trực tiếp đến `/caro/room/<mã phòng>`, không gửi thêm tin nhắn riêng. Link `/room/<mã phòng>` cũ tự chuyển đến đường mới. Ai có link cũng có thể xem trực tiếp người tham gia, nước đi và kết quả, hoặc mở lại bàn đã kết thúc.
- Để đánh cờ, người chơi bấm **Xác nhận người chơi** trên web, rồi bấm **Kết nối tài khoản** trong tin phòng Discord và nhập mã 8 ký tự đang hiển thị trên tab của chính mình. Web tự nhận quyền đánh sau khi xác nhận, không cần tải lại. Khán giả không cần xác nhận và không thể đánh/hủy/đầu hàng.
- Mã kết nối chỉ gán cho một tài khoản trong đúng phòng, hết hạn sau 5 phút và chỉ hai người chơi được xác nhận. Mỗi tab/phòng giữ bằng chứng kết nối riêng trong phiên của tab để tránh ghi đè khi mở nhiều bàn; có thể tiếp tục sau tải lại trang. Cookie phiên chơi HttpOnly có hiệu lực 12 giờ. Nếu mất phản hồi sau khi Discord xác nhận, web tự thử lại an toàn; mã hết hạn sẽ báo lấy mã mới. Không cần thêm Discord OAuth/client secret. Các link vé riêng cũ vẫn dùng được đến khi hết hạn.
- Mặc định bàn 15×15, từ 5 quân liên tiếp thắng kể cả chặn hai đầu hoặc dài hơn 5. Ván cũ không có cấu hình vẫn giữ luật này. Các tùy chọn trên không phải bộ luật cấm của Renju.
- Mỗi người có đồng hồ riêng, mặc định 30 phút; `/caro choi thoigian:15` chọn 15 phút/người (cho phép 1–180 phút). Chỉ đồng hồ người tới lượt chạy, không cộng giờ sau nước đi. Hết giờ của mình thì thua, không còn giới hạn tổng thời gian trận. Phòng chờ tự hết hạn sau 10 phút. Đồng hồ vẫn chạy lúc mất kết nối hoặc bot dừng.
- Tải lại trang để xem lại bàn đã lưu. Nếu mất mạng, web tự kết nối lại. Nếu bot khởi động lại hoặc cookie hết hạn sau 12 giờ, kết nối tài khoản lại để đánh tiếp; vẫn xem bàn được khi chưa xác nhận.
- Hủy phòng chờ từ Discord hoặc web; đầu hàng trong web. Tin phòng Discord cập nhật ngay khi có người tham gia hoặc ván kết thúc, hiển thị người thắng/hòa và nguyên nhân. Tác vụ mỗi 5 giây kiểm tra hết giờ và thử lại khi cập nhật gặp lỗi. Bot sửa trực tiếp tin của mình, không cần đọc lịch sử tin nhắn trước.
- Bot cần quyền **Xem kênh (View Channel)** tại kênh caro để tự cập nhật kết quả từ web trong suốt ván và sau khi khởi động lại. Với luồng riêng tư, cần thêm bot vào luồng. Lệnh tạo phòng sẽ báo rõ nếu quyền tương tác cung cấp cho biết bot thiếu quyền này.
- Khi tạo phòng hoặc bấm Tham gia/Hủy phòng, bot giữ đường sửa tin qua tương tác Discord trong bộ nhớ để cập nhật chính tin phòng, kể cả khi đường truy cập kênh gặp lỗi. Đường này chỉ dùng trong thời hạn token tương tác; sau đó bot chuyển sang đường truy cập kênh. Không lưu token vào SQLite hoặc log. Đây không thay thế quyền Xem kênh cho ván dài.
- Không cược, không cộng xu, EXP hay thành tích trong bản thử.

## Chạy trên VM GCP bằng Tailscale Funnel

Thực hiện trong thư mục bot trên VM. Giữ nguyên cách vận hành bot hiện tại (PM2 hoặc systemd). Chỉ chạy **một tiến trình bot** cho database và cổng web này.

1. Sau khi thay đổi đã được commit/push lên nhánh bạn dùng, cập nhật code và thư viện:

   ```sh
   git pull --ff-only
   npm ci
   npm run test:caro
   npm run test:changelog
   ```

2. Nếu VM chưa có Tailscale, cài theo [hướng dẫn Linux chính thức](https://tailscale.com/download/linux). Sau đó đăng nhập và tạo Funnel:

   ```sh
   sudo tailscale up
   sudo tailscale funnel --bg 3000
   sudo tailscale funnel status
   ```

   Mở đường dẫn xác nhận mà Tailscale yêu cầu để bật HTTPS/Funnel. Ghi lại địa chỉ HTTPS công khai được in ra, ví dụ `https://ten-may.ten-tailnet.ts.net`. Địa chỉ của bạn sẽ khác ví dụ. Lúc bot chưa bật web, truy cập địa chỉ này có thể báo không kết nối được backend.

3. Thêm vào `.env` trên VM, thay địa chỉ ví dụ bằng địa chỉ Funnel thật:

   ```dotenv
   WEB_ENABLED=true
   WEB_PUBLIC_URL=https://ten-may.ten-tailnet.ts.net
   ```

   Cấu hình `CARO_WEB_ENABLED`/`CARO_PUBLIC_URL` cũ vẫn dùng được; biến `WEB_*` được ưu tiên nếu có. Mặc định web nghe tại `127.0.0.1:3000`. Nếu đổi cổng, dùng `WEB_PORT` và cập nhật cổng đích của Funnel/proxy tương ứng. Không cần đổi cấu hình Tailscale đang chạy chỉ vì thêm module game.

4. Đăng ký lệnh rồi restart bot bằng trình quản lý đang dùng:

   ```sh
   npm run register
   ```

   Nếu đang chạy bot trực tiếp, dừng tiến trình cũ rồi chạy `npm start`. Nếu dùng PM2/systemd, restart dịch vụ bot hiện có; không mở thêm bản bot thứ hai.

5. Kiểm tra sau khi bot đã kết nối Discord:

   ```sh
   curl -fsS http://127.0.0.1:3000/healthz
   ```

   Kết quả mong đợi: `{"ok":true}`. Trên Discord dùng `/caro choi`, nhờ một tài khoản khác tham gia. Hai người mở bàn và kết nối tài khoản bằng mã; thử đánh qua lại, tải lại trang và mở cùng link trong trình duyệt thứ ba để xem trực tiếp.

Funnel cung cấp HTTPS và địa chỉ `ts.net`, người chơi không phải cài Tailscale. Tính năng này có giới hạn băng thông; gói miễn phí và điều kiện tài khoản tuân theo [bảng giá Tailscale](https://tailscale.com/pricing) và [giới hạn Funnel](https://tailscale.com/docs/features/tailscale-funnel). GCP vẫn tính tài nguyên và mạng theo cấu hình hiện tại; không bảo đảm hóa đơn GCP bằng 0. Xem [lệnh Funnel và chế độ nền](https://tailscale.com/docs/reference/tailscale-cli/funnel).

## Dùng tên miền và HTTPS sẵn có

Nếu VM đã có Nginx/Caddy và tên miền, không cần Funnel. Chuyển tiếp địa chỉ HTTPS gốc về `127.0.0.1:3000`, đặt `CARO_PUBLIC_URL` đúng địa chỉ gốc đó. Không dùng đường dẫn con như `/caro`.

Đối với Nginx, trong server HTTPS của tên miền:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

Đường `/api/events` là kết nối SSE dài; proxy không được giữ bộ đệm các sự kiện. Phần SSL và tường lửa dùng cấu hình HTTPS hiện có của bạn. Không công khai database hoặc cổng Node nội bộ.

## Cấu hình và xử lý sự cố

| Biến               | Mặc định                | Ý nghĩa                                                  |
| ------------------ | ----------------------- | -------------------------------------------------------- |
| `CARO_WEB_ENABLED` | `false`                 | Bật bằng `true`; tắt để ngừng web và tạo phòng mới       |
| `CARO_PUBLIC_URL`  | `http://127.0.0.1:3000` | Địa chỉ gốc ngoài Internet; bắt buộc HTTPS trừ localhost |
| `CARO_WEB_HOST`    | `127.0.0.1`             | Chỉ đổi khi có yêu cầu triển khai riêng                  |
| `CARO_WEB_PORT`    | `3000`                  | Cổng nội bộ của web                                      |

- **Web chưa được bật:** kiểm tra `.env`, restart bot và tìm dòng log `web games ready`. Web chỉ khởi động sau khi bot kết nối Discord. Cấu hình dùng chung và hướng dẫn thêm game ở [web-games.md](web-games.md).
- **Không thấy `/caro`:** chạy lại `npm run register` với đúng `CLIENT_ID` và `GUILD_ID` trên VM.
- **Mã hết hạn:** bấm lại **Xác nhận người chơi** trên web để lấy mã mới. Không xác nhận mã do người khác gửi; chỉ nhập mã trên tab bàn cờ của chính mình. Không gửi cookie hoặc token bot vào log hay ảnh hỗ trợ.
- **Nguồn truy cập không hợp lệ:** địa chỉ thực tế trên trình duyệt phải khớp `CARO_PUBLIC_URL`, gồm cả cổng nếu có.
- **Trang mở được nhưng không cập nhật:** kiểm tra kết nối `/api/events`, tắt buffering ở proxy; thử tắt VPN hoặc tiện ích chặn kết nối.
- **Web đã đổi nhưng tin Discord vẫn cũ; log có `50001`:** Discord báo Missing Access. Vào Chỉnh sửa kênh → Quyền, cấp **Xem kênh** cho bot/role bot, kiểm tra ghi đè quyền tại kênh và quyền vào luồng riêng tư. Nếu là ứng dụng cài cho người dùng, bảo đảm bot cũng có mặt trong server. Không cần cấp quyền Quản trị viên. Bot giữ trạng thái chờ gửi và thử lại mỗi 5 giây sau khi khôi phục quyền. Log có mã phòng, kênh, tin nhắn và bước bị lỗi để xác định đúng nơi cần sửa quyền; không chứa token.
- **Bot khởi động lại:** dữ liệu vẫn nằm trong SQLite và được backup cùng database bot. Mã và cookie cũ mất hiệu lực; kết nối tài khoản lại. Link phòng vẫn xem được. Trận quá giờ sẽ kết thúc, không được bắt đầu lại đồng hồ.
- **Port đang dùng:** đổi cả `CARO_WEB_PORT` và cổng đích của Funnel/proxy rồi restart bot.
- **Dừng thử nghiệm:** đặt `CARO_WEB_ENABLED=false` rồi restart bot. Nếu Funnel chỉ phục vụ caro, có thể tắt bằng `sudo tailscale funnel --https=443 off`. Không chạy lệnh tắt nếu Funnel đang dùng cho ứng dụng khác.

## Kiểm tra tự động

`npm run test:caro` dùng database tạm riêng, không truy cập Discord và không thay dữ liệu người chơi. Bộ kiểm tra gồm luật thắng bốn hướng, phòng và ghế độc quyền, lượt đi, hết giờ, lưu/đọc lại SQLite, vé cũ, mã kết nối/cookie/quyền đánh, nguồn yêu cầu, luồng trực tiếp cho hai người chơi và khán giả, hiển thị kết quả và cập nhật tin Discord khi trạng thái đổi trong lúc đang gửi.
