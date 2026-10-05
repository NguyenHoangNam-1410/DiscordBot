"use strict";
// Chạy qua đường chơi thật (V2): kill, boss, sự kiện, killer phải được ghi vào hồ sơ khi ván kết thúc.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hc-profile-")), "t.sqlite");
const { db } = require("../src/db");
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const profile = require("../src/services/hardcoreProfile");

const run = service.startHardcore({
  guildId: "g", userId: "u", channelId: "c", stake: 10, classKey: "barbarian",
  forcedEncounter: { type: "empty", name: "Trống" },
});
const edit = (fn) => {
  const state = repo.parseState(repo.getSession(run.session.id));
  fn(state);
  repo.saveState(run.session, state);
  return state;
};
const play = (action) => {
  const s = repo.parseState(repo.getSession(run.session.id));
  return service.playHardcore({ sessionId: run.session.id, userId: "u", expectedTurn: s.turn, action });
};
const world = require("../src/services/hardcoreWorld");
const enemy = (state, rank, name, hp = 1) => ({ ...world.makeEnemy(state, rank, name, () => 0.5), hp });

edit((s) => { s.encounter = { type: "surprise", kind: "healer", name: "Wandering Healer" }; s.hp = 1; });
play("event_heal");
let state = repo.parseState(repo.getSession(run.session.id));
assert.equal(state.evCount, 1, "sự kiện được đếm");
assert.deepEqual(state.evKinds, ["healer"]);

edit((s) => { s.encounter = enemy(s, "boss", "Andariel"); s.hp = s.maxHp; });
for (let i = 0; i < 40; i++) {
  const cur = repo.parseState(repo.getSession(run.session.id));
  if (cur.encounter?.name !== "Andariel") break; // đã hạ, ván chuyển sang bước kế
  play("attack");
}
state = repo.parseState(repo.getSession(run.session.id));
assert.equal(state.kills, 1);
assert.equal(state.bossKills, 1);
assert.equal(state.bossTally.Andariel, 1);

// tử trận: killer lấy từ quái đang đứng trước mặt
edit((s) => { s.phase = "encounter"; s.encounter = { ...enemy(s, "elite", "Dark Knight", 99999), damageMin: 9999, damageMax: 9999 }; s.hp = 1; });
let out;
for (let i = 0; i < 60 && !out?.settled; i++) {
  edit((s) => { if (s.encounter?.name === "Dark Knight") s.hp = 1; });
  out = play("attack");
}
assert(out.settled, "ván phải kết thúc");
const row = db.prepare("SELECT * FROM hardcore_run_archive WHERE user_id='u'").get();
assert.equal(row.killed_by, "Dark Knight");
assert.equal(row.kills, 1);
assert.equal(row.boss_kills, 1);
assert.equal(row.events, 1);
const stats = profile.gatherStats("g", "u");
assert.equal(stats.events.bossKills, 1);
assert.equal(stats.bosses[0].name, "Andariel");
assert.equal(stats.killers[0].name, "Dark Knight");
console.log("hardcore profile live ok");
