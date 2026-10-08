# Sinh tồn V2 — Triển khai bộ 21 boss

Audit: 2026-10-08T03:11:22.241Z; giờ Việt Nam dùng UTC+7.
Tài liệu nguồn: 2026-10-08-hardcore-boss-roster-design.md. Mốc code trước cập nhật: d7bc1c8.

## Thay đổi

Chỉ áp dụng Sinh tồn 999 tầng. Tower giữ generator, dữ liệu công bố và luật riêng. Bộ boss mới thay vòng 5 boss; trạng thái, phase, lượt, stack, kết quả đầu hàng và phần thưởng được lưu trong session. Boss bắt buộc ưu tiên trước God/RNGesus, Grave Echo, Tower Remembers và event thường.

| Tầng | Boss | Damage chính |
| ---: | --- | --- |
| 50 | The Butcher | Vật lý |
| 100 | Infernal Machine | Phép |
| 150 | Assur | Phép |
| 200 | Master Control System | Phép |
| 250 | Necrobot Alpha | Hỗn hợp |
| 300 | Quov Tsin | Phép |
| 350 | Lucion | Phép |
| 400 | Bul-Kathos | Vật lý |
| 450 | Spirit of Giyua | Phép |
| 500 | Ascendant Riftwalker | Hỗn hợp |
| 550 | Gharbad the Weak | Vật lý |
| 600 | Phoboss | Phép |
| 650 | Unstable Anomaly | Hỗn hợp |
| 666 | Kabraxis, Keeper of the Seals | Hỗn hợp |
| 700 | Zakarum Avatar | Phép |
| 750 | The Justicar | Hỗn hợp |
| 800 | Uldyssian the Tainted | Hỗn hợp |
| 850 | Archbishop Lazarus | Phép |
| 900 | Xazax | Phép |
| 950 | Samael | Hỗn hợp |
| 999 | Deimoss the Fleshweaver | Hỗn hợp |

- Tầng 333 bắt buộc chọn một ấn. War: +12 stat chính và +8% DMG boss; Protection: +12 VIT, +5 RES; Arcane: +10 ENE, +1 Max MP. Lưu một lần, không chọn lại khi tiếp tục. Thông tin ghi ở Rift.
- Tầng 666 có cửa rút thưởng trước trận. Vào trận khóa rút thưởng cả ở engine lẫn confirmation cũ. Không bỏ qua; vé hồi sinh và Lost Adventurer vẫn cứu theo luật hiện hành.
- Kabraxis có ba ngưỡng HP và cơ chế theo ấn. Khóa trang bị ngay lúc tạo cửa: SSR 66,6% / UR có nguyền 33,4%, chỉ trang bị. Thắng nhận bonus 66,6% cược, thức tỉnh ấn, thêm thưởng hoàn thành tầng thông thường; không rương khu vực hoặc roll LUCK thêm.
- Deimoss có ba thanh độc lập 30/30/40%, tổng HP ×7,2. Với nền tham chiếu 24.017 HP: 7.205 / 7.205 / 9.607. Rift vẫn thay đổi tổng thực tế. Damage dư không xuyên phase; chuyển phase không phản công, không tính kill hoặc thưởng; chỉ phá Phase 3 mới hoàn thành.
- Giữ rương khu vực ở 100/200/300/400/500/700/900; item/rarity khóa khi boss xuất hiện, không dùng pity. Thưởng/drop khác theo luật đang có.
- Battle hiển thị cơ chế, stack, cảnh báo, damage dự kiến và ba thanh Deimoss. Chi tiết chứa toàn bộ hướng xử lý. Malic đổi Skill thành Brain Control 0 MP; MP hiệu dụng của Samael và RES sau Mythal hiển thị đúng.

## Các giá trị bổ sung để triển khai

Hệ số HP/DMG theo đúng bảng tài liệu, bao gồm HP Infernal Machine tăng thêm 100%. Những hằng số tài liệu chưa ghi số dùng các giá trị sau; đây là lựa chọn triển khai, không phải con số đã được chứng minh cân bằng:

| Cơ chế | Giá trị bổ sung |
| --- | --- |
| Infernal Machine | Tia Overcharge vật lý ×2,5. Tài liệu vừa ghi vật lý trong cơ chế vừa ghi phép ở yêu cầu UI; chọn vật lý và UI khớp với đòn thực tế. |
| Necrobot Alpha | Plating DEF ×1,4 / RES −15; Barrier DEF ×0,7 / RES +20, cap 75%. Damage khắc chế ×0,7 theo tài liệu. |
| Unstable Anomaly | Matter DEF ×1,4; Energy RES +20, cap 75%; Void DEF ×0,7, RES −20, nhận DMG ×1,5. Void phản công phép. |
| Gharbad | 25% False Surrender mỗi lượt; khóa trước khi hiển thị, mở UI không roll lại. |
| Uldyssian | Lặp Attack: EVA +30; lặp Skill: RES +20 và mất tối đa 1 MP sau chi phí Skill. |
| Kabraxis Corrupted Seal | Phase 2 mỗi 3 vòng +1, cap 3; War thêm 10 điểm % phản công phụ mỗi Seal; Protection giảm RES 5 + Seal; Arcane hút 1 + Seal MP. Ở lượt Seal: DMG thêm 5% mỗi Seal đang có. Các hiệu ứng ghi trong Chi tiết. |
| Samael | Pentagram vật lý ×3; Phòng thủ còn ×0,3, tiếp tục áp dụng giảm trừ Phòng thủ thông thường. Dread không làm tăng Max MP vốn thấp hơn 2. |
| Deimoss Flesh | Mỗi Flesh +10% DMG, tối đa 3; chỉ Phase 2. |

Đòn phản lại từ nội tại vẫn chịu phòng thủ/miễn sát thương của boss và cap chung; không hưởng buff dành riêng cho Attack/Skill hoặc tạo Overheat. Time Debt dùng lại kế hoạch phản công đã cảnh báo trong cùng hành động.

## Run đã lưu

Trận đang đánh trước cập nhật giữ nguyên enemy và cơ chế cũ; boss xuất hiện tiếp theo dùng roster mới. Nếu run cũ đã qua tầng 333 mà không có lựa chọn, Kabraxis dùng War mặc định, không cộng lại buff ban đầu của tầng 333; thắng vẫn thức tỉnh War. Không đổi HP, phase hoặc kết quả khóa khi mở lại UI.

Service lưu trạng thái trong SQLite và kiểm tra phiên bản lượt. JSON round-trip được kiểm thử cho mọi boss và từng phase Deimoss; kiểm thử service thật lưu phase chuyển tiếp và từ chối lượt cũ mà không đổi dữ liệu. Chưa kiểm thử restart tiến trình bot trên server hoặc thao tác Discord trực tiếp.

## Mô phỏng so sánh

200 run/class/roster, tổng 2.800 run. Cược 100.000 xu, không nạp kim cương, không mộ từ run trước, checkpoint hiện hành mỗi 5 tầng/+5 stat; giới hạn 12.000 hành động/run. Cùng seed: boss-roster-2026-10-08-holdout-v2. Backend memory gọi cùng engine/service, giảm chi phí serialize. Không có timeout ở cả hai nhóm.

Bộ cũ được tạo bằng tắt roster mới trong simulator; không thay cờ production. Policy balanced giữ luật cũ cho boss cũ, dùng cảnh báo công khai để xử lý boss mới (public telegraphs v2). Đây là so sánh hai chiến lược có hiểu cơ chế tương ứng, không phải người chơi tối ưu mọi build.

| Class | Thắng roster cũ | Thắng roster mới | Run mới thắng | Tầng qua trung bình mới |
| --- | ---: | ---: | ---: | ---: |
| amazon | 41.5% | 13% | 26/200 | 365.49 |
| barbarian | 27% | 1% | 2/200 | 212.58 |
| assassin | 17% | 0% | 0/200 | 118.75 |
| sorceress | 56.5% | 23% | 46/200 | 581.58 |
| druid | 15% | 0.5% | 1/200 | 106.64 |
| necromancer | 33.5% | 0% | 0/200 | 201.15 |
| paladin | 27.5% | 2% | 4/200 | 188.64 |

Bộ mới khó hơn rõ rệt. Assassin và Necromancer có 0/200 thắng, Druid có 1/200; 0 trong mẫu không chứng minh class không thể thắng (cận trên một phía 95% khoảng 1,49% với 200 thử). Cần thêm vòng cân bằng nếu mục tiêu là giữ tỷ lệ thắng gần bản cũ. Không khẳng định các hệ số đề xuất đã cân bằng.

Các tầng gây tử trận thường gặp ở bộ mới:

- amazon: 100 (83 run), 50 (36 run), 850 (25 run), 450 (7 run), 350 (4 run).
- barbarian: 100 (100 run), 50 (54 run), 850 (22 run), 350 (4 run), 75 (2 run).
- assassin: 50 (78 run), 100 (65 run), 450 (8 run), 400 (6 run), 30 (3 run).
- sorceress: 50 (40 run), 100 (39 run), 850 (39 run), 999 (8 run), 950 (5 run).
- druid: 50 (105 run), 100 (52 run), 350 (10 run), 850 (5 run), 44 (4 run).
- necromancer: 50 (49 run), 100 (36 run), 400 (30 run), 450 (12 run), 700 (10 run).
- paladin: 100 (111 run), 50 (52 run), 850 (18 run), 450 (3 run), 64 (2 run).

Ma trận bổ sung: 7 class × 4 build (power/energy/guard/evasion) × 21 boss × 50 trận = 29.400 trận. Đây là trận tổng hợp: đầy HP/MP, 5 bình, stat checkpoint theo tầng, chỉ 5 món SSR sạch với level 1 + floor/200, Rift phân bổ đều, không LR. Có 34 trận đạt giới hạn 300 lượt. Build ít trang bị này yếu hơn nhiều run thật ở cuối hành trình; không dùng tỷ lệ thắng từng trận tổng hợp làm tỷ lệ hoàn thành run. Infernal Machine là điểm nghẽn đầu game; Lazarus với hồi 8% Max HP/vòng kiểm tra mạnh damage, cần đặc biệt xem lại khi cân bằng.

Dữ liệu đầy đủ: [roster cũ](./hardcore-2026-10-08-boss-previous.json), [roster mới](./hardcore-2026-10-08-boss-current.json), [ma trận 4 build](./hardcore-2026-10-08-boss-builds.json).

## Kiểm thử

Qua 11 nhóm kiểm thử boss: 21 ID/mốc, trạng thái đầu trận, 7 class × 21 boss ở 1 HP/0 MP/đầy-không bình, UI không đổi state và giới hạn Discord, khóa loot, prophecy một lần, gate/retreat, phase Deimoss, phản công kép, phản đòn nội tại và stale transaction.

Các suite liên quan qua: V2, passives, curses, Paradox, Tower archive/generator/runtime, rates, module boundaries, Royal, Gilded, Conqueror, loot, payout, healing, RNGesus, God, tickets, latency, memories, blood merchant, profile/profile-live, shrine/chest/surprise, avatar-ring và survival-achievements; changelog cũng qua.

Ba kiểm thử hiện có vẫn fail và đã tái hiện cùng lỗi khi nạp lại toàn bộ production source thay đổi từ HEAD d7bc1c8 trong bộ nhớ:

- test-hardcore-loadout.js:512: fixture RNG mong RNGesus nhưng roll ra combat.
- test-hardcore.js:94: kiểm tra tuyến tính enemyScale của legacy lệch cấu hình hiện hành.
- test-hardcore-trap.js:52: chuỗi UI thuế mong đợi đã cũ.

Không sửa các fixture ngoài phạm vi để che lỗi; không báo toàn bộ npm test đã xanh.

## Tái chạy

PowerShell, cho mỗi roster current/previous:

```powershell
$env:HARDCORE_SIM_SEED='boss-roster-2026-10-08-holdout-v2'
$env:HARDCORE_SIM_BACKEND='memory'
$env:HARDCORE_SIM_ISOLATED='1'
$env:HARDCORE_SIM_BOSS_ROSTER='current'
$env:HARDCORE_SIM_OUTPUT='docs/releases/hardcore-2026-10-08-boss-current.json'
node scripts/simulate-hardcore.js 200 999 12000 all 0
```

Ma trận: seed boss-roster-2026-10-08-build-validation; đặt HARDCORE_SIM_OUTPUT cho file builds rồi chạy npm run simulate:hardcore:bosses -- 50. Test cơ chế: npm run test:hardcore:bosses.

Digest SHA-256 của 30 file JS được thay đổi/thêm (sắp xếp path, LF chuẩn hóa; path + newline + content + newline): 1d78c65d5cb5c00d1176453ea30910f3e720d3b29544f68948de054e2e8442b7. Production code đã chốt trước lượt mô phỏng cuối; test và package bổ sung sau đó không thay đổi gameplay.
