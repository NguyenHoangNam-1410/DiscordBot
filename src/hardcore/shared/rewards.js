"use strict";
// Shared reward policy, independent of legacy combat and item rules.
function runDiamondReward(state) {
  const cleared = Math.max(0, Math.min(999, Number(state.cleared) || 0));
  if (cleared >= 999 && state.finalBossDefeated) return 51_200;
  const milestone = Math.min(9, Math.floor(cleared / 100));
  return milestone ? 100 * 2 ** (milestone - 1) : 0;
}
function baseMultiplier(state) {
  const floor = Math.min(state.cleared, 100);
  return (
    1 +
    Math.min(floor, 50) * 0.06 +
    Math.max(0, floor - 50) * 0.1 +
    Math.min(20, Math.floor(floor / 5)) * 0.15
  );
}
const GOBLIN_REWARDS = Object.freeze({
  bonusRate: 0.25,
  lossRate: 0.05,
  rarities: Object.freeze({ rare: 0.6, legendary: 0.35, cursed: 0.05 }),
});
function goblinRewardRarity(roll) {
  if (roll < GOBLIN_REWARDS.rarities.rare) return "rare";
  return roll < GOBLIN_REWARDS.rarities.rare + GOBLIN_REWARDS.rarities.legendary
    ? "legendary"
    : "cursed";
}
module.exports = {
  runDiamondReward,
  baseMultiplier,
  GOBLIN_REWARDS,
  goblinRewardRarity,
};
