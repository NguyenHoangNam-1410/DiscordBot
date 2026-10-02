# Mô phỏng Sinh tồn — 02/10/2026

Đã đo 7.000 run độc lập với bộ seed đo tách khỏi bộ seed hiệu chỉnh. Mỗi class 1.000 run; thành công yêu cầu hạ Final Boss tầng 999 và còn HP. Druid cao nhất: 963/1.000, tương đương 96,3%; khoảng tin cậy Wilson 95%: 94,9–97,3%.

## Kết quả mẫu đo cuối

| Class       | Thắng boss 999 | Tỷ lệ | Khoảng tin cậy 95% | Tới boss cuối | Chiến thuật nâng chỉ số |
| ----------- | -------------: | ----: | ------------------ | ------------: | ----------------------- |
| Druid       |       963/1000 | 96,3% | 94,9–97,3%         |           983 | adaptive                |
| Assassin    |       928/1000 | 92,8% | 91,0–94,2%         |           955 | attack2                 |
| Necromancer |       925/1000 | 92,5% | 90,7–94,0%         |           942 | adaptive                |
| Paladin     |       911/1000 | 91,1% | 89,2–92,7%         |           943 | adaptive                |
| Amazon      |       907/1000 | 90,7% | 88,7–92,3%         |           931 | balanced                |
| Barbarian   |       907/1000 | 90,7% | 88,7–92,3%         |           931 | balanced                |
| Sorceress   |       849/1000 | 84,9% | 82,5–87,0%         |           875 | balanced                |

Tổng 6390/7.000 (91,3%) nếu lấy mẫu đều cả bảy class. Đây là tỷ lệ với chiến thuật tốt nhất trong những cách đã thử; không chứng minh tối ưu tuyệt đối trên mọi hành động có thể có.

## Điều kiện và chiến thuật

- Engine thật: `src/services/hardcoreService.js`, `hardcoreEngine.js`, catalog `src/hardcore/item.js`. Chỉ thay lớp lưu session trong tiến trình mô phỏng để chạy nhanh; tài khoản/quyết toán vẫn ở SQLite tạm.
- Cược 100.000 xu; tài khoản thử được cấp đủ xu trước khi bắt đầu. Mỗi run tối đa 40.000 lượt. Không có run cuối nào hết giới hạn lượt.
- Chỉ dùng thông tin công khai: chỉ số, HP hiện tại, ý định đòn quái, trang bị đang sở hữu, offer Merchant, Mimic đã được phát hiện. Không nhìn kết quả ẩn, vật phẩm chưa mở, roll cầu nguyện/chạy, portal hoặc seed để chọn hành động.
- Mục tiêu là sống đến 999, chấp nhận hao thưởng xu. Gặp RNGesus: còn vé thì chạy (vé tự cứu khi thất bại); hết vé thì hối lộ. Không đánh hoặc cầu nguyện.
- Kiểm tra hòm; bán Mimic đã phát hiện; mở các hòm còn lại để tăng trang bị. Nhận Healer/Class Shrine, ưu tiên mua hồi phục hoặc item, cướp Lost Adventurer để lấy SSR, dùng Mirror tăng 10% ATK khi đủ HP.
- Combat dùng skill/bình dựa trên DMG ước tính và khả năng chịu phản công. Với Riftwalker, tấn công để qua lượt miễn nhiễm thay vì thủ liên tục.
- `balanced`: luân phiên ATK/HP mỗi checkpoint; `attack2`: hai lần ATK rồi một lần HP; `adaptive`: tăng ATK nếu ATK trung bình < MAX HP/6, còn lại tăng HP.

## Hiệu chỉnh và kiểm tra

Đã so sánh 7 cách nâng chỉ số trên cùng 100 seed/class: tổng 4.900 run. Chọn cách có nhiều thắng nhất cho từng class trước khi chạy bộ seed đo độc lập. Hiệu chỉnh ban đầu dùng Tránh Mimic; đợt cuối bổ sung Bán Mimic.

| Chiến thuật | Amazon | Barbarian | Assassin | Sorceress | Druid | Necromancer | Paladin |
| ----------- | -----: | --------: | -------: | --------: | ----: | ----------: | ------: |
| attack      |     66 |        70 |       85 |        53 |    81 |          83 |      76 |
| balanced    |     90 |        90 |       95 |        92 |    96 |          90 |      87 |
| health      |     72 |        63 |       84 |        76 |    85 |          66 |      79 |
| luck        |     64 |        58 |       83 |        42 |    81 |          64 |      68 |
| adaptive    |     90 |        90 |       93 |        91 |    97 |          92 |      93 |
| health2     |     88 |        90 |       93 |        82 |    92 |          88 |      92 |
| attack2     |     86 |        87 |       96 |        73 |    96 |          86 |      90 |

Các con số hiệu chỉnh là số run thắng trong 100 run/class.

Đối chiếu cùng seed SQLite/RAM: đợt 30 run/class đầu khớp các thống kê kết quả và chỉ số boss/người chơi; đợt chiến thuật cuối 10 run/class khớp số thắng, số tới boss cuối, tầng trung bình và không có hết giới hạn lượt. Kiểm tra cú pháp script và `git diff --check` đạt.

## Bán Mimic so với tránh Mimic

Hai đợt đều 1.000 run/class trên cùng seed đo; các lựa chọn khác giữ nguyên.

| Class       | Tránh Mimic | Bán Mimic |
| ----------- | ----------: | --------: |
| Druid       |   963/1.000 | 963/1.000 |
| Assassin    |   928/1.000 | 928/1.000 |
| Necromancer |   925/1.000 | 925/1.000 |
| Paladin     |   910/1.000 | 911/1.000 |
| Amazon      |   907/1.000 | 907/1.000 |
| Barbarian   |   905/1.000 | 907/1.000 |
| Sorceress   |   850/1.000 | 849/1.000 |

Bán hòm tăng payout có thể chi dịch vụ. Số thắng có thể dao động ở các class vì thay đổi payout cũng thay đổi pool sự kiện hợp lệ và đường đi RNG về sau.

## Chạy lại

Chạy trong PowerShell bằng tài khoản sở hữu tệp của bạn:

```powershell
$env:HARDCORE_SIM_BACKEND = 'memory'
$env:HARDCORE_SIM_POLICY = 'best'
$env:HARDCORE_SIM_REVEALED_CHEST = 'sell'
$env:HARDCORE_SIM_SEED = 'survival-holdout-2026-10-02'
node scripts/simulate-hardcore.js 1000 999 40000 all 0
```

Script dùng database tạm và tự xóa khi hoàn tất. Có thể dùng `HARDCORE_SIM_BACKEND=sqlite` để chạy qua lớp lưu SQLite thật. Tham số class nhận `all` hoặc danh sách class ngăn cách bằng dấu phẩy. Dữ liệu tài khoản thật không được sử dụng.

Seed hiệu chỉnh: `survival-calibration-2026-10-02`. Seed đối chiếu cuối: `survival-backend-validation-2026-10-02`.
