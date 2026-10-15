# Sinh tồn V3 — simulate 13/10/2026

Mỗi class 1.000 run, tổng 7.000 run. Cấu hình hiện tại, mục tiêu hoàn thành tầng 999; không điều chỉnh cân bằng trong lượt đo.

| Class       |   Thắng | Tỷ lệ | Tới Deimoss | Tầng trung bình | Cao nhất | Vượt giới hạn lượt |
| ----------- | ------: | ----: | ----------: | --------------: | -------: | -----------------: |
| Amazon      | 0/1.000 |    0% |           0 |           405,2 |      949 |                  0 |
| Barbarian   | 3/1.000 |  0,3% |           4 |           559,9 |      999 |                  0 |
| Assassin    | 0/1.000 |    0% |           0 |             191 |      978 |                  0 |
| Sorceress   | 0/1.000 |    0% |           0 |           659,1 |      949 |                  0 |
| Druid       | 3/1.000 |  0,3% |          24 |           486,9 |      999 |                  0 |
| Necromancer | 1/1.000 |  0,1% |          13 |             579 |      999 |                  0 |
| Paladin     | 1/1.000 |  0,1% |           3 |           429,1 |      999 |                  0 |

## Cách chạy

- Chiến thuật balanced: nâng chỉ số chính xen kẽ VIT; xử lý boss bằng dấu hiệu công khai.
- Cược 100.000 xu, dữ liệu run tách biệt, không có mộ từ run trước; không dùng kim cương ngoài run.
- Không chủ động theo các chuỗi LR; bỏ qua Shrine và Blood Fountain, không mua ở Diamond Shop. Kết quả phản ánh chiến thuật này, chưa đại diện lối chơi tối ưu nhất.
- Giới hạn 40.000 hành động/run; backend memory và kiểm tra resume một lần/run để giảm chi phí lưu dữ liệu. Gameplay dùng engine hiện tại.
- Druid được chia thành 10 lô, mỗi lô 100 chỉ số run riêng; đã kiểm tra đủ dải 0–999. Các mẫu chẩn đoán và lượt bị thay thế không cộng vào kết quả.
- Seed: `survival-current-holdout-2026-10-13`.
- Code fingerprint: `d30828bce7705714442244e7c47e887b5a918842da8b03f82c1871be3431e585`.

## Điểm nghẽn quan sát

| Class       | Những tầng tử trận thường gặp    | Boss gây nhiều lần tử trận nhất                                      |
| ----------- | -------------------------------- | -------------------------------------------------------------------- |
| Amazon      | 100 (43) · 550 (42) · 500 (41)   | Inarius (69) · Manoruk (49) · Xazax (33)                             |
| Barbarian   | 700 (87) · 100 (81) · 666 (77)   | Kabraxis, Keeper of the Seals (77) · Inarius (72) · Assur (52)       |
| Assassin    | 50 (377) · 100 (179) · 150 (44)  | Inarius (75) · Assur (66) · Xazax (49)                               |
| Sorceress   | 700 (123) · 650 (73) · 666 (70)  | Kabraxis, Keeper of the Seals (70) · The Butcher (56) · Athulua (43) |
| Druid       | 50 (304) · 900 (95) · 700 (81)   | Assur (79) · Samael (74) · The Butcher (64)                          |
| Necromancer | 50 (176) · 700 (125) · 800 (112) | Sescheron's Destroyer (70) · Samael (70) · The Butcher (66)          |
| Paladin     | 50 (180) · 100 (112) · 666 (59)  | Kabraxis, Keeper of the Seals (59) · Inarius (51) · Assur (50)       |

Mục tiêu 3–5% tương đương 30–50 lần thắng trên 1.000 run mỗi class. Tỷ lệ 0/1.000 là tỷ lệ quan sát; giới hạn trên một phía 95% khoảng 0,3%, không có nghĩa game không thể thắng. Chưa chạy đối chứng trước/sau để quy nguyên nhân cho riêng thay đổi HP Lilith.

Thời điểm tổng hợp: 2026-10-13T09:33:12.890Z.
