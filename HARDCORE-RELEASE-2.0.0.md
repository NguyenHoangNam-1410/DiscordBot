# Sinh tồn 2.0.0 — bản triển khai ngày 03/10/2026

Ghi chú lịch sử: bản cân bằng kế tiếp là **2.0.1**, xem `HARDCORE-RELEASE-2.0.1.md`. Nội dung và kết quả dưới đây thuộc bản 2.0.0.

Bản mới đã được triển khai trong source. Run mới mặc định dùng gameplay v2 và catalog v2. Run đang chơi theo luật cũ tiếp tục theo luật cũ. Đây là bản để đánh giá vận hành và cân bằng trước khi quyết định bỏ legacy; chưa triển khai lên server Discord trong phiên làm việc này.

## Ghi nhận phiên bản

- Baseline legacy: commit `c0c62134a278561fda4058dd566762be84d23f1f`, internal `runVersion: 4`.
- Bản mới: `gameplayVersion: 2`, `catalogVersion: 2`, `releaseVersion: "2.0.0"` trong state từng run.
- Manifest và hash mã cũ: `docs/releases/hardcore-2.0.0.json`. Catalog cũ được giữ nguyên tại `src/hardcore/itemLegacy.js`.
- Migration 33 tạo `hardcore_releases`, `hardcore_run_archive`, `hardcore_echoes`. Migration chạy khi bot khởi động và không reset phiên/currency/record hiện có.
- Mỗi run kết thúc lưu phiên bản, class, tầng đã vượt, nguyên nhân kết thúc, cược, thưởng, số lượt và thời gian vào archive. `/sinhton hoso` hiển thị phiên bản run đang chơi và thống kê theo phiên bản đã ghi từ ngày phát hành. Tổng thành tích và bảng xếp hạng hiện có vẫn bao gồm lịch sử cũ.

## Gameplay đã triển khai

- Bảy class và STR/DEX/VIT/ENE; chỉ số dẫn xuất tính lại từ nền class, checkpoint, event, phần hấp thụ và level item. Mana tách khỏi ENE. Mở lại UI không phát lại bình/vé hoặc cộng buff lần nữa.
- Combat vật lý/phép, Crit, ACC/EVA, dự báo đòn kế tiếp, kỹ năng từng class, Phòng thủ và bình máu theo công thức mới.
- 999 tầng, tám vùng, boss mỗi 50 tầng, Deimoss tầng 999 và xác nhận Summit trước khi chốt thắng.
- Checkpoint mỗi năm tầng: hồi đầy HP, thêm hai bình, chọn +5 thuộc tính kèm dự báo đầy đủ. Rift có stack giảm dần; Paradox mỗi 25 tầng; Severance sau 199/399/699/899.
- 100 item đúng bảng tài liệu: 32 R, 28 SR, 24 SSR, 16 UR. Nhặt trùng ID/tên tăng level; UR có curse riêng; Purifier giải toàn bộ và chuyển SSR. Thợ rèn giữ trạng thái sạch của đồ đã giải nguyền. Forge hấp thụ buff một cấp trước khi chọn bonus; không phát lại vật tư một lần.
- Hòm, pity SR+/SSR, Mimic, inspect, Shrine, Wrong Portal, Treasure Goblin và các surprise event. Lost Adventurer dùng một bình để cứu; RNGesus cầu nguyện 10%, bỏ chạy 75%.
- Rift Duelist với lượt Búa/Kéo/Bao và hai lựa chọn đấu stat/đấu đồ. Tay đối thủ, hình phạt, loot và item có thể mất được khóa từ lúc tạo encounter.
- Payout/Blood/Diamond Shop: ba offer, mua tối đa một món, giá/inventory được khóa, giới hạn lượt và khoảng cách xuất hiện. Blood Shop giữ ít nhất 1 HP; Diamond Shop trừ gem bằng operation ID trong transaction chung với run. Blood Paradox không tạo thêm tiền để mua đồ.
- Grave Echo/Nemesis: snapshot build và tối đa ba item (level cap 5), claim 30 phút, cap 10/server, hết hạn bảy ngày, cô lập server và loại mộ của chính người chơi. Mộ đang được claim không bị thay thế bên dưới run khác.
- The Tower Remembers: tối đa tám món nợ, khóa kết quả tốt/xấu lúc ghi nhận, kích hoạt sau 10–30 tầng.

Lệnh đăng ký hiện tại là `/sinhton`, phù hợp convention trong `commandRegistry.js`. Tài liệu đầu vào dùng `/choi sinhton`; giao diện và luật mới đã dùng tên lệnh thực tế. Các bảng kết quả mới không hiển thị số dư tài khoản; xem qua `/hoso`.

Các tham số quái mà tài liệu chưa nêu công thức chi tiết được chốt trong `hardcoreWorld.js`: DEF nền `5 + floor*0.65`, ACC `75 + floor*0.25`, EVA `min(100,5+floor*0.08)`, RES `min(60,floor*0.06)`; Boss thường nhân HP×4/DMG×1.6, final boss HP×7.2/DMG×2. Những tham số này cần đánh giá cân bằng cùng các công thức trong tài liệu, không xem là số liệu đã được tài liệu xác nhận.

## Kiểm tra thực tế

`npm run test:hardcore:v2` đã qua 12 nhóm: công thức; catalog/stack/resume; giải nguyền/Forge; stale click/transaction; checkpoint/Blood Paradox; Severance/Rift; shop thiếu tiền/bấm lặp; Duelist; Echo lease/cap/Nemesis; Tower khóa RNG; giới hạn Discord/private UI/lịch sử phiên bản; chạy song song/rollback legacy. Bộ này cũng kiểm tra cashout Summit không lặp, final boss không bị bỏ qua, hai click đồng thời và fallback UI vẫn dùng đúng turn mới.

`node scripts/test-operations.js` đã qua migration và backup/restore. Audit bảo mật lệnh đã chạy thành công. Chưa kiểm tra trực tiếp với Discord thật.

`npm test` chưa xanh toàn bộ: kiểm tra chung cũ kỳ vọng nhóm `/choi` dù registry đã đăng ký game độc lập; kiểm tra legacy Sinh tồn dùng hệ số vùng không còn khớp `hardcoreEngine.js` ở baseline. Khi chạy riêng, bộ lifecycle còn kỳ vọng EXP ở phần thưởng Xì dách và bộ command handler gọi buff type đã bị bỏ. Các lỗi này được ghi nhận riêng, không coi tuyên bố “toàn bộ kiểm thử đã qua” trong tài liệu đầu vào là kết quả của phiên triển khai này.

Kiểm tra riêng `test-reward-text.js` cũng đã qua. `test-item-effects.js` còn kỳ vọng Máy Đếm Tiếng trả số tiếng ở Vua tiếng Việt, trong khi cơ chế này đã được đổi thành tiết lộ chữ trong bản mã trước phiên làm việc này.

## Mô phỏng bản mới

Kết quả chi tiết: `docs/releases/hardcore-2.0.0-simulation.json`. Seed `survival-v2-2026-10-03`, mỗi class 70 run, cược 100.000 xu, tối đa 40.000 lượt/run, backend memory dùng cùng engine/action/fairness. Chính sách ưu tiên skill, xen kẽ stat chính/VIT, tránh Shrine và Diamond Shop, hối lộ RNGesus khi không có vé. Đây là một chiến thuật mẫu, không phải tỷ lệ thắng chính thức hoặc chiến thuật tối ưu của mọi class.

| Class       | Run | Trung vị tầng vượt | Cao nhất | Vượt 100 | Vượt 999 |
| ----------- | --: | -----------------: | -------: | -------: | -------: |
| Amazon      |  70 |                 49 |      199 |        1 |        0 |
| Barbarian   |  70 |                 53 |      299 |        5 |        0 |
| Assassin    |  70 |                 99 |      849 |        9 |        0 |
| Sorceress   |  70 |                 99 |      849 |       31 |        0 |
| Druid       |  70 |                 49 |      849 |       11 |        0 |
| Necromancer |  70 |                998 |      999 |       55 |       21 |
| Paladin     |  70 |                 49 |      564 |        6 |        0 |

Không có run nào hết giới hạn lượt hoặc kẹt phiên trong 490 run này. Thêm smoke test dùng SQLite thật: 10 run/class đến tầng 100, không timeout; kết quả tại `docs/releases/hardcore-2.0.0-sqlite-smoke.json`.

Necromancer vượt 999 trong 21/70 run của mẫu này, trong khi sáu class khác không có lần vượt 999. Cần đánh giá và chốt cân bằng class trước khi bỏ legacy. Bộ chức năng và giao dịch đã qua kiểm tra không đồng nghĩa cân bằng đã ổn.

## Bật bản mới và quay lại legacy

Cập nhật mô phỏng theo yêu cầu 100 run/class: xem `docs/releases/hardcore-2.0.0-simulation-100-optimized.md`. Sau 560 run chọn chiến thuật và 700 run đo bằng seed riêng, Necromancer hoàn thành 26/100, Assassin 1/100, các class khác 0/100. Không timeout trong mẫu; cân bằng vẫn cần xử lý trước khi bỏ legacy. Đây là lựa chọn tốt nhất trong bốn chiến thuật đã thử, không phải chứng minh tối ưu tuyệt đối.

Đưa đầy đủ `src` lên server rồi restart bot sẽ nạp catalog mới và chạy migration. Catalog Sinh tồn là mã nguồn, item được snapshot trong state run; không cần thao tác nhập item riêng vào bảng shop/economy.

Mặc định hoặc `HARDCORE_GAMEPLAY_VERSION=2.0.0`: run mới dùng v2. Đặt `HARDCORE_GAMEPLAY_VERSION=legacy` trong môi trường rồi restart: run mới quay lại legacy. Các run đã tạo luôn giữ phiên bản đã lưu, kể cả sau khi đổi cấu hình; không tự chuyển một run đang chơi giữa hai luật.

Khi chốt bỏ legacy, cần kết thúc hoặc xử lý các run cũ còn tồn tại rồi mới loại bỏ nhánh legacy và catalog cũ. Lịch sử phiên bản/archive có thể giữ để đối chiếu; gameplay v2 đã tách riêng khỏi combat và catalog legacy.
