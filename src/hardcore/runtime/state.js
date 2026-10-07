// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    fairInt,
    hardcoreRepository,
    normalizeEquipment,
    clamp,
    potentialPayout,
    runDiamondReward,
    BOSS_MECHANICS,
    enemyDamageType,
    SURPRISE_EVENTS,
    ITEMS,
    hardcoreV2,
    isV2,
    MAX_FLOOR,
    COMPLETION_FLOOR,
    FALLBACK_ITEMS,
    fairStateContext,
    ITEM_LIMITS,
    getHardcoreByUser,
    TRAP_KILLERS,
  } = dependencies;
  const makeEnemy = (...args) => dependencies.makeEnemy(...args);
  const makeWrongPortal = (...args) => dependencies.makeWrongPortal(...args);
  const makeSurprise = (...args) => dependencies.makeSurprise(...args);

  function parseState(session) {
    const state = hardcoreRepository.parseState(session);
    if (isV2(state)) {
      state.godRngesusEnabled = true;
      return hardcoreV2.normalize(state);
    }
    state.escapeTokens = clamp(
      Math.floor(Number(state.escapeTokens) || 0),
      0,
      1,
    );
    state.modifiers ||= {};
    state.payoutSpent ||= 0;
    state.payoutServiceSpent ??= state.payoutSpent;
    state.completed ||= state.cleared >= COMPLETION_FLOOR;
    state.items = normalizeEquipment(state.items);
    for (const key of Object.keys(ITEM_LIMITS)) state[key] ??= 0;
    state.contract ??= null;
    state.classShrine ??= null;
    state.runDiamonds = runDiamondReward(state);
    if (
      state.encounter.kind === "adventurer" &&
      state.encounter.adventurerVersion === 2
    ) {
      // Preserve the saved success/failure; only upgrade a successful theft's reward.
      if (state.encounter.robItem) {
        const seed = state.fair?.serverSeed || session.id;
        state.encounter.robItem =
          ITEMS.legendary[
            fairInt(
              seed,
              `hardcore:adventurer-ssr:${state.floor}`,
              state.turn,
              ITEMS.legendary.length,
            )
          ];
      }
      state.encounter.adventurerVersion = 3;
    }
    if (
      state.encounter.type === "surprise" &&
      state.encounter.kind === "adventurer" &&
      state.encounter.adventurerVersion !== 3
    ) {
      // Convert the previous R/SR/UR rewards once using a stable seed; reopening cannot reroll.
      const seed = state.fair?.serverSeed || session.id;
      state.encounter = fairStateContext.run(
        {
          fair: { serverSeed: seed },
          fairCounter: fairInt(
            seed,
            `hardcore:adventurer-upgrade:${state.floor}`,
            state.turn,
            1_000_000,
          ),
        },
        () => makeSurprise(state, "adventurer"),
      );
    }
    for (const item of state.items) {
      item.definition ||=
        ITEMS[item.rarity]?.find((entry) => entry.name === item.name) ||
        FALLBACK_ITEMS[item.rarity]?.find((entry) => entry.name === item.name);
      item.cleansedLevels = Math.min(
        item.level,
        Math.max(0, item.cleansedLevels || 0),
      );
    }
    if (
      state.payoutPenaltyVersion !== 1 &&
      state.items.every(
        (item) => item.rarity !== "cursed" || item.definition?.bonusPenalty > 0,
      )
    ) {
      const curseFactor = state.items
        .filter((item) => item.rarity === "cursed")
        .reduce(
          (factor, item) =>
            factor *
            (1 - item.definition.bonusPenalty) **
              (item.level - item.cleansedLevels),
          state.portalPayoutFactor || 1,
        );
      if (curseFactor > 0 && state.payoutFactor <= curseFactor + 1e-12) {
        const previous = potentialPayout(state);
        state.payoutFactor = curseFactor;
        state.payoutSpent += Math.max(0, potentialPayout(state) - previous);
        state.payoutPenaltyVersion = 1;
      }
    }
    if (state.encounter.kind === "wrong_portal" && !state.encounter.portal) {
      // Upgrade old portals deterministically, including runs without a fairness seed.
      const seed = state.fair?.serverSeed || session.id;
      state.encounter = fairStateContext.run(
        { ...state, fair: { serverSeed: seed } },
        () =>
          makeWrongPortal(state, {
            goodRoll:
              fairInt(
                seed,
                `hardcore:portal-upgrade:${state.floor}:good`,
                state.turn,
                1_000_000,
              ) / 1_000_000,
            effectRoll:
              fairInt(
                seed,
                `hardcore:portal-upgrade:${state.floor}:effect`,
                state.turn,
                1_000_000,
              ) / 1_000_000,
            luckyBreakRoll:
              fairInt(
                seed,
                `hardcore:lucky-break-upgrade:${state.floor}`,
                state.turn,
                1_000_000,
              ) / 1_000_000,
          }),
      );
    }
    if (state.encounter.kind === "wrong_portal")
      state.encounter.portal.goodChance ??= 0.25;
    if (
      state.encounter.type === "trap" &&
      state.encounter.luckyBreakRoll === undefined
    ) {
      state.encounter.luckyBreakRoll =
        fairInt(
          state.fair?.serverSeed || session.id,
          `hardcore:lucky-break-upgrade:${state.floor}`,
          state.turn,
          1_000_000,
        ) / 1_000_000;
    }
    if (state.encounter.type === "combat") {
      state.encounter.mechanic ||= ["boss", "final_boss"].includes(
        state.encounter.rank,
      )
        ? BOSS_MECHANICS[state.encounter.name]
        : null;
      state.encounter.damageType = enemyDamageType(state.encounter);
      state.encounter.nextDamageType ||=
        state.encounter.damageType === "mixed"
          ? fairInt(
              state.fair?.serverSeed || session.id,
              `hardcore:intent-upgrade:${state.floor}`,
              state.turn,
              1_000_000,
            ) /
              1_000_000 <
            state.encounter.magicChance
            ? "magic"
            : "physical"
          : state.encounter.damageType;
    }
    if (state.encounter.type === "rngesus") {
      state.encounter.prayerChance ??= 0.3;
      state.encounter.prayerRarity ??= "legendary";
      state.encounter.prayerItemRoll ??=
        fairInt(
          state.fair?.serverSeed || session.id,
          `hardcore:prayer-item:${state.floor}`,
          state.turn,
          1_000_000,
        ) / 1_000_000;
    }
    if (
      state.encounter.type === "rngesus" &&
      state.encounter.fleeChance !== 0.75 &&
      state.fair?.serverSeed
    ) {
      // Deterministic upgrade for previously saved 65% encounters; reopening UI cannot reroll it.
      state.encounter.fleeRoll =
        fairInt(
          state.fair.serverSeed,
          `hardcore:flee-upgrade:${state.floor}`,
          state.turn,
          1_000_000,
        ) / 1_000_000;
      state.encounter.fleeChance = 0.75;
      state.encounter.fleeSuccess = state.encounter.fleeRoll < 0.75;
    }
    // Legacy runs may have cleared 999 through an ordinary room. Require the new final boss.
    if (state.cleared >= MAX_FLOOR && !state.finalBossDefeated) {
      state.floor = MAX_FLOOR;
      state.cleared = MAX_FLOOR - 1;
      state.phase = "encounter";
      state.encounter = fairStateContext.run(
        {
          ...state,
          fair: { serverSeed: state.fair?.serverSeed || session.id },
        },
        () => makeEnemy(MAX_FLOOR, "final_boss", null, state.modifiers),
      );
      state.lastLog =
        "Boss cuối Deimoss chặn lối ra. Hạ boss để công nhận tầng 999.";
    }
    return state;
  }

  function getHardcoreRun(guildId, userId) {
    const session = getHardcoreByUser(guildId, userId);
    return session ? { session, state: parseState(session) } : null;
  }

  function killerName(state, reason) {
    if (reason === "rngesus") return "RNGesus";
    const e = state.encounter;
    if (e?.type === "combat" && e.name) return e.name;
    if (e?.type === "shrine") return "Fake Shrine";
    return (
      TRAP_KILLERS[e?.kind] ||
      SURPRISE_EVENTS[e?.kind]?.name ||
      "Lời nguyền / hiệu ứng"
    );
  }
  return { parseState, getHardcoreRun, killerName };
};
