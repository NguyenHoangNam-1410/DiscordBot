"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { rulesText } = require("./rules");
const labels = (room) =>
  Object.fromEntries(
    ["X", "O"].map((seat) => [
      seat,
      room.sideBySeat[seat] === "red" ? "Đỏ ●" : "Xanh ◆",
    ]),
  );

const REASONS = {
  den: "Chiếm hang địch",
  elimination: "Đối thủ không còn quân",
  no_legal_moves: "Đối thủ không còn nước đi hợp lệ",
  threefold: "Cùng thế cờ và bên đến lượt xuất hiện lần thứ ba",
  no_capture_limit: "100 lượt liên tiếp không ăn quân",
  timeout: "Đối thủ đã hết thời gian trên đồng hồ riêng",
  resign: "Đối thủ đầu hàng",
  expired: "Không có đối thủ sau 10 phút",
  cancelled: "Chủ phòng đã hủy",
};
function roomPayload(room, url) {
  const LABELS = labels(room);
  const waiting = room.status === "waiting",
    playing = room.status === "playing";
  const result = room.winner
    ? `**${LABELS[room.winner]} · ${room.players[room.winner].name} thắng!**`
    : room.reason === "draw"
      ? "**Hai người hòa nhau.**"
      : "**Phòng đã đóng.**";
  const embed = new EmbedBuilder()
    .setColor(waiting ? 0xe5a94c : playing ? 0x4e8cff : 0x55c994)
    .setTitle(
      waiting
        ? "▦ CỜ THÚ · CHỜ ĐỐI THỦ"
        : playing
          ? "▦ CỜ THÚ · ĐANG ĐẤU TRÊN WEB"
          : "▦ CỜ THÚ · KẾT QUẢ",
    )
    .setDescription(
      [
        `**${LABELS.X}:** <@${room.players.X.id}> · **${room.pieces.filter((p) => p.side === room.sideBySeat.X && p.cell !== null).length}/8 quân**`,
        `**${LABELS.O}:** ${room.players.O ? `<@${room.players.O.id}>` : "Đang chờ người tham gia"} · **${room.pieces.filter((p) => p.side === room.sideBySeat.O && p.cell !== null).length}/8 quân**`,
        "",
        waiting
          ? "Bấm **Tham gia** để đấu với chủ phòng. **Mở bàn cờ** để chơi hoặc xem trực tiếp."
          : playing
            ? "Bấm **Mở bàn cờ** để chơi hoặc xem trực tiếp. Người chơi dùng **Kết nối tài khoản** để nhập mã trên web."
            : `${result}\n${REASONS[room.endReason || room.reason] || ""}`,
        "",
        playing
          ? `Lượt ${LABELS[room.turn]} · Chọn quân → Ô đích → Xác nhận`
          : "Đồng hồ của Đỏ bắt đầu ngay khi đối thủ tham gia.",
        `${rulesText(room.rules)} · ${LABELS[room.first]} do ${room.first === "X" ? "chủ phòng" : "khách"} cầm`,
        "Đồng hồ riêng, chỉ chạy khi tới lượt · Không cộng giờ · Không cược và không thưởng xu",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.id.slice(0, 8)} · ${waiting ? "Chờ đối thủ" : playing ? "Đang đấu" : `${room.moves} nước đi`} · Khán giả có thể xem trực tiếp`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cothu:join:${room.id}`)
        .setLabel("Tham gia")
        .setStyle(ButtonStyle.Success),
    );
  if (url)
    row.addComponents(
      new ButtonBuilder()
        .setURL(url)
        .setLabel(playing || waiting ? "Mở bàn cờ" : "Xem lại bàn cờ")
        .setStyle(ButtonStyle.Link),
    );
  if (waiting || playing)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cothu:connect:${room.id}`)
        .setLabel("Kết nối tài khoản")
        .setStyle(ButtonStyle.Secondary),
    );
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cothu:cancel:${room.id}`)
        .setLabel("Hủy phòng")
        .setStyle(ButtonStyle.Secondary),
    );
  if (!waiting && !playing)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cothu:rematch:${room.id}`)
        .setLabel("Chơi lại · Phòng mới")
        .setStyle(ButtonStyle.Primary),
    );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}
function accessPayload(url) {
  return {
    content:
      "Bấm nút dưới để vào bàn bằng tài khoản Discord vừa xác nhận. Link dùng một lần, hết hạn sau 5 phút; hãy giữ riêng. Nếu link đã dùng, bấm Mở bàn cờ để lấy link mới.",
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Vào bàn cothu")
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
    .setTitle("▦ CỜ THÚ · DANH SÁCH PHÒNG")
    .setDescription(
      rooms.length
        ? "Chọn **Mở bàn** để chơi/xem trực tiếp. Muốn tham gia, mở **Tin phòng** và bấm Tham gia."
        : "Chưa có phòng cothu đang mở trong kênh này. Dùng **/cothu choi** để tạo phòng.",
    )
    .setFooter({
      text: `${rooms.length} phòng đang mở · Giới hạn mở mới: ${limit} · Trang ${page + 1}/${pages}`,
    });
  for (const room of shown) {
    const LABELS = labels(room);
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
        .setCustomId(`cothu:rooms:${ownerId}:${page - 1}`)
        .setLabel("Trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`cothu:rooms:${ownerId}:${page}`)
        .setLabel("Làm mới")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cothu:rooms:${ownerId}:${page + 1}`)
        .setLabel("Sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pages - 1),
    ),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

module.exports = { roomPayload, accessPayload, roomsPayload };
