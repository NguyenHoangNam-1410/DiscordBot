const fs = require("node:fs");
const MAX_MATE = 5;
const ICCS = /^[a-i][0-9][a-i][0-9]$/;
let fish, ready;

function initialize() {
  if (!ready)
    ready = (async () => {
      // The package is published as ES module source without type:module. Loading
      // the trusted installed module explicitly also works on Node 18/20. Supply
      // wasm bytes locally: older Emscripten otherwise tries fetch(file://...).
      const entry = require.resolve("ffish-es6");
      const source = fs.readFileSync(entry, "utf8");
      const { default: factory } = await import(
        `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
      );
      fish = await factory({
        wasmBinary: fs.readFileSync(entry.replace(/ffish\.js$/, "ffish.wasm")),
        print: () => {},
        printErr: () => {},
      });
      const warmup = new fish.Board("xiangqi");
      warmup.delete();
      return fish;
    })().catch(() => {
      ready = null;
      throw new Error("XIANGQI_ENGINE_UNAVAILABLE");
    });
  return ready;
}
function toEngine(move) {
  if (!ICCS.test(move)) throw new Error("INVALID_ICCS");
  return `${move[0]}${Number(move[1]) + 1}${move[2]}${Number(move[3]) + 1}`;
}
function fromEngine(move) {
  const match = move.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/);
  if (!match) throw new Error("INVALID_ENGINE_MOVE");
  return `${match[1]}${Number(match[2]) - 1}${match[3]}${Number(match[4]) - 1}`;
}
function positionKey(fen) {
  return fen.split(" ").slice(0, 2).join(" ");
}
function boardFor(fen) {
  if (!fish) throw new Error("XIANGQI_ENGINE_UNAVAILABLE");
  if (fish.validateFen(fen, "xiangqi") !== 1)
    throw new Error("INVALID_XIANGQI_FEN");
  const opposite = fen.split(" ");
  opposite[1] = opposite[1] === "w" ? "b" : "w";
  const opponent = new fish.Board("xiangqi", opposite.join(" "));
  try {
    if (opponent.isCheck()) throw new Error("INVALID_XIANGQI_FEN");
  } finally {
    opponent.delete();
  }
  return new fish.Board("xiangqi", fen);
}
function legal(board) {
  return board.legalMoves().split(" ").filter(Boolean);
}
function mate(board) {
  return board.numberLegalMoves() === 0 && board.isCheck();
}

// Exhaustive bounded AND/OR search: every defending reply must still allow mate.
// No score or heuristic is used as proof. A budget exhaustion discards a position.
function prove(fen, maxMate = MAX_MATE, nodeLimit = 200_000) {
  const board = boardFor(fen),
    attacker = board.turn(),
    memo = new Map();
  let nodes = 0;
  function search(left) {
    if (++nodes > nodeLimit) throw new Error("XIANGQI_SEARCH_LIMIT");
    const key = `${positionKey(board.fen())}|${left}`;
    if (memo.has(key)) return memo.get(key);
    const moves = legal(board).sort();
    if (!moves.length)
      return board.turn() !== attacker && board.isCheck()
        ? { distance: 0 }
        : null;
    if (left <= 0) return null;
    const attack = board.turn() === attacker;
    let best = null;
    for (const move of moves) {
      board.push(move);
      let child;
      try {
        child = search(left - 1);
      } finally {
        board.pop();
      }
      if (!child) {
        if (!attack) {
          memo.set(key, null);
          return null;
        }
        continue;
      }
      const distance = child.distance + 1;
      if (
        !best ||
        (attack ? distance < best.distance : distance > best.distance)
      )
        best = { distance, move };
      if (attack && distance === 1) break;
    }
    memo.set(key, best);
    return best;
  }
  function tree(left) {
    const choices = {};
    for (const move of legal(board).sort()) {
      board.push(move);
      try {
        const child = search(left - 1);
        if (!child) continue;
        if (child.distance === 0) choices[fromEngine(move)] = true;
        else {
          board.push(child.move);
          try {
            choices[fromEngine(move)] = {
              reply: fromEngine(child.move),
              next: tree(left - 2),
            };
          } finally {
            board.pop();
          }
        }
      } finally {
        board.pop();
      }
    }
    return { choices };
  }
  try {
    if (board.isGameOver() || board.isCheck()) return null;
    let result;
    for (let n = 1; n <= maxMate; n++) {
      result = search(n * 2 - 1);
      if (result) break;
    }
    if (!result || result.distance % 2 !== 1) return null;
    const count = (result.distance + 1) / 2;
    return {
      fen: board.fen(),
      side: attacker ? "r" : "b",
      mate: count,
      tree: tree(count * 2 - 1),
      nodes,
    };
  } finally {
    board.delete();
  }
}

function mainLine(tree) {
  const line = [];
  let node = tree;
  for (let depth = 0; depth < MAX_MATE; depth++) {
    const move = Object.keys(node.choices || {}).sort()[0];
    if (!move) throw new Error("INVALID_XIANGQI_PROOF");
    line.push(move);
    const branch = node.choices[move];
    if (branch === true) return line;
    line.push(branch.reply);
    node = branch.next;
  }
  throw new Error("INVALID_XIANGQI_PROOF");
}
function validatePuzzle(puzzle) {
  if (
    !puzzle ||
    !Number.isInteger(puzzle.mate) ||
    puzzle.mate < 1 ||
    puzzle.mate > MAX_MATE
  )
    throw new Error("INVALID_XIANGQI_PUZZLE");
  const board = boardFor(puzzle.fen),
    attacker = board.turn();
  let nodes = 0,
    longest = 0;
  function walk(node, depth) {
    if (++nodes > 10_000 || !node?.choices || depth >= puzzle.mate)
      throw new Error("INVALID_XIANGQI_PROOF");
    const choices = Object.entries(node.choices);
    if (!choices.length) throw new Error("INVALID_XIANGQI_PROOF");
    for (const [move, branch] of choices) {
      if (!board.push(toEngine(move))) throw new Error("INVALID_XIANGQI_PROOF");
      try {
        if (branch === true) {
          if (!mate(board) || board.turn() === attacker)
            throw new Error("INVALID_XIANGQI_PROOF");
          longest = Math.max(longest, depth + 1);
        } else {
          if (!branch || !board.push(toEngine(branch.reply)))
            throw new Error("INVALID_XIANGQI_PROOF");
          try {
            walk(branch.next, depth + 1);
          } finally {
            board.pop();
          }
        }
      } finally {
        board.pop();
      }
    }
  }
  try {
    if (board.isGameOver()) throw new Error("INVALID_XIANGQI_PUZZLE");
    walk(puzzle.tree, 0);
    if (longest !== puzzle.mate) throw new Error("INVALID_XIANGQI_PROOF");
    return {
      ...puzzle,
      side: attacker ? "r" : "b",
      solution: mainLine(puzzle.tree),
    };
  } finally {
    board.delete();
  }
}

const PIECES = { X: "R", M: "H", T: "E", S: "A", P: "C", B: "P", K: "K" };
function normalizeInput(token) {
  const plain = token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim();
  if (ICCS.test(plain.toLowerCase())) return plain.toLowerCase();
  const compact = plain
    .replace(/\s+/g, "")
    .match(/^([XMTSPBK])([1-9+-])([+.-])([1-9])$/i);
  if (compact)
    return `${PIECES[compact[1].toUpperCase()]}${compact[2]}${compact[3] === "." ? "=" : compact[3]}${compact[4]}`;
  const words = plain.match(
    /^(xe|ma|tuong|si|phao|binh|tot|vua)\s*([1-9]|truoc|sau)\s*(tien|thoai|lui|binh|ngang)\s*([1-9])$/i,
  );
  if (!words) return plain.toUpperCase();
  const map = {
    xe: "R",
    ma: "H",
    tuong: "E",
    si: "A",
    phao: "C",
    binh: "P",
    tot: "P",
    vua: "K",
  };
  const action = /tien/i.test(words[3])
    ? "+"
    : /thoai|lui/i.test(words[3])
      ? "-"
      : "=";
  let piece = map[words[1].toLowerCase()];
  if (words[1].toLowerCase() === "tuong") {
    if (/^tướng/iu.test(token.normalize("NFC"))) piece = "K";
    else if (!/^tượng/iu.test(token.normalize("NFC"))) return "AMBIGUOUS_PIECE";
  }
  const file =
    words[2].toLowerCase() === "truoc"
      ? "+"
      : words[2].toLowerCase() === "sau"
        ? "-"
        : words[2];
  return `${piece}${file}${action}${words[4]}`;
}
function answerTokens(text) {
  if (typeof text !== "string" || text.length > 400) return null;
  const cleaned = text
    .trim()
    .replace(/^(?:<@!?\d{17,20}>\s*)+/, "")
    .replace(/^`{1,3}|`{1,3}$/g, "")
    .trim();
  // Vietnamese words use semicolons/newlines between moves; compact/ICCS use spaces.
  const wordNotation =
    /(?:tiến|tien|thoái|thoai|lùi|lui|bình|binh|ngang)\s+[1-9]/iu.test(cleaned);
  const chunks = /[;\n]/.test(cleaned)
    ? cleaned.split(/[;\n]+/)
    : wordNotation
      ? [cleaned]
      : cleaned.split(/[\s,]+/);
  const tokens = chunks.map((item) => item.trim()).filter(Boolean);
  return tokens.length > 0 && tokens.length <= MAX_MATE ? tokens : null;
}
function matchMove(board, input) {
  const normalized = normalizeInput(input),
    moves = legal(board);
  if (ICCS.test(normalized))
    return moves.includes(toEngine(normalized)) ? toEngine(normalized) : null;
  const candidates = new Set([normalized]);
  if (/^[RHEAKCP][1-9+-][+=-][1-9]$/i.test(input.trim()))
    candidates.add(input.trim().toUpperCase());
  const found = moves.filter((move) =>
    candidates.has(
      board.sanMove(move, fish.Notation.XIANGQI_WXF).toUpperCase(),
    ),
  );
  return found.length === 1 ? found[0] : null;
}
function checkAnswer(puzzle, text) {
  const tokens = answerTokens(text);
  if (!tokens || tokens.length > puzzle.mate) return null;
  const board = boardFor(puzzle.fen),
    line = [],
    playerMoves = [];
  let node = puzzle.tree;
  try {
    for (let i = 0; i < tokens.length; i++) {
      const move = matchMove(board, tokens[i]);
      if (!move) return null;
      const iccs = fromEngine(move),
        branch = node?.choices?.[iccs];
      if (!branch) return null;
      board.push(move);
      line.push(iccs);
      playerMoves.push(iccs);
      if (branch === true)
        return i === tokens.length - 1 && mate(board)
          ? { line, playerMoves }
          : null;
      if (!board.push(toEngine(branch.reply))) return null;
      line.push(branch.reply);
      node = branch.next;
    }
    return null;
  } finally {
    board.delete();
  }
}

module.exports = {
  MAX_MATE,
  initialize,
  toEngine,
  fromEngine,
  positionKey,
  boardFor,
  legal,
  mate,
  prove,
  mainLine,
  validatePuzzle,
  normalizeInput,
  answerTokens,
  matchMove,
  checkAnswer,
};
