// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { MAX_PAYOUT, COMPLETION_FLOOR, GOBLIN_REWARDS } = dependencies;
  const clamp = (...args) => dependencies.clamp(...args);

  // Total diamonds held by this run, rather than a sum of milestone rewards.
  function runDiamondReward(state) {
    const cleared = Math.max(0, Math.min(999, Number(state.cleared) || 0));
    if (cleared >= 999 && state.finalBossDefeated) return 51_200;
    const milestone = Math.min(9, Math.floor(cleared / 100));
    return milestone ? 100 * 2 ** (milestone - 1) : 0;
  }

  function luckyBreakChance(state) {
    return clamp((Number(state.luck) || 0) * 0.015, 0, 0.3);
  }

  function goblinCatchChance(state) {
    return clamp(
      Math.min(0.8, 0.6 + (Number(state.luck) || 0) * 0.01) +
        (state.goblinChance || 0),
      0,
      0.9,
    );
  }

  function goblinRewardRarity(roll) {
    if (roll < GOBLIN_REWARDS.rarities.rare) return "rare";
    return roll <
      GOBLIN_REWARDS.rarities.rare + GOBLIN_REWARDS.rarities.legendary
      ? "legendary"
      : "cursed";
  }

  function goblinEscapeCost(state) {
    return Math.ceil(potentialPayout(state) * GOBLIN_REWARDS.lossRate);
  }

  function baseMultiplier(state) {
    const floor = Math.min(state.cleared, COMPLETION_FLOOR);
    const checkpoints = Math.min(20, Math.floor(floor / 5));
    return (
      1 +
      Math.min(floor, 50) * 0.06 +
      Math.max(0, floor - 50) * 0.1 +
      checkpoints * 0.15
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
    // Service fees and collected taxes are fixed coin deductions.
    return Math.max(0, gross - (state.payoutSpent || 0));
  }

  function taxCost(state) {
    return Math.ceil(potentialPayout(state) * 0.15);
  }

  function payoutReductionCost(state, rate) {
    return (
      potentialPayout(state) -
      potentialPayout({
        ...state,
        payoutFactor: state.payoutFactor * (1 - rate),
      })
    );
  }
  return {
    runDiamondReward,
    luckyBreakChance,
    goblinCatchChance,
    goblinRewardRarity,
    goblinEscapeCost,
    baseMultiplier,
    potentialPayout,
    taxCost,
    payoutReductionCost,
  };
};
