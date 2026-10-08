"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    E,
    memoryIcon,
    world,
    bosses,
    ITEMS,
    runDiamondReward,
    recompute,
    applySource,
    RESULT_STATS,
    MERCHANT_PRICES,
    DIAMOND_PRICES,
  } = dependencies;
  const payout = (...args) => dependencies.payout(...args);
  const heal = (...args) => dependencies.heal(...args);
  const completeFloor = (...args) => dependencies.completeFloor(...args);
  const upgradeCoinShopPrices = (...args) =>
    dependencies.upgradeCoinShopPrices(...args);
  const upgradeTreasureShrine = (...args) =>
    dependencies.upgradeTreasureShrine(...args);

  function effectStatKeys(effects) {
    const aliases = {
      physical: ["damageMin", "damageMax"],
      spell: ["spellMin", "spellMax"],
      maxMana: ["maxMana"],
      potionPower: ["potionRate"],
      heal: ["hp"],
      defenseSet: ["defense"],
    };
    return [
      ...new Set(
        Object.keys(effects || {}).flatMap(
          (key) => aliases[key] || (RESULT_STATS.includes(key) ? [key] : []),
        ),
      ),
    ];
  }

  function markDirect(state, keys) {
    if (state.pendingEventResult)
      state.pendingEventResult.directKeys = [
        ...new Set([...(state.pendingEventResult.directKeys || []), ...keys]),
      ];
  }

  function addSource(state, effects, source = "event") {
    markDirect(state, effectStatKeys(effects));
    return applySource(state, effects, source);
  }

  function rngesusFleeChance(state) {
    const count = Number.isSafeInteger(state.rngesusFleeCount)
      ? Math.max(0, state.rngesusFleeCount)
      : 0;
    return (100 - Math.min(5, count) * 5) / 100;
  }

  function rngesusPrayerChance(state) {
    return state.prayerBoost ? 0.6 : 0.3;
  }

  function expireAdventurer(state) {
    const protector = state.adventurerRescue;
    if (
      protector &&
      (state.floor < protector.from || state.floor > protector.until)
    )
      delete state.adventurerRescue;
  }

  function reviveAfterDeath(state, session, rng, reason) {
    if (!["death", "rngesus"].includes(reason)) return false;
    expireAdventurer(state);
    const combat = state.encounter?.type === "combat";
    const adventurer =
      state.adventurerRescue && (combat || reason === "rngesus");
    if (!adventurer && !(state.reviveTickets > 0)) return false;
    if (adventurer) delete state.adventurerRescue;
    else state.reviveTickets--;
    state.hp = Math.max(1, Math.ceil(state.maxHp * 0.5));
    delete state.lastDeathCause;
    state.lastLog += adventurer
      ? "\n" +
        memoryIcon("rescue") +
        ` Lost Adventurer trở lại cứu bạn! Đã dùng bảo hộ, giữ nguyên ${E.reviveTicket} Vé hồi sinh.`
      : `\n${E.reviveTicket} **Vé hồi sinh −1**: tự dùng để cứu bạn.`;
    if (!combat || reason === "rngesus") completeFloor(state, session, rng, 0);
    // Set directly: checkpoint healing and regeneration must not alter the promised 50%.
    if (state.encounter.type !== "god_rngesus")
      state.hp = Math.max(1, Math.ceil(state.maxHp * 0.5));
    state.lastLog += `\n❤️ Hồi sinh với **${state.hp}/${state.maxHp} HP**; ${combat ? "tiếp tục đánh quái tại tầng này" : "đi sang tầng kế tiếp"}.`;
    return true;
  }

  function normalize(state) {
    if (!["2.0.0", "2.0.1"].includes(state.releaseVersion))
      throw new Error("UNSUPPORTED_HARDCORE_VERSION");
    if (
      state.gameplayVersion === 2 &&
      !state.mode?.startsWith("tower") &&
      !state.towerChallengeId
    )
      state.bossRosterVersion ??= bosses.VERSION;
    // Older runs downgraded fully cleansed UR equipment; rarity belongs to its design.
    for (const item of [
      ...(state.items || []),
      ...(state.lastReceivedItems || []),
    ])
      if (item.definition?.rarity === "cursed") item.rarity = "cursed";
    if (typeof state.lastLog === "string")
      state.lastLog = state.lastLog.replace(
        "giải toàn bộ curse; giữ level và buff, chuyển SSR.",
        "giải toàn bộ lời nguyền; giữ UR, level, buff và nội tại.",
      );
    recompute(state);
    state.mana = Math.min(state.mana, bosses.effectiveMaxMana(state));
    // Convert historical event multipliers into a fixed loss without changing cashout.
    if (state.eventPayoutFactor >= 0 && state.eventPayoutFactor < 1) {
      const before = payout(state);
      state.eventPayoutFactor = 1;
      recompute(state);
      const loss = Math.max(0, payout(state) - before);
      state.payoutSpent = (state.payoutSpent || 0) + loss;
      state.payoutEventSpent = (state.payoutEventSpent || 0) + loss;
    }
    state.prayerBoost = Boolean(state.prayerBoost);
    state.reviveTickets = state.reviveTickets === 1 ? 1 : 0;
    expireAdventurer(state);
    upgradeTreasureShrine(state);
    const current = state.encounter;
    if (
      current?.type === "rngesus" &&
      current.encounterChance == null &&
      Number.isFinite(state.lastChaosChance) &&
      state.lastChaosChance > 0
    )
      current.encounterChance = state.lastChaosChance;
    // Reclassify saved special Mimics without rerolling stats, HP or event outcomes.
    for (const enemy of [current, current?.mimic, current?.enemy])
      world.normalizeMimicEnemy(enemy);
    // Apply the robbery rule to saved consequences without rerolling their locked kind.
    for (const debt of state.debts || [])
      if (debt.action === "event_rob") debt.good = false;
    if (current?.type === "memory" && current.debt?.action === "event_rob")
      current.debt.good = false;
    if (
      current?.type === "surprise" &&
      current.kind === "adventurer" &&
      current.robItem?.rarity === "common"
    ) {
      const index = Math.max(
        0,
        ITEMS.common.findIndex((item) => item.id === current.robItem.id),
      );
      current.robItem = structuredClone(
        ITEMS.legendary[index % ITEMS.legendary.length],
      );
    }
    if (
      current?.type === "surprise" &&
      ["merchant", "diamond_shop"].includes(current.kind) &&
      current.priceVersion !== 2
    ) {
      for (const offer of current.offers || []) {
        if (current.kind === "diamond_shop")
          offer.price = DIAMOND_PRICES[offer.item.rarity];
        else {
          offer.price = Math.max(1, Math.ceil(offer.price * 0.5));
          offer.fraction = MERCHANT_PRICES[offer.key];
        }
      }
      current.priceVersion = 2;
    }
    upgradeCoinShopPrices(state, current);
    state.rngesusFleeCount = Number.isSafeInteger(state.rngesusFleeCount)
      ? Math.max(0, state.rngesusFleeCount)
      : 0;
    // Existing runs did not record flee attempts; start their new counter at zero.
    if (
      state.encounter?.type === "rngesus" &&
      state.encounter.fleeChance == null
    ) {
      state.encounter.fleeChance = rngesusFleeChance(state);
      if (state.encounter.fleeChance === 1) state.encounter.fleeSuccess = true;
    }
    if (
      state.encounter?.type === "rngesus" &&
      state.encounter.prayerItem?.rarity !== "cursed"
    ) {
      // Upgrade a pending old reward deterministically so reopening cannot reroll it.
      const index = Math.max(
        0,
        ITEMS.legendary.findIndex(
          (item) => item.id === state.encounter.prayerItem?.id,
        ),
      );
      state.encounter.prayerItem = structuredClone(
        ITEMS.cursed[index % ITEMS.cursed.length],
      );
    }
    state.runDiamonds = runDiamondReward(state);
    return state;
  }
  return {
    effectStatKeys,
    markDirect,
    addSource,
    rngesusFleeChance,
    rngesusPrayerChance,
    expireAdventurer,
    reviveAfterDeath,
    normalize,
  };
};
