"use strict";

const horizontal = (size, row, col) => row * size + col;
const vertical = (size, row, col) => size * (size + 1) + row * (size + 1) + col;
const edgeCount = (size) => 2 * size * (size + 1);
function describeEdge(size, edge) {
  if (!Number.isInteger(edge) || edge < 0 || edge >= edgeCount(size))
    throw Object.assign(new Error("Cạnh không hợp lệ."), {
      code: "INVALID_EDGE",
    });
  const count = size * (size + 1);
  return edge < count
    ? { orientation: "h", row: Math.floor(edge / size), col: edge % size }
    : {
        orientation: "v",
        row: Math.floor((edge - count) / (size + 1)),
        col: (edge - count) % (size + 1),
      };
}
function boxEdges(size, row, col) {
  return [
    horizontal(size, row, col),
    horizontal(size, row + 1, col),
    vertical(size, row, col),
    vertical(size, row, col + 1),
  ];
}
function claimEdge(board, size, edge, mark) {
  const { orientation, row, col } = describeEdge(size, edge);
  if (board.edges[edge])
    throw Object.assign(new Error("Cạnh này đã được nối."), {
      code: "OCCUPIED",
    });
  board.edges[edge] = mark;
  const neighbors =
    orientation === "h"
      ? [
          [row - 1, col],
          [row, col],
        ]
      : [
          [row, col - 1],
          [row, col],
        ];
  const captured = [];
  for (const [r, c] of neighbors) {
    if (r < 0 || c < 0 || r >= size || c >= size) continue;
    const box = r * size + c;
    if (
      !board.boxes[box] &&
      boxEdges(size, r, c).every((id) => board.edges[id])
    ) {
      board.boxes[box] = mark;
      captured.push(box);
    }
  }
  return captured;
}
module.exports = {
  horizontal,
  vertical,
  edgeCount,
  describeEdge,
  boxEdges,
  claimEdge,
};
