const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const oracle = require("../services/oracleLogService");

const STATES = {
  success: { color: 0x2ecc71, title: "✅ ĐÃ TẠO ĐƯỢC VM ORACLE ARM" },
  running: { color: 0x3498db, title: "⏳ ĐANG THỬ TẠO VM ORACLE ARM" },
  stale: { color: 0xe67e22, title: "⚠️ SCRIPT CÓ THỂ ĐÃ DỪNG" },
  error: { color: 0xe74c3c, title: "🔴 SCRIPT DỪNG VÌ LỖI" },
  limit: { color: 0xe67e22, title: "⏹️ SCRIPT ĐÃ ĐẠT SỐ LẦN THỬ TỐI ĐA" },
  empty: { color: 0x95a5a6, title: "📭 LOG TRỐNG" },
};
const KIND_ICONS = {
  success: "✅",
  capacity: "💤",
  ratelimit: "⏱️",
  transient: "🔁",
  error: "🔴",
  limit: "⏹️",
  start: "▶️",
  other: "•",
};
const MAX_DESCRIPTION = 3800;

// Chỉ chủ bot (ADMIN_USER_ID): log chứa thông tin hạ tầng riêng, không mở cho người có quyền Administrator của server.
function isOwner(interaction) {
  return String(process.env.ADMIN_USER_ID || "")
    .split(/[,;\n]/)
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(interaction.user.id);
}
const stamp = (at) =>
  `<t:${Math.floor(at / 1000)}:T> (<t:${Math.floor(at / 1000)}:R>)`;

function entryLines(entry) {
  const lines = [
    `${KIND_ICONS[entry.kind] || "•"} ${stamp(entry.at)} ${entry.message}`,
  ];
  for (const detail of entry.details) lines.push(`　↳ ${detail}`);
  return lines;
}

function checkEmbed({ log, entries, summary, limit }) {
  const state = STATES[summary.state];
  const embed = new EmbedBuilder()
    .setColor(state.color)
    .setTitle(state.title)
    .setTimestamp();
  if (summary.state === "empty") {
    embed.setDescription(
      "Chưa có dòng log nào. Kiểm tra script đã chạy chưa bằng `pgrep -af oracle-arm-retry` trên máy chủ.",
    );
    return embed;
  }
  const picked = oracle.recent(entries, limit);
  let body = picked.flatMap(entryLines).join("\n");
  while (body.length > MAX_DESCRIPTION && picked.length > 1) {
    picked.shift();
    body = picked.flatMap(entryLines).join("\n");
  }
  embed.setDescription(body.slice(0, MAX_DESCRIPTION));
  embed.addFields({
    name: "Thống kê",
    value: `Hết capacity: **${summary.capacity}** · giới hạn tốc độ: **${summary.ratelimit}** · lỗi tạm: **${summary.transient}**\nLần thử: **${summary.attempts}**${summary.first ? ` · từ ${stamp(summary.first)}` : ""}`,
  });
  if (summary.state === "success")
    embed.addFields({
      name: "Bước tiếp theo",
      value:
        "Vào Oracle Console > Compute > Instances lấy IP công khai, rồi SSH bằng người dùng `ubuntu`.",
    });
  if (summary.state === "stale")
    embed.addFields({
      name: "Gợi ý",
      value:
        "Không có dòng mới trong một thời gian dài. Trên máy chủ chạy `pgrep -af oracle-arm-retry`; nếu trống thì chạy lại script.",
    });
  if (log.truncated)
    embed.setFooter({ text: "Log lớn: chỉ đọc phần mới nhất của file." });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("oracle")
    .setDescription("Chủ bot: theo dõi script tạo VM Oracle ARM")
    .addSubcommand((command) =>
      command
        .setName("check")
        .setDescription("Xem log mới nhất của script tạo VM Oracle ARM")
        .addIntegerOption((option) =>
          option
            .setName("dong")
            .setDescription("Số mục log hiển thị (mặc định 8)")
            .setMinValue(1)
            .setMaxValue(20),
        ),
    ),
  checkEmbed,
  isOwner,
  async execute(interaction) {
    if (!isOwner(interaction))
      return interaction.reply({
        content: "Chỉ chủ bot (ADMIN_USER_ID) mới dùng được lệnh này.",
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let log;
    try {
      log = oracle.readLog();
    } catch (error) {
      return interaction.editReply({
        content: `Không đọc được file log: ${error.code || "lỗi không rõ"}.`,
      });
    }
    if (!log)
      return interaction.editReply({
        content: `Chưa thấy file log \`${oracle.logPath()}\`. Chạy script trên máy chủ bot trước, hoặc đặt biến \`ORACLE_ARM_LOG\` trỏ đúng file.`,
      });
    const entries = oracle.parseLog(log.text);
    const summary = oracle.summarize(entries);
    return interaction.editReply({
      embeds: [
        checkEmbed({
          log,
          entries,
          summary,
          limit: interaction.options.getInteger("dong") || 8,
        }),
      ],
    });
  },
};
