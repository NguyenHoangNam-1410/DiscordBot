"use strict";

const SIZE = 15;
const { normalizeRules } = require("./rules");

function winningLine(board, cell, mark, input) {
  const { size, winLength, exactLength, blockBothEnds, edgeBlocks } =
    normalizeRules(input);
  const row = Math.floor(cell / size),
    col = cell % size;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = [cell];
    let blocked = 0;
    for (const direction of [-1, 1]) {
      for (let step = 1; step <= size; step++) {
        const r = row + dr * step * direction;
        const c = col + dc * step * direction;
        const outside = r < 0 || c < 0 || r >= size || c >= size;
        if (outside || board[r * size + c] !== mark) {
          if (
            outside
              ? edgeBlocks
              : board[r * size + c] === (mark === "X" ? "O" : "X")
          )
            blocked++;
          break;
        }
        line.push(r * size + c);
      }
    }
    if (
      (exactLength ? line.length === winLength : line.length >= winLength) &&
      !(blockBothEnds && blocked === 2)
    )
      return line;
  }
  return [];
}

module.exports = { SIZE, winningLine };
