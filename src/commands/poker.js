const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError } = require('../utils/economy');
const { VARIANTS, startPoker, setPokerMessage, pokerEmbed, pokerRows } = require('../services/pokerService');
const { createPokerLobby, pokerTableEmbed, pokerTableRows } = require('../services/pokerMultiplayerService');
module.exports = {
  data: new SlashCommandBuilder().setName('poker').setDescription('Chơi Poker với bot hoặc người chơi khác')
    .addStringOption(option => option.setName('chedo').setDescription('Biến thể Poker').setRequired(true).addChoices(...Object.entries(VARIANTS).map(([value, item]) => ({ name: item.name, value }))))
    .addStringOption(option => option.setName('chedochoi').setDescription('Chọn đối thủ').addChoices({ name: 'Hai bot', value: 'bot' }, { name: 'Mời một người chơi', value: 'nguoichoi' })),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Poker chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'poker')) return;
    try {
      const variant = interaction.options.getString('chedo', true);
      if (interaction.options.getString('chedochoi') === 'nguoichoi') {
        const started = createPokerLobby({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, username: interaction.user.username, variant });
        const response = await interaction.reply({ embeds: [pokerTableEmbed(started.state, started.session.id)], components: pokerTableRows(started.session, started.state), allowedMentions: { parse: [] }, withResponse: true });
        const messageId = response?.resource?.message?.id || response?.id; if (messageId) setPokerMessage(started.session.id, messageId); return started;
      }
      const started = startPoker({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, variant });
      const response = await interaction.reply({ embeds: [pokerEmbed(started.state, interaction.user.id, started.session.id)], components: pokerRows(started.session.id, started.state), withResponse: true });
      const messageId = response?.resource?.message?.id || response?.id; if (messageId) setPokerMessage(started.session.id, messageId); return started;
    } catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván Poker chưa kết thúc.', flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
  },
};
