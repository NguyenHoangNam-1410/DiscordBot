const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { convertLink } = require("../services/embedLinkService");

const ERRORS = {
  INVALID_URL: "Link không hợp lệ. Hãy dán nguyên link YouTube hoặc Facebook.",
  NO_VIDEO: "Link này không trỏ tới một video cụ thể.",
  UNSUPPORTED_HOST: "Chỉ hỗ trợ link YouTube và Facebook.",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Đổi link YouTube/Facebook sang dạng hiện khung xem trước")
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("Link video YouTube hoặc Facebook")
        .setRequired(true)
        .setMaxLength(2000),
    ),
  async execute(interaction) {
    const result = convertLink(interaction.options.getString("link", true));
    if (!result.ok)
      return interaction.reply({
        content: ERRORS[result.error] || ERRORS.INVALID_URL,
        flags: MessageFlags.Ephemeral,
      });
    return interaction.reply({
      content: result.url,
      allowedMentions: { parse: [] },
    });
  },
};
