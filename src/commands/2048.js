const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { requireGameChannel } = require("../utils/gameChannel");
const {
  startGame2048,
  setMessageId,
  renderPayload,
} = require("../services/game2048Service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("2048")
    .setDescription("Chơi 2048 solo, kết thúc để đổi điểm lấy xu và EXP"),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ chơi được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "2048"))) return null;
    let started;
    try {
      started = startGame2048({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
      });
    } catch (error) {
      if (error.message === "ACTIVE_SESSION")
        return interaction.reply({
          content: "Bạn đang có một ván 2048 chưa kết thúc trong server này.",
          flags: MessageFlags.Ephemeral,
        });
      throw error;
    }
    const response = await interaction.reply({
      ...renderPayload(started.state, interaction.user.id, started.session.id),
      withResponse: true,
    });
    const message = response?.resource?.message;
    if (message?.id) setMessageId(started.session.id, message.id);
    return started;
  },
};
