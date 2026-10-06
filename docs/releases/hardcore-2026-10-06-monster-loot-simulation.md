# Sinh tồn — mô phỏng sau cập nhật vật phẩm và drop, 06/10/2026

7.000 run đánh giá, 1.000/class. Thắng = hạ Deimoss, sống qua tầng 999 và chốt Summit. Chạy trên engine hiện tại tại commit nền 3cb961a, với simulator đã sửa theo hành động công khai hiện hành; không chỉnh sức mạnh class.

| Class | Thắng | Tỷ lệ | Khoảng tin cậy 95% | Tầng trung bình | Trung vị | Đến Deimoss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Amazon | 92/1000 | 9.2% | 7.481–11.164% | 459.37 | 456 | 108 |
| Barbarian | 50/1000 | 5% | 3.734–6.539% | 385.93 | 326 | 57 |
| Assassin | 43/1000 | 4.3% | 3.129–5.749% | 275.89 | 99 | 47 |
| Sorceress | 108/1000 | 10.8% | 8.944–12.89% | 582.84 | 574 | 133 |
| Druid | 45/1000 | 4.5% | 3.301–5.975% | 258.87 | 49 | 47 |
| Necromancer | 69/1000 | 6.9% | 5.408–8.652% | 404.18 | 394 | 83 |
| Paladin | 55/1000 | 5.5% | 4.17–7.099% | 392.42 | 371 | 62 |

Khoảng tin cậy Clopper–Pearson hai phía. Tỷ lệ mẫu mô tả chiến thuật và điều kiện dưới đây, không phải tỷ lệ cố định của mọi người chơi.

## Điều kiện

- Cược 100.000 xu; không mang vật phẩm/vé ban đầu, không mua bằng kim cương. Item nhặt và mua bằng payout/HP trong run vẫn dùng bình thường.
- Tối đa 40.000 action/run, không có run đánh giá nào hết giới hạn lượt.
- Mỗi run tách khỏi mộ trước. Service, combat, fairness, sự kiện, item, passive, curse và drop dùng mã game thật; database tạm riêng.
- Monster drop = min(20%, 5% + LUCK × 0,5 điểm %); độ hiếm thấp/cao 60%/40%; Mimic giữ thưởng cũ và roll thêm. Boss có rương cuối khu vực không roll thêm.
- Balanced: nâng stat chính/VIT luân phiên, dùng Skill khi có thể, bình khi nguy hiểm; kiểm tra hòm và né Mimic đã lộ, bỏ Shrine, chọn rương đỏ phòng kho báu. Không đọc Mimic/kết quả ẩn hoặc seed để chọn hành động.
- Paradox: ưu tiên Huyết Ước, Giáp Nghịch Đảo, Cơn Đói hoặc Linh Hồn Bất Ổn theo cặp được đưa ra. RNGesus: chạy khi có vé hoặc tỷ lệ 100%; nếu không thì hối lộ khi đủ payout, thiếu payout thì chạy.
- 70 run cùng seed ở mỗi backend memory và SQLite cho kết quả tầng của từng run và các chỉ số tổng hợp giống hệt nhau. Pilot không tính vào 7.000 run đánh giá; seed pilot và đánh giá khác nhau.

## Phạm vi kết luận

Đây là một chiến thuật cố định, không chứng minh tối ưu. Loadout mua trước, vé hồi sinh, chiến thuật tận dụng nội tại hoặc guild có mộ có thể cho tỷ lệ khác. So với báo cáo 03/10, cả game và hành động simulator đã thay đổi; không quy toàn bộ chênh lệch cho riêng drop từ quái. Tỷ lệ từng class không còn tập trung quanh mục tiêu 1% của lần hiệu chỉnh cũ; báo cáo này không tự thay đổi cân bằng.

## Chạy lại

```powershell
$env:HARDCORE_SIM_BACKEND='memory'
$env:HARDCORE_SIM_POLICY='balanced'
$env:HARDCORE_SIM_ISOLATED='1'
$env:HARDCORE_SIM_SEED='survival-monster-loot-evaluation-2026-10-06'
Remove-Item Env:HARDCORE_SIM_POWER,Env:HARDCORE_SIM_BUILDS,Env:HARDCORE_GAMEPLAY_VERSION,Env:HARDCORE_SIM_BUILD,Env:HARDCORE_SIM_STAKE -ErrorAction SilentlyContinue
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-06-monster-loot-physical.json'
node scripts/simulate-hardcore.js 1000 999 40000 amazon,barbarian,assassin
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-06-monster-loot-magic.json'
node scripts/simulate-hardcore.js 1000 999 40000 sorceress,druid,necromancer
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-06-monster-loot-paladin.json'
node scripts/simulate-hardcore.js 1000 999 40000 paladin
```

Raw JSON theo nhóm giữ tầng của từng run. File hardcore-2026-10-06-monster-loot-simulation.json tổng hợp khoảng tin cậy, điều kiện và SHA-256 của mã nguồn dùng trong mô phỏng. Trường revealedChestAction trong raw JSON là cấu hình legacy; V2 dùng chính sách né Mimic đã lộ như mô tả trên.
