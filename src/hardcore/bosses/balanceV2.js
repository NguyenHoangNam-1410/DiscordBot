"use strict";
// Boss-only calibration. Normal encounters, class stat profiles and skills stay unchanged.
const VERSION = 1;
const TARGET = Object.freeze({ min: 0.08, max: 0.12 });
const FACTORS = Object.freeze({
  venance: 2,
  rha_kor: 0.504,
  amazon: 2.1,
  barbarian: 0.504,
  assassin: 0.36,
  sorceress: 1.6,
  druid: 0.3,
  necromancer: 0.135,
  paladin: 0.5,
});
function snapshot(classKey) {
  if (!Object.hasOwn(FACTORS, classKey)) throw Error("INVALID_CLASS");
  return { version: VERSION, classKey, playerDamage: FACTORS[classKey] };
}
function validate(state) {
  const p = state.bossDamageProfile;
  if (p == null) return; // Already-saved experimental roster 2 runs keep scale 1.
  if (
    state.bossRosterVersion !== 2 ||
    p.version !== VERSION ||
    p.classKey !== state.classKey ||
    !Number.isFinite(p.playerDamage) ||
    p.playerDamage < 0.05 ||
    p.playerDamage > 5
  )
    throw Error("INVALID_BOSS_BALANCE_PROFILE");
}
module.exports = { VERSION, TARGET, FACTORS, snapshot, validate };
