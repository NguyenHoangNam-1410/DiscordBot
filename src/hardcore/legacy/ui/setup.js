const { splitRuleFields } = require("../../ui/rulePages");
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    formatCoins,
    STAT_EMOJI,
    icon,
    CLASS_PROFILES,
  } = dependencies;
  const healthBar = (...args) => dependencies.healthBar(...args);

  function hardcoreSetupPayload(draft, classes, context) {
    const character = classes[draft.classKey];
    const affordable = Math.min(context.balance, context.maxBet);
    const validStake =
      Number.isSafeInteger(draft.stake) &&
      draft.stake >= 10 &&
      draft.stake <= affordable;
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("⚔️ SINH TỒN · CHUẨN BỊ RUN")
      .setDescription(
        [2, 3].includes(context.gameplayVersion)
          ? "**1. Chọn nhân vật** để xem chỉ số và kỹ năng.\n**2. Nhập xu** để đặt mức cược.\n**3. Tiếp** để chọn đồ/vé, xem chỉ số rồi xác nhận Bắt đầu."
          : "**1. Chọn nhân vật** để xem chỉ số và kỹ năng.\n**2. Nhập xu** để đặt mức cược.\n**3. Bắt đầu** khi đã chọn xong; xu được giữ cho run lúc xác nhận.",
      )
      .addFields(
        {
          name: "🎲 Cược đã chọn",
          value:
            draft.stake == null
              ? "Chưa nhập"
              : `${formatCoins(draft.stake)} xu${validStake ? "" : " · Không hợp lệ"}`,
          inline: true,
        },
        {
          name: "📏 Giới hạn cược",
          value: `10–${formatCoins(context.maxBet)} xu. Xem số dư qua /hoso.`,
          inline: true,
        },
      );
    if (character) {
      if (![2, 3].includes(context.gameplayVersion))
        embed.addFields(
          {
            name: `${character.emoji} ${character.name}`,
            value:
              CLASS_PROFILES[draft.classKey]?.role ||
              require("../../ui/index").setupPreview(draft.classKey).role,
          },
          {
            name: "📊 Chỉ số ban đầu",
            value: `${healthBar(character.hp, character.hp)}\n${STAT_EMOJI.attack} ATK ${character.damageMin}–${character.damageMax} · ${STAT_EMOJI.defense} DEF ${character.defense} · ${STAT_EMOJI.resistance} RES ${character.resistance}%\n${STAT_EMOJI.energy} ENE ${character.energy}/${character.energy} · ${STAT_EMOJI.potions} POT 3 · ${STAT_EMOJI.tickets} Vé thoát 0\n${STAT_EMOJI.accuracy} ACC ${character.accuracy} · ${STAT_EMOJI.evasion} EVA ${character.evasion} · ${STAT_EMOJI.crit} CRIT ${Math.round(character.critChance * 100)}% · ${STAT_EMOJI.luck} LUCK 0`,
          },
          {
            name: `✨ ${character.skill} · 2 ENE`,
            value:
              CLASS_PROFILES[draft.classKey]?.effect ||
              require("../../ui/index").setupPreview(draft.classKey).skill,
          },
        );
      if ([2, 3].includes(context.gameplayVersion)) {
        const preview = require("../../ui/index").setupPreview(draft.classKey);
        embed.addFields(
          ...splitRuleFields([
            { name: preview.name, value: preview.stats },
            { name: "🧭 Hướng build", value: preview.build },
            { name: `${icon("PHYS", "⚔️")} Tấn công`, value: preview.attack },
            { name: `${icon("DEF", "🛡️")} Phòng thủ`, value: preview.defend },
            {
              name: `${preview.skillIcon} ${character.skill} · 2 Mana`,
              value: preview.skill,
            },
            { name: "📖 Đặc tính / nội tại", value: preview.passive },
            { name: "⛩️ Phước lành có điều kiện", value: preview.shrine },
          ]),
        );
      }
    }
    embed
      .addFields({
        name: "📖 Ký hiệu",
        value: [2, 3].includes(context.gameplayVersion)
          ? `${icon("STR")} STR: vật lý/DEF · ${icon("DEX")} DEX: trúng/né/Crit\n${icon("VIT")} VIT: HP/bình máu · ${icon("ENE")} ENE: phép/RES/Max Mana\n${icon("HP", "❤️")} HP · ${icon("MANA", "💧")} Mana · ${icon("DEF", "🛡️")} DEF · ${icon("potion", "🧪")} Bình. ENE là thuộc tính; Mana dùng skill.\nChọn nhân vật để xem hướng build và cơ chế từng hành động. Mỗi 5 tầng: hồi đầy HP, thêm 2 bình, chọn +5 thuộc tính. Rút thưởng mới nhận xu/gem; tử trận mất toàn bộ.`
          : "❤️ HP · ⚔️ ATK · 🛡️ DEF · 🎯 ACC · 💨 EVA · 💥 CRIT · 🔮 RES · ✨ ENE · 🍀 LUCK · 🧪 POT · 🎫 vé.\nRút thưởng để chốt xu và kim cương tạm giữ; tử trận mất toàn bộ. Mỗi 5 tầng có checkpoint hồi đầy HP.",
      })
      .setFooter({
        text: `Sinh tồn ${[2, 3].includes(context.gameplayVersion) ? `${context.mode?.startsWith("tower") || context.towerChallengeId ? "v3.0.0" : "v3.1.0"} · ` : "legacy · "}Bảng chuẩn bị hết hạn sau 5 phút không thao tác.`,
      });
    const customId = (action) =>
      `hardcore-setup:${draft.id}:${draft.version}:${action}`;
    const select = new StringSelectMenuBuilder()
      .setCustomId(customId("class"))
      .setPlaceholder("Chọn nhân vật và xem kỹ năng")
      .addOptions(
        Object.entries(classes).map(([value, entry]) => ({
          label: entry.name,
          value,
          emoji: [2, 3].includes(context.gameplayVersion)
            ? require("../../engine/stats").CLASSES[value].emoji
            : entry.emoji,
          description: [2, 3].includes(context.gameplayVersion)
            ? require("../../ui/index").setupPreview(value).role.slice(0, 100)
            : CLASS_PROFILES[value].role,
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
            .setCustomId(
              customId(
                [2, 3].includes(context.gameplayVersion) ? "next" : "start",
              ),
            )
            .setLabel(
              [2, 3].includes(context.gameplayVersion) ? "Tiếp" : "Bắt đầu",
            )
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
    const amount = new TextInputBuilder()
      .setCustomId("amount")
      .setLabel(`Số xu cược (10–${formatCoins(maxBet)})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(6)
      .setPlaceholder("Ví dụ: 1000 (chỉ nhập chữ số)");
    if (draft.stake != null) amount.setValue(String(draft.stake));
    return new ModalBuilder()
      .setCustomId(`hardcore-setup-modal:${draft.id}:${draft.version}:bet`)
      .setTitle("Sinh tồn · Nhập số xu cược")
      .addComponents(new ActionRowBuilder().addComponents(amount));
  }
  return { hardcoreSetupPayload, hardcoreBetModal };
};
