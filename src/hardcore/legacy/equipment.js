// Composed once by ../runtime/index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { normalizeEquipment, clamp, itemEffects, itemCurse, ITEM_LIMITS } =
    dependencies;

  function grantEscapeTickets(state, amount) {
    const held = clamp(Math.floor(Number(state.escapeTokens) || 0), 0, 1);
    const received = Math.max(0, Math.floor(Number(amount) || 0));
    state.escapeTokens = Math.min(1, held + received);
    state.lastDiscardedEscapeTokens =
      (state.lastDiscardedEscapeTokens || 0) + Math.max(0, held + received - 1);
  }

  function applyItem(state, item, rarity = "common") {
    if (!item) return null;
    rarity = item.rarity || rarity;
    state.items = normalizeEquipment(state.items);
    const buff = { ...itemEffects(item) };
    const curse = rarity === "cursed" ? itemCurse(item) : {};
    if (!item.effects && rarity === "cursed")
      for (const key of Object.keys(curse)) delete buff[key];
    const buffDelta = applyEquipmentEffects(state, buff);
    const curseDelta = applyEquipmentEffects(state, curse);
    let equipment = state.items.find(
      (entry) =>
        entry.name === item.name &&
        entry.rarity === rarity &&
        (entry.definition?.base || "") === (item.base || ""),
    );
    if (equipment) {
      equipment.level += 1;
      equipment.text = item.text;
    } else {
      equipment = { name: item.name, rarity, text: item.text, level: 1 };
      state.items.push(equipment);
    }
    equipment.definition = { ...item };
    equipment.levelEffects ||= [];
    equipment.levelEffects.push({
      buff: buffDelta,
      curse: curseDelta,
      curseFactor: curse.bonusPenalty ? 1 - curse.bonusPenalty : 1,
      cleansed: false,
    });
    return equipment;
  }

  function applyEquipmentEffects(state, effects) {
    const keys = [
      "damageMin",
      "damageMax",
      "hp",
      "energy",
      ...Object.keys(ITEM_LIMITS),
    ];
    const before = Object.fromEntries(
      keys.map((key) => [key, Number(state[key]) || 0]),
    );
    if (effects.attack) {
      state.damageMin = Math.max(1, state.damageMin + effects.attack);
      state.damageMax = Math.max(
        state.damageMin,
        state.damageMax + effects.attack,
      );
    }
    for (const [key, limits] of Object.entries(ITEM_LIMITS))
      if (effects[key])
        state[key] = +clamp(
          (state[key] || 0) + effects[key],
          ...limits,
        ).toFixed(8);
    if (effects.defenseSet !== undefined)
      state.defense = Math.max(0, effects.defenseSet);
    state.hp = Math.min(state.hp, state.maxHp);
    state.energy = Math.min(state.energy, state.maxEnergy);
    if (effects.heal)
      state.hp = Math.min(state.maxHp, Math.max(1, state.hp + effects.heal));
    if (effects.potions)
      state.potions = clamp(state.potions + effects.potions, 0, 5);
    if (effects.escapeTokens) grantEscapeTickets(state, effects.escapeTokens);
    if (effects.bonusPenalty) state.payoutFactor *= 1 - effects.bonusPenalty;
    return Object.fromEntries(
      keys
        .map((key) => [
          key,
          +((Number(state[key]) || 0) - before[key]).toFixed(8),
        ])
        .filter(([, delta]) => delta),
    );
  }

  function reverseEquipmentDelta(state, delta, restoreHp = false) {
    for (const [key, amount] of Object.entries(delta || {})) {
      if (key === "hp" || key === "energy") continue;
      const limits = ITEM_LIMITS[key] || [1, Infinity];
      state[key] = +clamp((state[key] || 0) - amount, ...limits).toFixed(8);
    }
    state.damageMax = Math.max(state.damageMin, state.damageMax);
    state.hp = Math.min(
      state.maxHp,
      restoreHp ? state.hp - (delta?.hp || 0) : state.hp,
    );
    state.energy = Math.min(
      state.maxEnergy,
      restoreHp ? state.energy - (delta?.energy || 0) : state.energy,
    );
  }

  function cleanseItem(state, target) {
    const record = target.levelEffects?.find((entry) => !entry.cleansed);
    if (record) {
      reverseEquipmentDelta(state, record.curse, true);
      state.payoutFactor = Math.min(1, state.payoutFactor / record.curseFactor);
      record.cleansed = true;
    } else {
      // Older saved items retain their definitions; no catalog replacement is applied.
      const curse = itemCurse(target.definition);
      const inverse = Object.fromEntries(
        Object.entries(curse)
          .filter(([key]) => !["defenseSet", "bonusPenalty"].includes(key))
          .map(([key, value]) => [key, -value]),
      );
      applyEquipmentEffects(state, inverse);
      if (curse.bonusPenalty)
        state.payoutFactor = Math.min(
          1,
          state.payoutFactor / (1 - curse.bonusPenalty),
        );
    }
    target.cleansedLevels = (target.cleansedLevels || 0) + 1;
  }

  function grindItem(state, target) {
    const record = target.levelEffects?.pop();
    if (record) {
      if (!record.cleansed) {
        reverseEquipmentDelta(state, record.curse, true);
        state.payoutFactor = Math.min(
          1,
          state.payoutFactor / record.curseFactor,
        );
      } else
        target.cleansedLevels = Math.max(0, (target.cleansedLevels || 0) - 1);
      reverseEquipmentDelta(state, record.buff);
    } else {
      if (
        target.rarity === "cursed" &&
        target.level > (target.cleansedLevels || 0)
      )
        cleanseItem(state, target);
      const effects = { ...itemEffects(target.definition) };
      for (const key of [
        "heal",
        "potions",
        "escapeTokens",
        "bonusPenalty",
        "defenseSet",
      ])
        delete effects[key];
      if (!target.definition.effects && target.rarity === "cursed")
        for (const key of Object.keys(itemCurse(target.definition)))
          delete effects[key];
      applyEquipmentEffects(
        state,
        Object.fromEntries(
          Object.entries(effects).map(([key, value]) => [key, -value]),
        ),
      );
      target.cleansedLevels = Math.max(0, (target.cleansedLevels || 0) - 1);
    }
    target.level -= 1;
    if (target.level <= 0)
      state.items = state.items.filter((item) => item !== target);
  }

  function updatePity(state, rarity) {
    if (["legendary", "cursed"].includes(rarity)) state.pityLegendary = 0;
    else state.pityLegendary += 1;
    if (["rare", "legendary", "cursed"].includes(rarity)) state.pityRare = 0;
    else state.pityRare += 1;
  }
  return {
    grantEscapeTickets,
    applyItem,
    applyEquipmentEffects,
    reverseEquipmentDelta,
    cleanseItem,
    grindItem,
    updatePity,
  };
};
