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
      defenseReduction: ["defense"],
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
    require("../beta").validate(state);
    require("../characters/souls").validate(state);
    require("../characters/venance").validate(state);
    require("../events/explorationMarks").normalize(state);
    const rules = require("../equipment/rules");
    const ITEMS = rules.enabled(state)
      ? require("../item").ITEMS_V3
      : require("../item").LEGACY_ITEMS;
    if (state.equipmentRulesVersion != null && !rules.enabled(state))
      throw Error("UNSUPPORTED_EQUIPMENT_RULES");
    if (rules.enabled(state)) {
      if (
        state.catalogVersion !== 3 ||
        state.affinityPity?.version !== 1 ||
        !Number.isInteger(state.affinityPity.missStreak) ||
        state.affinityPity.missStreak < 0 ||
        state.affinityPity.missStreak > 3
      )
        throw Error("INVALID_AFFINITY_PITY");
      for (const i of state.items || [])
        if (
          !Number.isSafeInteger(i.level) ||
          i.level < 1 ||
          !Number.isSafeInteger(i.cleansedLevels || 0) ||
          (i.cleansedLevels || 0) < 0 ||
          (i.cleansedLevels || 0) > i.level
        )
          throw Error("INVALID_ITEM_LEVEL");
    }
    if (
      (state.gameplayVersion === 3) !==
      ["3.0.0", "3.1.0", "3.2.0"].includes(state.releaseVersion)
    )
      throw new Error("UNSUPPORTED_HARDCORE_VERSION");
    if (
      !["2.0.0", "2.0.1", "3.0.0", "3.1.0", "3.2.0"].includes(
        state.releaseVersion,
      )
    )
      throw new Error("UNSUPPORTED_HARDCORE_VERSION");
    require("../rift").normalize(state);
    require("../innate").validate(state);
    const awakening = require("../awakening");
    if (
      state.classAwakeningVersion != null &&
      (state.classAwakeningVersion !== 1 || state.gameplayVersion !== 3)
    )
      throw Error("UNSUPPORTED_CLASS_AWAKENING");
    if (state.classAwakening) {
      const a = state.classAwakening;
      if (
        !awakening.active(state) ||
        a.artifact !== awakening.ARTIFACTS[state.classKey][0] ||
        a.awakenedFloor !== 100
      )
        throw Error("INVALID_CLASS_AWAKENING");
      for (const [k, max] of [
        ["focus", 2],
        ["shadow", 2],
        ["echo", 1],
        ["totems", awakening.tuning(state).totems - 1],
        ["bark", Number.MAX_SAFE_INTEGER],
      ])
        if (!Number.isSafeInteger(a[k]) || a[k] < 0 || a[k] > max)
          throw Error("INVALID_AWAKENING_RESOURCE");
      // Paid Skill MP can be fractional under item curses. Keep the existing
      // progress cap while validating the other Awakening counters as integers.
      if (
        !Number.isFinite(a.echoProgress) ||
        a.echoProgress < 0 ||
        a.echoProgress > 2
      )
        throw Error("INVALID_AWAKENING_RESOURCE");
      a.bark = Math.min(
        a.bark,
        Math.floor(state.maxHp * awakening.tuning(state).barkCap),
      );
      const c = state.encounter?.awakeningCombat;
      if (
        c &&
        (c.version !== 1 ||
          !Number.isInteger(c.fury) ||
          c.fury < 0 ||
          c.fury > 3 ||
          !Number.isSafeInteger(c.barrier) ||
          c.barrier < 0 ||
          !Number.isInteger(c.ground) ||
          c.ground < 0 ||
          c.ground > 2 ||
          !Array.isArray(c.crossed) ||
          c.crossed.some((v) => ![0.75, 0.5, 0.25].includes(v)) ||
          new Set(c.crossed).size !== c.crossed.length)
      )
        throw Error("INVALID_AWAKENING_COMBAT");
    }

    if (
      [2, 3].includes(state.gameplayVersion) &&
      !state.mode?.startsWith("tower") &&
      !state.towerChallengeId
    )
      state.bossRosterVersion ??= 1;
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
    bosses.validate(
      state,
      state.encounter?.type === "boss_gate"
        ? state.encounter.enemy
        : state.encounter,
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
      !rules.enabled(state) &&
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
