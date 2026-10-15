# Nhân vật, Spark và tinh hồn

Ngày thiết kế: 14/10/2026. Cập nhật: 15/10/2026.

**Đã triển khai:** banner tân thủ trong /sinhton gacha, kho vé/thẻ/nhân vật, nâng tinh hồn SR và snapshot chiến đấu. **Chưa phát hành:** banner dùng gem, nhân vật SSR, cửa hàng đổi Spark và giao dịch nâng độ hiếm.

Chi tiết 42 hiệu ứng: [Tinh hồn 7 nhân vật SR](sr-character-souls-design.md). [Kết quả hiệu chỉnh S6](releases/hardcore-souls-2026-10-15.md).

Bản thiết kế SSR đầu tiên: [Venance — Pháp sư](venance-ssr-character-design.md), chưa phát hành vào banner hoặc chiến đấu.

## Banner Khởi Hành

- Lần đầu mở **/sinhton gacha**, tài khoản Discord nhận đúng **30 vé tân thủ**. Đọc /sinhton nhanvat không nhận vé.
- Cấp một lần trên toàn bot theo user ID; mở lại lệnh, restart, đổi server hoặc dùng hết vé không cấp thêm. Mỗi vé dùng một lượt; có nút x1/x10. Banner này chỉ dùng vé, không tự chuyển sang trừ gem khi hết vé.
- **R 80% / SR 20%**, đã được người dùng chọn. Không có SSR trong banner hiện tại. Các kết quả độc lập, không pity hoặc bảo đảm SR ở x10.
- Nhóm R là trang bị R có thể gacha trong catalog Sinh tồn V3 hiện hành; chia đều giữa các món. Mỗi kết quả nhận một bản, đưa vào Túi Sinh tồn của server đang quay để chọn mang vào run mới. Không cấp thẳng vào run đang chơi.
- Nhóm SR gồm Amazon, Barbarian, Assassin, Sorceress, Druid, Necromancer, Paladin; chia đều giữa 7 nhân vật, mỗi người khoảng 2,9%/lượt trên tổng pool. Tỷ lệ chính xác là 20% / 7; UI làm tròn một chữ số.
- Người chơi vẫn sở hữu sẵn cả 7 SR ở S0. Vì vậy nhận SR hiện tại đổi thành **5 thẻ SR cùng class**. Không tự tăng cấp tinh hồn.
- Vé tân thủ hiện **không cộng Spark**, theo phương án đề xuất mặc định; đây là quy tắc riêng có thể cấu hình theo banner.

Ví dụ: nhận trùng Barbarian cho 5 thẻ Chiến binh SR; có thể tích để nâng Barbarian hoặc Druid.

## Class, thẻ và nâng tinh hồn

| Class | Nhân vật khởi đầu | Định hướng |
|---|---|---|
| Chiến binh | Barbarian, Druid | STR |
| Thủ vệ | Paladin | VIT / DEF |
| Sát thủ | Amazon, Assassin | DEX |
| Pháp sư | Sorceress, Necromancer | ENE |

| Nội dung | SR | SSR khi được phát hành |
|---|---:|---:|
| Nhận trùng một bản | 5 thẻ | 50 thẻ |
| Một bậc tinh hồn | 20 thẻ | 50 thẻ |
| S0 → S6 | 120 thẻ | 300 thẻ |

Thẻ có khóa **class + độ hiếm gốc**. Thẻ SR và SSR tách biệt; không đổi class theo build. Nâng từng nhân vật theo thứ tự S0 → S1 → … → S6, không nâng toàn bộ class cùng lúc. Bản đầu tiên của nhân vật chưa sở hữu mở S0, không đồng thời cho thẻ; bản tiếp theo cho thẻ.

Trong **/sinhton nhanvat**, chọn nhân vật để xem số thẻ, giá và nút nâng cấp kế tiếp. Giữ toàn bộ mô tả S1–S6, đánh dấu bậc đã mở. Nút nâng chỉ tiêu đúng một bậc với giá hiển thị; menu cũ, retry và bấm lặp không thể trừ thẻ/nâng hai lần.

Cấp tinh hồn và thông số được snapshot khi bắt đầu run mới. Nâng tài khoản giữa run không thay run đang chơi. Preview trước khi bắt đầu dùng cấp của tài khoản hiện tại. Tower giữ cơ chế riêng.

Sau S6 vẫn tích thẻ; không xóa hoặc tự tiêu. Thẻ dùng được cho nhân vật khác cùng class và cùng độ hiếm gốc. Nếu tất cả nhân vật phù hợp đã tối đa, tiếp tục giữ thẻ cho nhân vật bổ sung sau này; chưa có quy đổi khác.

## Hệ độ hiếm đã điều chỉnh

7 nhân vật khởi đầu tiếp tục là **SR**. Lộ trình nâng cho nhân vật SSR sau này chỉ còn:

**SSR → UR → LR → dừng.**

Bỏ SSR+, UR+ và LR(+n). LR không có bước nâng tiếp theo; nhận trùng vẫn cho thẻ theo độ hiếm gốc để dùng cho nhân vật khác cùng class. Tinh hồn giữ trần S6, không mở S7 và không áp lại S1–S6 mỗi lần đổi độ hiếm.

Giá thẻ và mức sức mạnh khi nâng SSR → UR hoặc UR → LR chưa được khai báo. Vì chưa có SSR, chưa mở giao dịch nâng độ hiếm hoặc tự phát minh chỉ số cho các bậc này. Enum, ràng buộc dữ liệu và lộ trình trong code đã loại bỏ các bậc trung gian/vô hạn.

LR nhân vật là tiến trình tài khoản, khác di vật LR trong run. Nâng độ hiếm không cấp di vật hoặc thay luật một di vật hoạt động mỗi run.

## Banner dùng gem và Spark sau này

Giữ các mốc đã chốt cho giai đoạn phát hành SSR:

| Nội dung | Quy tắc |
|---|---|
| Một lượt | 300 gem |
| Mười lượt | 3.000 gem; không giảm giá |
| Spark | Mỗi lượt hợp lệ của banner có Spark nhận 1 Spark |
| Đổi SSR | 200 Spark chọn một SSR đã phát hành trong cửa hàng tương ứng |

Spark là tiền quy đổi, không phải pity tự ra SSR ở lượt 200. Nhận SSR ngẫu nhiên không xóa Spark. Không bán Spark riêng. Phạm vi Spark, pool và xác suất phải công khai trước khi mở từng banner; cấu hình có mã ví Spark riêng để không gộp nhầm giữa các loại banner.

Hiện không mở banner trả gem hoặc cửa hàng SSR rỗng. Nền giao dịch đã hỗ trợ giá 300 gem/lượt, x10 đủ 3.000 gem và ví Spark riêng theo cấu hình; đã kiểm thử bằng banner giả trong test, không đưa SSR giả vào pool thật. Tỷ lệ trả gem R/SR/SSR sẽ khai báo khi có roster SSR.

## Dữ liệu và hướng mở rộng

Vé, thẻ và sở hữu/tinh hồn là tiến trình toàn tài khoản Discord. Item R và số dư gem/xu vẫn theo server hiện hành. Nếu mở banner trả gem sau này, gem trừ từ server đang quay, còn nhân vật/thẻ thuộc tài khoản Discord; cần công khai điều này khi phát hành.

Mỗi banner có ID ổn định, version, tên, trạng thái, loại thanh toán, giá một lượt, ví Spark và nhóm pool có trọng số. Mỗi pool có danh sách nhân vật cụ thể, không âm thầm tự thêm nhân vật mới rồi giảm tỷ lệ nhân vật cũ. Trong nhóm nhân vật hoặc R, các phần tử hiện được chia đều.

Đổi nội dung pool/tỷ lệ/giá cần tăng version. UI giữ banner/version và revision tài khoản, chặn nút cũ khi số dư hoặc cấu hình đã đổi. Bổ sung banner độc lập qua registry, không dùng chung vé tân thủ cho loại banner mới nếu chưa được khai báo.

| Thành phần | Nguồn |
|---|---|
| Danh mục/4 class/độ hiếm | src/hardcore/characters/index.js và catalog.json |
| Tài khoản, thẻ, nâng tinh hồn | src/hardcore/characters/progression.js |
| Schema SQLite | src/hardcore/characters/schema.js, migration 44 |
| Khai báo banner và xác suất | src/hardcore/gacha/banners.json |
| Kiểm tra pool và lấy mẫu | src/hardcore/gacha/banners.js |
| Cấp vé, quay, lịch sử | src/hardcore/gacha/service.js |
| UI banner | src/hardcore/gacha/ui.js |
| UI nhân vật | src/hardcore/ui/characters.js |
| Kiểm thử | scripts/test-hardcore-gacha.js |

Toàn bộ cấp vé, trừ tiền/vé, trao item/thẻ, Spark, kết quả và lịch sử đều nằm trong transaction SQLite. Mỗi interaction có operation ID; retry phát lại đúng kết quả đã lưu, không roll lại. Revision chặn hai lượt khác nhau đồng thời sử dụng một màn hình cũ.

Lịch sử lưu banner/version, snapshot toàn pool và xác suất, chi phí, từng kết quả, quy đổi thẻ và operation ID. Các bảng nằm trong cùng database đang backup của bot; không dùng bộ nhớ tiến trình để giữ số dư lâu dài.


## Xác minh triển khai

- 17 nhóm kiểm thử gacha: cấp vé một lần, ngưỡng 80/20, x10 nguyên tử, rollback khi lỗi, retry/stale, kho item R → loadout thật, thẻ và trần S6, snapshot run, SSR/banner trả gem giả trong test, backup SQLite, lệnh và UI Discord.
- Kiểm thử tinh hồn (13 nhóm), danh mục Nhân vật, cold import/module boundaries, Tower runtime, backup/restore và audit command đã qua. Không chạy lại simulate Sinh tồn trong thay đổi gacha.
- Test cũ scripts/test-hardcore-loadout.js lỗi ở dòng 98 khi alias item cũ không có product. Đã tái hiện cùng lỗi khi dùng toàn bộ phiên bản HEAD của các module JavaScript bị sửa, nên đây là lỗi có sẵn. Chưa sửa catalog/alias ngoài phạm vi gacha.
