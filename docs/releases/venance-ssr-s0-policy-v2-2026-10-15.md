# Venance SSR S0 · Đối chiếu policy v2 · 15/10/2026

**Policy v2: 20/100 thắng tầng 999 (20%), tăng 19 điểm % so với policy v1.** Giữ nguyên sức mạnh nhân vật; đây là phép đo policy với cùng 100 seed ban đầu.

| Chỉ tiêu | Policy v1 | Policy v2 |
| --- | ---: | ---: |
| Hạ boss 999 và còn sống | 1/100 | 20/100 |
| Tới boss cuối | 4/100 | 24/100 |
| Tầng hoàn thành trung bình | 802,7 | 884,5 |
| Hoàn thành tầng 700 | 79 | 92 |
| Hoàn thành tầng 800 | 58 | 75 |
| Hoàn thành tầng 900 | 19 | 46 |
| Chạm giới hạn lượt | 0 | 0 |

Wilson 95% của tỷ lệ mới: **13,3–28,9%**. Chưa đạt mục tiêu thiết kế S0 40% với policy này. Không suy tỷ lệ chơi tối ưu từ mẫu chẩn đoán.

## Thay đổi policy

- Dùng Ấn Hồi lưu để hồi HP/MP trước khi niệm lại nếu có lợi; không dùng hồi phục nhỏ vào phản công được dự báo vẫn đủ kết liễu khi còn lựa chọn bình.
- Ưu tiên đòn phép chắc chắn kết liễu trước khi dùng bình; cân nhắc Barrier từ đòn thứ ba trước khi bỏ chuỗi để hồi máu.
- Chuẩn bị cường hóa trước hành động cuối mở cửa sổ boss nếu đủ an toàn: Assur, Master Control System, Belial, Jitan, Bul-Kathos, Unstable Anomaly, Lucion, Sescheron và Inarius. Hành động mở cửa sổ vẫn tiêu một hành động cường hóa theo luật hiện tại.
- Sửa điều kiện bỏ sót lần Clash đầu tiên của Bul-Kathos vì staggerUntil chưa có giá trị. Ưu tiên cứu Lilith đang nguy hiểm trước kéo Ritual; dùng Portal để né phản công khi cần.
- Không coi cờ skipCounter từ hành động boss trước là bảo hộ cho hành động kế tiếp. Policy chỉ dùng thông tin công khai, không dò loot hoặc kết quả RNG ẩn.
- Không lặp Lùi lại ở Butcher: code hiện tại không xóa Cuồng nộ và boss tiến một ô cuối lượt. Thêm thao tác Lùi/Chặt xích vô điều kiện sẽ kéo dài trận; bản này ưu tiên sát thương và tài nguyên hồi phục.
- Chỉ sửa scripts mô phỏng và kiểm thử. Không buff nhân vật, không đổi cơ chế boss, Tower hoặc dữ liệu tài khoản thật.

## Chẩn đoán 80 run thất bại

| Ghi nhận | Số run |
| --- | ---: |
| Tử trận trong encounter boss | 63 |
| Hết bình trước hành động cuối | 71 |
| MP gần 0 trước hành động cuối | 33 |
| HP ≤25% trước hành động cuối | 64 |
| Chết ở hành động dùng Skill | 19 |
| Nguyên nhân ghi nhận: phản công vật lý | 40 |
| Nguyên nhân ghi nhận: phản công phép | 36 |
| Bỏ chạy RNGesus thất bại | 4 |

Các nhóm trạng thái HP/MP/bình và hành động có thể chồng nhau. Hết bình là tình trạng được quan sát, không phải chứng minh riêng nó gây tử trận. Nguyên nhân lấy từ lastDeathCause; sáu hành động cuối được lưu để kiểm tra phản công, Crit, Barrier và thời điểm chuẩn bị.

| Boss gây tử trận nhiều nhất trong mẫu mới | V1 | V2 |
| --- | ---: | ---: |
| Archbishop Lazarus | 2 | 9 |
| Lord Aldric Jitan | 3 | 6 |
| The Butcher | 9 | 5 |
| Baal, Lord of Destruction | 1 | 5 |
| Deimoss the Fleshweaver | 3 | 4 |
| Samael | 4 | 4 |
| Sescheron's Destroyer | 4 | 3 |
| Athulua | 2 | 3 |
| Lucion | 3 | 3 |
| Atanna Khan | 0 | 3 |

Số tử trận theo boss là số đếm, không phải tỷ lệ thua trên số lần gặp boss; hai policy có thể gặp roster khác nhau sau khi chuỗi RNG phân nhánh.

## Phương pháp và giới hạn

- 10 lô ×10 run, chỉ số 0–99, seed `venance-s0-diagnostic-2026-10-15`. Tất cả lô hoàn tất và được tính. Từ cùng seed ban đầu, hành động khác làm thay đổi thứ tự tiêu thụ RNG, trang bị và encounter tiếp theo.
- Venance SSR S0; gameplay 3.1.0; cược giả lập 100.000; không cấp gem/trang bị ngoài run; không dùng beta hoặc hồi sinh beta. Vé hồi sinh kiếm trong run vẫn hoạt động bình thường.
- Giữ policy balanced cho sự kiện, checkpoint, nâng ENE/VIT và trang bị; không nhặt mộ từ run trước. Tối đa 40.000 hành động/run, timeout tính không hoàn thành.
- Snapshot chỉ số, hệ số boss và bộ kỹ năng đối chiếu khớp hoàn toàn với mẫu cũ. Hệ số cường hóa vẫn ×2,2, DMG boss ×2.
- Đối chiếu theo chỉ số seed: thêm 20 seed thắng, mất 1 seed thắng, giữ 0 seed thắng. Đây không phải tập seed kiểm chứng độc lập để xác nhận tỷ lệ phát hành.
- Dự báo nguy cơ Crit vẫn là heuristic từ damage chưa Crit; chưa phải bộ giải chính xác sát thương cực đại. Vì vậy policy còn có thể xử lý kém một số đòn Crit.
- Chỉ số interruptedThirdHits không tính chuỗi bị hủy bởi niệm lại; không dùng riêng chỉ số này để kết luận số lần mất đòn thứ ba đã giảm.

## Dữ liệu và tái hiện

- Tổng hợp và sáu hành động cuối mỗi run: `venance-ssr-s0-policy-v2-2026-10-15.json`.
- Dữ liệu lô: `venance-ssr-s0-policy-v2-2026-10-15-batch-0.json` … `batch-9.json`.
- Mẫu cũ được giữ nguyên: `venance-ssr-s0-simulation-2026-10-15.json`.
- Code fingerprint: `ed2223646726865317663e5dad0a385fed2489e9e1cda0c42ef6aad4a648a196`.
- Kiểm thử: `node scripts/test-hardcore-venance-policy.js`.
- Chạy lại theo cấu hình ở báo cáo cũ với code policy v2; thêm `HARDCORE_SIM_DIAGNOSTICS=1` để lưu chẩn đoán và dùng đường dẫn output mới. Có thể chạy tuần tự `node scripts/simulate-hardcore.js 100 999 40000 venance 0` với run offset 0.
