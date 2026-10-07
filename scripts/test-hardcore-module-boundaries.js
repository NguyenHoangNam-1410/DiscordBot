"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

// Cold processes catch require cycles that a warmed module cache would conceal.
async function scenario(order, version) {
  const Database = require("better-sqlite3");
  require.cache[require.resolve("better-sqlite3")].exports = function () {
    return new Database(":memory:");
  };
  const { db } = require("../src/db");
  require.cache[require.resolve("better-sqlite3")].exports = Database;
  process.env.HARDCORE_GAMEPLAY_VERSION = version;
  const roots = {
    tower: "../src/services/hardcoreTowerView",
    feature: "../src/hardcore",
    compatibility: "../src/services/hardcoreService",
  };
  for (const name of order) require(roots[name]);
  const service = require("../src/hardcore");
  const old = require("../src/services/hardcoreService");
  assert.equal(service, old, "Old and new callers must share one public API");
  assert.equal(
    require("../src/commands/hardcore"),
    require("../src/hardcore/command"),
  );
  const core = require("../src/hardcore/engine");
  assert.equal(core, require("../src/services/hardcoreV2"));
  assert.equal(service.V2, core);
  assert.equal(
    require("../src/hardcore/ui"),
    require("../src/services/hardcoreV2View"),
  );
  assert.equal(
    require("../src/hardcore/shared/icons"),
    require("../src/services/hardcoreIcons"),
  );
  assert.equal(
    require("../src/hardcore/shared/ui"),
    require("../src/services/hardcoreUi"),
  );
  assert.equal(
    require("../src/hardcore/events/paradox"),
    require("../src/services/hardcoreParadoxService"),
  );

  const repo = require("../src/hardcore/storage/sessions");
  assert.equal(repo, require("../src/services/hardcoreRepository"));
  const { getAccount } = require("../src/services/economyService");
  const guildId = "module-test",
    userId = "owner";
  const balance = getAccount(guildId, userId).balance;
  const run = old.startHardcore({
    guildId,
    userId,
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty", name: "Trống" },
  });
  assert.equal(getAccount(guildId, userId).balance, balance - 10);
  assert.equal(service.getHardcoreByUser(guildId, userId).id, run.session.id);
  assert.throws(
    () =>
      service.startHardcore({
        guildId,
        userId,
        channelId: "c",
        stake: 10,
        classKey: "barbarian",
      }),
    /ACTIVE_SESSION/,
  );

  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const seen = [];
  const first = old.withHardcoreSession(run.session.id, async (queue) => {
    seen.push("first");
    queue.sharedMarker = true;
    await blocker;
    seen.push("released");
  });
  const second = service.withHardcoreSession(run.session.id, (queue) => {
    assert.equal(
      queue.sharedMarker,
      true,
      "Both callers must serialize on the same queue",
    );
    seen.push("second");
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(seen, ["first"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(seen, ["first", "released", "second"]);

  const args = {
    sessionId: run.session.id,
    userId,
    expectedTurn: 0,
    action: version === "legacy" ? "continue" : "next",
  };
  const turn = service.playHardcore(args);
  assert.equal(turn.settled, false);
  assert.equal(turn.state.turn, 1);
  const saved = repo.getSession(run.session.id).state_json;
  const fairCounter = turn.state.fairCounter;
  assert.ok(
    fairCounter > 0,
    "Fairness state must remain connected across engine modules",
  );
  assert.throws(() => old.playHardcore(args), /STALE_ACTION/);
  assert.equal(
    repo.getSession(run.session.id).state_json,
    saved,
    "Rejected clicks must roll back",
  );
  assert.equal(
    repo.parseState(repo.getSession(run.session.id)).fairCounter,
    fairCounter,
  );
  service.forceEndHardcoreSession(run.session.id, guildId, "system", {
    forfeit: true,
  });
  assert.equal(repo.getSession(run.session.id), null);
  assert.equal(old.getHardcoreRecord(guildId, userId).runs, 1);
  assert.equal(getAccount(guildId, userId).balance, balance - 10);
  assert.throws(
    () => old.playHardcore({ ...args, expectedTurn: 1 }),
    /INVALID_SESSION/,
  );
  db.close();
}
if (process.argv[2] === "scenario") {
  scenario(JSON.parse(process.argv[3]), process.argv[4]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  const orders = [
    ["tower", "feature", "compatibility"],
    ["feature", "compatibility", "tower"],
    ["compatibility", "tower", "feature"],
  ];
  for (const order of orders)
    for (const version of ["2", "legacy"])
      execFileSync(
        process.execPath,
        [__filename, "scenario", JSON.stringify(order), version],
        { stdio: "pipe" },
      );
  console.log(
    JSON.stringify({
      ok: true,
      coldStarts: 6,
      groups: [
        "Tower/feature/compatibility import orders",
        "shared API, DB, transaction, fairness and queue",
        "V2 and saved legacy run lifecycle, stale click rollback and one reservation",
      ],
    }),
  );
}
