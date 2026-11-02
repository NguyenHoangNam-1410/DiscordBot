"use strict";
const { timeMinutes, DEFAULT_TIME_MINUTES } = require("../webGames/clock");
const SIZES = Object.freeze([3, 5, 7]);
const DEFAULT_RULES = Object.freeze({
  size: 5,
  timeMinutes: DEFAULT_TIME_MINUTES,
});
function normalizeRules(input = {}) {
  const rules = { ...DEFAULT_RULES, ...input };
  if (!SIZES.includes(rules.size))
    throw Object.assign(new Error("Chọn bàn 3×3, 5×5 hoặc 7×7 ô."), {
      code: "INVALID_RULES",
    });
  return Object.freeze({
    size: rules.size,
    timeMinutes: timeMinutes(rules.timeMinutes),
  });
}
function rulesText(input) {
  const rules = normalizeRules(input);
  return `${rules.size}×${rules.size} ô (${rules.size + 1}×${rules.size + 1} chấm) · Khép ô được 1 điểm và đi tiếp · ${rules.timeMinutes} phút/người, không cộng giờ`;
}
const RULES_TEXT =
  "`/dots choi` mở Dots & Boxes / Nối ô, mặc định 5×5 ô; chọn `kichthuoc` 3×3, 5×5 hoặc 7×7 ô, không phải số chấm. X đi trước. Mỗi lượt nối một cạnh ngang/dọc giữa hai chấm kề nhau. Không vẽ lại cạnh đã có. Khép ô được 1 điểm và đi tiếp; một cạnh có thể khép 2 ô, được 2 điểm nhưng vẫn chỉ có một lượt đi tiếp. Ván kết thúc khi tất cả ô đã có chủ; người nhiều điểm hơn thắng. Cạnh và ô đã chiếm giữ màu của người vẽ/chiếm. `/dots phong` xem phòng; `/dots cauhinh phongtoida` đặt 1–20 phòng/kênh (mặc định 5). Mỗi người một phòng Dots & Boxes/server. Người chơi kết nối tài khoản bằng mã trên web nhập trong tin Discord, khán giả chỉ xem. Đồng hồ riêng 30 phút/người, chọn `thoigian` 1–180 phút; chỉ giảm khi tới lượt, kể cả các lượt đi tiếp, không cộng giờ. Hết giờ thì thua; phòng chờ 10 phút tự đóng. Không cược, không thưởng xu.";
module.exports = {
  SIZES,
  DEFAULT_RULES,
  normalizeRules,
  rulesText,
  RULES_TEXT,
};
