"use strict";
const rulesEngine = require("../xiangqi/engine");
const { pieces: readPieces } = require("../xiangqi/view");
const { coord, index, validCell } = require("./rules");
const INITIAL_FEN =
  "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
async function initialize() {
  try {
    return await rulesEngine.initialize();
  } catch {
    throw Object.assign(
      new Error(
        "Chưa nạp được bộ luật Cờ tướng. Hãy thử lại; bàn cũ vẫn được giữ.",
      ),
      { code: "XIANGQI_ENGINE_UNAVAILABLE" },
    );
  }
}
function inspect(board) {
  const legal = rulesEngine
    .legal(board)
    .map(rulesEngine.fromEngine)
    .map((m) => ({
      from: index(m.slice(0, 2)),
      to: index(m.slice(2)),
      iccs: m,
    }));
  const over = board.isGameOver(true),
    result = over ? board.result(true) : "*";
  let reason = null;
  if (over)
    reason = !legal.length
      ? board.isCheck()
        ? "checkmate"
        : "stalemate"
      : result === "1/2-1/2"
        ? board.isInsufficientMaterial()
          ? "insufficient_material"
          : board.halfmoveClock() >= 120
            ? "no_capture_limit"
            : "repetition"
        : "perpetual";
  return {
    fen: board.fen(),
    legal,
    check: board.isCheck(),
    sideToMove: board.turn() ? "red" : "black",
    halfmoveClock: board.halfmoveClock(),
    reason,
    winner:
      over && result !== "1/2-1/2"
        ? result === "1-0"
          ? "red"
          : "black"
        : null,
  };
}
function createState(initialFen = INITIAL_FEN) {
  const b = rulesEngine.boardFor(initialFen);
  try {
    return {
      initialFen,
      engineLine: [],
      pieces: readPieces(initialFen).map((p, i) => ({
        id: "piece-" + i,
        type: p.piece.toUpperCase(),
        side: p.piece === p.piece.toUpperCase() ? "red" : "black",
        cell: (9 - p.y) * 9 + p.x,
      })),
      ply: 0,
      ...inspect(b),
    };
  } finally {
    b.delete();
  }
}
function legalMoves(s) {
  return s.legal.map((m) => ({ ...m }));
}
function moveError(s, side, from, to) {
  if (!validCell(from) || !validCell(to)) return "INVALID_COORDINATE";
  const p = s.pieces.find((p) => p.cell === from);
  if (!p || p.side !== side) return "NOT_OWN_PIECE";
  if (s.sideToMove !== side) return "NOT_TURN";
  if (!s.legal.some((m) => m.from === from && m.to === to))
    return "INVALID_MOVE";
  return null;
}
function applyMove(s, { from, to }) {
  const error = moveError(s, s.sideToMove, from, to);
  if (error) throw Object.assign(new Error(error), { code: error });
  const b = rulesEngine.boardFor(s.initialFen);
  try {
    for (const m of s.engineLine)
      if (!b.push(rulesEngine.toEngine(m)))
        throw Error("INVALID_SAVED_XIANGQI_LINE");
    if (b.fen() !== s.fen) throw Error("INVALID_SAVED_XIANGQI_POSITION");
    const piece = s.pieces.find((p) => p.cell === from),
      captured = s.pieces.find((p) => p.cell === to),
      iccs = coord(from) + coord(to),
      notation = b.sanMove(rulesEngine.toEngine(iccs));
    if (!b.push(rulesEngine.toEngine(iccs)))
      throw Object.assign(new Error("Nước đi không hợp lệ."), {
        code: "INVALID_MOVE",
      });
    const next = {
      ...structuredClone(s),
      ...inspect(b),
      ply: s.ply + 1,
      engineLine: [...s.engineLine, iccs],
    };
    next.pieces.find((p) => p.id === piece.id).cell = to;
    if (captured) next.pieces.find((p) => p.id === captured.id).cell = null;
    return {
      state: next,
      reason: next.reason,
      winner: next.winner,
      move: {
        side: piece.side,
        pieceId: piece.id,
        type: piece.type,
        from,
        to,
        iccs,
        notation,
        capturedPieceId: captured?.id || null,
        check: next.check,
      },
    };
  } finally {
    b.delete();
  }
}
module.exports = {
  initialize,
  INITIAL_FEN,
  createState,
  legalMoves,
  moveError,
  applyMove,
};
