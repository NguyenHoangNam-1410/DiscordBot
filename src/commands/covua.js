const { createBoardPuzzleCommand } = require("../boardPuzzle/command");
module.exports = createBoardPuzzleCommand({
  game: "covua",
  name: "Cờ vua",
  icon: "♟️",
  service: require("../services/chessService"),
  view: require("../chess/view"),
});
