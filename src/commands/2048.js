const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { requireGameChannel } = require("../utils/gameChannel");
const {
  getGame2048ByUser,
  startGame2048,
  resumeGame2048,
  setMessageId,
  renderPayload,
} = require("../services/game2048Service");

async function postBoard(interaction, started) {
  const response = await interaction.reply({
    ...renderPayload(started.state, interaction.user.id, started.session.id),
    withResponse: true,
  });
  const message = response?.resource?.message;
  if (message?.id) setMessageId(started.session.id, message.id);
  return message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("2048")
    .setDescription("Chơi 2048 solo, kết thúc để đổi điểm lấy xu và EXP")
    .addSubcommand((command) =>
      command.setName("batdau").setDescription("Bắt đầu một ván 2048 mới"),
    )
    .addSubcommand((command) =>
      command
        .setName("tieptuc")
        .setDescription("Mở lại ván 2048 đang chơi ở bảng mới"),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Game chỉ chơi được trong server.",
        flags: MessageFlags.Ephemeral,
      });
    if (!(await requireGameChannel(interaction, "2048"))) return null;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "tieptuc") {
      const resumed = resumeGame2048({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
      });
      if (!resumed)
        return interaction.reply({
          content: "Bạn không có ván 2048 nào đang chơi. Dùng `/2048 batdau`.",
          flags: MessageFlags.Ephemeral,
        });
      const message = await postBoard(interaction, resumed);
      const { channelId, messageId } = resumed.previous;
      if (messageId && messageId !== message?.id) {
        // Khóa nút của bảng cũ (có thể nằm ở kênh khác hoặc đã bị xóa).
        const channel = await interaction.client.channels
          .fetch(channelId)
          .catch(() => null);
        const previous = await channel?.messages
          ?.fetch(messageId)
          .catch(() => null);
        await previous?.edit({ components: [] }).catch(() => null);
      }
      return resumed;
    }
    if (getGame2048ByUser(interaction.guildId, interaction.user.id))
      return interaction.reply({
        content:
          "Bạn đang có một ván 2048 chưa kết thúc. Dùng `/2048 tieptuc` để mở lại bảng hoặc bấm 🏁 để chốt điểm.",
        flags: MessageFlags.Ephemeral,
      });
    const started = startGame2048({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId,
    });
    await postBoard(interaction, started);
    return started;
  },
};
