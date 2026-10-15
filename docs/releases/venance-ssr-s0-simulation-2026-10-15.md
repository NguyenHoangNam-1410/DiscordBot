# Venance SSR S0 · Mô phỏng chẩn đoán 15/10/2026

**1/100 run thắng tầng 999 (1%).** Wilson 95%: 0,2–5,4%. Kết quả thấp hơn mục tiêu thiết kế S0 40% với chiến thuật đang đo; chưa xác nhận tỷ lệ của người chơi tối ưu.

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Tới boss cuối | 4/100 |
| Hạ boss cuối và còn sống | 1/100 |
| Chạm giới hạn 40.000 hành động | 0 |
| Tầng đã hoàn thành trung bình | 802,7 |
| Trung vị tầng đã hoàn thành | 846 |
| Tầng đã hoàn thành cao nhất | 999 |
| Hoàn thành tầng 700 | 79/100 |
| Hoàn thành tầng 800 | 58/100 |
| Hoàn thành tầng 900 | 19/100 |

## Boss gây tử trận nhiều nhất

| Boss | Số run |
| --- | ---: |
| The Butcher | 9 |
| Unstable Anomaly | 7 |
| Sescheron's Destroyer | 4 |
| Inarius | 4 |
| Samael | 4 |
| Assur | 3 |
| Lord Aldric Jitan | 3 |
| Lucion | 3 |
| Deimoss the Fleshweaver | 3 |
| Akarat, the False Prophet | 3 |

## Cấu hình và chiến thuật

- Sinh tồn 3.1.0, Venance **SSR S0**, roster boss hiện tại, checkpoint hiện tại. Hệ số cường hóa ×2.2; hệ số DMG boss ×2. Không chỉnh cân bằng để đo.
- Cược 100.000 xu; không cấp gem, trang bị hoặc vé tân thủ bên ngoài. Run tiêu chuẩn, không dùng beta hoặc hồi sinh beta; vé hồi sinh kiếm được trong run vẫn theo luật game.
- Mỗi run độc lập, không nhặt mộ từ run trước. Nâng ENE/VIT xen kẽ; giữ policy balanced cho sự kiện, Rift và trang bị. Bỏ Shrine, không chủ động làm chuỗi LR.
- Policy Venance v1: Skill khi hết cường hóa, Attack trong thời gian cường hóa; không niệm liên tục Skill 0 damage. Ưu tiên kết liễu bằng đòn hiện có, hồi máu khi nguy hiểm, dùng Ấn Hồi lưu khi cần sống sót, Phòng thủ hồi MP để chuẩn bị lượt cường hóa tiếp theo.
- Giữ xử lý dấu hiệu boss hiện tại; chọn nhánh phép cho Venance ở Prophecy, Justicar, Necrobot và Deimoss.
- Tổng hành động: Attack 117035, Skill 30907, Defend 5133, bình máu 8277. Có 1431 lần buff hết sau hai đòn hợp lệ vì dùng hành động khác; chỉ số này gồm cả giai đoạn chưa thức tỉnh.
- Seed: `venance-s0-diagnostic-2026-10-15`; chỉ số run **0–99**, chia 10 lô ×10 không trùng. Toàn bộ lô được tính, không lựa chọn kết quả. Các lượt chạy thử dừng trước khi chia lô không cộng vào mẫu; các seed đó được chạy lại đầy đủ trong mẫu cuối.
- Backend memory, resume validation một lần/run; dùng game service và RNG fairness hiện tại. Kết quả phản ánh chiến thuật tự động này, chưa phải chiến thuật tối ưu.

## Độ tin cậy và dữ liệu

Đây là lô chẩn đoán 100 run, chưa phải kiểm chứng 2.000 run theo thiết kế. Không suy từ mẫu này rằng tỷ lệ thắng của mọi người chơi đúng bằng 1%. Toàn bộ 100 run đều có kết quả và được giữ trong mẫu; timeout vẫn tính là không hoàn thành.

`commonLastClearedFloors` trong JSON là tầng đã hoàn thành khi run kết thúc, không phải số tầng tử trận. Các file lô chỉ giữ top 5 tầng tử trận mỗi lô, nên không ghép chúng thành phân phối tử trận đầy đủ.

- Kết quả tổng hợp: `venance-ssr-s0-simulation-2026-10-15.json`.
- Dữ liệu gốc: `venance-ssr-s0-simulation-2026-10-15-batch-0.json` … `batch-9.json`.
- Fingerprint: `3f9e08da855ba6a02567d9c593001deb98a5399d94df3b3a3456bb2d09f57578`.
- Kiểm thử policy: `node scripts/test-hardcore-venance-policy.js`.

## Chạy lại tuần tự cùng mẫu

Xóa các biến thử nghiệm HARDCORE_SIM_BOSS_DAMAGE, HARDCORE_SIM_POWER, HARDCORE_SIM_BUILDS, HARDCORE_SIM_BUILD và HARDCORE_GAMEPLAY_VERSION trước khi chạy. Các biến dưới đây dùng cho PowerShell:

```powershell
$env:HARDCORE_SIM_BACKEND="memory"
$env:HARDCORE_SIM_RESUME_VALIDATION="once_per_run"
$env:HARDCORE_SIM_ISOLATED="1"
$env:HARDCORE_SIM_POLICY="balanced"
$env:HARDCORE_SIM_BOSS_ROSTER="current"
$env:HARDCORE_SIM_CHECKPOINTS="baseline"
$env:HARDCORE_SIM_SOUL_LEVEL="0"
$env:HARDCORE_SIM_RUN_OFFSET="0"
$env:HARDCORE_SIM_SEED="venance-s0-diagnostic-2026-10-15"
$env:HARDCORE_SIM_STAKE="100000"
$env:HARDCORE_SIM_OUTPUT="docs/releases/venance-ssr-s0-rerun.json"
node scripts/simulate-hardcore.js 100 999 40000 venance 0
```
