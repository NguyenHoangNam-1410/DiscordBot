# Sinh tồn — so sánh checkpoint từ tầng 700, 07/10/2026

14.000 run đánh giá: 1.000/class/cấu hình. Thắng = hạ Deimoss tầng 999, còn sống và chốt Summit. Hai cấu hình được đo lại trên cùng mã nguồn hiện tại và seed; báo cáo cũ 06/10 không dùng làm đối chứng.

- Hiện tại: checkpoint mỗi 5 tầng, +5 vào một thuộc tính, hồi đầy HP và +2 bình.
- Đề xuất: trước 700 giữ nguyên; sau khi vượt tầng 700, checkpoint ở 700, 710, …, 990, +10 vào một thuộc tính, hồi đầy HP và +2 bình. Các mốc 705, 715, …, 995 không có checkpoint.
- 700–999: hai cấu hình đều cộng tổng **300 điểm** nếu đi hết; số lần hồi đầy HP/nhận bình giảm **60 → 30**, lượng bình bổ sung danh nghĩa giảm **120 → 60** (thực nhận tùy giới hạn túi). Khoảng chiến đấu giữa lần hồi đầy tăng 5 → 10 tầng.
- Luật thật chưa đổi; thử nghiệm nạp bản sao hai module vào riêng tiến trình simulator. Không thay đổi Tower.

| Class       | Thắng hiện tại | Tỷ lệ | Thắng đề xuất | Tỷ lệ | Chênh lệch điểm % | Khoảng 95% chênh lệch | Kết luận mẫu |
| ----------- | -------------: | ----: | ------------: | ----: | ----------------: | --------------------: | ------------ |
| Amazon      |       356/1000 | 35,6% |      236/1000 | 23,6% |               -12 |        -14,8 đến -9,2 | Giảm rõ      |
| Barbarian   |       263/1000 | 26,3% |       86/1000 |  8,6% |             -17,7 |     -20,21 đến -15,19 | Giảm rõ      |
| Assassin    |       217/1000 | 21,7% |      163/1000 | 16,3% |              -5,4 |       -7,37 đến -3,43 | Giảm rõ      |
| Sorceress   |       510/1000 |   51% |      311/1000 | 31,1% |             -19,9 |     -23,19 đến -16,61 | Giảm rõ      |
| Druid       |       168/1000 | 16,8% |      138/1000 | 13,8% |                -3 |       -4,74 đến -1,26 | Giảm rõ      |
| Necromancer |       340/1000 |   34% |      235/1000 | 23,5% |             -10,5 |      -13,06 đến -7,94 | Giảm rõ      |
| Paladin     |       301/1000 | 30,1% |      159/1000 | 15,9% |             -14,2 |     -16,71 đến -11,69 | Giảm rõ      |

## Nhận xét

Cả bảy class đều giảm tỷ lệ thắng trong chiến thuật được đo. Barbarian chịu mức giảm tương đối lớn nhất: 67,3% so với tỷ lệ hiện tại của chính class đó.

Gấp đôi điểm mỗi lần chọn bù việc giảm một nửa số lần chọn, nên tổng điểm không tăng. Đồng thời mất một nửa lần hồi đầy HP/nhận bình và đi thêm năm tầng trước boss cuối kể từ lần hồi cuối. Đây là thay đổi lớn về khả năng sống sót cuối run. Lần thử này đo cả hai thay đổi cùng lúc, chưa tách riêng tác động của nhịp cấp điểm và nhịp hồi phục.

Nếu mục tiêu là giảm thao tác chọn chỉ số nhưng giữ độ khó gần hiện tại, nên thử cấu hình chọn +10 mỗi 10 tầng từ 700, còn hồi HP/+2 bình mỗi 5 tầng; cấu hình đó cần một phép đo riêng trước khi áp dụng.

## Chỉ xét run đã vượt tầng 700

Số run vượt tầng 700 giống hệt ở hai cấu hình. Điều chỉnh bắt đầu ở checkpoint sau trận tầng 700, nên phần này tập trung vào giai đoạn chịu thay đổi.

| Class       | Qua 700 | Thắng hiện tại / qua 700 | Thắng đề xuất / qua 700 | Đến Deimoss | Tầng trung bình toàn run |
| ----------- | ------: | -----------------------: | ----------------------: | ----------: | -----------------------: |
| Amazon      |     511 |                   69,67% |                  46,18% |   414 → 280 |            547.2 → 530.8 |
| Barbarian   |     406 |                   64,78% |                  21,18% |   290 → 108 |          459.53 → 427.79 |
| Assassin    |     272 |                   79,78% |                  59,93% |   236 → 186 |          317.34 → 311.53 |
| Sorceress   |     788 |                   64,72% |                  39,47% |   634 → 397 |           800.19 → 780.4 |
| Druid       |     246 |                   68,29% |                   56,1% |   184 → 154 |          286.56 → 281.57 |
| Necromancer |     460 |                   73,91% |                  51,09% |   389 → 269 |           483.6 → 468.94 |
| Paladin     |     416 |                   72,36% |                  38,22% |   323 → 178 |          458.61 → 433.68 |

## Phương pháp và giới hạn

- Balanced: nâng stat chính và VIT luân phiên theo **số checkpoint**, không dùng số tầng để chia lượt nâng. Với cấu hình cũ cách này giống nguyên simulator; cấu hình mới tránh sai lệch chỉ nâng VIT ở mọi checkpoint chia hết cho 10.
- Cược 100.000 xu; không mang đồ/vé đầu run, không mua kim cương. Dùng item/drop/shop trong run như chiến thuật hiện tại. Drop hiện hành: min(20%, 1% + LUCK × 0,5 điểm %), độ hiếm thấp/cao 60%/40%.
- Bỏ Shrine, cứu Adventurer khi có bình, chọn rương đỏ trong Treasure Room, dùng Skill khi đủ MP, bình khi nguy hiểm; tránh Mimic đã lộ. Royal Invitation bị bỏ qua, không chủ động săn LR từ chuỗi bí mật.
- Paradox/Contract/Rift/event/RNGesus dùng engine hiện tại. Hối lộ RNGesus khi phù hợp; không chọn theo loot hoặc kết quả ẩn. Mỗi run có user riêng, không có mộ từ run trước; không có lượt tích lũy tử trận RNGesus trước đó.
- 70 run pilot SQLite và memory cho kết quả chính xác như nhau (chỉ khác tên backend); pilot dùng seed riêng, không tính vào đánh giá.
- Tất cả run ghép cặp kết thúc trước 700 đều có cùng tầng kết thúc; không run nào hết giới hạn 40.000 action. Sau 700, lựa chọn và thứ tự draw có thể khác vì trạng thái khác.
- Khoảng tỷ lệ thắng Wilson 95% và khoảng chênh lệch ghép cặp xấp xỉ 95% nằm trong JSON. Nhãn giảm/tăng rõ dùng kiểm định McNemar chính xác, điều chỉnh Holm cho bảy class ở mức 5%. Chúng mô tả chiến thuật này, không chứng minh tối ưu hay tỷ lệ của mọi người chơi.

## Tái hiện

Commit nền: bbc1fceee6320c78f0b604105916de12d6da6f9e. SHA-256 của 252 file nằm trong manifest và JSON tổng hợp.

```powershell
$env:HARDCORE_SIM_BACKEND='memory'
$env:HARDCORE_SIM_POLICY='balanced'
$env:HARDCORE_SIM_ISOLATED='1'
$env:HARDCORE_SIM_SEED='survival-checkpoints-evaluation-2026-10-07'
Remove-Item Env:HARDCORE_SIM_POWER,Env:HARDCORE_SIM_BUILDS,Env:HARDCORE_GAMEPLAY_VERSION,Env:HARDCORE_SIM_BUILD,Env:HARDCORE_SIM_STAKE -ErrorAction SilentlyContinue
$env:HARDCORE_SIM_CHECKPOINTS='baseline'
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-07-checkpoints-baseline-physical.json'
node scripts/simulate-hardcore.js 1000 999 40000 amazon,barbarian,assassin,paladin
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-07-checkpoints-baseline-magic.json'
node scripts/simulate-hardcore.js 1000 999 40000 sorceress,druid,necromancer
# Lặp hai lệnh trên với HARDCORE_SIM_CHECKPOINTS='700-10x10' và đổi tên output tương ứng.
node scripts/report-hardcore-checkpoints.js
```
