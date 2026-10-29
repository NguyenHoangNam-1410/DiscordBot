const { createCanvas } = require("@napi-rs/canvas");
const { Chess } = require("chess.js");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");

const GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const number = (value) => Number(value).toLocaleString("vi-VN");
const HELP =
  "Gửi **toàn bộ các nước của bên cần giải trong một tin nhắn**, cách nhau bằng dấu cách. " +
  "Chấp nhận UCI (`g1f3`, `e7e8q`) và SAN (`Nf3`, `exd8=Q+`, `O-O`). " +
  "Chỉ nhập nước của bạn; bot tự kiểm tra nước đáp trả của đối phương. " +
  "Ví dụ về định dạng hai nước: `Qh7+ Rh8#`.\n" +
  "Đúng toàn bộ lời giải: ✅ và người gửi đầu tiên thắng. Tin sai không đổi bàn và không gia hạn. " +
  "Mỗi kênh chỉ có một bàn chưa giải. Bàn đóng sau đúng 1 giờ; giải xong không tự mở bàn mới.";

function boardImage(puzzle) {
  const size = 64,
    edge = 32,
    total = size * 8 + edge * 2;
  const canvas = createCanvas(total, total);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#20242c";
  ctx.fillRect(0, 0, total, total);
  const board = new Chess(puzzle.fen);
  const black = puzzle.side === "b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = black ? 7 - col : col;
      const rank = black ? row + 1 : 8 - row;
      const x = edge + col * size,
        y = edge + row * size;
      ctx.fillStyle = (row + col) % 2 ? "#78908a" : "#e8e4d5";
      ctx.fillRect(x, y, size, size);
      const piece = board.get(`${"abcdefgh"[file]}${rank}`);
      if (piece) {
        ctx.font = '50px "Segoe UI Symbol", "DejaVu Sans", sans-serif';
        ctx.lineWidth = 2;
        ctx.strokeStyle = piece.color === "w" ? "#252932" : "#ece9df";
        ctx.fillStyle = piece.color === "w" ? "#ffffff" : "#151a22";
        ctx.strokeText(GLYPHS[piece.type], x + size / 2, y + size / 2 + 2);
        ctx.fillText(GLYPHS[piece.type], x + size / 2, y + size / 2 + 2);
      }
    }
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#e8e4d5";
    const rank = black ? row + 1 : 8 - row;
    ctx.fillText(String(rank), edge / 2, edge + row * size + size / 2);
    ctx.fillText(String(rank), total - edge / 2, edge + row * size + size / 2);
    const file = "abcdefgh"[black ? 7 - row : row];
    ctx.fillText(file, edge + row * size + size / 2, edge / 2);
    ctx.fillText(file, edge + row * size + size / 2, total - edge / 2);
  }
  return canvas.toBuffer("image/png");
}

function roundEmbed(round) {
  const puzzle = JSON.parse(round.puzzle_json);
  const open = round.status === "open";
  const outcome = {
    won: "ĐÃ GIẢI",
    skipped: "ĐÃ BỎ QUA",
    expired: "HẾT GIỜ",
    admin_closed: "ĐÃ ĐÓNG",
    delivery_failed: "CHƯA GỬI ĐƯỢC BÀN",
  };
  const embed = new EmbedBuilder()
    .setColor(open ? 0x5865f2 : round.status === "won" ? 0x2ecc71 : 0x7f8c8d)
    .setTitle(
      `♟️ CỜ VUA · CHIẾU HẾT TRONG ${round.mate} NƯỚC${open ? "" : ` · ${outcome[round.status] || "ĐÃ ĐÓNG"}`}`,
    )
    .setDescription(
      `**${puzzle.side === "w" ? "Trắng" : "Đen"} đi trước** · Thưởng **${number(round.reward)} xu**\n` +
        (open
          ? `Gửi đủ **${round.mate} nước của bên ${puzzle.side === "w" ? "Trắng" : "Đen"}** trong một tin nhắn, dùng UCI hoặc SAN.\nĐóng bàn <t:${Math.floor(round.expires_at / 1000)}:R>. Xem cách nhập: \`/covua huongdan\`.`
          : round.status === "won"
            ? `🏆 <@${round.winner_id}> đã giải và nhận **${number(round.reward)} xu**.`
            : "Bàn cờ đã đóng. Dùng `/covua choi` để mở bàn mới."),
    )
    .setImage(`attachment://covua-${round.id}.png`)
    .setFooter({
      text: `Mã ván: ${round.id} · Nguồn: Lichess${puzzle.rating === null ? "" : ` · Rating ${puzzle.rating}`}`,
    });
  if (!open && round.status === "won")
    embed.addFields({
      name: "Lời giải UCI (hai bên luân phiên)",
      value: `\`${round.answer_uci}\``,
    });
  if (!open)
    embed.addFields({
      name: "Puzzle gốc",
      value: `[Xem trên Lichess](https://lichess.org/training/${round.puzzle_id})`,
    });
  return embed;
}

function roundPayload(round, image = null) {
  const puzzle = JSON.parse(round.puzzle_json);
  return {
    embeds: [roundEmbed(round)],
    files: [
      new AttachmentBuilder(image || boardImage(puzzle), {
        name: `covua-${round.id}.png`,
      }),
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}

module.exports = { HELP, boardImage, roundEmbed, roundPayload };
