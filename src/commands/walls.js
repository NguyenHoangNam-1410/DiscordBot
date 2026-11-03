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
const runtime = require("../walls/runtime");
const {
  roomPayload,
  accessPayload,
  roomsPayload,
} = require("../walls/discord");
const { MESSAGES, MAX_ROOM_LIMIT } = require("../walls/store");
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
  const list = /^walls:rooms:([^:]{1,30}):(-?\d{1,5})$/.exec(
    interaction.customId || "",
  );
  if (list) {
    if (!interaction.guildId || list[1] !== interaction.user.id)
      return interaction.reply({
        content:
          "Chỉ người mở danh sách mới dùng được nút này. Dùng /walls phong để mở danh sách của bạn.",
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
    /^walls:(join|open|cancel|connect|confirm):([a-f0-9-]{36})$/.exec(
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
        content: "Nút không thuộc phòng walls tại kênh này.",
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
          .setCustomId(`walls:confirm:${id}`)
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
    .setName("walls")
    .setDescription("Walls / Wall Go · Đua tới đích, đặt tường chặn đối thủ")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("choi")
        .setDescription(
          "Tạo phòng walls, mời người khác tham gia và đấu trên web",
        )
        .addIntegerOption((option) =>
          option
            .setName("daituong")
            .setDescription("Độ dài mỗi tường, mặc định 2 ô")
            .addChoices({ name: "1 ô", value: 1 }, { name: "2 ô", value: 2 }),
        )
        .addIntegerOption((option) =>
          option
            .setName("sotuong")
            .setDescription("Số tường mỗi người (0–20), mặc định 10")
            .setMinValue(0)
            .setMaxValue(20),
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
      sub.setName("luat").setDescription("Xem luật walls thử nghiệm"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("phong")
        .setDescription("Xem các phòng walls đang mở trong kênh này"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cauhinh")
        .setDescription("Quản trị: giới hạn số phòng walls mỗi kênh")
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
        content: "Dùng lệnh walls trong server Discord.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "cauhinh") {
      if (!isAdminInteraction(interaction))
        return interaction.reply({
          content: "Chỉ quản trị mới được cấu hình giới hạn phòng walls.",
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
        content: `Walls tại <#${channelId}>: tối đa **${limit} phòng chờ/đang đấu**. Mỗi người chỉ tham gia 1 phòng walls trong server. Giảm giới hạn không đóng các phòng hiện có.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "luat")
      return interaction.reply({
        content:
          "Walls: /walls choi mở bàn cố định 9×9. Hai người xuất phát ở giữa hai cạnh đối diện; Quân xanh đi trước. Đến hàng đối diện trước để thắng. Mỗi lượt đi 1 ô ngang/dọc hoặc đặt 1 tường; không đi xuyên tường hay đứng chung ô. Được nhảy qua đối thủ theo Quoridor: ưu tiên nhảy thẳng, chỉ đi chéo vòng sang bên khi sau đối thủ bị tường/mép bàn chặn. Tường dài 1 hoặc 2 ô, không chồng/cắt và phải giữ đường tới đích cho cả hai. Tường có thể chạm đầu nhau. /walls choi daituong:2 sotuong:10 cấu hình cho ván mới; mặc định mỗi người 10 tường. Xem hoặc tham gia qua /walls phong; khán giả mở bàn xem trực tiếp. Mặc định 5 phòng/kênh; quản trị dùng /walls cauhinh phongtoida. Đồng hồ riêng mặc định 30 phút/người; chọn thoigian (1–180 phút), chỉ giảm khi tới lượt, không cộng giờ. Hết thời gian của mình thì thua; phòng chờ 10 phút. Không cược, không thưởng xu.",
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
          "Bot chưa có quyền Xem kênh (View Channel) tại đây nên không thể tự cập nhật tin phòng khi ván trên web kết thúc. Quản trị viên cần bật quyền này cho bot tại kênh walls rồi tạo phòng lại. Với luồng riêng tư, cần thêm bot vào luồng.",
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
          wallLength: interaction.options.getInteger?.("daituong") ?? 2,
          wallLimit: interaction.options.getInteger?.("sotuong") ?? 10,
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
      if (!message?.id) throw new Error("Walls lobby message was not created");
      runtime.store.attachMessage(room.id, message.id);
      runtime.bindInteraction(room.id, interaction);
    } catch (error) {
      runtime.store.leave(room.id, interaction.user.id);
      throw error;
    }
  },
};
