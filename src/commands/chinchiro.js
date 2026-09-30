const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const { MIN_BET, MAX_BET, startChinchiro, setMessageId, chinchiroEmbed, chinchiroRows } = require('../services/chinchiroService');

module.exports = {
  data: new SlashCommandBuilder().setName('chinchiro').setDescription('Chơi Chinchiro - Xúc Xắc Ngầm với Nhà cái')
    .addIntegerOption(option => option.setName('xu').setDescription(`Tiền cược (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'chinchiro')) return null;
    let started;
    try {
      started = startChinchiro({ guildId: interaction.guildId, channelId: interaction.channelId,
        userId: interaction.user.id, stake: interaction.options.getInteger('xu', true) });
    } catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván Chinchiro chưa kết thúc.', flags: MessageFlags.Ephemeral });
      if (error.message === 'CHINCHIRO_COOLDOWN') return interaction.reply({ content: `Bạn có thể mở ván Chinchiro tiếp theo sau **${Math.ceil(error.retryAfter / 1000)} giây**.`, flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Chinchiro của server là **${formatCoins(error.maxBet)} :coin:**.`, flags: MessageFlags.Ephemeral });
      if (error.code === 'INSUFFICIENT_FUNDS') return interaction.reply({ content: 'Bạn cần có đủ **2 lần tiền cược** để đặt cược và ký quỹ phạt Hifumi. Ký quỹ được hoàn nếu không bị phạt.', flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const response = await interaction.reply({ embeds: [chinchiroEmbed(started.state, interaction.user.id, started.session?.id)],
      components: chinchiroRows(started.session?.id || 'complete', started.state), withResponse: true });
    const message = response?.resource?.message || response;
    if (!started.immediate && message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
