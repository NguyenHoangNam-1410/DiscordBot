const MAX_PAYOUT = 10_000_000;
const COMPLETION_FLOOR = 100;
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function luckyBreakChance(state) {
  return clamp((Number(state.luck) || 0) * 0.015, 0, 0.3);
}
function goblinCatchChance(state) {
  return clamp(0.6 + (Number(state.luck) || 0) * 0.01, 0.6, 0.8);
}
function hitChance(accuracy, evasion) {
  return clamp(0.75 + (accuracy - evasion) * 0.005, 0.2, 0.95);
}
function defenseReduction(defense, level) {
  return clamp(defense / (defense + 50 + level * 8), 0, 0.75);
}
function physicalAfterDefense(rawDamage, defense, level) {
  return Math.max(
    1,
    Math.floor(rawDamage * (1 - defenseReduction(defense, level))),
  );
}
function magicAfterResistance(rawDamage, resistance) {
  return Math.max(
    1,
    Math.floor(rawDamage * (1 - clamp(resistance, -50, 75) / 100)),
  );
}
const REGIONS = Object.freeze([
  { start: 1, end: 99, name: "Sanctuary", hpSlope: 0.05, damageSlope: 0.025 },
  {
    start: 100,
    end: 199,
    name: "Duncraig",
    hpSlope: 0.035,
    damageSlope: 0.018,
  },
  {
    start: 200,
    end: 299,
    name: "Fauztinville",
    hpSlope: 0.04,
    damageSlope: 0.02,
  },
  { start: 300, end: 399, name: "Teganze", hpSlope: 0.045, damageSlope: 0.022 },
  { start: 400, end: 499, name: "Scosglen", hpSlope: 0.06, damageSlope: 0.026 },
  {
    start: 500,
    end: 699,
    name: "Dimensional Labyrinth",
    hpSlope: 0.07,
    damageSlope: 0.03,
  },
  {
    start: 700,
    end: 899,
    name: "Heroic Rift",
    hpSlope: 0.09,
    damageSlope: 0.036,
  },
  {
    start: 900,
    end: 999,
    name: "Dimensional Plane",
    hpSlope: 0.11,
    damageSlope: 0.044,
  },
]);
const RIFT_MODIFIERS = Object.freeze({
  stone_skin: { name: "Stone Skin", text: "Quái +10% Defense mỗi cộng dồn" },
  elemental_dominion: {
    name: "Elemental Dominion",
    text: "Quái +4% sát thương; quái ngoài boss +2% cơ hội phép mỗi cộng dồn",
  },
  bloodlust: {
    name: "Bloodlust",
    text: "Quái dưới 50% HP +8% sát thương mỗi cộng dồn",
  },
  unstable_rift: {
    name: "Unstable Rift",
    text: "Thêm hòm tốt và Mimic mỗi cộng dồn",
  },
  fortified: { name: "Fortified", text: "Quái +10% HP mỗi cộng dồn" },
  swift_horror: {
    name: "Swift Horror",
    text: "Quái +3 Accuracy và +2 Evasion mỗi cộng dồn",
  },
  soul_drain: {
    name: "Soul Drain",
    text: "Đòn trúng rút Energy, tối đa 2 mỗi đòn",
  },
  cursed_ground: {
    name: "Cursed Ground",
    text: "Phép trúng giảm 2% All Resistance mỗi cộng dồn, tối đa −50%",
  },
});
function regionForFloor(floor) {
  return (
    REGIONS.find((region) => floor >= region.start && floor <= region.end) ||
    REGIONS.at(-1)
  );
}
function enemyScale(floor) {
  const target = clamp(Math.trunc(floor), 1, 999);
  let hp = 1;
  let damage = 1;
  for (const region of REGIONS) {
    const count = Math.max(0, Math.min(target, region.end) - region.start + 1);
    hp += count * region.hpSlope;
    damage += count * region.damageSlope;
  }
  return { hp, damage };
}
function checkpointGrowth(floor) {
  return floor < 100
    ? { hp: 6, attack: 1 }
    : floor < 400
      ? { hp: 10, attack: 2 }
      : floor < 700
        ? { hp: 14, attack: 3 }
        : { hp: 30, attack: 6 };
}
function baseMultiplier(state) {
  const floor = Math.min(state.cleared, COMPLETION_FLOOR);
  const bosses = Math.min(state.bosses, 2);
  return (
    1 +
    Math.min(floor, 50) * 0.06 +
    Math.max(0, floor - 50) * 0.1 +
    bosses * 0.15
  );
}
function potentialPayout(state) {
  if (state.cleared <= 0) return 0;
  const gross = Math.min(
    MAX_PAYOUT,
    Math.max(
      0,
      Math.floor(
        (state.stake * baseMultiplier(state) + state.bonus) *
          state.payoutFactor,
      ),
    ),
  );
  // Service fees are already spent coins, so subsequent taxes cannot reduce them.
  return Math.max(0, gross - (state.payoutSpent || 0));
}
const BOSS_DAMAGE_TYPES = Object.freeze({
  butcher: "physical",
  riftwalker: "magic",
  assur: "physical",
  lucion: "magic",
  deimoss: "magic",
});
const BOSS_MECHANICS = Object.freeze({
  "The Butcher": "butcher",
  "Ascendant Riftwalker": "riftwalker",
  Assur: "assur",
  Lucion: "lucion",
  "Deimoss the Fleshweaver": "deimoss",
});
function enemyDamageType(enemy) {
  return (
    BOSS_DAMAGE_TYPES[
      enemy.mechanic ||
        (["boss", "final_boss"].includes(enemy.rank)
          ? BOSS_MECHANICS[enemy.name]
          : null)
    ] ||
    enemy.damageType ||
    "mixed"
  );
}
function serviceCost(state, service) {
  return Math.max(
    1,
    Math.ceil(
      state.stake *
        (service === "blacksmith"
          ? 0.5 * (1 + state.floor / 100)
          : 0.35 * (1 + state.floor / 200)),
    ),
  );
}
function forgeTarget(state) {
  const rarity = { common: 1, rare: 2, legendary: 3 };
  return (
    (state.items || [])
      .filter(
        (item) =>
          rarity[item.rarity] &&
          item.definition &&
          !item.definition.bonusPenalty &&
          !item.definition.potions &&
          !item.definition.escapeTokens &&
          item.definition.defenseSet === undefined &&
          [
            "attack",
            "defense",
            "maxHp",
            "resistance",
            "critChance",
            "luck",
          ].some((key) => item.definition[key] > 0),
      )
      .sort(
        (a, b) => rarity[b.rarity] - rarity[a.rarity] || a.level - b.level,
      )[0] || null
  );
}
function curseTarget(state) {
  return (
    (state.items || []).find(
      (item) =>
        item.rarity === "cursed" &&
        item.definition?.bonusPenalty > 0 &&
        item.definition.bonusPenalty < 1 &&
        item.level > (item.cleansedLevels || 0),
    ) || null
  );
}
module.exports = {
  clamp,
  luckyBreakChance,
  goblinCatchChance,
  hitChance,
  defenseReduction,
  physicalAfterDefense,
  magicAfterResistance,
  enemyScale,
  baseMultiplier,
  potentialPayout,
  REGIONS,
  RIFT_MODIFIERS,
  regionForFloor,
  checkpointGrowth,
  BOSS_MECHANICS,
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
};
