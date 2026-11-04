"use strict";
const { timeMinutes } = require("../webGames/clock");
function bounded(value, fallback, min, max) {
  value = value ?? fallback;
  if (!Number.isInteger(value) || value < min || value > max)
    throw Object.assign(
      new Error("HP phải từ 1–20; sức chứa đạo cụ từ 1–12."),
      { code: "INVALID_RULES" },
    );
  return value;
}
function normalizeRules(input = {}) {
  return Object.freeze({
    timeMinutes: timeMinutes(input.timeMinutes),
    maxHp: bounded(input.maxHp, 5, 1, 20),
    itemLimit: bounded(input.itemLimit, 4, 1, 12),
  });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return `${r.maxHp} HP · Tối đa ${r.itemLimit} đạo cụ/người · ${r.timeMinutes} phút/người`;
}
const RULES_TEXT =
  "`/coquay choi [mau] [vatpham] [thoigian]` mở bàn web cho hai người; `/coquay phong` xem phòng, khán giả xem trực tiếp. Mặc định 5 HP, tối đa 4 đạo cụ chưa dùng và 30 phút/người (không cộng giờ). Mỗi hiệp là một lần nạp đạn, luôn có đạn thật và đạn lép, thứ tự kín. Khi bắt đầu hiệp đầu và sau khi bắn/loại hết đạn, mỗi người mở hộp nhận ngẫu nhiên 1–2 đạo cụ; phần vượt sức chứa bị bỏ. HP không hồi sau hiệp. Tự bắn đạn lép giữ lượt; bắn đối thủ hoặc đạn thật chuyển lượt, trừ khi bị còng. Cưa tăng sát thương viên bắn tiếp theo lên 2; bia đỡ 1 sát thương từ đối phương; kính lúp chỉ mình bạn biết viên tiếp theo; còng bỏ qua một lượt đối thủ; thuốc hồi 1 HP; lon bia loại viên tiếp theo; bộ đảo biến thật thành lép hoặc ngược lại. Dùng đạo cụ không mất lượt. Hạ HP đối thủ về 0 để thắng; hết giờ/đầu hàng thì thua. Không cược xu, không thành tựu; đạo cụ chỉ tồn tại trong ván, không liên quan túi/gacha Discord. Có nút xoay bàn 180°, không đổi người chơi/lượt. Phòng chờ đóng sau 10 phút. `/coquay cauhinh phongtoida` cho quản trị giới hạn số phòng/kênh (mặc định 5).";
module.exports = { normalizeRules, rulesText, RULES_TEXT };
