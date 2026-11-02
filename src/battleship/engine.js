"use strict";
const { randomInt } = require("node:crypto");
const { PRESETS } = require("./rules");
function shuffle(list, random = randomInt) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function generateFleet(mode, random = randomInt) {
  const { count, maxLength } = PRESETS[mode];
  const fleet = Array.from({ length: maxLength - 1 }, (_, i) => i + 2);
  while (fleet.length < count) fleet.push(2 + random(maxLength - 1));
  return shuffle(fleet, random);
}
function cellsOf(ship, length, size) {
  if (
    !ship ||
    !Number.isInteger(ship.cell) ||
    ship.cell < 0 ||
    ship.cell >= size * size ||
    !["h", "v", "right", "down"].includes(ship.orientation)
  )
    return null;
  const row = Math.floor(ship.cell / size),
    col = ship.cell % size;
  const horizontal = ["h", "right"].includes(ship.orientation);
  const reverse = ["right", "down"].includes(ship.orientation);
  const start = horizontal ? col : row;
  if (reverse ? start - length + 1 < 0 : start + length > size) return null;
  const step = (horizontal ? 1 : size) * (reverse ? -1 : 1);
  return Array.from({ length }, (_, i) => ship.cell + i * step);
}
function placementError(placements, fleet, size, complete = false) {
  if (!Array.isArray(placements) || placements.length > fleet.length)
    return "INVALID_FLEET";
  if (complete && placements.length !== fleet.length) return "INCOMPLETE_FLEET";
  const ids = new Set(),
    occupied = new Map();
  for (const ship of placements) {
    if (
      !ship ||
      !Number.isInteger(ship.id) ||
      ship.id < 0 ||
      ship.id >= fleet.length ||
      ids.has(ship.id)
    )
      return "INVALID_FLEET";
    ids.add(ship.id);
    const cells = cellsOf(ship, fleet[ship.id], size);
    if (!cells) return "SHIP_OUTSIDE";
    for (const cell of cells) {
      if (occupied.has(cell)) return "SHIP_OVERLAP";
      occupied.set(cell, ship.id);
    }
  }
  for (const [cell, id] of occupied) {
    const row = Math.floor(cell / size),
      col = cell % size;
    const neighbors = [
      row > 0 ? cell - size : -1,
      row + 1 < size ? cell + size : -1,
      col > 0 ? cell - 1 : -1,
      col + 1 < size ? cell + 1 : -1,
    ];
    if (
      neighbors.some((next) => occupied.has(next) && occupied.get(next) !== id)
    )
      return "SHIP_ADJACENT";
  }
  return null;
}
function randomPlacement(fleet, size, random = randomInt) {
  const order = fleet
    .map((length, id) => ({ length, id }))
    .sort((a, b) => b.length - a.length);
  const candidates = new Map();
  for (const { id, length } of order) {
    const list = [];
    for (let cell = 0; cell < size * size; cell++)
      for (const orientation of ["h", "v", "right", "down"]) {
        const ship = { id, cell, orientation };
        if (cellsOf(ship, length, size)) list.push(ship);
      }
    candidates.set(id, shuffle(list, random));
  }
  let budget = 100_000;
  function search(placed, index) {
    if (index === order.length) return placed;
    for (const ship of candidates.get(order[index].id)) {
      if (--budget < 0) return null;
      const next = [...placed, ship];
      if (!placementError(next, fleet, size)) {
        const solution = search(next, index + 1);
        if (solution) return solution;
      }
    }
    return null;
  }
  const result = search([], 0);
  if (!result)
    throw Object.assign(new Error("Chưa xếp được hạm đội. Hãy thử lại."), {
      code: "PLACEMENT_FAILED",
    });
  return result.sort((a, b) => a.id - b.id);
}
// A square body hit carries no ship ID, length, neighboring cells or orientation.
function shotView(cell, ships, fleet, size) {
  for (const ship of ships) {
    const cells = cellsOf(ship, fleet[ship.id], size);
    const index = cells.indexOf(cell);
    if (index >= 0)
      return index === 0
        ? { cell, hit: true, bow: ship.orientation }
        : { cell, hit: true };
  }
  return { cell, hit: false };
}
function sunkCount(ships, shots, fleet, size) {
  const hit = new Set(shots);
  return ships.filter((ship) =>
    cellsOf(ship, fleet[ship.id], size).every((cell) => hit.has(cell)),
  ).length;
}
function remainingFleet(ships, shots, fleet, size) {
  const counts = {};
  for (const length of fleet) counts[length] = (counts[length] || 0) + 1;
  const hit = new Set(shots);
  for (const ship of ships)
    if (cellsOf(ship, fleet[ship.id], size).every((cell) => hit.has(cell)))
      counts[fleet[ship.id]]--;
  // Only aggregate lengths are public; no hidden cells, IDs or directions.
  return counts;
}
module.exports = {
  generateFleet,
  cellsOf,
  placementError,
  randomPlacement,
  shotView,
  sunkCount,
  remainingFleet,
};
