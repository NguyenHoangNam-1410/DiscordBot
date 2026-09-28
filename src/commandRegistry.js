const COMMAND_FILES = Object.freeze([
  'batdau', 'trogiup', 'huongdan', 'choi', 'luat', 'hoso', 'xu', 'vatpham', 'nhiemvu',
  'xephang', 'anxin', 'quantri',
]);

function loadCommands(base = './commands') {
  return COMMAND_FILES.map(name => require(`${base}/${name}`));
}

module.exports = { COMMAND_FILES, loadCommands };
