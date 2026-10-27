"use strict";
const statsV3 = require("../shared/statsV3");
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
    const characters = require("../characters");
    const character = characters.catalog.characters.find(
      (c) => c.profileKey === classKey,
    );
    const group = character && characters.CLASSES[character.classKey];
    const main = (group?.primaryStat || stats.mainStat(state)).toUpperCase();
    const builds = {
      venance:
        "Ưu tiên ENE để tăng phép và MP; thêm VIT để sống qua lượt niệm. Skill → ba đòn phép để kích hoạt Tam trọng; Phòng thủ khi cần MP hoặc Hồi lưu.",
      rha_kor:
        "Ưu tiên STR cho sát thương, VIT cho HP. Skill mở Cổ Luật rồi chọn Attack để burst/phá DEF, Defense để sống sót, Potion để hồi phục hoặc Skill lần hai để dồn sát thương; Max MP 4 đủ cho nhịp Skill → hành động.",
      amazon:
        "Ưu tiên DEX cho sát thương, trúng/né và Crit; thêm VIT khi thiếu HP. Trang bị vật lý, ACC và Crit hợp với hai phát Barrage.",
      barbarian:
        "Ưu tiên STR cho sát thương và DEF; thêm VIT để tăng HP. Chọn trang bị vật lý và chống chịu, dùng Iron Will khi đủ MP.",
      assassin:
        "Ưu tiên DEX cho sát thương, né và Crit; thêm VIT để tránh chết nhanh. Luân phiên đánh thường lấy MP và Shadow Step để né phản công.",
      sorceress:
        "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Chọn trang bị phép, đánh thường hồi MP rồi dùng Arcane Burst.",
      druid:
        "STR tăng sát thương vật lý; VIT/ENE cũng góp sát thương nhờ Wild Growth. Thêm VIT cho HP và lượng hồi từ skill. Chọn trang bị vật lý/chống chịu, dùng Wild Regeneration khi đã mất HP.",
      necromancer:
        "Ưu tiên ENE cho skill phép, RES và Max MP; thêm VIT cho HP. Đánh thường hồi MP, dùng Totem Ward để vừa gây phép vừa chặn phản công.",
      paladin:
        "Ưu tiên VIT để tăng HP và DEF; DEF tăng Holy DMG sau thức tỉnh. STR bổ sung sát thương vật lý và DEF. Dùng Divine Shield để chuẩn bị phản công và vùng thánh.",
    };
    const manaGain = core.attackManaGain(state);
    return {
      name: `${c.emoji} ${c.name}`,
      skillIcon: SKILL_ICONS[classKey],
      role: `${group ? group.name + STAT_SEPARATOR : ""}Build ${main}${STAT_SEPARATOR}${{ venance: "Cường hóa đánh thường thành phép", rha_kor: "Cổ Luật, phá DEF và nhịp chiến đấu", amazon: "Hai phát vật lý", barbarian: "Vật lý và chống chịu", assassin: "Crit và né phản công", sorceress: "Skill phép mạnh", druid: "Vật lý và hồi phục", necromancer: "Phép và chặn phản công", paladin: "Vật lý và phòng thủ" }[classKey]}`,
      attributes: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**`,
      stats: `${E.str} **STR** **${state.str}**${STAT_SEPARATOR}${E.dex} **DEX** **${state.dex}**${STAT_SEPARATOR}${E.vit} **VIT** **${state.vit}**${STAT_SEPARATOR}${E.ene} **ENE** **${state.ene}**\n${E.hp} **HP** **${state.hp}**${STAT_SEPARATOR}${E.mana} **MP** **${state.mana}**${STAT_SEPARATOR}${E.defense} **DEF** **${state.defense}**${STAT_SEPARATOR}${E.potion} **Bình** **${state.potions}**\n${E.attack} **Vật lý** **${state.damageMin}–${state.damageMax}**${STAT_SEPARATOR}${E.magic} **Phép** **${state.spellMin}–${state.spellMax}**${STAT_SEPARATOR}${E.res} **RES** **${state.resistance}%**${STAT_SEPARATOR}${E.crit} **CRIT** **${percent(state.critChance)}**`,
      build: builds[classKey],
      attack:
        classKey === "venance"
          ? "Bình thường: vật lý, hồi cố định **1 MP** trước hiệu ứng giảm hồi. Khi cường hóa: **Phép ×2**, luôn trúng, không Crit và **không hồi MP**; tốn một trong 3 hành động cường hóa."
          : `Một đòn **vật lý ${state.damageMin}–${state.damageMax}** trước giảm trừ; có thể trượt, có thể Crit ×1,8. Hồi **${manaGain} MP** ở chỉ số ban đầu (40% Max MP; class phép 70%, làm tròn xuống, tối thiểu 1). Quái còn sống sẽ phản công.`,
      defend: `Không gây sát thương; hồi **${classKey === "venance" ? 2 : 1} MP**. Trong lần phản công này: **DEF ×2** khi nhận vật lý, **+15 RES** khi nhận phép, giảm thêm **15% sát thương** và miễn Crit. Không duy trì sang lượt sau.${classKey === "venance" ? " Có Ấn Hồi lưu: tiêu ấn để hồi HP trước phản công." : ""}`,
      skill:
        classKey === "rha_kor"
          ? `${SKILLS.rha_kor} Tốn **2 MP**. Chỉ một luật mỗi lần mở; Skill lần hai khi Cổ Luật còn mở là Luật Phán (cũng tốn 2 MP).`
          : classKey === "venance"
            ? "Tốn **2 MP**, **không gây DMG**. Cường hóa đánh thường thành phép trong **3 hành động chiến đấu tiếp theo**, giữ qua phòng. Phòng thủ/bình/hành động boss tốn lượt đều trừ thời gian. Boss vẫn phản công. Dùng lại đặt về 3 hành động và xóa chuỗi/ấn cũ."
            : `${SKILLS[classKey]} Tốn **2 MP**, không hồi MP như đánh thường. ${["sorceress", "necromancer"].includes(classKey) ? "Sát thương phép chịu RES của quái, không Crit." : "Mỗi đòn vật lý có thể trượt/Crit, chịu DEF của quái."} ${["assassin", "necromancer"].includes(classKey) ? "Chặn phản công của lượt này kể cả skill không gây sát thương." : classKey === "paladin" ? "Nếu quái sống, nhận phản công với hiệu quả DEF; skill không cộng 1 MP." : "Nếu quái sống, nhận phản công bình thường."}`,
      passive:
        classKey === "rha_kor"
          ? require("../characters/rhakor").innateText(state)
          : classKey === "venance"
            ? require("../characters/venance").innateText(state)
            : `Đặc tính thường trực: vật lý lấy **${Math.round(c.strWeight * 100)}% STR + ${Math.round((1 - c.strWeight) * 100)}% DEX**; Crit nền **${percent(c.baseCrit)}**, RES nền **${c.baseRes}%**, cộng thêm từ thuộc tính/trang bị. Hiệu ứng né/chặn/hồi HP của skill chỉ kích hoạt khi dùng skill.\n\n${statsV3.profile(state).mastery.name}: DEX chuyển thành né/Crit theo class; xem Chỉ số để đọc hệ số và trần.`,
      shrine: `Chỉ có khi nhận **Class Shrine**, tối đa 3 tầng: ${classKey === "venance" ? "Một lần Astral Armament miễn MP, vẫn tốn hành động và nhận phản công." : SHRINES[classKey]}`,
      power: state.gameplayVersion === 3 ? 1 : balance.power(state),
      mastery: statsV3.description(state, E),
    };
  }
  function hardcoreSetupPayload(draft, classes, context) {
    const {
      EmbedBuilder,
      ActionRowBuilder,
      StringSelectMenuBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");
    const { formatCoins } = require("../../utils/economy");
    const { splitRuleFields } = require("./rulePages");
    const character = classes[draft.classKey];
    const validStake =
      Number.isSafeInteger(draft.stake) &&
      draft.stake >= 10 &&
      draft.stake <= Math.min(context.balance, context.maxBet);
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("⚔️ SINH TỒN · CHUẨN BỊ RUN")
      .setDescription(
        "**1. Chọn nhân vật** để xem chỉ số và kỹ năng.\n**2. Nhập xu** để đặt mức cược.\n**3. Tiếp** để chọn đồ/vé, xem chỉ số rồi xác nhận Bắt đầu.",
      )
      .addFields(
        {
          name: "🎲 Cược đã chọn",
          value:
            draft.stake == null
              ? "Chưa nhập"
              : formatCoins(draft.stake) +
                " xu" +
                (validStake ? "" : " · Không hợp lệ"),
          inline: true,
        },
        {
          name: "📏 Giới hạn cược",
          value:
            "10–" + formatCoins(context.maxBet) + " xu. Xem số dư qua /hoso.",
          inline: true,
        },
      );
    if (character) {
      const preview = setupPreview(draft.classKey);
      embed.addFields(
        ...splitRuleFields([
          { name: preview.name, value: preview.stats },
          { name: "🧭 Hướng build", value: preview.build },
          { name: E.attack + " Tấn công", value: preview.attack },
          { name: E.defense + " Phòng thủ", value: preview.defend },
          {
            name: preview.skillIcon + " " + character.skill + " · 2 Mana",
            value: preview.skill,
          },
          { name: "📖 Đặc tính / nội tại", value: preview.passive },
          { name: "⛩️ Phước lành có điều kiện", value: preview.shrine },
        ]),
      );
    }
    embed.addFields({
      name: "📖 Ký hiệu",
      value:
        E.str +
        " STR: vật lý/DEF · " +
        E.dex +
        " DEX: trúng/né/Crit\n" +
        E.vit +
        " VIT: HP/bình máu · " +
        E.ene +
        " ENE: phép/RES/Max Mana\nChọn nhân vật để xem hướng build và cơ chế từng hành động. Rút thưởng mới nhận xu/gem; tử trận mất toàn bộ.",
    });
    const customId = (action) =>
      "hardcore-setup:" + draft.id + ":" + draft.version + ":" + action;
    const select = new StringSelectMenuBuilder()
      .setCustomId(customId("class"))
      .setPlaceholder("Chọn nhân vật và xem kỹ năng")
      .addOptions(
        Object.entries(classes).map(([value, entry]) => ({
          label: entry.name,
          value,
          emoji: stats.CLASSES[value].emoji,
          description: setupPreview(value).role.slice(0, 100),
          default: value === draft.classKey,
        })),
      );
    return {
      content: "",
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(select),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(customId("bet"))
            .setLabel(draft.stake == null ? "Nhập xu" : "Đổi mức cược")
            .setEmoji("💰")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(customId("next"))
            .setLabel("Tiếp")
            .setEmoji("⚔️")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!character || !validStake),
          new ButtonBuilder()
            .setCustomId(customId("cancel"))
            .setLabel("Hủy")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      allowedMentions: { parse: [] },
    };
  }
  function hardcoreBetModal(draft, maxBet) {
    const {
      ActionRowBuilder,
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
    } = require("discord.js");
    const { formatCoins } = require("../../utils/economy");
    const input = new TextInputBuilder()
      .setCustomId("amount")
      .setLabel("Số xu cược (10–" + formatCoins(maxBet) + ")")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(6)
      .setPlaceholder("Ví dụ: 1000 (chỉ nhập chữ số)");
    if (draft.stake != null) input.setValue(String(draft.stake));
    return new ModalBuilder()
      .setCustomId(
        "hardcore-setup-modal:" + draft.id + ":" + draft.version + ":bet",
      )
      .setTitle("Sinh tồn · Nhập số xu cược")
      .addComponents(new ActionRowBuilder().addComponents(input));
  }
  return { setupPreview, hardcoreSetupPayload, hardcoreBetModal };
};
