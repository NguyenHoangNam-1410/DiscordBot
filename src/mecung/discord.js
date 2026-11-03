"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { rulesText } = require("./rules");
const LABELS = require("../webGames/playerIdentity").PLAYER_LABELS.mecung;

const REASONS = {
  win: "Đã tới đích theo luật của ván",
  draw: "Cả hai tới đích trong cùng số lượt",
  setup_timeout: "Đối thủ chưa xác nhận mê cung khi hết giờ chuẩn bị",
  setup_expired: "Cả hai chưa xác nhận mê cung khi hết giờ chuẩn bị",
  timeout: "Đối thủ đã hết thời gian trên đồng hồ riêng",
  resign: "Đối thủ đầu hàng",
  expired: "Không có đối thủ sau 10 phút",
  cancelled: "Chủ phòng đã hủy",
};
function roomPayload(room, url) {
  const waiting = room.status === "waiting",
    playing = ["setup", "playing"].includes(room.status);
  const result = room.winner
    ? `**${LABELS[room.winner]} · ${room.players[room.winner].name} thắng!**`
    : room.reason === "draw"
      ? "**Hai người hòa nhau.**"
      : "**Phòng đã đóng.**";
  const embed = new EmbedBuilder()
    .setColor(waiting ? 0xe5a94c : playing ? 0x4e8cff : 0x55c994)
    .setTitle(
      waiting
        ? "🧩 MÊ CUNG · CHỜ ĐỐI THỦ"
        : room.status === "setup"
          ? "🧩 MÊ CUNG · DỰNG MÊ CUNG"
          : playing
            ? "🧩 MÊ CUNG · ĐANG ĐẤU TRÊN WEB"
            : "🧩 MÊ CUNG · KẾT QUẢ",
    )
    .setDescription(
      [
        `**${LABELS.X}:** <@${room.players.X.id}>`,
        `**${LABELS.O}:** ${room.players.O ? `<@${room.players.O.id}>` : "Đang chờ người tham gia"}`,
        "",
        waiting
          ? "Bấm **Tham gia** để đấu với chủ phòng. **Mở bàn cờ** để chơi hoặc xem trực tiếp."
          : playing
            ? "Bấm **Mở bàn cờ** để chơi hoặc xem trực tiếp. Người chơi dùng **Kết nối tài khoản** để nhập mã trên web."
            : `${result}\n${REASONS[room.reason] || ""}`,
        "",
        `${rulesText(room.rules)} · Người dò xanh đi trước`,
        room.startedAt !== null
          ? `Tiến độ: ${LABELS.X} ${room.turns.X} lượt / ${room.visited.X.length} ô · ${LABELS.O} ${room.turns.O} lượt / ${room.visited.O.length} ô`
          : "",
        room.status === "setup"
          ? `Bố trí mê cung: ${LABELS.X} ${room.ready.X ? "đã xác nhận" : "chưa xong"} · ${LABELS.O} ${room.ready.O ? "đã xác nhận" : "chưa xong"} · Hạn <t:${Math.ceil(room.setupDeadline / 1000)}:R>`
          : "Đồng hồ riêng, chỉ chạy khi tới lượt · Không cộng giờ · Không cược và không thưởng xu",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.id.slice(0, 8)} · ${waiting ? "Chờ đối thủ" : room.status === "setup" ? "Đang bố trí" : playing ? "Đang đấu" : `${room.moves} bước thử`} · Khán giả có thể xem trực tiếp`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mecung:join:${room.id}`)
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
        .setCustomId(`mecung:connect:${room.id}`)
        .setLabel("Kết nối tài khoản")
        .setStyle(ButtonStyle.Secondary),
    );
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mecung:cancel:${room.id}`)
        .setLabel("Hủy phòng")
        .setStyle(ButtonStyle.Secondary),
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
          .setLabel("Vào bàn mecung")
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
    .setTitle("🧩 MÊ CUNG · DANH SÁCH PHÒNG")
    .setDescription(
      rooms.length
        ? "Chọn **Mở bàn** để chơi/xem trực tiếp. Muốn tham gia, mở **Tin phòng** và bấm Tham gia."
        : "Chưa có phòng mecung đang mở trong kênh này. Dùng **/mecung choi** để tạo phòng.",
    )
    .setFooter({
      text: `${rooms.length} phòng đang mở · Giới hạn mở mới: ${limit} · Trang ${page + 1}/${pages}`,
    });
  for (const room of shown) {
    const messageLink = room.messageId
      ? ` · [Tin phòng](https://discord.com/channels/${guildId}/${channelId}/${room.messageId})`
      : " · Đang đăng tin phòng";
    embed.addFields({
      name: `${room.status === "waiting" ? "🟢 Chờ đối thủ" : room.status === "setup" ? "🟡 Đang bố trí" : "🔵 Đang đấu"} · ${room.id.slice(0, 8)}`,
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
        .setCustomId(`mecung:rooms:${ownerId}:${page - 1}`)
        .setLabel("Trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`mecung:rooms:${ownerId}:${page}`)
        .setLabel("Làm mới")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mecung:rooms:${ownerId}:${page + 1}`)
        .setLabel("Sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pages - 1),
    ),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

module.exports = { roomPayload, accessPayload, roomsPayload };
