const { createBoardPuzzleService } = require("../boardPuzzle/service");
const service = createBoardPuzzleService({
  prefix: "xiangqi",
  game: "cotuong",
  name: "Cờ tướng",
  idPrefix: "ct",
  engine: require("../xiangqi/engine"),
  loadPuzzle: require("../xiangqi/puzzle").loadPuzzle,
  view: require("../xiangqi/view"),
  allowRepeats: true,
});
module.exports = {
  ...service,
  handleXiangqiMessage: service.handleMessage,
  forceEndXiangqi: service.forceEndRound,
  startXiangqiMaintenance: service.startMaintenance,
};
