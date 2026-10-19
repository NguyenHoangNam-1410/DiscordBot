const { SlashCommandBuilder, ChannelType, EmbedBuilder, MessageFlags } = require("discord.js");
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

// Phản ứng (emoji mặc định) lên tin nhắn của người hỏi khi dùng !hoi; lệnh slash không có tin nhắn để react.
async function react(interaction, ...emojis) {
  const message = interaction.sourceMessage;
  if (!message?.react) return;
  for (const emoji of emojis) await message.react(emoji).catch(() => null);
}
async function unreact(interaction, emoji) {
  const message = interaction.sourceMessage;
  const mine = message?.client?.user?.id;
  if (!mine) return;
  await message.reactions?.cache?.get(emoji)?.users?.remove(mine).catch(() => null);
}

async function ask(interaction) {
  const channelId = chatbot.getChannelId(interaction.guildId);
  const ephemeral = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!channelId) return ephemeral("Server chưa mở kênh chatbot. Hãy nhờ admin dùng `/chatbot kenh`.");
  if (interaction.channelId !== channelId) return ephemeral(`Hãy dùng \`/chatbot hoi\` trong kênh <#${channelId}>.`);
  const u = chatbot.usage(interaction.guildId, interaction.user.id);
  if (u.remaining <= 0) {
    await react(interaction, "⛔");
    return ephemeral(errorText({ error: "LIMIT", limit: u.limit }));
  }
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (busy.has(key)) return ephemeral("Bạn đang có một câu hỏi chưa trả lời xong, đợi chút nhé.");
  busy.add(key);
  try {
    await interaction.deferReply();
    await react(interaction, "🤔");
    const question = chatbot.prepareQuestion(interaction.options.getString("noidung"), {
      askerId: interaction.user.id,
      botId: interaction.client?.user?.id,
    });
    const result = await chatbot.ask({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      text: question.text,
    });
    if (result.error === "API")
      console.warn(
        JSON.stringify({ level: 40, msg: "chatbot provider request failed", status: result.status, detail: result.detail, body: result.body }),
      );
    // Chỉ ping người hỏi và những người họ nhắc tới; tuyệt đối không ping vai trò, @everyone, @here.
    const allowed = [interaction.user.id, ...question.pinged];
    const content = result.ok
      ? `<@${interaction.user.id}> ${chatbot.sanitizeReply(result.text, allowed)}\n-# Còn ${result.remaining}/${result.limit} lượt hôm nay`
      : errorText(result);
    await interaction.editReply({ content, allowedMentions: { parse: [], users: allowed, roles: [] } });
    await unreact(interaction, "🤔");
    await react(interaction, result.ok ? "✅" : result.error === "LIMIT" ? "⛔" : "❌");
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
    .addSubcommand((sub) =>
      sub
        .setName("nho")
        .setDescription("Admin: dạy chatbot một thông tin về server")
        .addStringOption((option) =>
          option
            .setName("noidung")
            .setDescription(`Một thông tin ngắn (tối đa ${chatbot.MAX_FACT_CHARS} ký tự)`)
            .setRequired(true)
            .setMaxLength(chatbot.MAX_FACT_CHARS),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("quen")
        .setDescription("Admin: xóa một thông tin đã dạy chatbot")
        .addIntegerOption((option) =>
          option.setName("so").setDescription("Số thứ tự trong /chatbot kienthuc").setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) => sub.setName("kienthuc").setDescription("Xem những gì chatbot được dạy về server"))
    .addSubcommand((sub) =>
      sub
        .setName("tinhcach")
        .setDescription("Admin: đặt giọng điệu cho chatbot (bỏ trống để xóa)")
        .addStringOption((option) =>
          option
            .setName("mota")
            .setDescription(`Ví dụ: hài hước, hay dùng emoji (tối đa ${chatbot.MAX_PERSONA_CHARS} ký tự)`)
            .setMaxLength(chatbot.MAX_PERSONA_CHARS),
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
    if (sub === "kienthuc") {
      const facts = chatbot.listFacts(interaction.guildId);
      const persona = chatbot.getPersona(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📚 KIẾN THỨC CỦA CHATBOT")
        .setDescription(
          [
            persona ? `**Giọng điệu:** ${persona}` : "**Giọng điệu:** mặc định",
            facts.length ? facts.map((f, i) => `**${i + 1}.** ${f.content}`).join("\n") : "Chưa có thông tin nào về server.",
          ].join("\n\n"),
        )
        .setFooter({ text: `${facts.length}/${chatbot.MAX_FACTS} thông tin · Admin thêm bằng /chatbot nho` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    if (!require("./vuatiengviet").isAdmin(interaction)) return reply("Chỉ admin mới được cấu hình chatbot.");
    if (sub === "nho") {
      try {
        const count = chatbot.addFact(interaction.guildId, interaction.options.getString("noidung"), interaction.user.id);
        return reply(
          `✅ Đã dạy chatbot (${count}/${chatbot.MAX_FACTS}). Thông tin này được gửi tới nhà cung cấp AI và ai cũng xem được bằng \`/chatbot kienthuc\`, **đừng ghi thông tin nhạy cảm**.`,
        );
      } catch (error) {
        const text = {
          EMPTY_FACT: "Nội dung trống.",
          FACT_TOO_LONG: `Tối đa ${chatbot.MAX_FACT_CHARS} ký tự mỗi thông tin.`,
          FACT_LIMIT: `Đã đủ ${chatbot.MAX_FACTS} thông tin; hãy xóa bớt bằng \`/chatbot quen\`.`,
        }[error.message];
        if (!text) throw error;
        return reply(text);
      }
    }
    if (sub === "quen") {
      const removed = chatbot.removeFact(interaction.guildId, interaction.options.getInteger("so"));
      return reply(removed ? `🗑️ Đã xóa: ${removed.content}` : "Không có thông tin với số thứ tự đó.");
    }
    if (sub === "tinhcach") {
      try {
        const persona = chatbot.setPersona(interaction.guildId, interaction.options.getString("mota"), interaction.user.id);
        return reply(persona ? `✅ Giọng điệu mới: ${persona}` : "✅ Đã đặt lại giọng điệu mặc định.");
      } catch (error) {
        if (error.message === "PERSONA_TOO_LONG") return reply(`Tối đa ${chatbot.MAX_PERSONA_CHARS} ký tự.`);
        throw error;
      }
    }
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
