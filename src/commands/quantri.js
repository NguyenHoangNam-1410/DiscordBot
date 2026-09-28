const { ApplicationCommandOptionType } = require('discord.js');
const { remapOptions, renamedOption, commandData } = require('../utils/commandAlias');
const game = require('./game');
const shop = require('./shop');

const GAME_NAMES = {
  setup: 'datkenh', channels: 'xemkenh', reward: 'datthuong', rewards: 'xemthuong',
  maxbet: 'datgioihan', maxbets: 'xemgioihan', economy: 'kinhte', health: 'trangthai',
  configs: 'xemcauhinh', config: 'datcauhinh', configreset: 'khoiphuc',
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

function adminOptions(command, names, excluded = []) {
  return command.data.toJSON().options.filter(option => !excluded.includes(option.name)).map(option => ({
    ...renamedOption(option, OPTION_NAMES), type: ApplicationCommandOptionType.Subcommand,
    name: names[option.name] || option.name,
  }));
}
const options = [...adminOptions(game, GAME_NAMES), ...adminOptions(shop, SHOP_NAMES, ['xem'])];

function route(interaction) {
  const visible = interaction.options.getSubcommand();
  const oldName = reverse[visible];
  return { command: Object.hasOwn(GAME_NAMES, oldName) ? game : shop, subcommand: oldName, optionNames: OPTION_NAMES };
}
module.exports = {
  data: commandData('quantri', 'Thiết lập game, kinh tế và cửa hàng dành cho admin', options),
  execute(interaction) { const item = route(interaction); return item.command.execute(remapOptions(interaction, item)); },
  autocomplete(interaction) { const item = route(interaction); return item.command.autocomplete?.(remapOptions(interaction, item)); },
};
