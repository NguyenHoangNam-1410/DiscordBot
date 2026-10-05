"use strict";

// Each survived encounter starts the same low-risk progression again.
function rngesusChance(floor) {
  if (floor < 5) return 0;
  if (floor < 10) return 0.003;
  if (floor < 20) return 0.006;
  return 0.01;
}
function rngesusEncounterChance(state) {
  if (state.floor < 5) return 0;
  const resetFloor = state.rngesusResetFloor;
  if (!Number.isSafeInteger(resetFloor) || resetFloor <= 0)
    return rngesusChance(state.floor);
  const distance = state.floor - resetFloor;
  // The next floor is always safe, including volatility/spike rolls.
  if (distance <= 1) return 0;
  // Restart at the first eligible band: 5 floors at 0.3%, then 10 at 0.6%.
  return rngesusChance(distance + 3);
}
function resetRngesusEncounter(state) {
  state.rngesusResetFloor = state.floor;
  state.rngesusDry = 0;
  state.lastChaosChance = 0;
  state.lastChaosSpike = false;
}
// Shared by /luat and /sinhton tyle so both describe the same encounter cycle.
const RNGESUS_CYCLE_RULES = [
  "- Đầu run: tầng 1–4 không gặp; tỷ lệ nền 0,3% ở tầng 5–9, 0,6% ở tầng 10–19, 1% từ tầng 20.",
  "- Vượt RNGesus tại tầng F: reset Chaos và bộ đếm không gặp, kể cả được cứu và sang tầng kế tiếp.",
  "- Tầng ngay sau đó: **0%** (F+1), không roll spike. **RNGesus không xuất hiện ở hai tầng liền nhau.**",
  "- Từ F+2: **0,3% trong 5 tầng** (F+2–F+6) → **0,6% trong 10 tầng** (F+7–F+16) → **1% từ F+17**. Đây là tỷ lệ nền, chưa cộng biến động/chuỗi không gặp.",
  "- Boss tầng 50/100/… và 999 được ưu tiên; các tầng không roll RNGesus không tăng bộ đếm không gặp.",
  "- Reset tỷ lệ gặp không đặt lại tỷ lệ bỏ chạy hoặc hiệu lực vé cầu nguyện. Mốc reset được lưu khi tiếp tục run/restart bot.",
].join("\n");
function rngesusChaosRules(legacy = false) {
  return (
    "Chaos là tỷ lệ gặp RNGesus của lần roll gần nhất, không phải debuff.\n" +
    "- Tỷ lệ nền nhân ngẫu nhiên **×0,25–3**.\n" +
    "- Mỗi lần roll không gặp cộng **0,05 điểm %** cho lần sau" +
    (legacy ? ", tối đa +2,5 điểm %." : ".") +
    "\n" +
    "- Mỗi roll có **2,5%** cơ hội spike, cộng thêm **4–10 điểm %**.\n" +
    "- Tỷ lệ gặp cuối cùng tối đa **12%**. Tầng bị chặn là **0%**, không chịu biến động/spike.\n" +
    "Ví dụ nền 0,3% không có nghĩa mỗi tầng luôn có đúng 0,3% cơ hội gặp."
  );
}
module.exports = {
  RNGESUS_CYCLE_RULES,
  rngesusChaosRules,
  rngesusChance,
  rngesusEncounterChance,
  resetRngesusEncounter,
};
