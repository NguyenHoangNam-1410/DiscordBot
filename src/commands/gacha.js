const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { RARITY_ICON } = require('../utils/rarity');
const { pullGacha, getGachaHistory, TICKETS } = require('../services/gachaService');
const { getPlayerProgression } = require('../services/playerLevelService');
const { listGachaPool } = require('../services/gachaPoolService');
const { gachaLuckMultiplier } = require('../services/gameBuffService');

const ICON = RARITY_ICON;
function groupedLines(results) {
  const grouped = new Map();
  for (const result of results) {
    const key = `${result.tier}:${result.kind === 'coins' ? result.coins : result.itemId}`;
    const old = grouped.get(key) || { ...result, count: 0 }; old.count += 1; grouped.set(key, old);
  }
  return [...grouped.values()].map(item => `${ICON[item.tier]} **${item.tier}** · ${item.name}${item.count > 1 ? ` ×${item.count}` : ''}`).join('\n');
}
function gachaRows(ownerId, progression, tickets = { single: 0, ten: 0 }) {
  const canSingle = tickets.single > 0 || progression.diamonds >= 100;
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gacha:${ownerId}:1`).setLabel('Quay tiếp ×1').setEmoji('🎲').setStyle(ButtonStyle.Primary).setDisabled(!canSingle),
    new ButtonBuilder().setCustomId(`gacha:${ownerId}:10`).setLabel('Quay tiếp ×10').setEmoji('🎰').setStyle(ButtonStyle.Success).setDisabled(tickets.ten <= 0 && progression.diamonds < 900),
  )];
}
function resultPayload(result, ownerId) {
  const payment = result.paymentType === TICKETS[1] ? '🎟️ Vé Gacha ×1 · SSR' : result.paymentType === TICKETS[10] ? '🎟️ Vé Gacha ×10 · SSR+' : `${result.diamondCost.toLocaleString('vi-VN')} :gem:`;
  const embed = new EmbedBuilder().setColor(result.results.some(x => x.tier === 'UR') ? 0xED4245 : 0x9B59B6)
    .setTitle(`🎰 GACHA · ${result.pulls} LƯỢT`).setDescription(groupedLines(result.results))
    .addFields(
      { name: 'Thanh toán', value: payment, inline: true },
      { name: 'Còn lại', value: `${result.progression.diamonds.toLocaleString('vi-VN')} :gem: · 🎟️ ×1: ${result.tickets.single} · 🎟️ ×10: ${result.tickets.ten}`, inline: true },
      { name: 'Bảo hiểm', value: `SR: ${result.pity.since_sr}/10 · SSR: ${result.pity.since_ssr}/25 · UR: ${result.pity.since_ur}/50`, inline: false },
    );
  const pool = listGachaPool(result.guildId, { luckMultiplier: gachaLuckMultiplier(result.guildId) });
  const rates = ['XU', 'R', 'SR', 'SSR', 'UR'].map(tier => {
    const rate = pool.filter(item => item.tier === tier).reduce((sum, item) => sum + item.rate, 0);
    return `${tier} ${rate.toFixed(2).replace(/\.00$/, '')}%`;
  });
  embed.setFooter({ text: `Tỷ lệ hiện tại: ${rates.join(' · ')}` });
  return { embeds: [embed], components: gachaRows(ownerId, result.progression, result.tickets) };
}
function historyPayload(guildId, userId, page = 1) {
  const history = getGachaHistory(guildId, userId, page);
  const lines = history.rows.map(row => {
    const summary = groupedLines(row.results).replaceAll('\n', ' · ').slice(0, 500);
    const payment = row.payment_type === TICKETS[1] ? 'vé ×1' : row.payment_type === TICKETS[10] ? 'vé ×10' : row.diamond_cost === 0 ? 'lượt miễn phí cũ' : `${row.diamond_cost} 💎`;
    return `**#${row.id}** · <t:${Math.floor(row.created_at / 1000)}:f> · ×${row.pulls} · ${payment}\n${summary}`;
  });
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎰 LỊCH SỬ GACHA')
    .setDescription(lines.join('\n\n').slice(0, 4096) || 'Bạn chưa có lượt quay Gacha nào.')
    .setFooter({ text: `Trang ${history.page}/${history.pages} · ${history.total} lần quay` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gacha-history:${userId}:${history.page - 1}`).setLabel('Trước').setStyle(ButtonStyle.Secondary).setDisabled(history.page <= 1),
    new ButtonBuilder().setCustomId(`gacha-history:${userId}:${history.page + 1}`).setLabel('Sau').setStyle(ButtonStyle.Secondary).setDisabled(history.page >= history.pages),
  );
  return { embeds: [embed], components: history.total > 0 ? [row] : [] };
}
async function handleHistoryButton(interaction) {
  const [, ownerId, rawPage] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người xem lịch sử này mới chuyển trang được.', flags: MessageFlags.Ephemeral });
  return interaction.update(historyPayload(interaction.guildId, ownerId, Number(rawPage)));
}
async function handleButton(interaction) {
  const [, ownerId, rawPulls] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người quay gacha mới dùng được các nút này.', flags: MessageFlags.Ephemeral });
  try {
    const result = pullGacha({ guildId: interaction.guildId, userId: interaction.user.id, pulls: Number(rawPulls), operationId: `interaction:${interaction.id}` });
    result.guildId = interaction.guildId;
    await interaction.update({ components: [] });
    return interaction.followUp(resultPayload(result, interaction.user.id));
  } catch (error) {
    if (error.message === 'INSUFFICIENT_DIAMONDS') {
      const current = getPlayerProgression(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: `Bạn không đủ kim cương hoặc vé phù hợp. Hiện có **${current.diamonds.toLocaleString('vi-VN')} :gem:**.`, flags: MessageFlags.Ephemeral });
    }
    throw error;
  }
}
module.exports = {
  data: new SlashCommandBuilder().setName('gacha').setDescription('Quay Gacha bằng vé hoặc kim cương')
    .addSubcommand(command => command.setName('quay').setDescription('Quay Gacha, ưu tiên vé trước kim cương')
      .addIntegerOption(option => option.setName('luot').setDescription('Số lượt quay').setRequired(true)
        .addChoices({ name: '1 lượt · vé SSR hoặc 100 kim cương', value: 1 }, { name: '10 lượt · vé ×10 hoặc 900 kim cương', value: 10 })))
    .addSubcommand(command => command.setName('lichsu').setDescription('Xem lịch sử Gacha của bạn')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    if (interaction.options.getSubcommand() === 'lichsu') return interaction.reply({ ...historyPayload(interaction.guildId, interaction.user.id), flags: MessageFlags.Ephemeral });
    try {
      const result = pullGacha({ guildId: interaction.guildId, userId: interaction.user.id,
        pulls: interaction.options.getInteger('luot', true), operationId: `interaction:${interaction.id}` });
      result.guildId = interaction.guildId;
      return interaction.reply(resultPayload(result, interaction.user.id));
    } catch (error) {
      if (error.message === 'INSUFFICIENT_DIAMONDS') {
        const current = getPlayerProgression(interaction.guildId, interaction.user.id);
        return interaction.reply({ content: `Bạn không đủ kim cương hoặc vé phù hợp. Hiện có **${current.diamonds.toLocaleString('vi-VN')} :gem:**.`, flags: MessageFlags.Ephemeral });
      }
      throw error;
    }
  },
  groupedLines,
  gachaRows,
  resultPayload,
  handleButton,
  handleHistoryButton,
  historyPayload,
};
