const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createRound } = require("../services/multiplayerGameService");
const { requireGameChannel } = require("../utils/gameChannel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("baucua")
    .setDescription("Mở ván Bầu cua nhiều người trong 30 giây"),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ chơi được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "baucua"))) return;
    return createRound(interaction, "baucua");
  },
};
