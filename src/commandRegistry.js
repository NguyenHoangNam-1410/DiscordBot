const COMMAND_FILES = Object.freeze([
  "batdau",
  "trogiup",
  "huongdan",
  "changelog",
  "embed",
  "healthcheck",
  "oracle",
  "caro",
  "walls",
  "battleship",
  "dots",
  "blokus",
  "santorini",
  "mecung",
  "baucua",
  "taixiu",
  "chinchiro",
  "xidach",
  "poker",
  "duangua",
  "domin",
  "coquay",
  "sinhton",
  "2048",
  "luat",
  "hoso",
  "xu",
  "vatpham",
  "nhiemvu",
  "xephang",
  "anxin",
  "quantri",
  "gacha",
  "vtv",
  "chatbot",
  "covua",
  "cotuong",
]);

function loadCommands(base = "./commands") {
  const standalone = require(`${base}/choi`).standaloneCommands;
  return COMMAND_FILES.map((name) =>
    name === "vtv"
      ? require(`${base}/vuatiengviet`).playerCommand
      : standalone[name] || require(`${base}/${name}`),
  );
}

module.exports = { COMMAND_FILES, loadCommands };
