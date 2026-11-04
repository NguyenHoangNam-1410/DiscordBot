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

function payload(ownerId, selected = "list") {
  const game = catalog.games.find((item) => item.id === selected);
  const embed = new EmbedBuilder().setColor(0x5865f2);
  if (game) {
    embed
      .setTitle(`Luật chơi · ${game.name}`)
      .setDescription(
        `Mở phòng: \`/${game.id} choi\` · Xem phòng: \`/${game.id} phong\``,
      )
      .addFields(
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
      );
    if (game.draw.length)
      embed.addFields({
        name: "Hòa / đóng phòng",
        value: game.draw.map((text) => `• ${text}`).join("\n"),
      });
    embed.addFields({ name: "Đồng hồ và kết nối", value: catalog.clock });
  } else {
    embed
      .setTitle("Game web · 8 trò chơi đối kháng")
      .setDescription(
        "Chọn game ở menu để xem các bước chuẩn bị, cách chơi và điều kiện thắng/thua. Tạo phòng bằng lệnh bên dưới; người còn lại bấm **Tham gia**, rồi mở bàn web.",
      )
      .addFields(
        catalog.games.map((item) => ({
          name: item.name,
          value: `${item.summary}\n\`/${item.id} choi\` · \`/${item.id} phong\``,
        })),
      );
    embed.setFooter({
      text: "2 người chơi · Có khán giả · Không cược xu · !webgame cũng dùng được khi bật prefix",
    });
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`webgame:${ownerId}`)
    .setPlaceholder("Chọn game để xem luật…")
    .addOptions(
      { label: "Danh sách game web", value: "list", default: !game },
      ...catalog.games.map((item) => ({
        label: item.name,
        value: item.id,
        description: item.summary,
        default: item.id === selected,
      })),
    );
  const components = [new ActionRowBuilder().addComponents(menu)];
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
    const ownerId = interaction.customId.split(":")[1];
    if (ownerId !== interaction.user.id)
      return interaction.reply({
        content: "Dùng /webgame để mở danh sách của bạn.",
        flags: MessageFlags.Ephemeral,
      });
    const selected = interaction.values[0];
    if (
      selected !== "list" &&
      !catalog.games.some((game) => game.id === selected)
    )
      return interaction.reply({
        content: "Trò chơi không hợp lệ. Hãy mở lại /webgame.",
        flags: MessageFlags.Ephemeral,
      });
    return interaction.update(payload(ownerId, selected));
  },
};
