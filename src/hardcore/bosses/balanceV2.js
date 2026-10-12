"use strict";
// Boss-only calibration. Normal encounters, class stat profiles and skills stay unchanged.
const VERSION = 1;
const TARGET = Object.freeze({ min: 0.03, max: 0.05 });
const FACTORS = Object.freeze({
  amazon: 3.5,
  barbarian: 0.95,
  assassin: 0.84,
  sorceress: 1.6,
  druid: 0.48,
  necromancer: 0.49,
  paladin: 0.9,
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
    p.playerDamage < 0.2 ||
    p.playerDamage > 5
  )
    throw Error("INVALID_BOSS_BALANCE_PROFILE");
}
module.exports = { VERSION, TARGET, FACTORS, snapshot, validate };
