# Nhân vật, Spark và tinh hồn

Ngày thiết kế: 14/10/2026. Trạng thái: **tài liệu thiết kế, chưa triển khai vào game**.

Tài liệu liên quan: [Tinh hồn của 7 nhân vật SR](sr-character-souls-design.md).

## 1. Các mốc đã chốt

| Nội dung | Quy tắc |
|---|---|
| Tiền quay | Gem |
| Một lượt | 300 gem |
| Mười lượt | 3.000 gem; không giảm giá |
| Đổi SSR | Tích lũy 200 lượt quay để quy đổi SSR |
| Roster ban đầu | 7 class hiện tại trở thành 7 nhân vật SR; SSR thiết kế sau |
| Tinh hồn | Mỗi nhân vật có 6 bậc: S1 đến S6; chưa nâng là S0 |
| Thẻ SR | Nhận trùng SR: 5 thẻ; 20 thẻ đổi một tinh hồn SR |
| Thẻ SSR | Nhận trùng SSR: 50 thẻ; 50 thẻ đổi một tinh hồn SSR |
| Sau S6 | Tiếp tục tích thẻ; không bỏ phần thưởng nhận trùng |

Các bảng có nhãn **đề xuất** bên dưới chưa phải quy tắc đã được người dùng chốt. Tỷ lệ gacha, giá đổi SR và cường hóa sau S6 chưa được xác nhận.

## 2. Mô hình Spark đề xuất

Mỗi lượt quay hợp lệ nhận **1 Spark**, độc lập với kết quả. Dùng **200 Spark** chọn một SSR trong cửa hàng. Đây là bảo đảm bằng đổi tiền tích lũy, không phải lượt thứ 200 tự động quay ra SSR.

- Spark không hết hạn; nhận SSR ngẫu nhiên không xóa Spark và không làm lại bộ đếm.
- Đổi SSR trừ đúng 200 Spark. Có 230 thì còn 30; có 400 thì đổi được hai lần.
- Chỉ cho đổi SSR đã phát hành trong cửa hàng; không đưa nhân vật chưa công bố vào danh sách.
- Đề xuất SSR thường trực đều có thể đổi. Nếu sau này có giới hạn/banners, phải công bố phạm vi Spark và lịch cửa hàng trước khi người chơi quay.
- Không bán Spark riêng. Nguồn hiện tại chỉ là quay bằng gem.
- x10 là 10 kết quả, 10 Spark. Chưa đặt bảo đảm SR/SSR riêng cho x10.
- Không có pity theo số lần trượt và không có cơ chế 50/50 bảo hiểm banner trong bản thiết kế này. Spark vẫn bảo đảm quyền chọn SSR.

Ví dụ: đã quay 199 lượt, quay thêm một lượt nhận R vẫn đủ 200 Spark để đổi SSR. Nếu lần quay đó nhận SSR, người chơi vẫn giữ 200 Spark để đổi thêm một SSR.

## 3. Nhận nhân vật và thẻ

**Đề xuất:** bản đầu tiên mở nhân vật S0, không đồng thời cho thẻ nhận trùng. Các bản tiếp theo chuyển thành thẻ theo hệ và độ hiếm. Đổi nhân vật bằng Spark dùng cùng quy tắc: chưa sở hữu thì mở S0, đã sở hữu thì nhận thẻ.

Đề xuất giữ 7 nhân vật khởi đầu ở S0 cho người chơi, để việc chuyển đổi không khóa class đang chơi. SR từ gacha khi đã có vì vậy trở thành nguồn thẻ.

| Nhóm kết quả | Vai trò | Xử lý |
|---|---|---|
| R | Vật phẩm starter | Danh sách, số lượng và cách mang vào run khai báo sau; chưa dùng pool vật phẩm trong run làm pool gacha mặc định |
| SR | 7 nhân vật khởi đầu | Lần đầu mở S0; nhận trùng cho 5 thẻ SR đúng hệ |
| SSR | Nhân vật thiết kế sau | Lần đầu mở S0; nhận trùng cho 50 thẻ SSR đúng hệ |

Một tinh hồn là **một bậc nâng cho nhân vật được chọn**, không phải mở bậc đó cho mọi nhân vật cùng hệ. Phải nâng tuần tự S0 → S1 → … → S6; trừ thẻ đúng hệ/độ hiếm. SSR không dùng thẻ SR thay thế.

### Bốn class và hệ thẻ

Class và hướng build đã chốt theo cập nhật 15/10/2026; thẻ đề xuất dùng cùng nhóm class.

| Hệ thẻ | SR hiện tại | Định hướng |
|---|---|---|
| Chiến binh | Barbarian, Druid | Ưu tiên STR |
| Sát thủ | Amazon, Assassin | Ưu tiên DEX |
| Pháp sư | Sorceress, Necromancer | Ưu tiên ENE |
| Thủ vệ | Paladin | Ưu tiên VIT / DEF |

Thẻ có khóa **hệ + độ hiếm**, không dùng chung SR/SSR. Hệ gắn cố định với nhân vật, không đổi bằng lựa chọn build. Paladin đang đứng riêng nên nguồn thẻ ít hơn các hệ hai nhân vật nếu chia đều xác suất theo nhân vật; cần bù bằng tỷ lệ hoặc sự kiện thẻ khi chốt pool. Không tự cho Paladin giá tinh hồn thấp hơn trong bản này.

Ví dụ: nhận trùng Amazon cho 5 thẻ Sát thủ SR. Tích đủ 20 có thể nâng Amazon hoặc Assassin một bậc nếu đã sở hữu. Nhận trùng một SSR Pháp sư cho 50 thẻ Pháp sư SSR, dùng nâng một SSR Pháp sư đã sở hữu.

## 4. Chi phí và các con số cần hiểu đúng

| Mốc | Chi phí theo quy tắc thẻ |
|---|---|
| SR S0 → S1 | 20 thẻ = 4 lần nhận trùng SR đúng hệ |
| SR S0 → S6 | 120 thẻ = 24 lần nhận trùng SR đúng hệ |
| SSR S0 → S1 | 50 thẻ = 1 lần nhận trùng SSR đúng hệ |
| SSR S0 → S6 | 300 thẻ = 6 lần nhận trùng SSR đúng hệ |
| Một SSR qua Spark | 200 lượt = 60.000 gem |
| SSR từ chưa sở hữu đến S6, chỉ dùng đổi Spark | 7 bản = 1.400 lượt = 420.000 gem |
| SSR đã có S0 đến S6, chỉ dùng đổi Spark | 6 bản = 1.200 lượt = 360.000 gem |

Hai dòng cuối là đường nâng bằng Spark thuần: chưa có thẻ, chỉ đổi đúng nhân vật mục tiêu, không tính SSR ngẫu nhiên/thẻ cùng hệ. Không phải giá trung bình của gacha. Dùng thẻ chung hệ giúp giảm chi phí thực tế nhưng cũng khiến nhân vật mới được nâng nhanh từ thẻ đã tích.

**Chưa chốt xác suất R/SR/SSR.** Trước khi chốt cần biết lượng gem người chơi kiếm được mỗi tuần, kích thước pool và trọng số từng nhân vật. Không thể suy ra tỷ lệ hợp lý chỉ từ giá 300 gem.

Đề xuất giai đoạn đầu: một pool thường trực, công bố xác suất từng nhóm và từng nhân vật. Khi pool lớn lên, dùng lựa chọn hệ ưu tiên hoặc banner rõ ràng; không âm thầm giảm xác suất nhân vật cũ.

## 5. Sau S6 và nâng độ hiếm

Ý tưởng trước đó: SSR S6 dùng **hai cọc 50 thẻ khác loại** để tiến SSR+ → UR → UR+ → LR → LR(+n).

**Đề xuất để triển khai sau:** chỉ dùng thẻ SSR; một cọc cùng hệ nhân vật và một cọc từ hệ khác do người chơi chọn. Thẻ SR không thay được cọc SSR. Việc nâng độ hiếm không nhân lại S1–S6, không cấp lại các hiệu ứng tinh hồn.

Giữ công thức 50 + 50 làm ý tưởng ban đầu; chưa chốt giá và lượng chỉ số của từng bậc. Nên thử nghiệm trần LR trước, hoãn LR(+n) vô hạn vì sức mạnh tăng mãi sẽ phá mục tiêu cân bằng run. Không tự gộp hệ này vào phiên bản tinh hồn SR đầu tiên.

LR nhân vật là tiến trình tài khoản, **khác với di vật LR trong run Sinh tồn**. Nâng độ hiếm nhân vật không nhận di vật, không thay luật một di vật LR hoạt động trong run. Chưa đề xuất đưa UR/LR nhân vật vào gacha trực tiếp.

## 6. Tinh hồn và run Sinh tồn

**Đề xuất:** tinh hồn là nâng cấp vĩnh viễn của nhân vật trên tài khoản. Khi bắt đầu run, lưu nhân vật, bậc S và phiên bản bộ hiệu ứng vào run; nâng tài khoản giữa run chỉ áp dụng ở run mới.

- S0 giữ nguyên cơ chế V3.1 hiện hành; S1–S6 cộng dồn theo tài liệu SR.
- Tinh hồn liên quan thức tỉnh chỉ hoạt động sau khi nhân vật đã thức tỉnh trong run, hiện từ tầng 100. Không mở thức tỉnh sớm.
- Sát thương phụ không tạo thêm tài nguyên hoặc tự kích hoạt chính nó, trừ khi từng hiệu ứng ghi rõ.
- Không xuyên các điều kiện thắng/thua boss, không miễn chi phí HP, DMG chuẩn, bẫy, phản phệ hoặc RNGesus bằng cách suy rộng né/lá chắn.
- Trần EVA, AVOID, Crit và luật hồi phục hiện tại vẫn áp dụng nếu tinh hồn không ghi một ngoại lệ cụ thể.
- Không áp dụng mặc định cho Tower mode hoặc các game khác.
- Không dùng level item nhân sức mạnh tinh hồn.

Mục tiêu cân bằng gần nhất 8–12% hoàn thành của roster V3.1 là mốc tham chiếu của S0. Cập nhật 15/10/2026: mục tiêu S6 là 30–35% hoàn thành tầng 999 cho từng nhân vật. Các bậc có thể tăng khác nhau và thay đổi cơ chế/kỹ năng/chỉ số/hệ số. Cần đo riêng S0/S3/S6, dùng cùng policy và bộ seed đối chiếu rồi xác minh bằng seed độc lập; chưa xác nhận các số tinh hồn hiện tại đạt mục tiêu.

## 7. UI Discord đề xuất

Tách ba màn hình: **Quay**, **Nhân vật**, **Đổi Spark**. Quay hiển thị giá, số gem, Spark hiện có và nút 1 lần/x10. Kết quả x10 gom R cùng loại, liệt kê SR/SSR và tổng thẻ nhận; vẫn giữ lịch sử đầy đủ từng lượt.

Màn hình nhân vật dùng selector chọn nhân vật, hiện độ hiếm, hệ, S0–S6 và thẻ hiện có/cần dùng. Mỗi bậc có mô tả trước → sau; nút nâng ghi rõ nhân vật và chi phí. Cửa hàng SSR cho chọn nhân vật, xem kết quả mở S0 hay nhận 50 thẻ trước khi xác nhận đổi.

Battle UI chỉ cần tên nhân vật kèm bậc S khi hệ thống được triển khai. Toàn bộ diễn giải tinh hồn đặt trong Chỉ số/Chi tiết nhân vật, không đổ 6 hiệu ứng vào battle UI.

## 8. Yêu cầu triển khai sau này

- Số gem, Spark, thẻ và bậc S phải được lưu bền vững, có lịch sử giao dịch và cùng cơ chế backup dữ liệu tài khoản.
- Quay x10 trừ 3.000 gem và ghi đủ 10 kết quả +10 Spark trong một giao dịch. Lỗi giữa chừng không tạo kết quả một phần hoặc trừ tiền hai lần.
- Mỗi tương tác có khóa chống thực thi trùng; bấm lại/retry không nhận thẻ hoặc SSR hai lần.
- Đổi Spark/nâng S phải kiểm tra lại số dư, sở hữu và bậc hiện tại khi ghi dữ liệu; menu cũ không vượt S6 hoặc làm số dư âm.
- Lưu phiên bản pool, xác suất thực tế, kết quả và quy đổi thẻ để đối soát; không đưa thông tin riêng tư vào changelog.
- Trước phát hành cần chốt pool R, tỷ lệ gacha, phân hệ thẻ, nguồn gem và phạm vi Spark. Kiểm thử các giao dịch và cân bằng tinh hồn rồi mới triển khai gameplay.

## 9. Phạm vi tài liệu này

Đã ghi giá gem, đổi SSR bằng Spark, quy tắc thẻ đã thảo luận và 42 bậc tinh hồn SR đề xuất. Đã bổ sung /sinhton nhanvat để xem danh mục và bản thiết kế tinh hồn; mọi người sở hữu 7 nhân vật SR ở S0. Chưa thêm lệnh gacha, kho thẻ, nâng tinh hồn hoặc thay đổi chỉ số combat. Các đề xuất có thể được chốt riêng trước khi viết code.
