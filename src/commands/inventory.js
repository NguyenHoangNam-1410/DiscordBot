const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getInventory } = require('../services/shopService');
const { listActiveEffects } = require('../services/effectStateService');
const { listCatalog } = require('../services/itemCatalogService');
const TYPE_NAMES = { consumable: 'VẬT PHẨM DÙNG', chest: 'HỘP QUÀ', color: 'MÀU HỒ SƠ' };
module.exports = {
  data: new SlashCommandBuilder().setName('inventory').setDescription('Xem kho vật phẩm').addUserOption(o => o.setName('user').setDescription('Người chơi cần xem')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    if (user.bot) return interaction.reply({ content: 'Bot không có kho đồ.', flags: MessageFlags.Ephemeral });
    const rows = getInventory(interaction.guildId, user.id);
    const effects = listActiveEffects(interaction.guildId, user.id);
    const effectItems = new Map(listCatalog().map(item => [item.effect, item]));
    const grouped = new Map();
    for (const row of rows) { const list = grouped.get(row.item.type) || []; const rarity = ['R', 'SR', 'SSR', 'UR'].includes(row.item.rarity) ? ` [${row.item.rarity}]` : ''; list.push(`• **${row.item.name}${rarity}** ×${row.quantity} · \`${row.item_id}\``); grouped.set(row.item.type, list); }
    const embed = new EmbedBuilder().setColor(0x8E44AD).setTitle(`🎒 KHO ĐỒ · ${user.globalName || user.username}`)
      .setDescription(rows.length ? [...grouped].map(([type, list]) => `**${TYPE_NAMES[type] || type.toUpperCase()}**\n${list.join('\n')}`).join('\n\n').slice(0, 4096) : 'Kho đồ đang trống.')
      .setFooter({ text: 'Dùng /vatpham sudung để dùng • /vatpham tang để tặng' });
    if (effects.length) embed.addFields({ name: '✨ Hiệu ứng đang kích hoạt', value: effects.map(effect => {
      const item = effectItems.get(effect.effect_id);
      const expires = effect.expires_at ? ` · hết hạn <t:${Math.floor(effect.expires_at / 1000)}:R>` : '';
      return `• **${item?.name || effect.effect_id}** ×${effect.charges}${expires}`;
    }).join('\n').slice(0, 1024) });
    return interaction.reply({ embeds: [embed] });
  },
};
