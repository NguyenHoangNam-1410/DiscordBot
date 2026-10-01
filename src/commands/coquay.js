const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { requireGameChannel } = require("../utils/gameChannel");
const { economyError, formatCoins } = require("../utils/economy");
const {
  MIN_BET,
  MAX_BET,
  startCoquay,
  setMessageId,
  coquayEmbed,
  coquayRows,
} = require("../services/coquayService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("coquay")
    .setDescription("Cò quay Nga: đấu súng với Bot, mỗi bên 3 máu")
    .addIntegerOption((option) =>
      option
        .setName("cuoc")
        .setDescription(`Tiền cược một lần cho cả ván (${MIN_BET}–${MAX_BET})`)
        .setRequired(true)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ chơi được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "coquay"))) return null;
    let started;
    try {
      started = startCoquay({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        stake: interaction.options.getInteger("cuoc", true),
      });
    } catch (error) {
      if (error.message === "ACTIVE_SESSION")
        return interaction.reply({
          content:
            "Bạn đang có một ván Cò quay chưa kết thúc trong server này.",
          flags: MessageFlags.Ephemeral,
        });
      if (error.message === "BET_LIMIT")
        return interaction.reply({
          content: `Giới hạn cược Cò quay của server là **${formatCoins(error.maxBet)} :coin:**.`,
          flags: MessageFlags.Ephemeral,
        });
      return economyError(interaction, error);
    }
    const lines = [
      `🔄 Nạp đợt 1: ${"🔴".repeat(started.state.lastLoad.live)}${"⚪".repeat(started.state.lastLoad.blank)} · Bạn cầm súng trước.`,
    ];
    const response = await interaction.reply({
      embeds: [
        coquayEmbed(started.state, interaction.user.id, {
          lines,
          sessionId: started.session.id,
        }),
      ],
      components: coquayRows(
        started.session.id,
        started.state,
        interaction.user.id,
        interaction.guildId,
      ),
      withResponse: true,
    });
    const message = response?.resource?.message;
    if (message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
