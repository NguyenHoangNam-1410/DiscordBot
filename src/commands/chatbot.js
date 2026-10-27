const { SlashCommandBuilder, ChannelType, EmbedBuilder, MessageFlags } = require("discord.js");
const chatbot = require("../services/chatbotService");
const accounting = require("../services/chatbotUsageService");

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

// Tên hiển thị trong server (biệt danh) để bot biết ai là ai.
async function displayName(interaction, id) {
  const guild = interaction.guild;
  const member = guild?.members?.cache?.get(id) || (await guild?.members?.fetch?.(id).catch(() => null));
  const user = member?.user || interaction.client?.users?.cache?.get(id) || (await interaction.client?.users?.fetch?.(id).catch(() => null));
  return member?.displayName || user?.globalName || user?.username || null;
}
const FACT_MENTION = /<@!?(\d{5,25})>/g;

async function ask(interaction) {
  const channelId = chatbot.getChannelId(interaction.guildId);
  const ephemeral = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  // Mặc định dùng được ở mọi kênh; chỉ khi admin đã giới hạn bằng `/chatbot kenh` mới phải đúng kênh đó.
  if (channelId && interaction.channelId !== channelId)
    return ephemeral(`Admin đã giới hạn chatbot ở kênh <#${channelId}>. Hãy dùng \`/chatbot hoi\` ở đó.`);
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
    // Lệnh slash không biến "@tên" trong chuỗi thành mention, nên có thêm tùy chọn "nguoi".
    const target = interaction.options.getUser?.("nguoi");
    const rawText = `${interaction.options.getString("noidung")}${target ? ` <@${target.id}>` : ""}`;
    const question = chatbot.prepareQuestion(rawText, {
      askerId: interaction.user.id,
      botId: interaction.client?.user?.id,
    });
    // Người hỏi + những người được nhắc trong câu hỏi hoặc trong thông tin server của admin.
    const asker = {
      id: interaction.user.id,
      name: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
    };
    const factIds = chatbot
      .listFacts(interaction.guildId)
      .flatMap((fact) => [...fact.content.matchAll(FACT_MENTION)].map((m) => m[1]));
    const ids = [...new Set([...question.pinged, ...factIds])].filter((id) => id !== asker.id).slice(0, 12);
    const people = (await Promise.all(ids.map(async (id) => ({ id, name: await displayName(interaction, id) })))).filter((p) => p.name);
    const result = await chatbot.ask({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      text: question.text,
      asker,
      people,
    });
    if (result.error === "API")
      console.warn(
        JSON.stringify({ level: 40, msg: "chatbot provider request failed", status: result.status, detail: result.detail, body: result.body }),
      );
    // Chỉ ping người hỏi và những người họ nhắc tới; tuyệt đối không ping vai trò, @everyone, @here.
    const allowed = [interaction.user.id, ...question.pinged];
    const content = result.ok
      ? `<@${interaction.user.id}> ${chatbot.sanitizeReply(result.text, allowed, Object.fromEntries(people.map((p) => [p.id, p.name])))}\n-# Còn ${result.remaining}/${result.limit} lượt hôm nay`
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
    .addSubcommand(sub => sub.setName("cauhinh").setDescription("Admin: cấu hình chatbot, không bao gồm khóa API"))
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
        )
        .addUserOption((option) => option.setName("nguoi").setDescription("Người bạn muốn nhắc tới (bot sẽ gọi lại họ)")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("kenh")
        .setDescription("Admin: (tùy chọn) chỉ cho dùng chatbot ở một kênh")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh duy nhất được dùng /chatbot hoi")
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
            .setDescription(`Một thông tin ngắn (tối đa ${chatbot.FACT_INPUT_CHARS} ký tự)`)
            .setRequired(true)
            .setMaxLength(chatbot.FACT_INPUT_CHARS),
        )
        .addUserOption((option) =>
          option.setName("nguoi").setDescription("Gắn thông tin này cho một người (ví dụ cách xưng hô với họ)"),
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
    .addSubcommand((sub) => sub.setName("kienthuc").setDescription("Admin: xem những gì chatbot được dạy về server"))
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
    .addSubcommand((sub) => sub.setName("tat").setDescription("Admin: bỏ giới hạn kênh (chatbot dùng ở mọi kênh)"))
    .addSubcommand((sub) => sub.setName("luot").setDescription("Xem số lượt chat còn lại hôm nay"))
    .addSubcommand((sub) =>
      sub
        .setName("thongke")
        .setDescription("Admin: báo cáo usage, model và chi phí chatbot")
        .addIntegerOption((option) =>
          option
            .setName("thoigian")
            .setDescription("Khoảng thời gian theo giờ Việt Nam")
            .addChoices(
              { name: "Hôm nay", value: 1 },
              { name: "7 ngày", value: 7 },
              { name: "30 ngày", value: 30 },
            ),
        )
        .addUserOption((option) =>
          option
            .setName("nguoi")
            .setDescription("Lọc một người chơi; bỏ trống để xem toàn server"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("dongia")
        .setDescription("Admin: đặt giá USD để ước tính chi phí của một model")
        .addStringOption((option) =>
          option
            .setName("model")
            .setDescription(
              "Tên model chính xác; áp dụng cho endpoint hiện tại",
            )
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(200),
        )
        .addNumberOption((option) =>
          option
            .setName("input")
            .setDescription("USD / 1 triệu input token")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(1000000),
        )
        .addNumberOption((option) =>
          option
            .setName("output")
            .setDescription("USD / 1 triệu output token, gồm token suy nghĩ")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(1000000),
        )
        .addNumberOption((option) =>
          option
            .setName("cache")
            .setDescription(
              "USD / 1 triệu cached input token; mặc định bằng input",
            )
            .setMinValue(0)
            .setMaxValue(1000000),
        )
        .addNumberOption((option) =>
          option
            .setName("timkiem")
            .setDescription(
              "Ước tính USD / 1.000 truy vấn nguồn Google Search; bỏ trống = chưa biết",
            )
            .setMinValue(0)
            .setMaxValue(1000000),
        ),
    ),

  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({ content: "Chatbot chỉ dùng được trong server.", flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (sub === "cauhinh") return require("./game").openConfig(interaction, "chatbot");
    if (sub === "hoi") return ask(interaction);
    if (sub === "luot") {
      const u = chatbot.usage(interaction.guildId, interaction.user.id);
      const channelId = chatbot.getChannelId(interaction.guildId);
      return reply(
        `Bạn còn **${u.remaining}/${u.limit} lượt** chat hôm nay (đặt lại lúc 00:00 giờ Việt Nam).${channelId ? `\nAdmin đã giới hạn chatbot ở kênh <#${channelId}>.` : "\nChatbot dùng được ở mọi kênh."}`,
      );
    }
    if (sub === "kienthuc") {
      if (!require("./vuatiengviet").isAdmin(interaction)) return reply("Chỉ admin mới được xem kiến thức của chatbot.");
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
    if (sub === "thongke") {
      return interaction.reply({
        ...accounting.panel(interaction.guildId, interaction.user.id, {
          days: interaction.options.getInteger("thoigian") || 1,
          userId: interaction.options.getUser("nguoi")?.id || null,
        }),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub === "dongia") {
      try {
        const rates = accounting.setPrice({
          guildId: interaction.guildId,
          endpoint: chatbot.baseUrl(interaction.guildId),
          model: interaction.options.getString("model", true),
          input: interaction.options.getNumber("input", true),
          output: interaction.options.getNumber("output", true),
          cached:
            interaction.options.getNumber("cache") ??
            interaction.options.getNumber("input", true),
          search: interaction.options.getNumber("timkiem"),
          adminId: interaction.user.id,
        });
        return interaction.reply({
          content: `✅ Đã đặt đơn giá **${rates.model}** cho endpoint hiện tại trong server này.\nInput ${accounting.usd(rates.input_per_million)} / Output ${accounting.usd(rates.output_per_million)} / Cache ${accounting.usd(rates.cached_per_million)} trên 1 triệu token.\nGoogle Search: ${accounting.usd(rates.search_per_thousand)} / 1.000 truy vấn nguồn.\nÁp dụng cho lần gọi mới; không tính lại lịch sử. Giá do admin nhập là ước tính, cần đúng gói/bậc giá đang dùng.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        if (error.message === "INVALID_CHATBOT_PRICE")
          return reply(
            "Tên model hoặc đơn giá không hợp lệ. Giá USD phải từ 0 đến 1.000.000.",
          );
        throw error;
      }
    }
    if (sub === "nho") {
      try {
        const about = interaction.options.getUser?.("nguoi");
        const note = interaction.options.getString("noidung");
        const count = chatbot.addFact(
          interaction.guildId,
          about && !note.includes(`<@${about.id}>`) ? `<@${about.id}>: ${note}` : note,
          interaction.user.id,
        );
        return reply(
          `✅ Đã dạy chatbot (${count}/${chatbot.MAX_FACTS}). Thông tin này được gửi tới nhà cung cấp AI và chỉ admin xem được bằng \`/chatbot kienthuc\`, **đừng ghi thông tin nhạy cảm**.`,
        );
      } catch (error) {
        const text = {
          EMPTY_FACT: "Nội dung trống.",
          FACT_TOO_LONG: `Tối đa ${chatbot.MAX_FACT_CHARS} ký tự mỗi thông tin.`,
          FACT_TOTAL_LIMIT: `Tổng độ dài các thông tin đã đạt giới hạn ${chatbot.MAX_FACTS_TOTAL_CHARS} ký tự; hãy xóa bớt hoặc rút gọn bằng \`/chatbot quen\`.`,
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
      return reply(
        chatbot.clearChannel(interaction.guildId)
          ? "✅ Đã bỏ giới hạn kênh: chatbot dùng được ở mọi kênh."
          : "Chatbot chưa bị giới hạn kênh, đang dùng được ở mọi kênh.",
      );
    if (!chatbot.isConfigured()) return reply("Chưa đặt `OPENAI_API_KEY` hoặc model nên chưa thể bật chatbot.");
    const channel = interaction.options.getChannel("kenh");
    chatbot.setChannel(interaction.guildId, channel.id, interaction.user.id);
    return reply(
      `✅ Chatbot chỉ dùng được ở <#${channel.id}> (dùng \`/chatbot tat\` để bỏ giới hạn). Mỗi người có **${chatbot.dailyLimit(interaction.guildId)} lượt/ngày**. Câu hỏi sẽ được gửi tới nhà cung cấp AI để trả lời.`,
    );
  },
  errorText,
};

module.exports = command;
