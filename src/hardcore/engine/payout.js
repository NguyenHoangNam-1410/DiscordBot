"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { covenant, paradox, E, GOBLIN_REWARDS, baseMultiplier, clamp } =
    dependencies;

  function rawPayout(state) {
    if (!state.cleared) return 0;
    return Math.max(
      0,
      Math.min(
        10_000_000,
        Math.floor(
          (state.stake * baseMultiplier(state) + state.bonus) *
            state.payoutFactor *
            (1 + covenant.bonus(state)),
        ),
      ) - (state.payoutSpent || 0),
    );
  }

  function payout(state) {
    if (!state.paradox || state.paradox.kind !== "blood")
      return rawPayout(state);
    return Math.max(
      0,
      Math.min(
        10_000_000,
        Math.floor(
          (state.stake * baseMultiplier(state) + state.bonus) *
            state.payoutFactor *
            (1 + state.paradox.bloodFactor) *
            (1 + covenant.bonus(state)),
        ),
      ) - (state.payoutSpent || 0),
    );
  }

  function taxCost(state) {
    return Math.ceil(payout(state) * 0.15);
  }

  function goblinCatchChance(state) {
    return clamp(
      0.6 + (state.luck || 0) * 0.01 + (state.goblinChance || 0),
      0,
      0.9,
    );
  }

  function goblinEscapeCost(state) {
    return Math.ceil(payout(state) * GOBLIN_REWARDS.lossRate);
  }

  function payoutSnapshot(state) {
    return {
      coins: payout(state),
      bonus: state.bonus,
      factor: state.payoutFactor,
      spent: state.payoutSpent || 0,
      covenantBonus: covenant.bonus(state),
      bloodFactor:
        state.paradox?.kind === "blood" ? state.paradox.bloodFactor : 0,
    };
  }

  function payoutChanged(before, after) {
    return Object.keys(before).some((key) => before[key] !== after[key]);
  }

  function logPayoutChange(state, before, after, source) {
    const delta = after.coins - before.coins;
    const money = (n) => Math.abs(n).toLocaleString("vi-VN");
    state.lastLog +=
      "\n" +
      E.coin +
      " **Thưởng xu · " +
      source +
      ":** " +
      money(before.coins) +
      " → **" +
      money(after.coins) +
      "** (" +
      (delta < 0 ? "−" : "+") +
      money(delta) +
      " xu).";
  }

  function penalty(state, fraction) {
    const cost = Math.ceil(payout(state) * fraction);
    state.payoutSpent = (state.payoutSpent || 0) + cost;
    state.payoutEventSpent = (state.payoutEventSpent || 0) + cost;
  }

  function charge(state, amount) {
    if (!Number.isSafeInteger(amount) || amount < 1 || payout(state) < amount)
      throw new Error("INSUFFICIENT_RUN_PAYOUT");
    state.payoutSpent = (state.payoutSpent || 0) + amount;
  }
  return {
    rawPayout,
    payout,
    taxCost,
    goblinCatchChance,
    goblinEscapeCost,
    payoutSnapshot,
    payoutChanged,
    logPayoutChange,
    penalty,
    charge,
  };
};
