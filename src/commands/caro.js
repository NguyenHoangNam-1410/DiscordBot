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
const runtime = require("../caro/runtime");
const { roomPayload, accessPayload, roomsPayload } = require("../caro/discord");
const { MESSAGES, MAX_ROOM_LIMIT } = require("../caro/store");
const { isAdminInteraction } = require("../utils/adminCheck");
const { MAX_TIME_MINUTES } = require("../webGames/clock");

const DISABLED =
  "Web trò chơi chưa được bật. Chủ bot cần cấu hình WEB_ENABLED và WEB_PUBLIC_URL (hoặc CARO_WEB_ENABLED/CARO_PUBLIC_URL cũ) rồi khởi động lại bot.";
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
  const list = /^caro:rooms:([^:]{1,30}):(-?\d{1,5})$/.exec(
    interaction.customId || "",
  );
  if (list) {
    if (!interaction.guildId || list[1] !== interaction.user.id)
      return interaction.reply({
        content:
          "Chỉ người mở danh sách mới dùng được nút này. Dùng /caro phong để mở danh sách của bạn.",
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
    /^caro:(join|open|cancel|connect|confirm):([a-f0-9-]{36})$/.exec(
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
        content: "Nút không thuộc phòng caro tại kênh này.",
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
    .setName("caro")
    .setDescription("Caro hai người trên web · Bản thử nghiệm không cược")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("choi")
        .setDescription(
          "Tạo phòng caro, mời người khác tham gia và đấu trên web",
        )
        .addIntegerOption((option) =>
          option
            .setName("kichthuoc")
            .setDescription("Số ô mỗi cạnh (9–25), mặc định 15")
            .setMinValue(9)
            .setMaxValue(25),
        )
        .addIntegerOption((option) =>
          option
            .setName("sothang")
            .setDescription("Số quân liên tiếp để thắng (3–6), mặc định 5")
            .setMinValue(3)
            .setMaxValue(6),
        )
        .addBooleanOption((option) =>
          option
            .setName("chan2dau")
            .setDescription(
              "Bật: nối đủ quân nhưng bị chặn cả hai đầu sẽ không thắng",
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("bienchan")
            .setDescription(
              "Bật: mép bàn tính là một đầu bị chặn (khi bật chan2dau)",
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("dungsoquan")
            .setDescription(
              "Bật: phải đúng số quân cần thắng; nối dài hơn không thắng",
            ),
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
      sub.setName("luat").setDescription("Xem luật caro thử nghiệm"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("phong")
        .setDescription("Xem các phòng caro đang mở trong kênh này"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cauhinh")
        .setDescription("Quản trị: giới hạn số phòng caro mỗi kênh")
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
        content: "Dùng lệnh caro trong server Discord.",
        flags: MessageFlags.Ephemeral,
      });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "cauhinh") {
      if (!isAdminInteraction(interaction))
        return interaction.reply({
          content: "Chỉ quản trị mới được cấu hình giới hạn phòng caro.",
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
        content: `Caro tại <#${channelId}>: tối đa **${limit} phòng chờ/đang đấu**. Mỗi người chỉ tham gia 1 phòng caro trong server. Giảm giới hạn không đóng các phòng hiện có.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === "luat")
      return interaction.reply({
        content:
          "Caro thử nghiệm: /caro choi tạo phòng, tùy chọn kichthuoc (9–25), sothang (3–6), chan2dau, bienchan và dungsoquan. Mặc định bàn 15×15, từ 5 quân thắng, chặn hai đầu vẫn thắng. Nếu bật chan2dau, hai đầu đều bị quân đối thủ chặn thì không thắng; bienchan cho phép tính mép bàn là chặn. dungsoquan yêu cầu đúng số quân, dài hơn không thắng. Luật được chốt khi tạo phòng. Mặc định 5 phòng chờ/đang đấu mỗi kênh; mỗi người 1 phòng caro trong server. /caro phong xem danh sách phòng; quản trị dùng /caro cauhinh phongtoida để chỉnh giới hạn theo kênh. X đi trước. Đồng hồ riêng mặc định 30 phút/người; chọn thoigian (1–180 phút), chỉ giảm khi tới lượt, không cộng giờ. Hết thời gian của mình thì thua; phòng chờ 10 phút. Mở bàn cờ để chơi/xem; người chơi xác nhận bằng mã trên web tại Kết nối tài khoản. Không cược, không thưởng xu.",
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
          "Bot chưa có quyền Xem kênh (View Channel) tại đây nên không thể tự cập nhật tin phòng khi ván trên web kết thúc. Quản trị viên cần bật quyền này cho bot tại kênh caro rồi tạo phòng lại. Với luồng riêng tư, cần thêm bot vào luồng.",
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
          size: interaction.options.getInteger?.("kichthuoc") ?? 15,
          winLength: interaction.options.getInteger?.("sothang") ?? 5,
          blockBothEnds: interaction.options.getBoolean?.("chan2dau") ?? false,
          edgeBlocks: interaction.options.getBoolean?.("bienchan") ?? false,
          exactLength: interaction.options.getBoolean?.("dungsoquan") ?? false,
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
      if (!message?.id) throw new Error("Caro lobby message was not created");
      runtime.store.attachMessage(room.id, message.id);
      runtime.bindInteraction(room.id, interaction);
    } catch (error) {
      runtime.store.leave(room.id, interaction.user.id);
      throw error;
    }
  },
};
