const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const {
  MIN_BET, MAX_BET, CLASSES, startHardcore, setMessageId, hardcoreEmbed, hardcoreRows,
  getHardcoreRecord, getHardcoreTop,
} = require('../services/hardcoreService');

function recordEmbed(user, record) {
  const survival = record.runs ? Math.round(record.escapes / record.runs * 100) : 0;
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('☠️ HỒ SƠ SINH TỒN')
    .setDescription(`**Người chơi:** <@${user.id}>`)
    .addFields(
      { name: 'Tầng cao nhất', value: String(record.best_floor), inline: true },
      { name: 'Số run', value: String(record.runs), inline: true },
      { name: 'Hoàn thành tầng 100', value: String(record.completions), inline: true },
      { name: 'Đã rút thưởng', value: String(record.escapes), inline: true },
      { name: 'Đã chết', value: String(record.deaths), inline: true },
      { name: 'Tỷ lệ rút an toàn', value: `${survival}%`, inline: true },
    );
}

function ratesEmbed() {
  return new EmbedBuilder().setColor(0xE67E22).setTitle('🎰 SINH TỒN · TỶ LỆ RNG')
    .setDescription('Tỷ lệ được roll và lưu khi encounter xuất hiện; restart bot không đổi kết quả.')
    .addFields(
      { name: 'Hòm', value: 'Trước tiên: 12% Mimic · 3% Ancient Mimic.\nNếu không phải Mimic: 20% rỗng · 5% Legendary giả · 40% thường · 22% Rare · 10% Legendary · 3% Cursed.' },
      { name: 'RNGesus · Chaos', value: 'Base theo tầng: 5–9 là 0,3% · 10–19 là 0,6% · 20+ là 1%. Mỗi tầng nhân ngẫu nhiên x0,25–x3, tích Chaos khi lâu không gặp và có 2,5% khả năng Chaos Spike; xác suất cuối bị chặn ở 12%.\nBỏ chạy: 65% · Cầu nguyện: 10% · Boss không thể bị đánh bại.' },
      { name: 'Sự kiện xấu', value: '6% encounter thường là Tax Collector, trộm bình máu hoặc Wrong Portal. Tax mất 15% payout; Wrong Portal giữ nguyên tầng và roll lại encounter.' },
      { name: 'Pity', value: '5 hòm không có Rare sẽ đảm bảo tối thiểu Rare. Sau 10 hòm không có Legendary, mỗi hòm cộng thêm 2% tỷ lệ Legendary.' },
      { name: 'Giới hạn', value: 'Tầng 100 hoàn thành chính thức · Overrun đến 999 · Payout ngừng tăng theo tầng sau 100 · Tối đa 10.000.000 xu.' },
    );
}

module.exports = {
  data: new SlashCommandBuilder().setName('hardcore').setDescription('Chơi Sinh tồn vượt tầng bằng xu')
    .addSubcommand(command => command.setName('batdau').setDescription('Bắt đầu một lượt Sinh tồn')
      .addIntegerOption(option => option.setName('xu').setDescription(`Tiền cược (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET))
      .addStringOption(option => option.setName('class').setDescription('Class nhân vật').setRequired(true).addChoices(
        { name: 'Barbarian', value: 'barbarian' }, { name: 'Assassin', value: 'assassin' }, { name: 'Sorceress', value: 'sorceress' },
      )))
    .addSubcommand(command => command.setName('hoso').setDescription('Xem thành tích Sinh tồn').addUserOption(option => option.setName('user').setDescription('Người chơi cần xem')))
    .addSubcommand(command => command.setName('top').setDescription('Xem bảng xếp hạng tầng cao nhất'))
    .addSubcommand(command => command.setName('rates').setDescription('Xem tỷ lệ gacha và sự kiện')),
  recordEmbed,
  ratesEmbed,
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Game chỉ dùng được trong server.', flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'hoso') {
      const user = interaction.options.getUser?.('user') || interaction.user;
      return interaction.reply({ embeds: [recordEmbed(user, getHardcoreRecord(interaction.guildId, user.id))], flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'top') {
      const rows = getHardcoreTop(interaction.guildId);
      const description = rows.length ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — tầng **${row.best_floor}** · hoàn thành ${row.completions}`).join('\n') : 'Chưa có thành tích.';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('🏆 SINH TỒN · TOP TẦNG').setDescription(description).setFooter({ text: 'Xếp theo tầng đã vượt cao nhất' })], flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'rates') return interaction.reply({ embeds: [ratesEmbed()], flags: MessageFlags.Ephemeral });
    if (!await requireGameChannel(interaction, 'hardcore')) return null;
    const stake = interaction.options.getInteger('xu', true);
    const classKey = interaction.options.getString('class', true);
    let started;
    try { started = startHardcore({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake, classKey }); }
    catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một lượt Sinh tồn chưa kết thúc trong server này.', flags: MessageFlags.Ephemeral });
      if (error.message === 'INVALID_CLASS') return interaction.reply({ content: 'Class không hợp lệ.', flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Sinh tồn của server là **${formatCoins(error.maxBet)} xu**.`, flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const response = await interaction.reply({ embeds: [hardcoreEmbed(started.state, interaction.user.id)], components: hardcoreRows(started.session.id, started.state), withResponse: true });
    const message = response?.resource?.message;
    if (message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
