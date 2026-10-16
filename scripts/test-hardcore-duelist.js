"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const service = require("../src/hardcore"),
  core = service.V2,
  repo = require("../src/hardcore/storage/sessions"),
  view = require("../src/hardcore/ui");
let groups = 0,
  serial = 0;
function test(name, f) {
  f();
  console.log("PASS " + name);
  groups++;
}
function state(run) {
  return service.getHardcoreRun("duelist", run.session.user_id).state;
}
function play(run, action, extra = {}) {
  return service.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: state(run).turn,
    action,
    ...extra,
  });
}
function start(mode, hands) {
  const user = "duelist-" + ++serial;
  db.prepare(
    "INSERT INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES('duelist',?,1000000,0,0)",
  ).run(user);
  const run = service.startHardcore({
    guildId: "duelist",
    userId: user,
    channelId: "c",
    classKey: "barbarian",
    stake: 100000,
    forcedEncounter: { type: "empty" },
  });
  const s = state(run);
  s.encounter = core.makeSurprise(s, () => 0.5, "duelist");
  s.encounter.hands = hands;
  s.encounter.penalty = ["str", "str", "str", "str", "str", "str"];
  repo.saveState(run.session, s);
  play(run, "duel_" + mode);
  return run;
}
try {
  test("Attribute draws preserve the event, attributes and round; next attempt can win", () => {
    const run = start("stat", [0, 1]),
      before = state(run);
    const draw = play(run, "hand_0").state;
    assert.equal(draw.floor, 1);
    assert.equal(draw.encounter.round, 0);
    assert.equal(draw.encounter.wins, 0);
    assert.equal(draw.encounter.history[0].result, "draw");
    for (const key of ["str", "dex", "vit", "ene"])
      assert.equal(draw[key], before[key]);
    assert(draw.lastLog.includes("Hòa không tính ván"));
    const win = play(run, "hand_0").state;
    assert.equal(win.cleared, 1);
    assert.equal(win.str, before.str + 6);
  });
  test("An attribute loss after a draw applies the penalty exactly once", () => {
    const run = start("stat", [0, 2]),
      before = state(run).str;
    play(run, "hand_0");
    const loss = play(run, "hand_0").state;
    assert.equal(loss.cleared, 1);
    assert.equal(loss.str, Math.max(1, before - 6));
  });
  test("Equipment counts only five decisive games even with interleaved draws", () => {
    const run = start("items", [0, 1, 0, 2, 1, 0, 2, 0, 1]);
    let decisive = 0,
      wins = 0;
    for (const opponent of [0, 1, 0, 2, 1, 0, 2, 0, 1]) {
      const out = play(run, "hand_0").state;
      if (opponent !== 0) decisive++;
      if (opponent === 1) wins++;
      if (decisive < 5) {
        assert.equal(out.encounter.kind, "duelist");
        assert.equal(out.encounter.round, decisive);
        assert.equal(out.encounter.wins, wins);
        assert.equal(out.items.length, 0);
      } else {
        assert.equal(out.cleared, 1);
        assert.equal(out.items.length, 1);
      }
    }
  });
  test("More than five draws can continue; exhaustion of prelocked hands generates a valid new throw", () => {
    const run = start("items", [0, 0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < 7; i++) {
      const s = play(run, "hand_0").state;
      assert.equal(s.encounter.round, 0);
      assert.equal(s.encounter.history.length, i + 1);
      assert.equal(s.cleared, 0);
    }
    const out = play(run, "hand_0").state;
    assert.equal(out.encounter.history.length, 8);
    assert([0, 1, 2].includes(out.encounter.hands[7]));
    assert.equal(
      out.encounter.round,
      out.encounter.history.filter((h) => h.result !== "draw").length,
    );
    const saved = repo.getSession(run.session.id).state_json;
    assert.throws(
      () => play(run, "hand_0", { expectedTurn: 0 }),
      /STALE_ACTION/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, saved);
  });
  test("Third win finishes early and five losses finish without a reward", () => {
    const win = start("items", [1, 1, 1]);
    play(win, "hand_0");
    play(win, "hand_0");
    assert.equal(play(win, "hand_0").state.cleared, 1);
    const loss = start("items", [2, 2, 0, 2, 2, 2]);
    for (let i = 0; i < 5; i++)
      assert.equal(play(loss, "hand_0").state.cleared, 0);
    const out = play(loss, "hand_0").state;
    assert.equal(out.cleared, 1);
    assert.equal(out.items.length, 0);
  });
  test("Old active progress is corrected without replaying consumed opponent throws; UI explains 50 percent", () => {
    const run = start("items", [0, 1, 1, 1]);
    const s = state(run);
    s.encounter.history = [
      { hand: 0, opponent: 0, result: "draw" },
      { hand: 0, opponent: 1, result: "win" },
    ];
    s.encounter.round = 2;
    s.encounter.wins = 1;
    repo.saveState(run.session, s);
    const out = play(run, "hand_0").state;
    assert.equal(out.encounter.round, 2);
    assert.equal(out.encounter.wins, 2);
    assert.equal(out.encounter.history.length, 3);
    const payload = view.privatePayload(out, run.session.id, "m", "details", 0);
    const text = JSON.stringify(payload.embeds.map((e) => e.toJSON()));
    assert(text.includes("Hòa đánh lại"));
    assert(!text.includes("≈21%"));
    assert(!text.includes("Hòa/thua"));
    assert(text.includes("50%"));
  });
  console.log(groups + " Duelist groups passed; in-memory SQLite.");
} finally {
  db.close();
}
