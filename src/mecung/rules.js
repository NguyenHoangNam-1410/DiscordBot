"use strict";
const { timeMinutes } = require("../webGames/clock");
const PRESETS = Object.freeze({ small: 7, medium: 9, large: 11 });
const SETUP_MS = 5 * 60_000;
function normalizeRules(input = {}) {
  const mode = input.mode ?? "medium",
    winCondition = input.winCondition ?? "race",
    wallLimit = input.wallLimit ?? 30;
  if (
    !Object.hasOwn(PRESETS, mode) ||
    !["race", "turns"].includes(winCondition) ||
    !Number.isInteger(wallLimit) ||
    wallLimit < 0 ||
    wallLimit > 60
  )
    throw Object.assign(
      new Error(
        "Chọn bàn Nhỏ/Vừa/Lớn, luật Đến đích trước/Ít lượt hơn và 0–60 đoạn tường.",
      ),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({
    mode,
    winCondition,
    wallLimit,
    timeMinutes: timeMinutes(input.timeMinutes),
  });
}
function rulesText(input) {
  const r = normalizeRules(input),
    size = PRESETS[r.mode];
  return `${size}×${size} · ${r.winCondition === "race" ? "Đến đích trước thắng" : "Ít lượt hơn, cân bằng lượt cuối"} · Tối đa ${r.wallLimit} tường/người · Dựng 5 phút · ${r.timeMinutes} phút/người`;
}
const RULES_TEXT =
  "`/mecung choi` mở trận 2 người: mỗi người chọn đầu–đích khác nhau và dựng mê cung kín cho đối thủ. Tường nằm giữa hai ô liền kề, không được cắt hết đường từ đầu đến đích. Dùng tối đa số tường đã cấu hình, không bắt buộc dùng hết. Hai người có 5 phút dựng và xác nhận; đã xác nhận thì không sửa. Mặc định bàn 9×9, tối đa 30 tường, chọn `kichthuoc` Nhỏ 7×7/Vừa 9×9/Lớn 11×11 và `sotuong` 0–60. Quân xanh đi trước. Mỗi thao tác đi 1 ô ngang/dọc: không có tường thì đi tiếp trong cùng lượt; chạm tường thì đứng nguyên, lộ đúng đoạn tường đó và đổi lượt. Ô đã đi tới được đánh dấu khám phá; không lộ tường chưa chạm trong lúc đang đấu. Mép ngoài không thể đi qua, không mất lượt khi chọn ra ngoài bàn. `luat:Đến đích trước` kết thúc ngay khi một người tới đích. `luat:Ít lượt hơn` so số lượt tới đích; đối thủ được đi đủ lượt tương ứng để gỡ hòa, nếu đụng tường trong lượt cuối đó thì thua. Bằng lượt thì hòa, không so số bước. WASD/phím mũi tên hoặc nút hướng để đi. Đồng hồ riêng `thoigian` 1–180 phút, mặc định 30; đi tiếp vẫn trừ cùng đồng hồ, không cộng giờ, hết giờ hoặc đầu hàng thì thua. `/mecung phong` xem phòng; `/mecung cauhinh phongtoida` giới hạn 1–20 phòng/kênh (mặc định 5); mỗi người 1 phòng Mê cung/server. Trên PC hiển thị hai bản đồ đang đấu cạnh nhau; điện thoại chọn từng bản đồ. Khi đang đấu, khán giả chỉ thấy đường đã khám phá; ván đã có người thắng thì mở toàn bộ tường cả hai bên. Phòng chờ 10 phút. Không cược, không thưởng xu.";
module.exports = { PRESETS, SETUP_MS, normalizeRules, rulesText, RULES_TEXT };
