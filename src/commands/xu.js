const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getTransactionHistory, transferCoins } = require('../services/economyService');
const { formatCoins } = require('../utils/economy');
const { getGameHistory } = require('../services/progressionService');

const GAME_LABELS = { vuatiengviet: 'Vua tiếng Việt', baucua: 'Bầu cua', taixiu: 'Tài xỉu', chinchiro: 'Chinchiro', oantuti: 'Oẳn tù tì', blackjack: 'Xì dách', poker: 'Poker', duangua: 'Đua ngựa', mines: 'Dò mìn', coquay: 'Cò quay Nga', hardcore: 'Sinh tồn' };
function transactionLabel(reason) {
  const value = String(reason || '');
  if (value === 'daily') return 'Quà xu hằng ngày';
  if (value.startsWith('transfer:to:')) return `Chuyển cho <@${value.slice(12)}>`;
  if (value.startsWith('transfer:from:')) return `Nhận từ <@${value.slice(14)}>`;
  if (value.startsWith('shop:')) return `Mua vật phẩm ${value.slice(5)}`;
  if (value.startsWith('checkin:')) return 'Điểm danh';
  if (value.startsWith('mission:')) return 'Phần thưởng nhiệm vụ';
  if (value.startsWith('season:')) return 'Phần thưởng mùa';
  if (value.startsWith('boss:')) return 'Phần thưởng boss cộng đồng';
  if (value.startsWith('admin-remove:')) return 'Admin trừ xu';
  if (value.startsWith('admin:')) return 'Admin cộng xu';
  const [game, outcome] = value.split(':');
  if (GAME_LABELS[game]) {
    const outcomeLabel = { win: 'thắng', loss: 'thua', draw: 'hòa', reserve: 'đặt cược', double: 'gấp đôi', split: 'tách bài' }[outcome] || outcome;
    return `${GAME_LABELS[game]} · ${outcomeLabel}`;
  }
  return value || 'Giao dịch';
}

module.exports = {
  data: new SlashCommandBuilder().setName('xu').setDescription('Quản lý xu game của server')
    .addSubcommand(command => command.setName('sodu').setDescription('Chuyển sang hồ sơ để xem số dư'))
    .addSubcommand(command => command.setName('lichsu').setDescription('Xem 10 giao dịch xu gần nhất'))
    .addSubcommand(command => command.setName('vanchoi').setDescription('Xem 10 ván gần nhất'))
    .addSubcommand(command => command.setName('chuyen').setDescription('Chuyển xu cho người chơi khác')
      .addUserOption(option => option.setName('nguoinhan').setDescription('Người nhận').setRequired(true))
      .addIntegerOption(option => option.setName('xu').setDescription('Số xu muốn chuyển').setRequired(true).setMinValue(1).setMaxValue(100000))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'sodu') {
      return interaction.reply({ content: 'Hãy dùng `/hoso` để xem số dư của bạn.', flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'lichsu') {
      const rows = getTransactionHistory(interaction.guildId, interaction.user.id, 10);
      const description = rows.length ? rows.map(row => {
        const amount = `${row.amount >= 0 ? '+' : ''}${formatCoins(row.amount)}`;
        return `${row.amount >= 0 ? '🟢' : '🔴'} **${amount} xu** · ${transactionLabel(row.reason)}\n<t:${Math.floor(row.created_at / 1000)}:R>`;
      }).join('\n\n') : 'Bạn chưa có giao dịch nào.';
      const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📜 LỊCH SỬ XU').setDescription(description).setFooter({ text: 'Hiển thị 10 giao dịch gần nhất' });
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'vanchoi') {
      const rows = getGameHistory(interaction.guildId, interaction.user.id, 10);
      const icons = { win: '🟢', loss: '🔴', draw: '🟡' };
      const description = rows.length ? rows.map(row => `${icons[row.outcome]} **${GAME_LABELS[row.game] || row.game} · ${{ win: 'Thắng', loss: 'Thua', draw: 'Hòa' }[row.outcome]}**\nCược ${formatCoins(row.stake)} · nhận ${formatCoins(row.payout)} xu · <t:${Math.floor(row.created_at / 1000)}:R>`).join('\n\n') : 'Bạn chưa hoàn thành ván nào.';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎮 10 VÁN GẦN NHẤT').setDescription(description)], flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'chuyen') {
      const receiver = interaction.options.getUser('nguoinhan', true);
      const amount = interaction.options.getInteger('xu', true);
      if (receiver.bot) return interaction.reply({ content: 'Không thể chuyển xu cho bot.', flags: MessageFlags.Ephemeral });
      if (receiver.id === interaction.user.id) return interaction.reply({ content: 'Bạn không thể tự chuyển xu cho chính mình.', flags: MessageFlags.Ephemeral });
      let result;
      try { result = transferCoins({ guildId: interaction.guildId, fromUserId: interaction.user.id, toUserId: receiver.id, amount }); }
      catch (error) {
        if (error.code === 'INSUFFICIENT_FUNDS') return interaction.reply({ content: 'Bạn không đủ xu để chuyển khoản này.', flags: MessageFlags.Ephemeral });
        throw error;
      }
      return interaction.reply({ content: `💸 <@${interaction.user.id}> đã chuyển **${formatCoins(result.amount)} xu** cho <@${receiver.id}>.`, allowedMentions: { users: [receiver.id] } });
    }
    return interaction.reply({ content: 'Tùy chọn không hợp lệ. Dùng `/xephang` để xem bảng xếp hạng.', flags: MessageFlags.Ephemeral });
  },
};
