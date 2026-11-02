"use strict";

const { SIZE } = require("./rules");
const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const inside = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function blockedEdges(walls, length) {
  const blocked = new Set();
  for (const wall of walls)
    for (let i = 0; i < length; i++) {
      const a =
        wall.orientation === "h"
          ? wall.row * SIZE + wall.col + i
          : (wall.row + i) * SIZE + wall.col;
      blocked.add(edgeKey(a, a + (wall.orientation === "h" ? SIZE : 1)));
    }
  return blocked;
}

function legalMoves(positions, mark, walls, length) {
  const start = positions[mark],
    opponent = positions[mark === "X" ? "O" : "X"];
  const r = Math.floor(start / SIZE),
    c = start % SIZE;
  const blocked = blockedEdges(walls, length),
    moves = new Set();
  const canStep = (a, row, col) =>
    inside(row, col) && !blocked.has(edgeKey(a, row * SIZE + col));
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr,
      nc = c + dc,
      neighbor = nr * SIZE + nc;
    if (!canStep(start, nr, nc)) continue;
    if (neighbor !== opponent) {
      moves.add(neighbor);
      continue;
    }
    // A straight jump takes priority. Side jumps are allowed only behind a blocked pawn.
    const jr = nr + dr,
      jc = nc + dc;
    if (canStep(neighbor, jr, jc)) moves.add(jr * SIZE + jc);
    else
      for (const [sr, sc] of dr
        ? [
            [0, -1],
            [0, 1],
          ]
        : [
            [-1, 0],
            [1, 0],
          ]) {
        const row = nr + sr,
          col = nc + sc;
        if (canStep(neighbor, row, col)) moves.add(row * SIZE + col);
      }
  }
  return [...moves].sort((a, b) => a - b);
}

function hasPath(start, goalRow, walls, length) {
  // Pawns are deliberately ignored: path legality is determined by fences, not temporary occupancy.
  const blocked = blockedEdges(walls, length),
    queue = [start],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i],
      row = Math.floor(cell / SIZE),
      col = cell % SIZE;
    if (row === goalRow) return true;
    for (const [dr, dc] of DIRECTIONS) {
      const r = row + dr,
        c = col + dc,
        next = r * SIZE + c;
      if (!inside(r, c) || seen.has(next) || blocked.has(edgeKey(cell, next)))
        continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function wallError(walls, candidate, length, positions) {
  const { row, col, orientation } = candidate;
  if (
    !["h", "v"].includes(orientation) ||
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    col < 0 ||
    (orientation === "h"
      ? row >= SIZE - 1 || col + length > SIZE
      : col >= SIZE - 1 || row + length > SIZE)
  )
    return "INVALID_WALL";
  for (const placed of walls) {
    if (placed.orientation === orientation) {
      const sameLine =
        orientation === "h" ? placed.row === row : placed.col === col;
      const a = orientation === "h" ? placed.col : placed.row;
      const b = orientation === "h" ? col : row;
      if (sameLine && Math.max(a, b) < Math.min(a + length, b + length))
        return "WALL_OVERLAP";
    } else {
      const h = orientation === "h" ? candidate : placed,
        v = orientation === "v" ? candidate : placed;
      if (
        v.col + 1 > h.col &&
        v.col + 1 < h.col + length &&
        h.row + 1 > v.row &&
        h.row + 1 < v.row + length
      )
        return "WALL_CROSSING";
    }
  }
  const next = [...walls, candidate];
  if (
    !hasPath(positions.X, 0, next, length) ||
    !hasPath(positions.O, SIZE - 1, next, length)
  )
    return "NO_PATH";
  return null;
}

module.exports = { legalMoves, hasPath, wallError, blockedEdges };
