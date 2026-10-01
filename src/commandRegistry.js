const COMMAND_FILES = Object.freeze([
  "batdau",
  "trogiup",
  "huongdan",
  "choi",
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
  return COMMAND_FILES.map((name) =>
    name === "vtv"
      ? require(`${base}/vuatiengviet`).playerCommand
      : require(`${base}/${name}`),
  );
}

module.exports = { COMMAND_FILES, loadCommands };
