# Sinh tồn v3.1.0 — đối chứng buff class

Bản mới: 6 class ×1.000 run và Druid 800 run, tổng 6.800 run được xác nhận. Đối chiếu 7.000 run v3.0.0 trước đó. Mục tiêu: hạ boss cuối và hoàn thành tầng 999.

| Class       | v3.0.0 (1.000 run/class) | v3.1.0 | Thắng mới | Tới boss cuối | Tầng trung bình trước → sau |
| ----------- | -----------------------: | -----: | --------: | ------------: | --------------------------: |
| Amazon      |                       0% |   0,7% |   7/1.000 |             9 |               405,2 → 604,8 |
| Barbarian   |                     0,3% |   0,8% |   8/1.000 |            14 |               559,9 → 582,6 |
| Assassin    |                       0% |  31,7% | 317/1.000 |           326 |                   191 → 681 |
| Sorceress   |                       0% |   0,1% |   1/1.000 |             1 |               659,1 → 702,2 |
| Druid       |                     0,3% |   2,3% |    18/800 |             — |                   486,9 → — |
| Necromancer |                     0,1% |  22,7% | 227/1.000 |           231 |                 579 → 830,5 |
| Paladin     |                     0,1% |   2,1% |  21/1.000 |            53 |               429,1 → 639,7 |

## Druid: chốt sớm theo yêu cầu

- Hai checkpoint đã xác nhận: chỉ số run 0–399 có 10 thắng/400 run; 500–899 có 8 thắng/400 run. Tổng 18/800 = 2,25%, hiển thị làm tròn một chữ số thành 2,3%.
- Dừng hai tiến trình đang chạy khi người dùng yêu cầu chốt. Mọi công việc sau checkpoint 400 run của mỗi lô không được tính vào mẫu. Không coi việc dừng tiến trình là thua thêm.
- Tiến trình chưa xuất file cuối: không có phân phối tầng, số run vượt giới hạn lượt, số run tới boss cuối hoặc trung bình chỉ số của Druid. Những ô này để trống, không suy đoán.
- Druid v3.0 dùng 1.000 run, v3.1 dùng 800 run; độ lớn mẫu khác nhau và không phải phép đối chiếu từng run. Các số đếm thắng của mẫu mới lấy từ thông báo tiến độ, được giữ trong JSON.

## Cách đo và giới hạn

- Seed survival-current-holdout-2026-10-13; chiến thuật balanced; các class đủ mẫu dùng chỉ số run 0–999, 2 lô ×500, không trùng chỉ số. Các lượt bị lỗi/thay thế không tính vào mẫu.
- Cược 100.000 xu; nâng chỉ số chính xen kẽ VIT; chọn theo dấu hiệu công khai của boss. Không chủ động làm chuỗi LR; bỏ qua Shrine và Blood Fountain, không dùng kim cương ngoài run. Tỷ lệ phản ánh chiến thuật tự động, chưa đại diện cách chơi tối ưu.
- Giới hạn 40.000 hành động/run; backend memory, kiểm tra resume một lần/run, dữ liệu run tách biệt, không mộ từ run trước. Checkpoint giữ quy tắc hiện hành.
- Bản v3.1 dùng nội tại từ tầng 1, thay đổi thức tỉnh và chỉ số trong tài liệu; đã chốt Titan +25% DEF, Fury Barrier 6% Max HP/điểm, Mark +15% DMG. Tower không áp dụng thay đổi; run v3.0 đang chơi giữ snapshot cũ.
- Cùng seed nhưng nội tại mới thêm kiểm tra né và làm thay đổi số lượt, nên chuỗi rút ngẫu nhiên có thể khác sau khi combat phân nhánh.
- Mục tiêu 3–5%: Assassin/Necromancer vượt xa; các class còn lại dưới mục tiêu trong mẫu này. Không tự điều chỉnh ngoài buff được yêu cầu sau khi đo.
- Tổng run chạm giới hạn lượt trong sáu class có file cuối: 0. Druid: chưa có dữ liệu này.
- Code fingerprint v3.1: 126ad0b7b1019bb2d5a95146b0a51c36129993d019693609082879760b98ed75.

## Điểm nghẽn sau buff

| Class       | Tầng tử trận thường gặp           | Boss gây nhiều lần tử trận nhất               |
| ----------- | --------------------------------- | --------------------------------------------- |
| Amazon      | 700 (85) · 650 (62) · 750 (57)    | inarius (81) · xazax (57) · giyua (41)        |
| Barbarian   | 700 (107) · 100 (79) · 650 (68)   | inarius (78) · assur (59) · kabraxis (58)     |
| Assassin    | 50 (106) · 100 (77) · 900 (67)    | inarius (98) · assur (90) · samael (49)       |
| Sorceress   | 700 (113) · 750 (110) · 800 (79)  | butcher (64) · sescheron (56) · kabraxis (55) |
| Necromancer | 900 (130) · 950 (123) · 800 (106) | sescheron (120) · samael (104) · baal (75)    |
| Paladin     | 900 (130) · 950 (95) · 850 (93)   | samael (70) · butcher (62) · assur (52)       |

Thời điểm tổng hợp: 2026-10-13T12:15:42.119Z.
