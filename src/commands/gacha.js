const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pullGacha } = require('../services/gachaService');
const { getPlayerProgression } = require('../services/playerLevelService');
const { listGachaPool } = require('../services/gachaPoolService');
const { gachaLuckMultiplier } = require('../services/gameBuffService');

const ICON = { XU: '🪙', R: '🔵', SR: '🟣', SSR: '🟠', UR: '🔴' };
function groupedLines(results) {
  const grouped = new Map();
  for (const result of results) {
    const key = `${result.tier}:${result.kind === 'coins' ? result.coins : result.itemId}`;
    const old = grouped.get(key) || { ...result, count: 0 }; old.count += 1; grouped.set(key, old);
  }
  return [...grouped.values()].map(item => `${ICON[item.tier]} **${item.tier}** · ${item.name}${item.count > 1 ? ` ×${item.count}` : ''}`).join('\n');
}
function gachaRows(ownerId, progression) {
  const canSingle = progression.free_gacha_pulls > 0 || progression.diamonds >= 100;
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gacha:${ownerId}:1`).setLabel('Quay tiếp ×1').setEmoji('🎲').setStyle(ButtonStyle.Primary).setDisabled(!canSingle),
    new ButtonBuilder().setCustomId(`gacha:${ownerId}:10`).setLabel('Quay tiếp ×10').setEmoji('🎰').setStyle(ButtonStyle.Success).setDisabled(progression.diamonds < 900),
  )];
}
function resultPayload(result, ownerId) {
  const payment = result.usedFreePull ? '1 lượt miễn phí' : `${result.diamondCost.toLocaleString('vi-VN')} :gem:`;
  const embed = new EmbedBuilder().setColor(result.results.some(x => x.tier === 'UR') ? 0xED4245 : 0x9B59B6)
    .setTitle(`🎰 GACHA · ${result.pulls} LƯỢT`).setDescription(groupedLines(result.results))
    .addFields(
      { name: 'Thanh toán', value: payment, inline: true },
      { name: 'Còn lại', value: `${result.progression.diamonds.toLocaleString('vi-VN')} :gem: · ${result.progression.free_gacha_pulls} lượt miễn phí`, inline: true },
    );
  const pool = listGachaPool(result.guildId, { luckMultiplier: gachaLuckMultiplier(result.guildId) });
  const rates = ['XU', 'R', 'SR', 'SSR', 'UR'].map(tier => {
    const rate = pool.filter(item => item.tier === tier).reduce((sum, item) => sum + item.rate, 0);
    return `${tier} ${rate.toFixed(2).replace(/\.00$/, '')}%`;
  });
  embed.setFooter({ text: `Tỷ lệ hiện tại: ${rates.join(' · ')}` });
  return { embeds: [embed], components: gachaRows(ownerId, result.progression) };
}
async function handleButton(interaction) {
  const [, ownerId, rawPulls] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người quay gacha mới dùng được các nút này.', flags: MessageFlags.Ephemeral });
  try {
    const result = pullGacha({ guildId: interaction.guildId, userId: interaction.user.id, pulls: Number(rawPulls), operationId: `interaction:${interaction.id}` });
    result.guildId = interaction.guildId;
    return interaction.update(resultPayload(result, interaction.user.id));
  } catch (error) {
    if (error.message === 'INSUFFICIENT_DIAMONDS') {
      const current = getPlayerProgression(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: `Bạn không đủ kim cương. Hiện có **${current.diamonds.toLocaleString('vi-VN')} :gem:**.`, flags: MessageFlags.Ephemeral });
    }
    throw error;
  }
}
module.exports = {
  data: new SlashCommandBuilder().setName('gacha').setDescription('Dùng kim cương quay vật phẩm và xu')
    .addIntegerOption(option => option.setName('luot').setDescription('Số lượt quay').setRequired(true)
      .addChoices({ name: '1 lượt · 100 kim cương', value: 1 }, { name: '10 lượt · 900 kim cương · chắc chắn SR+', value: 10 })),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    try {
      const result = pullGacha({ guildId: interaction.guildId, userId: interaction.user.id,
        pulls: interaction.options.getInteger('luot', true), operationId: `interaction:${interaction.id}` });
      result.guildId = interaction.guildId;
      return interaction.reply(resultPayload(result, interaction.user.id));
    } catch (error) {
      if (error.message === 'INSUFFICIENT_DIAMONDS') {
        const current = getPlayerProgression(interaction.guildId, interaction.user.id);
        return interaction.reply({ content: `Bạn không đủ kim cương. Hiện có **${current.diamonds.toLocaleString('vi-VN')} :gem:**.`, flags: MessageFlags.Ephemeral });
      }
      throw error;
    }
  },
  groupedLines,
  gachaRows,
  resultPayload,
  handleButton,
};
