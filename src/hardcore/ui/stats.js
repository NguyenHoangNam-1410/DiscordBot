"use strict";
const { statNumber } = require("../shared/ui");
const bosses = require("../bosses/mechanics");
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

  function counterDefense(s, base) {
    const r = require("../rift");
    const raw =
      r.encounter(s)?.lockedCounterType === "physical"
        ? r.defense(s, base)
        : base;
    const bonus =
      classShrineActive(s) &&
      s.classKey === "barbarian" &&
      s.hp <= s.maxHp * 0.3
        ? 8
        : 0;
    return Math.floor(
      (raw + bonus) *
        bosses.defenseFactor(s) *
        require("../awakening").incomingDefense(s),
    );
  }

  function statLine(s, changes = false, compact = false, options = {}) {
    const d = (key, suffix) => (changes ? delta(s, key, suffix) : "");
    const inverse = s.paradox?.kind === "inverse";
    const range = core.physicalRange(s);
    const baseDefense =
      (inverse ? (s.damageMin + s.damageMax) / 2 : s.defense) +
      (options.effective &&
      classShrineActive(s) &&
      s.classKey === "barbarian" &&
      s.hp <= s.maxHp * 0.3
        ? 8
        : 0);
    const defense = options.effective
      ? Math.floor(
          require("../rift").enabled(s)
            ? counterDefense(
                s,
                inverse ? (s.damageMin + s.damageMax) / 2 : s.defense,
              )
            : baseDefense *
                bosses.defenseFactor(s) *
                require("../awakening").incomingDefense(s),
        )
      : baseDefense;
    const resistance = options.effective
      ? core.effectiveResistance(
          s,
          s.resistance,
          false,
          !require("../rift").enabled(s) ||
            require("../rift").encounter(s)?.lockedCounterType === "magic",
        )
      : s.resistance;
    const lines = [
      `${healthBar(s.hp, s.maxHp)}${d("hp")}${d("maxHp", " MAX")}`,
      `${E.str} **STR** **${statNumber(s.str)}**${d("str")}${STAT_SEPARATOR}${E.dex} **DEX** **${statNumber(s.dex)}**${d("dex")}${STAT_SEPARATOR}${E.vit} **VIT** **${statNumber(s.vit)}**${d("vit")}${STAT_SEPARATOR}${E.ene} **ENE** **${statNumber(s.ene)}**${d("ene")}`,
      `${E.mana} **MP** **${statNumber(s.mana)}/${bosses.effectiveMaxMana(s)}**${d("mana")}${d("maxMana", " MAX")}${options.includeSupplies === false ? "" : `${STAT_SEPARATOR}${E.potion} **Bình** ${s.potions}${d("potions")}${STAT_SEPARATOR}${E.ticket} **Vé thoát** ${s.escapeTokens}${d("escapeTokens")}`}`,
      `${E.attack} **Vật lý** **${statNumber(range[0])}–${statNumber(range[1])}**${inverse ? " (Paradox)" : d("damageMin")}${STAT_SEPARATOR}${E.magic} **Phép** **${statNumber(s.spellMin)}–${statNumber(s.spellMax)}**${d("spellMin")}`,
      `${E.defense} **DEF** **${statNumber(defense)}**${inverse ? " (Paradox)" : d("defense")}${STAT_SEPARATOR}${E.res} **RES** **${statNumber(resistance)}%**${options.effective && resistance !== s.resistance ? ` (gốc ${statNumber(s.resistance)}%)` : d("resistance")}${STAT_SEPARATOR}${E.luck} **LUCK** **${statNumber(s.luck)}**${d("luck")}`,
    ];
    if (options.battleResources) {
      lines[0] = battleResources(s);
      lines.splice(2, 1);
    }
    if (!compact)
      lines.push(
        `${E.accuracy} **ACC** **${statNumber(s.accuracy)}**${d("accuracy")}${STAT_SEPARATOR}${E.evasion} **EVA** **${statNumber(s.evasion)}**${d("evasion")}${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(options.effective ? bosses.playerCrit(s, s.critChance) : s.critChance)}**${d("critChance", "%")}\n${E.potionPower} **Hiệu lực bình** **${percent(paradox.potionRate(s) * (1 - (s.healingReduction || 0)) * bosses.healingFactor(s))}** Max HP`,
      );
    return lines.join("\n");
  }

  function battleResources(s) {
    const tickets = [
      ...(s.escapeTokens > 0
        ? [`${E.ticket} **Vé thoát ×${s.escapeTokens}**`]
        : []),
      ...(s.reviveTickets > 0
        ? [`${E.reviveTicket} **Vé hồi sinh ×${s.reviveTickets}**`]
        : []),
    ];
    return `${healthBar(s.hp, s.maxHp).replace(" **HP**", "")}${STAT_SEPARATOR}${E.mana} **${statNumber(s.mana)}/${bosses.effectiveMaxMana(s)}**${tickets.length ? "\n" + tickets.join(STAT_SEPARATOR) : ""}`;
  }
  function battleStats(s, compact = false) {
    const attack = core.attackDamagePreview(s);
    const defense = require("../rift").enabled(s)
      ? counterDefense(
          s,
          s.paradox?.kind === "inverse"
            ? (s.damageMin + s.damageMax) / 2
            : s.defense,
        )
      : Math.floor(
          (s.paradox?.kind === "inverse"
            ? (s.damageMin + s.damageMax) / 2
            : s.defense) *
            bosses.defenseFactor(s) *
            require("../awakening").incomingDefense(s),
        );
    const skill = core.skillDamagePreview(s);
    const physicalChance = bosses.vanished(s)
      ? 0
      : require("../rift").guaranteedHit(s)
        ? 1
        : world.hitChance(
            s.accuracy + require("../equipment/affinityEffects").accuracy(s),
            s.encounter.evasion,
            0.45,
          );
    const detail = bosses.brainControl(s)
      ? "DMG chuẩn 20% Max HP boss; không Crit, không mất MP."
      : {
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
    const resources = compact
      ? battleResources(s)
      : `${healthBar(s.hp, s.maxHp)}\n${E.mana} **MP** **${statNumber(s.mana)}/${bosses.effectiveMaxMana(s)}**${STAT_SEPARATOR}${E.potion} **Bình** **${s.potions}**${STAT_SEPARATOR}${E.ticket} **Vé thoát** **${s.escapeTokens}**`;
    return `${resources}\n${E.attack} **${attack.low}–${attack.high} DMG**${STAT_SEPARATOR}${E.defense} **DEF** **${statNumber(defense)}**${STAT_SEPARATOR}${E.res} **RES** **${statNumber(core.effectiveResistance(s, s.resistance, false, !require("../rift").enabled(s) || require("../rift").encounter(s)?.lockedCounterType === "magic"))}%**${core.effectiveResistance(s, s.resistance, false, !require("../rift").enabled(s) || require("../rift").encounter(s)?.lockedCounterType === "magic") !== s.resistance ? ` (gốc ${statNumber(s.resistance)}%)` : ""}\n${bosses.brainControl(s) ? "🧠" : SKILL_ICONS[s.classKey]} **${bosses.brainControl(s) ? "Brain Control" : stats.CLASSES[s.classKey].skill}${compact ? "" : ` (${core.skillManaCost(s)} MP${core.skillHpCost(s) ? `, −${core.skillHpCost(s)} HP` : ""})`}: ${skill.low}–${skill.high} DMG**\n${compact ? `${E.accuracy} Tỷ lệ vật lý đánh trúng quái: **${percent(physicalChance)}**` : detail}\n`;
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
      add(`${E[key]} ${key.toUpperCase()}`, [key], (s) => statNumber(s[key]));
    add(`${E.hp} Max HP`, ["maxHp"], (s) => statNumber(s.maxHp));
    add(
      `${E.attack} Vật lý`,
      ["damageMin", "damageMax"],
      (s) => `${statNumber(s.damageMin)}–${statNumber(s.damageMax)}`,
    );
    add(
      `${E.magic} Phép`,
      ["spellMin", "spellMax"],
      (s) => `${statNumber(s.spellMin)}–${statNumber(s.spellMax)}`,
    );
    for (const [key, label] of [
      ["defense", `${E.defense} DEF`],
      ["accuracy", `${E.accuracy} ACC`],
      ["evasion", `${E.evasion} EVA`],
      ["maxMana", `${E.mana} Max MP`],
    ])
      add(label, [key], (s) => statNumber(s[key]));
    add(`${E.crit} CRIT`, ["critChance"], (s) => percent(s.critChance));
    add(`${E.res} RES`, ["resistance"], (s) => `${statNumber(s.resistance)}%`);
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
        add(label, [key], (s) => statNumber(s[key]));
    }
    return (
      parts.join(STAT_SEPARATOR) ||
      (options.empty ? "" : "Không thay đổi chỉ số chiến đấu.")
    );
  }

  function riftStatBonus(key, count) {
    const stacks = world.effectiveStacks(count);
    const stat = (label, value) => `${highlightStat(label)} **${value}**`;
    const amount = (n) => statNumber(n).toLocaleString("vi-VN");
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
      if (require("../rift").enabled(state)) {
        if (count <= 0) continue;
        const r = require("../rift"),
          effects = {
            stone_skin:
              "Quái: Lá chắn đá " +
              count * 1.5 +
              "% Max HP; vỡ giáp → DEF/RES −" +
              [0, 8, 12, 16][r.tier(count)] +
              "%",
            fortified:
              "Quái: Max HP +" +
              count * 3 +
              "%; Exposed: bạn +" +
              [0, 10, 15, 20][r.tier(count)] +
              "% DMG",
            elemental_dominion:
              "Quái: phép +" +
              count * 1.25 +
              "% DMG; hỗn hợp +" +
              count * 2 +
              " điểm % phép",
            bloodlust:
              "Quái: phản công sau ngưỡng 50% HP +" +
              (12 + count * 2) +
              "% DMG",
            swift_horror:
              "Quái: vật lý +" +
              count +
              " điểm % trúng; né tự nhiên → bạn +" +
              [0, 8, 12, 16][r.tier(count)] +
              "% DMG và vật lý chắc chắn trúng",
            cursed_ground:
              "Bạn: DEF hiệu lực −" +
              count * 2 +
              "% khi nhận vật lý; RES −" +
              count * 1.5 +
              " điểm % khi nhận phép",
            soul_drain:
              "Bạn: MP −1 khi trúng phản công; Phòng thủ giữ MP; đánh thường sau hút hồi thêm 1 MP",
          };
        if (effects[key])
          lines.push(
            (RIFT_ICONS[key] || E.rift) +
              " **" +
              world.RIFT_MODIFIERS[key].name +
              " ×" +
              count +
              "** · " +
              effects[key] +
              ".",
          );
        continue;
      }
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
          `${E.attack} DMG gây ra ×${statNumber(outgoing).toLocaleString("vi-VN")}`,
        );
      if (incoming !== 1)
        effects.push(
          `${E.attack} DMG vật lý nhận ×${statNumber(incoming).toLocaleString("vi-VN")}`,
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
