const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const {
  MIN_BET, MAX_BET, createBlackjackTable, setBlackjackTableMessage, blackjackTableEmbed, blackjackTableRows,
  startBlackjack, setMessageId, blackjackEmbed, actionRows,
} = require('../services/blackjackService');

async function playAgainstBot(interaction, stake) {
  let started;
  try { started = startBlackjack({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake }); }
  catch (error) {
    if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván cược khác chưa kết thúc trong server này.', flags: MessageFlags.Ephemeral });
    if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Xì dách của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
    return economyError(interaction, error);
  }
  const result = started.immediate ? started.result : null;
  const response = await interaction.reply({ embeds: [blackjackEmbed(started.state, interaction.user.id, result, started.session?.id)],
    components: actionRows(started.session?.id || 'complete', started.state, started.immediate), withResponse: true });
  const messageId = response?.resource?.message?.id || response?.id;
  if (messageId && started.session) setMessageId(started.session.id, messageId);
  return started;
}

async function openTable(interaction, ante) {
  let opened;
  try { opened = createBlackjackTable({ guildId: interaction.guildId, dealerId: interaction.user.id, channelId: interaction.channelId, ante }); }
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
}

module.exports = {
  data: new SlashCommandBuilder().setName('xidach').setDescription('Chơi Xì dách với nhà cái bot hoặc mở bàn với người chơi khác')
    .addIntegerOption(option => option.setName('ante').setDescription(`Tiền cược (${MIN_BET}–${MAX_BET} xu); ở bàn nhiều người là ante mỗi người`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET))
    .addStringOption(option => option.setName('chedochoi').setDescription('Chọn đối thủ (mặc định: nhà cái bot)')
      .addChoices({ name: 'Nhà cái bot (chơi một mình)', value: 'bot' }, { name: 'Người chơi khác (bạn làm nhà cái, xem bài riêng)', value: 'nguoichoi' })),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'blackjack')) return;
    const stake = interaction.options.getInteger('ante', true);
    return interaction.options.getString('chedochoi') === 'nguoichoi' ? openTable(interaction, stake) : playAgainstBot(interaction, stake);
  },
};
