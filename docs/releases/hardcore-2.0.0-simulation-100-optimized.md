# Sinh tồn 2.0.0 — 100 run/class, chọn chiến thuật

Ngày chạy: 2026-10-03. Engine và luật 2.0.0 không thay đổi trong lần mô phỏng này.

## Phương pháp

- Mục tiêu: vượt tầng 999; nếu các chiến thuật có cùng số lần hoàn thành, ưu tiên tầng vượt trung bình cao hơn.
- Chọn chiến thuật bằng 20 run/class/chiến thuật, gồm baseline, power, guard, mana: tổng 560 run thử. Seed `survival-v2-tuning-2026-10-03`.
- Khóa lựa chọn rồi đo 100 run cho mỗi class, tổng 700 run, seed riêng `survival-v2-evaluation-100-2026-10-03`.
- Cược 100.000 xu; tài khoản thử được cấp 1.000.000 xu để đặt cược. Không mua đồ bằng kim cương; shop dùng payout hoặc HP vẫn được sử dụng theo chiến thuật.
- Tối đa 40.000 action/run; backend memory dùng service, combat, event, catalog và fairness thật. Database SQLite tạm riêng chứa economy/archive/echo và được xóa sau khi chạy, không sử dụng database của bot.
- Không đọc seed, kết quả xúc xắc tiếp theo, vật phẩm ẩn, tay Duelist hoặc kết quả sự kiện chưa công bố. Treasure Room chỉ sử dụng thông báo sau khi soi hòm.
- Các run cùng guild mô phỏng: mộ từ run trước có thể xuất hiện ở run sau. Mẫu này mô phỏng một guild đang có người chơi, không phải 700 thế giới tách biệt; không suy ra khoảng tin cậy độc lập từ kết quả này.
- Đây là chiến thuật tốt nhất trong bốn phương án đã thử, không phải chứng minh tối ưu tuyệt đối cho toàn bộ cây quyết định.

## Kết quả chính

Tầng trong bảng là tầng **đã vượt**, không phải tầng chết hoặc tầng vừa bước vào.

| Class | Chiến thuật | Tầng trung bình | Trung vị | Cao nhất | Vượt 100 | Đến boss 999 | Vượt 999 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Amazon | baseline | 63,82 | 49 | 199 | 1/100 | 0/100 | 0/100 |
| Barbarian | baseline | 72,34 | 49 | 199 | 4/100 | 0/100 | 0/100 |
| Assassin | baseline | 134,10 | 83 | 999 | 12/100 | 3/100 | 1/100 |
| Sorceress | mana | 269,11 | 109 | 949 | 50/100 | 0/100 | 0/100 |
| Druid | baseline | 103,26 | 49 | 998 | 10/100 | 1/100 | 0/100 |
| Necromancer | baseline | 761,82 | 998 | 999 | 78/100 | 62/100 | 26/100 |
| Paladin | power | 55,56 | 48 | 699 | 3/100 | 0/100 | 0/100 |

Không có run nào hết giới hạn action trong mẫu 700 run. Run thắng được thực hiện action chốt Summit và settlement, không chỉ kiểm tra cờ thắng rồi ép forfeit. Mô phỏng này không kiểm tra tương tác nút trực tiếp trên Discord.

## Đánh giá cân bằng

Necromancer là class nổi bật nhất: 62 lần đến boss cuối, 26 lần hoàn thành. Assassin có 1 lần hoàn thành, năm class còn lại không có lần hoàn thành trong mẫu này. Đây là chênh lệch lớn cần xử lý trước khi bỏ bản cũ; kết quả 0/100 không có nghĩa xác suất thật bằng 0.

Boss tầng 50 là điểm chết phổ biến: Amazon 40/100, Barbarian 52/100, Assassin 36/100, Sorceress 29/100, Druid 53/100, Paladin 36/100. Boss tầng 100 tiếp tục chặn nhiều run. Necromancer chết tại boss 999 trong 36/100 run.

Kỹ năng Necromancer gây sát thương phép và chặn phản công, kết hợp hồi Mana từ đánh thường; đó là một cơ chế có thể góp phần tạo lợi thế, nhưng mẫu này chưa tách riêng tác động của từng yếu tố bằng thí nghiệm đối chứng.

## Dữ liệu và chạy lại

- `hardcore-2.0.0-simulation-100-optimized.json`: kết quả chính, danh sách tầng của từng run và các mốc chết.
- `hardcore-2.0.0-policy-selection.json`: tiêu chí, seed thử và chiến thuật đã chọn.
- `hardcore-2.0.0-pilot-{baseline,power,guard,mana}.json`: kết quả chọn chiến thuật.
- `scripts/hardcore-optimal-policy.js`: lựa chọn theo chỉ số, Mana, HP, đồ công khai và thông báo sự kiện.

```powershell
$env:HARDCORE_SIM_BACKEND='memory'
$env:HARDCORE_SIM_POLICY='optimized'
$env:HARDCORE_SIM_SEED='survival-v2-evaluation-100-2026-10-03'
$env:HARDCORE_SIM_BUILDS='{"amazon":"baseline","barbarian":"baseline","assassin":"baseline","sorceress":"mana","druid":"baseline","necromancer":"baseline","paladin":"power"}'
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2.0.0-simulation-100-optimized.json'
node scripts/simulate-hardcore.js 100 999 40000 all
```

Seed cố định kiểm soát RNG của từng run. Do echo còn phụ thuộc trạng thái guild và thời điểm ghi archive, không cam kết môi trường khác tạo kết quả byte-identical.
