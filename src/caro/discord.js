"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const REASONS = {
  win: "Đủ từ 5 quân liên tiếp",
  timeout: "Đối thủ hết 90 giây cho lượt đi",
  resign: "Đối thủ đầu hàng",
  duration: "Hết thời gian trận 30 phút",
  draw: "Bàn cờ đã kín",
  expired: "Không có đối thủ sau 10 phút",
  cancelled: "Chủ phòng đã hủy",
};
function roomPayload(room) {
  const waiting = room.status === "waiting",
    playing = room.status === "playing";
  const result = room.winner
    ? `**${room.winner} · ${room.players[room.winner].name} thắng!**`
    : "**Trận đã kết thúc**";
  const embed = new EmbedBuilder()
    .setColor(waiting ? 0xe5a94c : playing ? 0x4e8cff : 0x55c994)
    .setTitle(
      waiting
        ? "✕ ◯ CARO · CHỜ ĐỐI THỦ"
        : playing
          ? "✕ ◯ CARO · ĐANG ĐẤU TRÊN WEB"
          : "✕ ◯ CARO · KẾT QUẢ",
    )
    .setDescription(
      [
        `**X:** <@${room.players.X.id}>`,
        `**O:** ${room.players.O ? `<@${room.players.O.id}>` : "Đang chờ người tham gia"}`,
        "",
        waiting
          ? "Bấm **Tham gia** để đấu với chủ phòng. Hai người bấm **Mở bàn cờ** để lấy link riêng."
          : playing
            ? "Hai người bấm **Mở bàn cờ** để chơi hoặc quay lại trận đang đấu."
            : `${result}\n${REASONS[room.reason] || ""}`,
        "",
        "Bàn 15×15 · Từ 5 quân liên tiếp thắng, kể cả chặn hai đầu · X đi trước",
        "90 giây/lượt · Tối đa 30 phút/trận · Thử nghiệm, không cược và không thưởng xu",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.id.slice(0, 8)} · Link vào bàn riêng có hiệu lực 5 phút`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caro:join:${room.id}`)
        .setLabel("Tham gia")
        .setStyle(ButtonStyle.Success),
    );
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`caro:open:${room.id}`)
      .setLabel("Mở bàn cờ")
      .setStyle(ButtonStyle.Primary),
  );
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caro:cancel:${room.id}`)
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
          .setLabel("Vào bàn caro")
          .setURL(url),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

module.exports = { roomPayload, accessPayload };
