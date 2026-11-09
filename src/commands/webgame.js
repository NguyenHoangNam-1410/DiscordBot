"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const catalog = require("../webGames/public/game-catalog");
const { readConfig } = require("../webGames/config");
const { splitRuleFields } = require("../hardcore/ui/rulePages");

const GAMES_PER_PAGE = 5;
const RULE_FIELDS_PER_PAGE = 2;
function clampPage(requested, pages) {
  const page = Number(requested);
  return Math.max(
    0,
    Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0),
  );
}
function ruleFields(game) {
  const fields = [
    {
      name: "1. Chuẩn bị",
      value: game.setup.map((text, i) => `${i + 1}. ${text}`).join("\n"),
    },
    {
      name: "2. Mỗi lượt",
      value: game.play.map((text, i) => `${i + 1}. ${text}`).join("\n"),
    },
    {
      name: "Thắng nếu",
      value: [...game.win, catalog.commonWin]
        .map((text) => `• ${text}`)
        .join("\n"),
    },
    {
      name: "Thua nếu",
      value: [...game.lose, catalog.commonLoss]
        .map((text) => `• ${text}`)
        .join("\n"),
    },
  ];
  if (game.draw.length)
    fields.push({
      name: "Hòa / đóng phòng",
      value: game.draw.map((text) => `• ${text}`).join("\n"),
    });
  if (game.special?.length)
    fields.push({
      name: "Ngoại lệ cần nhớ",
      value: game.special.map((text) => `• ${text}`).join("\n"),
    });
  fields.push({ name: "Đồng hồ và kết nối", value: catalog.clock });
  return splitRuleFields(fields);
}
function pageButton(ownerId, selected, page, label) {
  return new ButtonBuilder()
    .setCustomId(`webgame:page:${ownerId}:${selected}:${page}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}
function payload(ownerId, selected = "list", requestedPage = 0) {
  const gameIndex = catalog.games.findIndex((item) => item.id === selected);
  const game = catalog.games[gameIndex];
  const listPages = Math.max(
    1,
    Math.ceil(catalog.games.length / GAMES_PER_PAGE),
  );
  const fields = game ? ruleFields(game) : null;
  const pages = game
    ? Math.max(1, Math.ceil(fields.length / RULE_FIELDS_PER_PAGE))
    : listPages;
  const page = clampPage(requestedPage, pages);
  const listPage = game ? Math.floor(gameIndex / GAMES_PER_PAGE) : page;
  const shown = catalog.games.slice(
    listPage * GAMES_PER_PAGE,
    (listPage + 1) * GAMES_PER_PAGE,
  );
  const embed = new EmbedBuilder().setColor(0x5865f2);
  if (game) {
    embed
      .setTitle(`Luật chơi · ${game.name}`)
      .setDescription(
        `Mở phòng: \`/${game.id} choi\` · Xem phòng: \`/${game.id} phong\``,
      )
      .addFields(
        fields.slice(
          page * RULE_FIELDS_PER_PAGE,
          (page + 1) * RULE_FIELDS_PER_PAGE,
        ),
      )
      .setFooter({ text: `Trang ${page + 1}/${pages} · Luật ${game.name}` });
  } else {
    embed
      .setTitle(`Game web · ${catalog.games.length} trò chơi đối kháng`)
      .setDescription(
        "Chọn game trong trang này để xem luật từng bước. Tạo phòng bằng lệnh bên dưới; người còn lại bấm **Tham gia**, rồi mở bàn web.",
      )
      .addFields(
        shown.map((item) => ({
          name: item.name,
          value: `${item.summary}\n\`/${item.id} choi\` · \`/${item.id} phong\``,
        })),
      )
      .setFooter({
        text: `Trang ${page + 1}/${pages} · 2 người chơi · Có khán giả · Không cược xu · !webgame cũng dùng được khi bật prefix`,
      });
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`webgame:${ownerId}:${listPage}`)
    .setPlaceholder(`Chọn game · Trang danh sách ${listPage + 1}/${listPages}`)
    .addOptions(
      { label: "Danh sách game web", value: "list", default: !game },
      ...shown.map((item) => ({
        label: item.name,
        value: item.id,
        description: item.summary,
        default: item.id === selected,
      })),
    );
  const components = [new ActionRowBuilder().addComponents(menu)];
  if (pages > 1 || game) {
    const navigation = new ActionRowBuilder().addComponents(
      pageButton(
        ownerId,
        game?.id || "list",
        Math.max(0, page - 1),
        "Trước",
      ).setDisabled(page === 0),
    );
    if (game)
      navigation.addComponents(
        pageButton(ownerId, "list", listPage, "Danh sách"),
      );
    navigation.addComponents(
      pageButton(
        ownerId,
        game?.id || "list",
        Math.min(pages - 1, page + 1),
        "Sau",
      ).setDisabled(page === pages - 1),
    );
    components.push(navigation);
  }
  const config = readConfig();
  if (config.enabled)
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Mở danh sách trên web")
          .setURL(config.origin),
      ),
    );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
function validSelection(selected) {
  return (
    selected === "list" || catalog.games.some((game) => game.id === selected)
  );
}
function invalid(interaction) {
  return interaction.reply({
    content: "Trang hoặc trò chơi không hợp lệ. Hãy mở lại /webgame.",
    flags: MessageFlags.Ephemeral,
  });
}
function denied(interaction) {
  return interaction.reply({
    content: "Dùng /webgame để mở danh sách của bạn.",
    flags: MessageFlags.Ephemeral,
  });
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName("webgame")
    .setDescription("Danh sách game web và hướng dẫn từng bước"),
  payload,
  async execute(interaction) {
    return interaction.reply({
      ...payload(interaction.user.id),
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleSelect(interaction) {
    const match = /^webgame:([^:]{1,30})(?::(\d{1,6}))?$/.exec(
      interaction.customId || "",
    );
    if (!match) return invalid(interaction);
    const [, ownerId, pageText] = match;
    if (ownerId !== interaction.user.id) return denied(interaction);
    const selected = interaction.values?.[0];
    if (!validSelection(selected)) return invalid(interaction);
    return interaction.update(
      payload(
        ownerId,
        selected,
        selected === "list" ? Number(pageText || 0) : 0,
      ),
    );
  },
  async handleButton(interaction) {
    const match =
      /^webgame:page:([^:]{1,30}):([a-z][a-z0-9-]{0,31}):(\d{1,6})$/.exec(
        interaction.customId || "",
      );
    if (!match) return invalid(interaction);
    const [, ownerId, selected, pageText] = match;
    if (ownerId !== interaction.user.id) return denied(interaction);
    if (!validSelection(selected)) return invalid(interaction);
    return interaction.update(payload(ownerId, selected, Number(pageText)));
  },
};
