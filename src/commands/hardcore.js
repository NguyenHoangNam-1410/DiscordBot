const {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require("discord.js");
const { requireGameChannel } = require("../utils/gameChannel");
const { formatCoins } = require("../utils/economy");
const {
  openHardcoreSetup,
  setMessageId,
  hardcoreEmbed,
  hardcoreRows,
  getHardcoreRecord,
  getHardcoreTop,
  getHardcoreRun,
} = require("../services/hardcoreService");

function recordEmbed(user, record) {
  const survival = record.runs
    ? Math.round((record.escapes / record.runs) * 100)
    : 0;
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("☠️ HỒ SƠ SINH TỒN")
    .setDescription(`**Người chơi:** <@${user.id}>`)
    .addFields(
      { name: "Tầng cao nhất", value: String(record.best_floor), inline: true },
      { name: "Số run", value: String(record.runs), inline: true },
      {
        name: "Hoàn thành tầng 100",
        value: String(record.completions),
        inline: true,
      },
      { name: "Đã rút thưởng", value: String(record.escapes), inline: true },
      { name: "Đã chết", value: String(record.deaths), inline: true },
      { name: "Tỷ lệ rút an toàn", value: `${survival}%`, inline: true },
    );
}

function ratesEmbed() {
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🎰 SINH TỒN · TỶ LỆ RNG")
    .setDescription(
      "Tỷ lệ được roll và lưu khi encounter xuất hiện; restart bot không đổi kết quả.",
    )
    .addFields(
      {
        name: "Hòm",
        value:
          "Trước tiên: 12% Mimic · 3% Ancient Mimic.\nNếu không phải Mimic: 20% rỗng · 5% đồ giả · 40% R · 22% SR · 10% SSR · 3% UR (Nguyền). Nhặt lại cùng trang bị sẽ tăng cấp và cộng thêm hiệu ứng.",
      },
      {
        name: "Encounter cơ bản",
        value:
          "47% quái thường · 12% Elite · 10% hòm thường · 8% Shrine · 5% hòm kho báu · 6% bẫy · 6% bất ngờ · 3% Thợ rèn · 2% Giải nguyền · 1% phòng trống. Roll RNGesus trước; boss bắt buộc mỗi 50 tầng và tầng 999.",
      },
      {
        name: "Nguồn trang bị",
        value:
          "R: Tiered Unique · SR: Runeword · SSR: Sacred Unique/Set · UR: SU Nguyền, giảm payout 15%. Hòm kho báu: 65% SR, 35% SSR. Item chỉ tồn tại trong run.",
      },
      {
        name: "Rift và Luck",
        value:
          "Mỗi 10 tầng cộng thêm modifier; tám loại đầu không lặp. Unstable Rift tăng hòm, hòm tốt và Mimic. Luck tăng phát hiện Mimic và tỷ lệ SSR; các hiệu ứng này làm thay đổi tỷ lệ hòm cơ bản.",
      },
      {
        name: "RNGesus · Chaos",
        value:
          "Base theo tầng: 5–9 là 0,3% · 10–19 là 0,6% · 20+ là 1%. Mỗi tầng nhân ngẫu nhiên x0,25–x3, tích Chaos khi lâu không gặp và có 2,5% khả năng Chaos Spike; xác suất cuối bị chặn ở 12%.\nBỏ chạy: 75%; thất bại tự dùng 1 Vé Thoát Hiểm nếu còn, hết vé thì chết. Chạy thành công giữ vé. Cầu nguyện: 10% · Boss không thể bị đánh bại.",
      },
      {
        name: "Bất ngờ và dịch vụ",
        value:
          "Khám phá lối đi bí ẩn: 25% cứu trợ (hồi 35% HP, 1 bình), 25% nhận Vé Thoát Hiểm, 25% kho xu (+50% cược vào bonus), 25% Champion phục kích ra đòn trước. Có thể bỏ qua. Thợ rèn tăng 1 cấp trang bị SSR/SR/R; Giải nguyền gỡ 1 cộng dồn phạt payout đồ UR. Phí hiện trên UI và chỉ dùng payout đang có của run.",
      },
      {
        name: "Phòng thủ và boss",
        value:
          "Phòng thủ: Defense ×2, giảm thêm 50% sát thương sau giảm trừ (tối thiểu 1), hồi 1 Energy. The Butcher / Assur luôn gây vật lý; Riftwalker / Lucion / Deimoss luôn gây phép, kể cả boss cuối. Rift không đổi loại sát thương boss.",
      },
      {
        name: "Sự kiện xấu",
        value:
          "6% encounter thường là Tax Collector, trộm bình máu hoặc Wrong Portal. Tax mất 15% payout; Wrong Portal giữ nguyên tầng và roll lại encounter.",
      },
      {
        name: "Pity",
        value:
          "Chỉ hòm đã mở tính pity (kể cả Mimic). 5 hòm không SR+ bảo đảm hòm kế tối thiểu SR, không Mimic. Sau 10 hòm không SSR+, mỗi hòm kế +2% cơ hội SSR. Cả hòm thường và kho báu áp dụng Luck/pity; SSR tối đa 35% / 60% tương ứng.",
      },
      {
        name: "Giới hạn",
        value:
          "Tầng 100 hoàn thành chính thức · Overrun đến 999 · Phải hạ Deimoss để công nhận tầng 999 · Hệ số tầng dừng sau 100; bonus vẫn tăng · Tối đa 10.000.000 xu · Run không hoạt động 7 ngày sẽ mất cược.",
      },
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hardcore")
    .setDescription("Chơi Sinh tồn vượt tầng bằng xu")
    .addSubcommand((command) =>
      command
        .setName("batdau")
        .setDescription("Mở bảng chọn nhân vật và nhập xu cược"),
    )
    .addSubcommand((command) =>
      command
        .setName("hoso")
        .setDescription("Xem thành tích Sinh tồn")
        .addUserOption((option) =>
          option.setName("user").setDescription("Người chơi cần xem"),
        ),
    )
    .addSubcommand((command) =>
      command.setName("top").setDescription("Xem bảng xếp hạng tầng cao nhất"),
    )
    .addSubcommand((command) =>
      command.setName("rates").setDescription("Xem tỷ lệ gacha và sự kiện"),
    )
    .addSubcommand((command) =>
      command
        .setName("tieptuc")
        .setDescription("Đăng bảng mới cho lượt Sinh tồn đang chơi"),
    ),
  recordEmbed,
  ratesEmbed,
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "hoso") {
      const user = interaction.options.getUser?.("user") || interaction.user;
      return interaction.reply({
        embeds: [
          recordEmbed(user, getHardcoreRecord(interaction.guildId, user.id)),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "top") {
      const rows = getHardcoreTop(interaction.guildId);
      const description = rows.length
        ? rows
            .map(
              (row, index) =>
                `**${index + 1}.** <@${row.user_id}> — tầng **${row.best_floor}** · hoàn thành ${row.completions}`,
            )
            .join("\n")
        : "Chưa có thành tích.";
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("🏆 SINH TỒN · TOP TẦNG")
            .setDescription(description)
            .setFooter({ text: "Xếp theo tầng đã vượt cao nhất" }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "rates")
      return interaction.reply({
        embeds: [ratesEmbed()],
        flags: MessageFlags.Ephemeral,
      });
    if (subcommand === "batdau")
      return openHardcoreSetup(interaction, {
        stake: interaction.options.getInteger?.("xu"),
        classKey: interaction.options.getString?.("class"),
      });
    if (!(await requireGameChannel(interaction, "hardcore"))) return null;
    if (subcommand === "tieptuc") {
      const run = getHardcoreRun(interaction.guildId, interaction.user.id);
      if (!run)
        return interaction.reply({
          content: "Bạn không có lượt Sinh tồn nào đang diễn ra.",
          flags: MessageFlags.Ephemeral,
        });
      if (run.session.channel_id !== interaction.channelId)
        return interaction.reply({
          content:
            "Hãy tiếp tục lượt này trong kênh Sinh tồn nơi bạn đã bắt đầu.",
          flags: MessageFlags.Ephemeral,
        });
      const message = await interaction.channel.send({
        embeds: [
          hardcoreEmbed(run.state, interaction.user.id, null, run.session.id),
        ],
        components: hardcoreRows(run.session.id, run.state),
        allowedMentions: { parse: [] },
      });
      setMessageId(run.session.id, message.id);
      if (run.session.message_id) {
        const previous = await interaction.channel.messages
          .fetch(run.session.message_id)
          .catch(() => null);
        if (previous) await previous.edit({ components: [] }).catch(() => null);
      }
      return interaction.reply({
        content: "Đã mở bảng Sinh tồn mới. Bảng cũ đã được khóa.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      content: "Dùng `/choi sinhton batdau` để mở bảng chuẩn bị.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
