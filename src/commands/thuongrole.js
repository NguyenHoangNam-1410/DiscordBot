const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const {
  claimWeeklyRoleRewards,
} = require("../services/weeklyRoleRewardService");
const { formatCoins } = require("../utils/economy");

function memberRoleIds(member) {
  if (member?.roles?.cache) return [...member.roles.cache.keys()];
  return Array.isArray(member?.roles) ? member.roles : [];
}

module.exports = {
  memberRoleIds,
  data: new SlashCommandBuilder()
    .setName("thuongrole")
    .setDescription("Nhận xu hàng tuần từ các role của bạn"),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    try {
      const result = claimWeeklyRoleRewards({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: memberRoleIds(interaction.member),
      });
      const lines = result.claimed
        .map(
          (config) =>
            `<@&${config.role_id}> — **${formatCoins(config.amount)} :coin:**`,
        )
        .join("\n");
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("🎁 ĐÃ NHẬN THƯỞNG ROLE")
            .setDescription(
              `${lines}\n\nTổng cộng: **${formatCoins(result.total)} :coin:**`,
            )
            .setFooter({
              text: `Tuần ${result.week} • Mỗi role chỉ nhận một lần`,
            }),
        ],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      const content =
        error.message === "ALREADY_CLAIMED"
          ? "Bạn đã nhận toàn bộ thưởng role của tuần này."
          : "Bạn không có role nào được thiết lập thưởng trong tuần này.";
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  },
};
