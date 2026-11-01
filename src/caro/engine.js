"use strict";

const SIZE = 15;

function winningLine(board, cell, mark) {
  const row = Math.floor(cell / SIZE),
    col = cell % SIZE;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = [cell];
    for (const direction of [-1, 1]) {
      for (let step = 1; step < SIZE; step++) {
        const r = row + dr * step * direction;
        const c = col + dc * step * direction;
        if (
          r < 0 ||
          c < 0 ||
          r >= SIZE ||
          c >= SIZE ||
          board[r * SIZE + c] !== mark
        )
          break;
        line.push(r * SIZE + c);
      }
    }
    // Luật thử nghiệm: từ 5 quân liên tiếp thắng, kể cả bị chặn hai đầu.
    if (line.length >= 5) return line;
  }
  return [];
}

module.exports = { SIZE, winningLine };
