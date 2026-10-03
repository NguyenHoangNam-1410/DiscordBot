"use strict";

// Snapshotted into each new run. Existing 2.0.0 runs keep their original stats.
const VERSION = "2.0.1";
const PROFILES = Object.freeze({
  amazon: Object.freeze({ power: 2.09 }),
  barbarian: Object.freeze({ power: 1.64 }),
  assassin: Object.freeze({ power: 1 }),
  sorceress: Object.freeze({ power: 1.57 }),
  druid: Object.freeze({ power: 1.12 }),
  necromancer: Object.freeze({ power: 0.54 }),
  paladin: Object.freeze({ power: 1.67 }),
});
function forClass(classKey) {
  if (!Object.hasOwn(PROFILES, classKey)) throw new Error("INVALID_CLASS");
  return { ...PROFILES[classKey] };
}
function power(state) {
  if (!state.balanceVersion) return 1;
  if (state.balanceVersion !== VERSION)
    throw new Error("UNSUPPORTED_HARDCORE_BALANCE");
  const value = state.balanceProfile?.power;
  if (!Number.isFinite(value) || value < 0.1 || value > 5)
    throw new Error("INVALID_HARDCORE_BALANCE");
  return value;
}
module.exports = { VERSION, PROFILES, forClass, power };
