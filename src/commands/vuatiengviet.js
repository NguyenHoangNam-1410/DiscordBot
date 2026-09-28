const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { startVuaSession, getVuaSession, skipVuaSession, endVuaSession, vuaQuestionText } = require('../services/funGameService');
const { formatCoins } = require('../utils/economy');
const { requireGameChannel } = require('../utils/gameChannel');
const { getGameReward } = require('../services/gameRewardService');

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
  data: new SlashCommandBuilder().setName('vuatiengviet').setDescription('Sắp xếp chữ cái thành từ có nghĩa')
    .addSubcommand(command => command.setName('batdau').setDescription('Bắt đầu phiên câu hỏi chung'))
    .addSubcommand(command => command.setName('boqua').setDescription('Bỏ qua câu hiện tại và lấy câu mới'))
    .addSubcommand(command => command.setName('ketthuc').setDescription('Admin kết thúc phiên hiện tại')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'vuatiengviet')) return;
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'batdau') {
      if (getVuaSession(guildId)) return interaction.reply({ content: 'Channel đã có câu hỏi chung. Hãy nhập trực tiếp đáp án vào channel.', flags: MessageFlags.Ephemeral });
      const session = startVuaSession(guildId);
      const baseReward = getGameReward(guildId, 'vuatiengviet');
      const reward = baseReward * (session.question.hard ? 10 : 1);
      const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('👑 VUA TIẾNG VIỆT')
        .setDescription(`Sắp xếp các chữ cái thành từ hoặc cụm từ có nghĩa:\n\n${vuaQuestionText(session.question)}`)
        .addFields(
          { name: 'Thưởng cho người trả lời đúng', value: `${formatCoins(reward)} xu`, inline: true },
          { name: 'Thời gian', value: session.question.hard ? `${session.question.durationSeconds} giây` : 'Không giới hạn', inline: true },
        )
        .setFooter({ text: 'Nhập đáp án trực tiếp trong channel • Dùng /choi vtv boqua nếu cần' });
      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'boqua') {
      const result = skipVuaSession(guildId);
      if (!result) return interaction.reply({ content: 'Channel chưa có phiên Vua tiếng Việt.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: `⏭️ Đáp án vừa bỏ qua: **${result.skipped.answer}**\n\nCâu mới:\n${vuaQuestionText(result.nextQuestion)}` });
    }

    if (subcommand === 'ketthuc') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được kết thúc phiên chung.', flags: MessageFlags.Ephemeral });
      if (!endVuaSession(guildId)) return interaction.reply({ content: 'Channel chưa có phiên Vua tiếng Việt.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: '🛑 Admin đã kết thúc phiên Vua tiếng Việt.' });
    }
    return null;
  },
};
