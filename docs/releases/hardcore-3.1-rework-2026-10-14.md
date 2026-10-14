# Sinh tồn v3.1 — cân bằng và simulate 14/10/2026

Đã áp dụng cơ chế class và loot theo buff 3.1.md. Mục tiêu mới 8–12% hoàn thành tầng 999; Druid được đo trước.

## Kết quả bản đã cố định hệ số

Mỗi class 100 run; tổng 700 run trong vòng đối chiếu cuối, không dùng hệ số thử nghiệm bên ngoài.

| Class | Theo số ban đầu trong tài liệu | Sau hiệu chỉnh, bản áp dụng | Thắng/run | Hệ số DMG nhân vật đánh boss | Tới boss cuối | Tầng trung bình |
|---|---:|---:|---:|---:|---:|---:|
| Druid | 46% | 11% | 11/100 | 0,3 | 11 | 531,1 |
| Amazon | 17% | 11% | 11/100 | 2,1 | 12 | 633,8 |
| Barbarian | 24% | 9% | 9/100 | 0,504 | 10 | 478,2 |
| Assassin | 50% | 9% | 9/100 | 0,36 | 9 | 238 |
| Sorceress | 9% | 9% | 9/100 | 1,6 | 14 | 877,5 |
| Necromancer | 29% | 9% | 9/100 | 0,135 | 10 | 540 |
| Paladin | 29% | 8% | 8/100 | 0,5 | 14 | 494 |

## Các thay đổi đã áp dụng

- Amazon giữ Bloodlust/Focus và chỉ số theo tài liệu.
- Assassin: Crit hồi 2% Max HP; giữ AVOID và Shadow Momentum.
- Barbarian: Fury Barrier 5% Max HP/Fury; giữ Titan +25% DEF, miễn Crit ở phản công kế.
- Druid: Mark +20%; sau thức tỉnh Wild Regeneration hồi 10% Max HP, Bark 4% sau giảm hồi +50% lượng hồi dư thực tế, trần 18%. Trước thức tỉnh giữ hồi 12%. Hồi thêm MP có cooldown 2 combat action.
- Necromancer: đủ 3 lần Ward tạo Anchor, đánh thường dùng Anchor +15% DMG và né phản công; Grave Nova vẫn 65% sau 2 Ward.
- Paladin: Vindicate +15%, hạ mục tiêu chính kết thúc combat hồi 20% Max HP và 1 MP. Holy = 20% tổng DEF + giá trị RES (10% RES tương ứng 10); quái thường/tinh anh bỏ qua DEF, boss vẫn giảm bằng DEF và hệ số class.
- Sorceress: Mana Shield không tiêu MP, hấp thụ tối đa 20% Max HP, 2 lần/combat và nạp đủ 2 lần mỗi phase theo xác nhận của người dùng; không dùng khi Phòng thủ/DMG chuẩn/cơ chế boss. Echo 80%, 20% thêm một Echo 80%, tạo Barrier 15% Max HP; không Crit hoặc tạo Echo đệ quy.
- Loot giữ pool/độ hiếm/Affinity: trọng số món chưa có 100%, Lv.1–2 80%, Lv.3–4 50%, Lv.5 25%, Lv.6+ 10%. Tránh ID liên tiếp trong nhóm ứng viên đủ điều kiện nếu còn lựa chọn khác.
- Tổng hiệu lực item Lv.1–8: 1/2/3/3,7/4,2/4,5/4,6/4,7; mỗi cấp sau thêm 0,1. Receipt, rèn/nghiền và giải nguyền dùng cùng đường cong. Nội tại/Affinity không nhân level.
- Run mới lưu classInnateRevision=2, itemLevelCurveVersion=2 và lootRulesVersion=2. Run cũ giữ cơ chế/đường cong/hệ số đã lưu; không thay gameplay Tower.

## Các vòng hiệu chỉnh

Chỉ thay hệ số DMG của nhân vật khi đánh boss giữa các vòng; giữ nguyên cơ chế và chiến thuật. Mỗi cấu hình trong bảng được đo đủ 100 run riêng.

| Class | Hệ số hiệu dụng → tỷ lệ thắng |
|---|---|
| Druid | 0,6 → 46% · 0,3 → 11% |
| Amazon | 3,5 → 17% · 2,1 → 11% · 2,275 → 13% · 2,975 → 18% |
| Barbarian | 0,7 → 24% · 0,455 → 5% · 0,504 → 9% |
| Assassin | 0,8 → 50% · 0,3 → 1% · 0,35 → 5% · 0,36 → 9% · 0,365 → 17% · 0,375 → 16% · 0,4 → 19% |
| Sorceress | 1,6 → 9% |
| Necromancer | 0,45 → 29% · 0,135 → 9% · 0,2925 → 29% |
| Paladin | 0,7 → 29% · 0,42 → 6% · 0,455 → 5% · 0,5 → 8% |

Tổng lượt chạy hiệu chỉnh: 2400. Vòng đối chiếu cuối: 700 run. Không cộng các cấu hình lặp lại thành một mẫu thắng chung.

## Phương pháp và giới hạn

- Seed survival-current-holdout-2026-10-13; chiến thuật balanced, nâng chỉ số chính xen kẽ VIT và xử lý dấu hiệu boss công khai. Chỉ số run 0–99/class, các lô không trùng nhau trong cùng cấu hình. Druid chia 10 lô ×10; class khác 4 lô ×25.
- Roster current, checkpoint baseline, cược 100.000 xu, dữ liệu tách biệt, không mộ từ run cũ, không kim cương ngoài run. Không chủ động theo chuỗi LR; các sự kiện ngẫu nhiên vẫn dùng quy tắc game.
- Giới hạn 40.000 hành động/run; memory backend và kiểm tra resume một lần/run. Tổng run chạm giới hạn lượt trong bản đối chiếu cuối: 0.
- Các hệ số thử nghiệm được áp vào DMG đánh boss, sau đó cố định vào snapshot cho run mới. Dữ liệu vòng cuối không còn override. Hệ số này ảnh hưởng cả boss sớm, nên tỷ lệ thắng giống nhau không có nghĩa tiến độ giữa các class giống nhau; xem tầng trung bình và bảng tử trận.
- 100 run/class là mẫu hiệu chỉnh tối thiểu theo tài liệu. Cùng bộ seed được dùng để chọn hệ số và đối chiếu, chưa có kiểm chứng bằng holdout độc lập. Tỷ lệ 8–12% ở mẫu này chưa bảo đảm tỷ lệ thực tế hoặc chiến thuật tối ưu nhất cũng nằm trong khoảng đó.
- JSON giữ dữ liệu từng run, nguồn lô, phân phối tử trận và khoảng Wilson 95% tham khảo cho cấu hình cố định; khoảng này không tính sai lệch do chọn hệ số trên cùng dữ liệu.
- Fingerprint vòng ban đầu/hiệu chỉnh: 9a782aded3cdb75a4023e9fb8d6f4fdb0cde1e9ab2765c3f37e148df68b9a5ca.
- Fingerprint vòng bản áp dụng: a39a7ae15df3edfefc82052ce8aaa47672d6abae3f3989ae592f79df639328a0.

## Điểm nghẽn ở bản áp dụng

| Class | Tầng tử trận thường gặp | Boss gây nhiều lần tử trận nhất |
|---|---|---|
| Druid | 50 (30) · 950 (15) · 100 (9) | Assur (13) · The Butcher (10) · Samael (8) |
| Amazon | 700 (10) · 550 (6) · 650 (6) | Inarius (12) · Spirit of Giyua (8) · Manoruk (6) |
| Barbarian | 50 (22) · 100 (14) · 700 (7) | Inarius (8) · Spirit of Giyua (6) · Manoruk (5) |
| Assassin | 50 (54) · 100 (17) · 150 (5) | Assur (8) · Spirit of Giyua (7) · Phoboss (7) |
| Sorceress | 900 (25) · 950 (20) · 850 (10) | Gharbad the Weak (8) · The Butcher (7) · Athulua (7) |
| Necromancer | 50 (28) · 800 (9) · 750 (8) | Sescheron's Destroyer (14) · Inarius (13) · Assur (9) |
| Paladin | 50 (33) · 100 (13) · 950 (10) | Samael (11) · Deimoss the Fleshweaver (6) · Assur (5) |

Thời điểm tổng hợp: 2026-10-14T08:30:09.772Z.
