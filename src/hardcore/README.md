# Sinh tồn / Hardcore

Đọc file này trước để chọn đúng module; không cần nạp toàn bộ engine hoặc UI vào context.

## Điểm vào

- `command.js`: slash command, hồ sơ và tiếp tục run.
- `index.js` / `runtime/index.js`: API phiên chơi được router và các lệnh gọi.
- `engine/index.js`: API luật Sinh tồn V2.
- `ui/index.js`: API render Sinh tồn V2.
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
| Luật chơi / hồ sơ / bảng thành tích               | `ui/rules.js`, `ui/ratesPanel.js`, `ui/rulePages.js`, `ui/profile.js`                   |
| Emoji, định dạng chỉ số và trang bị               | `shared/icons.js`, `shared/ui.js`, `shared/equipment.js`                                |
| Lịch sử run, Echo và Nemesis                      | `storage/echoes.js`                                                                     |
| Run cũ và công thức/UI cũ                         | `legacy/`                                                                               |

## Chuỗi LR Chinh Phạt

- `events/covenant.js`: bốn mảnh, điều kiện portal, thử thách, nhận LR và thưởng xu theo quái hạ.
- `events/blessing.js`: hồi đầy HP/MP, giải nguyền UR và gỡ ấn Rift dùng chung với God; không đổi lịch sử God.
- `events/covenantReveal.js`: claim animation một lần trên encounter/turn đã lưu; `events/godReveal.js` điều phối cả hai animation.
- Mảnh và nội tại thuộc state JSON của run; thu mảnh không tiêu thụ RNG. Thử thách hoàn thành tầng trước khi ban phước, rồi tạm dừng trước milestone/tầng mới để giữ checkpoint/boss và nhận LR trước lần roll God tiếp theo.

## Cách nối module

`engine/index.js`, `ui/index.js`, `runtime/index.js` và các entry trong `legacy/` tạo một bộ dependencies duy nhất khi module được require lần đầu. `dependencies.js` chứa import, hằng số và trạng thái dùng chung; các file nghiệp vụ nhận đúng dependencies cần dùng.

Các hàm gọi chéo module được nối qua callback ở đầu file, tra cứu sau khi composition hoàn tất. Cách này giữ những chu trình nghiệp vụ như hoàn thành tầng → sinh encounter → combat → hoàn thành tầng, nhưng không tạo vòng require giữa các file nghiệp vụ. Transaction SQLite, RNG fairness, setup draft và queue vẫn dùng cùng một instance. Module factory chỉ phục vụ composition; consumer gọi API ở các file `index.js`.

Giữ public exports tương thích khi tách thêm module. Không tạo thêm bản sao trạng thái phiên hoặc queue trong shim. Thêm/chỉnh luật vào engine; mô tả vào UI tương ứng; ghi changelog và chạy các regression liên quan.

## Tower mode — ngoài phạm vi refactor

`tower/`, `towerChallenges.js` và `src/services/hardcoreTower*.js` là Tháp định mệnh độc lập, giữ nguyên. `towerMemories.js` là event của **Sinh tồn**, không phải engine Tower. Tower vẫn nhận cùng các helper icon/định dạng/Paradox qua đường dẫn tương thích cũ.

## Kiểm tra

- `npm run test:hardcore:conqueror`: mảnh, provenance Mirror Clone, portal, thử thách, hồi sinh, payout LR, save/rollback và animation một lần.
- `npm run test:hardcore:rates`: phân trang tỷ lệ/luật, giới hạn Discord, emoji và quyền chuyển trang.
- `npm run test:hardcore:modules`: thứ tự require, singleton, phiên/transaction/queue dùng chung giữa đường dẫn mới và cũ.
- `npm run test:hardcore:v2`, `npm run test:hardcore:god`, `npm run test:hardcore:latency`.
- Các suite payout, healing, passives, curses, loot, blood, memories, rngesus, tickets và paradox theo phần sửa.
- `npm run test:hardcore:tower`: kiểm tra phần dùng chung không ảnh hưởng Tower.
- `npm run test:changelog`.
