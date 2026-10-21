const { MessageFlags } = require("discord.js");
const {
  getGameChannels,
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
  const settings = getGameChannels(interaction.guildId, game);
  const content = !settings.length
    ? `Game **${game}** chưa được thiết lập channel. Admin dùng \`/game setup\` trước.`
    : !settings.some((row) => row.channel_id === interaction.channelId)
      ? `Game **/${game}** chỉ được chơi tại ${settings.map((row) => `<#${row.channel_id}>`).join(", ")}.`
      : null;
  if (!content) return true;
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  return false;
}

module.exports = { requireGameChannel };
