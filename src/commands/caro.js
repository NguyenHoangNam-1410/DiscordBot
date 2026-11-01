"use strict";

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const runtime = require("../caro/runtime");
const { roomPayload, accessPayload } = require("../caro/discord");
const { MESSAGES } = require("../caro/store");

const DISABLED =
  "Web caro chưa được bật. Chủ bot cần cấu hình CARO_WEB_ENABLED và CARO_PUBLIC_URL trên VM rồi khởi động lại bot.";
async function handleButton(interaction) {
  const match = /^caro:(join|open|cancel):([a-f0-9-]{36})$/.exec(
    interaction.customId || "",
  );
  if (!match) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!runtime.isAvailable())
      return interaction.editReply({ content: DISABLED });
    const [, action, id] = match;
    const room = runtime.store.get(id);
    if (
      !room ||
      room.guildId !== interaction.guildId ||
      room.channelId !== interaction.channelId ||
      room.messageId !== interaction.message?.id
    )
      return interaction.editReply({
        content: "Nút không thuộc phòng caro tại kênh này.",
      });
    if (action === "cancel") {
      if (room.status !== "waiting")
        return interaction.editReply({
          content: "Phòng không còn chờ đối thủ. Có thể đầu hàng trên bàn web.",
        });
      runtime.store.leave(id, interaction.user.id);
      return interaction.editReply({ content: "Đã hủy phòng chờ." });
    }
    if (action === "join") runtime.store.join(id, interaction.user);
    return interaction.editReply(
      accessPayload(runtime.issueTicket(id, interaction.user.id)),
    );
  } catch (error) {
    if (!MESSAGES[error.code] && error.code !== "WEB_DISABLED") throw error;
    return interaction.editReply({ content: error.message });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("caro")
    .setDescription("Caro hai người trên web · Bản thử nghiệm không cược")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("choi")
        .setDescription(
          "Tạo phòng caro, mời người khác tham gia và đấu trên web",
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("luat").setDescription("Xem luật caro thử nghiệm"),
    ),
  handleButton,
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Dùng lệnh caro trong server Discord.",
        flags: MessageFlags.Ephemeral,
      });
    if (interaction.options.getSubcommand() === "luat")
      return interaction.reply({
        content:
          "Caro thử nghiệm: /caro choi tạo phòng, người khác bấm Tham gia. Cả hai bấm Mở bàn cờ lấy link riêng dùng một lần (5 phút). Bàn 15×15, X đi trước; từ 5 quân liên tiếp thắng, kể cả bị chặn hai đầu. Mỗi lượt 90 giây, hết giờ xử thua; hết 30 phút xử hòa. Phòng chờ hết hạn sau 10 phút. Tải lại web để kết nối lại; đồng hồ vẫn chạy khi mất mạng. Không cược, không thưởng xu.",
        flags: MessageFlags.Ephemeral,
      });
    if (!runtime.isAvailable())
      return interaction.reply({
        content: DISABLED,
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferReply();
    let room;
    try {
      room = runtime.store.create({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: interaction.user,
      });
    } catch (error) {
      if (!MESSAGES[error.code]) throw error;
      return interaction.editReply({ content: error.message });
    }
    try {
      const message = await interaction.editReply(roomPayload(room));
      if (!message?.id) throw new Error("Caro lobby message was not created");
      runtime.store.attachMessage(room.id, message.id);
    } catch (error) {
      runtime.store.leave(room.id, interaction.user.id);
      throw error;
    }
  },
};
