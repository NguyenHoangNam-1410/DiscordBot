"use strict";
const { itemIcon } = require("../shared/icons");
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
    if (require("../rift").enabled(state))
      return require("../rift")
        .description(key, count, state)
        .replace(/^\*\*Rift (?:I|II|III) · ×\d+\*\*\r?\n/, "");
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
    if (!c || c.remaining <= 0) return "";
    const action = {
      potion: `${E.potion} bình máu`,
      skill: `${SKILL_ICONS[state.classKey]} skill`,
      defend: `${E.defense} DEF`,
    }[c.kind];
    const main = stats.mainStat(state);
    const reward =
      c.kind === "potion"
        ? `1 trang bị SSR${c.item?.name ? " · " + itemIcon(c.item) + " " + c.item.name : ""}`
        : c.kind === "skill"
          ? `bonus bằng 50% cược (${money(Math.floor(state.stake * 0.5))} ${E.coin})`
          : `+10 ${E[main]} ${main.toUpperCase()} cho bạn`;
    const range =
      Number.isFinite(c.from) && Number.isFinite(c.until)
        ? ` (${c.from}–${c.until})`
        : "";
    return `${eventIcon("contract")} **Rift Contract** · không dùng ${action} · còn ${c.remaining} tầng${range} · thưởng ${reward}; vi phạm mất thưởng.`;
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
    if (paradox.active(state)) {
      const p = paradox.active(state);
      const short = {
        blood_pact: `DMG ×1,3; mỗi Skill mất 5% Max ${E.hp} (tối thiểu 1, phải còn sống)`,
        mana_fracture: `Skill 1 ${E.mana} (miễn phí vẫn 0); đánh thường không hồi ${E.mana}; Phòng thủ +1 ${E.mana}`,
        inverted_armor: `${E.physical} nhận ×0,75; ${E.res} −20 điểm % (trần −50%–75%)`,
        inverted_magic: `${E.res} +20 điểm % (trần 75%); ${E.attack} nhận ×1,35`,
        hunger: `Hạ quái hồi 12% Max ${E.hp} (tối thiểu 1); bình ×0,5 (trần hồi 10%–75% Max ${E.hp})`,
        time_debt: `2 ${E.attack}/Skill đầu trận DMG ×1,25; action thứ 3 quái phản công 2 lần nếu còn sống`,
        blood_mirror: `HP ≤40% Max ${E.hp}: DMG ×1,4 và được phép dùng bình, ngược lại khóa dùng bình`,
        unstable_soul:
          `Skill: 25% miễn ${E.mana}, 15% tốn thêm 1 ${E.mana}, 60% giá thường; Class Shrine miễn phí giữ 0` +
          (p.lockedSkillCost != null
            ? "; hiện tại " + p.lockedSkillCost + ` ${E.mana}`
            : ""),
      };
      return (
        eventIcon("paradox") +
        " **Rift Paradox · " +
        paradox.CATALOG[p.id].name +
        "** · " +
        short[p.id] +
        " · hết tầng " +
        p.endFloor
      );
    }
    const p = state.paradox;
    if (!p || state.floor < p.from || state.floor > p.until) return "";
    return `${eventIcon("paradox")} **Rift Paradox** · ${p.kind === "blood" ? `Máu là tiền · hệ số thưởng xu ${p.bloodFactor >= 0 ? "+" : ""}${percent(p.bloodFactor)}. Hồi ${E.hp} tại checkpoint không làm thay đổi hệ số.` : `Ngược đời · vật lý lấy ${E.defense}, ${E.defense} lấy trung bình ${E.physical} gốc.`} · hết tầng ${p.until}`;
  }
  return {
    riftModifierText,
    contractEffectText,
    classShrineActive,
    paradoxEffectText,
  };
};
