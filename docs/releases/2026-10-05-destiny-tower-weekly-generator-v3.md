# Tháp Định Mệnh v3 — Weekly Generated Chain

Ngày đặc tả: **05/10/2026**
Mode: **15 tầng, một chuỗi xuyên suốt, sai một bước chơi lại từ đầu**
Chu kỳ: **mỗi thứ Hai**, timezone `Asia/Bangkok`
Độ dài mục tiêu: **72–90 bước/challenge**

Đây là đặc tả chính thức thay thế kịch bản 42 bước viết tay. Generator tự chọn nội dung, tự tạo lời giải, tự kiểm tra tính duy nhất và chỉ publish challenge hợp lệ.

---

## 1. Quy tắc release mới

- Mỗi tuần dùng một class khác tuần trước.
- Không class nào lặp lại trước khi cả bảy class đã xuất hiện.
- Mỗi challenge vẫn có đúng 15 tầng.
- Tổng số hành động được sinh trong khoảng 72–90.
- Tuần đầu dùng đúng 81 hành động.
- Toàn bộ 15 tầng dùng chung một `routeStep` liên tục.
- Sai một action ở bất kỳ bước nào làm attempt thất bại ngay.
- Attempt mới luôn bắt đầu từ tầng 1.
- HP, Mana, hiệu ứng và lựa chọn event được mang xuyên tầng.
- Challenge không dùng RNG trong lúc chơi. Mọi nội dung đã được materialize trước khi tuần bắt đầu.
- Generator phải chứng minh có đúng một winning path trước khi challenge được publish.

## 2. Vòng xoay bảy class

Vòng đầu bắt đầu từ ISO week 41 năm 2026:

| ISO week | Thời gian | Class | Hướng puzzle chính |
|---|---|---|---|
| 2026-W41 | 05/10–12/10 | Sorceress | Mana, spell order, Arcane Reflection |
| 2026-W42 | 12/10–19/10 | Druid | Heal timing, HP threshold, regeneration |
| 2026-W43 | 19/10–26/10 | Necromancer | Ward timing, block charge, spell control |
| 2026-W44 | 26/10–02/11 | Paladin | Defend chain, physical/magic intent |
| 2026-W45 | 02/11–09/11 | Amazon | Barrage hit order, multi-target shields |
| 2026-W46 | 09/11–16/11 | Barbarian | Physical damage, low Mana, rage threshold |
| 2026-W47 | 16/11–23/11 | Assassin | Dodge timing, counterattack, fragile HP |

Tuần 48 quay lại Sorceress nhưng dùng seed và kịch bản khác hoàn toàn.

Không dùng trực tiếp `isoWeek % 7` vì thêm season đặc biệt có thể làm lệch vòng. Database lưu `rotation_index`; sau khi publish thành công mới tăng index.

```js
const CLASS_ROTATION = [
  'sorceress',
  'druid',
  'necromancer',
  'paladin',
  'amazon',
  'barbarian',
  'assassin',
];
```

## 3. Class profile riêng biệt

Generator không được chỉ đổi tên class trên cùng một puzzle. Mỗi class có action economy và template riêng.

### Sorceress

- Max Mana cao.
- Skill luôn trúng và gây damage phép cố định.
- Puzzle yêu cầu xen kẽ Attack/Defend để chuẩn bị Mana.
- Arcane Reflection có thể khóa Skill tại một số bước.

### Druid

- Skill vừa gây damage vừa hồi HP.
- Một số cửa chỉ mở khi HP nằm trong khoảng cụ thể.
- Hồi quá nhiều hoặc quá ít đều có thể làm gãy chuỗi.

### Necromancer

- Skill cấp Ward chặn đúng một phản công.
- Generator đặt các đòn chí tử buộc giữ Ward cho đúng bước.
- Dùng Ward sớm tạo dead end và được xem là action sai.

### Paladin

- Phòng thủ mạnh và là nguồn Mana chính.
- Chuỗi xen kẽ damage vật lý/phép.
- Người chơi phải chọn đúng thời điểm dùng Divine Shield.

### Amazon

- Barrage gồm nhiều hit cố định.
- Shield của quái có số charge xác định.
- Skill dùng sai pha có thể lãng phí hit và làm gãy chain.

### Barbarian

- Max Mana thấp.
- Attack vật lý mạnh; Skill dùng cho đúng armor breakpoint.
- Một số bước yêu cầu giữ HP thấp để kích hoạt rage nhưng không được chết.

### Assassin

- Shadow Step né phản công ở đúng lượt.
- HP thấp và không đủ chịu một lần dodge sai.
- Counterattack và Evasion không roll; kết quả được cố định trong challenge.

## 4. Challenge ID và seed

```text
challengeId = tower:<ISO year>:W<ISO week>:<class>:g<generatorVersion>
```

Tuần đầu:

```text
tower:2026:W41:sorceress:g3
```

Production seed:

```text
seed = HMAC_SHA256(
  TOWER_GENERATOR_SECRET,
  challengeId + ':' + contentVersion
)
```

Không dùng `Math.random()`, thời gian hiện tại hoặc process ID. Cùng challenge ID, generator version và secret phải tạo cùng một challenge.

Trước khi tuần bắt đầu, bot công khai:

```text
seedCommitment = SHA256(seed)
```

Sau khi challenge kết thúc, có thể công khai seed để admin xác minh bot không đổi lời giải giữa tuần. Seed thật không được gửi trong embed khi challenge còn hoạt động.

## 5. Materialize thay vì sinh lại mỗi lượt

Generator chỉ chạy một lần cho challenge. Kết quả được lưu thành snapshot bất biến:

```js
{
  challengeId,
  generatorVersion: 3,
  contentVersion: 1,
  classKey,
  seedCommitment,
  floors,
  transitions,
  initialState,
  finalState,
  stepCount,
  solutionHash,
  difficultyScore,
  startsAt,
  endsAt
}
```

Mọi attempt trong tuần đọc cùng snapshot. Restart, deploy hoặc `/choi sinhton thap` không chạy generator lại.

Nếu code generator được cập nhật giữa tuần, challenge đang active vẫn dùng snapshot cũ. Generator version mới chỉ có hiệu lực từ challenge kế tiếp.

## 6. Database challenge

### `hardcore_tower_challenges`

```text
challenge_id TEXT PRIMARY KEY
iso_year INTEGER NOT NULL
iso_week INTEGER NOT NULL
rotation_index INTEGER NOT NULL
class_key TEXT NOT NULL
generator_version INTEGER NOT NULL
content_version INTEGER NOT NULL
seed_commitment TEXT NOT NULL
payload_json TEXT NOT NULL
step_count INTEGER NOT NULL
solution_hash TEXT NOT NULL
difficulty_score INTEGER NOT NULL
status TEXT NOT NULL
starts_at INTEGER NOT NULL
ends_at INTEGER NOT NULL
generated_at INTEGER NOT NULL
published_at INTEGER
```

`status` chỉ nhận:

```text
draft → validated → published → archived
```

Runtime chỉ cho phép tạo attempt từ challenge `published`.

## 7. Kiến trúc generator

Generator hoạt động theo bảy giai đoạn.

### Giai đoạn 1 — Chọn class

Đọc `rotation_index`, lấy class tiếp theo trong `CLASS_ROTATION`. Nếu tuần trước là Sorceress thì tuần này không được Sorceress dù generator retry seed.

### Giai đoạn 2 — Tạo build cố định

Class profile tạo:

- HP và Max Mana.
- Damage Attack/Skill.
- Mana gain/cost.
- Class mechanic.
- Giới hạn HP/Mana mong muốn ở boss.

Build được khóa trong payload; không đọc item hoặc stat từ mode 999.

### Giai đoạn 3 — Chọn độ dài từng tầng

Mỗi tầng có số action trong khoảng:

```text
Tầng 1–3:  4–5 action
Tầng 4–6:  4–6 action
Tầng 7–10: 5–6 action
Tầng 11–13: 6–7 action
Tầng 14:   7–8 action
Tầng 15:   8–10 action
```

Tổng phải nằm trong `72..90`.

Nếu tổng nằm ngoài khoảng, generator bỏ candidate và thử `candidateNonce + 1`.

### Giai đoạn 4 — Sinh lời giải ngược từ boss

Không tạo quái trước rồi đoán lời giải. Generator xây state cuối mong muốn và đi ngược về tầng 1:

```text
Boss solution
→ tài nguyên tối thiểu trước boss
→ floor 14 cung cấp state đó
→ ...
→ initial state
```

Mỗi transition khai báo:

```js
{
  expectedAction: 'skill',
  hpDelta: -8,
  manaDelta: -1,
  enemyHpDelta: -30,
  requiredFlags: ['mana_fracture'],
  grantsFlags: [],
  clueTemplate: 'arcane_core',
  failureReason: 'Arcane Core chỉ nhận damage phép.'
}
```

Reverse construction bảo đảm chuỗi có đủ tài nguyên trước khi solver kiểm tra.

### Giai đoạn 5 — Sinh encounter và clue

Từ chuỗi action đã tạo, generator chọn template phù hợp:

- `attack` → cracked armor, physical seal, exposed core.
- `skill` → spectral body, arcane core, physical immunity.
- `defend` → execution mark, lethal telegraph, reflected strike.
- event choice → mana/HP fork, Paradox pair, mirror order.

Không được lặp cùng một clue template quá hai lần liên tiếp hoặc quá sáu lần trong một challenge.

### Giai đoạn 6 — Solver và difficulty audit

Solver dùng state graph, không brute-force `3^90` một cách ngây thơ. State được memoize theo:

```text
floor | floorStep | routeStep | hp | mana | flags | classCharges
```

Candidate chỉ hợp lệ nếu:

```text
winningPaths === 1
canonicalLength === stepCount
wrongBranchesRecoverable === 0
minimumHp >= 1
finalHpRatio <= 25%
resourceWasteWindows >= 4
memoryChecks >= 2
eventChoices >= 4
```

### Giai đoạn 7 — Publish nguyên tử

Chỉ sau khi toàn bộ validation thành công:

1. Insert payload với status `validated`.
2. Ghi `solutionHash` và difficulty report.
3. Transaction đổi status thành `published`.
4. Tăng `rotation_index`.

Nếu thất bại, tăng `candidateNonce` và sinh candidate khác. Tối đa 100 candidate.

Nếu cả 100 candidate đều lỗi:

- Không publish challenge hỏng.
- Giữ challenge tuần trước ở trạng thái xem lại.
- Gửi log cảnh báo admin.
- Không tự động dùng challenge chưa được solver xác nhận.

## 8. Sinh lời giải tự động

Production code không chứa mảng canonical viết tay. Generator trả:

```js
{
  payload,
  canonicalSolution,
  audit
}
```

Sau validation:

```text
solutionHash = SHA256(
  challengeId | generatorVersion | canonicalSolution.join(',')
)
```

`canonicalSolution` chỉ dùng trong generator audit và test. Runtime xử lý transition theo `routeStep`; không gửi action đúng cho Discord client.

Admin debug có thể export lời giải sau khi challenge kết thúc. Trong tuần chỉ hiển thị hash.

## 9. Perfect Chain runtime

Mỗi interaction thực hiện tuần tự:

```text
1. Kiểm tra session, user, challengeId, turn và routeStep.
2. Đọc transition hiện tại từ snapshot.
3. So sánh action của người chơi với expectedAction.
4. Nếu sai: kết thúc attempt và tăng attempts.
5. Nếu đúng: áp dụng HP/Mana/flag delta.
6. Tăng routeStep và turn.
7. Chuyển tầng nếu floorStep đã hoàn tất.
8. Lưu state trong transaction.
9. Render UI từ state đã commit.
```

Sai action không trừ xu và không ảnh hưởng run 999 tầng. Người chơi phải bấm **Chơi lại từ tầng 1** để tạo attempt mới.

## 10. Độ khó và chống puzzle quá dễ

Một challenge bị reject nếu chỉ gồm các clue trực tiếp Attack/Skill/Defend.

Tỷ lệ mục tiêu:

| Loại bước | Tỷ lệ |
|---|---:|
| Clue trực tiếp | tối đa 40% |
| Quản lý HP/Mana | tối thiểu 20% |
| Delayed consequence | tối thiểu 15% |
| Memory/echo | tối thiểu 10% |
| Paradox/class mechanic | tối thiểu 15% |

Yêu cầu thêm:

- Ít nhất hai đoạn yêu cầu nhớ chuỗi từ tầng trước.
- Ít nhất một event ở đầu run ảnh hưởng tầng 12 trở đi.
- Ít nhất bốn lần người chơi phải giữ tài nguyên thay vì dùng ngay.
- Boss phải dùng tối thiểu ba loại action.
- Không có chuỗi một action giống nhau dài hơn ba bước.
- Không có floor chỉ gồm một action.
- Bốn tầng cuối có tổng cộng ít nhất 27 bước.

## 11. Tuần đầu — generator fixture

```text
challengeId: tower:2026:W41:sorceress:g3
class: sorceress
generatorVersion: 3
contentVersion: 1
targetSteps: 81
floors: 15
wrongActionPolicy: immediate_reset
```

Phân bổ số bước:

| Tầng | Số bước | Loại chính |
|---:|---:|---|
| 1 | 4 | Học ba luật và một bước giả |
| 2 | 4 | Mana order |
| 3 | 5 | Physical/Arcane alternation |
| 4 | 5 | Event HP fork |
| 5 | 4 | Paradox choice và kiểm tra tức thì |
| 6 | 5 | Mana Fracture chain |
| 7 | 5 | Double Verdict |
| 8 | 5 | Mana event và combat nối tiếp |
| 9 | 6 | Delayed reflection |
| 10 | 5 | Purification fork |
| 11 | 6 | Debt Collector |
| 12 | 6 | Reverse memory tầng 1 |
| 13 | 6 | Class seal và resource lock |
| 14 | 7 | Final Auditor |
| 15 | 8 | The Unbroken Point |
| **Tổng** | **81** | — |

Generator tuần đầu bắt buộc tạo:

- Một Mana Paradox trước hoặc tại tầng 5.
- Một memory echo sử dụng dữ liệu tầng 1 tại tầng 12.
- Một lựa chọn HP/Mana sai có vẻ hấp dẫn nhưng bị solver đánh dấu dead route.
- Boss tám bước dùng Attack, Defend và Skill.
- State cuối còn từ 1–25% Max HP và không quá 40% Max Mana.

Lời giải cụ thể không được viết tay trong file fixture. Build test dùng seed cố định để snapshot các thuộc tính sau:

```text
stepCount = 81
winningPaths = 1
wrongBranchesRecoverable = 0
class = sorceress
floorCount = 15
finalHpRatio ∈ (0, 0.25]
finalManaRatio ∈ [0, 0.40]
```

## 12. Các tuần sau

File tuần không chứa encounter thủ công. Catalog chỉ cần class profile và generator version:

```js
registerWeeklyTower({
  isoYear: 2026,
  isoWeek: 42,
  classKey: nextClassFromRotation(),
  generatorVersion: 3,
  minSteps: 72,
  maxSteps: 90,
});
```

Generator chủ động tạo:

- Số bước từng tầng.
- Sequence action.
- Event placement.
- Paradox pair.
- HP/Mana curve.
- Quái và clue.
- Boss phases.
- Canonical solution.
- Difficulty report.

Admin chỉ cần publish hoặc reject candidate; không phải viết lời giải.

## 13. UI tuần

Màn hình đầu:

```text
🗼 THÁP ĐỊNH MỆNH · TUẦN 41
Sorceress · 15 tầng · 81 bước

🔗 Perfect Chain
Sai một hành động sẽ phải chơi lại từ tầng 1.

🌱 Seed commitment: 8f3a…91c2
🏆 Thưởng lần đầu: 500.000 xu + 250 kim cương
```

Trong run:

```text
Tầng 12/15 · Bước 61/81
Chain chính xác: 60 hành động liên tiếp
HP 34/120 · Mana 2/5

Tín hiệu: Gương hồi âm yêu cầu đảo ngược nhịp đã ghi ở tầng 1.
```

Không hiển thị phần trăm đoán đúng, action chuẩn hoặc seed thật.

## 14. Test và abuse audit

### Generator

- Cùng seed và version tạo byte-identical payload.
- Class không lặp trong chu kỳ bảy challenge.
- Step count luôn trong `72..90`.
- Week 1 luôn có đúng 81 bước.
- Tất cả 15 floor đều có ít nhất bốn bước.
- Bốn floor cuối có ít nhất 27 bước.
- Solver trả đúng một winning path.
- Mọi wrong branch thất bại ngay và không recover được.
- Không challenge nào được publish khi solver timeout hoặc throw lỗi.

### Runtime

- Resume không chạy generator lại.
- Hai người trong cùng tuần nhận cùng challenge snapshot.
- Click trùng không tăng routeStep hai lần.
- Nút cũ không làm gãy chain hiện tại.
- Giả action trong custom ID bị từ chối.
- Wrong action tăng attempts đúng một lần.
- Retry reset toàn bộ HP/Mana/flag và routeStep.
- Reward chỉ cấp một lần/challenge/user.
- Mode tower và mode 999 có thể cùng tồn tại.

### Rollover

- Reset đúng 00:00 thứ Hai `Asia/Bangkok`.
- Session challenge cũ không bị gắn sang challenge mới.
- Rotation index chỉ tăng sau publish thành công.
- Generator failure không bỏ qua class kế tiếp.
- Thay đổi system timezone không đổi week key.

## 15. File triển khai

```text
src/hardcore/tower/classProfiles.js
src/hardcore/tower/generator.js
src/hardcore/tower/templates.js
src/hardcore/tower/solver.js
src/hardcore/tower/challengeCatalog.js
src/services/hardcoreTowerRepository.js
src/services/hardcoreTowerService.js
src/services/hardcoreTowerView.js
scripts/generate-hardcore-tower.js
scripts/solve-hardcore-tower.js
scripts/test-hardcore-tower-generator.js
scripts/test-hardcore-tower-runtime.js
```

`npm test` phải chạy cả generator determinism, solver uniqueness, class rotation và runtime abuse tests. Một challenge chưa có audit hợp lệ tuyệt đối không được chuyển sang `published`.

## 16. Triển khai trong bot

- Thêm biến env **TOWER_GENERATOR_SECRET** là một chuỗi bí mật ngẫu nhiên mạnh, giữ ổn định qua restart/deploy. Không dùng Discord token làm secret. Generator không publish nếu biến này chưa được đặt.
- Migration 39 lưu snapshot/audit, vòng xoay class và lỗi sinh challenge. Snapshot đã publish không thể sửa/xóa; đổi generator giữa tuần không đổi snapshot đang dùng.
- Sau khi bot ready, maintenance tự materialize tuần hiện tại và tuần kế; tuần mới mở chính xác theo timestamp 00:00 thứ Hai UTC+7. Seed commitment của tuần kế hiển thị công khai trên bảng tuần hiện tại.
- Thiếu secret hoặc sinh không thành công: ghi log admin, nghỉ 5 phút trước khi thử lại; giữ kết quả tuần trước để xem. Không mở challenge chưa kiểm chứng, không bỏ qua class kế tiếp.
- Runtime chỉ đọc transition/snapshot trong database. Resume không sinh lại tuần đã materialize.
- Bộ đếm attempts ghi nhận mỗi lần thất bại/hoàn thành một lần; retry mở attempt mới và đưa toàn bộ HP/MP/flag/Ward/routeStep về trạng thái ban đầu. UI tính thêm attempt đang chơi.
- Thưởng vẫn theo nền kinh tế từng server: 500.000 xu + 250 kim cương một lần/người/challenge/server. Claim tuần 41 v1 được mang sang g3 để nâng cấp giữa tuần không cấp thưởng tuần lần hai. Session v1 giữ nguyên để xem, không chuyển sang v3.
- Phản công được materialize trong từng bước và áp dụng trước khi qua tầng, kể cả bước hạ quái. Các cơ chế chặn/giảm đòn và hồi HP được audit riêng theo class.
- Payload không chứa mảng canonical viết tay; expectedAction chỉ nằm trong snapshot phía bot. Discord nhận tín hiệu, hành động khả dụng và hash, không nhận seed thật hoặc canonical solution.

Lệnh quản trị (chạy trên server cùng database/env):

- npm run generate:hardcore:tower -- --week 2026-W41: preview đã kiểm chứng; chỉ xuất metadata/hash, không publish. Bỏ preview tương đương reject, không đổi rotation.
- npm run generate:hardcore:tower -- --week 2026-W41 --publish: publish tuần kế tiếp theo thứ tự; tuần đã publish được đọc lại, không sinh lại. Không thể nhảy qua tuần bị lỗi.
- npm run solve:hardcore:tower -- tower:2026:W41:sorceress:g3: audit snapshot và xuất hash, không xuất lời giải.
- Sau khi hết tuần, thêm --solution để xuất lời giải, hoặc --reveal-seed để công khai seed cho việc xác minh. Nếu secret đã đổi và commitment không khớp, lệnh từ chối reveal.

Kiểm thử: npm run test:hardcore:tower chạy fixture lịch sử, generator và runtime. Hai bộ test mới cũng được nối vào npm test. Test dùng SQLite trong RAM, không tạo asset hoặc thay đổi database production.
