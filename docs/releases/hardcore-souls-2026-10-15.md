# Sinh tồn V3.1.0 — tinh hồn S1–S6 và mô phỏng S6

Cập nhật: lúc 12:13:55 GMT+7 Thứ Năm, 15 tháng 10, 2026.

Đã triển khai 42 hiệu ứng S1–S6 cho 7 nhân vật SR. Các bậc cộng dồn; tài khoản mặc định vẫn S0. Chưa mở gacha, thẻ hoặc thao tác nâng tinh hồn. Mỗi run giữ snapshot cấp và thông số; run cũ thiếu snapshot dùng S0. Tower không áp dụng tinh hồn.

## Kết quả cuối — 100 run S6 mỗi nhân vật

Thắng nghĩa là hạ boss cuối tầng 999 và còn sống. Bảng này dùng đúng 100 run có chỉ số 0–99 cho mỗi cấu hình được chọn, tổng 700 run. Không cộng các lần hiệu chỉnh vào mẫu cuối.

| Nhân vật | Hoàn thành | Tỷ lệ mẫu | Wilson 95% | Tầng trung bình | Gặp boss cuối | Timeout |
|---|---:|---:|---:|---:|---:|---:|
| Amazon | 30/100 | 30% | 21.9–39.6% | 836.21 | 32 | 0 |
| Barbarian | 30/100 | 30% | 21.9–39.6% | 690.69 | 35 | 0 |
| Assassin | 33/100 | 33% | 24.6–42.7% | 558.17 | 33 | 0 |
| Sorceress | 32/100 | 32% | 23.7–41.7% | 921.05 | 36 | 0 |
| Druid | 30/100 | 30% | 21.9–39.6% | 737.73 | 37 | 0 |
| Necromancer | 30/100 | 30% | 21.9–39.6% | 788.21 | 33 | 0 |
| Paladin | 34/100 | 34% | 25.5–43.7% | 725.16 | 35 | 0 |

Đây là **tập hiệu chỉnh**, chưa phải kiểm chứng độc lập. Seed được dùng lại giữa các hệ số, mặc dù tên seed có chữ holdout. Khoảng Wilson chỉ mô tả độ bất định của mẫu; chưa tính thiên lệch do chọn hệ số. 100 run/nhân vật chưa đủ để khẳng định tỷ lệ thực tế luôn nằm trong 30–35%.

## Hiệu chỉnh S6

42 cơ chế riêng theo [bản thiết kế tinh hồn](../sr-character-souls-design.md) đã chạy trong combat. Các cơ chế đó một mình chưa đạt mục tiêu, nên S6 có thêm hệ số DMG Attack/Skill lên boss theo nhân vật. Hệ số này áp dụng từ tầng 1, gồm hit phụ nội tại; sát thương cố định của cơ chế boss không được nhân. Điều kiện shield/module, miễn sát thương và thất bại boss vẫn giữ.

| Nhân vật | Bonus boss riêng S6 | Hệ số boss nền giữ nguyên | S6 trước hiệu chỉnh | S6 cuối |
|---|---:|---:|---:|---:|
| Amazon | ×3.4 (+240%) | ×2.1 | 9% | 30% |
| Barbarian | ×1.55 (+55%) | ×0.504 | 14% | 30% |
| Assassin | ×1.62 (+62%) | ×0.36 | 10% | 33% |
| Sorceress | ×1.4 (+40%) | ×1.6 | 21% | 32% |
| Druid | ×1.5 (+50%) | ×0.3 | 15% | 30% |
| Necromancer | ×2.6 (+160%) | ×0.135 | 6% | 30% |
| Paladin | ×1.4 (+40%) | ×0.5 | 21% | 34% |

Các con số “trước hiệu chỉnh” cũng là S6, **không phải S0**. S0–S5 không nhận hệ số boss riêng S6. Mẫu S0 khoảng 11% là tham chiếu lịch sử, chưa chạy lại trong đợt này. UI nhân vật công khai bonus boss S6; cấp và thông số được snapshot khi bắt đầu run.

## Cách chạy và giới hạn

- Script: scripts/simulate-hardcore.js; gameplay V3.1.0, roster hiện hành, policy balanced, cược 100.000 xu, đích 999, tối đa 40.000 action/run, không tái đấu boss cuối.
- Seed: survival-current-holdout-2026-10-13; chỉ số run 0–99 cho mỗi nhân vật. Các shard dùng offset tách biệt để tái tạo cùng 100 run.
- Dùng service, combat và fairness thật. Repository session lưu bộ nhớ để giảm chi phí serialize; kinh tế dùng SQLite tạm, kiểm tra resume một lần/run. Lưu/đọc SQLite và chống lặp lượt được kiểm tra riêng trong bộ test.
- Mỗi run tách biệt, không nhặt mộ từ run trước; không cấp diamond bên ngoài, không chủ động farm chuỗi LR.
- Policy checkpoint hiện hành dùng stat chính STR/DEX/ENE xen VIT; Paladin vẫn theo STR/VIT của policy này. Chưa đo build Paladin ưu tiên VIT riêng.
- Chưa có mẫu thống kê S1–S5, quét build tối ưu hoặc seed xác minh mới. Không suy rộng trực tiếp sang chiến thuật người chơi, đội hình item hiếm hay mọi bậc tinh hồn.

Để tái tạo một shard, đặt HARDCORE_SIM_SOUL_LEVEL=6, HARDCORE_SIM_BACKEND=memory, HARDCORE_SIM_RESUME_VALIDATION=once_per_run, HARDCORE_SIM_ISOLATED=1, HARDCORE_SIM_POLICY=balanced, HARDCORE_SIM_SEED=survival-current-holdout-2026-10-13, HARDCORE_SIM_RUN_OFFSET=0 hoặc 50, cùng HARDCORE_SIM_OUTPUT, rồi chạy: node scripts/simulate-hardcore.js 50 999 40000 <profile> 0.

## Dữ liệu gốc dùng cho bảng cuối

- **Amazon**: [hardcore-souls-2026-10-15-trial4-amazon-0.json](hardcore-souls-2026-10-15-trial4-amazon-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial4-amazon-50.json](hardcore-souls-2026-10-15-trial4-amazon-50.json) · offset 50 · 50 run
- **Barbarian**: [hardcore-souls-2026-10-15-trial2-barbarian-0.json](hardcore-souls-2026-10-15-trial2-barbarian-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial2-barbarian-50.json](hardcore-souls-2026-10-15-trial2-barbarian-50.json) · offset 50 · 50 run
- **Assassin**: [hardcore-souls-2026-10-15-trial7-assassin-0.json](hardcore-souls-2026-10-15-trial7-assassin-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial7-assassin-50.json](hardcore-souls-2026-10-15-trial7-assassin-50.json) · offset 50 · 50 run
- **Sorceress**: [hardcore-souls-2026-10-15-trial4-sorceress-0.json](hardcore-souls-2026-10-15-trial4-sorceress-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial4-sorceress-50.json](hardcore-souls-2026-10-15-trial4-sorceress-50.json) · offset 50 · 50 run
- **Druid**: [hardcore-souls-2026-10-15-trial1-druid.json](hardcore-souls-2026-10-15-trial1-druid.json) · offset 0 · 100 run
- **Necromancer**: [hardcore-souls-2026-10-15-trial4-necromancer-0.json](hardcore-souls-2026-10-15-trial4-necromancer-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial4-necromancer-50.json](hardcore-souls-2026-10-15-trial4-necromancer-50.json) · offset 50 · 50 run
- **Paladin**: [hardcore-souls-2026-10-15-trial3-paladin-0.json](hardcore-souls-2026-10-15-trial3-paladin-0.json) · offset 0 · 50 run; [hardcore-souls-2026-10-15-trial3-paladin-50.json](hardcore-souls-2026-10-15-trial3-paladin-50.json) · offset 50 · 50 run

[JSON tổng hợp](hardcore-souls-2026-10-15.json) lưu toàn bộ tầng kết thúc, boss gây tử trận, tham số, SHA-256 từng file và fingerprint source theo từng shard. Fingerprint được giữ riêng; định dạng source/UI/test/tài liệu bổ sung sau khi khởi chạy không thay cơ chế đã đo.

Druid được chạy thêm 5 shard ×20 để tăng tốc. Đã kiểm tra chúng giống hệt 100 run trial1 theo thứ tự offset; báo cáo cuối chỉ dùng file trial1, không cộng trùng 100 run này.

## Lịch sử hiệu chỉnh

Mỗi hàng dưới là một cấu hình đủ 100 run riêng. Không gộp tỷ lệ giữa các hàng; việc đổi hệ số có thể đổi cả đường đi và các lượt RNG về sau nên kết quả cùng seed không nhất thiết tăng đơn điệu.

| Lần thử | Nhân vật | Hệ số boss S6 | Hoàn thành |
|---|---|---:|---:|
| initial | Amazon | ×1 | 9/100 |
| initial | Barbarian | ×1 | 14/100 |
| initial | Assassin | ×1 | 10/100 |
| initial | Sorceress | ×1 | 21/100 |
| initial | Druid | ×1 | 15/100 |
| initial | Necromancer | ×1 | 6/100 |
| initial | Paladin | ×1 | 21/100 |
| trial1 | Amazon | ×2 | 15/100 |
| trial1 | Barbarian | ×1.5 | 29/100 |
| trial1 | Assassin | ×1.25 | 19/100 |
| trial1 | Sorceress | ×1.5 | 36/100 |
| trial1 | Druid | ×1.5 | 30/100 |
| trial1 | Necromancer | ×2 | 26/100 |
| trial1 | Paladin | ×1.2 | 23/100 |
| trial2 | Amazon | ×3.5 | 36/100 |
| trial2 | Barbarian | ×1.55 | 30/100 |
| trial2 | Assassin | ×1.6 | 27/100 |
| trial2 | Sorceress | ×1.45 | 36/100 |
| trial2 | Necromancer | ×2.7 | 37/100 |
| trial2 | Paladin | ×1.7 | 45/100 |
| trial3 | Amazon | ×3.3 | 27/100 |
| trial3 | Assassin | ×1.75 | 38/100 |
| trial3 | Necromancer | ×2.4 | 19/100 |
| trial3 | Paladin | ×1.4 | 34/100 |
| trial4 | Amazon | ×3.4 | 30/100 |
| trial4 | Assassin | ×1.68 | 38/100 |
| trial4 | Sorceress | ×1.4 | 32/100 |
| trial4 | Necromancer | ×2.6 | 30/100 |
| trial5 | Assassin | ×1.65 | 40/100 |
| trial6 | Assassin | ×1.61 | 31/100 |
| trial7 | Assassin | ×1.62 | 33/100 |

## Kiểm thử

- 13 nhóm test tinh hồn: đủ 7 nhân vật ×S0–S6, ngưỡng mở hiệu ứng, damage preview không sửa state, hồi HP/MP, một lần/combat qua phase, hit phụ, snapshot và giao dịch SQLite/chống retry.
- Đối chiếu S0 có snapshot với run cũ thiếu snapshot: cùng hành động và RNG cho kết quả combat giống nhau ở cả 7 nhân vật.
- Bộ test nhân vật/UI, cân bằng V3.1, Innate, Awakening, boss menus, Rift V3, Equipment V3, Stats V3, event recovery, module boundaries và Tower runtime đã qua. Changelog cũng qua kiểm thử.
- Không chạy toàn bộ npm test; các phần game khác không thuộc thay đổi này.
