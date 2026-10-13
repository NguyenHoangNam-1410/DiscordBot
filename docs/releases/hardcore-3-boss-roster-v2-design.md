# Sinh tồn V2 — full rework 39 boss và roster xoay tua

> Trạng thái: **tài liệu thiết kế, chưa triển khai code**\
> Ngày: 2026-10-12 (UTC+7)\
> Phạm vi: mode Sinh tồn 999 tầng. Tháp Định Mệnh giữ nguyên.

## 1. Mục tiêu

- Rework toàn bộ **19 boss thường hiện tại** và bổ sung **20 boss mới**, tạo pool 39 boss.
- Boss tại các tầng `50, 100, 150, ..., 950` không còn gắn cố định với một tên.
- Giữ cố định ba mốc cốt truyện:
  - **333:** Threefold Prophecy, chọn War / Protection / Arcane.
  - **666:** Kabraxis, dùng ấn đã chọn ở tầng 333.
  - **999:** Deimoss, ba phase với ba thanh HP riêng.
- Cả 39 boss thường đều có thể xuất hiện tại **mọi mốc 50 tầng**. Cùng một boss có thể là phiên bản yếu ở tầng thấp và trở lại mạnh hơn ở tầng cao.
- Không thể reroll boss bằng cách mở lại giao diện hoặc dùng `/sinhton tieptuc`.
- Độ khó của boss lấy từ tầng xuất hiện, không bị khóa theo tên hoặc vị trí cũ trong roster.

## 2. Hiện trạng

Roster hiện tại có 21 boss/event boss:

- 19 boss cố định tại các mốc 50 tầng từ 50 đến 950.
- Kabraxis tại 666.
- Deimoss tại 999.
- Tầng 333 là event Threefold Prophecy, không phải boss combat.

Sau thay đổi, 19 boss thường hiện tại vẫn được giữ lại và đưa vào pool xoay tua. Tổng pool boss thường sẽ là **39 boss**: 19 boss hiện tại + 20 boss mới.

## 3. Luật xoay tua

### 3.1. Một pool chung cho mọi mốc

- Các tầng `50, 100, 150, ..., 950` đều roll từ **cùng một pool 39 boss**.
- Không có boss đầu game, trung game hoặc cuối game cố định.
- Nithogur, Samael hoặc bất kỳ boss nào cũng có thể xuất hiện ở tầng 50.
- The Butcher, Gharbad hoặc bất kỳ boss nào cũng có thể xuất hiện ở tầng 950.
- Mỗi mốc boss roll độc lập từ đủ 39 boss. Boss có thể lặp lại, kể cả ở hai mốc liên tiếp; lần xuất hiện sau mạnh hơn theo tầng mới.
- Tầng 333, 666 và 999 không thực hiện roll từ pool này.

### 3.2. Chốt boss

1. Khi người chơi **bước vào một tầng boss**, engine lấy toàn bộ 39 boss thường.
2. Chọn đúng một boss bằng RNG của lượt xử lý hợp lệ, với xác suất ngang nhau.
3. Lưu ngay `bossId`, phiên bản roster và trạng thái mở đầu trong session trước khi gửi giao diện.
4. Mọi lần render, mở lại session hoặc `/sinhton tieptuc` phải dùng boss đã lưu.

Không chọn trước toàn bộ 19 boss để người chơi không thể đọc hoặc đoán roster tương lai từ state/UI. `bossHistory` chỉ lưu thứ tự boss đã gặp để thống kê, không tác động lần roll kế tiếp.

### 3.3. Chống reroll và abuse

- Mở lại bảng, bấm nút cũ, interaction timeout và restart bot không gọi RNG lần nữa.
- Hai interaction đồng thời dùng kiểm tra phiên bản lượt hiện hành; chỉ transaction đầu tiên được chấp nhận.
- Boss được chốt trước khi giao diện đầu tiên xuất hiện.
- Bỏ run và tạo run mới vẫn mất cược theo luật hiện hành. Đây được xem là run mới và được phép có roster mới.
- Boss được phép lặp ở mốc kế tiếp. Đây là kết quả hợp lệ, không phải lỗi và không được reroll.
- Run V2 đang tồn tại trước bản cập nhật giữ `bossRosterVersion: 1` cho đến khi kết thúc. Chỉ run mới dùng roster xoay tua để tránh đổi boss giữa hành trình.

## 4. Rework 19 boss hiện tại

Các cơ chế cũ kiểu “Phòng thủ đúng lượt”, “Skill xóa stack” hoặc “không lặp hành động” không còn là toàn bộ trận. Mỗi boss giữ chủ đề cũ nhưng có thêm một quyết định riêng. Kabraxis và Deimoss được trình bày tại phần mốc cố định vì không nằm trong pool 39 boss.

### 4.1. Boss hiện tại 1–10

| Boss                      | Damage  | Cơ chế rework                                                                                                                                                                                                    | Component riêng và quyết định chính                                                                                                                                                                               |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Butcher**           | Vật lý  | **The Hunt:** đấu trường có khoảng cách 0–2. Butcher tự tiến một ô sau mỗi lượt và Meat Hook kéo người chơi lại. Ở khoảng cách 0, cả hai phía gây thêm damage và Butcher tích Bloodlust.                         | Hai nút **Lùi một ô** và **Chặt xích Hook**. Lùi giữ an toàn nhưng mất lượt gây damage; chặt xích tốn HP hiện tại nhưng vô hiệu lần kéo kế. Người chơi chủ động chọn kite hay đánh giáp lá cà.                    |
| **Infernal Machine**      | Phép    | **Reactor Heat:** mọi hit làm tăng nhiệt lò. Từ 70–99, giáp lò mở và boss nhận thêm damage; đạt 100 gây Meltdown lên cả hai rồi reset.                                                                           | Nút **Xả nhiệt** giảm nhiệt nhưng cho boss hồi Shield và nút **Quá tải** đẩy nhiệt lên nhanh, đổi rủi ro lấy burst. Mục tiêu là giữ nhiệt trong vùng có lợi hoặc chủ động kích nổ khi mình đủ HP.                 |
| **Assur**                 | Phép    | **Rune of Damnation:** Assur có một rune bất tử. Ba Flame Sigil xuất hiện theo vòng; chỉ Sigil mang dấu Purify thật mới nạp Purify Charge, hai Sigil còn lại gây bẫy. Manh mối nằm trong thứ tự màu đã hiển thị. | Ba nút **Chạm Sigil 1/2/3**. Đủ ba charge mở nút **Purify**, tắt rune và tạo cửa sổ damage. Chọn sai không reset toàn bộ tiến trình nhưng nhận Flamefront.                                                        |
| **Master Control System** | Phép    | **Plasma Frequency:** Shield đổi giữa ba tần số. Sau mỗi đòn trúng, hệ thống cung cấp một manh mối loại trừ; nhập đúng tần số làm Shield sập hai lượt, nhập sai triển khai minefield.                            | Ba nút tần số **Alpha/Beta/Gamma**. Đây là bài suy luận ngắn; damage gây lúc Shield hoạt động vẫn được ghi làm dữ liệu nhưng không thể kết liễu boss.                                                             |
| **Necrobot Alpha**        | Hỗn hợp | **Modular Body:** có ba module độc lập: Plating giảm vật lý, Barrier giảm phép, Weapon tăng phản công. Phá một module tăng công suất hai module còn lại.                                                         | Menu **Chọn module**. Người chơi quyết định mở loại damage chính trước, giảm nguy hiểm trước hoặc giữ cân bằng; Core chỉ lộ sau khi phá hai module.                                                               |
| **Quov Tsin**             | Phép    | **Elemental Convergence:** Quov chuẩn bị Fire, Cold hoặc Lightning và có thể trộn hai nguyên tố ở Depth cao. Người chơi chỉ duy trì được một Ward chủ động.                                                      | Ba nút **Ward Lửa/Lạnh/Sét**. Đúng Ward giảm mạnh đòn đó và nạp một Absorb; ba Absorb khác nhau tạo **Prismatic Break**, hạ RES boss. Không cần spam Phòng thủ để xóa Mythal.                                     |
| **Lucion**                | Phép    | **Brain Control:** Malic trở thành đơn vị thứ ba với thanh Will. Lucion phát một mệnh lệnh; người chơi chọn cách điều khiển Malic để chống, giả vờ tuân lệnh hoặc phản bội.                                      | Ba nút **Chống lệnh/Giả vờ/Phản bội** có quan hệ khắc chế với ý định Lucion được báo bằng manh mối. Chọn đúng tăng Will; đầy Will khiến Malic đánh vỡ Scales. Chọn sai làm Malic đánh người chơi hoặc hồi Lucion. |
| **Bul-Kathos**            | Vật lý  | **Weapon Clash:** boss dùng ba thế High Cleave, Low Sweep và Feint theo chuỗi có thể đọc. Người chơi chọn thế đối kháng; thắng Clash gây stagger, hòa đổi damage, thua bị CRIT.                                  | Ba nút **Đỡ cao/Đỡ thấp/Không mắc lừa**. Không dùng RNG sau khi thế boss đã hiển thị. Tấn công/Skill trong lúc boss stagger được tự do và không tạo chuỗi phạt cũ.                                                |
| **Spirit of Giyua**       | Phép    | **Spirit Nests:** mỗi Nest có thể bị phá, phong ấn hoặc khai thác. Phá giảm damage boss; phong ấn chậm Nest mới; khai thác hồi HP/MP nhưng làm Nest tiến hóa nếu thất bại ở lượt sau.                            | Menu **Xử lý Nest** với ba lựa chọn. Tấn công thường không còn tự động mất lượt chỉ để phá một Nest. Mỗi lựa chọn tạo hướng quản lý tài nguyên khác nhau.                                                         |
| **Ascendant Riftwalker**  | Hỗn hợp | **Rift Echo:** mỗi hành động combat được Rift ghi lại và lặp lại sau ba lượt: damage của người chơi biến thành shockwave lên cả hai, Bình tạo vùng hồi cho boss, Phòng thủ tạo Shield cho boss.                  | Timeline ba ô hiển thị các Echo sắp đến. Nút **Bẻ Rift** tốn một phần Max HP để xóa một Echo đã chọn. Người chơi phải lên lịch hành động thay vì chờ boss biến mất.                                               |

### 4.2. Boss hiện tại 11–19

| Boss                      | Damage  | Cơ chế rework                                                                                                                                                                                                                   | Component riêng và quyết định chính                                                                                                                                                                       |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gharbad the Weak**      | Vật lý  | **False Surrender:** Gharbad đưa ra lời đầu hàng cùng một trong vài dấu hiệu hình ảnh/ngôn từ. Quy luật thật–giả nhất quán trong cả trận nhưng thay đổi giữa các run.                                                           | Ba nút **Chấp nhận/Khám xét/Tấn công**. Chấp nhận đúng hồi tài nguyên, khám xét đúng lấy buff, đánh khi đầu hàng giả ngắt phản kích. Chọn sai có hậu quả khác nhau; kết quả được khóa trước khi hiển thị. |
| **Phoboss**               | Phép    | **Lucid Nightmare:** Dream Depth 0–5 tăng đồng thời damage hai phía. Người chơi có thể ở sâu để kết thúc nhanh hoặc thức tỉnh để hạ Depth; ở Depth cao xuất hiện Nightmare Rule tạm thời.                                       | Nút **Thức tỉnh** tiêu một phần HP hiện tại, giảm Depth hai bậc. Skill không còn tự động xóa toàn bộ Nightmare. UI báo rõ lợi ích damage và luật của Depth hiện tại.                                      |
| **Unstable Anomaly**      | Hỗn hợp | **Matter/Energy/Void Core:** ba dạng vẫn luân chuyển nhưng người chơi phải thu một Core Shard ở từng dạng. Chọn ổn định sai dạng làm Anomaly nhảy dạng và phản nổ.                                                              | Ba nút **Ổn định Matter/Energy/Void**. Thu đủ ba shard mở Overload và xóa toàn bộ phòng thủ boss trong hai lượt. Việc chọn thời điểm ổn định quan trọng hơn chỉ đổi Attack/Skill theo RES/DEF.            |
| **Zakarum Avatar**        | Phép    | **Divine Halo:** Halo tách thành Might, Sanctuary và Haste. Cướp một mảnh làm boss mất buff tương ứng nhưng trao cho boss hai buff còn lại trong hai lượt; người chơi nhận phiên bản yếu của mảnh đã cướp.                      | Menu **Cướp Halo**. Người chơi chọn giảm damage, giảm hồi phục hay giảm tốc độ Shield dựa trên build và trạng thái hiện tại.                                                                              |
| **The Justicar**          | Hỗn hợp | **Court of Angiris:** mỗi ba lượt người chơi phải chọn một phán quyết áp dụng cho cả hai bên: Steel tăng vật lý, Arcane tăng phép, Silence khóa Skill nhưng giảm damage boss.                                                   | Ba nút **Steel/Arcane/Silence**. Lựa chọn vừa buff người chơi vừa thay đổi boss; phán quyết được công bố trước ba lượt và không random lại khi resume.                                                    |
| **Uldyssian the Tainted** | Hỗn hợp | **Corrupted Memory:** boss ghi bốn hành động gần nhất rồi tạo Clone dựa trên hành động xuất hiện nhiều nhất. Clone Tấn công, Skill, Phòng thủ hoặc Bình có hiệu ứng khác nhau.                                                  | Nút **Viết lại ký ức** tốn 1 MP để thay đúng một ô trong timeline bằng “trống”. Người chơi có thể cố tình gieo loại Clone dễ xử lý thay vì đơn giản tránh lặp.                                            |
| **Archbishop Lazarus**    | Phép    | **Black Hand Totems:** ba Totem tồn tại: Restoration hồi boss, Tremor gây damage chuẩn định kỳ, Drain hút MP. Lazarus hồi sinh Totem bị phá gần nhất sau một chu kỳ.                                                            | Menu **Chọn Totem/Boss**. Người chơi phải kiểm soát Totem nguy hiểm cho build rồi tận dụng khoảng trống để đánh Lazarus; không còn một Totem bất tử chỉ hồi 8% mỗi vòng.                                  |
| **Xazax**                 | Phép    | **Hell Portal Network:** Portal mới có thể được đóng an toàn, chiếm quyền để dùng làm đòn đánh xuyên RES, hoặc bước vào để bỏ qua phản công nhưng nhận một curse tạm thời.                                                      | Menu **Đóng/Chiếm/Bước vào Portal**. Portal giữ lại làm tăng sức mạnh boss; xử lý Portal tạo lựa chọn chiến thuật thay vì Skill tự động đóng một cổng.                                                    |
| **Samael**                | Hỗn hợp | **Living Pentagram:** năm điểm Pentagram sáng dần. Mỗi điểm có thể bị dập bằng MP, bị cướp bằng cách nhận damage chuẩn để lấy buff, hoặc bỏ mặc. Đủ năm điểm sáng kích hoạt Pentagram nhưng không chết tức thì nếu đã chuẩn bị. | Hai nút **Dập ấn** và **Cướp ấn** khi một điểm sáng. Người chơi phân phối MP, HP và buff trong cả trận; không còn chu kỳ cố định chỉ bấm Phòng thủ mỗi lượt thứ tư.                                       |

## 5. Hai mươi boss mới — mechanic đa dạng

Tấn công, Skill, Phòng thủ và Bình máu vẫn là bộ nút combat chung, nhưng không còn là toàn bộ lời giải. Mỗi boss mới được phép thêm tối đa **ba component tạm thời** như chọn mục tiêu, đổi vị trí hoặc kích hoạt vật thể. Component chỉ xuất hiện trong trận đó và trạng thái phải được lưu để resume chính xác.

### 5.1. Các dạng tương tác

| Dạng             | Boss tiêu biểu                               | Người chơi phải quyết định                                 |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Vị trí           | Death Projector, Greater Riftwalker, Athulua | Đứng ở đâu và khi nào đổi vị trí.                          |
| Chọn mục tiêu    | Akarat, Manoruk, Belial, Astrogha            | Đánh mục tiêu nào trước; thứ tự tạo hậu quả khác nhau.     |
| Đổi tài nguyên   | Lilith, Azmodan, Baal                        | Dùng HP, MP hoặc bình để đổi lấy cửa sổ có lợi.            |
| Ghi nhớ/quy luật | Jitan, Nemesis, Sescheron's Destroyer        | Đọc chuỗi, tránh lặp hoặc nhập đúng ký hiệu.               |
| Điều khiển trận  | Buyard, Juris Khan, Inarius                  | Thay đổi khu vực, khoảng cách hoặc vị trí NPC.             |
| Công cụ giới hạn | Dark Star Dragon, Atanna Khan, Nithogur      | Phân bổ số lần dùng Cover, sửa giấc mơ hoặc tua thời gian. |

### 5.2. Boss mới 1–10

| Boss                          | Damage  | Mechanic mới                                                                                                                                                                            | Component riêng và quyết định chính                                                                                                                                           |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Death Projector**           | Phép    | **Rotating Beam:** đấu trường có ba khu A/B/C. Tia quay theo thứ tự công khai và bắn vào một khu mỗi lượt.                                                                              | Ba nút **Sang A/B/C**. Di chuyển tiêu thụ lượt nhưng không nhận phản công thường; đứng sai khu chịu Beam. Người chơi phải quyết định tiếp tục gây damage hay bỏ lượt để chạy. |
| **Akarat, the False Prophet** | Phép    | **Three Apostles:** Mercy hồi máu, Wrath tăng damage, Faith tạo Shield. Akarat bất tử cho tới khi cả ba bị hạ. Thứ tự chết quyết định buff cuối của Akarat.                             | Menu **Chọn mục tiêu**. Không có thứ tự tốt tuyệt đối: giết Mercy trước giảm hồi phục, Wrath trước giảm nguy hiểm, Faith trước mở damage nhanh hơn.                           |
| **Buyard Cholik**             | Phép    | **Circle of Fire:** vòng lửa có thanh nhiệt 0–100. Dưới 40 boss có Shield; 40–70 boss lộ điểm yếu; trên 70 cả hai bên bị thiêu.                                                         | Hai nút **Thu hẹp vòng** và **Mở rộng vòng** thay đổi nhiệt theo lượng cố định. Người chơi giữ boss trong vùng 40–70 thay vì chỉ chờ rồi Phòng thủ.                           |
| **Bartuc, Warlord of Blood**  | Hỗn hợp | **Blood Tether:** một phần damage lên Bartuc chuyển sang Blood Golem. Liên kết càng lâu, Golem càng mạnh nhưng lượng damage đã chuyển được giữ lại trên nó.                             | Nút **Cắt liên kết** tốn một phần HP hiện tại, khiến Bartuc lộ giáp hai lượt. Người chơi chọn cắt sớm để an toàn hoặc nuôi Golem rồi burst cả hai.                            |
| **Lord Aldric Jitan**         | Vật lý  | **Fortress Runes:** ba cổng mang ký hiệu khác nhau; mỗi chu kỳ chỉ một cổng yếu theo quy luật hiển thị từ hai lượt trước. Chọn sai sinh Guard Tower.                                    | Ba nút rune/cổng. Đây là bài đọc quy luật ngắn; Tấn công/Skill chỉ gây damage sau khi chọn đúng cổng. Kết quả rune được khóa khi chu kỳ bắt đầu.                              |
| **Greater Riftwalker**        | Hỗn hợp | **Inside/Outside the Storm:** bão xanh an toàn khi đứng gần, bão đỏ an toàn khi đứng xa. Màu kế tiếp được báo trước.                                                                    | Nút **Đổi vị trí Gần/Xa**. Đổi vị trí tiêu thụ lượt; người chơi phải căn thời điểm thay vì mặc định Phòng thủ mỗi khi bão đến.                                                |
| **Athulua**                   | Vật lý  | **Hunter's Mark:** Athulua khóa một trong ba hướng. Sau mỗi đòn của người chơi, vùng khóa dịch theo mũi tên đã hiển thị. Đứng đúng vùng bị Guided Arrow, đứng sát Athulua chịu Tantrum. | Ba nút vị trí **Trái/Giữa/Phải**; mỗi vùng có rủi ro khác nhau. Sky Siege phá một vùng trong hai lượt, buộc người chơi thay đổi đường chạy.                                   |
| **Lilith**                    | Hỗn hợp | **Blood Bargain:** người chơi chủ động hiến 5%, 10% hoặc 20% Max HP để mở tương ứng 1/2/3 lượt boss nhận thêm damage. Không hiến vẫn đánh được nhưng chậm.                              | Menu **Hiến máu**. HP đã hiến không thể hồi trong lúc Bargain còn hiệu lực. Đây là lựa chọn risk/reward, không phải lượt phòng thủ bắt buộc.                                  |
| **Nemesis**                   | Hỗn hợp | **Mirror Arsenal:** Nemesis ghi lại hai hành động gần nhất. Lặp lại chuỗi đúng thứ tự khiến boss sao chép damage và khóa hành động đầu chuỗi trong hai lượt.                            | Không thêm nút. Người chơi tự tạo combo Tấn công/Skill/Phòng thủ/Bình khác nhau; UI hiển thị hai hành động đang bị ghi nhớ.                                                   |
| **Azmodan**                   | Phép    | **Fireblood Mark:** dấu ấn có ba nhịp trước khi nổ. Người chơi có thể để nổ, dùng MP phản dấu sang boss hoặc dùng một bình để dập lửa.                                                  | Hai nút **Phản ấn −1 MP** và **Dập lửa −1 bình**. Phản ấn làm boss nhận explosion; dập lửa an toàn; để nổ giữ tài nguyên nhưng mất HP.                                        |

### 5.3. Boss mới 11–20

| Boss                          | Damage  | Mechanic mới                                                                                                                                                                                    | Component riêng và quyết định chính                                                                                                                                       |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dark Star Dragon**          | Phép    | **Death Beam & Cover:** đấu trường có ba trụ che chắn, mỗi trụ có độ bền giới hạn. Beam phá một lần bền của trụ đang dùng.                                                                      | Ba nút **Nấp trụ 1/2/3** khi Beam sạc. Người chơi phân bổ số lần trú hữu hạn; dùng hết quá sớm sẽ phải chịu Beam cuối trận.                                               |
| **Juris Khan**                | Phép    | **Bridge of Ureh:** người chơi ở vị trí 0–3 trên cầu. Tiến gần tăng damage gây ra và damage nhận; lùi xa giảm cả hai. Linh hồn dồn từ phía sau, ngăn đứng yên quá lâu.                          | Hai nút **Tiến** và **Lùi**. Người chơi tự chọn nhịp tiếp cận boss; tới vị trí 3 mở burst nhưng không thể lùi quá một ô mỗi lượt.                                         |
| **Manoruk**                   | Phép    | **Legion Formation:** mỗi wave có Commander, Ritualist và Vanguard. Giết một đơn vị thay đổi hai đơn vị còn lại: Commander tăng damage, Ritualist hồi sinh, Vanguard che chắn.                  | Menu **Chọn mục tiêu** trước hành động gây damage. Thứ tự xử lý thay đổi theo build và lượng tài nguyên còn lại; không khóa Tấn công hay Skill vào một mục tiêu mặc định. |
| **Baal, Lord of Destruction** | Hỗn hợp | **Worldstone Corruption:** Defile tích Corruption, Inferno đốt MP và Visions khóa tạm một chỉ số. Người chơi có một thanh Purity dùng để xóa đúng một trong ba hậu quả.                         | Menu **Thanh tẩy** chọn Defile/Inferno/Visions; Purity hồi chậm khi gây damage. Người chơi phải quyết định debuff nào đáng xóa, không thể xóa tất cả.                     |
| **Belial, Lord of Lies**      | Phép    | **Three Lies:** ba Belial xuất hiện với ba manh mối ngắn; chỉ một bản là thật. Quy luật manh mối nhất quán và kết quả được khóa khi tạo round.                                                  | Ba nút **Đánh bóng 1/2/3**. Chọn đúng mở boss thật hai lượt; chọn sai tăng Deception và bản giả phản đòn. Không dùng Skill để xóa toàn bộ clone.                          |
| **Astrogha**                  | Phép    | **Totem Web:** ba loại Totem: Venom tăng độc, Web khóa vị trí, Brood hồi boss. Phá Totem chuyển hiệu ứng của nó sang Astrogha trong đúng hai lượt trước khi biến mất.                           | Menu **Chọn Totem**. Người chơi chọn thứ tự và thời điểm phá; phá Brood ngăn hồi nhưng làm boss hút máu tạm thời, tạo đánh đổi thay vì mục tiêu hiển nhiên.               |
| **Atanna Khan**               | Hỗn hợp | **Dream Queue:** UI cho biết ba giấc mơ kế tiếp: đòn mạnh, hút MP hoặc hồi boss. Mỗi chu kỳ người chơi được xóa đúng một giấc và phải chịu hai giấc còn lại theo thứ tự.                        | Ba nút **Xóa giấc 1/2/3**. Quyết định phụ thuộc HP, MP và damage build; queue được lưu, không tạo lại khi resume.                                                         |
| **Inarius**                   | Phép    | **Lilith's Ritual:** đấu trường theo dõi vị trí Inarius, Lilith và vòng Ritual. Inarius chỉ mất Shield khi cả hai cùng nằm trong vòng; Lilith có HP riêng và không được chết.                   | Hai nút **Kéo Inarius** và **Che chở Lilith**. Người chơi vừa bố trí boss vừa giữ NPC sống; cửa sổ damage đến từ vị trí, không đến từ việc bấm Phòng thủ đúng lượt.       |
| **Sescheron's Destroyer**     | Vật lý  | **Engine of Ruin:** mỗi chu kỳ sinh một mã ba rune từ bộ ký hiệu nhỏ. Combat cung cấp manh mối sau mỗi đòn trúng; nhập đúng mã làm quá tải Engine, nhập sai tăng Rage.                          | Ba nút rune dùng để nhập chuỗi. Mã và manh mối được khóa trong state; chuỗi ngắn, không yêu cầu đoán mò hoặc nhớ thông tin ngoài UI.                                      |
| **Nithogur**                  | Phép    | **Time Anchor:** một lần mỗi trận, người chơi có thể lưu HP/MP của mình và HP boss. Sau đó có thể tua cả hai bên về snapshot. Boss mạnh dần theo số lượt nên tua quá muộn cũng có giá phải trả. | Hai nút **Neo thời gian** và **Tua lại**. Snapshot không lưu RNG, item drop hay phần thưởng; chỉ số lượt và Enrage không lùi để chặn vòng lặp vô hạn.                     |

## 6. Luật cân bằng chung

### 6.1. Scale theo tầng, không theo tên boss

- HP, damage, ACC, DEF, EVA và RES nền lấy từ tầng hiện tại cùng Rift modifier.
- Boss ID xác định mechanic; tầng xuất hiện xác định sức mạnh của mechanic đó.
- Ví dụ Death Projector tầng 50 có Beam quay chậm và hệ số thấp; Death Projector tầng 900 đổi vùng nhanh hơn và Beam mạnh hơn.
- Nithogur tầng 50 tăng Enrage chậm sau mỗi lượt; Nithogur tầng 950 tăng Enrage nhanh hơn nên thời điểm Neo/Tua lại khó chọn hơn.
- The Butcher tầng 950 có cùng bản sắc truy đuổi/Bloodlust của tầng 50 nhưng stack, HP và damage đã scale theo cuối run.
- Không mang hệ số gốc từ Median XL sang trực tiếp; chỉ chuyển ý tưởng mechanic.

Mỗi boss có ba cấu hình mechanic, hoàn toàn độc lập với khả năng xuất hiện:

| Cấp độ sâu | Tầng    | Cách tăng sức mạnh                                                                                          |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Depth I    | 50–300  | Chu kỳ chậm, stack thấp, hệ số mechanic thấp. Dùng để giới thiệu mechanic.                                  |
| Depth II   | 350–650 | Chu kỳ và stack chuẩn. Có đầy đủ mechanic chính.                                                            |
| Depth III  | 700–950 | Chu kỳ nhanh hơn hoặc stack cao hơn một bậc; mechanic phụ được kích hoạt. Vẫn phải có cảnh báo và đối sách. |

Catalog của từng boss phải khai báo ba cấu hình riêng. Không dùng một công thức tăng stack chung cho mọi boss vì các mechanic có độ nguy hiểm khác nhau.

### 6.2. Ngân sách mechanic

| Độ sâu    | Chênh lệch HP cho phép | Chênh lệch damage cho phép | Sát thương bất ngờ                                    |
| --------- | ---------------------: | -------------------------: | ----------------------------------------------------- |
| Depth I   |                   ±10% |                       ±10% | Không được gây chết từ đầy HP nếu không có cảnh báo   |
| Depth II  |                   ±12% |                       ±12% | Phải cảnh báo trước ít nhất một lượt                  |
| Depth III |                   ±15% |                       ±15% | Có thể rất nguy hiểm nhưng phải có đối sách công khai |

- Heal boss có giới hạn theo trận, tránh combat vô hạn.
- Stack boss luôn có trần và hiển thị trên UI.
- Không boss nào yêu cầu riêng một class, một item hoặc một lượng MP không thể đạt được.
- Build thuần vật lý hoặc thuần phép luôn có đường xử lý bằng component riêng của boss hoặc hành động chung; không bị khóa cứng vì thiếu loại damage còn lại.
- Chuyển phase không phản công và damage dư không xuyên phase nếu phase có thanh HP riêng.
- Mọi roll ảnh hưởng mechanic phải được khóa trước khi hiển thị lựa chọn.

## 7. Mốc cố định

### Tầng 333 — Threefold Prophecy

- Luôn là event chọn ấn, không tham gia boss pool.
- Chọn đúng một trong War, Protection hoặc Arcane.
- Lưu một lần; resume không được chọn lại.
- Giao diện phải cho biết cả buff nhận ngay và cách tạo **Resonance** trong trận Kabraxis:

| Ấn             | Buff giữ lại                 | Cách tạo Resonance tại tầng 666                                               |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| **War**        | +12 stat chính, +8% DMG boss | Mỗi hành động gây damage tạo 1; CRIT tạo thêm 1. Tối đa 2/lượt.               |
| **Protection** | +12 VIT, +5 RES              | Sống qua phản công tạo 1; nếu giảm/chặn ít nhất 40% damage dự báo tạo thêm 1. |
| **Arcane**     | +10 ENE, +1 Max MP           | Một lượt có tiêu hoặc hồi MP tạo 1; lượt vừa tiêu vừa hồi vẫn chỉ tạo 1.      |

Resonance chỉ bắt đầu tích khi vào Kabraxis, không tích sẵn từ tầng 334–665.

### Tầng 666 — Kabraxis

- Luôn là Kabraxis.
- Giữ cửa rút thưởng trước trận và khóa rút sau khi bước vào.
- Không tham gia roll pool chung.
- Giữ một thanh HP với ba ngưỡng phase `>66%`, `33–66%`, `<33%`.
- **Corrupted Seals:** Kabraxis tạo một Seal mỗi ba vòng ở Phase 1 và mỗi hai vòng ở Phase 2, tối đa năm Seal trong trận. Phase 3 không tạo thêm.
- Khi Seal xuất hiện, người chơi chọn:
  - **Thanh tẩy:** tiêu 3 Resonance. Seal chuyển thành Purified Seal.
  - **Phá vỡ:** không tốn Resonance, tiếp tục hành động nhanh hơn nhưng Seal chuyển thành Broken Seal.
  - **Bỏ qua:** Seal ở lại; Seal kế tiếp không xuất hiện cho tới khi xử lý.
- Mỗi Purified Seal cho người chơi +5% damage lên Kabraxis ở Phase 3.
- Mỗi Broken Seal cho Kabraxis +5% damage ở Phase 3 và thêm hậu quả theo ấn:
  - War: tăng CRIT của boss.
  - Protection: giảm RES hiệu dụng của người chơi.
  - Arcane: giảm Max MP hiệu dụng, không dưới 2.
- Phase 1 giới thiệu Seal với nhịp chậm. Phase 2 tăng tốc và thêm đòn riêng của ấn. Phase 3 khóa kết quả Seal, bỏ Shield và trở thành cuộc đua kết liễu.
- Resonance, danh sách Seal và lựa chọn đang chờ phải được lưu. Mở lại giao diện không tạo Seal mới hoặc đổi loại Seal.

### Tầng 999 — Deimoss

- Luôn là Deimoss.
- Giữ ba thanh HP riêng 30% / 30% / 40%.
- Damage dư không xuyên phase; chuyển phase không phản công.
- Chỉ phase 3 chết mới hoàn thành run.

#### Phase 1 — Abyssal Spires, 30% tổng HP

- Thanh HP phase được chia thành ba Spire có tổng đúng 30% HP: **Ruin**, **Silence** và **Hunger**.
- Menu **Chọn Spire** quyết định mục tiêu nhận damage:
  - Ruin tăng damage vật lý của Deimoss.
  - Silence tăng chi phí Skill theo chu kỳ, nhưng không vượt Max MP của người chơi.
  - Hunger hồi một phần damage Deimoss gây ra.
- Phá Spire nào thì hiệu ứng của Spire đó biến mất. Thứ tự phá tùy build và tài nguyên.
- Mỗi Spire có HP riêng trong state; damage dư khi phá một Spire không xuyên sang Spire khác.

#### Phase 2 — Flesh Feast, 30% tổng HP

- Khi phase còn 75%, 50% và 25% HP, Deimoss rơi một **Flesh Core**. Core và lựa chọn được khóa tại đúng ngưỡng, không roll lại.
- Người chơi có ba cách xử lý:
  - **Thiêu hủy −1 MP:** xóa Core an toàn.
  - **Cấy ghép:** nhận một buff chỉ số đến hết run nhưng kèm một Flesh Curse được hiển thị trước.
  - **Bỏ mặc:** không mất lượt/tài nguyên; Core hồi cho boss ở cuối hai lượt kế tiếp.
- Flesh Curse không được chuyển vào inventory thật và biến mất khi run kết thúc.
- Dùng bình không còn tự động tăng stack damage boss như cơ chế cũ.

#### Phase 3 — Dimensional Collapse, 40% tổng HP

- Mỗi ba lượt, người chơi phải chọn một Plane; chọn Plane là một action an toàn, sau đó có ba lượt combat trong Plane đó:
  - **Material:** damage vật lý của cả hai phía +25%, damage phép −25%.
  - **Arcane:** damage phép của cả hai phía +25%, damage vật lý −25%.
  - **Void:** damage người chơi +15%, DEF/RES hai phía giảm, không thể hồi HP trong Plane.
- Ý định damage ba lượt kế của Deimoss được hiển thị trước khi chọn Plane.
- Depth không áp dụng thêm cho tầng 999; Deimoss luôn dùng cấu hình final cố định.
- Hạ thanh HP thứ ba mới khóa thưởng, kim cương và trạng thái hoàn thành. Component cũ gửi sau khi boss chết phải bị từ chối.

## 8. Phần thưởng

- Phần thưởng đi theo **mốc tầng**, không đi theo boss được random.
- Các rương boss ở 100/200/300/400/500/700/900 giữ nguyên.
- Tỷ lệ SSR/UR, bonus cược, kim cương và drop LUCK giữ luật hiện hành.
- Boss khó hơn ở cùng một tầng không tự cho thêm payout, vì lựa chọn boss là ngẫu nhiên. Chênh lệch độ khó phải xử lý bằng cân bằng mechanic.
- Kabraxis và Deimoss giữ reward riêng hiện tại.

## 9. UI cần có khi triển khai

Battle UI boss phải hiển thị ngắn gọn:

1. Tên boss và tầng.
2. Damage chính: Vật lý, Phép hoặc Hỗn hợp.
3. Cơ chế đang hoạt động.
4. Stack/phase/cửa sổ yếu hiện tại.
5. Đòn kế tiếp và damage dự báo chưa CRIT.
6. Một câu đối sách trực tiếp, ví dụ: `Tia sẽ quét khu B — đổi vị trí trước khi kết thúc lượt`.

Component boss có hai loại rõ ràng:

- **Selector:** chọn mục tiêu, Ward, Plane hoặc Totem. Selector không làm boss phản công và không tăng lượt; sau khi chọn, bot render revision mới rồi người chơi dùng Tấn công/Skill. Nếu mục tiêu chết, selector tự chuyển sang mục tiêu hợp lệ kế tiếp.
- **Boss action:** di chuyển, Xả nhiệt, Cắt liên kết, Tua lại… Đây là một lượt hoàn chỉnh và boss xử lý hậu quả ngay; không được bấm thêm Tấn công trong cùng lượt.

UI phải ghi ngay trên component `Chọn mục tiêu — không tốn lượt` hoặc `Hành động — tốn 1 lượt`. Khi một lựa chọn bắt buộc chưa hoàn tất, các nút không hợp lệ bị disable thay vì cho người chơi bấm rồi mới báo lỗi.

Nút **Chi tiết** hiển thị toàn bộ chu kỳ, trần stack, điều kiện mở cửa sổ và hậu quả nếu xử lý sai. UI không được gọi RNG hoặc thay đổi state.

## 10. State dự kiến

```js
state.bossRosterVersion = 2;
state.bossHistory = ["butcher", "buyard"];

state.encounter.enemy.boss = {
  id: "death_projector",
  rosterVersion: 2,
  phase: 1,
  turn: 0,
  mechanicState: {
    playerZone: "A",
    beamZone: "B",
    nextBeamZone: "C",
  },
};
```

- Chỉ lưu dữ liệu cần để khôi phục chính xác trận.
- Không lưu function hoặc object catalog đầy đủ vào SQLite.
- Validate `bossId`, phase, stack và giới hạn số học khi đọc session.
- Boss catalog là nguồn chuẩn; state chỉ giữ ID và tiến trình biến đổi.

## 11. Kiểm thử bắt buộc trước release

### Chọn boss

- 10.000 lịch trình run: mọi boss trong pool đều có thể xuất hiện tại mọi mốc 50 tầng.
- Boss được phép lặp ở bất kỳ mốc nào và phải nhận đúng cấu hình Depth theo tầng mới.
- Phân bố từng boss tại cùng một mốc phải gần đồng đều trong sai số thống kê cho phép.
- 333/666/999 luôn cố định.
- Cùng một session qua serialize/deserialize giữ nguyên boss và mechanic.

### Chống abuse

- Render UI 100 lần không đổi RNG/state.
- `/sinhton tieptuc` không đổi boss, phase, stack hoặc đòn kế tiếp.
- Hai nút đồng thời chỉ xử lý một lượt.
- Component boss và nút combat gửi đồng thời chỉ có một action thắng transaction.
- Selector cũ không được làm đổi mục tiêu sau khi một combat action revision mới đã xử lý.
- Đổi Selector liên tục không gọi RNG, không hồi tài nguyên và không kích hoạt hiệu ứng đầu/cuối lượt.
- Component không thuộc boss hiện tại, component đã hết hạn hoặc payload mục tiêu sai phải bị từ chối mà không đổi state.
- Restart giữa phase/wave không hồi HP boss hoặc nhân đôi thưởng.
- Boss chết chỉ trao thưởng đúng một lần.

### Cân bằng

- Ma trận 7 class × các build chính × 39 boss thường.
- Đánh giá cả 39 boss tại tầng 50, 300, 350, 650, 700 và 950.
- Kiểm thử riêng từng component, mục tiêu, phase, ngưỡng HP và cấu hình Depth của cả 39 boss.
- Kabraxis phải được kiểm thử với đủ ba ấn và mọi tổ hợp Purified/Broken Seal hợp lệ.
- Deimoss phải được kiểm thử với mọi thứ tự Spire, ba lựa chọn Flesh Core và ba Plane ở phase cuối.
- Không boss nào có tỷ lệ thắng bằng 0 cho một class trong mẫu đủ lớn khi dùng chiến thuật đúng.
- So sánh tỷ lệ chết theo boss; boss vượt quá trung vị pool quá xa phải giảm trước release.
- Chạy mô phỏng end-to-end 999 tầng và xác nhận tỷ lệ hoàn thành không vượt mục tiêu thiết kế hiện hành.

### Discord/UI

- Embed và component không vượt giới hạn Discord.
- Tất cả cảnh báo lethal nằm trên bảng chính, không chỉ trong Chi tiết.
- Tên/icon boss thiếu emoji phải có fallback Unicode.
- Interaction timeout có thể phục hồi bằng `/sinhton tieptuc`.

## 12. Thứ tự triển khai đề xuất

1. Tạo catalog roster v2 với một pool 39 boss và validation.
2. Thêm lựa chọn độc lập từ đủ 39 boss ở từng mốc 50 tầng, `bossHistory` phục vụ thống kê và migration chỉ dành cho run mới.
3. Tạo framework Selector/Boss action và kiểm thử stale interaction trước khi thêm mechanic.
4. Rework 19 boss hiện tại theo từng nhóm nhỏ và kiểm thử sau mỗi nhóm.
5. Thêm 20 boss mới theo từng nhóm nhỏ và kiểm thử sau mỗi nhóm.
6. Rework Kabraxis/Deimoss và kiểm thử phase/reward riêng.
7. Bổ sung cấu hình Depth I/II/III cho toàn bộ 39 boss.
8. Cập nhật UI/Chi tiết/luật chơi.
9. Chạy ma trận boss, mô phỏng 999 tầng và cân bằng lại hệ số.
10. Chỉ sau khi test đạt mới đổi roster mặc định sang version 2.
