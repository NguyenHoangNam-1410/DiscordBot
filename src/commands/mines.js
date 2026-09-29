const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const {
  MIN_BET, MAX_BET, MIN_MINES, MAX_MINES, startMines, setMessageId, minesRows, minesEmbed,
} = require('../services/minesService');

module.exports = {
  data: new SlashCommandBuilder().setName('mines').setDescription('Dò mìn, lần theo cảnh báo và săn ô đặc biệt tăng multiplier')
    .addIntegerOption(option => option.setName('xu').setDescription(`Tiền cược (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET))
    .addIntegerOption(option => option.setName('min').setDescription(`Số mìn (${MIN_MINES}–${MAX_MINES})`).setRequired(true).setMinValue(MIN_MINES).setMaxValue(MAX_MINES)),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ chơi được trong server.', flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'mines')) return null;
    const stake = interaction.options.getInteger('xu', true);
    const mineCount = interaction.options.getInteger('min', true);
    let started;
    try { started = startMines({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake, mineCount }); }
    catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một ván Mines chưa kết thúc trong server này.', flags: MessageFlags.Ephemeral });
      if (error.message === 'INVALID_MINES') return interaction.reply({ content: `Số mìn phải từ ${MIN_MINES} đến ${MAX_MINES}.`, flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Mines của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const response = await interaction.reply({ embeds: [minesEmbed(started.state, interaction.user.id, null, started.session.id)], components: minesRows(started.session.id, started.state), withResponse: true });
    const message = response?.resource?.message;
    if (message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
