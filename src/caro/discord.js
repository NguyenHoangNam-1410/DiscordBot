"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { normalizeRules, rulesText } = require("./rules");

const REASONS = {
  win: "Đủ từ 5 quân liên tiếp",
  timeout: "Đối thủ hết 90 giây cho lượt đi",
  resign: "Đối thủ đầu hàng",
  duration: "Hết thời gian trận 30 phút",
  draw: "Bàn cờ đã kín",
  expired: "Không có đối thủ sau 10 phút",
  cancelled: "Chủ phòng đã hủy",
};
function roomPayload(room, url) {
  const rules = normalizeRules(room.rules);
  const waiting = room.status === "waiting",
    playing = room.status === "playing";
  const result = room.winner
    ? `**${room.winner} · ${room.players[room.winner].name} thắng!**`
    : ["duration", "draw"].includes(room.reason)
      ? "**Hai người hòa nhau.**"
      : "**Phòng đã đóng.**";
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
          ? "Bấm **Tham gia** để đấu với chủ phòng. **Mở bàn cờ** để chơi hoặc xem trực tiếp."
          : playing
            ? "Bấm **Mở bàn cờ** để chơi hoặc xem trực tiếp. Người chơi dùng **Kết nối tài khoản** để nhập mã trên web."
            : `${result}\n${room.reason === "win" ? `Nối ${rules.exactLength ? "đúng" : "từ"} ${rules.winLength} quân theo luật phòng` : REASONS[room.reason] || ""}`,
        "",
        `${rulesText(rules)} · X đi trước`,
        "90 giây/lượt · Tối đa 30 phút/trận · Thử nghiệm, không cược và không thưởng xu",
      ].join("\n"),
    )
    .setFooter({
      text: `Phòng ${room.id.slice(0, 8)} · ${waiting ? "Chờ đối thủ" : playing ? "Đang đấu" : `${room.moves} nước đi`} · Khán giả có thể xem trực tiếp`,
    });
  const row = new ActionRowBuilder();
  if (waiting)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`caro:join:${room.id}`)
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
        .setCustomId(`caro:connect:${room.id}`)
        .setLabel("Kết nối tài khoản")
        .setStyle(ButtonStyle.Secondary),
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
