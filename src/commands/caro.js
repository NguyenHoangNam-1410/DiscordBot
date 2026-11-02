"use strict";

const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const runtime = require("../caro/runtime");
const { roomPayload, accessPayload } = require("../caro/discord");
const { MESSAGES } = require("../caro/store");

const DISABLED =
  "Web caro chưa được bật. Chủ bot cần cấu hình CARO_WEB_ENABLED và CARO_PUBLIC_URL trên VM rồi khởi động lại bot.";
async function handleButton(interaction) {
  const match =
    /^caro:(join|open|cancel|connect|confirm):([a-f0-9-]{36})$/.exec(
      interaction.customId || "",
    );
  if (!match) return;
  const action = match[1];
  if (action !== "connect")
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = (payload) =>
    action === "connect"
      ? interaction.reply({ ...payload, flags: MessageFlags.Ephemeral })
      : interaction.editReply(payload);
  try {
    if (!runtime.isAvailable()) return reply({ content: DISABLED });
    const [, action, id] = match;
    const room = runtime.store.get(id);
    if (
      !room ||
      room.guildId !== interaction.guildId ||
      room.channelId !== interaction.channelId ||
      (action !== "confirm" && room.messageId !== interaction.message?.id)
    )
      return reply({
        content: "Nút không thuộc phòng caro tại kênh này.",
      });
    if (action === "connect") {
      if (!runtime.store.seat(room, interaction.user.id))
        return reply({
          content:
            "Bạn đang xem với vai trò khán giả. Chỉ hai người chơi mới cần kết nối tài khoản.",
        });
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`caro:confirm:${id}`)
          .setTitle("Kết nối bàn cờ của bạn")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("code")
                .setLabel("Mã 8 ký tự trên web của bạn")
                .setStyle(TextInputStyle.Short)
                .setMinLength(8)
                .setMaxLength(8)
                .setRequired(true),
            ),
          ),
      );
    }
    if (action === "confirm") {
      runtime.confirmPairing(
        id,
        interaction.user.id,
        interaction.fields.getTextInputValue("code"),
      );
      return reply({
        content: "Đã kết nối tài khoản. Quay lại tab bàn cờ để chơi.",
      });
    }
    if (action === "cancel") {
      if (room.status !== "waiting")
        return interaction.editReply({
          content: "Phòng không còn chờ đối thủ. Có thể đầu hàng trên bàn web.",
        });
      runtime.store.leave(id, interaction.user.id);
      return interaction.editReply({ content: "Đã hủy phòng chờ." });
    }
    if (action === "join") {
      runtime.store.join(id, interaction.user);
      return reply({
        content:
          "Đã tham gia! Bấm Mở bàn cờ trong tin phòng để chơi. Nếu chưa kết nối, lấy mã trên web rồi nhập tại Kết nối tài khoản.",
      });
    }
    return interaction.editReply(
      accessPayload(runtime.issueTicket(id, interaction.user.id)),
    );
  } catch (error) {
    if (
      !MESSAGES[error.code] &&
      !["WEB_DISABLED", "PAIR_INVALID", "PAIR_LIMIT"].includes(error.code) &&
      error.httpStatus !== 403
    )
      throw error;
    return reply({ content: error.message });
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
          "Caro thử nghiệm: /caro choi tạo phòng, người khác bấm Tham gia. Mở bàn cờ đi thẳng tới web; ai có link đều xem trực tiếp được. Người chơi bấm Xác nhận người chơi trên web, nhập mã tại Kết nối tài khoản trong tin phòng Discord để nhận quyền đánh. Bàn 15×15, X đi trước; từ 5 quân liên tiếp thắng, kể cả bị chặn hai đầu. Mỗi lượt 90 giây, hết giờ xử thua; hết 30 phút xử hòa. Phòng chờ hết hạn sau 10 phút. Đồng hồ vẫn chạy khi mất mạng. Không cược, không thưởng xu.",
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
      const message = await interaction.editReply(
        roomPayload(room, runtime.roomUrl(room.id)),
      );
      if (!message?.id) throw new Error("Caro lobby message was not created");
      runtime.store.attachMessage(room.id, message.id);
    } catch (error) {
      runtime.store.leave(room.id, interaction.user.id);
      throw error;
    }
  },
};
