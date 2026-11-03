"use strict";
const { randomInt } = require("node:crypto");
const DIRECTIONS = Object.freeze({
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
});
const validCell = (size, cell) =>
  Number.isInteger(cell) && cell >= 0 && cell < size * size;
const wallCount = (size) => 2 * size * (size - 1);
function describeWall(size, id) {
  if (!Number.isInteger(id) || id < 0 || id >= wallCount(size)) return null;
  const split = size * (size - 1);
  if (id < split) {
    const row = Math.floor(id / size),
      col = id % size;
    return {
      id,
      orientation: "h",
      row,
      col,
      a: row * size + col,
      b: (row + 1) * size + col,
    };
  }
  const offset = id - split,
    row = Math.floor(offset / (size - 1)),
    col = offset % (size - 1);
  return {
    id,
    orientation: "v",
    row,
    col,
    a: row * size + col,
    b: row * size + col + 1,
  };
}
function wallBetween(size, a, b) {
  if (!validCell(size, a) || !validCell(size, b)) return null;
  const r = Math.floor(a / size),
    c = a % size,
    rr = Math.floor(b / size),
    cc = b % size;
  if (Math.abs(r - rr) + Math.abs(c - cc) !== 1) return null;
  return r === rr
    ? size * (size - 1) + r * (size - 1) + Math.min(c, cc)
    : Math.min(r, rr) * size + c;
}
function destination(size, from, direction) {
  if (!validCell(size, from) || !Object.hasOwn(DIRECTIONS, direction))
    return null;
  const [dr, dc] = DIRECTIONS[direction],
    r = Math.floor(from / size) + dr,
    c = (from % size) + dc;
  return r < 0 || c < 0 || r >= size || c >= size ? null : r * size + c;
}
function hasPath(size, start, goal, walls) {
  if (!validCell(size, start) || !validCell(size, goal)) return false;
  const blocked = new Set(walls),
    seen = new Set([start]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    if (from === goal) return true;
    for (const direction of Object.keys(DIRECTIONS)) {
      const to = destination(size, from, direction);
      if (
        to === null ||
        seen.has(to) ||
        blocked.has(wallBetween(size, from, to))
      )
        continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return false;
}
function designError(size, design, limit) {
  if (
    !design ||
    typeof design !== "object" ||
    !validCell(size, design.start) ||
    !validCell(size, design.goal) ||
    design.start === design.goal
  )
    return "INVALID_POINTS";
  if (
    !Array.isArray(design.walls) ||
    design.walls.length > limit ||
    design.walls.some((id) => !describeWall(size, id)) ||
    new Set(design.walls).size !== design.walls.length
  )
    return "INVALID_WALLS";
  return hasPath(size, design.start, design.goal, design.walls)
    ? null
    : "NO_PATH";
}
function randomDesign(size, start, goal, limit) {
  const ids = Array.from({ length: wallCount(size) }, (_, i) => i),
    walls = [];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  for (const id of ids) {
    if (walls.length >= limit) break;
    if (hasPath(size, start, goal, [...walls, id])) walls.push(id);
  }
  return { start, goal, walls: walls.sort((a, b) => a - b) };
}
module.exports = {
  DIRECTIONS,
  validCell,
  wallCount,
  describeWall,
  wallBetween,
  destination,
  hasPath,
  designError,
  randomDesign,
};
