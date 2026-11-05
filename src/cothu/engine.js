"use strict";
const {
  RULES_ID,
  WIDTH,
  HEIGHT,
  ANIMALS,
  TERRAIN,
  validCell,
  index,
} = require("./rules");
const other = (side) => (side === "red" ? "blue" : "red");
const occupant = (state, cell) =>
  state.pieces.find((p) => p.cell === cell) || null;
function effectiveRank(piece) {
  if (!piece || !validCell(piece.cell)) return 0;
  const t = TERRAIN[piece.cell];
  return t.kind === "trap" && t.owner !== piece.side
    ? 0
    : ANIMALS[piece.type].rank;
}
function positionKey(state) {
  return [
    state.rulesId,
    state.turn,
    ...state.pieces
      .filter((p) => p.cell !== null)
      .map((p) => `${p.side}:${p.type}:${p.cell}`)
      .sort(),
  ].join("|");
}
function createState() {
  const positions = {
    elephant: "a3",
    lion: "g1",
    tiger: "a1",
    leopard: "e3",
    dog: "f2",
    wolf: "c3",
    cat: "b2",
    rat: "g3",
  };
  const pieces = [];
  for (const side of ["red", "blue"])
    for (const [type, at] of Object.entries(positions)) {
      const cell = index(at);
      pieces.push({
        id: `${side}-${type}`,
        type,
        side,
        cell: side === "red" ? cell : WIDTH * HEIGHT - 1 - cell,
      });
    }
  const state = {
    rulesId: RULES_ID,
    pieces,
    turn: "red",
    ply: 0,
    noCapturePly: 0,
    repetitions: {},
  };
  state.repetitions[positionKey(state)] = 1;
  return state;
}
function describeMove(state, side, from, to) {
  if (!validCell(from) || !validCell(to))
    return { error: "INVALID_COORDINATE" };
  const piece = occupant(state, from),
    target = occupant(state, to);
  if (!piece || piece.side !== side) return { error: "NOT_OWN_PIECE" };
  if (target?.side === side) return { error: "OWN_PIECE" };
  if (TERRAIN[to].kind === "den" && TERRAIN[to].owner === side)
    return { error: "OWN_DEN" };
  const row = Math.floor(from / WIDTH),
    col = from % WIDTH,
    tr = Math.floor(to / WIDTH),
    tc = to % WIDTH;
  const distance = Math.abs(row - tr) + Math.abs(col - tc),
    path = [];
  if (!distance || (row !== tr && col !== tc)) return { error: "INVALID_MOVE" };
  let jumped = false;
  if (distance !== 1) {
    if (
      !["lion", "tiger"].includes(piece.type) ||
      TERRAIN[from].kind === "water"
    )
      return { error: "INVALID_MOVE" };
    const dr = Math.sign(tr - row),
      dc = Math.sign(tc - col);
    let r = row + dr,
      c = col + dc;
    while (
      r >= 0 &&
      r < HEIGHT &&
      c >= 0 &&
      c < WIDTH &&
      TERRAIN[r * WIDTH + c].kind === "water"
    ) {
      const cell = r * WIDTH + c;
      path.push(cell);
      if (occupant(state, cell)) return { error: "JUMP_BLOCKED" };
      r += dr;
      c += dc;
    }
    if (!path.length || r !== tr || c !== tc) return { error: "INVALID_MOVE" };
    jumped = true;
  }
  const fromWater = TERRAIN[from].kind === "water",
    toWater = TERRAIN[to].kind === "water";
  if ((fromWater || toWater) && piece.type !== "rat")
    return { error: "WATER_FORBIDDEN" };
  if (target) {
    if (
      (fromWater || toWater) &&
      !(fromWater && toWater && target.type === "rat")
    )
      return { error: "WATER_CAPTURE_FORBIDDEN" };
    const attack = effectiveRank(piece),
      defense = effectiveRank(target);
    if (!attack) return { error: "TRAPPED_ATTACKER" };
    if (defense) {
      const ratElephant = piece.type === "rat" && target.type === "elephant";
      if (
        (piece.type === "elephant" && target.type === "rat") ||
        (!ratElephant && attack < defense)
      )
        return { error: "INSUFFICIENT_RANK" };
    }
  }
  return {
    from,
    to,
    side,
    pieceId: piece.id,
    capturedPieceId: target?.id || null,
    jumped,
    path,
  };
}
const moveError = (state, side, from, to) =>
  describeMove(state, side, from, to).error || null;
function legalMoves(state, side = state.turn) {
  const result = [];
  for (const p of state.pieces) {
    if (p.side !== side || p.cell === null) continue;
    const row = Math.floor(p.cell / WIDTH),
      col = p.cell % WIDTH;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      let r = row + dr,
        c = col + dc;
      if (["lion", "tiger"].includes(p.type))
        while (
          r >= 0 &&
          r < HEIGHT &&
          c >= 0 &&
          c < WIDTH &&
          TERRAIN[r * WIDTH + c].kind === "water"
        ) {
          r += dr;
          c += dc;
        }
      if (r < 0 || r >= HEIGHT || c < 0 || c >= WIDTH) continue;
      const m = describeMove(state, side, p.cell, r * WIDTH + c);
      if (!m.error) result.push(m);
    }
  }
  return result;
}
function applyMove(state, move) {
  const detail = describeMove(state, state.turn, move.from, move.to);
  if (detail.error)
    throw Object.assign(new Error(detail.error), { code: detail.error });
  const next = {
    rulesId: state.rulesId,
    pieces: state.pieces.map((p) => ({
      ...p,
      cell:
        p.id === detail.pieceId
          ? move.to
          : p.id === detail.capturedPieceId
            ? null
            : p.cell,
    })),
    turn: other(state.turn),
    ply: state.ply + 1,
    noCapturePly: detail.capturedPieceId ? 0 : state.noCapturePly + 1,
    repetitions: { ...state.repetitions },
  };
  const key = positionKey(next);
  next.repetitions[key] = (next.repetitions[key] || 0) + 1;
  let reason = null,
    winner = null;
  if (TERRAIN[move.to].kind === "den") reason = "den";
  else if (!next.pieces.some((p) => p.side === next.turn && p.cell !== null))
    reason = "elimination";
  else if (!legalMoves(next, next.turn).length) reason = "no_legal_moves";
  if (reason) winner = state.turn;
  else if (next.repetitions[key] >= 3) reason = "threefold";
  else if (next.noCapturePly >= 100) reason = "no_capture_limit";
  return { state: next, move: detail, winner, reason };
}
module.exports = {
  other,
  occupant,
  effectiveRank,
  positionKey,
  createState,
  describeMove,
  moveError,
  legalMoves,
  applyMove,
};
