"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { rulesText } = require("./rules");
const engine = require("./engine");
const labels = () => ({ X: "Bên xanh", O: "Bên cam" });
const REASONS = {
  all_quan: "Hai quan đã bị ăn · Đã thu quân và tính nợ",
  no_supply: "Không đủ dân để rải lại · Đã thu quân và tính nợ",
  repetition: "Lặp thế 3 lần · Chốt điểm",
  move_limit: "Đạt 500 lượt · Chốt điểm",
  timeout: "Đối thủ hết thời gian",
  resign: "Đối thủ đầu hàng",
  expired: "Phòng chờ hết hạn sau 10 phút",
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
        ? "▦ Ô ĂN QUAN · CHỜ ĐỐI THỦ"
        : playing
          ? "▦ Ô ĂN QUAN · ĐANG ĐẤU TRÊN WEB"
          : "▦ Ô ĂN QUAN · KẾT QUẢ",
    )
    .setDescription(
      [
        `**${LABELS.X}:** <@${room.players.X.id}> · **${engine.scores(room).X} điểm**`,
        `**${LABELS.O}:** ${room.players.O ? `<@${room.players.O.id}>` : "Đang chờ người tham gia"} · **${engine.scores(room).O} điểm**`,
        "",
        waiting
          ? "Bấm **Tham gia** để đấu với chủ phòng. **Mở bàn cờ** để chơi hoặc xem trực tiếp."
          : playing
            ? "Bấm **Mở bàn cờ** để chơi hoặc xem trực tiếp. Người chơi dùng **Kết nối tài khoản** để nhập mã trên web."
            : `${result}\n${REASONS[room.endReason || room.reason] || ""}`,
        "",
        playing
          ? `Lượt ${LABELS[room.turn]} · Chọn ô dân → Hướng rải → Xác nhận`
          : waiting
            ? "Đồng hồ người đi trước bắt đầu khi đối thủ tham gia."
            : "Đã chốt kết quả ván đấu.",
        `${rulesText(room.rules)} · ${LABELS[room.first]} đi trước`,
        "Đồng hồ riêng, tạm dừng lúc rải / ăn quân · Không cộng giờ · Không cược và không thưởng xu",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.id.slice(0, 8)} · ${waiting ? "Chờ đối thủ" : playing ? "Đang đấu" : `${room.moves} nước đi`} · Khán giả có thể xem trực tiếp`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`oanquan:join:${room.id}`)
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
        .setCustomId(`oanquan:connect:${room.id}`)
        .setLabel("Kết nối tài khoản")
        .setStyle(ButtonStyle.Secondary),
    );
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`oanquan:cancel:${room.id}`)
        .setLabel("Hủy phòng")
        .setStyle(ButtonStyle.Secondary),
    );
  if (!waiting && !playing)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`oanquan:rematch:${room.id}`)
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
          .setLabel("Vào bàn Ô ăn quan")
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
    .setTitle("▦ Ô ĂN QUAN · DANH SÁCH PHÒNG")
    .setDescription(
      rooms.length
        ? "Chọn **Mở bàn** để chơi/xem trực tiếp. Muốn tham gia, mở **Tin phòng** và bấm Tham gia."
        : "Chưa có phòng Ô ăn quan đang mở trong kênh này. Dùng **/oanquan choi** để tạo phòng.",
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
        .setCustomId(`oanquan:rooms:${ownerId}:${page - 1}`)
        .setLabel("Trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`oanquan:rooms:${ownerId}:${page}`)
        .setLabel("Làm mới")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`oanquan:rooms:${ownerId}:${page + 1}`)
        .setLabel("Sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pages - 1),
    ),
  );
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

module.exports = { roomPayload, accessPayload, roomsPayload };
