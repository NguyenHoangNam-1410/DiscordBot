const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const {
  changelogPanel,
  handleChangelogButton,
  TYPES,
  SCOPES,
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
    )
    .addStringOption((option) =>
      option
        .setName("loai")
        .setDescription("Lọc theo loại thay đổi")
        .addChoices(
          ...Object.entries(TYPES).map(([value, { label }]) => ({
            name: label,
            value,
          })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("doi_tuong")
        .setDescription("Lọc theo đối tượng (trò chơi / hệ thống)")
        .addChoices(
          ...Object.entries(SCOPES).map(([value, name]) => ({ name, value })),
        ),
    );
}

async function execute(interaction) {
  const page = (interaction.options.getInteger("trang") || 1) - 1;
  const filter = {
    type: interaction.options.getString?.("loai") || null,
    scope: interaction.options.getString?.("doi_tuong") || null,
  };
  return interaction.reply({
    ...changelogPanel(interaction.user.id, page, undefined, filter),
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: commandData("changelog"),
  commandData,
  execute,
  handleButton: handleChangelogButton,
};
