const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { addDiamonds, getPlayerProgression } = require('../services/playerLevelService');
const { addInventory } = require('../services/shopService');
const { formatCoins } = require('../utils/economy');
const { db } = require('../db');

function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  return ids.includes(interaction.user.id) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('thanthuvip')
    .setDescription('Thưởng tân thủ: nhận 1 vé Gacha ×10 và 3000 kim cương (một lần duy nhất)')
    .addUserOption(option => option.setName('nguoidung').setDescription('Người chơi nhận thưởng (admin only)')),

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Lệnh này chỉ dùng trong server.', flags: MessageFlags.Ephemeral });

    let targetUser = interaction.options.getUser('nguoidung');
    const userId = targetUser ? targetUser.id : interaction.user.id;

    if (targetUser && !isAdmin(interaction)) {
      return interaction.reply({ content: 'Chỉ admin mới có thể cấp thưởng cho người chơi khác.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      const result = db.transaction(() => {
        const guild = String(interaction.guildId);
        const user = String(userId);

        if (db.prepare('SELECT 1 FROM vip_rewards WHERE guild_id=? AND user_id=?').get(guild, user)) {
          return { claimed: false, message: 'Bạn đã nhận thưởng tân thủ trước đây. Mỗi tài khoản chỉ nhận một lần.' };
        }

        db.prepare('INSERT INTO vip_rewards(guild_id,user_id,claimed_at) VALUES(?,?,?)').run(guild, user, Date.now());

        addDiamonds(interaction.guildId, userId, 3000, { reason: 'vip_reward', operationId: `vip:${guild}:${user}` });
        addInventory(interaction.guildId, userId, 'gacha_ticket_x10', 1, Date.now());

        const progression = getPlayerProgression(interaction.guildId, userId);

        return {
          claimed: true,
          diamonds: progression.diamonds,
          message: `Đã cấp thưởng cho <@${userId}>`
        };
      })();

      if (!result.claimed) {
        return interaction.editReply({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('🎁 THƯỞNG TÂN THỦ')
        .setDescription(`<@${userId}> đã nhận thưởng tân thủ!`)
        .addFields(
          { name: '🎫 Vé Gacha ×10', value: '**1** vé quay miễn phí', inline: true },
          { name: ':gem: Kim cương', value: '**3000** :gem:', inline: true },
          { name: 'Số dư hiện tại', value: `**${result.diamonds}** :gem:`, inline: true },
        )
        .setFooter({ text: 'Thưởng này chỉ nhận được một lần trong mỗi server' });

      return interaction.editReply({ embeds: [embed], allowedMentions: { users: [userId] } });
    } catch (error) {
      console.error('[thanthuvip] error:', error);
      return interaction.editReply({ content: '❌ Lỗi khi cấp phát thưởng. Vui lòng thử lại.', flags: MessageFlags.Ephemeral });
    }
  },
};
