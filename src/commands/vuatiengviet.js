const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { startVuaSession, getVuaSession, skipVuaSession, endVuaSession, vuaQuestionText } = require('../services/funGameService');
const { formatCoins } = require('../utils/economy');
const { requireGameChannel } = require('../utils/gameChannel');
const { channelHasGame } = require('../services/gameChannelService');
const { getGameReward } = require('../services/gameRewardService');
const { skipVuaSessionForPlayer } = require('../services/funGameService');

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function questionEmbed(guildId, question) {
  const baseReward = getGameReward(guildId, 'vuatiengviet');
  const reward = baseReward * (question.hard ? 10 : 1);
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('👑 VUA TIẾNG VIỆT')
    .setDescription(`Sắp xếp các chữ cái thành từ hoặc cụm từ có nghĩa:\n\n${vuaQuestionText(question)}`)
    .addFields(
      { name: 'Thưởng cho người trả lời đúng', value: `${formatCoins(reward)} xu`, inline: true },
      ...(question.hard ? [{ name: 'Thưởng câu khó', value: '10 💎', inline: true }] : []),
      { name: 'Thời gian', value: question.hard ? `${question.durationSeconds} giây` : 'Không giới hạn', inline: true },
    )
    .setFooter({ text: 'Nhập đáp án trực tiếp trong channel • Dùng nút bên dưới để quản lý câu hỏi' });
}

function controlRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vuatiengviet:skip').setLabel('Bỏ qua câu').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vuatiengviet:end').setLabel('Kết thúc phiên').setEmoji('🛑').setStyle(ButtonStyle.Danger),
  )];
}

const command = {
  data: new SlashCommandBuilder().setName('vuatiengviet').setDescription('Bắt đầu Vua tiếng Việt; quản lý câu hỏi bằng các nút'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'vuatiengviet')) return;
    const guildId = interaction.guildId;
    const session = getVuaSession(guildId) || startVuaSession(guildId);
    return interaction.reply({ embeds: [questionEmbed(guildId, session.question)], components: controlRows() });
  },
  async handleButton(interaction) {
    if (!interaction.guildId || !channelHasGame(interaction.guildId, interaction.channelId, 'vuatiengviet'))
      return interaction.reply({ content: 'Các nút này chỉ dùng trong channel Vua tiếng Việt.', flags: MessageFlags.Ephemeral });
    const action = interaction.customId.split(':')[1];
    const session = getVuaSession(interaction.guildId);
    if (!session) return interaction.reply({ content: 'Phiên Vua tiếng Việt đã kết thúc hoặc không còn hoạt động.', flags: MessageFlags.Ephemeral });
    if (action === 'end') {
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được kết thúc phiên chung.', flags: MessageFlags.Ephemeral });
      endVuaSession(interaction.guildId);
      const ended = new EmbedBuilder().setColor(0x7F8C8D).setTitle('👑 VUA TIẾNG VIỆT')
        .setDescription(`🛑 Phiên đã được kết thúc bởi <@${interaction.user.id}>.`);
      return interaction.update({ embeds: [ended], components: [], allowedMentions: { parse: [] } });
    }
    if (action !== 'skip') return interaction.reply({ content: 'Thao tác không hợp lệ.', flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction)) return interaction.reply({ content: 'Dùng `/vtv boqua` để bỏ qua câu bằng lượt cá nhân.', flags: MessageFlags.Ephemeral });
    const result = skipVuaSession(interaction.guildId);
    return interaction.update({ content: `⏭️ Đã bỏ qua **${result.skipped.answer}**.`, embeds: [questionEmbed(interaction.guildId, result.nextQuestion)], components: controlRows(), allowedMentions: { parse: [] } });
  },
  questionEmbed, controlRows, isAdmin,
};

const playerCommand = {
  data: new SlashCommandBuilder().setName('vtv').setDescription('Lệnh người chơi cho Vua tiếng Việt')
    .addSubcommand(option => option.setName('boqua').setDescription('Bỏ qua câu hiện tại bằng một lượt cá nhân')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'vuatiengviet')) return;
    if (!getVuaSession(interaction.guildId)) return interaction.reply({ content: 'Hiện chưa có phiên Vua tiếng Việt. Hãy nhờ admin bắt đầu bằng `/choi vtv`.', flags: MessageFlags.Ephemeral });
    const result = skipVuaSessionForPlayer(interaction.guildId, interaction.user.id);
    if (result.error === 'LIMIT_REACHED') return interaction.reply({ content: `Bạn đã dùng hết **${result.limit} lượt bỏ qua** hôm nay. Lượt sẽ làm mới theo ngày Việt Nam.`, flags: MessageFlags.Ephemeral });
    if (result.error === 'NO_SESSION') return interaction.reply({ content: 'Hiện chưa có phiên Vua tiếng Việt.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: `⏭️ <@${interaction.user.id}> đã bỏ qua **${result.skipped.answer}** · còn **${result.limit - result.used}/${result.limit} lượt** hôm nay.`, embeds: [questionEmbed(interaction.guildId, result.nextQuestion)], components: controlRows(), allowedMentions: { parse: [] } });
  },
};

module.exports = { ...command, playerCommand };
