# Sinh tồn V3 — roster 39 boss

Mục tiêu cân bằng được người dùng chốt ngày 12/10/2026: 3–5% hoàn thành tầng 999 cho mỗi class trong mô phỏng chuẩn. Roster 2 mặc định cho run V3 mới sau khi kiểm tra bắt buộc và tỷ lệ mẫu đạt mục tiêu. Run đang tồn tại dùng phiên bản đã lưu; thiếu roster được nhận diện là roster 1. Có thể chọn roster cũ cho run mới bằng HARDCORE_BOSS_ROSTER_VERSION=1.

## Phạm vi

- Một pool 39 boss thường, chọn độc lập và đồng đều tại 50, 100, …, 950. Cho phép trùng và lặp liên tiếp. Chỉ roll khi vào encounter và lưu boss/mechanic trước render; không có lịch tương lai.
- Tầng 333 giữ event Threefold Prophecy, 666 giữ Kabraxis và cửa rút trước trận, 999 giữ Deimoss. Thưởng rương, drop LUCK, cược, payout và kim cương theo tầng giữ luật hiện hành.
- Ba bộ tham số Depth I (50–300), II (350–650), III (700–950) riêng cho từng mechanic. Heal boss hữu hạn, stack có trần, có manh mối và đối sách công khai.
- Selector mục tiêu/Ward/Plane miễn lượt, không gọi RNG, không hồi tài nguyên hoặc chạy đầu/cuối lượt. Boss action là một lượt đầy đủ. Revision đổi sau selector để chặn nút cũ và giao dịch song song.
- HP của module/wave/Spire nằm trong tổng HP trận. Không cấp drop/thưởng cho mục tiêu phụ. Damage dư không xuyên Spire/bar; chuyển phase Deimoss không phản công, chỉ phase cuối trao thưởng.
- Kabraxis dùng ba cách tích Resonance và năm Corrupted Seal tối đa. Deimoss dùng ba Spire, ba Flesh Core với lựa chọn/curse đã khóa và ba Plane.
- Run đã tồn tại giữ roster đã lưu; thiếu trường roster giữ roster 1; implementation cũ được giữ nguyên trong legacyMechanics.js. Không thay đổi Tower mode, công thức thuộc tính/mastery của V3, kỹ năng, định nghĩa item hoặc phần thưởng.

## Hiệu chỉnh cân bằng

HP/DMG nền vẫn lấy từ tầng và Rift. Cấu hình common của Depth I: HP ×0,90 / DMG ×0,90; Depth II: HP ×1,00 / DMG ×1,12; Depth III: HP ×1,15 / DMG ×1,15. Assur và Inarius, hai boss khó nổi bật trong ma trận đầu, dùng HP ×0,90/0,95/1,00 và DMG ×0,90/1,00/1,05. Cửa sổ Purify của Assur là 4/4/3 lượt. Catalog kiểm tra biên ±10/12/15% theo Depth; integer damage làm tròn theo engine. Kabraxis/Deimoss có cấu hình final cố định HP/DMG ×1,15.

Hệ số Tấn công/Skill khi đấu boss được snapshot riêng trong bossDamageProfile của run mới và playerDamageScale của encounter. Hệ số này áp dụng trước giảm DEF/RES và có trong preview/Chi tiết. Nó không đổi STR/DEX/VIT/ENE, mastery, kỹ năng hoặc sát thương đánh quái thường/elite/boss của chain LR. Selector không cập nhật hệ số. Thay cấu hình sau này không đổi hệ số của run đang tồn tại.

## Phương pháp mô phỏng

Mô phỏng 999 tầng dùng service và fairness thật, backend memory, từng run độc lập không có mộ của run trước, cược 100.000 xu, không kim cương ngoài run hoặc loadout mua sẵn, tối đa 40.000 revision. Policy balanced chọn main/VIT luân phiên ở checkpoint và dùng manh mối công khai của boss. Vì là một chiến thuật chuẩn và không mang đồ đầu run, đây không phải tỷ lệ thắng bảo đảm cho mọi chiến thuật/loadout của người chơi.

Calibration đã chạy trên seed survival-holdout-2026-10-02 và survival-boss-holdout-2026-10-12. Bộ kiểm chứng dùng seed riêng survival-boss-verification-2026-10-12, 500 run/class. Sorceress được chỉnh từ hệ số 1,50 lên 1,60 sau mẫu 2,8%; do đó thêm 500 run với seed survival-boss-confirmation-2026-10-12 ở cùng hệ số 1,60. Hai mẫu Sorceress là 20/500 (4,0%) và 12/500 (2,4%); báo cáo cả hai và gộp 32/1.000 (3,2%), không chọn riêng mẫu cao hơn. Tổng bộ tham số cuối có 4.000 run. Tỷ lệ dưới đây là ước lượng mẫu; khoảng tin cậy thể hiện sai số thống kê.

Chế độ once_per_run chỉ bỏ việc normalize lại cùng object ở backend memory để tăng tốc offline; production luôn validate khi đọc session. Đối chiếu 70 run (10/class) với each_action cho toàn bộ runFloors giống nhau. Kiểm tra SQLite thật vẫn dùng normalize/revision/transaction thật.

Ma trận boss kiểm tra 7 class × 4 build × 39 boss × 6 tầng (50/300/350/650/700/950) × 10 thử, tổng 65.520 trận thường và 560 trận fixed. Fixture progression là build tổng hợp có trang bị tăng theo tầng và UR đã giải nguyền, đầy HP/MP/bình, Rift phân bổ đều, không LR. Nó kiểm tra khả năng xử lý và chênh lệch độ khó, không mô hình hóa tỷ lệ nhặt trang bị trong run. Fixture thin (chỉ 5 SSR) vẫn có thể chạy bằng HARDCORE_SIM_BOSS_GEAR=thin.

Ma trận đầu bị loại khỏi kết luận release: helper đã tái dùng chỉ số sau mechanic roster 1, gồm HP phase 1 của Deimoss và DEF của Anomaly. Fixture cuối sinh đúng enemy roster 2 từ catalog, không chép chỉ số đã biến đổi từ roster cũ.

## Kiểm tra

- 10.000 lịch trình: đủ 39 boss tại từng mốc, phân bố gần đều trong sáu độ lệch chuẩn, có lặp, đúng Depth, mốc fixed không tiêu RNG của pool.
- 41 boss × 100 render/preview: không thay state/RNG, serialize/normalize giữ trận, embed/component trong giới hạn Discord.
- 7 class × 39 boss × 3 Depth: mọi component mở đầu, hành động chung, HP/MP hợp lệ.
- Đổi selector 100 lần không hồi tài nguyên, không gọi RNG hoặc tiến combat; giao dịch SQLite kiểm tra stale/forged, selector đấu combat và claim thưởng một lần.
- 96 tổ hợp ấn/Seal của Kabraxis; đủ sáu thứ tự Spire, ba lựa chọn Core và ba Plane; kiểm tra chuyển phase và thưởng.
- Hồi Hunger giữ tổng HP Spire và không hồi sinh Spire đã phá; Web chuyển đúng hai lượt; Meltdown vẫn xử lý khi đòn kết liễu; manh mối tính theo từng hit của Multishot.
- Quét toàn bộ 64 suite: 56 đạt, 8 lỗi cũng tái hiện trên commit trước thay đổi (fed7d49). Các lỗi cũ ở loadout/RNGesus, text tax, registry command, scale legacy, số migration, word-count, Shrine lifecycle và buff admin. Không sửa gameplay khác để làm các assertion cũ qua.

Kết quả ma trận cuối: 0 timeout và 0 tổ hợp class/boss/tầng không có build thắng. Mỗi class có ít nhất một build đạt 10/10 trước cả Kabraxis và Deimoss trong fixture chuẩn bị. Trong pool, trung vị tỷ lệ thắng theo boss là 91,9%; thấp nhất Inarius 75,4%, Assur 76,0% sau giảm độ khó. Đây là tỷ lệ của fixture, tách biệt tỷ lệ hoàn thành run.

Bộ kiểm tra V2 cũ chọn rõ roster 1 để giữ fixture HP của Deimoss cũ; roster mới có kiểm tra chuyển phase/HP Spire riêng. Audit cuối: [kết quả các suite](hardcore-3-boss-test-audit.json).

## Kết quả mô phỏng 999 tầng

| Class       | Roster cũ (100 run) | Roster mới | Hoàn thành | Wilson 95% | DMG đấu boss |
| ----------- | ------------------: | ---------: | ---------: | ---------: | -----------: |
| amazon      |               0/100 |     19/500 |       3.8% | 2.45–5.86% |         ×3.5 |
| barbarian   |               0/100 |     15/500 |       3.0% | 1.83–4.89% |        ×0.95 |
| assassin    |               0/100 |     25/500 |       5.0% | 3.41–7.28% |        ×0.84 |
| sorceress   |               0/100 |    32/1000 |       3.2% | 2.28–4.48% |         ×1.6 |
| druid       |               2/100 |     15/500 |       3.0% | 1.83–4.89% |        ×0.48 |
| necromancer |               6/100 |     21/500 |       4.2% | 2.76–6.34% |        ×0.49 |
| paladin     |               0/100 |     20/500 |       4.0% |   2.6–6.1% |         ×0.9 |

Khoảng tin cậy là riêng cho từng class, không phải cam kết mọi mẫu/chiến thuật đều đạt 3–5%. Baseline 100 run có sai số lớn hơn; metadata balanceVersion cũ của baseline ghi phiên bản base nhưng gameplayVersion là V3. Không suy diễn rằng class có 0/100 thắng là không thể thắng.

Nguồn dữ liệu: [full runs](hardcore-3-boss-roster-v2-full-runs.json), [baseline](hardcore-3-boss-roster-v1-full-runs.json), [ma trận](hardcore-3-boss-roster-v2-matrix.json), [audit calibration](hardcore-3-boss-calibration-audit.json). Fingerprint trong mỗi artifact là hash các nguồn engine/boss cốt lõi tại lúc khởi chạy job, không thay thế commit Git của release.

### Chạy lại bằng PowerShell

```powershell
$env:HARDCORE_SIM_BOSS_ROSTER = "current" # "fixed" để dùng roster cũ
$env:HARDCORE_SIM_BACKEND = "memory"
$env:HARDCORE_SIM_ISOLATED = "1"
$env:HARDCORE_SIM_RESUME_VALIDATION = "once_per_run"
$env:HARDCORE_SIM_SEED = "survival-boss-verification-2026-10-12"
$env:HARDCORE_SIM_OUTPUT = "D:/DiscordBot/docs/releases/boss-rerun.json"
node scripts/simulate-hardcore.js 500 999 40000 all
```

Không đặt HARDCORE_SIM_BOSS_DAMAGE khi kiểm chứng production; đó là override chỉ phục vụ tìm tham số offline và sẽ nhân thêm vào profile đã lưu. Dùng HARDCORE_SIM_RESUME_VALIDATION=each_action nếu muốn kiểm tra đầy đủ mỗi action offline; không có bypass này trong production.

```powershell
$env:HARDCORE_SIM_OUTPUT = "D:/DiscordBot/docs/releases/boss-matrix-rerun.json"
node scripts/simulate-hardcore-boss-roster-v2.js 10
npm run test:hardcore:bosses:v2
```
