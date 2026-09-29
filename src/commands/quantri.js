const { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { remapOptions, renamedOption, commandData } = require('../utils/commandAlias');
const { clearPlayerData, countPlayersForClear, clearAllPlayerData } = require('../services/adminDataService');
const game = require('./game');
const shop = require('./shop');
const { forceEndBlackjackSession, forceEndBlackjackTable, blackjackTableEmbed } = require('../services/blackjackService');
const { forceEndPokerSession } = require('../services/pokerService');
const { pokerTableEmbed } = require('../services/pokerMultiplayerService');
const { forceEndMinesSession } = require('../services/minesService');
const { forceEndChinchiroSession } = require('../services/chinchiroService');
const { forceEndHardcoreSession } = require('../services/hardcoreService');

const GAME_NAMES = {
  setup: 'datkenh', channels: 'xemkenh', reward: 'datthuong', rewards: 'xemthuong',
  maxbet: 'datgioihan', maxbets: 'xemgioihan', economy: 'kinhte', health: 'trangthai',
  configs: 'xemcauhinh', configreset: 'khoiphuc',
  roleweeklyset: 'datthuongvaitro', roleweeklyremove: 'xoathuongvaitro', roleweeklylist: 'xemthuongvaitro',
  gachaadd: 'themgacha', gacharate: 'dattylegacha', gachapool: 'xemgacha', buffset: 'datbuff', buffs: 'xembuff',
};
const SHOP_NAMES = { add: 'themvatpham', edit: 'suavatpham', remove: 'xoavatpham', rotate: 'xoaycuahang', stock: 'tonkho', discount: 'giamgia' };
const OPTION_NAMES = {
  channel: 'kenh', role: 'vaitro', item: 'vatpham', effect: 'hieuung', price: 'gia', name: 'ten', stock: 'tonkho',
  quantity: 'soluong', percent: 'phantram', hours: 'sogio', size: 'somon', min_games: 'sovan', min_wins: 'sotranthang', min_balance: 'sodu',
  tier: 'bac', reward: 'phanthuong', type: 'loai', action: 'hanhdong', amount: 'soluong',
};
const reverse = Object.fromEntries([...Object.entries(GAME_NAMES), ...Object.entries(SHOP_NAMES)].map(([oldName, newName]) => [newName, oldName]));
const CLEAR_SCOPES = [
  { name: 'Xu', value: 'coins' },
  { name: 'Kim cương', value: 'diamonds' },
  { name: 'EXP và cấp', value: 'xp' },
  { name: 'Toàn bộ (xu, kim cương, EXP/cấp)', value: 'all' },
];
const CLEAR_SCOPE_LABELS = Object.fromEntries(CLEAR_SCOPES.map(item => [item.value, item.name]));

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function adminOptions(command, names, excluded = []) {
  return command.data.toJSON().options.filter(option => !excluded.includes(option.name)).map(option => ({
    ...renamedOption(option, OPTION_NAMES), type: ApplicationCommandOptionType.Subcommand,
    name: names[option.name] || option.name,
  }));
}
const options = [
  ...adminOptions(game, GAME_NAMES, ['config']),
  ...adminOptions(shop, SHOP_NAMES, ['xem']),
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: 'xoadulieu',
    description: 'Admin: xóa dữ liệu một người chơi hoặc toàn server',
    options: [
      { type: ApplicationCommandOptionType.String, name: 'dulieu', description: 'Loại dữ liệu cần xóa', required: true, choices: CLEAR_SCOPES },
      { type: ApplicationCommandOptionType.User, name: 'nguoi', description: 'Bỏ trống để áp dụng cho tất cả người chơi', required: false },
    ],
  },
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: 'ketthucvan',
    description: 'Buộc kết thúc ván đang diễn ra theo mã ván',
    options: [{ type: ApplicationCommandOptionType.String, name: 'mavan', description: 'Mã ván hiển thị trên giao diện game', required: true, min_length: 1, max_length: 32 }],
  },
];

function route(interaction) {
  const visible = interaction.options.getSubcommand();
  const oldName = reverse[visible];
  return { command: Object.hasOwn(GAME_NAMES, oldName) ? game : shop, subcommand: oldName, optionNames: OPTION_NAMES };
}
module.exports = {
  data: commandData('quantri', 'Thiết lập game, kinh tế và cửa hàng dành cho admin', options),
  execute(interaction) {
    if (interaction.options.getSubcommand() === 'ketthucvan') {
      if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được kết thúc ván đang diễn ra.', flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString('mavan', true).trim();
      const handlers = [forceEndBlackjackTable, forceEndBlackjackSession, forceEndPokerSession, forceEndMinesSession, forceEndChinchiroSession, forceEndHardcoreSession];
      let result = null;
      for (const handler of handlers) {
        result = handler(id, interaction.guildId, interaction.user.id);
        if (result) break;
      }
      if (!result) return interaction.reply({ content: `Không tìm thấy ván đang diễn ra với mã \`${id}\` trong server này.`, flags: MessageFlags.Ephemeral });
      const participantText = result.participants.map(userId => `<@${userId}>`).join(', ') || 'không có người chơi';
      const session = result.session || result.table;
      if (session?.message_id) interaction.client.channels.fetch(session.channel_id).then(channel => channel?.messages?.fetch(session.message_id)).then(message => {
        if (!message) return;
        if (result.table) return message.edit({ embeds: [blackjackTableEmbed(result.table, result.state)], components: [] });
        if (session.variant === 'poker' && JSON.parse(session.state_json).mode === 'multiplayer') return message.edit({ embeds: [pokerTableEmbed(result.state, session.id)], components: [], allowedMentions: { parse: [] } });
        const gameName = session.variant === 'blackjack' ? 'XÌ DÁCH' : session.variant === 'poker' ? 'POKER' : 'GAME';
        const endedEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle(`🛑 ${gameName} ĐÃ ĐƯỢC KẾT THÚC`).setDescription(`Mã ván: \`${session.id}\`\nQuản trị viên đã đóng ván này. Tiền cược đã khóa được hoàn lại.`);
        return message.edit({ embeds: [endedEmbed], components: [] });
      }).catch(() => {});
      return interaction.reply({ content: `🛑 Đã buộc kết thúc ván \`${id}\`. Tiền cược đã khóa được hoàn lại cho: ${participantText}.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    if (interaction.options.getSubcommand() === 'xoadulieu') {
      if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được xóa dữ liệu người chơi.', flags: MessageFlags.Ephemeral });
      const scope = interaction.options.getString('dulieu', true);
      const target = interaction.options.getUser('nguoi');
      if (!target) {
        const count = countPlayersForClear(interaction.guildId, scope);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`admin-clear-all:${scope}:${interaction.user.id}:confirm`).setLabel('Xác nhận xóa').setEmoji('🧹').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`admin-clear-all:${scope}:${interaction.user.id}:cancel`).setLabel('Hủy').setStyle(ButtonStyle.Secondary),
        );
        return interaction.reply({ content: `⚠️ Bạn sắp xóa **${CLEAR_SCOPE_LABELS[scope]}** của **${count.toLocaleString('vi-VN')} người chơi** trong server này.\n\nLịch sử giao dịch và các dữ liệu khác sẽ được giữ nguyên. Nhấn **Xác nhận xóa** để tiếp tục.`, components: [row], flags: MessageFlags.Ephemeral });
      }
      const result = clearPlayerData({ guildId: interaction.guildId, userId: target.id, scope, adminId: interaction.user.id });
      const parts = [];
      if (scope === 'coins' || scope === 'all') parts.push(`**${result.coins.toLocaleString('vi-VN')} xu**`);
      if (scope === 'diamonds' || scope === 'all') parts.push(`**${result.diamonds.toLocaleString('vi-VN')} kim cương**`);
      if (scope === 'xp' || scope === 'all') parts.push(`cấp **${result.level}** và **${result.experience.toLocaleString('vi-VN')} EXP**`);
      return interaction.reply({ content: `🧹 Đã xóa dữ liệu ${parts.join(', ')} của <@${target.id}>. Lịch sử giao dịch và dữ liệu khác được giữ nguyên.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    const item = route(interaction); return item.command.execute(remapOptions(interaction, item));
  },
  async handleClearAllButton(interaction) {
    const [, scope, ownerId, action] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId || !isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin đã tạo yêu cầu này mới được xác nhận.', flags: MessageFlags.Ephemeral });
    if (action === 'cancel') return interaction.update({ content: 'Đã hủy thao tác xóa dữ liệu toàn server.', components: [] });
    if (action !== 'confirm' || !CLEAR_SCOPES.some(item => item.value === scope)) return interaction.reply({ content: 'Yêu cầu xóa dữ liệu không hợp lệ.', flags: MessageFlags.Ephemeral });
    const result = clearAllPlayerData({ guildId: interaction.guildId, scope, adminId: interaction.user.id });
    return interaction.update({ content: `🧹 Đã xóa **${CLEAR_SCOPE_LABELS[scope]}** cho **${result.players.toLocaleString('vi-VN')} người chơi** trong server. Lịch sử giao dịch và dữ liệu khác được giữ nguyên.`, components: [] });
  },
  autocomplete(interaction) { const item = route(interaction); return item.command.autocomplete?.(remapOptions(interaction, item)); },
};
