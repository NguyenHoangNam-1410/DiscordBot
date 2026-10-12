"use strict";
const legacy = require("./legacyMechanics"),
  modern = require("./mechanicsV2"),
  roster = require("./roster");
const dispatch = (s) => (modern.on(s.encounter) ? modern : legacy);
module.exports = {
  ...roster,
  on: (e) => modern.on(e) || legacy.on(e),
  bstate: (s) => dispatch(s).bstate(s),
  seed: (s, e, d, rng) =>
    s.bossRosterVersion === 2
      ? (() => {
          modern.seed(s, e, d, rng);
          modern.refresh({ ...s, encounter: e });
          return e;
        })()
      : legacy.seed(s, e, d, rng),
  applyDamage: (s, damage) => {
    const rift = require("../rift");
    if (
      rift.enabled(s) &&
      (modern.on(s.encounter)
        ? modern.previewDamage(s, damage) <= 0
        : s.encounter.hp <= legacy.floorHp(s))
    )
      return 0;
    return rift.damage(s, damage, (damage) => {
      if (modern.on(s.encounter)) return modern.applyDamage(s, damage);
      const e = s.encounter,
        dealt = Math.min(Math.max(0, e.hp - legacy.floorHp(s)), damage);
      e.hp = Math.max(legacy.floorHp(s), e.hp - damage);
      return dealt;
    });
  },
  // Display attack strength without capping it to remaining HP. Settlement still uses dealt.
  damageStrength: (s, damage) => {
    if (s.encounter.hp <= 0) return 0;
    if (modern.on(s.encounter) && modern.previewDamage(s, damage) <= 0)
      return 0;
    if (!modern.on(s.encounter) && s.encounter.hp <= legacy.floorHp(s))
      return 0;
    return Math.max(0, Math.floor(damage));
  },
  previewDamage: (s, damage) =>
    modern.on(s.encounter) ? modern.previewDamage(s, damage) : damage,
  choices: (s) => (modern.on(s.encounter) ? modern.dec.options(s) : []),
  isFree: (s, a) => modern.on(s.encounter) && modern.dec.free(s, a),
  blocked: (s, a) => modern.on(s.encounter) && modern.dec.blocked(s, a),
  actComponent: (s, a, ops) => modern.dec.act(s, a, ops),
  validate: (s, e) => {
    require("./balanceV2").validate(s);
    const enemy = e || s.encounter;
    if (
      enemy?.boss &&
      ["boss", "final_boss"].includes(enemy.rank) &&
      (![1, 2].includes(enemy.boss.version) ||
        enemy.boss.version !== (s.bossRosterVersion || 1))
    )
      throw Error("INVALID_BOSS_STATE");
    modern.validate(s, e);
  },
  beforeResolution: (s, ops) =>
    modern.on(s.encounter) ? modern.resolveHeat(s, ops) : "",
  healingLimit: (s) =>
    modern.on(s.encounter) ? modern.healingLimit(s) : s.maxHp,
  skillHpCost: (s) => (modern.on(s.encounter) ? modern.skillHpCost(s) : 0),
  healingFactor: (s) => (modern.on(s.encounter) ? modern.healingFactor(s) : 1),
  skillCost: (s, c) => (modern.on(s.encounter) ? modern.skillCost(s, c) : c),
  defenseFactor: (s) => (modern.on(s.encounter) ? modern.defenseFactor(s) : 1),
  playerCrit: (s, value) =>
    modern.on(s.encounter) ? modern.playerCrit(s, value) : value,
};
for (const key of [
  "vanished",
  "brainControl",
  "effectiveMaxMana",
  "resPenalty",
  "phase",
  "refresh",
  "beginAction",
  "playerFactor",
  "hit",
  "floorHp",
  "afterPlayer",
  "counter",
  "afterCounter",
  "endAction",
  "advancePhase",
  "retreatLocked",
])
  module.exports[key] = (s, ...args) => dispatch(s)[key](s, ...args);
