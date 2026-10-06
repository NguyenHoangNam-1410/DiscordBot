# Sinh tồn 999 — tài liệu release hiện hành

> Tài liệu đầu vào do người dùng cung cấp. Các tuyên bố về mã và kiểm thử bên dưới thuộc tài liệu gốc; trạng thái triển khai thực tế của repository được ghi trong `HARDCORE-RELEASE-2.0.0.md`. Convention hiện tại đăng ký `/sinhton` độc lập thay cho `/choi sinhton` trong tài liệu này.

**Ngày chốt tài liệu:** 03/10/2026  
**Phiên bản gameplay:** Stat v2 · Item catalog v2  
**Trạng thái:** Đã triển khai và đã chạy toàn bộ kiểm thử

Tài liệu này mô tả hành vi thực tế của game Sinh tồn đang có trong source code. Các phiên Sinh tồn cũ tiếp tục dùng luật v1 đã lưu trong state; mọi run mới dùng hệ thống bốn thuộc tính và catalog item v2.

## 1. Lệnh và vòng đời một run

- `/choi sinhton batdau`: mở bảng chọn một trong bảy class và nhập tiền cược.
- `/choi sinhton tieptuc`: chuyển phiên đang chơi sang channel hiện tại và dựng lại giao diện từ state đã lưu.
- `/choi sinhton hoso`: xem tầng cao nhất, số run, số lần hoàn thành tầng 100, rút thưởng và tử trận.
- `/choi sinhton xephang`: bảng xếp hạng theo tầng cao nhất, sau đó theo số lần hoàn thành.
- `/choi sinhton tyle`: xem tỷ lệ RNG rút gọn trong Discord.
- Prefix cũng được hỗ trợ: `<prefix>sinhton <xu> <class>` hoặc `tieptuc|hoso|xephang|tyle`.
- Tiền cược tối thiểu 10 xu, tối đa 100.000 xu và còn chịu giới hạn cược riêng do server cấu hình.
- Bảng chuẩn bị hết hạn sau 5 phút không thao tác. Xu chỉ bị giữ khi người chơi bấm Bắt đầu.
- Mỗi người chỉ có một phiên Sinh tồn đang hoạt động trong một server.
- Rút lui sau khi đã vượt ít nhất một tầng sẽ chốt payout. Rút ngay ở tầng đầu là bỏ cuộc và mất cược.
- Tử trận, chọn đánh RNGesus hoặc cầu nguyện thất bại nhận payout bằng 0.
- Tầng 100 đánh dấu hoàn thành chính thức; người chơi vẫn có thể Overrun đến tầng 999. Hạ boss tầng 999 rồi xác nhận Summit mới chốt chiến thắng cuối.
- Bản hiện tại chưa có Character Level độc lập. Tiến triển sức mạnh trong run đến từ checkpoint, item, rèn/nghiền và event.

## 2. Bản đồ 999 tầng

| Tầng | Khu vực | Quái thường |
|---:|---|---|
| 1–99 | Sanctuary | Fallen Zealot, Goatman, Dark Cultist, Lost Soul |
| 100–199 | Duncraig | Possessed Citizen, Necromorb, Ashen Marauder, Powder Keg Fanatic |
| 200–299 | Fauztinville | Necrobot, Harpylisk, Steel Terror, Fauztinville Drone |
| 300–399 | Teganze | Teganze Spirit, Storm Shaman, Poisoned Hunter, Elemental Guardian |
| 400–499 | Scosglen | Moon Panther, Witchblood Druid, Wild Hunt, Ancient Treant |
| 500–699 | Dimensional Labyrinth | Corrupted Hero, Unstable Anomaly, Abyssal Shrine, Rift Stalker |
| 700–899 | Heroic Rift | Zakarum Avatar, Heavenly Exile, Heroic Guardian, Fate Devourer |
| 900–999 | Dimensional Plane | Abyssal Spire, Void Spawn, Dream Eater, Fleshweaver Spawn |

Thứ tự ưu tiên khi tạo encounter: boss tầng 50/final boss → RNGesus → món nợ Tower Remembers → Grave Echo → encounter thường. Boss không bị thay thế bởi event khác.

Tỷ lệ encounter cơ bản ở tầng thường, trước khi Unstable Rift dịch chuyển tỷ lệ sang hòm:

| Encounter | Tỷ lệ cơ bản |
|---|---:|
| Quái thường | 53% |
| Elite | 12% |
| Hòm thường | 10% |
| Shrine | 8% |
| Treasure chest | 5% |
| Trap | 6% |
| Surprise event | 4% |
| Phòng trống | 2% |

Surprise event phải cách surprise event trước ít nhất hai tầng. Nếu điều kiện này không đạt, phần roll đó trở thành phòng trống.

## 3. Bốn thuộc tính và công thức

- **STR:** nguồn chính của damage vật lý và góp vào Defense.
- **DEX:** Accuracy, Evasion, Critical; đồng thời là nguồn damage chính của Amazon và Assassin.
- **VIT:** Max HP và hiệu lực bình máu.
- **ENE:** spell damage, Resistance và Max Mana.
- **Luck:** chỉ số đặc biệt từ item/event; không thể chọn trực tiếp tại checkpoint.

### 3.1. Chỉ số class ban đầu

| Class | STR | DEX | VIT | ENE | Base HP | Base Mana | Base RES | Base Crit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Amazon | 18 | 28 | 20 | 14 | 40 | 2 | 3 | 6% |
| Barbarian | 30 | 14 | 28 | 8 | 46 | 2 | 2 | 5% |
| Assassin | 18 | 30 | 18 | 14 | 38 | 2 | 3 | 8% |
| Sorceress | 10 | 16 | 20 | 34 | 34 | 2 | 8 | 4% |
| Druid | 20 | 16 | 20 | 24 | 42 | 2 | 6 | 5% |
| Necromancer | 12 | 16 | 22 | 30 | 36 | 2 | 7 | 4% |
| Paladin | 26 | 14 | 24 | 16 | 43 | 2 | 10 | 5% |

### 3.2. Công thức dẫn xuất

```text
Tổng thuộc tính = nền class + điểm checkpoint + điểm event + điểm đã hấp thụ + item
Max HP = Base HP + VIT*3 + Flat HP
Weapon Power = STR*trọng số STR của class + DEX*trọng số DEX của class
Physical Power = floor(Weapon Power*0.60) + Flat Physical
Damage vật lý = (Physical Power-2) .. (Physical Power+3)
Spell Power = floor(ENE*0.75) + Flat Spell
Damage phép = (Spell Power-2) .. (Spell Power+3)
Defense = floor(STR*0.30 + VIT*0.15) + Flat Defense
Accuracy = floor(60 + DEX*1.20) + Flat Accuracy
Evasion = floor(DEX*0.55) + Flat Evasion
Crit = clamp(Base Crit + DEX*0.001 + Flat Crit, 0%, 60%)
Resistance = clamp(Base RES + floor(ENE*0.20) + Flat RES, -30%, 70%)
Max Mana = clamp(floor(Base Mana + ENE/25 + Flat Mana), 1, 10)
Potion = clamp(35% + min(15%, VIT*0.0005) + bonus item, 10%, 75%)
```

Trọng số STR/DEX: Barbarian 1/0; Amazon 0,25/0,75; Assassin 0,30/0,70; Paladin 0,90/0,10; Druid 0,80/0,20; Necromancer và Sorceress 0,70/0,30.

```text
Tỷ lệ né = clamp(Evasion/(Accuracy kẻ đánh + Evasion), 5%, 45%)
Tỷ lệ trúng = 1 - tỷ lệ né
Giảm vật lý = clamp(Defense/(Defense + 100 + Floor/2), 0%, 70%)
Giảm phép = clamp(Resistance, -50%, 75%)
Critical damage = 175% damage trước giảm trừ
```

## 4. Combat và kỹ năng class

- **Max Mana:** tăng theo mốc cố định; mỗi 25 ENE thêm 1 Max Mana, sau đó cộng bonus item và cap 10.
- **Tấn công:** luôn là vật lý, có thể trượt và Critical. Sorceress/Necromancer hồi `max(1, floor(Max Mana*70%))`; năm class vật lý hồi `max(1, floor(Max Mana*40%))`.
- **Kỹ năng:** tốn 2 Mana, trừ trường hợp Sorceress đang có Class Shrine. Mana và ENE là hai giá trị khác nhau.
- **Phòng thủ:** hồi 1 Mana; vật lý dùng Defense x2; phép nhận +15 RES; sau giảm trừ còn giảm thêm 15%; miễn Critical trong lượt đó.
- **Bình máu:** tối thiểu hồi 20 HP, tiêu một bình, không dùng được khi đầy HP. Tối đa giữ 5 bình.

### 4.1. Dự báo chỉ số và sát thương

- Ở checkpoint, mục dự báo hiển thị toàn bộ chỉ số hiện tại và toàn bộ chỉ số sau từng lựa chọn `+5 STR`, `+5 DEX`, `+5 VIT` hoặc `+5 ENE`: HP, damage vật lý, damage phép, DEF, ACC, EVA, Crit, RES, Max Mana và hiệu lực bình máu.
- Ở combat, dòng **Dự báo nhận** dùng đúng quái và loại đòn kế tiếp đang hiển thị. Dự báo tính tỷ lệ trúng, Defense hoặc Resistance, Rift Modifier, curse tăng damage nhận, Bloodlust/Frenzy và Class Shrine đang hoạt động.
- Khoảng damage dự báo là lượng HP mất nếu đòn đánh trúng, **chưa tính Critical và chưa dùng nút Phòng thủ**. Vì vậy Critical thực tế có thể cao hơn con số này; bấm Phòng thủ sẽ thấp hơn.

| Class | Skill | Cơ chế |
|---|---|---|
| Barbarian | Iron Will | Đòn vật lý ×1,65. |
| Amazon | Barrage | Hai phát độc lập ×0,85; Class Shrine có 20% thêm phát thứ ba. |
| Assassin | Shadow Step | Đòn vật lý ×1,30 và né hoàn toàn phản công. |
| Sorceress | Arcane Burst | Phép ×2,10, luôn trúng, không Critical. |
| Druid | Wild Regeneration | Đòn vật lý ×1,35 và hồi 12% Max HP. |
| Necromancer | Totem Ward | Phép ×1,55, luôn trúng, không Critical và chặn phản công. |
| Paladin | Divine Shield | Đòn vật lý ×1,40 rồi tự nhận trạng thái Phòng thủ trước phản công. |

## 5. Quái, tăng độ khó và boss

```text
early = min(floor,100)
overrun = max(0,floor-100)
scaleHP = 1 + early*0.065 + overrun*0.08
scaleDamage = 1 + early*0.04 + overrun*0.038
lateProgress = clamp((floor-400)/599, 0, 1)
lateHP = 1 + lateProgress*0.50
lateDamage = 1 + lateProgress*0.90
```

HP cơ sở quái dùng `28*scaleHP`; damage dùng `5..9*scaleDamage`, sau đó nhân rank, modifier và late multiplier. Normal có hệ số 1; Champion 1,4 HP/1,15 damage; Elite 2 HP/1,35 damage; Mimic 1,7 HP/1,25 damage; Ancient Mimic 2,8 HP/1,5 damage. Boss cuối có 7,2 lần HP.

Boss xuất hiện mỗi 50 tầng và xoay vòng theo danh sách sau; tầng 999 luôn là Deimoss:

| Boss | Loại damage | Cơ chế |
|---|---|---|
| The Butcher | physical | Gây sát thương vật lý; mỗi lần ra đòn tăng 8% sát thương, tối đa 5 cộng dồn. |
| Ascendant Riftwalker | magic | Gây sát thương phép; miễn nhiễm đòn đầu tiên trong mỗi chu kỳ ba lượt. |
| Assur | physical | Gây sát thương vật lý; có Evasion cao và đòn chí mạng nguy hiểm. |
| Lucion | magic | Gây sát thương phép; hồi máu bằng 35% sát thương gây ra. |
| Deimoss the Fleshweaver | physical | Gây sát thương vật lý; Abyssal Spires giảm 25% sát thương nhận vào. |

## 6. Checkpoint, Rift Modifier, Paradox và Severance

- Mỗi 5 tầng: hồi đầy HP, nhận 2 bình và chọn **+5 STR/DEX/VIT/ENE**.
- Mỗi 10 tầng: thêm một Rift Modifier. Bot ưu tiên loại chưa có; khi đủ tám loại, modifier bắt đầu cộng dồn.
- Mỗi 25 tầng: bắt buộc chọn một Rift Paradox, hiệu lực trong đúng 5 tầng tiếp theo.
- Sau tầng 199, 399, 699 và 899: Rift Severance cho xóa toàn bộ stack của một modifier có hại. Không thể xóa Unstable Rift.

### 6.1. Rift Modifier

| Modifier | Hiệu lực mỗi stack |
|---|---|
| Stone Skin | +8% Defense theo stack hiệu dụng, cap +64%. |
| Elemental Dominion | +3% damage và khả năng dùng phép theo stack hiệu dụng, cap +24%. |
| Bloodlust | Dưới 50% HP, +6% damage theo stack hiệu dụng, cap +48%. |
| Unstable Rift | Nhiều hòm tốt hơn nhưng Mimic cũng xuất hiện nhiều hơn. |
| Fortified | +8% HP theo stack hiệu dụng, cap +64%. |
| Swift Horror | +3 Accuracy và +1,5 Evasion theo stack hiệu dụng. |
| Soul Drain | Mỗi combat có ceil(stack/4) lần đòn trúng rút 1 Mana, tối đa 3 lần. |
| Cursed Ground | −3 RES theo stack hiệu dụng khi nhận phép, cap −24. |

Stack hiệu dụng dùng giảm dần: ba stack đầu tính 100%; stack 4–8 tính 50%; stack thứ 9 trở đi tính 25%; tổng cap 8 stack hiệu dụng. Soul Drain giữ ngưỡng riêng 1 charge mỗi bốn stack, cap 3. Unstable Rift giữ công thức riêng vì các thành phần đã có cap: mỗi stack cộng 2 điểm phần trăm encounter hòm, +3 điểm phần trăm Mimic, +1 điểm phần trăm Ancient Mimic và +5 điểm phần trăm SSR trong Treasure Chest.

### 6.2. Rift Paradox

- **Máu là tiền:** mỗi phần trăm Max HP thực sự mất bởi nguồn thù địch cộng 1% payout tạm; mỗi phần trăm HP thực sự hồi trừ 1%. Biên từ −50% đến +50%. Chi phí tự nguyện không tăng bonus. Shop dùng payout gốc đã chốt nên không thể dùng payout ảo để mua đồ.
- **Ngược đời:** damage vật lý của người chơi lấy Defense làm nguồn tấn công; Defense chống vật lý của người chơi lấy trung bình damage vật lý làm nguồn. Chỉ tồn tại trong năm tầng của Paradox.

## 7. Hòm, rarity, pity và item level

Hòm roll Mimic trước: 3% Ancient Mimic và 12% Mimic ở trạng thái không có modifier/item. Nếu an toàn, tỷ lệ cơ bản là 10% SSR, 3% UR, 22% SR, 40% R, 20% rỗng và 5% SSR giả. Luck cộng 0,2 điểm phần trăm SSR mỗi điểm; bonus SSR tổng bị cap 35%.

- Sau 5 hòm không nhận SR/SSR/UR, hòm sau đảm bảo tối thiểu SR.
- Sau 10 hòm không nhận SSR, mỗi lần trượt tiếp theo cộng 2 điểm phần trăm SSR.
- Inspect có xác suất `min(95%, 25% + Luck*3% + Mimic Detection)` phát hiện Mimic.
- Bán hòm cộng 15% tiền cược vào bonus payout và hoàn thành tầng.
- Nhặt trùng đúng tên item tăng Level thay vì tạo dòng mới.
- Mỗi cấp item cộng lại toàn bộ thuộc tính và hiệu ứng đặc biệt của item. Hiệu ứng một lần như bình, hồi HP hoặc Vé cũng kích hoạt khi nhận thêm cấp.
- Thợ rèn trả 12% payout khả dụng để tăng một cấp. UR chưa giải nguyền cộng lại cả buff và curse.
- Tu sĩ trả 10% payout gốc để giải toàn bộ lời nguyền, giữ nguyên độ hiếm UR, buff, cấp và nội tại. Trạng thái đã giải được giữ khi rèn; nhặt thêm cùng món UR chưa giải chỉ thêm lời nguyền của level mới. Run cũ từng bị đổi thành SSR được khôi phục nhãn UR khi resume, không đổi buff/cấp hoặc lớp nguyền đã giải.
- Horadric Forge nghiền đúng một cấp item. Phần chỉ số của cấp bị nghiền được hấp thụ vĩnh viễn trong run, sau đó nhận thêm phần thưởng event.

## 8. Catalog event hiện hành

Kết quả ẩn của event được roll khi encounter được tạo và lưu trong SQLite. Restart bot hoặc `/choi sinhton tieptuc` không roll lại.

### 8.1. Shrine

Khi gặp Shrine, giao diện thay phần chỉ số của lượt trước bằng catalog sáu Shrine bên dưới. Sáu loại được chọn đồng đều, tương đương khoảng 16,7% mỗi loại; kết quả cụ thể vẫn được giữ kín cho tới khi người chơi bấm **Chạm Shrine**.

| Shrine | Kết quả khi chạm |
|---|---|
| Healing | Hồi đầy HP. |
| Armor | +5 STR hoặc +5 VIT, lựa chọn được pre-roll. |
| Blood | +8 STR, −5 VIT; HP bị clamp nếu Max HP giảm. |
| Experience | Cộng 25% tiền cược vào bonus payout. |
| Corrupted | +12 STR, −8 VIT. |
| Fake | Gây max(10, 30% Max HP) damage. |

### 8.2. Trap và Wrong Portal

- **Tax Collector:** mất 15% payout hiện tại.
- **Potion Thief:** mất một bình nếu còn bình.
- Mỗi Luck cho 1,5% Lucky Break né hai trap trên, cap 30%.
- **Wrong Portal:** cố định 50% tốt/50% xấu; Luck không tác động. Kết quả xấu luôn gọi Rift Ambusher Elite và quái đánh phủ đầu.

| Portal tốt | Kết quả |
|---|---|
| Healing Sanctuary | +10 Max HP, hồi đầy HP, +1 bình. |
| Treasure Vault | +50% tiền cược vào bonus payout. |
| Rift Blessing | +6 STR, +6 ENE, +1 Luck. |

| Portal xấu | Kết quả trước trận phục kích |
|---|---|
| Blood Loss | Mất 15% Max HP nhưng không chết trực tiếp. |
| Mana Void | Mana về 0. |
| Supply Loss | Mất tối đa 2 bình. |
| Payout Corruption | Mất 10% payout hiện tại. |
| Dimensional Curse | −5 STR và −5 ENE. |

### 8.3. Surprise event

| Event | Lựa chọn và kết quả |
|---|---|
| Wandering Healer | Miễn phí hồi max(20, 30% Max HP) và +1 bình. |
| Treasure Goblin | Cơ hội bắt = min(90%, 60% + Luck*1% + bonus item). Thành công +25% tiền cược; thất bại mất 10% payout. |
| Altar of Sacrifice | Hiến tối đa 20% Max HP nhưng giữ ít nhất 1 HP để nhận +6 stat damage chính; hoặc trả 10% payout để nhận +6 VIT. |
| Cursed Gambler | Cược 10% hoặc 25% payout; 50% thắng. Thắng cộng gấp đôi khoản đặt vào bonus, thua mất khoản đã chi. |
| Lost Adventurer | Cứu bằng 1 bình để nhận R/SR (30% SR); hoặc cướp ngay nhận R với 25% biến thành UR. |
| Blood Fountain | 60% hồi đầy HP; 25% +15 Max HP/HP; 15% gọi Blood Mimic. |
| Blacksmith | Trả 12% payout để tăng một cấp item ngẫu nhiên đang có. |
| Purifier | Trả 20% payout để giải curse một UR ngẫu nhiên đang có. |
| Horadric Forge | Nghiền một cấp item để chọn +6 stat damage chính, +7 STR/VIT đã pre-roll, +4 VIT; SSR/UR còn có thể đổi lấy một Vé Thoát Hiểm. |
| Rift Merchant | Hiện ba món ngẫu nhiên: bình 5%, hồi đầy 8%, +1 Luck 10%, SR 15%, Vé 25% payout. Chỉ mua một món. |
| Mirror of Fate | Chọn +10 stat damage chính; hoặc +8 VIT và +5 STR/DEX phòng thủ; hoặc đập gương: 20% +2 Luck, 80% đấu Mirror Clone dùng chỉ số của người chơi. |
| Treasure Room | Ba hòm đỏ/xanh/vàng, một hòm là Mimic. Được inspect một màu. Đỏ +5 damage trực tiếp; xanh +6 Defense/+5 RES; vàng +50% cược và +1 Luck. |
| Rift Contract | Trong 3 tầng: không dùng bình → SSR; không dùng skill → +50% cược; không Defend → +10 stat damage chính. Vi phạm chỉ hủy thưởng. |
| Class Shrine | Cường hóa class trong 3 tầng: Amazon có cơ hội phát thứ ba; Barbarian +8 Defense khi HP ≤30%; Assassin chắc chắn né một phản công; Sorceress dùng một skill miễn phí; Druid hồi 5% Max HP mỗi tầng sau tầng đầu; Necromancer chặn một đòn; Paladin +10 RES. |
| Strange Doors | Cửa sáng 70% hồi đầy/+1 bình, xấu mất 20% Max HP; cửa vàng 70% +50% cược, xấu gọi Mimic; cửa tối 60% SSR, xấu gọi Premature Rift Boss. |
| Rift Duelist | Chọn đấu stat một ván hoặc đấu trang bị tối đa năm ván; chi tiết ở mục dưới. |
| Payout/HP/Diamond Item Shop | Ba offer item, mua tối đa một món; inventory và giá được khóa từ khi encounter sinh ra. |

### 8.4. Rift Duelist

- Chế độ stat: thắng nhận +6 theo tay đã chọn — Búa→STR, Kéo→DEX, Bao→ENE. Hòa hoặc thua bị trừ tổng cộng tối đa 6 điểm thuộc tính theo chuỗi đã pre-roll; không stat nào xuống dưới 1.
- Chế độ trang bị: cần thắng 3 trong tối đa 5 ván. Thắng nhận SSR 75% hoặc UR 25%. Thua mất một item R/SR/SSR đã khóa lúc event sinh ra; UR không bị mất. Không có item hợp lệ thì không mất gì.
- Năm tay đối thủ, chuỗi phạt, reward và item có thể mất đều được pre-roll. Luck không hé lộ hoặc đổi tay.
- Event không thu tiền và không cộng thêm thưởng tầng ngoài phần thưởng đã chọn.

### 8.5. Ba Item Shop

| Shop | Rarity | Giá | Giới hạn |
|---|---|---|---|
| Payout | 45% R, 40% SR, 15% SSR | 5%/12%/25% payout gốc | Tối đa 5 lần/run |
| Blood | 55% SR, 35% SSR, 10% UR | 12%/25%/40% Max HP lúc shop xuất hiện | Tối đa 3 lần/run |
| Diamond | 40% SR, 40% SSR, 20% UR | 200/600/1.600 kim cương | Chỉ từ tầng 101, tối đa 2 lần/run |

Mỗi loại shop cách lần xuất hiện trước của cùng loại ít nhất 50 tầng. Blood Shop thanh toán bằng cách giảm Max HP trong suốt run: SR/SSR/UR lần lượt 12%/25%/40% Max HP lúc gặp, làm tròn lên và tối thiểu 1; giá được khóa. Max HP trước mua phải lớn hơn giá, còn ít nhất 1 Max HP trước khi nhận item. HP hiện tại chỉ được giới hạn xuống Max HP mới, không trừ thêm HP. Hồi máu/checkpoint/giải nguyền không hoàn chi phí; buff Max HP/VIT của item được tính sau khi thanh toán. Shop đang mở từ bản cũ giữ nguyên offer/giá nhưng lần mua tiếp theo dùng cách trả Max HP. Diamond Shop dùng operation ID idempotent để bấm lặp không trừ tiền hai lần.

## 9. RNGesus

Luật hiện hành v2.0.1, cập nhật ngày 2026-10-05:

- Đầu run không gặp ở tầng 1–4. Tỷ lệ nền: tầng 5–9 là 0,3%; 10–19 là 0,6%; từ 20 là 1%.
- Sau khi vượt RNGesus tại tầng F, reset Chaos và bộ đếm không gặp. Áp dụng cả khi chạy thất bại được vé thoát hiểm cứu, hoặc tử trận được Lost Adventurer/vé hồi sinh cứu và sang tầng kế.
- Tầng F+1 chắc chắn không có RNGesus (0%), không roll biến động hay spike. Không xuất hiện ở hai tầng liền nhau.
- Tính lại nhịp tăng từ lần vượt gần nhất: F+2–F+6 có nền 0,3%; F+7–F+16 có nền 0,6%; từ F+17 có nền 1%. Ví dụ vượt RNGesus ở tầng 80: tầng 81 an toàn, tầng 82–86 nền 0,3%, 87–96 nền 0,6%, từ 97 nền 1%.
- Boss mỗi 50 tầng và boss cuối 999 được ưu tiên. Tầng boss/tầng bị chặn không roll RNGesus và không tăng bộ đếm không gặp.
- Ở tầng có roll: nền nhân ngẫu nhiên ×0,25–3; mỗi lần không gặp cộng 0,05 điểm phần trăm cho lần sau; mỗi roll có 2,5% cơ hội spike thêm 4–10 điểm phần trăm. Xác suất cuối tối đa 12%. Run legacy giới hạn phần cộng từ chuỗi không gặp ở 2,5 điểm %; V2 chỉ chặn tỷ lệ cuối ở 12%.
- **Đánh:** gây tử trận ngay vì không thể thắng RNGesus. Lost Adventurer/vé hồi sinh có thể cứu nếu còn; không được cứu thì kết thúc run.
- **Bỏ chạy (V2):** 100% → 95% → 90% → 85% → 80% → 75%, các lần sau giữ 75%. Mỗi lần chọn chạy tăng bộ đếm, kể cả thất bại được vé cứu. Chạy thành công giữ vé; thất bại tự dùng một vé thoát hiểm nếu có. Không có vé thoát hiểm thì tử trận và kiểm tra cơ chế hồi sinh.
- **Hối lộ:** cần payout hiển thị ít nhất 1.000 xu; giảm hệ số payout 40% và vượt tầng.
- **Cầu nguyện (V2):** 30% thành công, hoặc 60% nếu mang vé cầu nguyện; áp dụng cả run. Thành công nhận một trang bị UR có nguyền; thất bại tử trận và kiểm tra cơ chế hồi sinh.
- **Vé thoát hiểm (V2):** chỉ tự cứu khi bỏ chạy thất bại, tối đa một vé trong run; không có nút dùng vé riêng. Vé thoát hiểm không cứu khi Đánh/cầu nguyện thất bại.
- Reset tỷ lệ **gặp** không reset tỷ lệ **bỏ chạy** hay hiệu lực vé cầu nguyện. Mốc reset lưu trong run, tiếp tục/restart không đặt lại hoặc roll lại kết quả đã khóa.

Chaos trên UI là tỷ lệ gặp của lần roll gần nhất, không phải debuff và không làm giảm chỉ số. Tỷ lệ nền và Chaos thực tế khác nhau do biến động, chuỗi không gặp và spike.

## 10. Grave Echo và Server Nemesis

- Khi run v2 chết hoặc chết bởi RNGesus sau khi đã vượt tầng 100, bot lưu tên, class, tầng chết, skill, hướng build và tối đa ba item mạnh nhất. Cấp item snapshot cap 5.
- Không sao chép raw HP/damage. Khi gặp, bot tạo Elite/Boss theo tầng hiện tại rồi áp profile build.
- Từ tầng 101, mỗi dải 100 tầng có tối đa một lần gặp; mỗi encounter hợp lệ có 1% cơ hội. Không gặp mộ của chính mình.
- Chỉ chọn Echo có tầng tử trận không lớn hơn hai lần tầng hiện tại; ưu tiên Nemesis, số mạng cao rồi mới xét độ gần tầng.
- Mỗi server giữ tối đa 10 Echo/Nemesis. Echo thường của cùng một người được thay bằng bản mới; record hết hạn sau 7 ngày.
- Claim được khóa 30 phút để hai run không thể cùng cướp hoặc giết một Echo.

| Lựa chọn | Kết quả |
|---|---|
| Cầu nguyện | Hồi 15% Max HP, thả claim; mộ vẫn tồn tại. |
| Cướp mộ | Nhận một item snapshot; 50% đánh thức Echo. Nếu không thức, Echo bị xóa. |
| Khiêu chiến | Gọi Echo mạnh hơn 25%; chưa lấy trước item. |
| Bỏ đi | Không nhận gì, thả claim; mộ vẫn tồn tại. |

Build DEX cho Echo +8 Evasion; VIT +12 Defense; STR +10% Crit; ENE khiến mọi đòn là phép. Nếu Echo giết người chơi, nó hấp thụ tối đa một item từ run, tăng level và kill, trở thành Server Nemesis rồi tồn tại thêm 7 ngày. Hạ Echo/Nemesis nhận một item nó giữ, bonus payout tăng theo số mạng và xóa record khỏi server.

## 11. The Tower Remembers

- Các hành động được ghi nhớ: cứu/cướp Lost Adventurer, hiến HP/payout, bỏ qua event, đập Mirror, bán hòm, hối lộ/cầu nguyện RNGesus.
- State giữ tối đa 8 món nợ. Mỗi món kích hoạt ngẫu nhiên sau 10–30 tầng và chỉ một lần.
- Khi ghi nhận, kết quả tốt/xấu được pre-roll 50/50 và được giữ nguyên qua restart/resume.
- Hậu quả tốt hồi khoảng 10–20% Max HP và cộng khoảng 10–30% tiền cược vào payout.
- Hậu quả xấu hoặc lấy 10% payout, hoặc gọi Bounty Hunter Elite.
- Sau lựa chọn ban đầu bot chỉ báo `The Tower will remember this.` và không tiết lộ kết quả đã roll.

## 12. Payout và kết thúc run

```text
floorPart = min(cleared,100)
checkpointCount = min(20, floor(floorPart/5))
baseMultiplier = 1 + min(floorPart,50)*0.06 + max(0,floorPart-50)*0.10 + checkpointCount*0.15
gross = floor((stake*baseMultiplier + bonus)*payoutFactor)
payout = clamp(gross, 0, 10.000.000) - payoutSpent
```

Hệ số tầng ngừng tăng sau tầng 100; bonus từ combat, item, Shrine và event vẫn tăng. Blood Paradox chỉ tác động preview/chốt cuối, không làm tăng số payout có thể chi trong shop. Cashout hoặc Summit mới trả payout; death/RNGesus/forfeit trả 0.

Thành tích toàn tài khoản hiện có các mốc Sinh tồn: tầng 10 thưởng 10.000 xu và 30 kim cương; tầng 25 thưởng 30.000 xu và 100 kim cương; tầng 50 thưởng 75.000 xu và 250 kim cương. Sinh tồn không roll vật phẩm shop/economy bên ngoài sau ván; item trong catalog chỉ tồn tại trong run.

## 13. Chống lỗi và abuse

- Mọi nút mang `turn`; nút cũ bị từ chối bằng `STALE_ACTION`.
- Interaction của cùng session được xếp hàng để tránh hai click đồng thời.
- Toàn bộ mutation run, economy, shop và Grave Echo chạy trong SQLite transaction.
- Giao dịch kim cương có operation ID idempotent.
- Payout shop kiểm tra payout gốc sau các khoản đã chi; không dùng bonus Blood Paradox.
- Blood Shop kiểm tra lại Max HP ngay lúc mua, giảm giới hạn HP trong suốt run và giữ ít nhất 1 Max HP trước khi nhận item.
- Kết quả RNG/event, inventory shop, giá, tay Duelist và karma consequence được lưu trong state; resume không reroll.
- Phiên không hoạt động quá 7 ngày bị tính là forfeit, payout bằng 0 và phiên bị xóa.
- Item, thuộc tính và stat dẫn xuất được tính lại từ nguồn để tránh cộng chỉ số hai lần khi mở lại UI.

## 14. Catalog item v2 — tinh gọn ngày 06/10/2026

Catalog hiện có **63 món: 10 R, 13 SR, 24 SSR, 16 UR**. R/SR mỗi món chỉ có một chỉ số hoặc tác dụng trực tiếp, không trùng tác dụng trong cùng độ hiếm. Tác dụng tương ứng ở SR mạnh hơn R. STR/DEX/VIT/ENE vẫn ảnh hưởng các chỉ số dẫn xuất theo công thức của class.

Thuộc tính trong bảng được cộng **mỗi cấp**. Cột đặc biệt chỉ liệt kê hiệu ứng thật sự còn hoạt động trong stat v2; các dòng attack/defense cũ trong source đã được thay bằng bốn thuộc tính. R=Common, SR=Rare, SSR=Legendary, UR=Cursed.

### 14.1. R — Common (10 món)

| Item | Nhóm | Thuộc tính mỗi cấp | Hiệu ứng đặc biệt | Lời nguyền khi chưa giải |
|---|---|---|---|---|
| Rusted Edge | weapon | +5 STR | Không có | — |
| Cracked Wand | weapon | +5 ENE | Không có | — |
| Hunter Bow | weapon | +5 DEX | Không có | — |
| Minor Life Charm | charm | +5 VIT | Không có | — |
| Rabbit Foot | charm | Không cộng thuộc tính | +1 Luck | — |
| Red Potion Belt | utility | Không cộng thuộc tính | +1 bình khi nhận mỗi cấp | — |
| Mana Fragment | charm | Không cộng thuộc tính | +1 Max Mana | — |
| Field Bandage | utility | Không cộng thuộc tính | hồi 10 HP khi nhận mỗi cấp | — |
| Goblin Hook | utility | Không cộng thuộc tính | +2% bắt Goblin | — |
| Chest Chalk | utility | Không cộng thuộc tính | +3% phát hiện Mimic | — |

### 14.2. SR — Rare (13 món)

| Item | Nhóm | Thuộc tính mỗi cấp | Hiệu ứng đặc biệt | Lời nguyền khi chưa giải |
|---|---|---|---|---|
| Heart of the Wild | charm | +10 VIT | Không có | — |
| Lucky Coin | charm | Không cộng thuộc tính | +3 Luck | — |
| Vanguard Spear | weapon | +10 STR | Không có | — |
| Shadowstep Boots | armor | +10 DEX | Không có | — |
| Rift Compass | utility | Không cộng thuộc tính | +8% phát hiện Mimic | — |
| Alchemist Belt | utility | Không cộng thuộc tính | +2 bình khi nhận mỗi cấp | — |
| Mana Prism | charm | +10 ENE | Không có | — |
| Goblin Snare | utility | Không cộng thuộc tính | +8% bắt Goblin | — |
| Executioner’s Mark | charm | Không cộng thuộc tính | +12% damage Elite | — |
| Boss Hunter’s Badge | charm | Không cộng thuộc tính | +12% damage Boss | — |
| Golden Monocle | utility | Không cộng thuộc tính | +3% tìm SSR | — |
| Deep Flask | utility | Không cộng thuộc tính | +10% hiệu lực bình | — |
| Spirit Lantern | utility | Không cộng thuộc tính | +2 Max Mana | — |

### 14.3. SSR — Legendary

| Item | Nhóm | Thuộc tính mỗi cấp | Hiệu ứng đặc biệt | Lời nguyền khi chưa giải |
|---|---|---|---|---|
| One More Hit | charm | +12 VIT | +1 Vé Thoát Hiểm khi nhận mỗi cấp | — |
| The Last Bad Decision | weapon | +12 STR, +12 DEX, -5 VIT | Không có | — |
| Warden’s Bulwark | armor | +10 STR, +16 VIT | +2 Defense | — |
| Eye of RNGesus | charm | +5 STR, +5 DEX, +5 ENE | +7 Luck | — |
| Phoenix Blood | charm | +12 VIT, +14 ENE | Không có | — |
| Riftbreaker | weapon | +12 STR, +8 DEX | +20% damage Boss, +15% damage Elite | — |
| Living Armor | armor | +18 VIT | +6 Defense | — |
| Mimic Crown | armor | +6 DEX, +6 ENE | +3 Luck, +20% phát hiện Mimic, +5% tìm SSR | — |
| Endless Flask | utility | +10 VIT, +8 ENE | +20% hiệu lực bình, +1 bình khi nhận mỗi cấp | — |
| Chrono Shard | charm | +20 DEX | +2 Luck | — |
| Seraphic Aegis | armor | +10 VIT, +18 ENE | +5 Resistance | — |
| Doomwhisper | weapon | +14 STR, +12 DEX | Không có | — |
| Worldroot Seed | charm | +26 VIT | Không có | — |
| Void Lens | utility | +8 DEX, +8 ENE | +15% phát hiện Mimic, +8% tìm SSR | — |
| Angelic Engine | charm | +6 VIT, +18 ENE | +2 Max Mana | — |
| Predator’s Instinct | charm | +6 STR, +14 DEX | +25% damage Elite | — |
| Deimoss Scar | charm | +14 STR, +6 VIT | +30% damage Boss | — |
| Golden Goblet | utility | +6 DEX, +6 VIT | +5 Luck, +18% bắt Goblin | — |
| Astral Mail | armor | +6 STR, +8 DEX, +6 VIT, +8 ENE | Không có | — |
| Blood Moon Edge | weapon | +24 ENE, +4 VIT | Không có | — |
| Oracle Mask | armor | +12 DEX, +10 ENE | +5 Luck | — |
| Eternal Clover | charm | Không cộng thuộc tính | +10 Luck, +4% tìm SSR | — |
| Titan Heart | charm | +8 STR, +18 VIT | Không có | — |
| Sevenfold Sigil | jewelry | +7 STR, +7 DEX, +7 VIT, +7 ENE | +3 Luck | — |

### 14.4. UR — Cursed

| Item | Nhóm | Thuộc tính mỗi cấp | Hiệu ứng đặc biệt | Lời nguyền khi chưa giải |
|---|---|---|---|---|
| Glass Cannon | weapon | +35 STR, +15 DEX | Không có | Defense = 0 |
| Schrödinger’s Armor | armor | +20 STR, +30 VIT | Không có | nhận thêm 20% damage vật lý (tối đa 100%) |
| Goblin’s Debt | charm | +20 DEX, +15 VIT | +12 Luck, +20% bắt Goblin | mất 15% payout xu mỗi cấp chưa giải |
| Crown of Ruin | armor | +20 STR, +15 VIT | +8 Luck | giảm 1 sức chứa bình mỗi cấp chưa giải, còn tối thiểu 1 bình |
| Blood Pact | weapon | +40 ENE, +10 VIT | Không có | Skill tốn 3% Max HP mỗi cấp chưa giải (tối đa 15%); làm tròn xuống, tối thiểu 1 HP, phải còn 1 HP sau chi phí |
| Void Heart | charm | +35 VIT, +20 ENE | Không có | -15% hiệu lực bình |
| Broken Hourglass | charm | +40 DEX | +8 Luck | Tấn công hồi ít hơn 1 MP mỗi cấp chưa giải (tối đa giảm 3 MP, tối thiểu hồi 0 MP); Phòng thủ không đổi |
| Mimic’s Promise | utility | +20 DEX, +15 ENE | +10% phát hiện Mimic, +12% tìm SSR | +12% Mimic |
| Berserker Chains | weapon | +40 STR, +10 DEX | +20% damage Elite | nhận thêm 18% damage |
| Hollow Crown | armor | +10 VIT, +40 ENE | +2 Max Mana | Skill tốn thêm 1 MP mỗi cấp chưa giải (tối đa thêm 3 MP); Skill miễn phí từ Class Shrine vẫn tốn 0 MP |
| Ashen Wings | armor | +40 DEX, +10 ENE | Không có | -20 Resistance |
| Soul Leash | charm | +20 STR, +25 ENE | +35% damage Boss | khi vào combat mất 1 MP mỗi cấp chưa giải (tối đa 3 MP, không xuống dưới 0), chỉ một lần/combat và trước nội tại hồi MP |
| Bleeding Star | jewelry | +20 STR, +30 DEX | Không có | mất 6% Max HP sau mỗi tầng |
| Null Idol | charm | +20 STR, +15 VIT, +20 ENE | Không có | lượng HP hồi cho bạn giảm 20% mỗi cấp chưa giải (tối đa 60%); không giảm hồi đầy tại Checkpoint hoặc hồi sinh |
| Black Sun | charm | +10 DEX, +30 ENE | +10 Luck, +15% tìm SSR | nhận thêm 20% damage phép (tối đa 100%) |
| Oathbreaker | weapon | +25 STR, +15 DEX, +10 VIT | +25% damage Boss, +25% damage Elite | DMG Tấn công/Skill lên quái thường giảm 20% mỗi cấp chưa giải (tối đa 60%); không giảm DMG lên Tinh anh/Boss hoặc phản sát thương |

SSR/UR được phân hóa vai trò ngày 06/10/2026, giữ 63 mã để không làm mất vật phẩm người chơi: Warden thiên STR/VIT/DEF, Seraphic thiên ENE/VIT/RES, Living Armor chuyên VIT/DEF, Blood Moon Edge công phép. Phoenix Blood hỗ trợ ENE và hồi phục, Worldroot Seed chuyên VIT/hồi phục, Titan Heart STR/VIT/sức chứa bình. Eternal Clover chuyên LUCK; Blood Pact là vũ khí UR công phép. Nội tại vẫn chỉ cộng giữa các mã món khác nhau, không nhân level.

Lời nguyền cộng theo số cấp chưa giải, có trần riêng ghi trong bảng; giải nguyền/chuyển hóa gỡ đúng cấp tương ứng. Chi phí HP Skill cộng với Huyết Ước Rift Paradox, phải còn ít nhất 1 HP. Chi phí MP cộng sau luật Paradox; Skill Class Shrine miễn phí vẫn 0 MP. Soul Leash rút MP một lần/combat, khóa cùng khởi động nội tại, không lặp khi resume/hồi sinh trong cùng combat. Null Idol giảm bình, Skill, event và nội tại hồi HP; Checkpoint/hồi sinh giữ luật hồi phục gốc. Sức chứa giảm có thể làm bỏ bình vượt giới hạn, giải nguyền không hoàn lại bình đã bỏ. Run đang chơi giữ definition đã lưu, kể cả khi nhận thêm level cùng mã; drop và loadout mới dùng thiết kế mới.

Rơi trang bị khi hạ quái: tỷ lệ = min(20%, 1% + LUCK × 0,5 điểm %), chốt LUCK khi vào combat. Khi drop thành công, nhận tự động một món: quái thường/Mimic thường R 60% · SR 40%; Tinh anh SR 60% · SSR 40%; Boss/Deimoss tầng 999 SSR 60% · UR 40%. Boss cuối khu vực có rương (mốc đầu khu vực > 1 trong bản đồ hiện hành) không roll thêm drop. Ancient Mimic/Blood Mimic giữ thưởng cố định hiện tại và roll thêm drop tinh anh. Grave Echo giữ thưởng mộ và nhận thêm drop theo hạng quái. Drop từ quái không chịu hiệu ứng tìm SSR, nội tại may mắn sự kiện, Rift hay pity hòm; không tăng/reset các bộ đếm hòm. Đồ trùng tăng một level, đồ chỉ tồn tại trong run. Hạ bằng Tấn công/Skill/phản sát thương đều có drop khi bạn còn sống; quái chưa chết hoặc hồi sinh không tạo thêm lần roll. Resume và bấm lặp không roll lại. Tỷ lệ và bảng độ hiếm chỉ hiển thị ở Chi tiết/luật; vật phẩm nhận hiển thị Lượt vừa rồi.

### 14.5. Gộp mã item cũ

Đồ trong túi ngoài run tự chuyển theo bảng dưới, cùng độ hiếm và giữ tổng số lượng (1 món cũ thành 1 món mới). Cửa hàng đã lưu đổi mã và bù đủ 5 món khác nhau, sau đó lưu lại để không reroll. Run đang chơi giữ nguyên definition/hiệu ứng đã lưu, không cộng lại bình hoặc HP. Pool rơi đồ mới và loadout mới dùng catalog tinh gọn. Lịch sử mua giữ mã gốc để xử lý bấm lặp; refund/setup lỗi chuyển về mã chuẩn.

| Mã cũ | Mã thay thế |
|---|---|
| iron_dagger | hunter_bow |
| militia_spear | rusted_edge |
| bone_club | rusted_edge |
| dented_plate | minor_life_charm |
| wooden_buckler | minor_life_charm |
| worn_boots | hunter_bow |
| copper_ring | cracked_wand |
| scout_lens | chest_chalk |
| battle_token | rusted_edge |
| silver_thread | cracked_wand |
| traveler_map | rabbit_foot |
| small_ward | minor_life_charm |
| sharpening_stone | rusted_edge |
| ember_bead | cracked_wand |
| fox_mask | hunter_bow |
| oak_talisman | minor_life_charm |
| glass_bead | hunter_bow |
| iron_nail | rusted_edge |
| hawk_feather | hunter_bow |
| smoke_vial | hunter_bow |
| cold_ash | cracked_wand |
| faded_clover | rabbit_foot |
| hunters_fang | shadowstep_boots |
| runed_carapace | heart_of_the_wild |
| bone_talisman | heart_of_the_wild |
| bloodstone | vanguard_spear |
| guardian_seal | heart_of_the_wild |
| wardens_chain | vanguard_spear |
| moonlit_blade | mana_prism |
| assassins_ribbon | shadowstep_boots |
| lionheart_emblem | heart_of_the_wild |
| stormglass | shadowstep_boots |
| saints_ward | mana_prism |
| riftwalkers_boots | shadowstep_boots |
| war_drums | vanguard_spear |
| steel_lotus | shadowstep_boots |
| fortune_dice | lucky_coin |

### 14.6. Nội tại trang bị

Mỗi món trong catalog có đúng một nội tại. Nội tại áp dụng một lần cho mỗi mã món đang có level > 0; không nhân theo level. Các món khác nhau cùng loại cộng rồi áp trần chung và dùng một lần roll cho mỗi trigger. Giải nguyền giữ nguyên nội tại. Chuyển hóa level cuối hoặc mất món sẽ mất nội tại; phần chỉ số chuyển hóa không mang nội tại.

Run cũ giữ chỉ số snapshot. Mã món còn trong catalog được bổ sung nội tại tương ứng khi thiếu trường passive; không roll lại giá hay kết quả event đang gặp. Mã món đã gộp không còn trong catalog giữ snapshot cũ. Các món nhận mới lưu cả nội tại trong snapshot.

| Nội tại                       | Trần cộng dồn / quy tắc                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cuồng chiến                   | Hệ số tối đa 40%; DMG Tấn công/Skill nhân 1 + hệ số × tỷ lệ HP đã mất. Không tăng phản sát thương.                                                                                                                                                                                         |
| Hút MP                        | 35% cơ hội hồi 1 MP cho bạn khi Tấn công/Skill thực gây DMG, một lần/hành động kể cả nhiều phát; không vượt Max MP.                                                                                                                                                                        |
| Phản thủ / Gai / Né phản kích | Hệ số 40% / 20% / cơ hội 50%. Phản thủ chỉ khi bấm Phòng thủ, không tính thủ tự động từ Skill. Gai/phản thủ chỉ dùng HP thực mất từ đòn quái khi bạn còn sống. Né phản kích chỉ tính né vật lý tự nhiên, không tính chặn/né từ Skill hoặc Class Shrine.                                    |
| Phản sát thương chung         | Tổng mỗi lượt tối đa 50% sát thương cơ bản trung bình của class (phép cho Sorceress/Necromancer, vật lý cho class khác). Gây vật lý, chịu DEF, miễn sát thương Riftwalker và giảm Deimoss; không crit, không kích hoạt nội tại khác. Hạ quái nhận thưởng/loot và qua tầng như bình thường. |
| Thương lượng                  | Giảm tối đa 20% giá xu tại Rift Merchant/Payout Item Shop; làm tròn lên, tối thiểu 1 xu, khóa khi tạo offer. Không giảm giá HP/kim cương/cửa hàng ngoài run.                                                                                                                               |
| May mắn sự kiện               | Tăng tối đa 10 điểm % nhánh tốt Blood Fountain, Three Doors, Wrong Portal; nhánh tốt tối đa 95%. Fountain chia nhánh tốt theo tỷ lệ gốc 60:25. Không tăng gặp event, loot, karma, Gambler, Duelist hay RNGesus.                                                                            |
| Túi bình                      | Cơ bản 5, thêm tối đa 5 (tổng 10). Chỉ nâng sức chứa, không cấp bình. Mọi nguồn tiếp tế tuân theo giới hạn hiện tại.                                                                                                                                                                       |
| Trần CRIT / né                | Tăng tối đa 15 điểm %: CRIT tối đa 75%, né vật lý tối đa 60%. Chỉ nâng trần, không cộng xác suất thực tế/EVA; không né phép, không đổi trần né của quái.                                                                                                                                   |
| Khởi động MP                  | Tối đa 75% cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat, không vượt Max MP; khóa trên encounter, không roll lại khi resume/UI.                                                                                                                                                       |
| Nghỉ chân                     | Hồi tối đa 5% Max HP cho bạn khi qua tầng không có combat, một lần/tầng; không vượt Max HP, log HP trước → sau.                                                                                                                                                                            |
| Tiết kiệm bình                | Tối đa 25% cơ hội không tiêu hao bình khi dùng hợp lệ. Phải có bình; vẫn hồi bình thường, vẫn nhận phản công và vẫn vi phạm hợp đồng cấm dùng bình. Không bỏ qua khóa bình/full HP.                                                                                                        |
| Chống bẫy                     | Giảm tối đa 25% HP mất từ Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP, curse hoặc combat.                                                                                                                                                                                      |
| Tiên tri                      | Mỗi món đóng góp một lựa chọn trong event phù hợp, tối đa hai lựa chọn khác nhau/event. Khóa lựa chọn và an toàn/nguy hiểm lúc tạo event, chỉ kết quả tức thời, không tiết lộ thưởng/karma. Không áp dụng RNGesus, Gambler hoặc Duelist. Mirror chỉ tiên tri nhánh đập gương.              |

Mô tả từng món (nguồn mapping: src/hardcore/itemPassives.js):

| Độ hiếm | Trang bị | Nội tại |
|---|---|---|
| R | Rusted Edge | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 10% khi gần cạn HP. |
| R | Cracked Wand | Hút MP: 8% cơ hội hồi 1 MP cho bạn khi Tấn công/Skill gây sát thương, tối đa 1 lần/lượt. |
| R | Hunter Bow | Né phản kích: né tự nhiên đòn vật lý có 10% cơ hội phản sát thương vật lý lên quái; không tính né/chặn từ Skill. |
| R | Minor Life Charm | Gai: khi sống sót sau đòn quái, phản 5% HP thực mất thành sát thương vật lý lên quái. |
| R | Rabbit Foot | May mắn sự kiện: tăng 2 điểm % tỷ lệ nhánh tốt ở Blood Fountain, Three Doors và Wrong Portal. |
| R | Red Potion Belt | Túi bình: tăng giới hạn của bạn thêm 1 bình máu; không tặng bình. |
| R | Mana Fragment | Khởi động MP: 20% cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat. |
| R | Field Bandage | Nghỉ chân: hồi 1% Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng. |
| R | Goblin Hook | Thương lượng: giảm 3% giá xu tại Rift Merchant/Payout Item Shop; không giảm HP, kim cương hay cửa hàng ngoài run. |
| R | Chest Chalk | Chống bẫy: giảm 5% HP mất do Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP hay nguyền. |
| SR | Heart of the Wild | Nghỉ chân: hồi 2% Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng. |
| SR | Lucky Coin | May mắn sự kiện: tăng 3 điểm % tỷ lệ nhánh tốt ở Blood Fountain, Three Doors và Wrong Portal. |
| SR | Vanguard Spear | Phản đòn: khi bấm Phòng thủ và sống sót, phản 15% HP thực mất thành sát thương vật lý lên quái. |
| SR | Shadowstep Boots | Né phản kích: né tự nhiên đòn vật lý có 15% cơ hội phản sát thương vật lý lên quái; không tính né/chặn từ Skill. |
| SR | Rift Compass | Chống bẫy: giảm 10% HP mất do Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP hay nguyền. |
| SR | Alchemist Belt | Túi bình: tăng giới hạn của bạn thêm 1 bình máu; không tặng bình. |
| SR | Mana Prism | Hút MP: 12% cơ hội hồi 1 MP cho bạn khi Tấn công/Skill gây sát thương, tối đa 1 lần/lượt. |
| SR | Goblin Snare | Thương lượng: giảm 5% giá xu tại Rift Merchant/Payout Item Shop; không giảm HP, kim cương hay cửa hàng ngoài run. |
| SR | Executioner’s Mark | Trần chí mạng: tăng 3 điểm % giới hạn CRIT của bạn; không cộng tỷ lệ CRIT hiện tại. |
| SR | Boss Hunter’s Badge | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 15% khi gần cạn HP. |
| SR | Golden Monocle | Trần né: tăng 3 điểm % giới hạn né đòn vật lý của bạn; không cộng EVA, không né phép. |
| SR | Deep Flask | Tiết kiệm bình: 8% cơ hội dùng bình mà không tiêu hao; cần có bình, quái vẫn phản công. |
| SR | Spirit Lantern | Khởi động MP: 30% cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat. |
| SSR | One More Hit | Tiết kiệm bình: 12% cơ hội dùng bình mà không tiêu hao; cần có bình, quái vẫn phản công. |
| SSR | The Last Bad Decision | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 22% khi gần cạn HP. |
| SSR | Warden’s Bulwark | Phản đòn: khi bấm Phòng thủ và sống sót, phản 25% HP thực mất thành sát thương vật lý lên quái. |
| SSR | Eye of RNGesus | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Three Doors, Wrong Portal; không biết trước RNGesus. |
| SSR | Phoenix Blood | Nghỉ chân: hồi 3% Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng. |
| SSR | Riftbreaker | Gai: khi sống sót sau đòn quái, phản 12% HP thực mất thành sát thương vật lý lên quái. |
| SSR | Living Armor | Gai: khi sống sót sau đòn quái, phản 12% HP thực mất thành sát thương vật lý lên quái. |
| SSR | Mimic Crown | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Treasure Room, Blood Fountain; không biết trước RNGesus. |
| SSR | Endless Flask | Túi bình: tăng giới hạn của bạn thêm 2 bình máu; không tặng bình. |
| SSR | Chrono Shard | Trần né: tăng 5 điểm % giới hạn né đòn vật lý của bạn; không cộng EVA, không né phép. |
| SSR | Seraphic Aegis | Phản đòn: khi bấm Phòng thủ và sống sót, phản 25% HP thực mất thành sát thương vật lý lên quái. |
| SSR | Doomwhisper | Trần chí mạng: tăng 5 điểm % giới hạn CRIT của bạn; không cộng tỷ lệ CRIT hiện tại. |
| SSR | Worldroot Seed | Nghỉ chân: hồi 3% Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng. |
| SSR | Void Lens | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Mirror of Fate (đập gương), Wrong Portal; không biết trước RNGesus. |
| SSR | Angelic Engine | Hút MP: 18% cơ hội hồi 1 MP cho bạn khi Tấn công/Skill gây sát thương, tối đa 1 lần/lượt. |
| SSR | Predator’s Instinct | Né phản kích: né tự nhiên đòn vật lý có 25% cơ hội phản sát thương vật lý lên quái; không tính né/chặn từ Skill. |
| SSR | Deimoss Scar | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 22% khi gần cạn HP. |
| SSR | Golden Goblet | Thương lượng: giảm 8% giá xu tại Rift Merchant/Payout Item Shop; không giảm HP, kim cương hay cửa hàng ngoài run. |
| SSR | Astral Mail | Chống bẫy: giảm 15% HP mất do Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP hay nguyền. |
| SSR | Blood Moon Edge | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 22% khi gần cạn HP. |
| SSR | Oracle Mask | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Three Doors, Mirror of Fate (đập gương); không biết trước RNGesus. |
| SSR | Eternal Clover | May mắn sự kiện: tăng 4 điểm % tỷ lệ nhánh tốt ở Blood Fountain, Three Doors và Wrong Portal. |
| SSR | Titan Heart | Túi bình: tăng giới hạn của bạn thêm 2 bình máu; không tặng bình. |
| SSR | Sevenfold Sigil | Khởi động MP: 40% cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat. |
| UR | Glass Cannon | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 30% khi gần cạn HP. |
| UR | Schrödinger’s Armor | Phản đòn: khi bấm Phòng thủ và sống sót, phản 35% HP thực mất thành sát thương vật lý lên quái. |
| UR | Goblin’s Debt | Thương lượng: giảm 12% giá xu tại Rift Merchant/Payout Item Shop; không giảm HP, kim cương hay cửa hàng ngoài run. |
| UR | Crown of Ruin | May mắn sự kiện: tăng 6 điểm % tỷ lệ nhánh tốt ở Blood Fountain, Three Doors và Wrong Portal. |
| UR | Blood Pact | Cuồng chiến: sát thương Tấn công/Skill của bạn tăng theo HP đã mất, tối đa 30% khi gần cạn HP. |
| UR | Void Heart | Nghỉ chân: hồi 4% Max HP cho bạn khi qua tầng không có combat, tối đa một lần/tầng. |
| UR | Broken Hourglass | Né phản kích: né tự nhiên đòn vật lý có 35% cơ hội phản sát thương vật lý lên quái; không tính né/chặn từ Skill. |
| UR | Mimic’s Promise | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Treasure Room, Blood Fountain, Three Doors; không biết trước RNGesus. |
| UR | Berserker Chains | Gai: khi sống sót sau đòn quái, phản 18% HP thực mất thành sát thương vật lý lên quái. |
| UR | Hollow Crown | Hút MP: 25% cơ hội hồi 1 MP cho bạn khi Tấn công/Skill gây sát thương, tối đa 1 lần/lượt. |
| UR | Ashen Wings | Trần né: tăng 8 điểm % giới hạn né đòn vật lý của bạn; không cộng EVA, không né phép. |
| UR | Soul Leash | Khởi động MP: 50% cơ hội hồi 1 MP cho bạn một lần khi vào mỗi combat. |
| UR | Bleeding Star | Trần chí mạng: tăng 8 điểm % giới hạn CRIT của bạn; không cộng tỷ lệ CRIT hiện tại. |
| UR | Null Idol | Chống bẫy: giảm 20% HP mất do Fake Shrine/bẫy máu Wrong Portal; không giảm chi phí HP hay nguyền. |
| UR | Black Sun | Tiên tri: biết trước an toàn/nguy hiểm của 1 lựa chọn mỗi event thuộc Three Doors, Wrong Portal, Treasure Room, Blood Fountain, Mirror of Fate (đập gương); không biết trước RNGesus. |
| UR | Oathbreaker | Trần chí mạng: tăng 10 điểm % giới hạn CRIT của bạn; không cộng tỷ lệ CRIT hiện tại. |

## 15. Kiểm thử và cân bằng đã chốt

- Mốc kiểm thử của release gốc: toàn bộ `npm test` đã qua tại thời điểm phát hành 2.0.0.
- Rework item 06/10/2026: kiểm thử nguyền, nội tại, v2, loadout, hồi phục, payout, Paradox và Tower đã qua. Chuỗi `npm test` hiện vẫn dừng ở kiểm thử danh sách slash command cũ (`test-game-bot.js`), một lỗi đã tồn tại trước rework; không xem chuỗi test toàn repo là đã qua.
- Catalog validator hiện xác nhận 63 item: 10 R, 13 SR, 24 SSR, 16 UR và không trùng tác dụng R/SR; chỉ Goblin’s Debt trực tiếp giảm payout trong catalog mới.
- Bộ Sinh tồn v2 kiểm tra 12 nhóm abuse: stale click, checkpoint lặp, payout ảo, HP shop, kim cương thiếu/bấm lặp, Duelist, Severance, Soul Drain, Grave lease/cap và tương thích v1.
- Mốc mô phỏng 700 run trước thay đổi hồi Mana/Rift có 0 lần vượt tầng 999, cao nhất 969. Smoke test Mana mới gồm 210 run cũng có 0 lần vượt, cao nhất 934. Theo yêu cầu vận hành, chưa chạy lại mô phỏng dài sau rework stack Rift; các số trên là mốc lịch sử, không được xem là tỷ lệ chính thức của bản mới.

## 16. File nguồn tham chiếu

- `src/services/hardcoreService.js`: gameplay, combat, encounter và transaction.
- `src/services/hardcoreStats.js`: bốn thuộc tính và chỉ số dẫn xuất.
- `src/hardcore/item.js`: catalog 63 item và alias chuyển mã cũ.
- `src/services/hardcoreWorld.js`: khu vực, modifier và boss.
- `src/services/hardcoreView.js`: embed và component Discord.
- `src/services/hardcoreRepository.js`: session, record, Grave Echo/Nemesis.
- `scripts/test-hardcore-v2.js`: kiểm thử công thức và abuse.
- `scripts/simulate-hardcore.js`: mô phỏng cân bằng 999 tầng.

