"use strict";
const { RNGESUS_CYCLE_RULES, rngesusChaosRules } = require("../events/rngesus");
const {
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { paginateRuleEmbed, splitRuleFields } = require("./rulePages");
const RATE_CATEGORIES = Object.freeze([
  {
    id: "encounters",
    name: "Encounter & sự kiện",
    emoji: "🌀",
  },
  {
    id: "loot",
    name: "Hòm, item & Luck",
    emoji: "🎁",
  },
  {
    id: "rngesus",
    name: "RNGesus",
    emoji: "☠️",
  },
  {
    id: "combat",
    name: "Chiến đấu & Rift",
    emoji: "⚔️",
  },
  {
    id: "rewards",
    name: "Dịch vụ & phần thưởng",
    emoji: "💎",
  },
]);
function buildRatesEmbed(category = null, guildId) {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(
      `🎰 SINH TỒN v${require("../shared/version").RELEASE.version} · TỶ LỆ VÀ CƠ CHẾ`,
    )
    .setDescription(
      `Run mới dùng v${require("../shared/version").RELEASE.version}. Kết quả ẩn được lưu; mở lại UI/restart không roll lại. Các phiên v2/v3 tiếp tục theo phiên bản đã lưu.`,
    )
    .addFields(splitRuleFields(require("./index").ratesFields(category)));
}

function ratesPages(category = "encounters", guildId) {
  const selected =
    RATE_CATEGORIES.find((item) => item.id === category) || RATE_CATEGORIES[0];
  const pages = paginateRuleEmbed(
    buildRatesEmbed(selected.id, guildId).setTitle(
      `🎰 SINH TỒN v${require("../shared/version").RELEASE.version} · ${selected.name.toUpperCase()}`,
    ),
  );
  return pages.map((page, index) =>
    page.setFooter({
      text: `Trang ${index + 1}/${pages.length} · ${selected.name}`,
    }),
  );
}

// Compatibility helper: an embed returned to a caller is always a bounded page.
function ratesEmbed(category = "encounters", guildId) {
  return ratesPages(category, guildId)[0];
}

function ratesPayload(
  userId,
  category = "encounters",
  requestedPage = 0,
  guildId,
) {
  const selected =
    RATE_CATEGORIES.find((item) => item.id === category) || RATE_CATEGORIES[0];
  const pages = ratesPages(selected.id, guildId);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(pages.length - 1, requestedPage))
    : 0;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`hardcore-rates:${userId}`)
    .setPlaceholder("Chọn nhóm tỷ lệ Sinh tồn…")
    .addOptions(
      RATE_CATEGORIES.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(item.id)
          .setEmoji(item.emoji)
          .setDefault(item.id === selected.id),
      ),
    );
  const components = [new ActionRowBuilder().addComponents(menu)];
  if (pages.length > 1)
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `hardcore-rates-page:${userId}:${selected.id}:${Math.max(0, page - 1)}`,
          )
          .setLabel("Trước")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(
            `hardcore-rates-page:${userId}:${selected.id}:${Math.min(pages.length - 1, page + 1)}`,
          )
          .setLabel("Sau")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
      ),
    );
  return { embeds: [pages[page]], components, allowedMentions: { parse: [] } };
}

async function handleSelect(interaction) {
  const [, ownerId] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId)
    return interaction.reply({
      content: "Chỉ người mở bảng tỷ lệ mới có thể chọn nhóm.",
      flags: MessageFlags.Ephemeral,
    });
  // Choosing another group always starts at its first page.
  return interaction.update(
    ratesPayload(ownerId, interaction.values[0], 0, interaction.guildId),
  );
}

async function handlePage(interaction) {
  const [, ownerId, category, pageText] = interaction.customId.split(":");
  if (interaction.user.id !== ownerId)
    return interaction.reply({
      content: "Chỉ người mở bảng tỷ lệ mới có thể chuyển trang.",
      flags: MessageFlags.Ephemeral,
    });
  const page = Number(pageText);
  if (
    !RATE_CATEGORIES.some((item) => item.id === category) ||
    !pageText ||
    !Number.isSafeInteger(page) ||
    page < 0
  )
    return interaction.reply({
      content: "Trang tỷ lệ không hợp lệ. Hãy mở lại /sinhton tyle.",
      flags: MessageFlags.Ephemeral,
    });
  return interaction.update(
    ratesPayload(ownerId, category, page, interaction.guildId),
  );
}

module.exports = {
  ratesEmbed,
  ratesPages,
  ratesPayload,
  handleSelect,
  handlePage,
};
