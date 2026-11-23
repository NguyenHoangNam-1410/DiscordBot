# Gunny web hai người

Mở bằng `/gunny choi [nguoitruoc] [thoigian] [luot]` hoặc `!gunny choi`. Người thứ hai bấm **Tham gia**, mở web và xác nhận tài khoản theo mã. Mỗi người chọn Gấu/Mèo/Robot và bấm **Sẵn sàng**. Khán giả chỉ cần mở link phòng.

- `/gunny phong`: danh sách phòng trong kênh, có phân trang.
- `/gunny cauhinh phongtoida:5`: quản trị đặt giới hạn 1–20 phòng/kênh. Mỗi người chỉ ở một phòng Gunny trong cùng server.
- `nguoitruoc`: chủ phòng, khách hoặc ngẫu nhiên. `thoigian`: đồng hồ 1–180 phút/người, mặc định 30. `luot`: 15–120 giây ngắm/lượt, mặc định 30.
- Web dùng cấu hình `WEB_ENABLED`/`WEB_PUBLIC_URL` và máy chủ web/Tailscale hiện có. Không cần Python hoặc cổng mạng mới. Sau khi cập nhật: khởi động lại bot và chạy `npm run register`.

## Luật đã triển khai

Nhân vật chỉ khác ngoại hình; mỗi bên 100 HP và 200 **thể lực** mỗi lượt (đi bộ và đạo cụ dùng chung, mỗi pixel đi bộ tốn 2). Chọn hướng, góc nâng và vũ khí rồi giữ nút Bắn hoặc Space để canh lực. Thanh lực chạy 0 → 100% trong 2,5 giây, giảm 100 → 0% trong 2,5 giây và lặp lại liên tục tới khi thả; mỗi lần giữ bắt đầu từ 0%. Thả ở mức nào thì bắn với lực ở mức đó, kể cả 0%; Esc, mất focus hoặc hủy thao tác sẽ không bắn. Lực được lấy lại chính xác lúc thả, không phụ thuộc khung hình cuối. Thanh lực là chỉ báo, không kéo chỉnh bằng tay. Máy chủ dùng tốc độ lực 0–20 tương ứng 0–100%, giữ nguyên tốc độ tối đa. Giữ A/D (hoặc giữ nút ◀ ▶) để đi liên tục khoảng 60 đơn vị/giây, chạm nhanh đi 5 bước; giữ W/S để nâng/hạ góc. Trình duyệt dự đoán đường đi bằng đúng luật bước chân của máy chủ (`Terrain.step`) nên nhân vật đi mượt ngay, và gửi lên máy chủ từng gói tối đa 10 bước, mỗi lúc một yêu cầu; máy chủ vẫn là kết quả cuối cùng. Di chuyển chỉ trừ quãng đường thực tế: leo được bậc tối đa 16 đơn vị, không đi xuyên vách, không chui dưới trần thấp hơn thân, đi ra mép đảo/hang thì rơi xuống nền bên dưới (cột không còn đất bên dưới thì bị chặn).

| Vũ khí       | Sát thương trực tiếp | Bán kính nổ | Đạn/người | Góc nâng theo thân | Trọng lực |  Gió | Cản khí | Delay |
| ------------ | -------------------: | ----------: | --------: | -----------------: | --------: | ---: | ------: | ----: |
| Đạn thường   |                   25 |          20 |    Vô hạn |              0–90° |        1× |   1× |      1× |   200 |
| Lựu đạn      |                   40 |          35 |         3 |             20–80° |        1× | 1,2× |    1,2× |   280 |
| Tên lửa      |                   50 |          25 |         2 |             10–70° |      0,5× | 0,6× |    0,5× |   320 |
| Bom hạt nhân |                   80 |          60 |         1 |             30–75° |        1× | 0,8× |      1× |   500 |

Nhân vật nghiêng theo tiếp tuyến mặt đất dưới hai chân (lấy mẫu cách tâm 16 đơn vị mỗi bên và làm mượt mỗi đầu bằng 5 cột). Khi di chuyển, quay hướng hoặc địa hình bị khoét, tư thế và đồng hồ cập nhật theo địa hình hiện tại. Mảng đen mờ là nửa mặt phẳng đất; vòng xanh thể hiện vùng ngắm hợp lệ của vũ khí; kim đỏ chỉ hướng nòng thực tế. Số màu xanh dương là góc bắn **so với phương ngang**, có thể âm hoặc lớn hơn 90° trên dốc.

Gọi độ nghiêng mặt đất là β (dương khi lên dốc về phải), góc nâng theo thân là α, hướng nhìn d = +1 (phải) hoặc −1 (trái). Góc hiển thị θ = α + dβ. Hướng thế giới là θ khi nhìn phải, 180° − θ khi nhìn trái. Ví dụ β = 26°, nhìn trái, α = 90° thì hiển thị 64° và nòng chỉ hướng 116° so với trục phải. Thanh chỉnh góc giữ α; thay đổi dốc/hướng sẽ thay đổi θ. Máy chủ kiểm tra khoảng α theo vũ khí trước khi trừ đạn và dùng cùng hình học cho vị trí nòng, đường đạn và tâm va chạm của nhân vật. `src/gunny/public/aim.js` là phép tính dùng chung cho máy chủ và trình duyệt.

### Địa hình 2D, đào đất và rơi

Địa hình là ảnh 2D thật: mỗi cột lưu các đoạn đất đặc `[đỉnh, đáy, …]`, nên có đảo nổi, mái treo, hang và đường hầm. Mỗi bản đồ sinh đồi theo seed và thêm hai đảo nổi giữa hai bên. Vụ nổ khoét một hình tròn xuyên qua mọi lớp đất nó chạm tới; đất phía trên vẫn treo nếu còn, nên bắn sát chân có thể đào hầm dưới đối thủ. Sau mỗi vụ nổ, ai mất chỗ đứng sẽ rơi xuống mặt đất kế tiếp bên dưới; rơi vào hang không mất máu, cột không còn đất bên dưới thì rơi khỏi bản đồ và thua. `src/gunny/public/terrain.js` là mã địa hình dùng chung cho máy chủ và trình duyệt.

### Vật lý và sát thương

Bước cố định 60 Hz: vận tốc đầu = lực × 0,55; trọng lực 0,15; gió 0,01 × sức gió (−3…3) × hệ số gió của đạn; cản khí 0,12% vận tốc mỗi bước × hệ số cản. Đạn thường lực tối đa 45°, không gió bay khoảng 760 đơn vị (hai người cách nhau 640). Sát thương giảm tuyến tính từ 100% ở tâm xuống 50% ở mép bán kính nổ; trúng thẳng thân luôn đủ 100%. Bạo kích 8%, ×1,5 (theo RNG của phòng nên phát lại giống hệt). Tự trúng nổ chỉ nhận 50% và không bao giờ tự hạ mình (còn tối thiểu 1 HP); rơi khỏi bản đồ vẫn thua. HP về 0, rơi khỏi bản đồ hoặc gục vì độc là thua; cả hai cùng bị loại là hòa.

### Đạo cụ (tốn thể lực, cộng delay)

Mỗi đạo cụ dùng tối đa một lần mỗi lượt, trước khi bắn. Đạo cụ đạn chỉ áp dụng cho phát bắn của lượt đó.

| Đạo cụ           | Thể lực | Delay | Tác dụng                                                                      |
| ---------------- | ------: | ----: | ----------------------------------------------------------------------------- |
| Đạn chùm ×3      |     100 |   120 | 3 viên tỏa góc 0/−4/+4°, lực 100/94/106%, mỗi viên 60% sát thương             |
| Bắn liên tiếp ×2 |     110 |   150 | 2 loạt cùng góc/lực, loạt sau bắn khi loạt trước nổ xong, mỗi loạt 70%        |
| Tăng lực         |      60 |    80 | +30% sát thương                                                               |
| Đạn băng         |      80 |   100 | Mục tiêu trúng đạn bị đóng băng 1 lượt                                        |
| Đạn độc          |      70 |    90 | Mục tiêu trúng đạn mất 6 HP đầu mỗi lượt của họ, 3 lượt                       |
| Hồi máu          |      90 |   100 | +25 HP ngay (tối đa 100), 2 lần mỗi trận                                      |
| Bay              |     120 |   150 | Phát bắn không gây sát thương/không đào; bạn bay tới điểm đạn rơi; hồi 2 lượt |

Thể lực 200 nên ×3 và ×2 không dùng chung được. Bay không dùng chung với đạo cụ đạn hoặc tuyệt kỹ; bay ra ngoài bản đồ thì giữ nguyên chỗ.

### Delay, lượt và nộ (POW)

Lượt không còn luân phiên cố định: ai có **delay** thấp hơn được đi tiếp, hòa thì người vừa đi nhường. Sau mỗi lượt delay cộng thêm: bắn = 600 + delay vũ khí + delay đạo cụ + 10 × số giây ngắm; bỏ lượt = 400 (+ đạo cụ đã dùng); hết giờ lượt = 900. Vì vậy lượt nặng (bom, nhiều đạo cụ, ngắm lâu) có thể cho đối thủ đi hai lượt liên tiếp. Delay hiện ở góc thẻ người chơi.

Nộ 0–100: +12 mỗi phát bắn thường, +8 khi bỏ lượt, +60% sát thương nhận vào (tối đa +30 mỗi vụ nổ). Đủ 100 thì bấm **NỘ** để bật tuyệt kỹ cho phát bắn kế: ×1,5 sát thương, ×1,25 bán kính nổ, không chịu gió; dùng xong nộ về 0.

### Hiệu ứng trạng thái

- **Đóng băng**: lượt kế của mục tiêu không di chuyển, không dùng đạo cụ (vẫn bắn được). Đòn kế tiếp trúng mục tiêu đang đóng băng chỉ gây 50% và làm vỡ băng.
- **Độc**: đầu mỗi lượt của mục tiêu mất 6 HP, 3 lượt; độc có thể hạ gục.
- **Hồi bay**: biểu tượng ➶ kèm số lượt còn phải chờ.

Biểu tượng trạng thái và đạo cụ đang bật hiện ngay dưới thanh HP/thể lực/nộ của từng nhân vật.

Đồng hồ riêng chỉ chạy lúc ngắm, dừng trong thời gian đạn bay; không cộng giờ. Hết thời gian lượt thì tự bỏ lượt; hết đồng hồ riêng thì thua. Phòng chờ đóng sau 10 phút. Chuẩn bị có 3 phút: nếu chỉ một người sẵn sàng thì người đó thắng; không ai sẵn sàng thì đóng. Trong trận, 5 phút không có thao tác hợp lệ từ cả hai người sẽ đóng phòng. Mất mạng không dừng các hạn giờ.

Chiến trường chiếm trọn khung chơi trên PC và điện thoại. HUD người chơi, gió, đếm ngược và toàn bộ nút điều khiển nằm trực tiếp trong chiến trường; không có cột bên phải. Khung dưới gồm đồng hồ góc bắn, bốn vũ khí, bảy đạo cụ, thanh lực, nút Nộ, Bỏ lượt và Bắn. HP, thể lực và nộ bám ngay dưới từng nhân vật, cập nhật theo di chuyển và lượt mới. Phông nền đảo nhiệt đới/di tích đá, mây và lá chuyển động, hào quang khi nạp lực, vệt đạn, vụ nổ, mảnh vỡ và số sát thương nổi chỉ là hiệu ứng trình bày. Tùy chọn giảm chuyển động của thiết bị tắt rung màn hình và các chuyển động trang trí. Có nút Toàn cảnh/Cận cảnh và kéo chiến trường để nhìn quanh. Thông tin, tài khoản và luật (?) mở bằng modal; âm thanh có công tắc chung.

## Kiến trúc và kiểm thử

`src/gunny/engine.js` tính toàn bộ vật lý trên máy chủ ở bước cố định 60 Hz, dùng RNG có trạng thái được lưu cùng phòng. Mỗi phát bắn trả về danh sách viên đạn (loạt, viên, thời điểm bắt đầu, thời gian bay, đường bay, điểm nổ, sát thương, bạo kích, hiệu ứng và trạng thái nhân vật sau va chạm). Trình duyệt chỉ phát lại: bắt đầu từ địa hình trước khi bắn và khoét từng hố khi viên tương ứng rơi; không quyết định sát thương. Trong lúc phát lại, snapshot không gửi địa hình cuối (trình duyệt tự dựng lại) để mỗi tin SSE luôn dưới 64 KB. Phòng cũ dạng heightmap được chuyển tự động khi đọc. Kết quả áp dụng nguyên tử, khóa hành động trong lúc phát lại. Phòng, HP, đạn, địa hình, RNG, đồng hồ và thời điểm kết thúc đường đạn lưu trong SQLite (migration 74); khi khởi động lại, các hạn giờ tiếp tục được xử lý theo thời gian thực đã trôi qua.

Dùng chung xác nhận Discord, phiên web, kiểm tra quyền, mã phòng ngắn, SSE cho người chơi/khán giả và cập nhật tin phòng. Đây là game giải trí không cược, không thưởng xu và không đưa vũ khí vào túi đồ Discord.

Kiểm tra: `npm run test:gunny` (gồm `scripts/test-gunny-mechanics.js` cho địa hình 2D, đào/rơi, đi bộ, hiệu chỉnh vật lý, sát thương, đạo cụ, ×3/×2, bay, băng/độc, nộ, delay) và `npm run test:gunny:ui` (cần Chrome cài tại máy; có thể đặt `CHROME_PATH`). UI test mở máy chủ cục bộ và Chrome headless, dùng DB trong bộ nhớ. `GUNNY_SCREENSHOT_DIR` trỏ đến thư mục đã tạo nếu cần lưu ảnh.

Nguồn tham khảo/tái sử dụng: [maycuatroi1/gunny-game](https://github.com/maycuatroi1/gunny-game), revision `12f5ad4`; xem `src/gunny/NOTICE.md`. Bản web thay mạng TCP/Pygame bằng kiến trúc web của bot, giữ mẫu pixel nhân vật, sát thương, đạn và bán kính nổ gốc; bổ sung độ nghiêng và các khoảng góc nâng đã thống nhất cho bản web. Các cơ chế địa hình 2D, thể lực chung, đạo cụ, delay và nộ theo ý tưởng lối chơi Gunny cổ điển, được viết mới hoàn toàn cho bot (không sao chép mã hay bảng số liệu của máy chủ Gunny).
