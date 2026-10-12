# Sinh tồn V3 — rework trang bị, affinity và Forge

Triển khai theo tài liệu ngày 12/10/2026. Boss roster, mastery và công thức thuộc tính V3 được giữ nguyên.

## Bật luật mới

Đặt HARDCORE_EQUIPMENT_RULES_VERSION=1 trong môi trường bot rồi khởi động lại. Mặc định chưa bật: đặc tả yêu cầu xác nhận cân bằng trước phát hành, và người dùng chưa yêu cầu chạy simulate.

Khi bật, run mới lưu catalogVersion=3, equipmentRulesVersion=1, affinityVersion=1, itemLevelCurveVersion=1 và affinityPity.version=1. V2/V3 đã bắt đầu giữ definition, curve tuyến tính và Forge cũ; không tự gắn affinity vào snapshot cũ. Không sửa/archive lại Tower đã publish.

## Catalog và nguồn thưởng

- 100 trang bị: R 32, SR 28, SSR 24, UR 16. Giữ effects, curse, nội tại và ID của 63 món hiện hành; phục hồi 37 món từ itemLegacy. The Last Bad Decision dùng ID hiện hành the_last_bad_decision.
- Sát thương chung attack của trang bị cũ được chuyển thành physical/spell cùng giá trị, Max Energy chuyển thành Max MP để tương thích engine V3. Không thêm base effects mới.
- Điều chỉnh hai affinity đề xuất để offer ba món không thiếu pool: Phoenix Blood thêm Sorceress; Hollow Crown thêm Druid. Base effects, curse và nội tại chung giữ nguyên. Mỗi class/rarity có ít nhất ba món hợp class.
- Sau rarity: 55% hợp class, 25% Universal, 20% lệch build. Không khóa trang bị theo class.
- Pity: sau 3 nguồn thưởng chỉ có Universal/lệch build, nguồn tiếp theo có ít nhất một lựa chọn hợp class. Offer nhiều món chỉ tính một event; bỏ qua offer đã thấy không làm lại pity.
- Shop và rương boss có offer không trùng ID. Rương boss chọn một trong ba món hoặc bán +100% cược; rarity từng ô giữ SSR 70%/UR 30%.
- Vé UR giữ cơ hội theo pool riêng trước affinity; consumable, LR, đồ cố định, loadout và snapshot từ mộ không đổi pity.
- Hòm giả/rỗng/Mimic chưa hạ không roll trang bị. Phần thưởng ẩn của Goblin, Duelist, Contract, cửa tối và cầu nguyện chỉ xử lý affinity khi đủ điều kiện nhận.
- Ancient/Blood Mimic giữ phần thưởng cũ, thêm drop LUCK như trước.
- Fallback có audit trong state, tối đa 20 bản ghi; validator bảo đảm mỗi rarity đủ match/universal/off cho mọi class.

## Level và giải nguyền

Tổng hiệu lực Lv.1–8: 100%, 160%, 200%, 230%, 250%, 260%, 265%, 267,5%. Từ Lv.5 dùng công thức trực tiếp 2,7 − 0,2 × 2^−(level−5). Level không có giới hạn gameplay, dùng số nguyên an toàn của JavaScript; số thực có thể làm tròn tới 2,7 ở level rất cao.

Buff tĩnh dùng S(level). Nguyền còn hiệu lực dùng S(level) − S(cleansedLevels), giữ cờ defenseSet khi vẫn còn cấp chưa giải kể cả khi sai số số thực làm chênh lệch bằng 0. Ví dụ giải Lv.1 rồi nhận Lv.2: chỉ thêm 60% nguyền gốc. Nội tại và affinity tính một lần mỗi ID.

Receipt heal/bình/vé xử lý theo từng bản sao được nhận, chỉ lặp trên duplicate nếu definition công khai receipt.onDuplicate=true; snapshot mộ/recompute/resume không kích hoạt lại. Max HP/MP tăng do recompute không hồi tài nguyên miễn phí.

## Forge version 1

Nghiền một level, mất buff/nguyền tương ứng. Mất item khi level về 0, gồm cả nội tại/affinity. Không thêm sources.absorbed.

Sau nghiền bắt buộc chọn một boon đã lưu: +1 stat chính, +1 VIT hoặc +1 ACC/RES/DEF tùy class. Không nhận tài nguyên trung gian, không reroll. Không đi tiếp/rút thưởng giữa hai bước. Giao dịch và expectedTurn chống retry/stale nhận boon hai lần. Budget +1 là hệ số thử nghiệm, chưa được xác nhận cân bằng theo phân bố level/Forge thực tế.

## Affinity behavior version 1

Mỗi item hợp class đóng góp 1%/1,5%/2%/2,5% theo R/SR/SSR/UR; tổng strength tối đa 20%. Không scale theo level. Universal và lệch build không nhận phần này.

- Assassin: né vật lý tự nhiên tạo một Shadow Mark; Crit tiêu dấu tăng DMG theo strength, trần 20%. Shadow Step/Class Shrine không tạo dấu.
- Amazon: hành động vật lý đầu +100×strength ACC, trần +15. Mỗi hit đã trúng tăng strength DMG cho các đòn sau, trần 15%; lượt trượt toàn bộ reset chuỗi. Barrage ghi số hit thực trúng.
- Barbarian: DMG tăng 2×strength×HP đã mất, trần 20%; giảm sát thương nhận strength×HP đã mất, trần 10%.
- Sorceress: Skill phép tăng strength×min(2, ENE/100), trần 15%. Mỗi ba Skill có trả MP hoàn 1 MP còn thiếu; không hoàn từ Skill miễn phí.
- Necromancer: Totem Ward/Class Shrine chặn tạo một charge phản vật lý bằng min(15%, strength) sát thương cơ bản. Dùng chung trần phản nội tại 50% sát thương cơ bản mỗi lượt.
- Druid: tăng hồi HP từ bình/Skill theo strength, trần 20%; Defense hồi min(2%, strength×10%) Max HP còn thiếu. Không overheal.
- Paladin: nút Defense tạo Guard tăng đòn kế theo strength, trần 15%, đồng thời phản thêm min(15%, strength) HP thực mất. Divine Shield không tạo Guard; phản dùng chung budget nội tại.

Tất cả hệ số affinity/boon hiện là bản thử nghiệm. Chưa xác nhận mục tiêu thắng tầng 999 3–5% mỗi class hoặc build diversity.

## Tower

Rotation mới lưu survivalReleaseVersion/statSystemVersion/catalogVersion/equipmentRulesVersion/affinityVersion, classProfileSnapshot, itemDefinitionSnapshots và towerClassProfileSnapshot. Profile puzzle riêng giữ budget HP/MP/damage của Tower. Solver đọc snapshot; payload cũ dựng profile từ character/combat đã lưu và mapping cơ chế lịch sử, không dùng catalog/profile live.

Không chỉnh payload đang published hoặc archive. Generator có snapshot profile ngay cả ở bước tính damage trước khi tạo payload cuối.

## Kiểm tra

19 nhóm kiểm thử deterministic ở scripts/test-hardcore-equipment-v3.js:
catalog 100/giữ 63, ranh giới bucket cho mọi class/rarity, pity, offer unique, curve/high levels, cleanse/Forge, receipt/snapshot, run cũ, từng class, readonly/Discord bounds với toàn catalog, transaction rollback/stale, rương boss và Tower bất biến.

Các test hồi quy stat V3/V2, curse/purifier, recovery, monster loot/chest/shrine/surprise, pagination, module boundaries và Tower đã qua. Test nội tại cũ có đoạn lấy mẫu xác suất kích hoạt; test boss cũ có đoạn lấy mẫu roster. Không chạy simulate thắng run, affinity một triệu roll hoặc cân bằng/Jaccard/holdout V3 theo yêu cầu người dùng.
