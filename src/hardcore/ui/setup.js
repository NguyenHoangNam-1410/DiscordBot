"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    stats,
    core,
    balance,
    emoji,
    E,
    SKILL_ICONS,
    percent,
    STAT_SEPARATOR,
    SKILLS,
    SHRINES,
  } = dependencies;

  function setupPreview(classKey) {
    const state = stats.createState(classKey, 10);
    const c = stats.CLASSES[classKey];
    const main = stats.mainStat(state).toUpperCase();
    const builds = {
      amazon:
        "Ưu tiên DEX cho sát thương, trúng/né và Crit; thêm VIT khi thiếu HP. Trang bị vật lý, ACC và Crit hợp với hai phát Barrage.",
      barbarian:
        "Ưu tiên STR cho sát thương và DEF; thêm VIT để tăng HP. Chọn trang bị vật lý và chống chịu, dùng Iron Will khi đủ MP.",
      assassin:
        "Ưu tiên DEX cho sát thương, né và Crit; thêm VIT để tránh chết nhanh. Luân phiên đánh thường lấy MP và Shadow Step để né phản công.",
      sorceress:
        "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Chọn trang bị phép, đánh thường hồi MP rồi dùng Arcane Burst.",
      druid:
        "Ưu tiên STR cho sát thương vật lý; thêm VIT cho HP và lượng hồi từ skill. Chọn trang bị vật lý/chống chịu, dùng Wild Regeneration khi đã mất HP.",
      necromancer:
        "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Đánh thường hồi MP, dùng Totem Ward để vừa gây phép vừa chặn phản công.",
      paladin:
        "Ưu tiên STR cho sát thương và DEF; thêm VIT cho HP. Chọn trang bị vật lý/chống chịu, dùng Divine Shield để gây sát thương rồi thủ.",
    };
    const manaGain = core.attackManaGain(state);
    return {
      name: `${c.emoji} ${c.name}`,
      skillIcon: SKILL_ICONS[classKey],
      role: `Build ${main}${STAT_SEPARATOR}${{ amazon: "Hai phát vật lý", barbarian: "Vật lý và chống chịu", assassin: "Crit và né phản công", sorceress: "Skill phép mạnh", druid: "Vật lý và hồi phục", necromancer: "Phép và chặn phản công", paladin: "Vật lý và phòng thủ" }[classKey]}`,
      attributes: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**`,
      stats: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**\n${E.hp} **HP** **${state.hp}**${STAT_SEPARATOR}${E.mana} **MP** **${state.mana}**${STAT_SEPARATOR}${E.defense} **DEF** **${state.defense}**${STAT_SEPARATOR}${E.potion} **Bình** **${state.potions}**\n${E.attack} **Vật lý** **${state.damageMin}–${state.damageMax}**${STAT_SEPARATOR}${E.magic} **Phép** **${state.spellMin}–${state.spellMax}**${STAT_SEPARATOR}${E.res} **RES** **${state.resistance}%**${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(state.critChance)}**`,
      build: builds[classKey],
      attack: `Một đòn **vật lý ${state.damageMin}–${state.damageMax}** trước giảm trừ; có thể trượt, có thể Crit ×1,75. Hồi **${manaGain} MP** ở chỉ số ban đầu (40% Max MP; class phép 70%, làm tròn xuống, tối thiểu 1). Quái còn sống sẽ phản công.`,
      defend:
        "Không gây sát thương; hồi **1 MP**. Trong lần phản công này: **DEF ×2** khi nhận vật lý, **+15 RES** khi nhận phép, giảm thêm **15% sát thương** và miễn Crit. Không duy trì sang lượt sau.",
      skill: `${SKILLS[classKey]} Tốn **2 MP**, không hồi MP như đánh thường. ${["sorceress", "necromancer"].includes(classKey) ? "Sát thương phép chịu RES của quái, không Crit." : "Mỗi đòn vật lý có thể trượt/Crit, chịu DEF của quái."} ${["assassin", "necromancer"].includes(classKey) ? "Chặn phản công của lượt này kể cả skill không gây sát thương." : classKey === "paladin" ? "Nếu quái sống, nhận phản công với hiệu quả DEF; skill không cộng 1 MP." : "Nếu quái sống, nhận phản công bình thường."}`,
      passive: `Đặc tính thường trực: vật lý lấy **${Math.round(c.strWeight * 100)}% STR + ${Math.round((1 - c.strWeight) * 100)}% DEX**; Crit nền **${percent(c.baseCrit)}**, RES nền **${c.baseRes}%**, cộng thêm từ thuộc tính/trang bị. Hiệu ứng né/chặn/hồi HP của skill chỉ kích hoạt khi dùng skill.`,
      shrine: `Chỉ có khi nhận **Class Shrine**, tối đa 3 tầng: ${SHRINES[classKey]}`,
      power: balance.power(state),
    };
  }
  return { setupPreview };
};
