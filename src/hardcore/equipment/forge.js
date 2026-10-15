"use strict";
function prepare(state, targetId) {
  const main = ["sorceress", "necromancer", "druid", "venance"].includes(
    state.classKey,
  )
    ? "ene"
    : ["amazon", "assassin"].includes(state.classKey)
      ? "dex"
      : "str";
  return {
    version: 1,
    targetId,
    stage: "grind",
    boons: [
      { key: main, amount: 1 },
      { key: "vit", amount: 1 },
      {
        key: ["amazon", "assassin"].includes(state.classKey)
          ? "accuracy"
          : ["sorceress", "necromancer", "venance"].includes(state.classKey)
            ? "resistance"
            : "defense",
        amount: 1,
      },
    ],
  };
}
function choices(f) {
  return f.stage === "grind"
    ? [{ action: "forge_grind", label: "Nghiền 1 level · chọn boon" }]
    : f.boons.map((b, i) => ({
        action: "forge_boon_" + i,
        label: "+" + b.amount + " " + b.key.toUpperCase(),
      }));
}
module.exports = { prepare, choices };
