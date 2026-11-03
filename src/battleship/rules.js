"use strict";
const { timeMinutes } = require("../webGames/clock");
const PRESETS = Object.freeze({
  small: Object.freeze({ label: "Nhỏ", size: 8, count: 5, maxLength: 4 }),
  medium: Object.freeze({ label: "Vừa", size: 10, count: 7, maxLength: 5 }),
  large: Object.freeze({ label: "Lớn", size: 12, count: 10, maxLength: 5 }),
});
function normalizeRules(input = {}) {
  const mode = input.mode ?? "medium";
  if (!Object.hasOwn(PRESETS, mode))
    throw Object.assign(new Error("Chỉ chọn kích thước Nhỏ, Vừa hoặc Lớn."), {
      code: "INVALID_RULES",
    });
  return Object.freeze({ mode, timeMinutes: timeMinutes(input.timeMinutes) });
}
function rulesText(input) {
  const rules = normalizeRules(input),
    preset = PRESETS[rules.mode];
  return `${preset.label} · ${preset.size}×${preset.size} · ${preset.count} thuyền/người, dài 2–${preset.maxLength} ô · Chuẩn bị ${preset.count * 20}s · ${rules.timeMinutes} phút/người`;
}
const RULES_TEXT =
  "Battleship: /battleship choi kichthuoc:Nho|Vua|Lon mở phòng. Nhỏ: 8×8, 5 thuyền dài 2–4; Vừa: 10×10, 7 thuyền dài 2–5; Lớn: 12×12, 10 thuyền dài 2–5. Mỗi độ dài có ít nhất 1 thuyền; hai bên có cùng danh sách độ dài. Kéo thả hoặc chạm chọn thuyền rồi chạm ô để đặt; R/chuột phải khi kéo hoặc nút Xoay để xoay mũi trái/trên/phải/dưới. Không ra ngoài bàn, chồng hoặc sát cạnh thuyền khác; được chạm chéo. Hai bên có 100/140/200 giây sau khi đủ người để bố trí và Xác nhận. Hết giờ: bên đã xác nhận thắng nếu bên kia chưa xong; cả hai chưa xong thì phòng đóng. Cả hai xác nhận mới bắt đầu, Hạm đội xanh bắn trước. Mỗi lượt bắn 1 ô rồi đổi lượt kể cả trúng. Chỉ ô đã bắn mới lộ; thuyền chìm khi trúng hết các ô. Đánh chìm toàn bộ hạm đội đối thủ để thắng. Đồng hồ riêng mặc định 30 phút/người, tùy chọn thoigian 1–180 phút, không cộng giờ. Tooltip góc phải mỗi biển cho biết số thuyền chưa chìm theo độ dài. Khán giả chỉ xem ô đã bắn. /battleship phong xem phòng, /battleship cauhinh để quản trị chỉnh giới hạn phòng. Không cược, không thưởng xu.";
module.exports = { PRESETS, normalizeRules, rulesText, RULES_TEXT };
