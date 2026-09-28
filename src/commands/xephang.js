const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, MessageFlags,
} = require('discord.js');
const { getLeaderboard } = require('../services/economyService');
const { getGameLeaderboard } = require('../services/progressionService');
const { getHardcoreTop } = require('../services/hardcoreService');
const { formatCoins } = require('../utils/economy');

const GAMES = Object.freeze([
  ['baucua', 'Bầu cua', '🎲'], ['taixiu', 'Tài xỉu', '🎯'],
  ['chinchiro', 'Chinchiro', '🎲'],
  ['oantuti', 'Oẳn tù tì', '✊'], ['blackjack', 'Xì dách', '🃏'],
  ['poker', 'Poker', '♠️'], ['duangua', 'Đua ngựa', '🏇'], ['mines', 'Mines', '💣'],
  ['hardcore', 'Sinh tồn', '⚔️'],
]);
const GAME_INFO = Object.fromEntries(GAMES.map(([id, label, emoji]) => [id, { label, emoji }]));

function leaderboardRow(ownerId, selected = 'assets') {
  const menu = new StringSelectMenuBuilder().setCustomId(`xephang:${ownerId}`).setPlaceholder('Chọn loại bảng xếp hạng…')
    .addOptions(new StringSelectMenuOptionBuilder().setLabel('Tài sản').setValue('assets').setEmoji('💰').setDefault(selected === 'assets'));
  for (const [id, label, emoji] of GAMES) menu.addOptions(
    new StringSelectMenuOptionBuilder().setLabel(label).setValue(id).setEmoji(emoji).setDefault(selected === id),
  );
  return new ActionRowBuilder().addComponents(menu);
}

function assetsEmbed(guildId, serverName = 'Server hiện tại') {
  const rows = getLeaderboard(guildId, 10);
  const description = rows.length
    ? rows.map((row, index) => `${index + 1}. <@${row.user_id}> — **${formatCoins(row.balance)} xu** · ${row.wins}/${row.games_played} thắng`).join('\n')
    : 'Server chưa có dữ liệu tài sản.';
  return new EmbedBuilder().setColor(0xF1C40F).setTitle(`🏠 ${serverName.toUpperCase()}\n💰 XẾP HẠNG TÀI SẢN`).setDescription(description)
    .setFooter({ text: 'Xếp theo số dư xu hiện tại' }).setTimestamp();
}

function gameEmbed(guildId, game, serverName = 'Server hiện tại') {
  const info = GAME_INFO[game];
  if (!info) return null;
  if (game === 'hardcore') {
    const rows = getHardcoreTop(guildId);
    const description = rows.length
      ? rows.map((row, index) => `${index + 1}. <@${row.user_id}> — **tầng ${row.best_floor}** · hoàn thành ${row.completions} lần`).join('\n')
      : 'Game này chưa có dữ liệu xếp hạng.';
    return new EmbedBuilder().setColor(0xE67E22)
      .setTitle(`🏠 ${serverName.toUpperCase()}\n${info.emoji} XẾP HẠNG ${info.label.toUpperCase()}`)
      .setDescription(description).setFooter({ text: 'Xếp theo tầng đã vượt cao nhất' }).setTimestamp();
  }
  const rows = getGameLeaderboard(guildId, game, 10);
  const description = rows.length ? rows.map((row, index) => {
    const rate = row.played ? Math.round(row.wins / row.played * 100) : 0;
    return `${index + 1}. <@${row.user_id}> — **${row.wins} thắng** · ${row.played} ván · ${rate}%`;
  }).join('\n') : 'Game này chưa có dữ liệu xếp hạng.';
  return new EmbedBuilder().setColor(0xE67E22).setTitle(`🏠 ${serverName.toUpperCase()}\n${info.emoji} XẾP HẠNG ${info.label.toUpperCase()}`).setDescription(description)
    .setFooter({ text: 'Xếp theo số trận thắng, sau đó tỷ lệ thắng' }).setTimestamp();
}

module.exports = {
  GAMES, leaderboardRow, assetsEmbed, gameEmbed,
  data: new SlashCommandBuilder().setName('xephang').setDescription('Xem bảng xếp hạng tài sản và từng game'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ embeds: [assetsEmbed(interaction.guildId, interaction.guild?.name)], components: [leaderboardRow(interaction.user.id)], allowedMentions: { parse: [] } });
  },
  async handleSelect(interaction) {
    const [, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) return interaction.reply({ content: 'Chỉ người mở bảng xếp hạng này mới có thể đổi mục.', flags: MessageFlags.Ephemeral });
    const selected = interaction.values[0];
    const serverName = interaction.guild?.name || 'Server hiện tại';
    const embed = selected === 'assets' ? assetsEmbed(interaction.guildId, serverName) : gameEmbed(interaction.guildId, selected, serverName);
    if (!embed) return interaction.reply({ content: 'Loại bảng xếp hạng không hợp lệ.', flags: MessageFlags.Ephemeral });
    return interaction.update({ embeds: [embed], components: [leaderboardRow(ownerId, selected)], allowedMentions: { parse: [] } });
  },
};
