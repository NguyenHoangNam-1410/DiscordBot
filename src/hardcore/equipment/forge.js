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
function rewardLabel(b) {
  const label =
    { accuracy: "ACC", defense: "DEF", resistance: "RES" }[b.key] ||
    b.key.toUpperCase();
  return (
    "+" + b.amount + " " + label + (b.key === "resistance" ? " (điểm %)" : "")
  );
}
function rewardIcon(b) {
  const { E } = require("../shared/icons");
  return E[{ resistance: "res" }[b.key] || b.key] || E.shrine;
}
function choices(f) {
  return f.stage === "grind"
    ? [
        {
          action: "forge_grind",
          label: "Xác nhận nghiền 1 cấp",
          description: "Mất buff của cấp này, rồi chọn một phần thưởng chỉ số.",
        },
      ]
    : f.boons.map((b, i) => ({
        action: "forge_boon_" + i,
        label: "Nhận " + rewardLabel(b),
        description: "Cộng chỉ số trong run; không dùng hoặc nhận vé.",
      }));
}
module.exports = { prepare, choices, rewardLabel, rewardIcon };
