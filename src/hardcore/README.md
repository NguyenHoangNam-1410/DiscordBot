# Sinh tồn / Hardcore

Đọc file này trước để chọn đúng module; không cần nạp toàn bộ engine hoặc UI vào context.

## Điểm vào

- `command.js`: slash command, hồ sơ và tiếp tục run.
- `index.js` / `runtime/index.js`: API phiên chơi được router và các lệnh gọi.
- `engine/index.js`: API luật Sinh tồn V2/V3.
- `ui/index.js`: API render Sinh tồn V2/V3.
- `src/services/hardcore*.js` và `src/commands/hardcore.js` chỉ là đường dẫn tương thích. Sửa implementation trong thư mục này.

## Tìm theo công việc

| Công việc                                         | Module nên đọc                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Khởi tạo, khôi phục và xác thực phiên             | `runtime/start.js`, `runtime/state.js`, `storage/sessions.js`                           |
| Chọn class, cược, vé, loadout                     | `runtime/setup.js`, `runtime/setupFlow.js`, `inventory/service.js`, `inventory/view.js` |
| Nhận button, ACK, hàng đợi, kiểm tra chủ run      | `runtime/interactions.js`                                                               |
| Transaction hành động, chống click cũ             | `runtime/actions.js`                                                                    |
| Kết thúc, hoàn tiền, thưởng, timeout              | `runtime/settlement.js`, `runtime/records.js`                                           |
| Chuyển tầng, checkpoint, milestone                | `engine/progression.js`                                                                 |
| Sinh quái và event, giá dịch vụ                   | `engine/encounters.js`                                                                  |
| Menu lựa chọn, xử lý lựa chọn event               | `engine/choices.js`, `engine/eventActions.js`, `engine/actions.js`                      |
| Đánh, phản công, preview sát thương               | `engine/combat.js`, `engine/combatPassives.js`, `engine/combatPreview.js`               |
| Chỉ số class, giới hạn, scale thế giới            | `engine/stats.js`, `engine/world.js`, `shared/balance.js`                               |
| Payout, thưởng/phạt, ghi biến động xu             | `engine/payout.js`, `shared/rewards.js`                                                 |
| Nhận, giải nguyền, nghiền item, hồi máu           | `engine/equipment.js`, `engine/state.js`                                                |
| Rương và Shrine                                   | `engine/chests.js`, `engine/shrines.js`                                                 |
| RNGesus, God và animation                         | `events/rngesus.js`, `events/godRngesus.js`, `events/godReveal.js`                      |
| Paradox, Contract, Tower Remembers trong Sinh tồn | `events/paradox.js`, `engine/memories.js`, `towerMemories.js`                           |
| Catalog item / passive / curse / LR / drop        | `item.js`, `itemPassives.js`, `itemCurses.js`, `itemRelics.js`, `monsterLoot.js`        |
| Battle embed và button                            | `ui/battle.js`, `ui/buttons.js`, `runtime/render.js`                                    |
| Nội dung event, preview dịch vụ, log lượt         | `ui/events.js`, `ui/services.js`, `ui/encounters.js`, `ui/log.js`                       |
| Túi / Rift / chỉ số / Chi tiết                    | `ui/details.js`, `ui/items.js`, `ui/rift.js`, `ui/stats.js`                             |
| Danh mục nhân vật / tinh hồn / quyền S0             | `characters/catalog.json`, `characters/index.js`, `ui/characters.js`                   |
| Luật chơi / hồ sơ / bảng thành tích               | `ui/rules.js`, `ui/ratesPanel.js`, `ui/rulePages.js`, `ui/profile.js`                   |
| Emoji, định dạng chỉ số và trang bị               | `shared/icons.js`, `shared/ui.js`, `shared/equipment.js`                                |
| Lịch sử run, Echo và Nemesis                      | `storage/echoes.js`                                                                     |
| Run cũ và công thức/UI cũ                         | `legacy/`                                                                               |

## Boss roster trên V3

- `bosses/roster.js`: lịch mốc, phiên bản tương thích và phần thưởng theo tầng.
- `bosses/catalogV2.js`: 39 boss thường, Kabraxis/Deimoss cố định và ba cấu hình Depth cho từng boss.
- `bosses/balanceV2.js`: mục tiêu 3–5%/class và snapshot hệ số DMG Tấn công/Skill chỉ đối với boss của run mới. Không đổi chỉ số hoặc kỹ năng ở trận thường.
- `bosses/runtimeV2.js`: state JSON, khóa pattern khi vào trận, subtarget HP, giới hạn hồi và validation khi resume.
- `bosses/decisionsV2.js`: Selector miễn lượt / boss action tốn lượt, chi phí và điều kiện disable.
- `bosses/mechanicsV2.js`: sát thương, phản công, cửa sổ yếu, các phase và hậu quả cuối lượt.
- `bosses/displayV2.js`: cảnh báo, manh mối công khai và Chi tiết; render không gọi RNG.
- `bosses/mechanics.js`, `bosses/display.js`: chọn implementation theo phiên bản đã lưu. `bosses/legacyMechanics.js` giữ nguyên cơ chế roster 1 cho run đang tồn tại.

Roster 2 **mặc định cho run V3 mới** sau kiểm chứng mục tiêu 3–5%/class. Run đã lưu hoặc thiếu trường roster giữ roster 1 khi resume. Đặt `HARDCORE_BOSS_ROSTER_VERSION=1` trước khi tạo run để dùng roster cũ; `=2` để chọn roster mới rõ ràng. Thay biến môi trường không đổi run đang tồn tại.

`scripts/hardcore-boss-policy-v2.js` dùng manh mối công khai để chạy mô phỏng. Ma trận boss dùng fixture tổng hợp, không phải tỷ lệ thắng 999 tầng; xem cả báo cáo end-to-end tại `docs/releases/hardcore-3-boss-roster-v2.md`.

## Chuỗi LR Chinh Phạt

- `events/covenant.js`: bốn mảnh, điều kiện portal, thử thách, nhận LR và thưởng xu theo quái hạ.
- `events/blessing.js`: hồi đầy HP/MP, giải nguyền UR và gỡ ấn Rift dùng chung với God; không đổi lịch sử God.
- `events/covenantReveal.js`: claim animation một lần trên encounter/turn đã lưu; `events/godReveal.js` điều phối cả hai animation.
- Mảnh và nội tại thuộc state JSON của run; thu mảnh không tiêu thụ RNG. Thử thách hoàn thành tầng trước khi ban phước, rồi tạm dừng trước milestone/tầng mới để giữ checkpoint/boss và nhận LR trước lần roll God tiếp theo.

## Icon Sinh tồn

- `shared/icons.js` ánh xạ tên quái/boss, ID di vật LR, nội tại, mảnh Chinh Phạt và ấn Prophecy sang tên application emoji. Tra emoji lúc render, sau khi registry được tải; thiếu emoji dùng biểu tượng dự phòng.
- Upload PNG bằng đúng tên file, không đổi hoa/thường: `monster_*`, `relic_*`, `passive_*`, `fragment_*`, `event_*`, `seal_*`, `tower_remember_grudge`. Khởi động lại bot để tải registry mới. Quái cùng loài ở rank khác nhau dùng cùng icon; boss có ID được ánh xạ rõ ràng, không suy ra tên emoji từ tên người chơi/Echo.
- Ảnh và gói upload chỉ lưu trong `output/survival-ui-icons/` đã được Git bỏ qua. Server chỉ cần mapping tên emoji, không cần file ảnh. Icon dự phòng cho Veil of the Absolute không kích hoạt di vật đang chờ triển khai.

## Cách nối module

`engine/index.js`, `ui/index.js`, `runtime/index.js` và các entry trong `legacy/` tạo một bộ dependencies duy nhất khi module được require lần đầu. `dependencies.js` chứa import, hằng số và trạng thái dùng chung; các file nghiệp vụ nhận đúng dependencies cần dùng.

Các hàm gọi chéo module được nối qua callback ở đầu file, tra cứu sau khi composition hoàn tất. Cách này giữ những chu trình nghiệp vụ như hoàn thành tầng → sinh encounter → combat → hoàn thành tầng, nhưng không tạo vòng require giữa các file nghiệp vụ. Transaction SQLite, RNG fairness, setup draft và queue vẫn dùng cùng một instance. Module factory chỉ phục vụ composition; consumer gọi API ở các file `index.js`.

Giữ public exports tương thích khi tách thêm module. Không tạo thêm bản sao trạng thái phiên hoặc queue trong shim. Thêm/chỉnh luật vào engine; mô tả vào UI tương ứng; ghi changelog và chạy các regression liên quan.

## Tower mode — ngoài phạm vi refactor

`tower/`, `towerChallenges.js` và `src/services/hardcoreTower*.js` là Tháp định mệnh độc lập, giữ nguyên. `towerMemories.js` là event của **Sinh tồn**, không phải engine Tower. Tower vẫn nhận cùng các helper icon/định dạng/Paradox qua đường dẫn tương thích cũ.

## Kiểm tra

- `npm run test:hardcore:bosses:v2`: 39 boss, fixed boss, 10.000 lịch, render/resume, giới hạn Discord, lựa chọn/transaction cũ và phase/reward.
- `npm run simulate:hardcore:bosses:v2 -- 10`: ma trận 7 class × 4 build × 39 boss × 6 mốc tầng × 10 lần thử.
- `HARDCORE_SIM_BOSS_ROSTER=current` hoặc `fixed` với `scripts/simulate-hardcore.js 100 999 40000 all`: so sánh roster 2/1 trên V3. Đặt `HARDCORE_SIM_BACKEND=memory`, `HARDCORE_SIM_ISOLATED=1` và `HARDCORE_SIM_OUTPUT` để tách dữ liệu mô phỏng.

- `npm run test:hardcore:conqueror`: mảnh, provenance Mirror Clone, portal, thử thách, hồi sinh, payout LR, save/rollback và animation một lần.
- `npm run test:hardcore:rates`: phân trang tỷ lệ/luật, giới hạn Discord, emoji và quyền chuyển trang.
- `npm run test:hardcore:modules`: thứ tự require, singleton, phiên/transaction/queue dùng chung giữa đường dẫn mới và cũ.
- `npm run test:hardcore:v2`, `npm run test:hardcore:god`, `npm run test:hardcore:latency`.
- Các suite payout, healing, passives, curses, loot, blood, memories, rngesus, tickets và paradox theo phần sửa.
- `npm run test:hardcore:tower`: kiểm tra phần dùng chung không ảnh hưởng Tower.
- `npm run test:changelog`.
