const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError } = require('../utils/economy');
const { VARIANTS, startPoker, setPokerMessage, pokerEmbed, pokerRows } = require('../services/pokerService');
module.exports = {
  data: new SlashCommandBuilder().setName('poker').setDescription('Chơi Poker với hai bot, hỗ trợ Main Pot và Side Pot')
    .addStringOption(option => option.setName('chedo').setDescription('Biến thể Poker').setRequired(true).addChoices(...Object.entries(VARIANTS).map(([value, item]) => ({ name: item.name, value })))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Poker chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'poker')) return;
    try {
      const started = startPoker({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, variant: interaction.options.getString('chedo', true) });
      const response = await interaction.reply({ embeds: [pokerEmbed(started.state, interaction.user.id)], components: pokerRows(started.session.id, started.state), withResponse: true });
      const messageId = response?.resource?.message?.id || response?.id; if (messageId) setPokerMessage(started.session.id, messageId); return started;
    } catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván Poker chưa kết thúc.', flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
  },
};
