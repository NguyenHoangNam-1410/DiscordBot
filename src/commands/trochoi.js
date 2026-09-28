const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

function helpEmbed(prefix = process.env.COMMAND_PREFIX || '!') {
  return new EmbedBuilder().setColor(0x5865F2).setTitle('🎮 HƯỚNG DẪN LỆNH')
    .setDescription('Chỉ cần nhớ các lệnh gốc bên dưới; chọn chức năng con ngay trong giao diện Discord.')
    .addFields(
      { name: '🎲 /choi', value: '`baucua` · `taixiu` · `chinchiro` · `ott` · `xidach` · `poker` · `duangua` · `domin`\nNhóm `sinhton` và `vtv` có thêm các thao tác riêng.' },
      { name: '🎒 /vatpham', value: '`cuahang` · `mua` · `tui` · `sudung` · `tang` · `quay`' },
      { name: '📜 /nhiemvu', value: '`xem` · `nhan` · `diemdanh` · `thanhtuu` · `nhanthanhtuu` · `thuongvaitro`' },
      { name: '💰 Tài khoản', value: '`/hoso` · `/xu sodu|chuyen|lichsu|vanchoi` · `/xephang` · `/anxin`' },
      { name: '📖 Trợ giúp', value: '`/batdau` · `/luat` · `/trogiup` · `/huongdan`' },
      { name: '⌨️ Prefix tùy chọn', value: `Nếu server bật lệnh tin nhắn, các lệnh cũ như \`${prefix}baucua\` vẫn dùng được để tương thích.` },
      { name: '🎁 Phần thưởng', value: 'Mỗi ván có cơ hội rơi thêm xu, gem và lượt quay Gacha theo cấu hình server.' },
    ).setFooter({ text: 'Admin dùng /quantri • Discord sẽ tự gợi ý mọi tùy chọn' });
}
module.exports = {
  data: new SlashCommandBuilder().setName('trochoi').setDescription('Xem toàn bộ lệnh trò chơi dành cho người chơi'),
  helpEmbed,
  async execute(interaction) { return interaction.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral }); },
};
