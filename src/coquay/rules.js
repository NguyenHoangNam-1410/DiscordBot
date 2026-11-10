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
  "`/coquay choi [mau] [vatpham] [thoigian]` mở bàn web hai người. Mặc định 5 HP, tối đa 4 đạo cụ chưa dùng và 30 phút/người, không cộng giờ. Mỗi hiệp nạp đạn thật/lép kín, số lượng hai loại chênh nhau tối đa 2 viên lúc nạp, và bốc chung số lượng 1 hoặc 2 đạo cụ cho cả hai bên; loại đồ ngẫu nhiên riêng, mỗi bên tự bỏ phần vượt sức chứa. HP không tự hồi giữa hiệp. Dùng bộ 9 đạo cụ 1v1 + Double or Nothing của Buckshot Roulette: Kính lúp soi kín viên hiện tại; Cưa tăng viên hiện tại lên 2 DMG nếu thật (bắn/loại viên thì hết cưa); Còng bỏ một lượt đối thủ, chỉ một còng mỗi lượt liên tục; Gói thuốc lá hồi 1 HP; Lon bia loại và công bố viên hiện tại, giữ lượt; Bộ đảo đổi thật ↔ lép; Adrenaline chọn một món của đối thủ để cướp và dùng ngay, không cướp Adrenaline; Điện thoại dùng một lần báo riêng vị trí/loại một viên ngẫu nhiên phía sau viên hiện tại (chỉ còn 1 viên thì không có dự đoán nhưng vẫn tiêu món); Thuốc hết hạn có 50% hồi 2 HP, 50% mất 1 HP và có thể chết. Hồi HP không vượt tối đa; thuốc lá dùng khi đầy HP vẫn tiêu món. Dùng đạo cụ không mất lượt nếu còn sống. Tự bắn lép giữ lượt; các phát khác đổi lượt trừ còng. Thông tin đạn riêng tự dịch vị trí khi bắn/loại viên, đổi theo lần đảo và xóa khi nạp hiệp mới. Hạ HP đối thủ về 0 để thắng; chết, hết giờ hoặc đầu hàng thì thua. `/coquay phong` xem phòng; `/coquay cauhinh phongtoida` giới hạn phòng/kênh. Không cược, không thưởng thành tựu; đạo cụ chỉ thuộc ván web. Xoay bàn 180° chỉ đổi góc nhìn. Phòng chờ hết hạn sau 10 phút.";
module.exports = { normalizeRules, rulesText, RULES_TEXT };
