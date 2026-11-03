"use strict";
const { SIZE, STARTS } = require("./rules");
// All free polyominoes of orders 1–5. Coordinates are [row, column].
const FORMS = {
  I1: ["#"],
  I2: ["##"],
  I3: ["###"],
  V3: ["#.", "##"],
  I4: ["####"],
  L4: ["#.", "#.", "##"],
  O4: ["##", "##"],
  T4: ["###", ".#."],
  Z4: ["##.", ".##"],
  F5: [".##", "##.", ".#."],
  I5: ["#####"],
  L5: ["#.", "#.", "#.", "##"],
  N5: ["##..", ".###"],
  P5: ["##", "##", "#."],
  T5: ["###", ".#.", ".#."],
  U5: ["#.#", "###"],
  V5: ["#..", "#..", "###"],
  W5: ["#..", "##.", ".##"],
  X5: [".#.", "###", ".#."],
  Y5: [".#", "##", ".#", ".#"],
  Z5: ["##.", ".#.", ".##"],
};
function normalize(cells) {
  const r = Math.min(...cells.map((c) => c[0])),
    c = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([row, col]) => [row - r, col - c])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
function transform(cells, rotation = 0, flipped = false) {
  return normalize(
    cells.map(([r, c]) => {
      if (flipped) c = -c;
      for (let i = 0; i < rotation; i++) [r, c] = [c, -r];
      return [r, c];
    }),
  );
}
const PIECES = Object.freeze(
  Object.entries(FORMS).map(([id, rows]) =>
    Object.freeze({
      id,
      cells: Object.freeze(
        rows.flatMap((line, r) =>
          [...line].flatMap((ch, c) =>
            ch === "#" ? [Object.freeze([r, c])] : [],
          ),
        ),
      ),
    }),
  ),
);
const BY_ID = new Map(PIECES.map((p) => [p.id, p]));
const ORIENTATIONS = new Map(
  PIECES.map((p) => {
    const seen = new Set(),
      list = [];
    for (const flipped of [false, true])
      for (let rotation = 0; rotation < 4; rotation++) {
        const cells = transform(p.cells, rotation, flipped),
          key = JSON.stringify(cells);
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ rotation, flipped, cells });
        }
      }
    return [p.id, list];
  }),
);
const ADJACENT = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAGONAL = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const inside = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
function neighbor(board, r, c, mark, offsets) {
  return offsets.some(
    ([dr, dc]) =>
      inside(r + dr, c + dc) && board[(r + dr) * SIZE + c + dc] === mark,
  );
}
function errorForCells(room, mark, cells) {
  if (cells.some(([r, c]) => !inside(r, c))) return "OUTSIDE";
  if (cells.some(([r, c]) => room.board[r * SIZE + c])) return "OCCUPIED";
  if (cells.some(([r, c]) => neighbor(room.board, r, c, mark, ADJACENT)))
    return "EDGE_TOUCH";
  if (!room.used[mark].length) {
    const starts = room.starts[mark] == null ? STARTS : [room.starts[mark]];
    return cells.some(([r, c]) => starts.includes(r * SIZE + c))
      ? null
      : "START_REQUIRED";
  }
  return cells.some(([r, c]) => neighbor(room.board, r, c, mark, DIAGONAL))
    ? null
    : "CORNER_REQUIRED";
}
function placement(room, mark, data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { error: "INVALID_PLACEMENT" };
  const piece = BY_ID.get(data.pieceId);
  if (
    !piece ||
    !Number.isInteger(data.rotation) ||
    data.rotation < 0 ||
    data.rotation > 3 ||
    typeof data.flipped !== "boolean" ||
    !Number.isInteger(data.row) ||
    !Number.isInteger(data.col) ||
    data.row < 0 ||
    data.col < 0 ||
    data.row >= SIZE ||
    data.col >= SIZE
  )
    return { error: "INVALID_PLACEMENT" };
  if (room.used[mark].includes(piece.id)) return { error: "PIECE_USED" };
  const cells = transform(piece.cells, data.rotation, data.flipped).map(
    ([r, c]) => [r + data.row, c + data.col],
  );
  return { error: errorForCells(room, mark, cells), cells };
}
function place(room, mark, data) {
  const result = placement(room, mark, data);
  if (result.error)
    throw Object.assign(new Error(result.error), { code: result.error });
  if (!room.used[mark].length && room.starts[mark] == null) {
    const start = STARTS.find((s) =>
      result.cells.some(([r, c]) => r * SIZE + c === s),
    );
    room.starts[mark] = start;
    room.starts[mark === "X" ? "O" : "X"] = STARTS.find((s) => s !== start);
  }
  for (const [r, c] of result.cells) room.board[r * SIZE + c] = mark;
  room.used[mark].push(data.pieceId);
  return result.cells.map(([r, c]) => r * SIZE + c);
}
function findMove(room, mark, pieceId) {
  const candidates = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (
        room.board[r * SIZE + c] ||
        neighbor(room.board, r, c, mark, ADJACENT)
      )
        continue;
      if (
        !room.used[mark].length
          ? (room.starts[mark] == null ? STARTS : [room.starts[mark]]).includes(
              r * SIZE + c,
            )
          : neighbor(room.board, r, c, mark, DIAGONAL)
      )
        candidates.push([r, c]);
    }
  for (const p of PIECES) {
    if ((pieceId && p.id !== pieceId) || room.used[mark].includes(p.id))
      continue;
    for (const form of ORIENTATIONS.get(p.id)) {
      const seen = new Set();
      for (const [r, c] of candidates)
        for (const [dr, dc] of form.cells) {
          const row = r - dr,
            col = c - dc,
            key = row * SIZE + col;
          if (row < 0 || col < 0 || seen.has(key)) continue;
          seen.add(key);
          if (
            !errorForCells(
              room,
              mark,
              form.cells.map(([a, b]) => [a + row, b + col]),
            )
          )
            return {
              pieceId: p.id,
              row,
              col,
              rotation: form.rotation,
              flipped: form.flipped,
            };
        }
    }
  }
  return null;
}
function score(room, mark) {
  const remaining = PIECES.filter((p) => !room.used[mark].includes(p.id));
  return remaining.length
    ? -remaining.reduce((n, p) => n + p.cells.length, 0)
    : room.used[mark].at(-1) === "I1"
      ? 20
      : 15;
}
module.exports = {
  PIECES,
  ORIENTATIONS,
  transform,
  placement,
  place,
  findMove,
  score,
};
