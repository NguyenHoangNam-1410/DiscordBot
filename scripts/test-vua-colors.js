const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const testDb = path.resolve(__dirname, "../data/test-vua-colors.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const vua = require("../src/commands/vuatiengviet");
const { EmbedBuilder } = require("discord.js");
const fun = require("../src/services/funGameService");
const timed = require("../src/services/timedChallengeService");

const now = 1_000_000;
const hard = (remaining) => ({ hard: true, expiresAt: now + remaining * 1000, mixed: "x", hint: "h", answer: "a", durationSeconds: 60 });
const color = (q, outcome) => vua.questionColor(q, outcome, now);
const C = vua.COLORS;
assert.equal(color(hard(60)), C.green);
assert.equal(color(hard(30)), C.green);
assert.equal(color(hard(29.9)), C.yellow);
assert.equal(color(hard(10)), C.yellow);
assert.equal(color(hard(9.9)), C.red);
assert.equal(color(hard(1)), C.red);
assert.equal(color({ hard: false }), C.normal, "câu thường giữ màu cũ");
assert.equal(color(hard(5), "skipped"), C.gray);
assert.equal(color(hard(5), "expired"), C.gray);
assert.equal(color(hard(50), "correct"), C.blue);
assert.equal(color({ hard: false }, "correct"), C.blue);
assert.equal(new Set([C.green, C.yellow, C.red, C.gray, C.blue]).size, 5);
assert.equal(fun.HARD_DURATION_MS, 60_000);

// refresh: chỉ sửa tin nhắn khi đổi mốc
(async () => {
  const guild = "g1";
  const session = fun.startVuaSession(guild, { forceHard: true });
  assert(session.question.hard);
  fun.setVuaUiMessage(guild, "ch", "m1");
  const live = fun.getVuaSession(guild);
  const embed = new EmbedBuilder().setTitle("t").setColor(C.green).toJSON();
  const edits = [];
  const message = { embeds: [embed], edit: async (p) => { edits.push(p.embeds[0].data.color); message.embeds = [p.embeds[0].toJSON()]; } };
  const client = { channels: { fetch: async () => ({ messages: { fetch: async () => message } }) } };
  const t0 = live.question.expiresAt - 60_000;
  assert.equal(await timed.refreshChallengeColors(client, console, t0 + 1000), 0, "còn >30s: vẫn xanh lá, không sửa");
  assert.equal(await timed.refreshChallengeColors(client, console, t0 + 40_000), 1);
  assert.deepEqual(edits, [C.yellow]);
  assert.equal(await timed.refreshChallengeColors(client, console, t0 + 41_000), 0, "cùng mốc không sửa lại");
  assert.equal(await timed.refreshChallengeColors(client, console, t0 + 55_000), 1);
  assert.deepEqual(edits, [C.yellow, C.red]);
  console.log("vua colors ok");
})();
