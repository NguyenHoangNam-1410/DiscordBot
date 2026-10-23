const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { collect } = require("../services/systemLoadService");

const COLORS = [0x2ecc71, 0xe67e22, 0xe74c3c];
const ICONS = ["✅", "⚠️", "🔴"];
const mb = (bytes) => `${(bytes / 1_048_576).toFixed(0)} MB`;
const gb = (bytes) => `${(bytes / 1_073_741_824).toFixed(1)} GB`;
function duration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (
    [
      days && `${days} ngày`,
      hours && `${hours} giờ`,
      minutes && `${minutes} phút`,
    ]
      .filter(Boolean)
      .join(" ") || "< 1 phút"
  );
}

function healthEmbed(data) {
  const embed = new EmbedBuilder()
    .setColor(COLORS[data.status])
    .setTitle(`${ICONS[data.status]} TẢI HỆ THỐNG`)
    .addFields(
      {
        name: "CPU",
        value: `Tải 1/5/15 phút: **${data.load.one.toFixed(2)}** / ${data.load.five.toFixed(2)} / ${data.load.fifteen.toFixed(2)}\n${data.cores} lõi · bot đang dùng **${data.process.cpuPercent.toFixed(0)}%** của một lõi`,
        inline: true,
      },
      {
        name: "RAM",
        value: `**${data.memory.percent.toFixed(0)}%** · ${gb(data.memory.used)}/${gb(data.memory.total)}\nBot: ${mb(data.process.rss)} (heap ${mb(data.process.heapUsed)})`,
        inline: true,
      },
      {
        name: "Ổ đĩa",
        value: data.disk
          ? `**${data.disk.percent.toFixed(0)}%** · còn ${gb(data.disk.free)}/${gb(data.disk.total)}\nBackup: ${gb(data.backupBytes)}`
          : "Không đọc được",
        inline: true,
      },
      {
        name: "Độ trễ bot",
        value: `Vòng lặp: trung bình ${data.loop.meanMs.toFixed(1)} ms · p99 ${data.loop.p99Ms.toFixed(0)} ms · tối đa ${data.loop.maxMs.toFixed(0)} ms`,
        inline: false,
      },
      {
        name: "Discord",
        value: data.discord
          ? `Ping **${data.discord.ping ?? "?"} ms** · ${data.discord.guilds ?? "?"} server · ${data.discord.ready ? "đã kết nối" : "chưa sẵn sàng"}`
          : "Không có thông tin",
        inline: false,
      },
      {
        name: "Bot chạy được",
        value: duration(data.process.uptimeSeconds),
        inline: true,
      },
    )
    .setTimestamp();
  if (data.warnings.length)
    embed.addFields({
      name: "Cảnh báo",
      value: data.warnings
        .map((w) => `${ICONS[w.level]} ${w.message}`)
        .join("\n")
        .slice(0, 1024),
    });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("healthcheck")
    .setDescription("Admin: xem tải hệ thống hiện tại của bot"),
  healthEmbed,
  async execute(interaction) {
    if (!require("./vuatiengviet").isAdmin(interaction))
      return interaction.reply({
        content: "Chỉ admin mới được xem tải hệ thống.",
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { dbPath } = require("../db");
    const { backupDir } = require("../services/databaseBackupService");
    const data = await collect({
      client: interaction.client,
      dbPath,
      backupDir,
    });
    return interaction.editReply({ embeds: [healthEmbed(data)] });
  },
};
