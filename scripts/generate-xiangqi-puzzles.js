// Original small-piece positions. Each puzzle is exhaustively proved against
// every defending move, rather than inferred from an engine evaluation score.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const engine = require("../src/xiangqi/engine");
function position(pieces, side = "w") {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const [piece, x, y] of pieces) {
    if (board[9 - y][x]) return null;
    board[9 - y][x] = piece;
  }
  return (
    board
      .map((rank) => {
        let row = "",
          empty = 0;
        for (const piece of rank) {
          if (!piece) empty++;
          else {
            if (empty) row += empty;
            empty = 0;
            row += piece;
          }
        }
        return row + (empty || "");
      })
      .join("/") + ` ${side} - - 0 1`
  );
}
function transform(fen, mirror, rotate) {
  const [placement, side] = fen.split(" ");
  const rows = placement
    .split("/")
    .map((row) =>
      [...row].flatMap((char) =>
        /[1-9]/.test(char) ? Array(Number(char)).fill(null) : [char],
      ),
    );
  const pieces = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++)
      if (rows[r][c]) {
        let p = rows[r][c],
          x = mirror ? 8 - c : c,
          y = 9 - r;
        if (rotate) {
          x = 8 - x;
          y = 9 - y;
          p = p === p.toUpperCase() ? p.toLowerCase() : p.toUpperCase();
        }
        pieces.push([p, x, y]);
      }
  return position(pieces, rotate ? (side === "w" ? "b" : "w") : side);
}
async function generate({ maxMate = 3, count = 6, attempts = 250 } = {}) {
  await engine.initialize();
  let seed = 0x58104319;
  const rand = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const base = [],
    levels = Array(maxMate + 1).fill(0),
    seen = new Set();
  for (
    let attempt = 0;
    attempt < attempts && levels.slice(1).some((n) => n < count);
    attempt++
  ) {
    const kind = attempt % 3 === 0 ? "R" : attempt % 3 === 1 ? "C" : "N";
    const pieces = [
      ["K", 4, 0],
      ["k", 3 + rand(3), 7 + rand(3)],
      ["p", 4, 5],
      ["R", rand(9), 1 + rand(7)],
      [kind, rand(9), 1 + rand(7)],
    ];
    if (attempt % 4 === 0) pieces.push(["a", 3 + 2 * rand(2), 9]);
    const fen = position(pieces);
    if (!fen || seen.has(fen)) continue;
    seen.add(fen);
    try {
      const proof = engine.prove(fen, maxMate, 150_000);
      if (!proof || levels[proof.mate] >= count) continue;
      levels[proof.mate]++;
      base.push(proof);
      console.log(
        JSON.stringify({
          found: proof.mate,
          levels: levels.slice(1),
          attempt,
          nodes: proof.nodes,
        }),
      );
    } catch (error) {
      if (
        !["INVALID_XIANGQI_FEN", "XIANGQI_SEARCH_LIMIT"].includes(error.message)
      )
        throw error;
    }
  }
  if (levels.slice(1).some((n) => n < count))
    throw new Error(`INCOMPLETE_CATALOG:${levels.slice(1).join(",")}`);
  const puzzles = [],
    unique = new Set();
  for (const original of base)
    for (const mirror of [false, true])
      for (const rotate of [false, true]) {
        const fen = transform(original.fen, mirror, rotate);
        if (unique.has(engine.positionKey(fen))) continue;
        const proof = engine.prove(fen, original.mate, 300_000);
        if (!proof || proof.mate !== original.mate)
          throw new Error("TRANSFORM_PROOF_FAILED");
        unique.add(engine.positionKey(fen));
        const id = `xq${crypto.createHash("sha256").update(engine.positionKey(fen)).digest("hex").slice(0, 12)}`;
        puzzles.push(engine.validatePuzzle({ id, ...proof }));
      }
  return {
    version: 1,
    source:
      "Original generated positions, exhaustively verified with Fairy-Stockfish/ffish-es6 0.7.10",
    maxMate,
    puzzles,
  };
}
if (require.main === module) {
  const maxMate = Number(process.argv[2] || 3),
    count = Number(process.argv[3] || 6);
  if (
    !Number.isInteger(maxMate) ||
    maxMate < 1 ||
    maxMate > 5 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 30
  )
    throw new Error("INVALID_GENERATION_OPTIONS");
  generate({ maxMate, count })
    .then((catalog) => {
      fs.writeFileSync(
        path.join(__dirname, "../src/xiangqi/catalog.json"),
        JSON.stringify(catalog, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          ok: true,
          puzzles: catalog.puzzles.length,
          bytes: JSON.stringify(catalog).length,
        }),
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { position, transform, generate };
