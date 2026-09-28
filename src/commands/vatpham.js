const { ApplicationCommandOptionType } = require('discord.js');
const { remapOptions, renamedOption, commandData } = require('../utils/commandAlias');

const commands = {
  cuahang: require('./shop'), mua: require('./buy'), tui: require('./inventory'),
  sudung: require('./use'), tang: require('./giftitem'), quay: require('./gacha'),
};
const COMMON_NAMES = { item: 'vatpham', quantity: 'soluong' };
const OPTION_NAMES = {
  cuahang: COMMON_NAMES,
  mua: COMMON_NAMES,
  tui: { ...COMMON_NAMES, user: 'nguoidung' },
  sudung: COMMON_NAMES,
  tang: { ...COMMON_NAMES, user: 'nguoinhan' },
  quay: COMMON_NAMES,
};

function subcommand(name, command, description, sourceSubcommand = null) {
  const schema = command.data.toJSON();
  const source = sourceSubcommand ? schema.options.find(option => option.name === sourceSubcommand) : schema;
  return {
    type: ApplicationCommandOptionType.Subcommand, name, description,
    options: (source.options || []).map(option => renamedOption(option, OPTION_NAMES[name])),
  };
}
const options = [
  subcommand('cuahang', commands.cuahang, 'Mở cửa hàng theo từng nhóm vật phẩm', 'xem'),
  subcommand('mua', commands.mua, 'Mua vật phẩm trong cửa hàng'),
  subcommand('tui', commands.tui, 'Xem túi vật phẩm'),
  subcommand('sudung', commands.sudung, 'Chọn vật phẩm để sử dụng'),
  subcommand('tang', commands.tang, 'Tặng vật phẩm cho người chơi khác'),
  subcommand('quay', commands.quay, 'Quay Gacha bằng kim cương'),
];

function route(interaction) {
  const visible = interaction.options.getSubcommand();
  return {
    command: commands[visible],
    subcommand: visible === 'cuahang' ? 'xem' : null,
    optionNames: OPTION_NAMES[visible],
  };
}
module.exports = {
  data: commandData('vatpham', 'Cửa hàng, túi đồ, sử dụng và Gacha', options),
  execute(interaction) { const item = route(interaction); return item.command.execute(remapOptions(interaction, item)); },
  autocomplete(interaction) {
    const item = route(interaction);
    return item.command.autocomplete?.(remapOptions(interaction, item));
  },
};
