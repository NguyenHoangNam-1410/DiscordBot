const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const RULES = {
  baucua: ['Bầu cua', 'Chọn linh vật trước khi khóa cược. Xuất hiện 1/2/3 lần trả tổng cộng x2/x3/x4.'],
  taixiu: ['Tài xỉu', 'Tài 11–17, Xỉu 4–10; bộ ba làm Tài/Xỉu và Chẵn/Lẻ thua.'],
  chinchiro: ['Chinchiro', 'Nhà cái lắc trước. So điểm khi cả hai có tướng; Shigoro lãi x2, Bão x3, Pin-Zoro x5. Hifumi 1-2-3 bị phạt thêm x1 tiền cược.'],
  oantuti: ['Oẳn tù tì', 'Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Thắng nhận x2, hòa hoàn cược.'],
  blackjack: ['Xì dách', 'Gần 21 nhất mà không quá 21. Nhà cái dừng từ 17; thắng thường nhận 1,9×, Blackjack tự nhiên nhận 2,5×; nếu cả người chơi và nhà cái cùng quắc thì hòa.'],
  poker: ['Poker', 'Chơi với hai bot. Theo, tố hoặc bỏ; Main Pot và Side Pot được chia tự động.'],
  duangua: ['Đua ngựa', 'Chọn một trong sáu ngựa. Hệ số khóa khi mở bàn; debuff chỉ lộ sau khi khóa cược.'],
  mines: ['Mines', 'Mở ô an toàn để tăng hệ số rồi rút. Trúng mìn mất cược; ô sao tăng thêm x1,5.'],
  hardcore: ['Sinh tồn', 'Vượt tầng và quyết định lúc rút. Chết mất payout tạm giữ; tầng 100 là mốc hoàn thành.'],
  vuatiengviet: ['Vua tiếng Việt', 'Sắp xếp chữ thành từ đúng và trả lời trực tiếp trong kênh game.'],
};
module.exports = { RULES, data: new SlashCommandBuilder().setName('luat').setDescription('Xem luật ngắn của từng game').addStringOption(option => option.setName('trochoi').setDescription('Trò chơi').setRequired(true).addChoices(...Object.entries(RULES).map(([value, [name]]) => ({ name, value })))), async execute(interaction) {
  const key = interaction.options.getString('trochoi', true); const [name, text] = RULES[key];
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📖 ${name}`).setDescription(text).setFooter({ text: 'Dùng /huongdan để xem hệ thống lệnh' })], flags: MessageFlags.Ephemeral });
} };
