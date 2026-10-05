# Release spec — Rift Paradox v2 và Tháp Định Mệnh tuần 1

Ngày phát hành dự kiến: **05/10/2026**\
Challenge tuần đầu: **`tower-2026-W41-v1`**\
Thời gian hoạt động: **00:00 thứ Hai 05/10/2026 – 00:00 thứ Hai 12/10/2026**, múi giờ `Asia/Bangkok`.

Tài liệu này là đặc tả triển khai. Các con số trong tài liệu là giá trị chính thức của bản tuần đầu, không phải ví dụ minh họa.

---

## 1. Phạm vi release

Release gồm hai phần độc lập:

1. Rework **Rift Paradox v2** cho Sinh tồn 999 tầng.
2. Thêm mode **Tháp Định Mệnh** gồm 15 tầng, chạy song song với Sinh tồn 999 tầng.

Sinh tồn 999 tầng giữ nguyên command, session, bảng xếp hạng và payout hiện có. Người chơi được phép giữ đồng thời một run 999 tầng và một run Tháp Định Mệnh vì hai mode dùng session riêng.

---

# PHẦN A — RIFT PARADOX V2

## 2. Mục tiêu rework

Paradox mới phải đáp ứng bốn yêu cầu:

- Người chơi đọc là hiểu chính xác lợi ích và tác hại.
- Lựa chọn làm thay đổi cách dùng Tấn công, Skill, Phòng thủ hoặc Bình máu.
- Hiệu ứng chỉ tồn tại trong năm tầng kế tiếp, không sửa vĩnh viễn chỉ số nhân vật.
- Restart bot và `/choi sinhton tieptuc` không đổi lựa chọn, thời hạn hoặc kết quả đã khóa.

Paradox v2 không trực tiếp thay đổi payout. Cơ chế `Máu là tiền` và `Ngược đời` cũ ngừng xuất hiện sau release này.

## 3. Thời điểm xuất hiện và vòng đời

Paradox xuất hiện sau khi người chơi hoàn tất checkpoint tại các mốc:

```text
25, 50, 75, 100, ... 975
```

Thứ tự xử lý tại mốc 25 tầng:

```text
Hoàn tất tầng 25
→ hồi đầy HP và nhận bình theo checkpoint
→ chọn +5 STR/DEX/VIT/ENE
→ mở Rift Paradox
→ chọn một trong hai luật
→ luật có hiệu lực từ tầng 26 đến hết tầng 30
```

Quy tắc thời hạn:

- `startFloor = milestone + 1`.
- `endFloor = milestone + 5`.
- Chỉ tăng tiến độ khi một tầng được hoàn tất.
- Mở bảng Trang bị, Chỉ số, Rift Modifier hoặc dùng `/choi sinhton tieptuc` không làm giảm thời hạn.
- Combat nhiều lượt vẫn chỉ tính là một tầng.
- Hiệu ứng được xóa sau khi hoàn tất `endFloor`.
- Run chết hoặc rút thưởng sẽ xóa session như bình thường.

## 4. Cách tạo lựa chọn

Khi encounter Paradox được tạo, bot chọn một trong bốn cặp dưới đây bằng RNG công bằng. Cặp đã chọn phải được lưu ngay trong state; mở lại panel không được roll lại.

| Cặp | Lựa chọn A | Lựa chọn B |
|---|---|---|
| 1 | Huyết Ước | Mana Vỡ Vụn |
| 2 | Giáp Nghịch Đảo | Ma Pháp Nghịch Đảo |
| 3 | Cơn Đói | Nợ Thời Gian |
| 4 | Gương Máu | Linh Hồn Bất Ổn |

Không ghép tùy ý giữa tám Paradox. Các cặp cố định giúp tránh trường hợp một lựa chọn vượt trội hoàn toàn lựa chọn còn lại.

## 5. Catalog Paradox

### 5.1. Huyết Ước — `blood_pact`

```text
Damage gây ra ×1,30.
Mỗi lần dùng Skill mất max(1, floor(Max HP × 5%)) HP.
```

- HP được trừ khi xác nhận Skill, trước phản công của quái.
- Chi phí HP không được giảm bởi DEF, RES hoặc Phòng thủ.
- Skill bị vô hiệu hóa nếu chi phí làm HP xuống dưới 1.
- Skill giết quái vẫn phải trả HP.
- Damage cộng thêm áp dụng cho cả skill vật lý và skill phép.

### 5.2. Mana Vỡ Vụn — `mana_fracture`

```text
Mana cost của Skill giảm từ 2 xuống 1.
Tấn công thường hồi 0 Mana.
Phòng thủ vẫn hồi 1 Mana.
```

- Mana cost tối thiểu là 0 nếu một hiệu ứng hợp lệ khác cho Skill miễn phí.
- Class Shrine của Sorceress vẫn có quyền đặt cost về 0.
- UI nút Tấn công phải ghi `+0 Mana` trong thời gian hiệu lực.

### 5.3. Giáp Nghịch Đảo — `inverted_armor`

```text
Sát thương vật lý cuối cùng nhận vào ×0,75.
RES hiệu dụng −20.
```

- Giảm vật lý được áp dụng sau công thức DEF và trước curse `damageTaken`.
- RES hiệu dụng vẫn bị clamp trong khoảng `−50..75`.
- Chỉ số RES gốc của nhân vật không bị sửa.

### 5.4. Ma Pháp Nghịch Đảo — `inverted_magic`

```text
RES hiệu dụng +20.
Sát thương vật lý cuối cùng nhận vào ×1,35.
```

- RES hiệu dụng vẫn cap 75.
- Phần tăng damage vật lý được áp dụng sau DEF.
- Phòng thủ vẫn nhân đôi DEF trước khi tính damage.

### 5.5. Cơn Đói — `hunger`

```text
Hạ quái hồi max(1, floor(Max HP × 12%)) HP.
Hiệu lực Bình máu ×0,50.
```

- Chỉ hồi khi combat kết thúc bằng việc quái chết.
- Không kích hoạt từ Shrine, event hoặc bỏ qua encounter.
- Hiệu lực bình sau cùng vẫn chịu cap chung `10%..75%`.

### 5.6. Nợ Thời Gian — `time_debt`

```text
Hai hành động tấn công đầu tiên trong mỗi combat gây damage ×1,25.
Sau hành động thứ ba của người chơi, quái phản công hai lần nếu còn sống.
```

- Tấn công thường và Skill đều tăng bộ đếm hành động.
- Phòng thủ và Bình máu cũng tăng bộ đếm nhưng không nhận bonus damage.
- Lần phản công thứ hai dùng loại damage được roll tiếp theo, không lặp bản sao của hit đầu.
- Nếu quái chết ở hành động thứ ba thì không có phản công.
- Mỗi combat reset bộ đếm về 0.

### 5.7. Gương Máu — `blood_mirror`

```text
Khi HP hiện tại ≤40% Max HP: damage gây ra ×1,40.
Không thể dùng Bình máu khi HP hiện tại >40% Max HP.
```

- Điều kiện được kiểm tra tại thời điểm bấm nút.
- Nếu HP bằng đúng 40%, bonus damage hoạt động và được phép dùng bình.
- Hồi máu vượt 40% sẽ khóa nút Bình ở lượt tiếp theo.

### 5.8. Linh Hồn Bất Ổn — `unstable_soul`

```text
25% Skill không tiêu Mana.
15% Skill tiêu thêm 1 Mana.
60% Skill dùng cost bình thường.
```

- Kết quả cost được roll và lưu trước khi render lượt; refresh không đổi kết quả.
- Thứ tự ưu tiên: `free → extra → normal`.
- Nếu cost đã khóa lớn hơn Mana hiện tại, nút Skill bị vô hiệu hóa.
- Damage không thay đổi.
- UI phải hiện chính xác cost đã khóa trên nút.

## 6. Công thức tích hợp combat

Thứ tự damage gây ra:

```text
base action damage
→ class skill multiplier
→ item/boss/elite modifier
→ Paradox damage multiplier
→ enemy Defense hoặc Resistance
→ enemy damage reduction
→ floor về số nguyên
```

Thứ tự damage nhận vào:

```text
raw enemy damage
→ player Defense hoặc Resistance
→ Paradox physical/magic modifier
→ curse damageTaken
→ trạng thái Phòng thủ
→ floor về số nguyên, tối thiểu 1
```

Paradox không được sửa trực tiếp `state.damageMin`, `state.damageMax`, `state.defense`, `state.resistance`, `state.maxHp` hoặc `state.payoutFactor`. Mọi thay đổi được tính từ `activeParadox` để khi hết hạn có thể gỡ sạch mà không phải hoàn lại chỉ số.

## 7. State đề xuất

```js
activeParadox: {
  version: 2,
  id: 'mana_fracture',
  pairId: 'resource',
  milestone: 25,
  startFloor: 26,
  endFloor: 30,
  combatActionCount: 0,
  lockedSkillCost: null
}
```

Encounter lúc lựa chọn:

```js
encounter: {
  type: 'paradox',
  version: 2,
  milestone: 25,
  pairId: 'resource',
  choices: ['blood_pact', 'mana_fracture']
}
```

## 8. UI Paradox

Embed lựa chọn:

```text
🌀 RIFT PARADOX — HIỆU LỰC 5 TẦNG

🩸 Huyết Ước
+30% damage.
Mỗi Skill mất 5% Max HP; không thể tự giết người chơi.

🔷 Mana Vỡ Vụn
Skill chỉ tốn 1 Mana.
Tấn công thường không hồi Mana.
```

Sau khi chọn, field tiến trình hiển thị:

```text
🌀 Mana Vỡ Vụn · còn 4 tầng
Skill 1 Mana · Tấn công +0 Mana
```

Nút phải phản ánh chi phí thật:

```text
Tấn công (+0 Mana)
Arcane Burst (-1 Mana)
Arcane Burst (-1 Mana, -5 HP)
```

## 9. Migration và chống abuse

- Paradox v1 đang hoạt động trong run cũ tiếp tục dùng logic cũ đến khi hết thời hạn.
- Chỉ encounter Paradox được tạo sau release mới dùng `version: 2`.
- Một milestone chỉ được claim một lần bằng `paradoxMilestonesClaimed`.
- Lựa chọn sử dụng `expectedTurn`; bấm hai lần trả `STALE_ACTION`.
- State phải được lưu trong cùng transaction với hành động.
- Cost HP/Mana và damage phải rollback nếu save hoặc settlement lỗi.
- `/choi sinhton tieptuc` chỉ relocate message, không tạo encounter mới.
- Cleanup năm tầng phải idempotent: gọi hai lần không hoàn chỉ số, không nhân đôi log.

---

# PHẦN B — THÁP ĐỊNH MỆNH

## 10. Định nghĩa mode

Tên hiển thị: **Tháp Định Mệnh**\
Command: **`/choi sinhton thap`**\
Command mở lại: dùng lại **`/choi sinhton thap`**; nếu còn session trong tuần, bot mở đúng session đó.\
Độ dài: **15 tầng**.\
Điều kiện hoàn thành: phải vượt đủ tầng 15.

Mode không dùng tiền cược và không tạo payout trong run. Lý do: lời giải cố định có thể được chia sẻ; cho phép cược sẽ biến lời giải công khai thành nguồn farm xu.

Phần thưởng tuần đầu, chỉ nhận một lần:

```text
500.000 xu
250 kim cương
```

Chơi lại sau khi đã hoàn thành vẫn được phép nhưng không nhận lại thưởng.

## 11. Chu kỳ challenge

- Challenge đổi lúc `00:00` thứ Hai theo `Asia/Bangkok`.
- Chu kỳ mặc định là một tuần.
- Season đặc biệt có thể kéo dài hai tuần bằng `endsAt`, không thay đổi thuật toán session.
- Session lưu nguyên `challengeId` và `contentVersion`.
- Challenge cũ có 24 giờ grace chỉ để xem lại kết quả; không thể nhận thưởng sau khi hết hạn.

Challenge tuần 1:

```text
challengeId: tower-2026-W41-v1
contentVersion: 1
startsAt: 2026-10-05T00:00:00+07:00
endsAt:   2026-10-12T00:00:00+07:00
```

## 12. Tính quyết định tuyệt đối

Trong một challenge, mọi người chơi nhận cùng:

- Class và thuộc tính.
- HP, Mana và số bình.
- Damage Tấn công và Skill.
- Quái, HP quái và damage phản công.
- Loại damage của từng hit.
- Event, lựa chọn và kết quả.
- Paradox.
- Thứ tự boss mechanic.

Mode tắt hoàn toàn:

- Miss và Evasion roll.
- Critical roll.
- Item drop ngẫu nhiên.
- Shrine ngẫu nhiên.
- Luck.
- RNGesus.
- Grave Echo.
- Treasure Goblin.
- Fair RNG counter của mode 999 tầng.

Mọi damage trong tài liệu là damage cuối cùng sau giảm trừ và luôn hiện trước khi người chơi chọn hành động.

## 13. Session và dữ liệu riêng

Để hai mode thật sự chạy song song, không dùng chung hàng trong `hardcore_sessions`.

### `hardcore_tower_sessions`

```text
id
guild_id
user_id
challenge_id
content_version
channel_id
message_id
state_json
created_at
updated_at
```

Unique key: `(guild_id, user_id, challenge_id)`.

### `hardcore_tower_results`

```text
guild_id
user_id
challenge_id
attempts
best_floor
completed_at
reward_claimed_at
solution_hash
updated_at
```

Unique key: `(guild_id, user_id, challenge_id)`.

Component ID dùng namespace riêng:

```text
hardcore-tower:<sessionId>:<turn>:<action>
```

State tối thiểu:

```js
{
  mode: 'tower15',
  challengeId: 'tower-2026-W41-v1',
  contentVersion: 1,
  floor: 1,
  step: 0,
  hp: 100,
  maxHp: 100,
  mana: 0,
  maxMana: 5,
  paradox: null,
  actionHistory: [],
  turn: 0,
  status: 'playing'
}
```

## 14. Character tuần 1

Class cố định: **Sorceress**\
Tên challenge: **Sổ Nợ Arcane**

| Chỉ số | Giá trị |
|---|---:|
| STR | 10 |
| DEX | 16 |
| VIT | 22 |
| ENE | 75 |
| HP | 100/100 |
| Mana | 0/5 |
| DEF | 6 |
| ACC | 79 |
| EVA | 8 |
| Crit | 5,6% nhưng bị tắt trong mode này |
| RES | 23% |
| Bình máu | 0 |

Challenge dùng damage override cố định, không dùng range từ mode 999:

```text
Tấn công thường: 12 damage vật lý, luôn trúng.
Arcane Burst: 30 damage phép, luôn trúng, cost 2 Mana.
Tấn công thường: hồi 3 Mana trước Paradox, cap 5.
Phòng thủ: hồi 1 Mana và dùng kết quả damage cố định của encounter.
```

Sau khi chọn `Mana Vỡ Vụn` ở tầng 10:

```text
Arcane Burst: 30 damage, cost 1 Mana.
Tấn công thường: 12 damage, hồi 0 Mana.
Phòng thủ: vẫn hồi 1 Mana.
```

## 15. Kịch bản chính thức tuần 1

### Tầng 1 — Rust Warden

```text
HP quái: 12
Luật: quái phải chết trong một hành động.
```

- Tấn công gây 12 và kết liễu; Mana `0→3`.
- Skill không dùng được vì thiếu Mana.
- Phòng thủ làm hết thời gian và thua.

Hành động đúng: **Tấn công**.\
State cuối: `HP 100 · Mana 3`.

### Tầng 2 — Spectral Seal

```text
HP quái: 30
Miễn nhiễm vật lý.
Phải hạ trong một hành động.
```

Hành động đúng: **Arcane Burst**.\
State cuối: `HP 100 · Mana 1`.

### Tầng 3 — Mirror Wisp

```text
HP quái: 12
Arcane Reflection: Skill không gây damage.
Phải hạ trong một hành động.
```

Hành động đúng: **Tấn công**.\
State cuối: `HP 100 · Mana 4`.

### Tầng 4 — Ethereal Knight

```text
HP quái: 30
Miễn nhiễm vật lý.
Phải hạ trong một hành động.
```

Hành động đúng: **Arcane Burst**.\
State cuối: `HP 100 · Mana 2`.

### Tầng 5 — Gatekeeper of Debt

```text
HP quái: 42
Pha 1: Barrier chỉ nhận damage phép.
Pha 2: còn 12 HP và chỉ nhận damage vật lý.
Sau Skill đầu tiên, người chơi nhận cố định 20 damage phép.
Barrier phải bị phá trong hành động đầu; Core phải bị hạ trong hành động kế tiếp.
```

Hành động đúng:

1. **Arcane Burst:** quái `42→12`, Mana `2→0`, người chơi `100→80 HP`.
2. **Tấn công:** quái `12→0`, Mana `0→3`.

State cuối: `HP 80 · Mana 3`.

### Tầng 6 — Healing Shrine

Hai lựa chọn:

- **Chạm Shrine:** hồi `80→100 HP`.
- **Bỏ qua:** giữ 80 HP; người chơi sẽ vào boss tầng 15 với 30 HP nhưng phải nhận tổng cộng 36 damage trước đòn kết liễu, nên đường này không thể hoàn thành.

Hành động đúng: **Chạm Shrine**.\
State cuối: `HP 100 · Mana 3`.

### Tầng 7 — Mana Husk

```text
HP quái: 12
Arcane Reflection.
Phải hạ trong một hành động.
```

Hành động đúng: **Tấn công**.\
State cuối: `HP 100 · Mana 5`.

### Tầng 8 — Arcane Husk

```text
HP quái: 30
Miễn nhiễm vật lý.
Phải hạ trong một hành động.
```

Hành động đúng: **Arcane Burst**.\
State cuối: `HP 100 · Mana 3`.

### Tầng 9 — Judgment Sentinel

```text
Pha 1: bất tử và chuẩn bị Judgment gây 120 damage.
Chỉ Phòng thủ mới giảm Judgment còn 15 damage.
Pha 2: Core có 30 HP, miễn nhiễm vật lý.
```

Hành động đúng:

1. **Phòng thủ:** Mana `3→4`, HP `100→85`.
2. **Arcane Burst:** Core `30→0`, Mana `4→2`.

State cuối: `HP 85 · Mana 2`.

### Tầng 10 — Paradox Gate

Hai lựa chọn được cố định cho tuần 1:

#### Huyết Ước

```text
Arcane Burst: 39 damage, cost 2 Mana và 5 HP.
```

#### Mana Vỡ Vụn

```text
Arcane Burst: 30 damage, cost 1 Mana.
Tấn công thường hồi 0 Mana.
```

Hành động đúng: **Mana Vỡ Vụn**.\
State cuối: `HP 85 · Mana 2`.

### Tầng 11 — Twin Sigil

```text
HP quái: 60
Miễn nhiễm vật lý.
Phải hạ trong đúng hai hành động; hết lượt hai sẽ phát nổ.
Sau hành động đầu, người chơi nhận 15 damage phép.
```

Với Mana Vỡ Vụn:

1. Skill: quái `60→30`, Mana `2→1`, HP `85→70`.
2. Skill: quái `30→0`, Mana `1→0`.

Huyết Ước thất bại vì sau Skill đầu còn 0 Mana và không có lượt để hồi đủ Mana.

State cuối: `HP 70 · Mana 0`.

### Tầng 12 — Silent Leech

```text
HP quái: 12
Khóa phép.
Phải hạ trong một hành động.
```

Hành động đúng: **Tấn công**. Do Mana Vỡ Vụn, Mana vẫn bằng 0.\
State cuối: `HP 70 · Mana 0`.

### Tầng 13 — Mana Well

Hai lựa chọn:

- **Hấp thụ Mana:** `Mana 0→4`.
- **Hồi máu:** `HP 70→100`, Mana giữ 0.

Tầng 14 yêu cầu hai Skill liên tiếp, vì vậy hồi máu tạo dead end ngay tầng sau.

Hành động đúng: **Hấp thụ Mana**.\
State cuối: `HP 70 · Mana 4`.

### Tầng 14 — Arcane Auditor

```text
HP quái: 60
Miễn nhiễm vật lý.
Phải hạ trong hai hành động.
Sau hành động đầu, người chơi nhận 20 damage phép.
```

Hành động đúng:

1. Skill: quái `60→30`, Mana `4→3`, HP `70→50`.
2. Skill: quái `30→0`, Mana `3→2`.

State cuối: `HP 50 · Mana 2`.

### Tầng 15 — The Fixed Point

```text
HP boss: 102
Không Miss, không Crit, không RNG.
```

Pha 1 — Mirror Ward:

- Chỉ Tấn công thường phá Ward và gây 12 damage.
- Ward phải bị phá ngay trong hành động đầu. Skill bị phản xạ; Phòng thủ hoặc bất kỳ hành động nào khác để Ward tồn tại tới cuối lượt đều làm run thất bại.
- Sau khi Ward vỡ, nhận 10 damage.

Pha 2 — Final Verdict:

- Chỉ Phòng thủ sống sót; mọi hành động khác nhận damage chí tử.
- Phòng thủ hồi 1 Mana và người chơi nhận 10 damage.

Pha 3 — Arcane Lock:

- Boss còn 90 HP.
- Chỉ Skill gây damage.
- Arcane Lock sụp sau đúng ba hành động; dùng Tấn công, Phòng thủ hoặc hành động khác trong pha này khiến boss không thể bị hạ trước khi toàn bộ tháp phát nổ.
- Sau Skill thứ nhất và thứ hai, người chơi nhận 8 damage.
- Skill thứ ba kết liễu boss và không có phản công.

Chuỗi đúng:

1. **Tấn công:** boss `102→90`, HP `50→40`, Mana giữ 2.
2. **Phòng thủ:** HP `40→30`, Mana `2→3`.
3. **Skill:** boss `90→60`, HP `30→22`, Mana `3→2`.
4. **Skill:** boss `60→30`, HP `22→14`, Mana `2→1`.
5. **Skill:** boss `30→0`, Mana `1→0`.

Kết quả chuẩn: `HP 14 · Mana 0 · hoàn thành 15/15`.

## 16. Lời giải chuẩn duy nhất

```text
1.  Attack
2.  Skill
3.  Attack
4.  Skill
5.  Skill → Attack
6.  Touch Shrine
7.  Attack
8.  Skill
9.  Defend → Skill
10. Mana Fracture
11. Skill → Skill
12. Attack
13. Absorb Mana
14. Skill → Skill
15. Attack → Defend → Skill → Skill → Skill
```

Chuỗi action chuẩn dùng cho solver:

```json
["attack","skill","attack","skill","skill","attack","touch","attack","skill","defend","skill","mana_fracture","skill","skill","attack","absorb_mana","skill","skill","attack","defend","skill","skill","skill"]
```

`solutionHash` phải được tính từ `challengeId + contentVersion + canonical action list`. Không lưu lời giải dạng plain text trong SQLite session.

## 17. Chứng minh tính duy nhất

Solver phải duyệt toàn bộ action hợp lệ ở từng state, không chỉ chạy chuỗi chuẩn. Challenge chỉ được bật khi đạt đủ:

```text
winningPaths.length === 1
winningPaths[0] === canonicalSolution
finalState.floor === 15
finalState.hp === 14
finalState.mana === 0
```

Các khóa tạo nên lời giải duy nhất:

- Tầng 1–4 và 7–8 có giới hạn một hành động cùng miễn nhiễm cụ thể.
- Tầng 5 khóa loại damage theo hai pha.
- Bỏ qua Shrine tầng 6 khiến tổng HP không đủ vượt boss.
- Tầng 9 bắt buộc Phòng thủ trước Judgment.
- Huyết Ước thiếu Mana tại tầng 11.
- Hồi HP ở tầng 13 khiến Mana bằng 0 và không thể vượt tầng 14.
- Boss tầng 15 khóa thứ tự `Attack → Defend → Skill ×3`.

## 18. UI Tháp Định Mệnh

Header:

```text
🗼 THÁP ĐỊNH MỆNH · TUẦN 41
Tầng 9/15 · Sorceress · Sổ Nợ Arcane
```

Combat:

```text
👹 Judgment Sentinel
Ý định: Judgment — 120 damage

❤️ 100/100 HP · 🔷 3/5 Mana
⚔️ Tấn công: 12 damage, +3 Mana
✨ Arcane Burst: 30 damage, -2 Mana
🛡️ Phòng thủ: nhận 15 damage, +1 Mana

Mọi con số đã bao gồm giảm trừ. Không Crit, không Miss.
```

Footer:

```text
Challenge tower-2026-W41-v1 · Lượt 10 · Phần thưởng tuần chưa nhận
```

Khi thất bại, bot phải nêu nguyên nhân trực tiếp nhưng không tiết lộ các bước tương lai:

```text
❌ Judgment xuyên qua bạn vì lượt này không dùng Phòng thủ.
Tầng cao nhất: 9/15 · Lần thử: 2
```

## 19. Reward và bảng xếp hạng

Reward được cấp trong cùng transaction với việc ghi kết quả hoàn thành:

```text
operationId = tower15:reward:<guildId>:<userId>:<challengeId>
```

Nếu `reward_claimed_at` đã có giá trị, replay chỉ ghi completion phụ và trả thưởng 0.

Bảng xếp hạng tuần sắp theo:

1. Đã hoàn thành trước chưa hoàn thành.
2. Ít lần thử hơn.
3. `completed_at` sớm hơn.
4. `user_id` để thứ tự ổn định.

Không xếp theo thời gian thao tác vì độ trễ Discord và mạng của người chơi khác nhau.

## 20. Kiểm thử bắt buộc trước release

### Paradox v2

- Cả tám Paradox hết hạn đúng sau năm tầng.
- Không hiệu ứng nào làm thay đổi vĩnh viễn stat gốc.
- Huyết Ước không thể tự trừ HP xuống 0.
- Mana Vỡ Vụn cập nhật đúng label và cost thật.
- Nợ Thời Gian chỉ đánh hai lần đúng lượt thứ ba.
- Linh Hồn Bất Ổn không reroll khi refresh/resume.
- Bấm lựa chọn hai lần bị stale action.
- Run v1 đang có Paradox cũ vẫn tiếp tục được.

### Tháp Định Mệnh

- Solver tìm đúng một winning path.
- Chuỗi chuẩn kết thúc với 14 HP và 0 Mana.
- Mỗi action sai được solver xác nhận không thể hoàn thành.
- Restart và resume giữ nguyên floor, step, HP, Mana và action history.
- Component cũ không thể thực hiện lại action.
- Hai click đồng thời chỉ có một click được commit.
- Reward chỉ cấp một lần dù retry, replay, reconnect hoặc timeout response.
- Challenge tuần mới không thay đổi session tuần cũ.
- Session tower không chặn hoặc ghi đè session 999 tầng.
- Không code path nào gọi RNG trong mode tower.
- Damage UI bằng đúng damage engine áp dụng.
- Mốc reset được kiểm tra bằng timezone `Asia/Bangkok`, không phụ thuộc timezone của máy chủ.

## 21. File dự kiến khi triển khai

```text
src/hardcore/towerChallenges.js
src/hardcore/tower/week-2026-W41.js
src/services/hardcoreParadoxService.js
src/services/hardcoreTowerEngine.js
src/services/hardcoreTowerRepository.js
src/services/hardcoreTowerService.js
src/services/hardcoreTowerView.js
src/commands/hardcore.js
src/componentRouter.js
src/db.js
scripts/test-hardcore-paradox-v2.js
scripts/test-hardcore-tower-week1.js
scripts/solve-hardcore-tower.js
```

Kịch bản challenge phải là dữ liệu khai báo; engine không chứa điều kiện riêng theo số tầng của tuần 1. Nhờ vậy các tuần sau chỉ cần thêm file challenge mới, chạy solver và đăng ký vào catalog.
