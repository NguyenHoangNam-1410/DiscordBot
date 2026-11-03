"use strict";

const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const runtime = require("../mecung/runtime");
const {
  roomPayload,
  accessPayload,
  roomsPayload,
} = require("../mecung/discord");
const { MESSAGES, MAX_ROOM_LIMIT } = require("../mecung/store");
const { isAdminInteraction } = require("../utils/adminCheck");
const { MAX_TIME_MINUTES } = require("../webGames/clock");

const DISABLED =
  "Web trò chơi chưa được bật. Chủ bot cần cấu hình WEB_ENABLED và WEB_PUBLIC_URL rồi khởi động lại bot.";
function roomList(interaction, page = 0) {
  return roomsPayload(
    runtime.store.listOpen(interaction.guildId, interaction.channelId),
    {
      ownerId: interaction.user.id,
      page,
      limit: runtime.store.getChannelLimit(
        interaction.guildId,
        interaction.channelId,
      ),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      roomUrl: runtime.roomUrl,
    },
  );
}
async function handleButton(interaction) {
  const list = /^mecung:rooms:([^:]{1,30}):(-?\d{1,5})$/.exec(
    interaction.customId || "",
  );
  if (list) {
    if (!interaction.guildId || list[1] !== interaction.user.id)
      return interaction.reply({
        content:
          "Chỉ người mở danh sách mới dùng được nút này. Dùng /mecung phong để mở danh sách của bạn.",
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferUpdate();
    if (!runtime.isAvailable())
      return interaction.editReply({
        content: DISABLED,
        embeds: [],
        components: [],
      });
    return interaction.editReply(roomList(interaction, Number(list[2])));
  }
  const match =
    /^mecung:(join|open|cancel|connect|confirm):([a-f0-9-]{36})$/.exec(
      interaction.customId || "",
    );
  if (!match) return;
  const action = match[1];
  const updatesRoom = ["join", "cancel"].includes(action);
  if (updatesRoom) await interaction.deferUpdate();
  else if (action !== "connect")
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = (payload) =>
    action === "connect"
      ? interaction.reply({ ...payload, flags: MessageFlags.Ephemeral })
      : updatesRoom
        ? interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral })
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
        content: "Nút không thuộc phòng mecung tại kênh này.",
      });
    if (updatesRoom) runtime.bindInteraction(id, interaction);
    if (action === "connect") {
      if (!runtime.store.seat(room, interaction.user.id))
        return reply({
          content:
            "Bạn đang xem với vai trò khán giả. Chỉ hai người chơi mới cần kết nối tài khoản.",
        });
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`mecung:confirm:${id}`)
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
      runtime.store.updatePlayer(id, interaction.user);
      return reply({
        content:
          "Đã xác nhận mã. Quay lại tab bàn cờ để hoàn tất kết nối và nhận quyền chơi.",
      });
    }
    if (action === "cancel") {
      if (room.status !== "waiting")
        return reply({
          content: "Phòng không còn chờ đối thủ. Có thể đầu hàng trên bàn web.",
        });
      runtime.store.leave(id, interaction.user.id);
      return reply({ content: "Đã hủy phòng chờ." });
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
    .setName("mecung")
    .setDescription("Mê cung · Dựng lối bí mật và thách đấu đối thủ")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("choi")
        .setDescription(
          "Tạo phòng mecung, mời người khác tham gia và đấu trên web",
        )
        .addStringOption((option) =>
          option
            .setName("luat")
            .setDescription("Cách thắng, mặc định đến đích trước")
            .addChoices(
              { name: "Đến đích trước", value: "race" },
              { name: "Ít lượt hơn (cân bằng lượt cuối)", value: "turns" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("kichthuoc")
            .setDescription("Nhỏ 7×7 · Vừa 9×9 · Lớn 11×11, mặc định Vừa")
            .addChoices(
              { name: "Nhỏ", value: "small" },
              { name: "Vừa", value: "medium" },
              { name: "Lớn", value: "large" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("sotuong")
            .setDescription(
              "Số đoạn tường tối đa mỗi người (0–60), mặc định 30",
            )
            .setMinValue(0)
            .setMaxValue(60),
        )
        .addIntegerOption((option) =>
          option
            .setName("thoigian")
            .setDescription(
              "Phút mỗi người, không cộng giờ (1–180), mặc định 30",
            )
            .setMinValue(1)
            .setMaxValue(MAX_TIME_MINUTES),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("luat").setDescription("Xem luật mecung thử nghiệm"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("phong")
        .setDescription("Xem các phòng mecung đang mở trong kênh này"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cauhinh")
        .setDescription("Quản trị: giới hạn số phòng mecung mỗi kênh")
        .addIntegerOption((option) =>
          option
            .setName("phongtoida")
            .setDescription("Tối đa 1–20 phòng đang mở, mặc định 5")
            .setMinValue(1)
            .setMaxValue(MAX_ROOM_LIMIT),
        )
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh cần cấu hình, mặc định kênh hiện tại")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
            ),
        ),
    ),
  handleButton,
  async execute(interaction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "Dùng lệnh mecung trong server Discord.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "cauhinh") {
      if (!isAdminInteraction(interaction))
        return interaction.reply({
          content: "Chỉ quản trị mới được cấu hình giới hạn phòng mecung.",
          flags: MessageFlags.Ephemeral,
        });
      const channel = interaction.options.getChannel?.("kenh");
      if (channel?.guildId && channel.guildId !== interaction.guildId)
        return interaction.reply({
          content: "Chọn kênh thuộc server hiện tại.",
          flags: MessageFlags.Ephemeral,
        });
      const channelId = channel?.id || interaction.channelId;
      const requested = interaction.options.getInteger?.("phongtoida");
      try {
        if (requested != null)
          runtime.store.setChannelLimit(
            interaction.guildId,
            channelId,
            requested,
            interaction.user.id,
          );
      } catch (error) {
        if (!MESSAGES[error.code]) throw error;
        return interaction.reply({
          content: error.message,
          flags: MessageFlags.Ephemeral,
        });
      }
      const limit = runtime.store.getChannelLimit(
        interaction.guildId,
        channelId,
      );
      return interaction.reply({
        content: `Mê cung tại <#${channelId}>: tối đa **${limit} phòng chờ/đang đấu**. Mỗi người chỉ tham gia 1 phòng mecung trong server. Giảm giới hạn không đóng các phòng hiện có.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "luat")
      return interaction.reply({
        content: require("../mecung/rules").RULES_TEXT,
        flags: MessageFlags.Ephemeral,
      });
    if (!runtime.isAvailable())
      return interaction.reply({
        content: DISABLED,
        flags: MessageFlags.Ephemeral,
      });
    if (subcommand === "phong")
      return interaction.reply({
        ...roomList(interaction),
        flags: MessageFlags.Ephemeral,
      });
    if (
      interaction.appPermissions &&
      !interaction.appPermissions.has(PermissionFlagsBits.ViewChannel)
    )
      return interaction.reply({
        content:
          "Bot chưa có quyền Xem kênh (View Channel) tại đây nên không thể tự cập nhật tin phòng khi ván trên web kết thúc. Quản trị viên cần bật quyền này cho bot tại kênh mecung rồi tạo phòng lại. Với luồng riêng tư, cần thêm bot vào luồng.",
        flags: MessageFlags.Ephemeral,
      });
    await interaction.deferReply();
    let room;
    try {
      room = runtime.store.create({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: interaction.user,
        rules: {
          mode: interaction.options.getString?.("kichthuoc") ?? "medium",
          winCondition: interaction.options.getString?.("luat") ?? "race",
          wallLimit: interaction.options.getInteger?.("sotuong") ?? 30,
          timeMinutes: interaction.options.getInteger?.("thoigian") ?? 30,
        },
      });
    } catch (error) {
      if (!MESSAGES[error.code]) throw error;
      return interaction.editReply({ content: error.message });
    }
    try {
      const message = await interaction.editReply(
        roomPayload(room, runtime.roomUrl(room.id)),
      );
      if (!message?.id)
        throw new Error("Mê cung lobby message was not created");
      runtime.store.attachMessage(room.id, message.id);
      runtime.bindInteraction(room.id, interaction);
    } catch (error) {
      runtime.store.leave(room.id, interaction.user.id);
      throw error;
    }
  },
};
