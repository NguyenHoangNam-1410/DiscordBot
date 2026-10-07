"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { E, world, clamp, randomItem } = dependencies;
  const receiveItem = (...args) => dependencies.receiveItem(...args);
  const finishEventResult = (...args) =>
    dependencies.finishEventResult(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);

  function legendaryChance(state) {
    return clamp(
      0.1 +
        Math.max(0, state.pityLegendary - 9) * 0.02 +
        state.luck * 0.002 +
        state.legendaryFind,
      0.1,
      0.35,
    );
  }

  function chestOdds(state, treasure = false) {
    const guaranteed = state.pityRare >= 5;
    const unstable = state.modifiers.unstable_rift || 0;
    const ancient = guaranteed ? 0 : clamp(0.03 + unstable * 0.01, 0, 0.15);
    const mimic = guaranteed
      ? 0
      : clamp(0.12 + unstable * 0.03 + state.mimicChance, 0, 0.65);
    let loot;
    if (treasure) {
      const ssr = Math.min(0.7, 0.35 + unstable * 0.05);
      loot = { legendary: ssr, rare: 1 - ssr };
    } else {
      const ssr = legendaryChance(state);
      const thresholds = [
        0,
        ssr,
        ssr + 0.03,
        ssr + 0.25,
        ssr + 0.65,
        ssr + 0.85,
        1,
      ].map((n) => clamp(n, 0, 1));
      loot = Object.fromEntries(
        ["legendary", "cursed", "rare", "common", "empty", "fake"].map(
          (key, i) => [key, Math.max(0, thresholds[i + 1] - thresholds[i])],
        ),
      );
      if (guaranteed) {
        loot.rare += loot.common + loot.empty + loot.fake;
        loot.common = loot.empty = loot.fake = 0;
      }
    }
    const safe = 1 - ancient - mimic;
    return {
      ancient_mimic: ancient,
      mimic,
      ...Object.fromEntries(
        Object.entries(loot).map(([key, chance]) => [key, chance * safe]),
      ),
    };
  }

  function makeChest(state, rng, treasure = false) {
    const guaranteed = state.pityRare >= 5;
    const unstable = state.modifiers.unstable_rift || 0;
    const ancient = clamp(0.03 + unstable * 0.01, 0, 0.15),
      mimic = clamp(0.12 + unstable * 0.03 + state.mimicChance, 0, 0.65);
    const mimicRoll = rng();
    let kind =
      !guaranteed && mimicRoll < ancient
        ? "ancient_mimic"
        : !guaranteed && mimicRoll < ancient + mimic
          ? "mimic"
          : "safe";
    let rarity = null;
    const lootRoll = rng();
    if (treasure)
      rarity =
        lootRoll < Math.min(0.7, 0.35 + unstable * 0.05) ? "legendary" : "rare";
    else {
      const ssr = legendaryChance(state);
      if (lootRoll < ssr) rarity = "legendary";
      else if (lootRoll < ssr + 0.03) rarity = "cursed";
      else if (lootRoll < ssr + 0.25) rarity = "rare";
      else if (lootRoll < ssr + 0.65) rarity = "common";
      else if (lootRoll < ssr + 0.85) kind = kind === "safe" ? "empty" : kind;
      else kind = kind === "safe" ? "fake" : kind;
      if ((guaranteed && !rarity) || (guaranteed && rarity === "common")) {
        rarity = "rare";
        kind = "safe";
      }
    }
    return {
      type: "chest",
      name: treasure ? "Treasure Chest" : "Hòm bí ẩn",
      kind,
      rarity,
      guaranteed,
      odds: chestOdds(state, treasure),
      item: rarity ? randomItem(rarity, rng) : null,
      inspected: false,
      revealed: false,
      detectionChance: Math.min(
        0.95,
        0.25 + state.luck * 0.03 + state.mimicDetection,
      ),
      detectionSuccess:
        rng() < Math.min(0.95, 0.25 + state.luck * 0.03 + state.mimicDetection),
      mimic: world.makeEnemy(
        state,
        kind === "ancient_mimic" ? "ancient_mimic" : "mimic",
        null,
        rng,
      ),
    };
  }

  function openChest(state, session, chest, rng, prefix = "") {
    if (["mimic", "ancient_mimic"].includes(chest.kind)) {
      state.pityRare++;
      state.pityLegendary++;
      state.encounter = chest.mimic;
      state.lastLog = `${prefix}${chest.kind === "ancient_mimic" ? "Ancient Mimic" : "Mimic"} xuất hiện!`;
      finishEventResult(state);
      return;
    }
    const rarity = chest.kind === "safe" ? chest.rarity : null;
    state.pityRare = ["rare", "legendary", "cursed"].includes(rarity)
      ? 0
      : state.pityRare + 1;
    state.pityLegendary = rarity === "legendary" ? 0 : state.pityLegendary + 1;
    if (rarity) {
      receiveItem(state, chest.item);
      state.lastLog = `${prefix}${E.chest} Đã mở rương và nhận trang bị.`;
    } else
      state.lastLog = `${prefix}${chest.kind === "fake" ? "SSR giả: không có hiệu ứng." : "Hòm rỗng."}`;
    completeFloor(state, session, rng, 0);
  }
  return { legendaryChance, chestOdds, makeChest, openChest };
};
