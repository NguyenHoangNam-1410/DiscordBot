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
module.exports = { runDiamondReward, baseMultiplier };
