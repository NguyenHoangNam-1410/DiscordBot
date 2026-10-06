"use strict";
const world = require("../services/hardcoreWorld");
const BASE_CHANCE = 0.05;
const LUCK_PER_POINT = 0.005;
const CAP = 0.2;
const LOWER_RARITY_CHANCE = 0.6;
const POOLS = Object.freeze({
  normal: Object.freeze(["common", "rare"]),
  elite: Object.freeze(["rare", "legendary"]),
  boss: Object.freeze(["legendary", "cursed"]),
});
function chance(luck) {
  const value = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  return Math.min(CAP, BASE_CHANCE + value * LUCK_PER_POINT);
}
function hasRegionBossChest(state, enemy = state.encounter) {
  return (
    enemy?.type === "combat" &&
    enemy.rank === "boss" &&
    !enemy.echoId &&
    world.REGIONS.some(
      (region) => region.start > 1 && region.start === state.floor,
    )
  );
}
function group(enemy) {
  if (["boss", "final_boss"].includes(enemy.rank)) return "boss";
  if (
    enemy.rank === "elite" ||
    ["ancient_mimic", "blood_mimic"].includes(world.mimicKind(enemy))
  )
    return "elite";
  return "normal";
}
function prepare(state, enemy = state.encounter) {
  if (enemy?.type !== "combat" || enemy.itemDrop?.version === 1) return;
  // Lock before kill rewards can raise LUCK; preparing/viewing never rolls RNG.
  const luck = Number.isFinite(state.luck) ? Math.max(0, state.luck) : 0;
  enemy.itemDrop = { version: 1, luck, group: group(enemy), settled: false };
}
function odds(state, enemy = state.encounter) {
  if (enemy?.type !== "combat") return null;
  const locked = enemy.itemDrop?.version === 1 ? enemy.itemDrop : null;
  const luck = locked?.luck ?? state.luck;
  const pool = POOLS[locked?.group || group(enemy)];
  return {
    luck,
    chance: hasRegionBossChest(state, enemy) ? 0 : chance(luck),
    rarities: pool,
    lowerChance: LOWER_RARITY_CHANCE,
    regionChest: hasRegionBossChest(state, enemy),
  };
}
function roll(state, enemy, rng) {
  if (enemy?.type !== "combat" || enemy.hp > 0 || state.hp <= 0) return null;
  prepare(state, enemy);
  if (enemy.itemDrop.settled) return null;
  enemy.itemDrop.settled = true;
  const info = odds(state, enemy);
  if (info.regionChest || rng() >= info.chance) return null;
  return info.rarities[rng() < LOWER_RARITY_CHANCE ? 0 : 1];
}
module.exports = {
  BASE_CHANCE,
  LUCK_PER_POINT,
  CAP,
  LOWER_RARITY_CHANCE,
  POOLS,
  chance,
  hasRegionBossChest,
  prepare,
  odds,
  roll,
};
