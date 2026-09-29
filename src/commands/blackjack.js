const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const { MIN_BET, MAX_BET, createBlackjackTable, setBlackjackTableMessage, blackjackTableEmbed, blackjackTableRows } = require('../services/blackjackService');

module.exports = {
  data: new SlashCommandBuilder().setName('xidach').setDescription('Mở bàn Xì dách và làm nhà cái')
    .addIntegerOption(option => option.setName('ante').setDescription(`Ante mỗi người (${MIN_BET}–${MAX_BET} xu)`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'blackjack')) return;
    const stake = interaction.options.getInteger('ante', true);
    let opened;
    try { opened = createBlackjackTable({ guildId: interaction.guildId, dealerId: interaction.user.id, channelId: interaction.channelId, ante: stake }); }
    catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván cược khác chưa kết thúc.', flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Xì dách của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
      if (error.message === 'DEALER_ANTE_LIMIT') return interaction.reply({ content: `Ante không được vượt quá 25% số dư của bạn (tối đa **${formatCoins(error.cap)} xu**) hoặc giới hạn cược server.`, flags: MessageFlags.Ephemeral });
      if (error.code === 'ACTIVE_BLACKJACK_TABLE') return interaction.reply({ content: 'Bạn đang ở một bàn Xì dách khác; hãy chờ ván đó kết thúc.', flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const response = await interaction.reply({ embeds: [blackjackTableEmbed(opened.table, opened.state)], components: blackjackTableRows(opened.table, opened.state), withResponse: true });
    const messageId = response?.resource?.message?.id || response?.id;
    if (messageId) setBlackjackTableMessage(opened.table.id, messageId);
    return response;
  },
};
