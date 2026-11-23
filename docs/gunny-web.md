# Gunny web hai người

Mở bằng `/gunny choi [nguoitruoc] [thoigian] [luot]` hoặc `!gunny choi`. Người thứ hai bấm **Tham gia**, mở web và xác nhận tài khoản theo mã. Mỗi người chọn Gấu/Mèo/Robot và bấm **Sẵn sàng**. Khán giả chỉ cần mở link phòng.

- `/gunny phong`: danh sách phòng trong kênh, có phân trang.
- `/gunny cauhinh phongtoida:5`: quản trị đặt giới hạn 1–20 phòng/kênh. Mỗi người chỉ ở một phòng Gunny trong cùng server.
- `nguoitruoc`: chủ phòng, khách hoặc ngẫu nhiên. `thoigian`: đồng hồ 1–180 phút/người, mặc định 30. `luot`: 15–120 giây ngắm/lượt, mặc định 30.
- Web dùng cấu hình `WEB_ENABLED`/`WEB_PUBLIC_URL` và máy chủ web/Tailscale hiện có. Không cần Python hoặc cổng mạng mới. Sau khi cập nhật: khởi động lại bot và chạy `npm run register`.

## Luật đã triển khai

Nhân vật chỉ khác ngoại hình; mỗi bên 100 HP, tối đa 60 bước di chuyển mỗi lượt. Chọn hướng, góc nâng và vũ khí rồi giữ nút Bắn hoặc Space để canh lực. Thanh lực chạy 0 → 100% trong 2,5 giây, giảm 100 → 0% trong 2,5 giây và lặp lại liên tục tới khi thả; mỗi lần giữ bắt đầu từ 0%. Thả ở mức nào thì bắn với lực ở mức đó, kể cả 0%; Esc, mất focus hoặc hủy thao tác sẽ không bắn. Lực được lấy lại chính xác lúc thả, không phụ thuộc khung hình cuối. Thanh lực là chỉ báo, không kéo chỉnh bằng tay. Máy chủ dùng tốc độ lực 0–20 tương ứng 0–100%, giữ nguyên tốc độ tối đa. A/D di chuyển, ↑/↓ đổi góc. Di chuyển chỉ trừ quãng đường thực tế, không xuyên đối thủ hoặc leo vách quá cao.

| Vũ khí       | Sát thương trực tiếp | Bán kính nổ | Đạn/người | Góc nâng theo thân |
| ------------ | -------------------: | ----------: | --------: | -----------------: |
| Đạn thường   |                   25 |          20 |    Vô hạn |              0–90° |
| Lựu đạn      |                   40 |          35 |         3 |             20–80° |
| Tên lửa      |                   50 |          25 |         2 |             10–70° |
| Bom hạt nhân |                   80 |          60 |         1 |             30–75° |

Nhân vật nghiêng theo tiếp tuyến mặt đất dưới hai chân (lấy mẫu cách tâm 16 đơn vị mỗi bên và làm mượt mỗi đầu bằng 5 cột). Khi di chuyển, quay hướng hoặc địa hình bị khoét, tư thế và đồng hồ cập nhật theo địa hình hiện tại. Mảng đen mờ là nửa mặt phẳng đất; vòng xanh thể hiện vùng ngắm hợp lệ của vũ khí; kim đỏ chỉ hướng nòng thực tế. Số màu xanh dương là góc bắn **so với phương ngang**, có thể âm hoặc lớn hơn 90° trên dốc.

Gọi độ nghiêng mặt đất là β (dương khi lên dốc về phải), góc nâng theo thân là α, hướng nhìn d = +1 (phải) hoặc −1 (trái). Góc hiển thị θ = α + dβ. Hướng thế giới là θ khi nhìn phải, 180° − θ khi nhìn trái. Ví dụ β = 26°, nhìn trái, α = 90° thì hiển thị 64° và nòng chỉ hướng 116° so với trục phải. Thanh chỉnh góc giữ α; thay đổi dốc/hướng sẽ thay đổi θ. Máy chủ kiểm tra khoảng α theo vũ khí trước khi trừ đạn và dùng cùng hình học cho vị trí nòng, đường đạn và tâm va chạm của nhân vật. `src/gunny/public/aim.js` là phép tính dùng chung cho máy chủ và trình duyệt.

Đạn chịu gió và trọng lực; tên lửa chịu nửa trọng lực. Vụ nổ gây sát thương giảm theo khoảng cách, có thể tự gây sát thương, đồng thời khoét địa hình. Đây là địa hình heightmap: chỉ hạ bề mặt, không tạo hang hay mái treo. Người chơi đứng trên phần bị phá sẽ hạ xuống mặt đất mới; hết đất bên dưới thì bị loại. HP về 0 hoặc rơi khỏi địa hình là thua; cả hai cùng bị loại là hòa.

Đồng hồ riêng chỉ chạy lúc ngắm, dừng trong thời gian đạn bay; không cộng giờ. Hết thời gian lượt thì tự bỏ lượt; hết đồng hồ riêng thì thua. Phòng chờ đóng sau 10 phút. Chuẩn bị có 3 phút: nếu chỉ một người sẵn sàng thì người đó thắng; không ai sẵn sàng thì đóng. Trong trận, 5 phút không có thao tác hợp lệ từ cả hai người sẽ đóng phòng. Mất mạng không dừng các hạn giờ.

Chiến trường chiếm trọn khung chơi trên PC và điện thoại. HUD người chơi, gió, đếm ngược và toàn bộ nút điều khiển nằm trực tiếp trong chiến trường; không có cột bên phải. Khung dưới gồm đồng hồ góc bắn, bốn vũ khí, thanh lực và nút Bắn. HP và thể lực bám ngay dưới từng nhân vật, cập nhật theo di chuyển và lượt mới. Phông nền đảo nhiệt đới/di tích đá, mây và lá chuyển động, hào quang khi nạp lực, vệt đạn, vụ nổ, mảnh vỡ và số sát thương nổi chỉ là hiệu ứng trình bày. Tùy chọn giảm chuyển động của thiết bị tắt rung màn hình và các chuyển động trang trí. Có nút Toàn cảnh/Cận cảnh và kéo chiến trường để nhìn quanh. Thông tin, tài khoản và luật (?) mở bằng modal; âm thanh có công tắc chung.

## Kiến trúc và kiểm thử

`src/gunny/engine.js` tính toàn bộ vật lý trên máy chủ ở bước cố định 60 Hz, dùng RNG có trạng thái được lưu cùng phòng. Trình duyệt chỉ phát lại đường đạn đã được tính; không quyết định sát thương. Kết quả áp dụng nguyên tử, khóa hành động trong lúc phát lại. Phòng, HP, đạn, địa hình, RNG, đồng hồ và thời điểm kết thúc đường đạn lưu trong SQLite (migration 74); khi khởi động lại, các hạn giờ tiếp tục được xử lý theo thời gian thực đã trôi qua.

Dùng chung xác nhận Discord, phiên web, kiểm tra quyền, mã phòng ngắn, SSE cho người chơi/khán giả và cập nhật tin phòng. Đây là game giải trí không cược, không thưởng xu và không đưa vũ khí vào túi đồ Discord.

Kiểm tra: `npm run test:gunny` và `npm run test:gunny:ui` (cần Chrome cài tại máy; có thể đặt `CHROME_PATH`). UI test mở máy chủ cục bộ và Chrome headless, dùng DB trong bộ nhớ. `GUNNY_SCREENSHOT_DIR` trỏ đến thư mục đã tạo nếu cần lưu ảnh.

Nguồn tham khảo/tái sử dụng: [maycuatroi1/gunny-game](https://github.com/maycuatroi1/gunny-game), revision `12f5ad4`; xem `src/gunny/NOTICE.md`. Bản web thay mạng TCP/Pygame bằng kiến trúc web của bot, giữ mẫu pixel nhân vật, sát thương, đạn và bán kính nổ gốc; bổ sung độ nghiêng và các khoảng góc nâng đã thống nhất cho bản web.
