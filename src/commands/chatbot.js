const { SlashCommandBuilder, ChannelType, MessageFlags } = require("discord.js");
const chatbot = require("../services/chatbotService");
const { getGameByChannel } = require("../services/gameChannelService");

const busy = new Set(); // một yêu cầu một lúc cho mỗi người

function errorText(result) {
  if (result.error === "DISABLED") return "Chatbot chưa được cấu hình (thiếu khóa hoặc model). Hãy nhờ admin kiểm tra.";
  if (result.error === "TOO_LONG") return `Câu hỏi quá dài (tối đa ${result.max} ký tự).`;
  if (result.error === "LIMIT")
    return `Bạn đã dùng hết **${result.limit} lượt** chat hôm nay. Lượt mới có lại lúc 00:00 giờ Việt Nam.`;
  if (result.error === "FLAGGED") return "Mình không thể trả lời nội dung này.";
  if (result.status === 429)
    return "Chatbot đang quá tải hoặc hết hạn mức, thử lại sau ít phút nhé. Lượt của bạn chưa bị trừ.";
  return "Chatbot đang bận, thử lại sau nhé. Lượt của bạn chưa bị trừ.";
}

async function ask(interaction) {
  const channelId = chatbot.getChannelId(interaction.guildId);
  const ephemeral = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!channelId) return ephemeral("Server chưa mở kênh chatbot. Hãy nhờ admin dùng `/chatbot kenh`.");
  if (interaction.channelId !== channelId) return ephemeral(`Hãy dùng \`/chatbot hoi\` trong kênh <#${channelId}>.`);
  const u = chatbot.usage(interaction.guildId, interaction.user.id);
  if (u.remaining <= 0) return ephemeral(errorText({ error: "LIMIT", limit: u.limit }));
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (busy.has(key)) return ephemeral("Bạn đang có một câu hỏi chưa trả lời xong, đợi chút nhé.");
  busy.add(key);
  try {
    await interaction.deferReply();
    const result = await chatbot.ask({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      text: interaction.options.getString("noidung"),
    });
    if (result.error === "API")
      console.warn(
        JSON.stringify({ level: 40, msg: "chatbot provider request failed", status: result.status, detail: result.detail, body: result.body }),
      );
    const content = result.ok ? `${result.text}\n-# Còn ${result.remaining}/${result.limit} lượt hôm nay` : errorText(result);
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } finally {
    busy.delete(key);
  }
}

const command = {
  data: new SlashCommandBuilder()
    .setName("chatbot")
    .setDescription("Chatbot AI")
    .addSubcommand((sub) =>
      sub
        .setName("hoi")
        .setDescription("Hỏi chatbot một câu")
        .addStringOption((option) =>
          option
            .setName("noidung")
            .setDescription("Câu bạn muốn hỏi")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(chatbot.MAX_INPUT_CHARS),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("kenh")
        .setDescription("Admin: chọn kênh được dùng chatbot")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh văn bản dùng /chatbot hoi")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("gioihan")
        .setDescription("Admin: đặt số lượt chat mỗi người mỗi ngày")
        .addIntegerOption((option) =>
          option
            .setName("so")
            .setDescription(`Số lượt mỗi người mỗi ngày (${chatbot.MIN_LIMIT}-${chatbot.MAX_LIMIT})`)
            .setRequired(true)
            .setMinValue(chatbot.MIN_LIMIT)
            .setMaxValue(chatbot.MAX_LIMIT),
        ),
    )
    .addSubcommand((sub) => sub.setName("tat").setDescription("Admin: tắt chatbot (bỏ kênh)"))
    .addSubcommand((sub) => sub.setName("luot").setDescription("Xem số lượt chat còn lại hôm nay")),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({ content: "Chatbot chỉ dùng được trong server.", flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (sub === "hoi") return ask(interaction);
    if (sub === "luot") {
      const u = chatbot.usage(interaction.guildId, interaction.user.id);
      const channelId = chatbot.getChannelId(interaction.guildId);
      return reply(
        `Bạn còn **${u.remaining}/${u.limit} lượt** chat hôm nay (đặt lại lúc 00:00 giờ Việt Nam).${channelId ? `\nKênh chatbot: <#${channelId}>` : "\nServer chưa mở kênh chatbot."}`,
      );
    }
    if (!require("./vuatiengviet").isAdmin(interaction)) return reply("Chỉ admin mới được cấu hình chatbot.");
    if (sub === "gioihan") {
      const n = chatbot.setDailyLimit(interaction.guildId, interaction.options.getInteger("so"), interaction.user.id);
      return reply(`✅ Mỗi người được **${n} lượt chat mỗi ngày**. Áp dụng ngay, kể cả với lượt đã dùng hôm nay.`);
    }
    if (sub === "tat")
      return reply(chatbot.clearChannel(interaction.guildId) ? "🛑 Đã tắt chatbot." : "Server chưa mở kênh chatbot.");
    if (!chatbot.isConfigured()) return reply("Chưa đặt `OPENAI_API_KEY` hoặc model nên chưa thể bật chatbot.");
    const channel = interaction.options.getChannel("kenh");
    if (getGameByChannel(interaction.guildId, channel.id))
      return reply("Kênh này đang dùng cho game, hãy chọn kênh khác.");
    chatbot.setChannel(interaction.guildId, channel.id, interaction.user.id);
    return reply(
      `✅ Chatbot dùng được ở <#${channel.id}> bằng \`/chatbot hoi\`. Mỗi người có **${chatbot.dailyLimit(interaction.guildId)} lượt/ngày**. Câu hỏi sẽ được gửi tới nhà cung cấp AI để trả lời.`,
    );
  },
  errorText,
};

module.exports = command;
