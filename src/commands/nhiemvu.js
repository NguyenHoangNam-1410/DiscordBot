const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getProgress, claimMissions, checkIn } = require('../services/progressionService');
const { formatCoins } = require('../utils/economy');
const achievementCommand = require('./thanhtuu');
const weeklyRoleCommand = require('./thuongrole');
const { remapOptions } = require('../utils/commandAlias');

function missionLine(mission) {
  const mark = mission.claimed ? '✅' : mission.complete ? '🎁' : '▫️';
  const reward = [mission.coins ? `${formatCoins(mission.coins)} xu` : null, mission.experience ? `${mission.experience} EXP` : null,
    mission.diamonds ? `${mission.diamonds} :gem:` : null, mission.item ? `×${mission.quantity || 1} vật phẩm` : null].filter(Boolean).join(' + ');
  return `${mark} **${mission.label}** — ${mission.progress}/${mission.target}\n↳ ${reward}${mission.complete && !mission.claimed ? ' · có thể nhận' : ''}`;
}
function rewardText(item) {
  return [item.coins ? `${formatCoins(item.coins)} xu` : null, item.experience ? `${item.experience} EXP` : null,
    item.diamonds ? `${item.diamonds} :gem:` : null, item.item ? `×${item.quantity || 1} vật phẩm` : null].filter(Boolean).join(' + ');
}
module.exports = {
  data: new SlashCommandBuilder().setName('nhiemvu').setDescription('Nhiệm vụ, điểm danh và phần thưởng hoạt động')
    .addSubcommand(command => command.setName('xem').setDescription('Xem nhiệm vụ ngày và tuần'))
    .addSubcommand(command => command.setName('nhan').setDescription('Nhận tất cả phần thưởng đã hoàn thành'))
    .addSubcommand(command => command.setName('diemdanh').setDescription('Điểm danh hằng ngày'))
    .addSubcommand(command => command.setName('thanhtuu').setDescription('Xem tiến độ thành tựu dài hạn'))
    .addSubcommand(command => command.setName('nhanthanhtuu').setDescription('Nhận mọi thành tựu đã hoàn thành'))
    .addSubcommand(command => command.setName('thuongvaitro').setDescription('Nhận xu hàng tuần từ các vai trò của bạn')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === 'thanhtuu' || sub === 'nhanthanhtuu') {
      return achievementCommand.execute(remapOptions(interaction, { subcommand: sub === 'thanhtuu' ? 'xem' : 'nhan' }));
    }
    if (sub === 'thuongvaitro') return weeklyRoleCommand.execute(interaction);
    if (sub === 'diemdanh') {
      const result = checkIn(interaction.guildId, interaction.user.id);
      if (!result.ok) return interaction.reply({ content: `Bạn đã điểm danh hôm nay. Chuỗi điểm danh: **${result.streak}/7**.`, flags: MessageFlags.Ephemeral });
      const reward = [`${formatCoins(result.coins)} xu`, result.diamonds ? `${result.diamonds} :gem:` : null].filter(Boolean).join(' + ');
      return interaction.reply({ content: `📅 <@${interaction.user.id}> điểm danh ngày **${result.date}**, chuỗi điểm danh **${result.streak}/7**, nhận được: **${reward}**.${result.reset ? '\n🎉 Hoàn thành chuỗi 7 ngày! Chuỗi đã đặt lại; ngày mai bắt đầu lại từ 1/7.' : ''}`, allowedMentions: { users: [interaction.user.id] } });
    }
    if (sub === 'nhan') {
      const rewards = claimMissions(interaction.guildId, interaction.user.id);
      if (!rewards.length) return interaction.reply({ content: 'Chưa có nhiệm vụ hoàn thành chưa nhận thưởng.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `🎁 Đã nhận **${rewards.length}** phần thưởng:\n${rewards.map(item => `• ${item.label}: ${rewardText(item)}`).join('\n')}` });
    }
    const progress = getProgress(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('📜 NHIỆM VỤ')
      .setDescription(`Chuỗi điểm danh: **${progress.streak}/7 ngày**\nMỗi ngày chọn ngẫu nhiên 3 nhiệm vụ. Hoàn thành cả 3 nhận **20 :gem: + 1 Hộp Quà**.`)
      .addFields(
        { name: `Hằng ngày · ${progress.dailyKey}`, value: progress.daily.map(missionLine).join('\n') },
        { name: `Hằng tuần · từ ${progress.weeklyKey}`, value: progress.weekly.map(missionLine).join('\n') },
      ).setFooter({ text: 'Dùng /nhiemvu nhan để nhận tất cả phần thưởng' }).setTimestamp();
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
