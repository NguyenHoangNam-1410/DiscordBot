const { createBoardPuzzleCommand } = require("../boardPuzzle/command");
module.exports = createBoardPuzzleCommand({
  game: "cotuong",
  name: "Cờ tướng",
  icon: "🀄",
  service: require("../services/xiangqiService"),
  view: require("../xiangqi/view"),
  maxMate: require("../xiangqi/puzzle").MAX_MATE,
  sourceName: "kho thế cờ đã kiểm chứng",
  notation: "ICCS và ký hiệu Việt",
  errors: {
    XIANGQI_ENGINE_UNAVAILABLE:
      "Chưa nạp được bộ luật cờ tướng. Kiểm tra đã chạy npm ci và thử lại; bàn cũ được giữ nguyên.",
    XIANGQI_NO_PUZZLES:
      "Kho thế cờ tướng chưa có thế phù hợp. Bàn cũ được giữ nguyên.",
  },
});
