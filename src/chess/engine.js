const { Chess } = require("chess.js");

const MAX_MATE = 5;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const uci = (move) => `${move.from}${move.to}${move.promotion || ""}`;

function playUci(board, text) {
  if (!UCI.test(text)) throw new Error("INVALID_UCI");
  return board.move({
    from: text.slice(0, 2),
    to: text.slice(2, 4),
    ...(text[4] ? { promotion: text[4] } : {}),
  });
}

function playInput(board, token) {
  if (UCI.test(token)) return playUci(board, token);
  // Match legal SAN moves explicitly: an ambiguous SAN must never select a piece.
  const san = token.replace(/0/g, "O");
  const withoutCheck = (value) => value.replace(/[+#]$/, "");
  const matches = board
    .moves({ verbose: true })
    .filter((move) =>
      /[+#]$/.test(san) ? move.san === san : withoutCheck(move.san) === san,
    );
  if (matches.length !== 1) throw new Error("INVALID_SAN");
  return playUci(board, uci(matches[0]));
}

function answerTokens(text) {
  if (typeof text !== "string" || text.length > 200) return null;
  const cleaned = text
    .trim()
    .replace(/^`{1,3}|`{1,3}$/g, "")
    .replace(/\b\d+\.(?:\.\.)?\s*/g, "")
    .trim();
  const tokens = cleaned.split(/[\s,;]+/).filter(Boolean);
  if (
    !tokens.length ||
    tokens.length > MAX_MATE ||
    tokens.some(
      (token) =>
        !UCI.test(token) &&
        !/^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[O0]-[O0](?:-[O0])?[+#]?)$/.test(
          token,
        ),
    )
  )
    return null;
  return tokens;
}

function validatePuzzle(puzzle, expectedMate = null) {
  const board = new Chess(puzzle.fen);
  const line = puzzle.solution;
  if (
    !Array.isArray(line) ||
    line.length < 1 ||
    line.length > MAX_MATE * 2 - 1 ||
    line.length % 2 !== 1
  )
    throw new Error("INVALID_PUZZLE_LINE");
  const mate = (line.length + 1) / 2;
  if (expectedMate !== null && mate !== expectedMate)
    throw new Error("WRONG_MATE_LENGTH");
  if (board.isGameOver()) throw new Error("INVALID_PUZZLE_POSITION");
  for (const move of line) playUci(board, move);
  if (!board.isCheckmate()) throw new Error("PUZZLE_NOT_MATE");
  return { ...puzzle, mate, side: new Chess(puzzle.fen).turn() };
}

function checkAnswer(puzzle, text) {
  const tokens = answerTokens(text);
  if (!tokens || tokens.length !== puzzle.mate) return null;
  const board = new Chess(puzzle.fen);
  const line = [];
  try {
    for (let index = 0; index < tokens.length; index++) {
      const move = playInput(board, tokens[index]);
      const normalized = uci(move);
      // A mate-in-one position may have multiple correct mating moves.
      const alternateMate = index === tokens.length - 1 && board.isCheckmate();
      if (normalized !== puzzle.solution[index * 2] && !alternateMate)
        return null;
      line.push(normalized);
      if (index < tokens.length - 1) {
        const reply = puzzle.solution[index * 2 + 1];
        playUci(board, reply);
        line.push(reply);
      }
    }
    return board.isCheckmate()
      ? { line, playerMoves: line.filter((_, index) => index % 2 === 0) }
      : null;
  } catch {
    return null;
  }
}

module.exports = {
  MAX_MATE,
  uci,
  playUci,
  playInput,
  answerTokens,
  validatePuzzle,
  checkAnswer,
};
