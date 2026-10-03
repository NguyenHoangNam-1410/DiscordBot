# Sinh tồn 2.0.1 — cân bằng class theo Assassin

Ngày: 2026-10-03. Gameplay/catalog vẫn là v2, database migration vẫn là 33.

## Mục tiêu và thay đổi

Mục tiêu hiệu chỉnh: khoảng **1% hoàn thành tầng 999**, theo Assassin đạt 8/800 run ở hai seed hiệu chỉnh độc lập. Không ép kết quả của từng run, không thay xác suất loot hoặc boss theo class.

Mỗi class có hệ số sức mạnh, áp dụng vào sức mạnh vật lý/phép sau khi cộng thuộc tính và trang bị, trước khi tạo dải sát thương `power−2 … power+3`. Assassin ×1 giữ đúng công thức cũ. Các hệ số này đã được hiệu chỉnh bằng mô phỏng, không phải chỉ tăng chỉ số khởi đầu.

| Class | Hệ số sức mạnh |
| --- | ---: |
| Amazon | 2,09 |
| Barbarian | 1,64 |
| Assassin | 1,00 |
| Sorceress | 1,57 |
| Druid | 1,12 |
| Necromancer | 0,54 |
| Paladin | 1,67 |

Kỹ năng giữ cơ chế riêng: Assassin né phản công, Necromancer chặn phản công và đánh phép, Druid hồi máu, Paladin thủ trước phản công, Amazon nhiều phát. HP, DEF, RES, crit, Mana, các mức thưởng, boss và catalog không bị thay đổi bởi hệ số sức mạnh này. Paradox Inverse vẫn sử dụng DEF làm sát thương vật lý theo luật riêng.

Sức mạnh mới đã được tính vào dải sát thương hiển thị. Bảng chọn class, bảng thông tin chỉ số và luật chiến đấu đều có diễn giải hệ số.

## Phiên bản và run đang chơi

- Run mới có `releaseVersion: 2.0.1`, `balanceVersion: 2.0.1`, và snapshot `balanceProfile`.
- Run 2.0.0 đã bắt đầu giữ công thức sức mạnh cũ ×1. Resume không tự gán hệ số mới.
- Run legacy v4 giữ engine/catalog legacy.
- UI của run đang chơi sử dụng phiên bản của chính state, không dùng nhãn phiên bản mới cho run cũ.
- Startup ghi thêm bản phát hành 2.0.1 vào `hardcore_releases`, giữ bản 2.0.0 và archive cũ. Không cần nhập lại item; catalog vẫn là 100 item v2.

## Mô phỏng và giới hạn kết luận

Chiến thuật hiệu chỉnh gồm sử dụng skill, chọn stat chính/VIT, tránh Shrine, mở hòm sau inspect, né Mimic đã lộ, mua đồ bằng payout/HP và hối lộ RNGesus khi không có vé. Một số chiến thuật nâng Mana và định giá item cũng đã được thử để chọn chiến thuật so sánh. Với các hệ số mới, baseline được chọn cho cả bảy class; đây không phải chứng minh tối ưu tuyệt đối trên toàn bộ cây quyết định.

Các lượt dùng tài khoản mới, cược 100.000 xu, không mua đồ bằng kim cương, tối đa 40.000 action/run. Chạy trên service/engine/fairness thật, repository trong bộ nhớ; economy/archive dùng SQLite tạm riêng. Không đọc seed hoặc kết quả ẩn để chọn action. Mỗi run xóa mộ trong database tạm trước khi bắt đầu, nên không nhận lợi thế từ mộ của run trước.

Các seed hiệu chỉnh được tách khỏi seed đánh giá cuối. Paladin có một lượt đánh giá thấp ở hệ số 1,55; lượt đó được chuyển thành dữ liệu hiệu chỉnh, giữ tại `hardcore-2.0.1-paladin-recalibration.json`. Hệ số cuối 1,67 được đánh giá lại bằng seed riêng mới.

Kết quả cuối, tầng của từng run và khoảng tin cậy được lưu tại `docs/releases/hardcore-2.0.1-simulation.json` và `docs/releases/hardcore-2.0.1-simulation.md`. Tổng 7.000 run đánh giá, 1.000/class: Amazon 14, Barbarian 6, Assassin 8, Sorceress 11, Druid 13, Necromancer 15, Paladin 15 lần hoàn thành. Không run nào hết giới hạn action. Tất cả khoảng tin cậy 95% bao phủ mục tiêu 1%; đây không phải chứng minh kỳ vọng bằng nhau.

Khoảng tin cậy phản ánh mô phỏng theo chiến thuật/môi trường đã nêu. Guild thực tế có mộ, cách chơi khác hoặc người mua đồ bằng kim cương có thể cho tỷ lệ khác; không kết luận các kỳ vọng toán học bằng nhau tuyệt đối. Tiến sâu trung bình vẫn khác giữa class, vì mục tiêu lần này là tỷ lệ hoàn thành 999. Không chạy lại unit/regression suite hoặc phiên Discord trực tiếp cho patch này.

## Công cụ và dữ liệu hiệu chỉnh

- `src/services/hardcoreBalance.js`: hệ số chính thức, validation và snapshot cho run.
- `scripts/calibrate-hardcore-balance.js`: nội suy điểm ước lượng bằng mô hình logistic theo log hệ số, mục tiêu 1%; không dùng mô hình này để suy ra khoảng tin cậy từ các seed hiệu chỉnh lặp lại.
- `hardcore-2.0.1-calibration-model.json`: dữ liệu và hệ số đã chọn.
- Các file `hardcore-2.0.1-calibration-*`, `confirmation`, `mage-*`, `paladin-*`, `policy2-baseline` và `assassin-reference`: lịch sử thử nghiệm, không phải tỷ lệ hoàn thành của bản chốt.

Đưa đầy đủ `src` lên server và restart bot sẽ áp dụng bản cân bằng cho run mới. Phiên đang chơi giữ hệ số đã lưu. Chưa deploy hoặc restart server trong tác vụ này.
