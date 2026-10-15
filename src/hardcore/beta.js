"use strict";
const { runDiamondReward } = require("./shared/rewards");
const STAKE = 100000;
const is = (s) => s?.mode === "beta" && s.beta?.version === 1;
function activate(s) {
  s.mode = "beta";
  s.beta = {
    version: 1,
    awaitingRevive: false,
    deaths: 0,
    revivals: 0,
    deathReason: null,
    spentDiamonds: 0,
    rngesusDeaths: 0,
  };
  return s;
}
function validate(s) {
  if (s.mode !== "beta" && s.beta == null) return;
  const b = s.beta;
  if (
    !is(s) ||
    s.gameplayVersion !== 3 ||
    s.classKey !== "venance" ||
    s.stake !== STAKE ||
    typeof b.awaitingRevive !== "boolean" ||
    ["deaths", "revivals", "spentDiamonds", "rngesusDeaths"].some(
      (k) => !Number.isSafeInteger(b[k]) || b[k] < 0,
    ) ||
    b.revivals > b.deaths ||
    ![null, "death", "rngesus"].includes(b.deathReason) ||
    (b.awaitingRevive && s.hp > 0)
  )
    throw Error("INVALID_BETA_STATE");
}
function markDeath(s, reason) {
  if (!is(s)) throw Error("INVALID_BETA_STATE");
  s.hp = 0;
  s.beta.awaitingRevive = true;
  s.beta.deathReason = reason === "rngesus" ? "rngesus" : "death";
  s.beta.deaths++;
  if (reason === "rngesus") s.beta.rngesusDeaths++;
  s.lastLog =
    (s.lastLog || "") +
    "\n🧪 Beta: đã tử trận. Bấm Hồi sinh để trở lại với 100% HP; không nhận thành tích hoặc phần thưởng tài khoản.";
}
function revive(s, session, rng, ops) {
  if (!is(s) || !s.beta.awaitingRevive || s.hp > 0)
    throw Error("INVALID_ACTION");
  const reason = s.beta.deathReason;
  s.beta.awaitingRevive = false;
  s.beta.deathReason = null;
  s.beta.revivals++;
  ops.recompute(s);
  s.hp = s.maxHp;
  delete s.lastDeathCause;
  s.lastLog =
    "🧪 Beta: hồi sinh **100% HP** (" +
    s.hp +
    "/" +
    s.maxHp +
    "). Không hồi thêm MP; giữ tiến trình chiến đấu.";
  const e = s.encounter;
  if (e.boss?.id === "inarius" && e.boss.mechanicState?.lilithHp <= 0) {
    e.boss.mechanicState.lilithHp = require("./bosses/runtimeV2").LILITH_MAX_HP;
    s.lastLog += "\nĐã cứu Lilith để tiếp tục thử nghi lễ.";
  }
  if (reason === "rngesus" || e.type !== "combat")
    ops.completeFloor(s, session, rng, 0);
  else if (e.hp <= 0) ops.defeatEnemy(s, session, rng, e);
  if (s.hp <= 0) markDeath(s, "death");
}
const diamonds = (s) =>
  Math.max(0, runDiamondReward(s) - (s.beta?.spentDiamonds || 0));
function spendDiamonds(s, amount) {
  if (!is(s) || !Number.isSafeInteger(amount) || amount < 0)
    throw Error("INVALID_BETA_PAYMENT");
  if (amount > diamonds(s)) throw Error("INSUFFICIENT_DIAMONDS");
  s.beta.spentDiamonds += amount;
}
function result(s, reason, simulatedPayout) {
  return {
    beta: true,
    reason,
    payout: 0,
    diamonds: 0,
    diamondsLost: 0,
    outcome: "draw",
    simulatedPayout,
    simulatedDiamonds: diamonds(s),
    achievements: [],
    experienceGained: 0,
    levelUps: [],
    bonusDrops: [],
  };
}
module.exports = {
  STAKE,
  is,
  activate,
  validate,
  markDeath,
  revive,
  diamonds,
  spendDiamonds,
  result,
};
