const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const { MIN_BET, MAX_BET, startBlackjack, setMessageId, blackjackEmbed, actionRows } = require('../services/blackjackService');
const { createBlackjackDuel, setBlackjackDuelMessage, blackjackDuelEmbed, inviteButtons } = require('../services/blackjackDuelService');

module.exports = {
  data: new SlashCommandBuilder().setName('xidach').setDescription('Chơi Xì dách với nhà cái hoặc thách đấu người khác')
    .addIntegerOption(option => option.setName('xu').setDescription(`Số xu cược (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET))
    .addUserOption(option => option.setName('doithu').setDescription('Người chơi bạn muốn thách đấu 1v1')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'blackjack')) return;
    const stake = interaction.options.getInteger('xu', true);
    const opponent = interaction.options.getUser('doithu');
    if (opponent) {
      if (opponent.bot) return interaction.reply({ content: 'Không thể thách đấu với bot. Bỏ tùy chọn `doithu` để chơi với nhà cái.', flags: MessageFlags.Ephemeral });
      let duel;
      try { duel = createBlackjackDuel({ guildId: interaction.guildId, channelId: interaction.channelId, challengerId: interaction.user.id, opponentId: opponent.id, stake }); }
      catch (error) {
        if (error.message === 'SELF_DUEL') return interaction.reply({ content: 'Bạn không thể tự thách đấu chính mình.', flags: MessageFlags.Ephemeral });
        if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Một trong hai người đang có ván Xì dách chưa kết thúc.', flags: MessageFlags.Ephemeral });
        if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Xì dách của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
        return economyError(interaction, error);
      }
      const response = await interaction.reply({ content: `<@${opponent.id}>, bạn nhận được lời thách đấu Xì dách!`, embeds: [blackjackDuelEmbed(duel)], components: inviteButtons(duel.id), allowedMentions: { users: [opponent.id] }, withResponse: true });
      const messageId = response?.resource?.message?.id || response?.id;
      if (messageId) setBlackjackDuelMessage(duel.id, messageId);
      return response;
    }
    let started;
    try { started = startBlackjack({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake }); }
    catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván Xì dách chưa kết thúc trong server này.', flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Xì dách của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const result = started.immediate ? started.result : null;
    const response = await interaction.reply({ embeds: [blackjackEmbed(started.state, interaction.user.id, result)], components: actionRows(started.session?.id || 'complete', started.state, started.immediate), withResponse: true });
    const message = response?.resource?.message;
    if (message?.id && started.session) setMessageId(started.session.id, message.id);
    return started;
  },
};
