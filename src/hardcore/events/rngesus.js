"use strict";

const RNGESUS_RATE = Object.freeze({ initial: 0.003, step: 0.0005, max: 0.12 });

const GOD_RNGESUS_RATE = Object.freeze({ initial: 0.000001, step: 0.000001 });
function godRngesusChance(deaths = 0) {
  const count = Number.isSafeInteger(deaths) ? Math.max(0, deaths) : 0;
  return Math.min(1, (count + 1) / 1_000_000);
}
function formatGodChance(chance) {
  return (
    (chance * 100).toLocaleString("vi-VN", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }) + "%"
  );
}
function hasFatebreaker(state) {
  return (
    state.activeRelic === "fatebreaker_seal" &&
    (state.relics || []).some((item) => item.id === "fatebreaker_seal")
  );
}
const GOD_RNGESUS_RULES = [
  "- God of RNGesus roll riêng mỗi tầng từ tầng 1: **0,0001% + số lần tử trận thật sự do RNGesus từ lần ban phước trước × 0,0001 điểm %**.",
  "- Tính theo người chơi trong server, cộng dồn qua các run và restart bot. Lịch sử tử trận RNGesus đã lưu được tính; được cứu/hồi sinh hoặc chết vì nguồn khác không tăng.",
  "- Gặp: hồi đầy HP/MP, giải toàn bộ nguyền UR (giữ UR và level), xóa mọi ấn Rift; giữ Paradox/Contract. Nhận Fatebreaker Seal [LR], không gặp RNGesus nữa trong run.",
  "- Reset tỷ lệ God về **0,0001%**; lưu tỷ lệ đã xảy ra vào thành tích. Không bỏ qua boss/tình huống của tầng.",
].join("\n");

function rngesusChance(floor) {
  return floor < 5 ? 0 : RNGESUS_RATE.initial;
}
function rngesusEncounterChance(state) {
  if (hasFatebreaker(state)) return 0;
  if (!rngesusChance(state.floor)) return 0;
  const resetFloor = state.rngesusResetFloor;
  // Retain one safe floor after surviving RNGesus.
  if (
    Number.isSafeInteger(resetFloor) &&
    resetFloor > 0 &&
    state.floor - resetFloor <= 1
  )
    return 0;
  const dry = Number.isSafeInteger(state.rngesusDry)
    ? Math.max(0, state.rngesusDry)
    : 0;
  return Math.min(
    RNGESUS_RATE.max,
    RNGESUS_RATE.initial + dry * RNGESUS_RATE.step,
  );
}
function resetRngesusEncounter(state) {
  state.rngesusResetFloor = state.floor;
  state.rngesusDry = 0;
  state.lastChaosChance = 0;
  state.lastChaosSpike = false;
}
// Shared by /luat and /sinhton tyle so both describe the same encounter cycle.
const RNGESUS_CYCLE_RULES = [
  "- Đầu run: tầng 1–4 không gặp; lần roll đầu từ tầng 5 có tỷ lệ **0,30%**.",
  "- Mỗi tầng có roll nhưng không gặp: tầng có roll tiếp theo tăng **0,05 điểm %**, tối đa **12%**. Chuỗi tỷ lệ: **0,30% → 0,35% → 0,40% → …**.",
  "- Gặp RNGesus: reset bộ đếm không gặp. Vượt tại tầng F (kể cả được cứu) thì F+1 chắc chắn **0%**; lần roll kế tiếp từ F+2 bắt đầu lại ở **0,30%**.",
  "- Boss tầng 50/100/… và 999 được ưu tiên. Tầng boss/tầng bị chặn không tăng bộ đếm không gặp.",
  "- Reset tỷ lệ gặp không đặt lại tỷ lệ bỏ chạy hoặc vé cầu nguyện. Bộ đếm và mốc reset được lưu khi tiếp tục/restart bot.",
].join("\n");
function rngesusChaosRules() {
  return (
    "Chaos là tỷ lệ gặp RNGesus đã dùng khi tạo tình huống hiện tại.\n" +
    "- Tỷ lệ = **0,30% + số tầng có roll liên tiếp không gặp × 0,05 điểm %**, tối đa **12%**.\n" +
    "- Tỷ lệ tăng cố định; **không có spike hay biến động ngẫu nhiên**. Kết quả gặp/không gặp vẫn được roll theo tỷ lệ này.\n" +
    "- Gặp thì reset bộ đếm; tầng bị chặn có tỷ lệ **0%**."
  );
}
module.exports = {
  GOD_RNGESUS_RATE,
  GOD_RNGESUS_RULES,
  godRngesusChance,
  formatGodChance,
  hasFatebreaker,
  RNGESUS_CYCLE_RULES,
  rngesusChaosRules,
  rngesusChance,
  rngesusEncounterChance,
  resetRngesusEncounter,
};
