"use strict";
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { rulesText } = require("./rules");
const LABELS = require("../webGames/playerIdentity").PLAYER_LABELS.gunny;
const REASONS = {
  hp: "Hạ gục đối thủ",
  fall: "Rơi khỏi địa hình",
  draw: "Cả hai cùng bị hạ",
  resign: "Đối thủ đầu hàng",
  timeout: "Hết thời gian trên đồng hồ riêng",
  idle: "Không thao tác trong 5 phút",
  setup_timeout: "Hết thời gian chọn nhân vật",
  expired: "Không có đối thủ sau 10 phút",
  cancelled: "Chủ phòng đã hủy",
};
function roomPayload(room, url) {
  const waiting = room.status === "waiting",
    open = ["waiting", "setup", "playing"].includes(room.status);
  const result = room.winner
    ? `**${room.players[room.winner].name} chiến thắng!**`
    : "**Phòng đã đóng.**";
  const embed = new EmbedBuilder()
    .setColor(waiting ? 0xe5a94c : open ? 0x4e8cff : 0x55c994)
    .setTitle(
      `◎ GUNNY · ${waiting ? "CHỜ ĐỐI THỦ" : room.status === "setup" ? "CHỌN NHÂN VẬT" : open ? "ĐANG ĐẤU TRÊN WEB" : "KẾT QUẢ"}`,
    )
    .setDescription(
      [
        ...["X", "O"].map(
          (m) =>
            `**${LABELS[m]}:** ${room.players[m] ? `<@${room.players[m].id}>` : "Đang chờ người tham gia"} · ${room.fighters[m].hp} HP${room.status === "setup" ? (room.ready[m] ? " · Sẵn sàng" : " · Đang chọn") : ""}`,
        ),
        "",
        waiting
          ? "Bấm **Tham gia** để đấu với chủ phòng. Mở trận đấu để chơi hoặc xem trực tiếp."
          : room.status === "setup"
            ? "Hai người chọn nhân vật trên web và bấm **Sẵn sàng** trong 3 phút."
            : open
              ? `${LABELS[room.turn]} · ${room.phase === "firing" ? "Đạn đang bay" : "Đang ngắm bắn"} · Lượt ${room.turnNo}`
              : `${result}\n${REASONS[room.reason] || ""}`,
        "",
        rulesText(room.rules),
        "Không cược và không thưởng xu · Khán giả xem trực tiếp",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.roomCode || room.id.slice(0, 8)} · ${room.moves} phát bắn`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gunny:join:${room.id}`)
        .setLabel("Tham gia")
        .setStyle(ButtonStyle.Success),
    );
  if (url)
    row.addComponents(
      new ButtonBuilder()
        .setURL(url)
        .setLabel(open ? "Mở trận đấu" : "Xem lại trận đấu")
        .setStyle(ButtonStyle.Link),
    );
  if (open)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gunny:connect:${room.id}`)
        .setLabel("Kết nối tài khoản")
        .setStyle(ButtonStyle.Secondary),
    );
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gunny:cancel:${room.id}`)
        .setLabel("Hủy phòng")
        .setStyle(ButtonStyle.Secondary),
    );
  return {
    embeds: [embed],
    components: row.components.length ? [row] : [],
    allowedMentions: { parse: [] },
  };
}
function accessPayload(url) {
  return {
    content:
      "Bấm nút dưới để vào bàn bằng tài khoản Discord vừa xác nhận. Link dùng một lần, hết hạn sau 5 phút; hãy giữ riêng. Nếu link đã dùng, bấm Mở bàn cờ để lấy link mới.",
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Vào bàn gunny")
          .setURL(url),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function roomsPayload(
  rooms,
  { ownerId, page = 0, limit, guildId, channelId, roomUrl },
) {
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(rooms.length / pageSize));
  page = Math.max(0, Math.min(Number.isInteger(page) ? page : 0, pages - 1));
  const shown = rooms.slice(page * pageSize, (page + 1) * pageSize);
  const embed = new EmbedBuilder()
    .setColor(0x4e8cff)
    .setTitle("◎ GUNNY · DANH SÁCH PHÒNG")
    .setDescription(
      rooms.length
        ? "Chọn **Mở bàn** để chơi/xem trực tiếp. Muốn tham gia, mở **Tin phòng** và bấm Tham gia."
        : "Chưa có phòng gunny đang mở trong kênh này. Dùng **/gunny choi** để tạo phòng.",
    )
    .setFooter({
      text: `${rooms.length} phòng đang mở · Giới hạn mở mới: ${limit} · Trang ${page + 1}/${pages}`,
    });
  for (const room of shown) {
    const messageLink = room.messageId
      ? ` · [Tin phòng](https://discord.com/channels/${guildId}/${channelId}/${room.messageId})`
      : " · Đang đăng tin phòng";
    embed.addFields({
      name: `${room.status === "waiting" ? "🟢 Chờ đối thủ" : "🔵 Đang đấu"} · ${room.id.slice(0, 8)}`,
      value: `${LABELS.X}: <@${room.players.X.id}> · ${LABELS.O}: ${room.players.O ? `<@${room.players.O.id}>` : "Chưa có"}\n${rulesText(room.rules)}\n[Mở bàn](${roomUrl(room.id)})${messageLink}`,
    });
  }
  const components = [];
  if (shown.length)
    components.push(
      new ActionRowBuilder().addComponents(
        shown.map((room) =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(roomUrl(room.id))
            .setLabel(`Mở bàn ${room.id.slice(0, 8)}`),
        ),
      ),
    );
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gunny:rooms:${ownerId}:${page - 1}`)
        .setLabel("Trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`gunny:rooms:${ownerId}:${page}`)
        .setLabel("Làm mới")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`gunny:rooms:${ownerId}:${page + 1}`)
        .setLabel("Sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pages - 1),
    ),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

module.exports = { roomPayload, accessPayload, roomsPayload };
