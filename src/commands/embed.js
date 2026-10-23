const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  convertLink,
  setAutoEnabled,
  renderEmbedLink,
} = require("../services/embedLinkService");

const ERRORS = {
  INVALID_URL:
    "Link không hợp lệ. Hãy dán nguyên link YouTube, Facebook, Instagram, TikTok hoặc Douyin.",
  NO_VIDEO: "Link này không trỏ tới một video cụ thể.",
  UNSUPPORTED_HOST:
    "Chỉ hỗ trợ link YouTube, Facebook, Instagram, TikTok và Douyin.",
  NO_EMBED_SERVICE:
    "Chưa cấu hình dịch vụ embed cho nền tảng này. Admin đặt biến `DOUYIN_EMBED_HOST` trong `.env` (Douyin chưa có dịch vụ mặc định).",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription(
      "Đổi link YouTube/Facebook/Instagram/TikTok/Douyin sang dạng hiện khung xem trước",
    )
    .addSubcommand((command) =>
      command
        .setName("chuyendoi")
        .setDescription("Đổi một link video mạng xã hội")
        .addStringOption((option) =>
          option
            .setName("link")
            .setDescription(
              "Link video YouTube, Facebook, Instagram, TikTok hoặc Douyin",
            )
            .setRequired(true)
            .setMaxLength(2000),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("tudong")
        .setDescription(
          "Admin: bật/tắt tự đổi link Facebook/Instagram/TikTok/Douyin",
        )
        .addStringOption((option) =>
          option
            .setName("trangthai")
            .setDescription("Bật hoặc tắt")
            .setRequired(true)
            .addChoices(
              { name: "Bật", value: "on" },
              { name: "Tắt", value: "off" },
            ),
        ),
    ),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === "tudong") {
      if (!interaction.guildId)
        return interaction.reply({
          content: "Lệnh này chỉ dùng được trong server.",
          flags: MessageFlags.Ephemeral,
        });
      if (!require("./vuatiengviet").isAdmin(interaction))
        return interaction.reply({
          content: "Chỉ admin mới được bật/tắt tự đổi link.",
          flags: MessageFlags.Ephemeral,
        });
      const enabled = interaction.options.getString("trangthai", true) === "on";
      setAutoEnabled(interaction.guildId, enabled, interaction.user.id);
      return interaction.reply({
        content: enabled
          ? "✅ Đã bật: bot tự trả link Facebook, Instagram, TikTok, Douyin dạng xem trước ở mọi kênh bot có quyền gửi tin nhắn."
          : "✅ Đã tắt tự đổi link. `/embed chuyendoi` vẫn dùng được.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const result = convertLink(interaction.options.getString("link", true));
    if (!result.ok)
      return interaction.reply({
        content: ERRORS[result.error] || ERRORS.INVALID_URL,
        flags: MessageFlags.Ephemeral,
      });
    if (result.kind === "youtube")
      return interaction.reply({
        content: result.url,
        allowedMentions: { parse: [] },
      });
    // Facebook/Instagram/TikTok/Douyin: lấy link video trực tiếp (chỉ có video); không có thì trả link embed.
    await interaction.deferReply();
    const rendered = await renderEmbedLink(
      result.url,
      null,
      interaction.options.getString("link", true).trim(),
    );
    return interaction.editReply({
      content: rendered.content,
      allowedMentions: { parse: [] },
    });
  },
};
