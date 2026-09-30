const { ActionRowBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { listCatalog } = require('../services/itemCatalogService');
const {
  listShopItems, upsertShopItem, editShopItem, removeShopItem, rotateShop,
  setShopStock, setShopDiscount,
} = require('../services/shopService');
const { formatCoins } = require('../utils/economy');
const { GAME_FILTERS, itemMatchesGame, gameLabels } = require('../services/itemGameService');

const { itemIcon } = require('../utils/rarity');
const SHOP_TABS = Object.freeze([
  { id: 'all', label: 'Tất cả', emoji: '🏪', description: 'Toàn bộ vật phẩm đang bán' },
  { id: 'profile', label: 'Hồ sơ', emoji: '🎨', description: 'Màu tùy chỉnh thẻ hồ sơ' },
  ...GAME_FILTERS.map(game => ({ ...game, description: `Vật phẩm áp dụng cho ${game.label}` })),
]);
function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
function itemOption(option, description = 'Mã vật phẩm trong shop') { return option.setName('item').setDescription(description).setRequired(true).setAutocomplete(true); }
function conditionOptions(command) {
  return command
    .addIntegerOption(o => o.setName('min_games').setDescription('Số ván tối thiểu').setMinValue(0).setMaxValue(1000000))
    .addIntegerOption(o => o.setName('min_wins').setDescription('Số trận thắng tối thiểu').setMinValue(0).setMaxValue(1000000))
    .addIntegerOption(o => o.setName('min_balance').setDescription('Số dư tối thiểu').setMinValue(0).setMaxValue(1000000));
}
function shopSelectRow(ownerId, selected = 'all') {
  const menu = new StringSelectMenuBuilder().setCustomId(`shop:${ownerId}`).setPlaceholder('Chọn nhóm vật phẩm…')
    .addOptions(SHOP_TABS.map(tab => new StringSelectMenuOptionBuilder().setLabel(tab.label).setValue(tab.id).setEmoji(tab.emoji)
      .setDescription(tab.description).setDefault(tab.id === selected)));
  return new ActionRowBuilder().addComponents(menu);
}
function shopEmbed(guildId, selected = 'all') {
  const tab = SHOP_TABS.find(item => item.id === selected) || SHOP_TABS[0];
  const items = listShopItems(guildId).filter(row => tab.id === 'profile'
    ? row.catalog?.type === 'color' : itemMatchesGame(row.catalog, tab.id));
  const description = items.length ? items.map(row => {
    const item = row.catalog;
    const price = row.final_price < row.price ? `~~${formatCoins(row.price)}~~ **${formatCoins(row.final_price)} :coin:**` : `**${formatCoins(row.price)} :coin:**`;
    const stock = row.stock === null ? '∞' : Math.max(0, row.stock - row.sold_count);
    const conditions = [row.min_games ? `${row.min_games} ván` : null, row.min_wins ? `${row.min_wins} thắng` : null, row.min_balance ? `số dư ${formatCoins(row.min_balance)}` : null].filter(Boolean).join(' · ');
    const rarity = ['R', 'SR', 'SSR', 'UR'].includes(item?.rarity) ? ` [${item.rarity}]` : '';
    const games = gameLabels(item);
    const scope = games?.length ? `Áp dụng: ${games.join(', ')}` : games ? 'Vật phẩm hồ sơ · không gắn với game' : 'Dùng chung · hiện ở mọi bộ lọc';
    const icon = itemIcon(item);
    return `${icon} **${row.display_name}${rarity}** · \`${row.item_id}\`\n_${scope}_\n${item?.description || ''}\n💰 ${price} · Kho: **${stock}**${conditions ? ` · Yêu cầu: ${conditions}` : ''}`;
  }).join('\n\n') : 'Không có vật phẩm thuộc mục này trong vòng xoay hôm nay.';
  return new EmbedBuilder().setColor(0xC0392B).setTitle(`${tab.emoji} CỬA HÀNG · ${tab.label.toUpperCase()}`).setDescription(description.slice(0, 4096))
    .setFooter({ text: 'Dùng menu để đổi mục • Cửa hàng tự xoay mỗi ngày • /vatpham mua để mua' });
}

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Xem và quản lý cửa hàng')
    .addSubcommand(c => c.setName('xem').setDescription('Mở cửa hàng hiện tại'))
    .addSubcommand(c => conditionOptions(c.setName('add').setDescription('Admin: đưa hiệu ứng có sẵn vào shop')
      .addStringOption(o => o.setName('effect').setDescription('Hiệu ứng/vật phẩm có sẵn').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('price').setDescription('Giá bán; bỏ trống để dùng giá đề xuất').setMinValue(1).setMaxValue(100000000))
      .addStringOption(o => o.setName('name').setDescription('Tên hiển thị riêng').setMaxLength(80))
      .addIntegerOption(o => o.setName('stock').setDescription('Tồn kho; 0 là không giới hạn').setMinValue(0).setMaxValue(1000000))))
    .addSubcommand(c => conditionOptions(c.setName('edit').setDescription('Admin: sửa tên, giá và điều kiện')
      .addStringOption(itemOption)
      .addStringOption(o => o.setName('name').setDescription('Tên hiển thị mới').setMaxLength(80))
      .addIntegerOption(o => o.setName('price').setDescription('Giá mới').setMinValue(1).setMaxValue(100000000))))
    .addSubcommand(c => c.setName('remove').setDescription('Admin: gỡ vật phẩm khỏi shop').addStringOption(itemOption))
    .addSubcommand(c => c.setName('rotate').setDescription('Admin: xoay cửa hàng ngay')
      .addIntegerOption(o => o.setName('size').setDescription('Số món hiển thị').setMinValue(6).setMaxValue(10)))
    .addSubcommand(c => c.setName('stock').setDescription('Admin: đặt lại tồn kho')
      .addStringOption(itemOption).addIntegerOption(o => o.setName('quantity').setDescription('0 là không giới hạn').setRequired(true).setMinValue(0).setMaxValue(1000000)))
    .addSubcommand(c => c.setName('discount').setDescription('Admin: đặt giảm giá')
      .addStringOption(itemOption)
      .addIntegerOption(o => o.setName('percent').setDescription('0 để hủy; tối đa 90%').setRequired(true).setMinValue(0).setMaxValue(90))
      .addIntegerOption(o => o.setName('hours').setDescription('Thời hạn giờ; 0 là không hết hạn').setMinValue(0).setMaxValue(8760))),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value || '').toLowerCase();
    const values = focused.name === 'effect'
      ? listCatalog({ shopEligible: true }).map(item => ({ id: item.id, name: `${item.name} · ${item.effect}` }))
      : listShopItems(interaction.guildId, { activeOnly: false }).map(row => ({ id: row.item_id, name: `${row.display_name} · ${row.active ? 'đang bán' : 'đang ẩn'}` }));
    return interaction.respond(values.filter(x => `${x.id} ${x.name}`.toLowerCase().includes(query)).slice(0, 25).map(x => ({ name: x.name.slice(0, 100), value: x.id })));
  },
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === 'xem') return interaction.reply({ embeds: [shopEmbed(interaction.guildId)], components: [shopSelectRow(interaction.user.id)] });
    if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được quản lý cửa hàng.', flags: MessageFlags.Ephemeral });
    let item;
    if (sub === 'add') item = upsertShopItem({ guildId: interaction.guildId, catalogId: interaction.options.getString('effect', true),
      displayName: interaction.options.getString('name'), price: interaction.options.getInteger('price'), stock: interaction.options.getInteger('stock'),
      minGames: interaction.options.getInteger('min_games') || 0, minWins: interaction.options.getInteger('min_wins') || 0,
      minBalance: interaction.options.getInteger('min_balance') || 0, createdBy: interaction.user.id });
    else if (sub === 'edit') item = editShopItem(interaction.guildId, interaction.options.getString('item', true), {
      displayName: interaction.options.getString('name'), price: interaction.options.getInteger('price'),
      minGames: interaction.options.getInteger('min_games'), minWins: interaction.options.getInteger('min_wins'),
      minBalance: interaction.options.getInteger('min_balance'), adminId: interaction.user.id });
    else if (sub === 'remove') {
      const removed = removeShopItem(interaction.guildId, interaction.options.getString('item', true));
      return interaction.reply({ content: removed ? '✅ Đã gỡ vật phẩm khỏi shop.' : 'Không tìm thấy vật phẩm.', flags: MessageFlags.Ephemeral });
    } else if (sub === 'rotate') {
      const rows = rotateShop(interaction.guildId, interaction.options.getInteger('size') || 8);
      return interaction.reply({ content: `🔄 Đã xoay cửa hàng với **${rows.length} vật phẩm**.`, embeds: [shopEmbed(interaction.guildId)], components: [shopSelectRow(interaction.user.id)], flags: MessageFlags.Ephemeral });
    } else if (sub === 'stock') item = setShopStock(interaction.guildId, interaction.options.getString('item', true), interaction.options.getInteger('quantity', true));
    else if (sub === 'discount') item = setShopDiscount(interaction.guildId, interaction.options.getString('item', true), interaction.options.getInteger('percent', true), interaction.options.getInteger('hours') || 0);
    return interaction.reply({ content: `✅ Đã cập nhật **${item.display_name}** · giá hiện tại **${formatCoins(item.final_price)} :coin:**.`, flags: MessageFlags.Ephemeral });
  },
  async handleSelect(interaction) {
    const [, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người mở cửa hàng này mới có thể đổi mục.', flags: MessageFlags.Ephemeral });
    const selected = interaction.values[0];
    if (!SHOP_TABS.some(tab => tab.id === selected)) return interaction.reply({ content: 'Mục cửa hàng không hợp lệ.', flags: MessageFlags.Ephemeral });
    return interaction.update({ embeds: [shopEmbed(interaction.guildId, selected)], components: [shopSelectRow(ownerId, selected)] });
  },
  SHOP_TABS, shopEmbed, shopSelectRow,
};
