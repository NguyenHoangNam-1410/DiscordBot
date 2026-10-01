const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { requireGameChannel } = require('../utils/gameChannel');
const { economyError, formatCoins } = require('../utils/economy');
const {
  MIN_BET, MAX_BET, CLASSES, startHardcore, setMessageId, hardcoreEmbed, hardcoreRows,
  getHardcoreRecord, getHardcoreTop, getHardcoreRun,
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
      { name: 'Hòm', value: 'Trước tiên: 12% Mimic · 3% Ancient Mimic.\nNếu không phải Mimic: 20% rỗng · 5% đồ giả · 40% R · 22% SR · 10% SSR · 3% UR (Nguyền). Nhặt lại cùng trang bị sẽ tăng cấp và cộng thêm hiệu ứng.' },
      { name: 'RNGesus · Chaos', value: 'Base theo tầng: 5–9 là 0,3% · 10–19 là 0,6% · 20+ là 1%. Mỗi tầng nhân ngẫu nhiên x0,25–x3, tích Chaos khi lâu không gặp và có 2,5% khả năng Chaos Spike; xác suất cuối bị chặn ở 12%.\nBỏ chạy: 65% · Cầu nguyện: 10% · Boss không thể bị đánh bại.' },
      { name: 'Sự kiện xấu', value: '6% encounter thường là Tax Collector, trộm bình máu hoặc Wrong Portal. Tax mất 15% payout; Wrong Portal giữ nguyên tầng và roll lại encounter.' },
      { name: 'Pity', value: '5 hòm không có SR trở lên sẽ đảm bảo tối thiểu SR. Sau 10 hòm không có SSR, mỗi hòm cộng thêm 2% tỷ lệ SSR.' },
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
    .addSubcommand(command => command.setName('rates').setDescription('Xem tỷ lệ gacha và sự kiện'))
    .addSubcommand(command => command.setName('tieptuc').setDescription('Đăng bảng mới cho lượt Sinh tồn đang chơi')),
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
    if (subcommand === 'tieptuc') {
      const run = getHardcoreRun(interaction.guildId, interaction.user.id);
      if (!run) return interaction.reply({ content: 'Bạn không có lượt Sinh tồn nào đang diễn ra.', flags: MessageFlags.Ephemeral });
      if (run.session.channel_id !== interaction.channelId)
        return interaction.reply({ content: 'Hãy tiếp tục lượt này trong kênh Sinh tồn nơi bạn đã bắt đầu.', flags: MessageFlags.Ephemeral });
      const message = await interaction.channel.send({
        embeds: [hardcoreEmbed(run.state, interaction.user.id, null, run.session.id)],
        components: hardcoreRows(run.session.id, run.state),
        allowedMentions: { parse: [] },
      });
      setMessageId(run.session.id, message.id);
      if (run.session.message_id) {
        const previous = await interaction.channel.messages.fetch(run.session.message_id).catch(() => null);
        if (previous) await previous.edit({ components: [] }).catch(() => null);
      }
      return interaction.reply({ content: 'Đã mở bảng Sinh tồn mới. Bảng cũ đã được khóa.', flags: MessageFlags.Ephemeral });
    }
    const stake = interaction.options.getInteger('xu', true);
    const classKey = interaction.options.getString('class', true);
    let started;
    try { started = startHardcore({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, stake, classKey }); }
    catch (error) {
      if (error.message === 'ACTIVE_SESSION') return interaction.reply({ content: 'Bạn đang có một lượt Sinh tồn chưa kết thúc trong server này.', flags: MessageFlags.Ephemeral });
      if (error.message === 'INVALID_CLASS') return interaction.reply({ content: 'Class không hợp lệ.', flags: MessageFlags.Ephemeral });
      if (error.message === 'BET_LIMIT') return interaction.reply({ content: `Giới hạn cược Sinh tồn của server là **${formatCoins(error.maxBet)} :coin:**.`, flags: MessageFlags.Ephemeral });
      return economyError(interaction, error);
    }
    const response = await interaction.reply({ embeds: [hardcoreEmbed(started.state, interaction.user.id, null, started.session.id)], components: hardcoreRows(started.session.id, started.state), withResponse: true });
    const message = response?.resource?.message;
    if (message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
