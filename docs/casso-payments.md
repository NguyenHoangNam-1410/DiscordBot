# Chuyển khoản theo phe qua Casso Webhook V2

## Cách sử dụng

- `/bet sotien:10000 phe:BLG` hoặc `!bet 10000 BLG`: tạo một QR chuyển khoản OCB VA.
- `/bet` hoặc `!bet`: xem thống kê tiền đã xác nhận và các yêu cầu gần đây của mình.
- Chỉ hai phe **BLG** và **GENG**. Tối đa **20.000 VND/giao dịch**, **50.000 VND/người**, **3 giao dịch/người**.
- QR đang chờ cũng giữ hạn mức để nhiều yêu cầu đồng thời không vượt giới hạn. QR hết hạn sau 15 phút hoặc lúc chốt sổ, tùy thời điểm nào đến trước. Yêu cầu hết hạn chưa được thanh toán được giải phóng hạn mức.
- Chốt sổ **02:00 ngày 15/11/2026, UTC+7**. Dùng thời gian giao dịch ngân hàng; chuyển đúng lúc 02:00 hoặc sau đó không được tự ghi nhận vào thống kê. Thông báo đến trễ vẫn có thể xác nhận giao dịch thực hiện trước hạn QR và giờ chốt sổ.
- Phe của người chơi là phe trong **giao dịch hợp lệ mới nhất theo thời gian ngân hàng**. Toàn bộ tiền đã nhận chuyển sang phe đó: BLG 20.000, sau đó GENG 10.000 => GENG 30.000. Casso gửi đảo thứ tự không làm đổi kết quả. Nếu hai giao dịch cùng giây, ID giao dịch Casso lớn hơn được xem là mới hơn.
- Nội dung có cả mã phe và mã đối soát ngẫu nhiên, ví dụ `BLG BET0123456789ABCDEF`. Giữ nguyên nội dung khi chuyển. Chỉ chọn phe/tạo QR chưa làm đổi phe.
- Tin QR công khai tự đổi thành trạng thái đã nhận/hết hạn/cần đối soát. `/bet` dạng slash trả thống kê riêng; prefix trả tin bình thường trong kênh.
- Đây là sổ ghi nhận chuyển khoản. Bot chưa có cơ chế xác định đội thắng, chia tiền, trả thưởng, hoàn tiền hoặc quy đổi sang xu/kim cương.

Ảnh QR PNG và nội dung VietQR được tạo ngay trên máy chạy bot bằng thư viện VietQR chính thức, không cần gọi dịch vụ tạo ảnh bên ngoài hoặc thêm API key.

## Cấu hình máy chủ

1. Sao chép `docs/casso-payments.example.json` thành `data/bank-payments.json`.
2. Điền số VA vào `accountNumber`, số tài khoản chính liên kết VA vào `mainAccountNumber`, và tên người nhận vào `accountName`. Mẫu trong Git chỉ chứa thông tin giả. File cấu hình thật đã bị loại khỏi Git và không được web phục vụ.
3. `guildId` trống sẽ lấy `GUILD_ID` trong môi trường. Chỉ server này được dùng lệnh, tránh thống kê lẫn server.
4. Đặt `enabled: true`. Đặt `CASSO_WEBHOOK_SECRET` trong `.env` máy chạy bot, lấy **Key bảo mật của tích hợp Webhook V2**, không dùng API key truy vấn tài khoản.
5. Bật web dùng chung: `WEB_ENABLED=true`, `WEB_PUBLIC_URL=https://<ten-mien-cong-khai>`. Tailscale Funnel đang dùng cho game có thể chuyển tiếp cùng cổng. `WEB_PUBLIC_URL` phải truy cập được từ Internet, không chỉ trong mạng Tailscale riêng.
6. Chạy `npm ci`, `npm run register`, rồi khởi động lại bot. Thay đổi cấu hình nhận tiền cũng cần khởi động lại. Lệnh sẽ không tạo QR nếu phần nhận giao dịch chưa sẵn sàng.

Không đưa mật khẩu ngân hàng, OTP, key Casso vào Git, Discord hoặc nội dung giao dịch.

## Thiết lập trên Casso

Theo [hướng dẫn chính thức](https://developer.casso.vn/webhook/thiet-lap-webhook-thu-cong):

1. **Kết nối → Tích hợp → Thêm tích hợp → Webhook V2**.
2. Chọn đúng tài khoản **OCB VA** đã liên kết, chọn tiền vào nếu có bộ lọc.
3. Webhook URL: `https://<ten-mien-cong-khai>/api/bank/casso`.
4. Sao chép Key bảo mật vào `CASSO_WEBHOOK_SECRET` trên máy chạy bot rồi khởi động lại bot. Không gửi key qua chat.
5. Bật gửi kèm mã giao dịch để có `reference`; bật **Strict mode**. Bot trả HTTP 200 với `{"success":true}` sau khi đã lưu giao dịch, không chờ Discord phản hồi.
6. Nhấn **Gọi thử** và lưu tích hợp. Mẫu thử có `id=0` được xác thực/ack nhưng không cộng tiền.
7. Tạo một QR bằng `/bet` và chuyển thử từ tài khoản khác; kiểm tra cả giao dịch trên Casso và tin xác nhận trong Discord trước khi cho mọi người dùng. Giao dịch thật dùng để thử vẫn tính vào hạn mức của người tạo QR.

Webhook thường (`secure-token`) không được chấp nhận; chọn đúng **Webhook V2**. Bot dùng [thuật toán chữ ký chính thức của Casso](https://github.com/CassoHQ/casso-webhook-v2-verify-signature): HMAC-SHA512 trên timestamp và JSON được sắp xếp khóa của toàn bộ payload. Không giới hạn tuổi chữ ký để các lần gửi lại/phát lại hợp lệ của Casso vẫn hoạt động; chống trùng bằng ID giao dịch và mã tham chiếu ngân hàng được lưu bền vững.

## Đối soát và khôi phục

- Chỉ tiền vào đúng OCB VA mới được xử lý; chuyển vào tài khoản chính đơn thuần không xác nhận yêu cầu VA.
- Chỉ khớp khi đúng mã yêu cầu, phe, số tiền, hạn và giới hạn người chơi. Chữ ký sai bị từ chối. Giao dịch lặp chỉ được xử lý một lần.
- Sai số tiền, sai/thiếu mã, chuyển muộn, vượt hạn mức hoặc thời gian ngân hàng chỉ có ngày sẽ được lưu để kiểm tra, không tự cộng vào thống kê. Giao dịch không có mã yêu cầu không thể xác định người chơi nên không có tin xác nhận cá nhân.
- Tiền thực tế đã vào ngân hàng không được bot hoàn tự động. Người vận hành cần đối soát các dòng `bank_bet_receipts` có `reason <> 'matched'` trong cơ sở dữ liệu riêng; không đăng nội dung giao dịch thô lên kênh công khai.
- Casso có thể gửi lại cùng giao dịch. Sau lỗi hoặc mất kết nối, dùng chức năng phát lại của Casso cho những sự kiện chưa gửi thành công; nếu Casso không có sự kiện cần kiểm tra sao kê riêng. Chưa có tác vụ tự tải lại toàn bộ sao kê.
- Bảng `bank_bet_orders` lưu yêu cầu, trạng thái, phe và thông tin người nhận. `bank_bet_receipts` chỉ giữ các trường phục vụ đối soát, không lưu số dư, tài khoản đối ứng hoặc toàn bộ webhook. Dữ liệu đi cùng cơ chế sao lưu SQLite hiện có.
- Việc ghi nhận và cập nhật Discord độc lập: hàng đợi cập nhật tin được lưu trong SQLite; lỗi tạm thời được thử lại, kể cả sau khi bot khởi động lại. Nếu tin/kênh đã bị xóa, vẫn tra được trạng thái và số tiền qua `/bet`.
- Không sửa `campaignId`, tài khoản nhận, hai phe hoặc các giới hạn giữa đợt đang hoạt động. Để mở một đợt mới cần cấu hình ID mới; dữ liệu đợt cũ được giữ lại.

Kiểm tra: `npm run test:payments`, `npm run test:changelog`, `npm run test:web:public`.
