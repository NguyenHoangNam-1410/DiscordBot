const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getAchievements, claimAchievements } = require('../services/achievementService');
const { formatCoins } = require('../utils/economy');

function line(item) {
  const mark = item.claimed ? '✅' : item.complete ? '🎁' : '▫️';
  return `${mark} **${item.name}** — ${item.progress}/${item.target}\n↳ ${item.description} · ${formatCoins(item.reward)} xu`;
}
module.exports = {
  data: new SlashCommandBuilder().setName('thanhtuu').setDescription('Xem và nhận phần thưởng thành tựu')
    .addSubcommand(command => command.setName('xem').setDescription('Xem tiến độ thành tựu'))
    .addSubcommand(command => command.setName('nhan').setDescription('Nhận mọi thành tựu đã hoàn thành')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    if (interaction.options.getSubcommand() === 'nhan') {
      const rewards = claimAchievements(interaction.guildId, interaction.user.id);
      if (!rewards.length) return interaction.reply({ content: 'Chưa có thành tựu mới để nhận.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `🏅 Đã nhận **${rewards.length} thành tựu**, tổng cộng **${formatCoins(rewards.reduce((sum, item) => sum + item.reward, 0))} xu**.` });
    }
    const achievements = getAchievements(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🏅 THÀNH TỰU').setDescription(achievements.map(line).join('\n\n'))
      .setFooter({ text: '🎁 nghĩa là đã đủ điều kiện · dùng /nhiemvu nhan loai:Thành tựu' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
