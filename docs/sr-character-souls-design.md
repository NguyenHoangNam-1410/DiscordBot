# Đề xuất tinh hồn cho 7 nhân vật SR khởi đầu

Ngày thiết kế: 14/10/2026. Cập nhật: 15/10/2026. Trạng thái: **đã có danh mục /sinhton nhanvat; S1–S6 là bản thiết kế, chưa áp dụng vào combat**.

Thiết kế kinh tế: [Spark, thẻ và nhân vật](spark-tinh-hon-design.md).

## Nguyên tắc chung

Dùng Amazon, Barbarian, Assassin, Sorceress, Druid, Necromancer và Paladin làm tên nhân vật SR ban đầu. Tên riêng, chân dung và cốt truyện có thể khai báo sau; chưa tạo thêm class hoặc đổi tên class trong code.

**Mục tiêu mới đã chốt:** mỗi nhân vật ở S6 có tỷ lệ kỳ vọng hoàn thành tầng 999 **30–35%**. Mốc khoảng 11% S0 là tham chiếu simulate cũ, không phải tỷ lệ cố định của mọi nhân vật. Chưa có simulate xác minh S6.

Mỗi bậc được phép thay đổi cơ chế, kỹ năng, hiệu ứng, chỉ số hoặc hệ số; mức tăng không bắt buộc bằng nhau. Các hệ số trong 42 bậc dưới đây vẫn là bản nháp, cần hiệu chỉnh để đạt mục tiêu S6 thay vì coi là số đã cân bằng.

S0 bám phiên bản V3.1 mới nhất, với classInnateRevision = 2. Không lấy số của run cũ làm nền. Sáu bậc bên dưới **cộng dồn**; giá mỗi bậc là 20 thẻ SR đúng hệ, tổng 120 thẻ để đạt S6. Các số là điểm khởi đầu để thử nghiệm, chưa được simulate.

- S1: cải thiện nội tại đang có. S2: hỗ trợ nhịp chơi từ đầu run.
- S3: nâng cơ chế thức tỉnh. S4–S5: ổn định tài nguyên/phòng thủ.
- S6: tăng sức mạnh ở điều kiện đúng với bản sắc nhân vật; không thêm nút riêng.
- Hiệu ứng ghi “sau thức tỉnh” chỉ hoạt động sau tầng thức tỉnh hiện tại, không có từ tầng 1.
- “Mỗi combat” không được nạp lại khi đổi mục tiêu, selector miễn lượt hoặc chuyển phase. Ngoại lệ mỗi phase phải ghi riêng.
- Hit phụ không tự tạo thêm hit phụ, hút MP, tạo Focus/Shadow/Totem hoặc thưởng hạ quái. Mỗi action chỉ tính một lần cho hiệu ứng không ghi theo hit.
- Tăng từ 15% lên 18% nghĩa là thay giá trị bằng 18%, không thêm 18%. Tăng 5 điểm % ACC nghĩa 80% → 85%, rồi áp trần hiện hành.
- DMG Attack/Skill vẫn qua luật kháng, trần, hệ số đối boss và cửa sổ gây sát thương hiện hành. Không bỏ qua shield/module, cơ chế bất tử hoặc điều kiện thất bại boss.
- Hồi HP chịu giảm hồi và HP bị khóa; hồi MP không vượt Max MP. Hiệu ứng hoàn MP không được tính là MP đã trả để tạo Echo.
- Lá chắn chỉ hấp thụ những loại sát thương được cơ chế lá chắn hiện hành cho phép; không biến thành miễn nhiễm DMG chuẩn, phản phệ hoặc HP cost.

## 1. Amazon — Du kích SR

**Bản sắc:** đánh thường để chuẩn bị Barrage, duy trì nhịp bắn chính xác.

**S0:** đánh thường trúng tạo Bloodlust +15% DMG cho action Attack/Skill kế; không cộng dồn. Sau thức tỉnh, đánh thường trúng tích Focus tối đa 2; Barrage tiêu 2 để thêm một phát vật lý 70%, kiểm tra trúng/Crit riêng.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Nhịp săn | Bloodlust tăng từ 15% lên 18% DMG. |
| S2 | Mũi tên mở màn | Đánh thường đầu tiên trong mỗi combat nhận +5 điểm % ACC. Trượt vẫn dùng lượt ưu đãi này. |
| S3 | Mũi tên truy kích | Sau thức tỉnh: phát phụ do 2 Focus tăng từ 70% lên 80% sức sát thương cơ sở của phát Barrage tương ứng, giữ cùng công thức giảm trừ hiện tại. |
| S4 | Chuẩn bị săn đuổi | Sau thức tỉnh: bắt đầu mỗi combat với 1 Focus, vẫn tối đa 2; không cộng lại khi chuyển phase. |
| S5 | Tiếp tế | Đánh thường đầu tiên trúng trong mỗi combat hồi thêm 1 MP. Chỉ một lần; không áp cho các phát Barrage. |
| S6 | Loạt tên quyết định | Sau thức tỉnh: Barrage tiêu đủ 2 Focus tăng thêm 10% DMG các phát chính của chính action đó. Phát Focus dùng hệ số S3, không nhận thêm hệ số S6 lần thứ hai. |

**Giới hạn:** Focus chỉ từ đánh thường như S0; không tích từ phát phụ. Bloodlust áp một lần cho toàn action, không lũy thừa theo số hit. S6 kiểm tra đủ Focus trước khi tiêu, không được dùng liên tục bằng selector miễn lượt.

## 2. Barbarian — Chiến binh SR

**Bản sắc:** sống sót ở ngưỡng HP nguy hiểm rồi chuyển Fury thành sức mạnh.

**S0:** Iron Will tăng 25% DEF hiệu lực và miễn Crit cho phản công ngay sau đó. Sau thức tỉnh, vượt các ngưỡng HP 75/50/25% lần đầu tạo Fury, tối đa 3; mỗi điểm tăng 15% DMG Iron Will và Barrier 5% Max HP. Không farm Fury bằng hồi rồi tụt lại cùng ngưỡng.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Xương thép | DEF hiệu lực từ Iron Will tăng từ +25% lên +35% cho phản công ngay sau Skill. |
| S2 | Giữ thế | Khi dùng Phòng thủ ở HP ≤50%, nhận Barrier 3% Max HP trước phản công; một lần/combat. Không dùng cho hành động boss riêng. |
| S3 | Cuồng nộ tôi luyện | Sau thức tỉnh: bonus DMG Iron Will từ mỗi Fury tăng từ 15% lên 18%. |
| S4 | Lá chắn cuồng nộ | Sau thức tỉnh: Barrier Iron Will từ mỗi Fury tăng từ 5% lên 6% Max HP. Giữ tối đa 3 Fury. |
| S5 | Hơi thở chiến binh | Sau thức tỉnh: Iron Will tiêu từ 2 Fury trở lên hồi 1 MP sau khi xử lý Skill; một lần/combat. |
| S6 | Cơn thịnh nộ cuối | Sau thức tỉnh: Iron Will tiêu đúng 3 Fury tăng thêm 10% DMG của action đó, nhân một lần sau bonus Fury. |

**Giới hạn:** không thêm Fury mới, không đặt lại ngưỡng đã dùng. S2 không kích hoạt lại ở phase mới và không giảm HP cost. Barrier giữ luật hết khi combat kết thúc. S6 mạnh ở thời điểm hiếm, không phải buff mọi lượt.

## 3. Assassin — Du kích SR

**Bản sắc:** tận dụng né tự nhiên và Crit để tạo một Shadow Step quyết định.

**S0:** AVOID = 5% + DEX ×0,05 điểm %, trần 55%. Crit hồi 2% Max HP một lần/action. Sau thức tỉnh, Crit/né tự nhiên tạo tối đa 1 Shadow mỗi action, giữ tối đa 2; Shadow Step tiêu 2 có giá 1 MP, +20 điểm % Crit và +0,25 hệ số Crit.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Phản xạ bóng tối | AVOID cơ bản tăng từ 5% lên 7%; giữ hệ số DEX và trần 55%. |
| S2 | Vết cắt sinh lực | Hồi HP khi Crit tăng từ 2% lên 2,5% Max HP; vẫn một lần/action. |
| S3 | Sát ý chuẩn xác | Sau thức tỉnh: bonus Crit của Shadow Step dùng 2 Shadow tăng từ +20 lên +25 điểm %. Giữ trần Crit hiện hành. |
| S4 | Ẩn mình | Sau thức tỉnh: bắt đầu mỗi combat với 1 Shadow. Không nhận lại khi chuyển phase. |
| S5 | Thu hồi nhịp thở | Crit đầu tiên gây DMG thực sự trong mỗi combat hồi 1 MP; hit phụ không tính, một lần/combat. |
| S6 | Kết liễu trong bóng | Sau thức tỉnh: bonus hệ số Crit của Shadow Step dùng 2 Shadow tăng từ +0,25 lên +0,35; nếu không Crit thì không có bonus này. |

**Giới hạn:** lần né chắc chắn từ Shadow Step không tạo Shadow như né tự nhiên. S1 không bỏ trần AVOID; S3 không bảo đảm Crit nếu trần/cơ chế boss chặn. S2 tính một lần kể cả action có nhiều Crit.

## 4. Sorceress — Pháp sư SR

**Bản sắc:** quản lý MP và tận dụng Echo cho một đợt phép lớn.

**S0:** Mana Shield hấp thụ tối đa 20% Max HP ở phản công thường đủ điều kiện; 2 lần/combat, nạp đủ 2 ở mỗi phase boss. Sau thức tỉnh, trả đủ 3 MP chủ động cho Skill tạo Echo; Arcane Burst kế dùng Echo gây hit phụ 80% hit chính, 20% thêm một hit Echo 80%, đồng thời tạo Barrier 15% Max HP.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Khiên mana bền vững | Giới hạn hấp thụ mỗi lần Mana Shield tăng từ 20% lên 22% Max HP. Không tăng số lần kích hoạt. |
| S2 | Tái lưu chuyển | Lần Mana Shield đầu tiên thực sự hấp thụ DMG ở mỗi combat hồi 1 MP. Không nạp lại phần hoàn MP khi chuyển phase. |
| S3 | Dư âm mạnh mẽ | Sau thức tỉnh: hệ số mỗi hit Echo tăng từ 80% lên 90% DMG hit chính sau giảm trừ theo công thức Echo hiện tại. |
| S4 | Màn chắn cộng hưởng | Sau thức tỉnh: Barrier từ action dùng Echo tăng từ 15% lên 18% Max HP. |
| S5 | Dư âm nối tiếp | Sau thức tỉnh: xác suất có Echo phụ thứ hai tăng từ 20% lên 25%; tối đa hai hit Echo/action. |
| S6 | Bùng nổ khai màn | Sau thức tỉnh: Arcane Burst đầu tiên tiêu Echo trong mỗi combat tăng 10% DMG hit chính. Echo tính từ hit chính đã tăng; không nhân thêm 10% trên hit Echo lần thứ hai. |

**Giới hạn:** không tích Echo khi đang giữ Echo; Skill miễn phí/MP được hoàn không tạo tiến trình Echo. Mana Shield không áp cho Phòng thủ, cơ chế boss, phản phệ, bẫy và HP cost. S2 không biến số lần nạp shield theo phase thành nguồn MP vô hạn.

## 5. Druid — Thiên nhiên SR

**Bản sắc:** luân phiên hồi phục và đánh thường, dùng hồi dư chuyển thành Bark.

**S0:** Wild Regeneration tạo Mark +20% DMG cho action Attack/Skill kế. Đánh thường trúng có Mark hồi thêm 1 MP, cooldown 2 combat action; không cộng dồn Mark. Skill hồi 12% Max HP trước thức tỉnh; sau thức tỉnh hồi 10%, tạo Bark = 4% Max HP sau giảm hồi +50% HP hồi dư, trần 18% Max HP, hết khi combat kết thúc.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Dấu ấn hoang dã | Bonus DMG của Mark tăng từ 20% lên 25%. |
| S2 | Nhịp rừng đầu tiên | Đánh thường có Mark đầu tiên trúng trong mỗi combat hồi thêm 1 MP ngoài phần hồi S0 nếu phần hồi S0 đủ điều kiện. Giữ cooldown 2 action; nếu MP đã đầy vẫn dùng lượt S2, không để dành. |
| S3 | Vỏ cây cổ thụ | Sau thức tỉnh: phần Bark cơ bản tăng từ 4% lên 5% Max HP sau giảm hồi; phần chuyển hồi dư vẫn 50%. |
| S4 | Tán rừng vững chắc | Sau thức tỉnh: trần Bark tăng từ 18% lên 22% Max HP. Không vượt trần bằng hồi dư. |
| S5 | Mạch sống | Sau thức tỉnh: Wild Regeneration hồi 11% thay vì 10% Max HP. Trước thức tỉnh vẫn 12%, không cộng thành 13%. |
| S6 | Rễ bám sinh tồn | Sau thức tỉnh: lần đầu Bark đang có HP bị một phản công thường phá hết trong combat, hồi 5% Max HP nếu Druid còn sống sau toàn bộ đòn đó. Một lần/combat; không tạo thêm Bark từ phần hồi này. |

**Giới hạn:** S6 không hồi sinh, không dùng khi chủ động xóa Bark, kết thúc combat hoặc reset trạng thái; cần Bark đã thực sự hấp thụ DMG. Không kích hoạt lại qua phase. Bình/event và hồi S6 không tạo Bark. Giữ cooldown MP để tránh vừa hồi vừa Skill không giới hạn.

## 6. Necromancer — Pháp sư SR

**Bản sắc:** dựng Totem, kiểm soát nhịp phản công, xen đánh thường để dùng Anchor.

**S0:** mỗi Totem Ward +1 tiến trình Anchor; đủ 3 tạo tối đa một Anchor. Đánh thường tiêu Anchor tăng 15% DMG và né phản công; trúng hồi thêm 1 MP, trượt vẫn tiêu Anchor. Sau thức tỉnh, 2 Bone Totem tạo Grave Nova 65% hit Skill chính và hồi 1 MP.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Neo bóng tối | Bonus DMG của đánh thường tiêu Anchor tăng từ 15% lên 20%. |
| S2 | Nghi thức chuẩn bị | Bắt đầu mỗi combat với 1 tiến trình Anchor, chưa có Anchor. Không tạo Bone Totem từ tiến trình ban đầu này. |
| S3 | Chấn động mộ phần | Sau thức tỉnh: Grave Nova tăng từ 65% lên 75% DMG hit Skill chính sau giảm trừ, giữ công thức hiện hành. |
| S4 | Neo không hụt | Đánh thường dùng Anchor nhưng trượt vẫn hồi thêm 1 MP. Trúng vẫn chỉ nhận phần thêm 1 MP như S0, không thành 2 MP. |
| S5 | Sinh lực từ mộ | Sau thức tỉnh: Grave Nova đầu tiên gây DMG thực sự trong mỗi combat hồi 3% Max HP; không tính khi toàn bộ sát thương bị ngăn. |
| S6 | Nghi lễ hoàn chỉnh | Sau thức tỉnh: Grave Nova thứ hai gây DMG thực sự trong mỗi combat tăng thêm 15% DMG của riêng hit Nova đó. Một lần/combat; không tăng hit chính, không tạo Nova mới. |

**Giới hạn:** không giảm 3 Ward thành 2 cho mọi Anchor, không giảm 2 Totem thành 1. Khi đang giữ Anchor, tiến trình vẫn xử lý theo giới hạn S0; S2 không tạo thêm Anchor tồn kho. Grave Nova không Crit/hút MP/tạo Totem; S6 không đệ quy với S5.

## 7. Paladin — Chiến binh SR

**Bản sắc:** dùng Divine Shield trước đợt đánh, tận dụng DEF để gây Holy DMG.

**S0:** Divine Shield hồi 3% Max HP, tạo Vindicate +15% DMG action kế. Action được cường hóa hạ mục tiêu chính và kết thúc combat cho 20% Max HP +1 MP. Sau thức tỉnh, Consecration có hiệu lực trong 2 action gây DMG kế, tăng 20% DEF và 10 điểm % RES khi phản công; Holy mỗi hit vật lý trúng = 20% DEF + giá trị RES. Holy bỏ DEF quái thường/tinh anh, boss vẫn giảm qua DEF và hệ số class.

| Bậc | Tên đề xuất | Hiệu ứng |
|---|---|---|
| S1 | Lời thề chiến đấu | Bonus DMG của Vindicate tăng từ 15% lên 18%. |
| S2 | Ánh sáng hồi phục | Divine Shield hồi 4% thay vì 3% Max HP. Giữ giảm hồi và HP bị khóa. |
| S3 | Thánh lực tôi luyện | Sau thức tỉnh: Holy dùng 23% DEF thay vì 20%; phần giá trị RES giữ nguyên. |
| S4 | Kết giới vững vàng | Sau thức tỉnh: bonus DEF của Consecration tăng từ 20% lên 25%; bonus RES giữ +10 điểm %. |
| S5 | Phần thưởng giữ lời | Thưởng hồi HP khi action Vindicate kết thúc combat hợp lệ tăng từ 20% lên 25% Max HP; MP vẫn +1. |
| S6 | Phán quyết thánh | Sau thức tỉnh: action gây DMG đầu tiên tiêu Vindicate trong mỗi combat tăng 20% phần Holy của action đó. Không tăng lần nữa theo số hit hoặc sát thương chính. |

**Giới hạn:** hạ mục tiêu phụ hoặc chuyển phase không nhận S5. S6 cần cả Vindicate và Consecration còn hiệu lực để có Holy; nếu action không gây hit vật lý trúng vẫn dùng lượt S6. Không thêm phần DEF/RES tự buff vào nhiều lượt tính rồi nhân lũy thừa.

## Tổng hợp sức mạnh và rủi ro cần đo

| Nhân vật | Điểm mạnh tăng lên | Rủi ro chính khi thử nghiệm |
|---|---|---|
| Amazon | Chuẩn bị Barrage nhanh, loạt Focus mạnh hơn | Nhiều hit cùng nhận bonus làm burst tăng quá nhanh |
| Barbarian | DEF và Barrier tốt hơn, thưởng cho dùng 3 Fury | Trận boss dài nhiều phase; HP thấp vẫn không nên an toàn tuyệt đối |
| Assassin | Né/Crit ổn định hơn, Shadow Step Crit mạnh hơn | AVOID kết hợp EVA và hồi Crit khiến xác suất sống sót tăng phi tuyến |
| Sorceress | Echo mạnh hơn, Barrier và MP đầu trận | Echo lấy hit chính làm nền; các bonus phải nhân đúng một lần |
| Druid | Mark mạnh, Bark cao, một lần cứu nhịp hồi | Hồi dư, trần Bark và hoàn MP tạo chu kỳ không mất HP |
| Necromancer | Anchor/Nova mạnh, mở combat nhanh hơn | Ward chặn phản công nên không được cấp MP/tài nguyên vô hạn |
| Paladin | Holy/DEF và hồi cuối trận tốt hơn | Holy bỏ DEF thường/tinh anh; buff mạnh ở boss không nên xóa mọi quái khác |

S6 không có cùng phần trăm tăng sức mạnh ở tất cả class vì phòng thủ, né, hồi phục và sát thương có giá trị khác nhau. Không dùng cộng tổng các tỷ lệ để kết luận cân bằng.

## Kế hoạch xác minh trước khi đưa vào game

1. Chốt bảng tinh hồn và phân hệ thẻ với người dùng. Giữ riêng các thông số có thể cân bằng sau này.
2. Kiểm tra S0 không đổi, nâng tuần tự, snapshot run và run cũ không tự nhận tinh hồn mới.
3. Kiểm tra từng bậc trong tình huống trượt, Crit, nhiều hit, HP/MP đầy, HP khóa, giảm hồi, nhiều phase, mục tiêu phụ, boss miễn sát thương và DMG chuẩn.
4. Đo S0/S3/S6 của từng class với cùng policy/seed và một bộ seed xác minh độc lập. Tách báo cáo tầng <100 và sau thức tỉnh, boss thường/cuối khu vực, thời lượng run và tỷ lệ chết theo nguyên nhân.
5. Kiểm tra vài build item mạnh và LR như Astral Singularity: Skill miễn phí không tạo Echo, không làm các hiệu ứng hoàn MP nhân đôi; tinh hồn không đổi luật di vật.
6. Ưu tiên kiểm tra vòng hồi/MP/Bark của Druid; kế tiếp Necromancer và AVOID của Assassin. Nếu vượt mục tiêu, giảm hệ số trước khi thay bản sắc class.

**Đã triển khai danh mục xem nhân vật:** lọc độ hiếm/class, chọn nhân vật và xem ba tab Chỉ số, Kỹ năng, Tinh hồn. Mỗi người có quyền sở hữu mặc định cả 7 nhân vật khởi đầu ở S0. Nhân vật có ID riêng và class riêng để bổ sung nhiều nhân vật cùng class sau này. Chưa mở nâng tinh hồn hoặc gacha; chưa áp dụng 42 hiệu ứng vào combat và chưa chạy simulate S6.

Nguồn bản thiết kế hiển thị: src/hardcore/characters/catalog.json. Chỉ số S0 được dựng từ luật game hiện hành, không sao chép thủ công từ tài liệu. S1–S6 chỉ hiển thị mô tả, không tính ra chỉ số giả cho những cấp chưa được triển khai.
