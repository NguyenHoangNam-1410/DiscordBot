const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const {
  createCoinRequest,
  setRequestMessage,
  requestEmbed,
  requestButtons,
} = require("../services/coinRequestService");
const { cooldownText } = require("../utils/economy");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("anxin")
    .setDescription("Xin xu từ người khác trong 30 giây")
    .addUserOption((o) =>
      o
        .setName("nguoidung")
        .setDescription("Người bạn muốn xin xu")
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("xu")
        .setDescription("Số xu muốn xin")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000),
    )
    .addStringOption((o) =>
      o.setName("lydo").setDescription("Lý do xin xu").setMaxLength(200),
    ),
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Lệnh này chỉ dùng trong server.",
        flags: MessageFlags.Ephemeral,
      });
    const target = interaction.options.getUser("nguoidung", true);
    if (target.bot || target.id === interaction.user.id)
      return interaction.reply({
        content: "Bạn phải chọn một người chơi khác.",
        flags: MessageFlags.Ephemeral,
      });
    let request;
    try {
      request = createCoinRequest({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        requesterId: interaction.user.id,
        targetId: target.id,
        amount: interaction.options.getInteger("xu", true),
        reason: interaction.options.getString("lydo"),
      });
    } catch (error) {
      const content =
        error.message === "ACTIVE_REQUEST"
          ? "Bạn đang có một yêu cầu xin xu chưa được xử lý."
          : error.message === "REQUEST_COOLDOWN"
            ? `Bạn có thể xin tiếp sau **${cooldownText(error.remaining)}**.`
            : error.message === "DAILY_REQUEST_LIMIT"
              ? "Bạn đã dùng đủ **5/5 lượt xin xu hôm nay**. Lượt sẽ được reset lúc **00:00 ngày mai**."
              : "Không thể tạo yêu cầu xin xu.";
      return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    const response = await interaction.reply({
      content: `<@${target.id}>, bạn có muốn cho xu không?`,
      embeds: [requestEmbed(request)],
      components: requestButtons(request.id),
      allowedMentions: { users: [target.id] },
      withResponse: true,
    });
    const message =
      response.resource?.message || (await interaction.fetchReply());
    setRequestMessage(request.id, message.id);
  },
};
