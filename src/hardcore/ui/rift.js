"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    stats,
    paradox,
    world,
    E,
    SKILL_ICONS,
    eventIcon,
    percent,
    money,
    highlightStat,
  } = dependencies;
  const riftStatBonus = (...args) => dependencies.riftStatBonus(...args);

  function riftModifierText(key, count, state) {
    const bonus = riftStatBonus(key, count);
    const icons = {
      "Max HP": E.hp,
      HP: E.hp,
      MP: E.mana,
      DMG: E.attack,
      DEF: E.defense,
      ACC: E.accuracy,
      EVA: E.evasion,
      RES: E.res,
    };
    const text = world.RIFT_MODIFIERS[key].text.replace(
      /\b(Max HP|HP|MP|DMG|DEF|ACC|EVA|RES)\b/g,
      (label) => highlightStat(`${icons[label]} ${label}`),
    );
    if (key === "soul_drain") {
      const charges = Math.min(3, Math.ceil(count / 4));
      const remaining =
        state.phase === "encounter" &&
        state.encounter.type === "combat" &&
        Number.isInteger(state.encounter.drainCharges)
          ? ` Trận hiện tại: còn **${state.encounter.drainCharges} lần hút**.`
          : "";
      return `Hiện tại: **${charges} lần hút mỗi trận**.${remaining}\n${text}`;
    }
    return `${bonus ? `Mức tăng/giảm hiện tại: ${bonus}.\n` : ""}${text}`;
  }

  function contractEffectText(state) {
    const c = state.contract;
    if (!c) return `${eventIcon("contract")} Rift Contract: không`;
    const action = {
      potion: `${E.potion} bình máu`,
      skill: `${SKILL_ICONS[state.classKey]} skill`,
      defend: `${E.defense} DEF`,
    }[c.kind];
    const main = stats.mainStat(state);
    const reward =
      c.kind === "potion"
        ? `1 trang bị SSR${c.item?.name ? " · " + c.item.name : ""}`
        : c.kind === "skill"
          ? `bonus bằng 50% cược (${money(Math.floor(state.stake * 0.5))} ${E.coin})`
          : `+10 ${E[main]} ${main.toUpperCase()} cho bạn`;
    const range =
      Number.isFinite(c.from) && Number.isFinite(c.until)
        ? ` (${c.from}–${c.until})`
        : "";
    return `${eventIcon("contract")} **Rift Contract** · còn **${c.remaining} tầng**${range}\n**Điều kiện:** không dùng ${action}.\n**Thưởng khi hoàn thành:** ${reward}. Vi phạm hủy thưởng.`;
  }

  function classShrineActive(state) {
    return Boolean(
      state.classShrine &&
      state.floor >= state.classShrine.from &&
      state.floor <= state.classShrine.until &&
      !state.classShrine.consumed,
    );
  }

  function paradoxEffectText(state) {
    if (paradox.active(state)) return paradox.describe(state);
    const p = state.paradox;
    if (!p || state.floor < p.from || state.floor > p.until)
      return `${eventIcon("paradox")} Rift Paradox: không`;
    return `${eventIcon("paradox")} **Rift Paradox** · ${p.kind === "blood" ? `Máu là tiền · hệ số thưởng xu ${p.bloodFactor >= 0 ? "+" : ""}${percent(p.bloodFactor)}. Hồi HP tại checkpoint không giảm hệ số.` : "Ngược đời · vật lý lấy DEF, DEF lấy trung bình vật lý gốc."} · hết tầng ${p.until}`;
  }
  return {
    riftModifierText,
    contractEffectText,
    classShrineActive,
    paradoxEffectText,
  };
};
