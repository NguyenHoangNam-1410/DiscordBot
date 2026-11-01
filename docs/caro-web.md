# Caro hai người trên web (thử nghiệm)

Bot và web chạy trong **cùng một tiến trình Node.js trên VM GCP hiện có**. Không cần dịch vụ database hay hosting web riêng, không thêm thư viện chạy game. Server đẩy trạng thái qua SSE, trình duyệt gửi nước đi bằng HTTP POST. SQLite hiện có lưu từng nước đi và thời hạn của trận.

## Luật và cách chơi

- `/caro choi`: tạo một phòng tại kênh hiện tại. Mỗi kênh có tối đa một phòng chờ/đang chơi; mỗi người có tối đa một phòng đang mở trong mỗi server Discord.
- Người khác bấm **Tham gia**. Chủ phòng cầm X, đối thủ cầm O, X đi trước.
- Cả hai bấm **Mở bàn cờ** trong tin nhắn phòng. Bot trả lời riêng với nút **Vào bàn caro**.
- Link là vé riêng dùng một lần, có hiệu lực 5 phút. Nút mở lại trong Discord cấp vé mới, vô hiệu vé chưa dùng trước đó của người này trong phòng. Ai giữ vé chưa dùng có thể vào dưới danh tính của người được cấp; không chuyển tiếp vé.
- Trình duyệt đổi vé lấy cookie HttpOnly. Vé nằm trong phần `#` của link, được xóa khỏi thanh địa chỉ ngay khi trang chạy và không nằm trong URL gửi đến server. Không cần Discord OAuth/client secret cho bản thử này; tài khoản được xác nhận qua tương tác Discord trước khi cấp vé.
- Bàn 15×15. Từ 5 quân liên tiếp theo ngang/dọc/chéo thắng, kể cả chặn hai đầu hoặc có hơn 5 quân. Bản này chưa áp dụng luật cấm của Renju.
- Mỗi lượt 90 giây, tối đa 30 phút/trận. Hết giờ lượt xử thua, hết thời gian trận xử hòa. Phòng chờ tự hết hạn sau 10 phút. Đồng hồ vẫn chạy lúc mất kết nối hoặc bot dừng.
- Tải lại trang để xem lại bàn đã lưu. Nếu mất mạng, web tự kết nối lại. Nếu bot khởi động lại hoặc cookie hết hạn sau 12 giờ, bấm **Mở bàn cờ** trong Discord để vào lại; bàn đã lưu vẫn còn.
- Hủy phòng chờ từ Discord hoặc web; đầu hàng trong web. Kết quả được cập nhật vào tin nhắn phòng trong Discord, thường trong vòng 5 giây khi bot kết nối bình thường.
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
   CARO_WEB_ENABLED=true
   CARO_PUBLIC_URL=https://ten-may.ten-tailnet.ts.net
   ```

   Mặc định web nghe tại `127.0.0.1:3000`. Không cần mở cổng 3000 hoặc 443 vào VM GCP khi dùng Funnel. Nếu cổng 3000 đã có dịch vụ, thêm `CARO_WEB_PORT=3001` và đổi lệnh Funnel sang cổng 3001. Không đổi các cấu hình Tailscale/Funnel đang phục vụ ứng dụng khác khi chưa kiểm tra.

4. Đăng ký lệnh rồi restart bot bằng trình quản lý đang dùng:

   ```sh
   npm run register
   ```

   Nếu đang chạy bot trực tiếp, dừng tiến trình cũ rồi chạy `npm start`. Nếu dùng PM2/systemd, restart dịch vụ bot hiện có; không mở thêm bản bot thứ hai.

5. Kiểm tra sau khi bot đã kết nối Discord:

   ```sh
   curl -fsS http://127.0.0.1:3000/healthz
   ```

   Kết quả mong đợi: `{"ok":true}`. Mở địa chỉ Funnel và kiểm tra trang hướng dẫn vào bàn. Trên Discord dùng `/caro choi`, nhờ một tài khoản khác tham gia, rồi mỗi người mở link riêng. Thử đánh qua lại và tải lại một trình duyệt.

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

- **Web chưa được bật:** kiểm tra `.env`, restart bot và tìm dòng log `caro web ready`. Web chỉ khởi động sau khi bot kết nối Discord.
- **Không thấy `/caro`:** chạy lại `npm run register` với đúng `CLIENT_ID` và `GUILD_ID` trên VM.
- **Link đã dùng/hết hạn:** lấy link mới bằng nút **Mở bàn cờ**. Không gửi vé, cookie hoặc token bot vào log hay ảnh hỗ trợ.
- **Nguồn truy cập không hợp lệ:** địa chỉ thực tế trên trình duyệt phải khớp `CARO_PUBLIC_URL`, gồm cả cổng nếu có.
- **Trang mở được nhưng không cập nhật:** kiểm tra kết nối `/api/events`, tắt buffering ở proxy; thử tắt VPN hoặc tiện ích chặn kết nối.
- **Bot khởi động lại:** dữ liệu vẫn nằm trong SQLite và được backup cùng database bot. Vé và cookie cũ mất hiệu lực; mở link mới. Trận quá giờ sẽ kết thúc, không được bắt đầu lại đồng hồ.
- **Port đang dùng:** đổi cả `CARO_WEB_PORT` và cổng đích của Funnel/proxy rồi restart bot.
- **Dừng thử nghiệm:** đặt `CARO_WEB_ENABLED=false` rồi restart bot. Nếu Funnel chỉ phục vụ caro, có thể tắt bằng `sudo tailscale funnel --https=443 off`. Không chạy lệnh tắt nếu Funnel đang dùng cho ứng dụng khác.

## Kiểm tra tự động

`npm run test:caro` dùng database tạm riêng, không truy cập Discord và không thay dữ liệu người chơi. Bộ kiểm tra gồm luật thắng bốn hướng, chống nối qua mép bàn, phòng và ghế độc quyền, lượt đi và bản bàn cờ cũ, hết giờ, lưu/đọc lại SQLite, vé một lần, cookie, quyền truy cập, nguồn yêu cầu và đồng bộ sự kiện giữa hai kết nối thật trên localhost.
