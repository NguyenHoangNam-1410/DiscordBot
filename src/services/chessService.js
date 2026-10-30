const { createBoardPuzzleService } = require("../boardPuzzle/service");
const service = createBoardPuzzleService({
  prefix: "chess",
  game: "covua",
  name: "Cờ vua",
  idPrefix: "cv",
  engine: require("../chess/engine"),
  loadPuzzle: require("../chess/puzzle").loadPuzzle,
  view: require("../chess/view"),
});
module.exports = {
  ...service,
  handleChessMessage: service.handleMessage,
  forceEndChess: service.forceEndRound,
  startChessMaintenance: service.startMaintenance,
};
