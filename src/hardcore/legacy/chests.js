// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { rngesusEncounterChance, ITEMS } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const pick = (...args) => dependencies.pick(...args);

  function legendaryChance(state, treasure = false) {
    const unstable = state.modifiers?.unstable_rift || 0;
    return Math.min(
      treasure ? 0.7 : 0.35,
      treasure
        ? 0.35 + unstable * 0.05
        : 0.1 +
            Math.max(0, (state.pityLegendary || 0) - 9) * 0.02 +
            (state.luck || 0) * 0.002 +
            (state.legendaryFind || 0),
    );
  }

  function chooseRarity(state) {
    const chance = legendaryChance(state);
    const roll = randomFloat();
    if (roll < chance) return "legendary";
    if (roll < chance + 0.03) return "cursed";
    if (state.pityRare >= 5 || roll < chance + 0.25) return "rare";
    if (roll < chance + 0.65) return "common";
    if (roll < 0.95) return "empty";
    return "fake_legendary";
  }

  // Phân phối loại hòm theo đúng thứ tự roll của makeChest, để UI hiển thị tỷ lệ thật.
  function chestOdds(state, treasure = false) {
    const unstable = state.modifiers?.unstable_rift || 0;
    const mimicAllowed = state.pityRare < 5;
    const ancient = mimicAllowed ? Math.min(0.08, 0.03 + unstable * 0.01) : 0;
    const mimicUpTo = mimicAllowed
      ? Math.min(
          0.6,
          Math.min(0.3, 0.15 + unstable * 0.03) + (state.mimicChance || 0),
        )
      : 0;
    const mimic = Math.max(0, mimicUpTo - ancient);
    const rest = Math.max(0, 1 - ancient - mimic);
    const odds = {
      ancient_mimic: ancient,
      mimic,
      legendary: 0,
      cursed: 0,
      rare: 0,
      common: 0,
      empty: 0,
      fake_legendary: 0,
    };
    if (treasure) {
      const chance = legendaryChance(state, true);
      odds.legendary = rest * chance;
      odds.rare = rest * (1 - chance);
    } else {
      const chance = legendaryChance(state);
      const bands = [
        ["legendary", chance],
        ["cursed", chance + 0.03],
        ["rare", state.pityRare >= 5 ? 1 : chance + 0.25],
        ["common", chance + 0.65],
        ["empty", 0.95],
        ["fake_legendary", 1],
      ];
      let low = 0;
      for (const [kind, limit] of bands) {
        const high = Math.min(1, Math.max(low, limit));
        odds[kind] = rest * (high - low);
        low = high;
      }
    }
    odds.detect = Math.min(
      0.95,
      0.25 + state.luck * 0.03 + (state.mimicDetection || 0),
    );
    return odds;
  }

  function makeChest(state, treasure = false) {
    const unstable = state.modifiers?.unstable_rift || 0;
    const mimicRoll = randomFloat();
    const kind =
      state.pityRare < 5 && mimicRoll < Math.min(0.08, 0.03 + unstable * 0.01)
        ? "ancient_mimic"
        : state.pityRare < 5 &&
            mimicRoll <
              Math.min(
                0.6,
                Math.min(0.3, 0.15 + unstable * 0.03) +
                  (state.mimicChance || 0),
              )
          ? "mimic"
          : treasure
            ? randomFloat() < legendaryChance(state, true)
              ? "legendary"
              : "rare"
            : chooseRarity(state);
    const rarity = ITEMS[kind] ? kind : null;
    return {
      type: "chest",
      treasure,
      odds: chestOdds(state, treasure),
      kind,
      rarity,
      item: rarity ? pick(ITEMS[rarity]) : null,
      inspected: false,
      revealed: false,
      detectionSuccess:
        randomFloat() <
        Math.min(0.95, 0.25 + state.luck * 0.03 + (state.mimicDetection || 0)),
    };
  }

  function rollRngesus(state, rolls = {}) {
    const chance = rngesusEncounterChance(state);
    state.lastChaosChance = chance;
    state.lastChaosSpike = false;
    if (!chance) return false;
    const hit = (rolls.encounterRoll ?? randomFloat()) < chance;
    state.rngesusDry = hit ? 0 : (state.rngesusDry || 0) + 1;
    return hit;
  }
  return { legendaryChance, chooseRarity, chestOdds, makeChest, rollRngesus };
};
