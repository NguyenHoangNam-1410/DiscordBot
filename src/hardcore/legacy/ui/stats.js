// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    formatCoins,
    itemEffects,
    itemCurse,
    normalizeEquipment,
    STAT_EMOJI,
  } = dependencies;
  const healthBar = (...args) => dependencies.healthBar(...args);
  const signed = (...args) => dependencies.signed(...args);
  const change = (...args) => dependencies.change(...args);

  function statLine(state, showChanges = true) {
    const hpChange = state.lastStatChanges?.hp || 0;
    const maxHpChange = state.lastStatChanges?.maxHp || 0;
    const hpDelta =
      showChanges && (hpChange || maxHpChange)
        ? ` (${signed(hpChange)}/${signed(maxHpChange)})`
        : "";
    const minChange = state.lastStatChanges?.damageMin || 0;
    const maxChange = state.lastStatChanges?.damageMax || 0;
    const damageDelta =
      showChanges && (minChange || maxChange)
        ? ` (${minChange === maxChange ? signed(minChange) : `${signed(minChange)}/${signed(maxChange)}`})`
        : "";
    const delta = (key, percent = false) =>
      showChanges ? change(state, key, percent) : "";
    return [
      `${healthBar(state.hp, state.maxHp)}${hpDelta}`,
      `${STAT_EMOJI.energy} ENE **${state.energy}/${state.maxEnergy}**${delta("energy")} · ${STAT_EMOJI.potions} POT ${state.potions} · ${STAT_EMOJI.tickets} Vé thoát ${state.escapeTokens}`,
      `${STAT_EMOJI.attack} ATK ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}${damageDelta} · ${STAT_EMOJI.defense} DEF ${formatCoins(state.defense)}${delta("defense")} · ${STAT_EMOJI.resistance} RES ${state.resistance}%${delta("resistance")}`,
      ...(showChanges
        ? [
            `${STAT_EMOJI.accuracy} ACC ${state.accuracy} · ${STAT_EMOJI.evasion} EVA ${state.evasion}${delta("evasion")}\n${STAT_EMOJI.crit} CRIT ${Math.round(state.critChance * 100)}%${delta("critChance", true)} · ${STAT_EMOJI.luck} LUCK ${state.luck}${delta("luck")}`,
          ]
        : [`${STAT_EMOJI.luck} LUCK **${state.luck || 0}**`]),
    ].join("\n");
  }

  function ownedEquipment(state, itemCatalog) {
    return normalizeEquipment(state.items).map((item) => ({
      ...item,
      definition:
        item.definition ||
        (itemCatalog[item.rarity] || []).find(
          (entry) => entry.name === item.name,
        ),
    }));
  }

  function equipmentSummary(state, itemCatalog) {
    const items = ownedEquipment(state, itemCatalog);
    if (!items.length) return "Chưa có trang bị.";
    const totals = {};
    for (const item of items) {
      const buffs = { ...itemEffects(item.definition) };
      const curses = item.rarity === "cursed" ? itemCurse(item.definition) : {};
      if (!item.definition?.effects && item.rarity === "cursed")
        for (const key of Object.keys(curses)) delete buffs[key];
      for (const [key, value] of Object.entries(buffs))
        if (typeof value === "number")
          totals[key] = (totals[key] || 0) + value * item.level;
      for (const [key, value] of Object.entries(curses))
        totals[key] =
          (totals[key] || 0) +
          value * Math.max(0, item.level - (item.cleansedLevels || 0));
    }
    const effects = [
      ["attack", `${STAT_EMOJI.attack} ATK`],
      ["defense", `${STAT_EMOJI.defense} DEF`],
      ["maxHp", `${STAT_EMOJI.hp} MAX HP`],
      ["resistance", `${STAT_EMOJI.resistance} RES`],
      ["critChance", `${STAT_EMOJI.crit} CRIT`],
      ["luck", `${STAT_EMOJI.luck} LUCK`],
      ["accuracy", `${STAT_EMOJI.accuracy} ACC`],
      ["evasion", `${STAT_EMOJI.evasion} EVA`],
      ["maxEnergy", `${STAT_EMOJI.energy} MAX ENE`],
      ["potionPower", "Hồi bình"],
      ["bossDamage", `${STAT_EMOJI.attack} DMG lên Boss`],
      ["eliteDamage", `${STAT_EMOJI.attack} DMG lên Elite`],
      ["mimicDetection", "Phát hiện Mimic"],
      ["goblinChance", "Bắt Goblin"],
      ["legendaryFind", "SSR"],
      ["floorHpLoss", "HP mất/tầng"],
      ["mimicChance", "Mimic"],
      ["damageTaken", `${STAT_EMOJI.attack} DMG nhận`],
    ]
      .filter(([key]) => totals[key])
      .map(
        ([key, label]) =>
          `${label} ${signed(totals[key], ["critChance", "potionPower", "bossDamage", "eliteDamage", "mimicDetection", "goblinChance", "legendaryFind", "floorHpLoss", "mimicChance", "damageTaken"].includes(key))}${key === "resistance" ? "%" : ""}`,
      );
    if (
      items.some(
        (item) =>
          itemCurse(item.definition).defenseSet !== undefined &&
          item.level > (item.cleansedLevels || 0),
      )
    )
      effects.push(`${STAT_EMOJI.defense} DEF đặt lại khi nhặt`);
    if (items.some((item) => !item.definition))
      effects.push("có hiệu ứng chưa rõ");
    return `${items.length} món${effects.length ? ` · ${effects.join(" · ")}` : ""}`.slice(
      0,
      950,
    );
  }

  function riftSummary(state) {
    const m = state.modifiers || {};
    const effects = [];
    if (m.fortified)
      effects.push(`${STAT_EMOJI.hp} HP quái +${m.fortified * 10}%`);
    if (m.stone_skin)
      effects.push(
        `${STAT_EMOJI.defense} DEF quái ×${(1.1 ** m.stone_skin).toFixed(2)}`,
      );
    if (m.elemental_dominion)
      effects.push(
        `${STAT_EMOJI.attack} ATK quái +${m.elemental_dominion * 4}% · Phép +${m.elemental_dominion * 4} điểm % (trừ boss, tỷ lệ tối đa 75%)`,
      );
    if (m.bloodlust) effects.push(`ATK quái +${m.bloodlust * 8}% khi HP ≤50%`);
    if (m.swift_horror)
      effects.push(
        `${STAT_EMOJI.accuracy} ACC quái +${m.swift_horror * 3} · ${STAT_EMOJI.evasion} EVA quái +${m.swift_horror}`,
      );
    if (m.soul_drain)
      effects.push(
        `${STAT_EMOJI.energy} ENE −${m.soul_drain >= 5 ? 2 : 1}/đòn trúng`,
      );
    if (m.cursed_ground)
      effects.push(
        `${STAT_EMOJI.resistance} RES hiệu dụng −${m.cursed_ground * 4} khi nhận phép, thấp nhất −50%; chỉ số gốc giữ nguyên`,
      );
    if (m.unstable_rift)
      effects.push(
        `Hòm thường/kho báu mỗi loại +${Math.min(16, m.unstable_rift * 2) / 2} điểm % · SSR kho báu ${Math.min(70, 35 + m.unstable_rift * 5)}% · Mimic ${Math.min(30, 15 + m.unstable_rift * 3)}% (Ancient ${Math.min(8, 3 + m.unstable_rift)}%) trước item`,
      );
    return effects.length
      ? effects.join("\n")
      : "Chưa có hiệu ứng Rift · Nhận lần đầu sau tầng 10.";
  }

  function briefLog(state) {
    const text = String(state.lastLog || "—")
      .split("\n")
      .slice(0, 3)
      .join("\n");
    return text.length > 360 ? `${text.slice(0, 357)}…` : text;
  }
  return { statLine, ownedEquipment, equipmentSummary, riftSummary, briefLog };
};
