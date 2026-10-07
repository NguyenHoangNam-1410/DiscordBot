"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    royal,
    stats,
    core,
    paradox,
    world,
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    paradoxIcon,
    percent,
    money,
    healthBar,
    highlightStat,
    STAT_SEPARATOR,
    delta,
  } = dependencies;
  const classShrineActive = (...args) =>
    dependencies.classShrineActive(...args);

  function statLine(s, changes = false, compact = false, options = {}) {
    const d = (key, suffix) => (changes ? delta(s, key, suffix) : "");
    const inverse = s.paradox?.kind === "inverse";
    const range = core.physicalRange(s);
    const defense =
      (inverse ? (s.damageMin + s.damageMax) / 2 : s.defense) +
      (options.effective &&
      classShrineActive(s) &&
      s.classKey === "barbarian" &&
      s.hp <= s.maxHp * 0.3
        ? 8
        : 0);
    const resistance = options.effective
      ? core.effectiveResistance(s)
      : s.resistance;
    const lines = [
      `${healthBar(s.hp, s.maxHp)}${d("hp")}${d("maxHp", " MAX")}`,
      `${E.str} **STR** **${s.str}**${d("str")}${STAT_SEPARATOR}${E.dex} **DEX** **${s.dex}**${d("dex")}${STAT_SEPARATOR}${E.vit} **VIT** **${s.vit}**${d("vit")}${STAT_SEPARATOR}${E.ene} **ENE** **${s.ene}**${d("ene")}`,
      `${E.mana} **MP** **${s.mana}/${s.maxMana}**${d("mana")}${d("maxMana", " MAX")}${options.includeSupplies === false ? "" : `${STAT_SEPARATOR}${E.potion} **Bình** ${s.potions}${d("potions")}${STAT_SEPARATOR}${E.ticket} **Vé thoát** ${s.escapeTokens}${d("escapeTokens")}`}`,
      `${E.attack} **Vật lý** **${range[0]}–${range[1]}**${inverse ? " (Paradox)" : d("damageMin")}${STAT_SEPARATOR}${E.magic} **Phép** **${s.spellMin}–${s.spellMax}**${d("spellMin")}`,
      `${E.defense} **DEF** **${defense}**${inverse ? " (Paradox)" : d("defense")}${STAT_SEPARATOR}${E.res} **RES** **${resistance}%**${options.effective && resistance !== s.resistance ? ` (gốc ${s.resistance}%)` : d("resistance")}${STAT_SEPARATOR}${E.luck} **LUCK** **${s.luck}**${d("luck")}`,
    ];
    if (!compact)
      lines.push(
        `${E.accuracy} **ACC** **${s.accuracy}**${d("accuracy")}${STAT_SEPARATOR}${E.evasion} **EVA** **${s.evasion}**${d("evasion")}${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(s.critChance)}**${d("critChance", "%")}\n${E.potionPower} **Hiệu lực bình** **${percent(paradox.potionRate(s) * (1 - (s.healingReduction || 0)))}** Max HP`,
      );
    return lines.join("\n");
  }

  function battleStats(s) {
    const attack = core.attackDamagePreview(s);
    const defense =
      s.paradox?.kind === "inverse"
        ? (s.damageMin + s.damageMax) / 2
        : s.defense;
    const skill = core.skillDamagePreview(s);
    const detail = {
      amazon: `Hai phát vật lý, trúng/Crit riêng.${skill.extraShot ? " 20% thêm phát thứ ba." : ""}`,
      barbarian: "Vật lý, có thể trượt/Crit.",
      assassin: "Vật lý, có thể trượt/Crit; né phản công.",
      sorceress: "Phép luôn trúng, không Crit.",
      druid: `Vật lý, có thể trượt/Crit; hồi tối đa ${E.hp} **${money(core.healingAmount(s, s.maxHp * 0.12))} HP** cho bạn (**12% Max HP**${s.healingReduction ? " trước giảm hồi phục" : ""}).`,
      necromancer: royal.freeMagic(s)
        ? "Phép luôn trúng, không Crit; " +
          (s.encounter?.astralGuardLastAction
            ? "lượt này không chặn phản công."
            : "lượt này chặn phản công.")
        : "Phép luôn trúng, không Crit; chặn phản công.",
      paladin: "Vật lý, có thể trượt/Crit; tự Phòng thủ.",
    }[s.classKey];
    return `${healthBar(s.hp, s.maxHp)}\n${E.mana} **MP** **${s.mana}/${s.maxMana}**${STAT_SEPARATOR}${E.potion} **Bình** **${s.potions}**${STAT_SEPARATOR}${E.ticket} **Vé thoát** **${s.escapeTokens}**\n${E.attack} **${attack.low}–${attack.high} DMG**${STAT_SEPARATOR}${E.defense} **DEF** **${defense}**${STAT_SEPARATOR}${E.res} **RES** **${core.effectiveResistance(s)}%**${core.effectiveResistance(s) !== s.resistance ? ` (gốc ${s.resistance}%)` : ""}\n${SKILL_ICONS[s.classKey]} **${stats.CLASSES[s.classKey].skill} (${core.skillManaCost(s)} MP${core.skillHpCost(s) ? `, −${core.skillHpCost(s)} HP` : ""}): ${skill.low}–${skill.high} DMG**\n${detail}\n`;
  }

  function checkpointPreview(s, key) {
    const p = stats.preview(s, key);
    return statTransitions(s, p);
  }

  function statTransitions(
    before,
    after,
    includeResources = false,
    options = {},
  ) {
    const parts = [];
    const add = (name, keys, format) => {
      if (options.only && !keys.some((key) => options.only.includes(key)))
        return;
      if (options.exclude && keys.some((key) => options.exclude.includes(key)))
        return;
      if (keys.some((key) => before[key] !== after[key]))
        parts.push(
          `${highlightStat(name)}: ${format(before)} → **${format(after)}**`,
        );
    };
    for (const key of stats.ATTRIBUTES)
      add(`${E[key]} ${key.toUpperCase()}`, [key], (s) => s[key]);
    add(`${E.hp} Max HP`, ["maxHp"], (s) => s.maxHp);
    add(
      `${E.attack} Vật lý`,
      ["damageMin", "damageMax"],
      (s) => `${s.damageMin}–${s.damageMax}`,
    );
    add(
      `${E.magic} Phép`,
      ["spellMin", "spellMax"],
      (s) => `${s.spellMin}–${s.spellMax}`,
    );
    for (const [key, label] of [
      ["defense", `${E.defense} DEF`],
      ["accuracy", `${E.accuracy} ACC`],
      ["evasion", `${E.evasion} EVA`],
      ["maxMana", `${E.mana} Max MP`],
    ])
      add(label, [key], (s) => s[key]);
    add(`${E.crit} CRIT`, ["critChance"], (s) => percent(s.critChance));
    add(`${E.res} RES`, ["resistance"], (s) => `${s.resistance}%`);
    add(`${E.potion} Bình`, ["potionRate"], (s) =>
      percent(paradox.potionRate(s)),
    );
    if (includeResources) {
      for (const [key, label] of [
        ["hp", `${E.hp} HP`],
        ["mana", `${E.mana} MP`],
        ["luck", `${E.luck} LUCK`],
        ["potions", `${E.potion} Bình máu`],
        ["escapeTokens", `${E.ticket} Vé thoát`],
      ])
        add(label, [key], (s) => s[key]);
    }
    return (
      parts.join(STAT_SEPARATOR) ||
      (options.empty ? "" : "Không thay đổi chỉ số chiến đấu.")
    );
  }

  function riftStatBonus(key, count) {
    const stacks = world.effectiveStacks(count);
    const stat = (label, value) => `${highlightStat(label)} **${value}**`;
    const amount = (n) => (Math.round(n * 1000) / 1000).toLocaleString("vi-VN");
    return {
      stone_skin: stat(`${E.defense} DEF`, `+${amount(stacks * 8)}%`),
      elemental_dominion: `${stat(`${E.attack} DMG`, `+${amount(stacks * 3)}%`)}; ${E.magic} **Tỷ lệ đòn phép** **+${amount(stacks * 3)} điểm phần trăm** (quái đánh hỗn hợp)`,
      bloodlust: stat(`${E.attack} DMG`, `+${amount(stacks * 6)}%`),
      fortified: stat(`${E.hp} Max HP`, `+${amount(stacks * 8)}%`),
      swift_horror: `${stat(`${E.accuracy} ACC`, `+${amount(stacks * 3)}`)}${STAT_SEPARATOR}${stat(`${E.evasion} EVA`, `+${amount(stacks * 1.5)}`)}`,
      cursed_ground: stat(
        `${E.res} RES`,
        `−${amount(stacks * 3)} điểm phần trăm`,
      ),
    }[key];
  }

  function riftStatSummary(state) {
    const lines = [];
    for (const [key, count] of Object.entries(state.modifiers || {})) {
      if (count <= 0) continue;
      const bonus = riftStatBonus(key, count);
      if (bonus)
        lines.push(
          `${RIFT_ICONS[key] || E.rift} **${world.RIFT_MODIFIERS[key].name} ×${count}** · **${key === "cursed_ground" ? "Bạn" : "Quái"}:** ${bonus}${key === "bloodlust" ? " khi quái còn dưới 50% HP" : ""}.`,
        );
      if (key === "soul_drain") {
        const charges = Math.min(3, Math.ceil(count / 4));
        const remaining =
          state.phase === "encounter" &&
          state.encounter.type === "combat" &&
          Number.isInteger(state.encounter.drainCharges)
            ? ` · quái còn ${state.encounter.drainCharges} lần hút trong trận này`
            : "";
        lines.push(
          `${RIFT_ICONS[key]} **Soul Drain ×${count}** · **Bạn:** ${E.mana} MP −1 mỗi phản công trúng; ${charges} lần/trận${remaining}.`,
        );
      }
    }
    const p = paradox.active(state);
    if (p) {
      const effects = [];
      const outgoing = paradox.outgoing(state),
        incoming = paradox.incoming(state, false);
      if (outgoing !== 1)
        effects.push(
          `${E.attack} DMG gây ra ×${outgoing.toLocaleString("vi-VN")}`,
        );
      if (incoming !== 1)
        effects.push(
          `${E.attack} DMG vật lý nhận ×${incoming.toLocaleString("vi-VN")}`,
        );
      if (["inverted_armor", "inverted_magic"].includes(p.id))
        effects.push(
          `${E.res} RES khi nhận phép: ${state.resistance}% → **${core.effectiveResistance(state)}%** (đã tính Rift/Class Shrine)`,
        );
      if (paradox.hpCost(state))
        effects.push(`Skill trừ ${E.hp} **${paradox.hpCost(state)} HP**`);
      if (p.id === "mana_fracture" || p.id === "unstable_soul") {
        const locked =
          p.id !== "unstable_soul" || Number.isInteger(p.lockedSkillCost);
        effects.push(
          locked
            ? `Skill tốn ${E.mana} **${core.skillManaCost(state)} MP**`
            : `Chi phí ${E.mana} MP của Skill được chốt theo lượt`,
        );
        if (p.id === "mana_fracture")
          effects.push(
            `Tấn công hồi ${E.mana} **0 MP**; Phòng thủ hồi **1 MP**`,
          );
      }
      if (p.id === "hunger") {
        effects.push(
          `Bình hồi ${percent(state.potionRate)} → **${percent(paradox.potionRate(state))} Max HP**`,
        );
        effects.push(
          `Hạ quái hồi ${E.hp} **${core.healingAmount(state, Math.max(1, Math.floor(state.maxHp * 0.12)))} HP** cho bạn`,
        );
      }
      if (p.id === "blood_mirror")
        effects.push(
          paradox.potionLocked(state)
            ? "Đang khóa bình máu"
            : "Được dùng bình máu",
        );
      if (p.id === "time_debt")
        effects.push(
          `Quái còn sống phản công **2 lần** ở hành động thứ 3 của bạn trong trận`,
        );
      lines.push(
        `${paradoxIcon(p.id)} **${paradox.CATALOG[p.id].name} · Bạn:** ${effects.join(STAT_SEPARATOR) || "Không có bonus DMG ở lượt hiện tại."}`,
      );
    } else if (
      state.paradox?.kind === "inverse" &&
      state.floor >= state.paradox.from &&
      state.floor <= state.paradox.until
    )
      lines.push(
        `${eventIcon("paradox")} **Ngược đời · Bạn:** ${E.attack} Vật lý ${state.damageMin}–${state.damageMax} → **${core.physicalRange(state).join("–")}**; ${E.defense} DEF ${state.defense} → **${(state.damageMin + state.damageMax) / 2}**.`,
      );
    return lines.join("\n") || "Không có ảnh hưởng chỉ số từ Rift/Paradox.";
  }

  function defenseDescription() {
    return `Không tấn công; ${E.mana} **MP +1** (tối đa Max MP).\n**Khi quái đánh trả trong lượt này:**\n- ${E.attack} **Vật lý** → ${E.defense} **DEF ×2**.\n- ${E.magic} **Phép** → ${E.res} **RES +15 điểm %**.\n- ${E.damageTaken} Giảm thêm **15% DMG nhận**; ${E.crit} **không bị CRIT**.`;
  }
  return {
    statLine,
    battleStats,
    checkpointPreview,
    statTransitions,
    riftStatBonus,
    riftStatSummary,
    defenseDescription,
  };
};
