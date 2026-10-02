const { MessageFlags } = require("discord.js");
const {
  getGameChannel,
  isGameMaintenance,
  GAME_LABELS,
} = require("../services/gameChannelService");

async function requireGameChannel(interaction, game) {
  if (isGameMaintenance(interaction.guildId, game)) {
    await interaction.reply({
      content: `🔴 **${GAME_LABELS[game]}** đang bảo trì. Hãy quay lại khi quản trị mở game.`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  const setting = getGameChannel(interaction.guildId, game);
  const content = !setting
    ? `Game **${game}** chưa được thiết lập channel. Admin dùng \`/quantri datkenh\` trước.`
    : interaction.channelId !== setting.channel_id
      ? `Game **/${game}** chỉ được chơi tại <#${setting.channel_id}>.`
      : null;
  if (!content) return true;
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { requireGameChannel };
