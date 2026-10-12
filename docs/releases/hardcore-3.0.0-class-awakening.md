# Sinh tồn V3 — Class Awakening

Ngày triển khai: 2026-10-12.

## Kích hoạt và tương thích

Run Sinh tồn V3 mới lưu `classAwakeningVersion: 1`. Hạ boss tầng 100, hết mọi phase và còn sống sẽ nhận đúng một Class Artifact trong giao dịch kết liễu, trước rương boss. Không thay đổi rương, drop, xu hoặc kim cương.
Run V2/V3 đã lưu thiếu marker giữ nguyên luật; không tự trao hồi tố. Tower không kích hoạt tính năng này.

## Class Artifact

Artifact lưu riêng trong `classAwakening`, không nằm trong `items`, không có rarity hay level, không tranh slot LR. Rèn, nghiền, giải nguyền, cướp/mất trang bị và snapshot loot Grave Echo/Server Nemesis chỉ thao tác danh sách item, không thao tác artifact. Artifact chỉ thuộc run đang chơi, không chuyển vào túi ngoài run. Archive có thể giữ bản ghi lịch sử, không biến thành vật phẩm sử dụng ở run sau.

| Class       | Artifact                 | Nội tại          |
| ----------- | ------------------------ | ---------------- |
| Amazon      | Askari War Quiver        | Hunter's Rhythm  |
| Barbarian   | Bul-Kathos' Bloodstone   | Unbroken Fury    |
| Assassin    | Viz-Jaq'taar Shadow Seal | Shadow Momentum  |
| Sorceress   | Vizjerei Arcane Prism    | Arcane Echo      |
| Druid       | Fiacla-Géar Heartwood    | Ancient Bark     |
| Necromancer | Rathma's Bone Effigy     | Totemic Covenant |
| Paladin     | Zakarum Oathshield       | Consecration     |

## Nội tại

- Amazon: đánh thường trúng tạo một Focus/action, tối đa 2. Barrage tiêu 2 để thêm hit 70% vật lý, roll trúng/CRIT riêng. Có thể có 4 hit khi Class Shrine cùng kích hoạt.
- Barbarian: vượt xuống các ngưỡng 75/50/25% HP lần đầu trong combat tạo Fury. Bắt đầu combat ở ≤50% nhận một Fury và khóa ngưỡng đã vượt. Iron Will tiêu Fury chụp ở đầu action: mỗi điểm +15% DMG Skill, +5% Max HP lá chắn; reset khi combat kết thúc.
- Assassin: CRIT hoặc né vật lý tự nhiên tạo một Shadow/action, tối đa 2. Shadow Step tiêu 2: giá 1 MP, +20 điểm % CRIT, +0,25 hệ số CRIT. Chặn/né bảo đảm không tạo Shadow.
- Sorceress: MP chủ động trả cho Arcane Burst tích tiến trình, đủ 3 tạo một Echo. Burst tạo Echo không tự lặp. Burst kế tiếp tiêu Echo, thêm hit 50% sát thương chính sau giảm trừ; không tăng tiến trình khi đầu action đang giữ Echo. Tiến trình dư giữ tối đa 2, sức chứa Echo là 1; chi phí bất thường trên 3 MP không tạo hàng đợi Echo.
- Druid: Wild Regeneration tạo Bark Barrier bằng floor(4% Max HP × hiệu lực hồi + 50% hồi dư thực tế), cap 20% Max HP. Hiệu lực tính cả giảm hồi từ boss. Không lấy phần HP bị boss khóa trần hồi dưới Max HP làm hồi dư. Chỉ Skill tạo lá chắn; lá chắn giữ qua tầng/phase và giảm cap ngay khi Max HP giảm.
- Necromancer: mỗi Totem Ward hoàn tất tạo Totem; lần thứ ba tiêu hết, thêm Grave Nova 60% sát thương chính sau giảm trừ và hồi tối đa 1 MP hiệu lực.
- Paladin: Divine Shield gây DMG tạo/làm mới vùng thánh cho hai action gây DMG tiếp theo. Mỗi hit vật lý trong vùng thánh thêm Holy damage bằng max(25% DEF, 15% damage trước CRIT) qua giảm trừ vật lý. Phản công trong vùng thánh dùng +10 điểm % RES và ×1,2 DEF trước hệ số Phòng thủ. Action cuối vẫn được bảo vệ trong các phản công của nó; hết action thì hiệu lực hết. Đánh trượt, phòng thủ và bình máu không tiêu lượt.

## Lưu trữ và giao diện

Focus, Shadow, Echo/tiến trình, Bark và Totem lưu trên run; Fury, ngưỡng đã vượt, Fury Barrier và vùng thánh lưu trên encounter combat. Đổi phase giữ encounter và các tài nguyên; kết thúc combat xóa tài nguyên chỉ thuộc combat.
Mô tả, artifact và tài nguyên hiện tại nằm trong tab Chỉ số. Log ghi hit phụ, hồi MP và lượng sát thương lá chắn hấp thụ. UI/preview không tạo tài nguyên.
Hit phụ dùng cơ chế HP/khóa phase của boss, không tràn sang phase mới và không sinh chuỗi proc/hút MP. Giao dịch hiện tại chống stale interaction và rollback toàn bộ thay đổi khi xử lý thất bại.

## Kiểm chứng

`npm run test:hardcore:awakening`: 17 nhóm kiểm thử xác định, gồm 7 class, mức sát thương cuối cùng, trần lá chắn, giá/CRIT Shadow Step, phase boss roster 1/2, nhận artifact trước rương, rollback/stale transaction, giữ tài nguyên khi resume, loại khỏi loot mộ và giới hạn Discord.
Kiểm thử hồi quy hệ stat V3, trang bị V3, engine V2, hồi phục event, roster boss 1, phân trang luật và ranh giới module đã đạt.
Chưa chạy simulate cân bằng hoặc tỷ lệ thắng theo yêu cầu của người dùng. Mục tiêu thắng tầng 999 vẫn cần đánh giá lại khi người dùng yêu cầu simulate.
