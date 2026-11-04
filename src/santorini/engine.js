"use strict";

const SIZE = 5;
const cell = (value) =>
  Number.isInteger(value) && value >= 0 && value < SIZE * SIZE;
const other = (side) => (side === "X" ? "O" : "X");
function neighbors(index) {
  if (!cell(index)) return [];
  const row = Math.floor(index / SIZE),
    col = index % SIZE,
    result = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (
        (dr || dc) &&
        row + dr >= 0 &&
        row + dr < SIZE &&
        col + dc >= 0 &&
        col + dc < SIZE
      )
        result.push((row + dr) * SIZE + col + dc);
  return result;
}
const occupant = (room, index) =>
  ["X", "O"].find((side) => room.workers[side].includes(index)) || null;
function placementError(room, side, cells) {
  if (room.workers[side].some(Number.isInteger)) return "ALREADY_PLACED";
  if (
    !Array.isArray(cells) ||
    cells.length !== 2 ||
    cells[0] === cells[1] ||
    cells.some((c) => !cell(c) || occupant(room, c) || room.board[c] !== 0)
  )
    return "INVALID_PLACEMENT";
  return null;
}
function destinations(room, side, worker) {
  const from = room.workers[side][worker];
  if (!cell(from)) return [];
  return neighbors(from).filter(
    (to) =>
      !occupant(room, to) &&
      room.board[to] < 4 &&
      room.board[to] <= room.board[from] + 1,
  );
}
function buildsAfter(room, side, worker, to) {
  const from = room.workers[side][worker];
  return neighbors(to).filter(
    (target) =>
      room.board[target] < 4 && (target === from || !occupant(room, target)),
  );
}
function legalTurns(room, side) {
  const result = [];
  for (let worker = 0; worker < 2; worker++)
    for (const to of destinations(room, side, worker)) {
      const from = room.workers[side][worker],
        win = room.board[from] === 2 && room.board[to] === 3;
      const builds = win ? [] : buildsAfter(room, side, worker, to);
      if (win || builds.length) result.push({ worker, to, builds, win });
    }
  return result;
}
function turnResult(room, side, data) {
  if (!Number.isInteger(data.worker) || data.worker < 0 || data.worker > 1)
    return { error: "INVALID_WORKER" };
  const from = room.workers[side][data.worker];
  if (
    !cell(data.to) ||
    !destinations(room, side, data.worker).includes(data.to)
  )
    return { error: "INVALID_MOVE" };
  const win = room.board[from] === 2 && room.board[data.to] === 3;
  // Winning on an upward move ends immediately; a supplied build is never applied.
  if (win) return { from, win: true };
  if (
    !cell(data.build) ||
    !buildsAfter(room, side, data.worker, data.to).includes(data.build)
  )
    return { error: "INVALID_BUILD" };
  return { from, win: false };
}
module.exports = {
  SIZE,
  cell,
  other,
  neighbors,
  occupant,
  placementError,
  destinations,
  buildsAfter,
  legalTurns,
  turnResult,
};
