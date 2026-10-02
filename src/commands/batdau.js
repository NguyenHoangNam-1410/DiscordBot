const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { claimStarterPack } = require("../services/onboardingService");
const { formatCoins } = require("../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("batdau")
    .setDescription("Bắt đầu chơi và nhận gói chào mừng một lần"),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const starter = claimStarterPack(interaction.guildId, interaction.user.id);
    const reward = starter.claimed
      ? `\n\n🎁 **Gói chào mừng:** ${formatCoins(starter.coins)} :coin: và màu hồ sơ **${starter.cosmetic}**.`
      : "\n\n✅ Bạn đã nhận gói chào mừng trước đây; hướng dẫn vẫn luôn dùng được.";
    const embed = new EmbedBuilder()
      .setColor(0x38bdf8)
      .setTitle("👋 CHÀO MỪNG ĐẾN GAME HUB")
      .setDescription(`Bắt đầu nhanh trong ba bước:${reward}`)
      .addFields(
        {
          name: "1 · Nhận thưởng hoạt động",
          value:
            "Dùng `/nhiemvu diemdanh` mỗi ngày, `/nhiemvu nhan` để gom mọi thưởng (kể cả thưởng vai trò hằng tuần) và `/nhiemvu tanthu` để nhận quà tân thủ.",
        },
        {
          name: "2 · Chọn trò chơi",
          value:
            "Dùng lệnh riêng như `/oantuti` hoặc `/sinhton batdau` để bắt đầu. Người mới nên thử Vua tiếng Việt hoặc Oẳn tù tì.",
        },
        {
          name: "3 · Theo dõi tiến độ",
          value: "Dùng `/nhiemvu kiemtra`, `/xephang` và `/hoso`.",
        },
        {
          name: "Chơi có trách nhiệm",
          value:
            "Đặt cược nhỏ khi làm quen. Xem 10 ván gần nhất bằng `/xu vanchoi`.",
        },
      )
      .setFooter({ text: "Gói chào mừng chỉ nhận một lần trong mỗi server" });
    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
