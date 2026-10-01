const { MessageFlags } = require("discord.js");
const { getGameChannel } = require("../services/gameChannelService");

async function requireGameChannel(interaction, game) {
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
