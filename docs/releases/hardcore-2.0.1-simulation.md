# Sinh tồn 2.0.1 — đánh giá cân bằng class

Mục tiêu khoảng 1% hoàn thành tầng 999 theo Assassin (8/800 ở dữ liệu hiệu chỉnh). Hệ số và chiến thuật được khóa trước lượt đánh giá của từng class. Tổng 7.000 run đánh giá cuối, 1.000/class.

| Class | Sức mạnh | Hoàn thành 999 | Tỷ lệ mẫu | Khoảng tin cậy 95% | Tầng trung bình | Trung vị | Đến boss 999 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Amazon | 2.09 | 14/1000 | 1.4% | 0.767–2.338% | 314.73 | 99 | 35 |
| Barbarian | 1.64 | 6/1000 | 0.6% | 0.22–1.301% | 192.28 | 99 | 11 |
| Assassin | 1 | 8/1000 | 0.8% | 0.346–1.57% | 144.7 | 94 | 23 |
| Sorceress | 1.57 | 11/1000 | 1.1% | 0.55–1.96% | 672.5 | 799 | 57 |
| Druid | 1.12 | 13/1000 | 1.3% | 0.694–2.213% | 159.34 | 49 | 29 |
| Necromancer | 0.54 | 15/1000 | 1.5% | 0.842–2.462% | 341.02 | 49 | 57 |
| Paladin | 1.67 | 15/1000 | 1.5% | 0.842–2.462% | 219.81 | 99 | 23 |

Khoảng tin cậy Clopper–Pearson hai phía. Tất cả khoảng tin cậy đều bao phủ mục tiêu 1%; việc này không chứng minh các kỳ vọng bằng nhau hoặc thỏa một biên tương đương cụ thể. Tỷ lệ mẫu nằm trong 0,6–1,5%, Assassin 0,8%.

Hết giới hạn action: 0/7000. Run thắng có action chốt Summit/settlement. Đây là mô phỏng engine, không kiểm tra nút Discord trực tiếp.

## Điều kiện

- Cược 100.000 xu, không mua bằng kim cương; tối đa 40.000 action/run.
- Service/combat/event/catalog/fairness thật, repository memory và SQLite tạm riêng; không dùng database sản xuất.
- Mỗi run tách khỏi mộ của run trước; không chọn action theo seed, loot ẩn hoặc kết quả sự kiện chưa công bố.
- Chính sách balanced: skill, stat chính/VIT, inspect và né Mimic đã lộ, tránh Shrine; payout/HP shop, hối lộ RNGesus khi không có vé. Không chứng minh đây là tối ưu tuyệt đối.
- Điểm hiệu chỉnh dùng mô hình logistic để chọn hệ số. Seed hiệu chỉnh được tái sử dụng giữa một số ứng viên nên không dùng chúng để tính khoảng tin cậy độc lập.
- Paladin 1,55 đạt 2/1000 ở lượt trước: lượt đó đã được dùng để hiệu chỉnh, không tính vào bảng cuối. Hệ số cuối 1,67 đo bằng seed mới.
- Kỳ vọng tiến sâu trung bình vẫn khác giữa class; mục tiêu lần này là tỷ lệ hoàn thành 999. Guild có mộ, người chơi đổi chiến thuật hoặc mua đồ bằng kim cương có thể cho kết quả khác.

## Chạy lại

```powershell
$env:HARDCORE_SIM_BACKEND='memory'
$env:HARDCORE_SIM_POLICY='balanced'
$env:HARDCORE_SIM_ISOLATED='1'
$env:HARDCORE_SIM_SEED='survival-balanced-holdout-2026-10-03'
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-physical.json'
node scripts/simulate-hardcore.js 1000 999 40000 amazon,barbarian,assassin
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-magic.json'
node scripts/simulate-hardcore.js 1000 999 40000 sorceress,druid,necromancer
$env:HARDCORE_SIM_SEED='survival-balanced-paladin-final-2026-10-03'
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.1-holdout-paladin.json'
node scripts/simulate-hardcore.js 1000 999 40000 paladin
node scripts/report-hardcore-balance.js
```

Các biến HARDCORE_SIM_POWER/HARDCORE_SIM_BUILDS/HARDCORE_GAMEPLAY_VERSION nên không được đặt khi chạy lại bản chính thức. Hash nguồn và danh sách tầng của từng run nằm trong hardcore-2.0.1-simulation.json.
