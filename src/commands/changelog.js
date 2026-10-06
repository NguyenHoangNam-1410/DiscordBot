const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  changelogPanel,
  handleChangelogButton,
} = require("../services/changelogService");

function commandData(name) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Xem các cập nhật mới nhất của bot")
    .addIntegerOption((option) =>
      option
        .setName("trang")
        .setDescription("Trang lịch sử muốn xem (mới nhất ở trang 1)")
        .setMinValue(1),
    );
}

async function execute(interaction) {
  const page = (interaction.options.getInteger("trang") || 1) - 1;
  return interaction.reply({
    ...changelogPanel(interaction.user.id, page),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: commandData("changelog"),
  commandData,
  execute,
  handleButton: handleChangelogButton,
};
