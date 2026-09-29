const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { listCatalog } = require('../services/itemCatalogService');
const { getInventory } = require('../services/shopService');
const { GAME_FILTERS, itemMatchesGame, gameLabels } = require('../services/itemGameService');

const PAGE_SIZE = 8;
const RARITY_LABELS = { R: 'R', SR: 'SR', SSR: 'SSR', UR: 'UR', common: 'Thường', rare: 'Hiếm', epic: 'Epic', legendary: 'Huyền thoại', mythic: 'Mythic' };
const FILTERS = [{ id: 'all', label: 'Tất cả', emoji: '📚' }, ...GAME_FILTERS];

function catalogPanel(guildId, userId, selectedGame = 'all', requestedPage = 0) {
  const filter = FILTERS.find(item => item.id === selectedGame) || FILTERS[0];
  const catalog = listCatalog().filter(item => itemMatchesGame(item, filter.id));
  const inventory = new Map(getInventory(guildId, userId).map(row => [row.item_id, row.quantity]));
  const pageCount = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(pageCount - 1, Number(requestedPage) || 0));
  const items = catalog.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lines = items.map(item => {
    const rarity = RARITY_LABELS[item.rarity] || item.rarity || 'Vật phẩm';
    const games = gameLabels(item);
    const scope = games?.length ? `Dùng trong: ${games.join(', ')}` : games ? 'Vật phẩm hồ sơ · không gắn với game' : 'Dùng chung · hiện ở mọi bộ lọc';
    const icon = item.emoji || (item.type === 'color' ? '🎨' : '🎁');
    return `${icon} **${item.name}** [${rarity}] · Sở hữu: **×${inventory.get(item.id) || 0}**\n_${scope}_\n${item.description}`;
  });

  const filterMenu = new StringSelectMenuBuilder().setCustomId(`iteminfo-filter:${userId}`).setPlaceholder('Lọc theo game…')
    .addOptions(FILTERS.map(item => new StringSelectMenuOptionBuilder().setLabel(item.label).setValue(item.id)
      .setEmoji(item.emoji).setDefault(item.id === filter.id)));
  const components = [new ActionRowBuilder().addComponents(filterMenu)];
  if (pageCount > 1) components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`iteminfo-page:${userId}:${filter.id}:${page - 1}`).setLabel('Trang trước').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`iteminfo-page:${userId}:${filter.id}:${page + 1}`).setLabel('Trang sau').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount - 1),
  ));
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📚 VẬT PHẨM · ${filter.label.toUpperCase()}`)
      .setDescription(lines.join('\n\n') || 'Không có vật phẩm trong mục này.')
      .setFooter({ text: `Trang ${page + 1}/${pageCount} · Số lượng trong kho của bạn · Không hiển thị giá` })],
    components,
  };
}

function ownerCheck(interaction, ownerId) {
  return interaction.user.id === ownerId;
}

module.exports = {
  data: new SlashCommandBuilder().setName('iteminfo').setDescription('Xem catalog vật phẩm theo game và số lượng đang sở hữu'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ ...catalogPanel(interaction.guildId, interaction.user.id), flags: MessageFlags.Ephemeral });
  },
  async handleFilter(interaction) {
    const [, ownerId] = interaction.customId.split(':');
    if (!ownerCheck(interaction, ownerId)) return interaction.reply({ content: 'Chỉ người mở catalog này mới được đổi bộ lọc.', flags: MessageFlags.Ephemeral });
    const selectedGame = interaction.values[0];
    if (!FILTERS.some(item => item.id === selectedGame)) return interaction.reply({ content: 'Bộ lọc không hợp lệ.', flags: MessageFlags.Ephemeral });
    return interaction.update(catalogPanel(interaction.guildId, ownerId, selectedGame));
  },
  async handlePage(interaction) {
    const [, ownerId, selectedGame, pageText] = interaction.customId.split(':');
    if (!ownerCheck(interaction, ownerId)) return interaction.reply({ content: 'Chỉ người mở catalog này mới được chuyển trang.', flags: MessageFlags.Ephemeral });
    if (!FILTERS.some(item => item.id === selectedGame)) return interaction.reply({ content: 'Bộ lọc không hợp lệ.', flags: MessageFlags.Ephemeral });
    return interaction.update(catalogPanel(interaction.guildId, ownerId, selectedGame, Number(pageText)));
  },
  catalogPanel,
};
