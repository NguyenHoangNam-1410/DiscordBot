const { ApplicationCommandOptionType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { remapOptions, renamedOption, commandData } = require('../utils/commandAlias');
const { clearPlayerData } = require('../services/adminDataService');
const game = require('./game');
const shop = require('./shop');

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
    description: 'Admin: đặt xu, kim cương hoặc EXP của người chơi về 0',
    options: [
      { type: ApplicationCommandOptionType.User, name: 'nguoi', description: 'Người chơi cần xóa dữ liệu', required: true },
      { type: ApplicationCommandOptionType.String, name: 'dulieu', description: 'Loại dữ liệu cần xóa', required: true, choices: CLEAR_SCOPES },
    ],
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
    if (interaction.options.getSubcommand() === 'xoadulieu') {
      if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
      if (!isAdmin(interaction)) return interaction.reply({ content: 'Chỉ admin mới được xóa dữ liệu người chơi.', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('nguoi', true);
      const scope = interaction.options.getString('dulieu', true);
      const result = clearPlayerData({ guildId: interaction.guildId, userId: target.id, scope, adminId: interaction.user.id });
      const parts = [];
      if (scope === 'coins' || scope === 'all') parts.push(`**${result.coins.toLocaleString('vi-VN')} xu**`);
      if (scope === 'diamonds' || scope === 'all') parts.push(`**${result.diamonds.toLocaleString('vi-VN')} kim cương**`);
      if (scope === 'xp' || scope === 'all') parts.push(`cấp **${result.level}** và **${result.experience.toLocaleString('vi-VN')} EXP**`);
      return interaction.reply({ content: `🧹 Đã xóa dữ liệu ${parts.join(', ')} của <@${target.id}>. Lịch sử giao dịch và dữ liệu khác được giữ nguyên.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    const item = route(interaction); return item.command.execute(remapOptions(interaction, item));
  },
  autocomplete(interaction) { const item = route(interaction); return item.command.autocomplete?.(remapOptions(interaction, item)); },
};
