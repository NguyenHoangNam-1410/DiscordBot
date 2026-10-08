"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    memories,
    bosses,
    E,
    paradox,
    CONSUMABLE_ITEMS,
    clamp,
    recompute,
    statSnapshot,
  } = dependencies;
  const effectStatKeys = (...args) => dependencies.effectStatKeys(...args);
  const markDirect = (...args) => dependencies.markDirect(...args);
  const addSource = (...args) => dependencies.addSource(...args);

  function healingAmount(state, amount) {
    return Math.max(
      0,
      Math.floor(amount * (1 - (state.healingReduction || 0))),
    );
  }

  function heal(state, amount, { checkpoint = false } = {}) {
    if (!checkpoint) markDirect(state, ["hp"]);
    const actual = Math.max(
      0,
      Math.min(
        state.maxHp - state.hp,
        checkpoint ? Math.floor(amount) : healingAmount(state, amount),
      ),
    );
    state.hp += actual;
    if (!checkpoint && state.paradox?.kind === "blood")
      state.paradox.bloodFactor = clamp(
        state.paradox.bloodFactor - actual / state.maxHp,
        -0.5,
        0.5,
      );
    return actual;
  }

  // Event recovery is separate from potions, skills, item passives and checkpoints.
  function healEvent(state, amount, { manaRate = amount / state.maxHp } = {}) {
    const hpBefore = state.hp,
      manaBefore = state.mana;
    const hp = heal(state, amount);
    let mp = 0;
    if (
      state.gameplayVersion === 2 &&
      !state.mode?.startsWith("tower") &&
      !state.towerChallengeId
    ) {
      const maximum = bosses.effectiveMaxMana(state);
      const fraction = maximum * clamp(manaRate, 0, 1);
      // Avoid a floating-point tail turning an exact 1 MP into 2 MP.
      const requested = Math.ceil(
        fraction - Number.EPSILON * Math.max(1, fraction),
      );
      mp = Math.max(0, Math.min(maximum - state.mana, requested));
      state.mana += mp;
      markDirect(state, ["mana"]);
    }
    return {
      hp,
      mp,
      log:
        E.hp +
        " HP: " +
        hpBefore +
        " → **" +
        state.hp +
        "** (+" +
        hp +
        ") · " +
        E.mana +
        " MP: " +
        manaBefore +
        " → **" +
        state.mana +
        "** (+" +
        mp +
        ").",
    };
  }

  function hurt(state, amount, hostile = true, nonlethal = false) {
    markDirect(state, ["hp"]);
    const actual = Math.max(
      0,
      Math.min(state.hp - (nonlethal ? 1 : 0), Math.floor(amount)),
    );
    state.hp -= actual;
    if (hostile && state.paradox?.kind === "blood")
      state.paradox.bloodFactor = clamp(
        state.paradox.bloodFactor + actual / state.maxHp,
        -0.5,
        0.5,
      );
    return actual;
  }

  function receiveItem(state, definition, levels = 1, cleansedLevels = 0) {
    if (
      !definition ||
      definition.catalogVersion !== 2 ||
      !Number.isSafeInteger(levels) ||
      levels < 1
    )
      throw new Error("INVALID_HARDCORE_ITEM");
    const before = statSnapshot(state);
    if (definition.category === "consumable") {
      const consumable = CONSUMABLE_ITEMS[definition.id];
      if (!consumable) throw new Error("INVALID_HARDCORE_ITEM");
      const key =
        definition.id === "survival_escape" ? "escapeTokens" : "reviveTickets";
      const previous = state[key] || 0;
      state[key] = Math.min(1, previous + levels);
      const gained = state[key] - previous;
      if (state.lastReceivedItems)
        state.lastReceivedItems.push({
          name: consumable.name,
          rarity: consumable.rarity,
          consumable: true,
          quantity: gained,
          discarded: levels - gained,
          definition: structuredClone(consumable),
          before,
          after: statSnapshot(state),
          directKeys: [key],
          sourceName:
            state.pendingEventResult?.name ||
            state.encounter?.name ||
            "vật phẩm",
          inEventResult: Boolean(state.pendingEventResult),
        });
      return {
        name: consumable.name,
        rarity: consumable.rarity,
        consumable: true,
      };
    }
    const index = state.items.findIndex(
      (x) => x.definition.id === definition.id,
    );
    let item = state.items[index];
    if (!item) {
      item = {
        name: definition.name,
        rarity: definition.rarity,
        definition: structuredClone(definition),
        level: 0,
        cleansedLevels: 0,
      };
    } else {
      state.items.splice(index, 1);
    }
    // A new drop or another level of existing equipment is the most recent receipt.
    state.items.unshift(item);
    // Existing runs keep the saved design when receiving another level of the same ID.
    definition = item.definition;
    item.level += levels;
    item.cleansedLevels += Math.min(levels, Math.max(0, cleansedLevels));
    item.rarity = definition.rarity;
    recompute(state);
    for (let i = 0; i < levels; i++) {
      const e = definition.effects;
      if (e.heal) heal(state, e.heal);
      if (e.potions)
        state.potions = Math.min(state.maxPotions, state.potions + e.potions);
      if (e.escapeTokens) {
        const discarded = Math.max(0, state.escapeTokens + e.escapeTokens - 1);
        state.escapeTokens = Math.min(1, state.escapeTokens + e.escapeTokens);
        if (discarded)
          state.discardedTicketsThisTurn =
            (state.discardedTicketsThisTurn || 0) + discarded;
      }
    }
    if (state.lastReceivedItems)
      state.lastReceivedItems.push({
        name: item.name,
        rarity: item.rarity,
        level: item.level,
        levels,
        definition: structuredClone(definition),
        curseLevels: Math.max(0, levels - cleansedLevels),
        before,
        after: statSnapshot(state),
        directKeys: effectStatKeys({
          ...definition.effects,
          ...(levels > cleansedLevels ? definition.curse?.effects : {}),
        }),
        sourceName:
          state.pendingEventResult?.name || state.encounter?.name || "trang bị",
        inEventResult: Boolean(state.pendingEventResult),
      });
    return item;
  }

  function receiveSnapshot(state, snapshot) {
    return receiveItem(
      state,
      snapshot.definition,
      snapshot.level,
      snapshot.cleansedLevels || 0,
    );
  }

  function cleanse(state, item) {
    if (!item || item.level <= (item.cleansedLevels || 0))
      throw new Error("NO_CURSE");
    markDirect(state, effectStatKeys(item.definition.curse?.effects));
    item.cleansedLevels = item.level;
    item.rarity = item.definition.rarity;
    recompute(state);
  }

  function grind(state, item) {
    if (!item) throw new Error("NO_FORGE_ITEM");
    if (item.level > (item.cleansedLevels || 0))
      markDirect(state, effectStatKeys(item.definition.curse?.effects));
    const effects = { ...item.definition.effects };
    for (const key of [
      "heal",
      "potions",
      "escapeTokens",
      "bonusPenalty",
      "defenseSet",
    ])
      delete effects[key];
    item.level--;
    item.cleansedLevels = Math.min(item.level, item.cleansedLevels || 0);
    if (item.level === 0) state.items = state.items.filter((x) => x !== item);
    addSource(state, effects, "absorbed");
  }

  function remember(state, action, rng, data = {}) {
    return memories.queue(state, action, rng, data);
  }

  function alive(state) {
    return state.hp > 0;
  }
  return {
    healingAmount,
    heal,
    healEvent,
    hurt,
    receiveItem,
    receiveSnapshot,
    cleanse,
    grind,
    remember,
    alive,
  };
};
