const { createCanvas, Path2D } = require("@napi-rs/canvas");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const characterOutlines = require("../../assets/xiangqi/characters.json");
const PIECE_CHARACTERS = Object.freeze({
  K: "帥",
  k: "將",
  A: "仕",
  a: "士",
  B: "相",
  b: "象",
  N: "馬",
  n: "馬",
  R: "車",
  r: "車",
  C: "炮",
  c: "砲",
  P: "兵",
  p: "卒",
});
const characterPaths = new Map();

function drawPieceCharacter(ctx, piece, x, y) {
  const character = PIECE_CHARACTERS[piece];
  const outline = characterOutlines.characters[character];
  if (!outline) throw new Error("MISSING_XIANGQI_CHARACTER");
  let shape = characterPaths.get(character);
  if (!shape) {
    shape = new Path2D(outline.path);
    characterPaths.set(character, shape);
  }
  const [left, bottom, right, top] = outline.bounds;
  const scale = Math.min(28 / (right - left), 29 / (top - bottom));
  // Embedded glyph outlines keep Chinese pieces identical without any system font.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, -scale);
  ctx.translate(-(left + right) / 2, -(bottom + top) / 2);
  ctx.fill(shape);
  ctx.restore();
}
const HELP =
  "Gửi **toàn bộ các nước của bên cần giải trong một tin nhắn**; bot tự đi nước đáp trả.\n" +
  "**ICCS:** ô đi + ô đến, ví dụ `h2e2`. Cột **a–i**, hàng **0–9** theo tọa độ trên ảnh, giữ nguyên khi lật bàn.\n" +
  "**Ký hiệu Việt:** `P2.5` hoặc `Pháo 2 bình 5`; `M2+3` hoặc `Mã 2 tiến 3`. Các nước dạng từ ngữ cách nhau bằng **dấu chấm phẩy** hoặc xuống dòng. " +
  "X = Xe, M = Mã, T = Tượng, S = Sĩ, P = Pháo, B = Binh/Tốt, K = Tướng. `+` tiến, `-` thoái, `.` bình. Số cột tính từ bên đang đi. " +
  "Cũng nhận ký hiệu WXF như `C2=5`. Ghi rõ quân trước/sau bằng WXF nếu có hai quân cùng cột; không đoán quân khi ký hiệu mơ hồ.\n" +
  "Mỗi kênh chỉ có một bàn cờ mở. Đúng sẽ thả ✅ và trả thưởng cơ sở × N²; hết 1 giờ tự đóng. Giải xong không mở bàn mới. " +
  "Kho thế được xoay vòng; mỗi người chỉ nhận thưởng một lần cho mỗi thế. ♻️ nghĩa là bạn đã nhận thưởng thế đó, bàn vẫn dành cho người khác. Mention đầu tin được bỏ qua.";
function pieces(fen) {
  const result = [];
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, index) => {
      let x = 0;
      for (const c of row) {
        if (/[1-9]/.test(c)) x += Number(c);
        else {
          result.push({ x, y: 9 - index, piece: c });
          x++;
        }
      }
    });
  return result;
}
function boardImage(puzzle) {
  const cell = 56,
    edge = 48,
    width = cell * 8 + edge * 2,
    height = cell * 9 + edge * 2;
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#eed6a4";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#654222";
  ctx.lineWidth = 1.5;
  for (let row = 0; row < 10; row++) {
    ctx.beginPath();
    ctx.moveTo(edge, edge + row * cell);
    ctx.lineTo(width - edge, edge + row * cell);
    ctx.stroke();
  }
  for (let col = 0; col < 9; col++) {
    ctx.beginPath();
    ctx.moveTo(edge + col * cell, edge);
    ctx.lineTo(edge + col * cell, edge + cell * 4);
    ctx.moveTo(edge + col * cell, edge + cell * 5);
    ctx.lineTo(edge + col * cell, height - edge);
    ctx.stroke();
  }
  for (const col of [0, 8]) {
    ctx.beginPath();
    ctx.moveTo(edge + col * cell, edge + cell * 4);
    ctx.lineTo(edge + col * cell, edge + cell * 5);
    ctx.stroke();
  }
  for (const row of [0, 7])
    for (const reverse of [false, true]) {
      ctx.beginPath();
      ctx.moveTo(edge + cell * (reverse ? 5 : 3), edge + row * cell);
      ctx.lineTo(edge + cell * (reverse ? 3 : 5), edge + (row + 2) * cell);
      ctx.stroke();
    }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#785638";
  ctx.font = '18px "Arial", "DejaVu Sans", sans-serif';
  ctx.fillText("SÔNG", width / 2, edge + cell * 4.5);
  const black = puzzle.side === "b";
  ctx.font = '13px "Arial", "DejaVu Sans", sans-serif';
  for (let col = 0; col < 9; col++) {
    const file = "abcdefghi"[black ? 8 - col : col];
    ctx.fillText(`${file} · ${9 - col}`, edge + col * cell, 14);
    ctx.fillText(`${file} · ${9 - col}`, edge + col * cell, height - 14);
  }
  for (let row = 0; row < 10; row++) {
    const rank = black ? row : 9 - row;
    ctx.fillText(String(rank), 12, edge + row * cell);
    ctx.fillText(String(rank), width - 12, edge + row * cell);
  }
  for (const { x, y, piece } of pieces(puzzle.fen)) {
    const px = edge + (black ? 8 - x : x) * cell,
      py = edge + (black ? y : 9 - y) * cell,
      red = piece === piece.toUpperCase();
    ctx.beginPath();
    ctx.arc(px, py, 23, 0, Math.PI * 2);
    ctx.fillStyle = "#fff1c9";
    ctx.fill();
    ctx.strokeStyle = red ? "#ba2928" : "#252c35";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 19, 0, Math.PI * 2);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = red ? "#ba2928" : "#252c35";
    drawPieceCharacter(ctx, piece, px, py);
  }
  return canvas.toBuffer("image/png");
}
function roundEmbed(round) {
  const puzzle = JSON.parse(round.puzzle_json),
    open = round.status === "open";
  const outcome = {
    won: "ĐÃ GIẢI",
    skipped: "ĐÃ BỎ QUA",
    expired: "HẾT GIỜ",
    admin_closed: "ĐÃ ĐÓNG",
    delivery_failed: "CHƯA GỬI ĐƯỢC BÀN",
  };
  const embed = new EmbedBuilder()
    .setColor(open ? 0xb8332e : round.status === "won" ? 0x2ecc71 : 0x7f8c8d)
    .setTitle(
      `🀄 CỜ TƯỚNG · CHIẾU HẾT TRONG ${round.mate} NƯỚC${open ? "" : ` · ${outcome[round.status] || "ĐÃ ĐÓNG"}`}`,
    )
    .setDescription(
      `**${puzzle.side === "r" ? "Đỏ" : "Đen"} đi trước** · Thưởng **${round.reward.toLocaleString("vi-VN")} xu**\n` +
        (open
          ? `Gửi các nước của bên cần giải bằng ICCS hoặc ký hiệu Việt.\nĐóng bàn <t:${Math.floor(round.expires_at / 1000)}:R> · \`/cotuong huongdan\`.`
          : round.status === "won"
            ? `🏆 <@${round.winner_id}> đã giải và nhận thưởng.`
            : "Dùng `/cotuong choi` để mở bàn mới."),
    )
    .setImage(`attachment://cotuong-${round.id}.png`)
    .setFooter({
      text: `Mã ván: ${round.id} · Kho thế đã kiểm chứng · ${puzzle.id}`,
    });
  if (round.status === "won")
    embed.addFields({
      name: "Lời giải ICCS (hai bên luân phiên)",
      value: `\`${round.answer_uci}\``,
    });
  return embed;
}
function roundPayload(round, image = null) {
  return {
    embeds: [roundEmbed(round)],
    files: [
      new AttachmentBuilder(
        image || boardImage(JSON.parse(round.puzzle_json)),
        { name: `cotuong-${round.id}.png` },
      ),
    ],
    components: [],
    allowedMentions: { parse: [] },
  };
}
module.exports = {
  HELP,
  PIECE_CHARACTERS,
  drawPieceCharacter,
  pieces,
  boardImage,
  roundEmbed,
  roundPayload,
};
