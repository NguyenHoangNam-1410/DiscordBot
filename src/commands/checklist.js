const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { getProgress, claimMissions, checkIn } = require('../services/progressionService');
const { getAccount, getRank } = require('../services/economyService');
const { formatCoins } = require('../utils/economy');
const { getAchievements } = require('../services/achievementService');
const { getPlayerProgression } = require('../services/playerLevelService');

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

function checklistRow() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('checklist:menu').setPlaceholder('Chọn thông tin muốn xem...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Nhiệm vụ hằng ngày').setValue('daily').setEmoji('📋').setDescription('Xem 3 nhiệm vụ ngày hôm nay'),
        new StringSelectMenuOptionBuilder().setLabel('Nhiệm vụ hằng tuần').setValue('weekly').setEmoji('📅').setDescription('Xem nhiệm vụ tuần này'),
        new StringSelectMenuOptionBuilder().setLabel('Thành tựu').setValue('achievements').setEmoji('🏆').setDescription('Xem tiến độ thành tựu'),
        new StringSelectMenuOptionBuilder().setLabel('Điểm danh').setValue('checkin').setEmoji('✅').setDescription('Nhận thưởng điểm danh hằng ngày'),
        new StringSelectMenuOptionBuilder().setLabel('Xếp hạng của bạn').setValue('rank').setEmoji('🥇').setDescription('Xem vị trí xếp hạng server'),
      )
  )];
}

module.exports = {
  data: new SlashCommandBuilder().setName('checklist').setDescription('Xem nhanh thông tin về nhiệm vụ, thành tựu và xếp hạng'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });

    const progress = getProgress(interaction.guildId, interaction.user.id);
    const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('📊 DANH SÁCH KIỂM TRA')
      .setDescription(`Chọn từ menu bên dưới để xem thông tin bạn muốn.`)
      .addFields(
        { name: '📋 Hằng ngày', value: `${progress.daily.filter(m => m.complete).length}/${progress.daily.length} nhiệm vụ hoàn thành`, inline: true },
        { name: '📅 Hằng tuần', value: `${progress.weekly.filter(m => m.complete).length}/${progress.weekly.length} nhiệm vụ hoàn thành`, inline: true },
        { name: '✅ Chuỗi điểm danh', value: `**${progress.streak}/7 ngày**`, inline: true },
      ).setFooter({ text: 'Sử dụng menu để xem chi tiết' });

    return interaction.reply({ embeds: [embed], components: checklistRow(), flags: MessageFlags.Ephemeral });
  },

  async handleSelect(interaction) {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('checklist:')) return;

    const selected = interaction.values[0];

    if (selected === 'daily') {
      const progress = getProgress(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('📋 NHIỆM VỤ HẰNG NGÀY')
        .setDescription(`Ngày: **${progress.dailyKey}**\nMỗi ngày chọn 3 nhiệm vụ mới. Hoàn thành tất cả nhận **20 :gem: + 1 Hộp Quà**.`)
        .addFields({ name: 'Nhiệm vụ', value: progress.daily.map(missionLine).join('\n') })
        .setFooter({ text: 'Dùng /nhiemvu nhan để nhận tất cả phần thưởng' });
      return interaction.update({ embeds: [embed], components: checklistRow() });
    }

    if (selected === 'weekly') {
      const progress = getProgress(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('📅 NHIỆM VỤ HẰNG TUẦN')
        .setDescription(`Tuần từ: **${progress.weeklyKey}**\nHoàn thành mỗi nhiệm vụ tuần để nhận thưởng.`)
        .addFields({ name: 'Nhiệm vụ', value: progress.weekly.map(missionLine).join('\n') })
        .setFooter({ text: 'Dùng /nhiemvu nhan để nhận tất cả phần thưởng' });
      return interaction.update({ embeds: [embed], components: checklistRow() });
    }

    if (selected === 'achievements') {
      const achievements = getAchievements(interaction.guildId, interaction.user.id);
      const completed = achievements.filter(a => a.complete).length;
      const description = achievements.length > 0
        ? achievements.map(a => `${a.complete ? '🏅' : '🔒'} **${a.name}** · ${a.progress}/${a.target} · ${a.reward} :gem:`).join('\n')
        : 'Chưa có thành tựu nào.';

      const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('🏆 THÀNH TỰU')
        .setDescription(`Đã hoàn thành: **${completed}/${achievements.length}**`)
        .addFields({ name: 'Tiến độ', value: description })
        .setFooter({ text: 'Dùng /nhiemvu nhanthanhtuu để nhận phần thưởng' });
      return interaction.update({ embeds: [embed], components: checklistRow() });
    }

    if (selected === 'checkin') {
      const result = checkIn(interaction.guildId, interaction.user.id);
      if (!result.ok) {
        const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('✅ ĐIỂM DANH')
          .setDescription(`❌ Bạn đã điểm danh hôm nay.\n\nChuỗi: **${result.streak}/7 ngày**`)
          .addFields({ name: 'Tiếp tục chuỗi', value: 'Quay lại vào ngày mai để tiếp tục chuỗi điểm danh của bạn.' })
          .setFooter({ text: 'Mỗi người chỉ được điểm danh một lần mỗi ngày' });
        return interaction.update({ embeds: [embed], components: checklistRow() });
      }

      const reward = [`${formatCoins(result.coins)} xu`, result.diamonds ? `${result.diamonds} :gem:` : null].filter(Boolean).join(' + ');
      const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('✅ ĐIỂM DANH THÀNH CÔNG')
        .setDescription(`📅 Ngày: **${result.date}**\n🎯 Chuỗi: **${result.streak}/7 ngày**\n🎁 Phần thưởng: **${reward}**${result.reset ? '\n\n🎉 Hoàn thành chuỗi 7 ngày! Chuỗi sẽ đặt lại ngày mai.' : ''}`)
        .setFooter({ text: 'Điểm danh lại vào ngày mai để tiếp tục chuỗi' });
      return interaction.update({ embeds: [embed], components: checklistRow() });
    }

    if (selected === 'rank') {
      const account = getAccount(interaction.guildId, interaction.user.id);
      const rank = getRank(interaction.guildId, interaction.user.id);
      const progression = getPlayerProgression(interaction.guildId, interaction.user.id);

      const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('🥇 XẾP HẠNG CỦA BẠN')
        .setDescription(`<@${interaction.user.id}>`)
        .addFields(
          { name: 'Xếp hạng server', value: `#${rank}`, inline: true },
          { name: 'Số dư', value: `${formatCoins(account.balance)} xu`, inline: true },
          { name: 'Cấp độ', value: `**${progression.level}**`, inline: true },
          { name: 'Tổng số ván', value: `${account.games_played} ván`, inline: true },
          { name: 'Kim cương', value: `${progression.diamonds} :gem:`, inline: true },
          { name: 'Vé gacha', value: `${progression.free_gacha_pulls} vé miễn phí`, inline: true },
        ).setFooter({ text: 'Dùng /xephang để xem bảng xếp hạng server' });
      return interaction.update({ embeds: [embed], components: checklistRow() });
    }

    return interaction.update({ embeds: [], components: checklistRow() });
  },
};
