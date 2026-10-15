const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");
const chatbot = require("../services/chatbotService");
const { getGameByChannel } = require("../services/gameChannelService");

const command = {
  data: new SlashCommandBuilder()
    .setName("chatbot")
    .setDescription("Chatbot AI trong kênh riêng")
    .addSubcommand((sub) =>
      sub
        .setName("kenh")
        .setDescription("Admin: chọn kênh chatbot")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh văn bản dùng để chat với bot")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName("tat").setDescription("Admin: tắt kênh chatbot"))
    .addSubcommand((sub) => sub.setName("luot").setDescription("Xem số lượt chat còn lại hôm nay")),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({ content: "Chatbot chỉ dùng được trong server.", flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (sub === "luot") {
      const u = chatbot.usage(interaction.guildId, interaction.user.id);
      const channelId = chatbot.getChannelId(interaction.guildId);
      return reply(
        `Bạn còn **${u.remaining}/${u.limit} lượt** chat hôm nay (đặt lại lúc 00:00 giờ Việt Nam).${channelId ? `\nKênh chatbot: <#${channelId}>` : "\nServer chưa mở kênh chatbot."}`,
      );
    }
    if (!require("./vuatiengviet").isAdmin(interaction))
      return reply("Chỉ admin mới được cấu hình chatbot.");
    if (sub === "tat")
      return reply(chatbot.clearChannel(interaction.guildId) ? "🛑 Đã tắt kênh chatbot." : "Server chưa mở kênh chatbot.");
    if (!chatbot.isConfigured())
      return reply("Chưa đặt biến môi trường `OPENAI_API_KEY` nên chưa thể bật chatbot.");
    const channel = interaction.options.getChannel("kenh");
    if (getGameByChannel(interaction.guildId, channel.id))
      return reply("Kênh này đang dùng cho game, hãy chọn kênh khác để chat với bot.");
    chatbot.setChannel(interaction.guildId, channel.id, interaction.user.id);
    return reply(
      `✅ Đã mở chatbot ở <#${channel.id}>. Mỗi người có **${chatbot.usage(interaction.guildId, interaction.user.id).limit} lượt/ngày**. Tin nhắn trong kênh sẽ được gửi tới OpenAI để trả lời.`,
    );
  },
};

module.exports = command;
