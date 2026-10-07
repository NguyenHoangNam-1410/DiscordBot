"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    createHash,
    stats,
    mainStat,
    pick,
    randomItem,
    SHRINE_KINDS,
    SHRINE_TREASURE_WEIGHTS,
  } = dependencies;

  function shrineTreasureItem(rng) {
    const roll = rng() * 100;
    let boundary = 0;
    for (const [rarity, weight] of Object.entries(SHRINE_TREASURE_WEIGHTS)) {
      boundary += weight;
      if (roll < boundary) return randomItem(rarity, rng);
    }
    throw new Error("INVALID_SHRINE_ROLL");
  }

  function makeShrine(state, rng) {
    const shrine = {
      type: "shrine",
      name: "Shrine",
      kind: pick(SHRINE_KINDS, rng),
      armorStat: pick(stats.ATTRIBUTES, rng),
      powerStat: mainStat(state),
    };
    if (shrine.kind === "treasure") shrine.item = shrineTreasureItem(rng);
    return shrine;
  }

  function upgradeTreasureShrine(state) {
    const shrine = state.encounter;
    if (shrine?.type !== "shrine" || shrine.kind !== "blood") return;
    // A pending old Blood Shrine changes once, without consuming live RNG on readonly/resume.
    const seed = createHash("sha256")
      .update(
        JSON.stringify([
          "shrine-treasure-v1",
          state.fair,
          state.fairCounter,
          state.classKey,
          state.stake,
          state.floor,
          state.turn,
          shrine,
        ]),
      )
      .digest();
    let index = 0;
    shrine.kind = "treasure";
    shrine.item = shrineTreasureItem(
      () => seed.readUInt32BE(4 * index++) / 0x100000000,
    );
  }

  function shrineActive(state) {
    return (
      state.classShrine &&
      state.floor >= state.classShrine.from &&
      state.floor <= state.classShrine.until &&
      !state.classShrine.consumed
    );
  }
  return {
    shrineTreasureItem,
    makeShrine,
    upgradeTreasureShrine,
    shrineActive,
  };
};
