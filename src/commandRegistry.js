const COMMAND_FILES = Object.freeze([
  "batdau",
  "trogiup",
  "huongdan",
  "baucua",
  "taixiu",
  "chinchiro",
  "oantuti",
  "xidach",
  "poker",
  "duangua",
  "domin",
  "coquay",
  "sinhton",
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
