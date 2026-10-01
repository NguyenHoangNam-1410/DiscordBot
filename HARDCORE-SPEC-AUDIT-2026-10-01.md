# Đối chiếu Sinh tồn với đặc tả — 01/10/2026

## Phạm vi và thứ tự áp dụng

Đặc tả gốc: [Sinh tồn: Hành trình 999 tầng](C:/Users/NAMNGUYEN04248/Downloads/2026-10-01-hardcore-survival-999.md).

Đối chiếu code, UI, dữ liệu trang bị, lưu trạng thái, thanh toán và kiểm thử. Những yêu cầu người dùng đưa ra sau đặc tả được giữ làm quy tắc hiện hành: bắt đầu bằng UI, encounter bất ngờ, chạy khỏi RNGesus 75%, tự dùng vé khi chạy thất bại, bỏ lựa chọn Vé, tăng hiệu quả Phòng thủ, cố định loại sát thương boss, thêm Thợ rèn/Giải nguyền và lệnh tiếp tục UI.

Tài liệu đính kèm được dùng làm nguồn yêu cầu cơ chế game. Phần hướng dẫn vận hành trong tài liệu không được thực thi như một lệnh đăng nhập, đăng ký hay triển khai bot.

## Ma trận cơ chế

| Nhóm | Cơ chế hiện hành sau đối chiếu | Nguồn code / bằng chứng |
| --- | --- | --- |
| Bắt đầu | `/choi sinhton batdau` mở UI riêng: chọn một trong 7 class, xem chỉ số/kỹ năng, nhập xu, xác nhận. Chỉ giữ xu lúc xác nhận. Kiểm tra chủ UI, phiên bản, số dư, giới hạn server, một run/người/server và nhấn trùng. UI công khai gửi thất bại thì hoàn xu. | `src/commands/hardcore.js`, `hardcoreService.js`; kiểm thử luồng thực qua lệnh `/choi`, modal, giới hạn thay đổi, nhấn đồng thời và lỗi gửi tin. |
| Cược | 10–100.000 xu và giới hạn riêng của server. Tiền giữ một lần; payout quyết toán một lần. Rút trước khi qua tầng 1 mất cược. Chết nhận 0 payout. | Service và các kiểm thử tài khoản/reserve/settlement. |
| Class | Amazon 2 × 85%; Assassin 130% và né phản công; Barbarian 165%; Druid 135% + hồi 12% HP; Necromancer 155% phép và chặn phản công; Paladin 140% + thủ; Sorceress 210% phép. Kỹ năng tốn 2 Energy; đánh/thủ hồi 1, có giới hạn. | Service; kiểm thử từng class, kỹ năng, năng lượng và phản công. |
| Khu vực | Đúng 8 khu vực và các khoảng tầng trong đặc tả; quái tăng tuyến tính theo từng vùng. | `hardcoreEngine.js`; kiểm thử ranh giới khu vực và hệ số tăng. |
| Checkpoint | Mỗi 5 tầng: hồi đầy HP, thêm 2 bình với giới hạn 5 tại checkpoint; tăng nền HP/Attack lần lượt 6/1, 10/2, 14/3, 30/6 theo các mốc 100/400/700. Chọn +5 Attack, +30 HP, +6 Defense hoặc +2 Luck. | Engine/service; kiểm thử tầng 5/100/400/700 và bước chọn nâng cấp. Log đã phản ánh đúng số bình trước → sau. |
| Rift | Mỗi 10 tầng; tám loại đầu không lặp rồi cộng dồn. Stone Skin, Elemental Dominion, Bloodlust, Unstable Rift, Fortified, Swift Horror, Soul Drain và Cursed Ground đúng tác dụng. Elemental tăng cơ hội phép ở quái ngoài boss. | Engine/service; kiểm thử đủ tám loại, cộng dồn và giới hạn. |
| Boss | Mỗi 50 tầng luân phiên Butcher/Riftwalker/Assur/Lucion/Deimoss. Giữ các kỹ năng riêng. Tầng 999 bắt buộc đánh Deimoss cuối mạnh hơn; không công nhận 999 trước khi hạ boss. Run cũ ghi 999 sai được đưa về trận boss cuối. | Service; kiểm thử chu kỳ, kỹ năng boss, chống bỏ qua boss và khôi phục run cũ. |
| Sát thương | Defense giảm vật lý tối đa 75%; Resistance −50% đến 75%; xác suất trúng 20–95%. Phòng thủ dùng Defense ×2 và giảm thêm 50% cả vật lý/phép sau giảm trừ, tối thiểu 1 sát thương. Butcher/Assur vật lý; Riftwalker/Lucion/Deimoss phép. | Engine/service; kiểm thử công thức, biên và loại sát thương cố định. |
| Bình máu | Hồi 35% HP tối đa, tối thiểu 20; quái còn sống vẫn phản công. Đầy HP hoặc hết bình thì nút bị vô hiệu hóa. | Service/view; kiểm thử hành động và UI. |
| Trang bị | R = TU, SR = RW, SSR = SU/Set, UR = SU Nguyền. Chuyển stat Median XL thành stat trong run, có Attack dự phòng. Nhặt trùng tăng cấp và hiệu ứng; UR phạt payout 15% mỗi cộng dồn còn nguyền. Không đưa đồ run vào túi chung. | `hardcoreEquipment.js`, service; kiểm thử chuyển stat, cấp, nguyền và loader SQLite. |
| Hòm | Tỷ lệ nền Ancient Mimic 3%, Mimic 12%; hòm thường không Mimic: rỗng 20%, giả 5%, R 40%, SR 22%, SSR 10%, UR 3%; kho báu SR 65%, SSR 35%. Kiểm tra một lần, mở, bán +15% cược hoặc né Mimic đã phát hiện. Luck/Rift/pity điều chỉnh tỷ lệ nền. | Service; kiểm thử rarity, Mimic, thao tác và lưu kết quả. |
| Pity | Chỉ hòm đã mở tăng/reset pity, gồm Mimic; bán/bỏ hòm và SSR từ cầu nguyện không reset. Sau 5 hòm thiếu SR+, hòm tiếp theo tối thiểu SR và không Mimic. Sau 10 hòm thiếu SSR+, thêm 2% mỗi hòm tiếp. Hòm thường và kho báu đều nhận Luck/pity; giới hạn SSR tương ứng 35%/60%. | Đã sửa thiếu Luck/pity ở kho báu và reset sai khi cầu nguyện; kiểm thử các mốc và giới hạn. |
| Encounter | Sau roll RNGesus, ngoài tầng boss bắt buộc: quái thường 47%, Elite 12%, hòm thường 10%, Shrine 8%, kho báu 5%, bẫy 6%, bất ngờ 6%, Thợ rèn 3%, Giải nguyền 2%, trống 1%. Unstable chuyển tối đa 12% từ quái thường sang hòm. | Service; kiểm thử 1.000 điểm giữa các khoảng roll khớp phân bố. Đây là cập nhật người dùng sau đặc tả. |
| Bất ngờ | Khám phá hoặc bỏ qua. Mỗi kết quả 25%: hồi 35% HP +1 bình; +1 vé; bonus +50% cược; Champion phục kích đánh trước. | Service/view; kiểm thử cả bốn nhánh và tiến trình tầng. |
| Thợ rèn | Tăng 1 cấp món SSR/SR/R ưu tiên độ hiếm cao rồi cấp thấp; loại đồ nguyền/tiêu hao/đồ đặt lại Defense. Phí = ceil(cược × 0,5 × (1 + tầng/100)), tối thiểu 1. | Engine/service; kiểm thử chọn đồ, phí, thiếu payout, chống thao tác trùng. |
| Giải nguyền | Gỡ một cộng dồn phạt payout UR, giữ cấp và stat của đồ. Phí = ceil(cược × 0,35 × (1 + tầng/200)), tối thiểu 1. Không xóa Rift. | Engine/service; kiểm thử giữ stat, gỡ một lớp và nhặt thêm đồ nguyền. |
| RNGesus | Xuất hiện từ tầng 5; nền 0,3% ở 5–9, 0,6% ở 10–19, 1% từ 20; biến động, chuỗi lâu không gặp, Chaos Spike, trần 12%. Bốn lựa chọn: chiến đấu chết; chạy 75%, thất bại tự dùng một vé; hối lộ mất 40% payout hiện tại; cầu nguyện 10% SSR nếu không thì chết. Không có Vé thủ công/rút thưởng. | Service/view; kiểm thử biên 75%, giữ/tiêu vé, không vé, bốn nút và bác bỏ thao tác Vé cũ. |
| Bẫy | Tax Collector lấy 15% payout hiện tại; trộm lấy bình; Wrong Portal giữ tầng và tạo encounter mới. | Service; đã sửa thuế từ hệ số vĩnh viễn sang khoản chi hiện tại. |
| Payout | Chỉ tầng đã vượt tính tiền; hệ số tầng dừng sau 100, bonus vẫn tăng; trần 10 triệu. Phí dịch vụ/thuế/hối lộ trừ khỏi payout của run, không thu thêm từ số dư tài khoản. | Engine/service; kiểm thử cap, tầng chưa vượt, khoản chi và bonus sau khi bị thuế/hối lộ. |
| Hồ sơ | Tầng cao nhất, số run, chết, rút an toàn, hoàn thành 100. Hồ sơ và bảng xếp hạng phản ánh run đang chơi ngay khi đạt mốc; sau quyết toán không đếm trùng. Rút ở đỉnh 999 tính rút an toàn. | Repository/service; đã bổ sung tiến trình run đang hoạt động, kiểm thử cả trước/sau quyết toán. |
| UI/tiếp tục | `/choi sinhton tieptuc` tạo tin mới, tắt nút tin cũ. Backend kiểm tra chủ, message ID và revision. Resume/restart không roll lại encounter đã lưu. UI không vượt giới hạn embed Discord với run lớn. | Command/service/view; kiểm thử nút cũ, khôi phục và ngân sách embed 6.000 ký tự. |
| Timeout | UI chọn class/cược hết hạn sau 5 phút không tương tác. Run đã đăng UI hết hạn sau 7 ngày và mất cược; run chưa đăng được UI được hoàn cược khi dọn phiên lỗi. Maintenance chung đóng UI cũ; bỏ bước startup xóa run trước khi maintenance có thể tắt nút. | `src/index.js`, service, session maintenance; kiểm thử thời gian giả, forfeit/refund và vô hiệu hóa UI. |

## Các gap đã sửa trong lần đối chiếu này

1. Hòm kho báu bỏ qua Luck và pity SSR; SSR ngoài hòm lại reset pity của hòm.
2. Thuế/hối lộ nhân vĩnh viễn payoutFactor, ảnh hưởng cả tiền kiếm về sau và làm lệch khoản phí dịch vụ đã chi. Nay mỗi lần trừ đúng tỷ lệ payout còn lại ở thời điểm gặp sự kiện, làm tròn chi phí lên. payoutFactor giữ tác dụng nguyền trang bị.
3. Run đang chơi chưa xuất hiện trong tiến trình hồ sơ/bảng xếp hạng, kể cả đã hoàn thành tầng 100.
4. Startup dọn run trước maintenance làm UI hết hạn còn nút; cleanup phiên chưa đăng UI thiếu nhánh hoàn cược.
5. Log checkpoint luôn ghi nhận 2 bình dù đã chạm giới hạn; nút bình máu còn bật khi đầy HP; hành động không hợp lệ ở trạng thái đỉnh tự quyết toán.
6. Cân bằng boss cuối sau các cơ chế mới lệch xa kết quả thực nghiệm trong tài liệu. Giảm hệ số sát thương boss cuối từ 2,50 xuống 2,15, giữ hệ số HP 5,8 và Defense 8 cùng kỹ năng Deimoss.

Run cũ được chuyển cách tính thuế/hối lộ khi đọc trạng thái: khôi phục hệ số nguyền từ các cấp đồ chưa giải nguyền, chuyển chênh lệch thành khoản đã chi và giữ nguyên payout có thể rút. Phí dịch vụ cũ được giữ riêng để UI phân biệt. Nếu không nhận diện được định nghĩa đồ nguyền cũ, giữ cách tính cũ cho trạng thái đó thay vì đoán và làm đổi tiền.

## Dữ liệu và kết quả kiểm tra

- Catalog thật `data/median-xl.sqlite`, loader chỉ đọc bảng items: **218 TU**, **231 RW**, **653 SU/Set**, **420 biến thể SU Nguyền** sau loại trùng/chọn tier. Thiếu catalog vẫn dùng đồ dự phòng.
- `node scripts/test-hardcore.js`: **đạt**, gồm cơ chế, thanh toán, migration run cũ, UI, timeout và kiểm thử hồi quy cho các gap trên.
- Mô phỏng 10 run mỗi class đến tầng 100: **70/70 đạt tầng 100**, **0 timeout**.
- Mô phỏng `100 999 40000 assassin 100`: 100 run; 77 trạng thái trước boss cuối; 7.700 lượt tái đấu; 8 lần thắng. Ước tính hoàn thành toàn hành trình **0,08%**; không có timeout. Các run ban đầu có tầng cao nhất 998, trung vị 998; không run nào thắng 999 ở lượt đầu.
- Đây là kết quả của chiến thuật mô phỏng, không phải xác suất khóa cứng. Mẫu hiện tại gần mục tiêu lịch sử 0,1%; không tái hiện nguyên số liệu 13 trạng thái/1.300 trận trong bản cũ vì cơ chế được người dùng cập nhật và kết quả có biến động.
- Kiểm tra cú pháp các tệp JS đã sửa và `git diff --check`: đạt.
- Chạy riêng cả 12 script thuộc bộ test hiện tại: **7 đạt, 5 lỗi ngoài Sinh tồn**. Vì vậy không tuyên bố toàn bộ `npm test` đạt.

### Năm lỗi ngoài Sinh tồn

| Script / vị trí assertion | Kỳ vọng đang lỗi |
| --- | --- |
| `scripts/test-game-bot.js:460` | Cược nhỏ: thực tế EXP 0, test đòi 10. |
| `scripts/test-operations.js:109` | Danh sách migration chỉ đòi 1–24, code hiện có 25. |
| `scripts/test-item-effects.js:232` | Test đòi lời nhắc số tiếng VTV, code hiện dùng gợi ý chữ cái. |
| `scripts/test-session-lifecycle.js:1527` | Kết quả Xì dách cược nhỏ: test đòi icon EXP dù phần thưởng không có EXP. |
| `scripts/test-command-handlers.js:86` | Kỳ vọng buff diamonds cũ gặp INVALID_BUFF_TYPE. |

## Bàn giao

Các tệp chỉnh trong lần này: `hardcoreService.js`, `hardcoreRepository.js`, `hardcoreView.js`, `commands/hardcore.js`, `commands/luat.js`, `src/index.js`, `scripts/test-hardcore.js` và bản đối chiếu này. Thay đổi có sẵn trong `src/commands/vuatiengviet.js` được giữ nguyên.

Không sửa database tài khoản/catalog và không đổi schema slash command trong lần audit này. Cần khởi động lại bot để nạp code. Chưa đăng nhập Discord, đăng ký lệnh, triển khai hay commit các chỉnh sửa này. Chủ sở hữu các tệp bị tác động được kiểm tra là `S3P\namnguyen04248`.

## Bổ sung sau audit: Wrong Portal và Lucky Break

Yêu cầu mới dùng [wrongportal.md](C:/Users/NAMNGUYEN04248/Downloads/wrongportal.md) thay thế cơ chế Wrong Portal tạo lại encounter được ghi ở ma trận phía trên.

- Wrong Portal giữ tỷ lệ khoảng 2% encounter thường; boss bắt buộc vẫn được ưu tiên. Khi xuất hiện, lưu sẵn nhánh 25% tốt / 75% xấu, hiệu ứng cụ thể và Elite nếu có. Đích đến được giấu trước khi chấp nhận; restart/tạo lại UI không roll lại. Portal cũ chưa có kết quả được nâng cấp bằng roll xác định từ seed và tầng/turn.
- Portal tốt chọn đều Healing Sanctuary (+10 Max HP, đầy HP, thêm 1 bình với trần 5), Treasure Vault (+50% cược vào bonus), Rift Blessing (+4 Defense, +5 Resistance, +1 Luck). Qua tầng với rewardMultiplier 0; checkpoint/Rift/nâng cấp vẫn áp dụng.
- Portal xấu chọn đều trong pool hợp lệ: Blood Rift (tối đa 15% Max HP, không tự giết), Mana Void (chỉ khi còn Energy), Shattered Supplies (chỉ khi còn bình, mất tối đa 2), Payout Corruption (payoutFactor ×0,9 cho toàn run) và Dimensional Curse (mất tối đa 5 Defense/Resistance). Giữ tầng, chuyển sang Rift Ambusher Elite có modifier hiện tại và đánh phủ đầu. Hạ Elite mới qua tầng; chết khi phủ đầu nhận payout 0. Vẫn được rút trước khi chấp nhận.
- Lucky Break = min(30%, Luck ×1,5%), chặn thuế, trộm bình hoặc riêng đòn phủ đầu portal xấu. Không gỡ hiệu ứng portal hay Elite. Roll được lưu cùng encounter; thông báo **🍀 Lucky Break! Bạn tránh được hậu quả.**
- Đã thêm công thức bắt Treasure Goblin = min(80%, 60% + Luck ×1%) trong engine. Encounter Treasure Goblin chưa tồn tại trong code; đang chờ người dùng cung cấp tỷ lệ xuất hiện, thưởng và mức payout bị trộm để nối vào luồng chơi và Lucky Break.

Các kết quả test/mô phỏng phía trên thuộc lượt audit trước bổ sung này. Lượt bổ sung chưa chạy test/mô phỏng; đã đọc lại diff, định dạng code và kiểm tra chủ sở hữu tệp.
