const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

function helpEmbed(prefix = process.env.COMMAND_PREFIX || "!") {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎮 HƯỚNG DẪN LỆNH")
    .setDescription(
      "Chỉ cần nhớ các lệnh gốc bên dưới; chọn chức năng con ngay trong giao diện Discord.",
    )
    .addFields(
      {
        name: "🎲 Lệnh trò chơi",
        value:
          "`/baucua` · `/taixiu` · `/chinchiro` · `/oantuti` · `/xidach` · `/poker` · `/duangua` · `/domin` · `/coquay`\n`/sinhton batdau` mở run; `/vtv batdau` dành cho admin.",
      },
      {
        name: "🎒 /vatpham",
        value: "`cuahang` · `mua` · `tui` · `sudung` · `tang` · `quay`",
      },
      {
        name: "📜 /nhiemvu",
        value: "`kiemtra` · `nhan` · `diemdanh` · `tanthu`",
      },
      {
        name: "💰 Tài khoản",
        value:
          "`/hoso` · `/xu sodu|chuyen|lichsu|vanchoi` · `/xephang` · `/anxin`",
      },
      {
        name: "📖 Trợ giúp",
        value: "`/batdau` · `/luat` · `/trogiup` · `/huongdan`",
      },
      {
        name: "⌨️ Prefix tùy chọn",
        value: `Nếu server bật lệnh tin nhắn, các lệnh cũ như \`${prefix}baucua\` vẫn dùng được để tương thích.`,
      },
      {
        name: "🎁 Phần thưởng",
        value:
          "Mỗi ván có cơ hội rơi thêm xu, gem và vé Gacha ×1 theo cấu hình server.",
      },
    )
    .setFooter({
      text: "Admin dùng /quantri • Discord sẽ tự gợi ý mọi tùy chọn",
    });
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName("trochoi")
    .setDescription("Xem toàn bộ lệnh trò chơi dành cho người chơi"),
  helpEmbed,
  async execute(interaction) {
    return interaction.reply({
      embeds: [helpEmbed()],
      flags: MessageFlags.Ephemeral,
    });
  },
};
