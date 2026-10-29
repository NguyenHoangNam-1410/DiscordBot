const crypto = require("node:crypto");
const { Chess } = require("chess.js");
const { MAX_MATE, validatePuzzle } = require("./engine");

// Lichess asks clients to serialize requests and pause for at least a minute on 429.
let queue = Promise.resolve();
let nextRequestAt = 0;

function decodePuzzle(data, mate) {
  const puzzle = data?.puzzle;
  if (
    !puzzle ||
    !/^[a-zA-Z0-9]{3,12}$/.test(puzzle.id) ||
    !puzzle.themes?.includes(`mateIn${mate}`)
  )
    throw new Error("INVALID_PUZZLE");
  let fen = puzzle.fen;
  if (!fen) {
    if (
      typeof data.game?.pgn !== "string" ||
      data.game.pgn.length > 50_000 ||
      !Number.isSafeInteger(puzzle.initialPly) ||
      puzzle.initialPly < 0
    )
      throw new Error("INVALID_PUZZLE_POSITION");
    const game = new Chess();
    game.loadPgn(data.game.pgn);
    const moves = game.history({ verbose: true });
    // initialPly is zero-based: include the opponent's triggering move.
    const initial = moves[puzzle.initialPly];
    if (!initial) throw new Error("INVALID_PUZZLE_POSITION");
    fen = initial.after;
  }
  return validatePuzzle(
    {
      id: puzzle.id,
      fen,
      solution: puzzle.solution,
      rating: Number.isSafeInteger(puzzle.rating) ? puzzle.rating : null,
    },
    mate,
  );
}

function requestPuzzle(mate, fetcher = fetch) {
  const request = queue.then(async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 1_000) throw new Error("LICHESS_BUSY");
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nextRequestAt = Date.now() + 1_000;
    let response;
    try {
      response = await fetcher(
        `https://lichess.org/api/puzzle/next?angle=mateIn${mate}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "DiscordChessPuzzleBot/1.0",
          },
          signal: AbortSignal.timeout(12_000),
        },
      );
    } catch {
      throw new Error("LICHESS_UNAVAILABLE");
    }
    if (response.status === 429) {
      const retry = Number(response.headers?.get("retry-after"));
      nextRequestAt =
        Date.now() +
        Math.max(60_000, Number.isFinite(retry) ? retry * 1_000 : 0);
      throw new Error("LICHESS_BUSY");
    }
    if (!response.ok) throw new Error("LICHESS_UNAVAILABLE");
    try {
      return decodePuzzle(await response.json(), mate);
    } catch {
      throw new Error("LICHESS_INVALID_PUZZLE");
    }
  });
  queue = request.catch(() => {});
  return request;
}

async function loadPuzzle({
  seen = () => false,
  randomInt = crypto.randomInt,
  fetcher,
} = {}) {
  const mate = randomInt(1, MAX_MATE + 1);
  // A bounded retry covers repeats and the mateIn5 theme's occasional >5-move puzzles.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_050));
    try {
      const puzzle = await requestPuzzle(mate, fetcher);
      if (!seen(puzzle.id)) return puzzle;
    } catch (error) {
      if (error.message !== "LICHESS_INVALID_PUZZLE") throw error;
    }
  }
  throw new Error("LICHESS_NO_PUZZLE");
}

module.exports = { decodePuzzle, requestPuzzle, loadPuzzle };
