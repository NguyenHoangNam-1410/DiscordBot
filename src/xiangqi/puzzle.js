const crypto = require("node:crypto");
const catalog = require("./catalog.json");
const engine = require("./engine");
const MAX_MATE = catalog.maxMate;
let validated;
async function loadCatalog() {
  await engine.initialize();
  if (!validated) validated = catalog.puzzles.map(engine.validatePuzzle);
  return validated;
}
async function loadPuzzle({
  seen = () => false,
  randomInt = crypto.randomInt,
} = {}) {
  const all = await loadCatalog();
  if (!all.length) throw new Error("XIANGQI_NO_PUZZLES");
  const fresh = all.filter((puzzle) => !seen(puzzle.id));
  const pool = fresh.length ? fresh : all;
  const levels = [...new Set(pool.map((puzzle) => puzzle.mate))].sort(
    (a, b) => a - b,
  );
  const mate = levels[randomInt(levels.length)];
  const choices = pool.filter((puzzle) => puzzle.mate === mate);
  return choices[randomInt(choices.length)];
}
module.exports = { MAX_MATE, loadCatalog, loadPuzzle };
