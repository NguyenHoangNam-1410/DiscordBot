"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const store = require("../src/hardcore/replay/store");

const DAY = 24 * 60 * 60_000;
const NOW = Date.UTC(2026, 9, 23);
const addRun = (id, { created, ended = null, frames = 3, session = false }) => {
  db.prepare(
    "INSERT INTO hardcore_replays(session_id,guild_id,user_id,created_at,ended_at,reason,result_json,partial,next_seq) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(id, "g", "u", created, ended, ended ? "death" : null, "{}", 0, frames);
  for (let seq = 0; seq < frames; seq += 1)
    db.prepare(
      "INSERT INTO hardcore_replay_frames VALUES(?,?,?,?,?,?,?,?)",
    ).run(id, seq, seq, 1, "attack", "{}", Buffer.from("x"), created);
  if (session)
    db.prepare(
      "INSERT INTO hardcore_sessions(id,guild_id,user_id,channel_id,message_id,state_json,created_at,updated_at) VALUES(?,?,?,?,NULL,'{}',?,?)",
    ).run(id, "g", "u", "c", created, created);
};
const count = (table, id) =>
  db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE session_id=?`).get(id).c;

assert.equal(store.REPLAY_RETENTION_DAYS, 14);
addRun("old-ended", { created: NOW - 40 * DAY, ended: NOW - 30 * DAY });
addRun("edge-ended", { created: NOW - 20 * DAY, ended: NOW - 14 * DAY + 1000 });
addRun("recent", { created: NOW - 2 * DAY, ended: NOW - 1 * DAY });
addRun("active-old", { created: NOW - 60 * DAY, session: true }); // run đang chơi lâu ngày, không bao giờ xóa
addRun("orphan-old", { created: NOW - 40 * DAY }); // không đóng, không còn phiên, quá 2× hạn
addRun("orphan-mid", { created: NOW - 20 * DAY }); // chưa tới 2× hạn → giữ

const result = store.pruneOldReplays({ now: NOW });
assert.equal(result.replays, 2);
for (const id of ["old-ended", "orphan-old"]) {
  assert.equal(count("hardcore_replays", id), 0, id);
  assert.equal(count("hardcore_replay_frames", id), 0, id + " frames");
}
for (const id of ["edge-ended", "recent", "active-old", "orphan-mid"]) {
  assert.equal(count("hardcore_replays", id), 1, id);
  assert.equal(count("hardcore_replay_frames", id), 3, id + " frames");
}
// Chạy lại không xóa thêm; hạn ngắn hơn thì xóa nhiều hơn
assert.equal(store.pruneOldReplays({ now: NOW }).replays, 0);
assert.equal(store.pruneOldReplays({ now: NOW, days: 1 }).replays, 2); // edge-ended, recent
assert.equal(count("hardcore_replays", "active-old"), 1);
// Xử lý theo lô: nhiều replay hơn một lô vẫn dọn hết qua nhiều vòng
for (let i = 0; i < 120; i += 1)
  addRun(`bulk-${i}`, {
    created: NOW - 50 * DAY,
    ended: NOW - 40 * DAY,
    frames: 1,
  });
assert.equal(store.pruneOldReplays({ now: NOW, batches: 1 }).replays, 50);
assert.equal(store.pruneOldReplays({ now: NOW }).replays, 70);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) c FROM hardcore_replay_frames WHERE session_id LIKE 'bulk-%'",
    )
    .get().c,
  0,
);
// Bộ hẹn giờ trả về timer có thể dừng
const timer = store.startReplayMaintenance({ info() {}, warn() {} });
assert.equal(typeof timer.unref, "function");
clearInterval(timer);

console.log(JSON.stringify({ ok: true, hardcoreReplayRetention: true }));
process.exit(0);
