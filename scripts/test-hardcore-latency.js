"use strict";
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const groups = [];
let count = 0;
function start() {
  const run = service.startHardcore({
    guildId: "latency",
    userId: `u${++count}`,
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty", name: "Trống" },
  });
  service.setMessageId(run.session.id, `public-${count}`);
  return run;
}
function state(run) {
  return repo.parseState(repo.getSession(run.session.id));
}
function save(run, edit) {
  const s = state(run);
  edit(s);
  repo.saveState(run.session, s);
  return s;
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function interaction(
  run,
  action = "next",
  turn = state(run).turn,
  overrides = {},
) {
  return {
    customId: `hardcore:${run.session.id}:${turn}:${action}`,
    guildId: "latency",
    channelId: "c",
    user: { id: run.session.user_id },
    message: { id: repo.getSession(run.session.id).message_id },
    createdTimestamp: Date.now(),
    deferUpdate: async () => {},
    deferReply: async () => {},
    editReply: async () => {},
    followUp: async () => {},
    ...overrides,
  };
}
async function flush() {
  for (let i = 0; i < 8; i++) await new Promise(setImmediate);
}
function payloadTurn(p) {
  return Number(p.components[0].toJSON().components[0].custom_id.split(":")[2]);
}
const entries = [];
const logger = Object.fromEntries(
  ["debug", "warn", "error"].map((level) => [
    level,
    (data, message) => entries.push({ level, data, message }),
  ]),
);
async function main() {
  // Discord's public edit is deliberately held indefinitely. Details must still finish.
  const run = start(),
    entered = deferred(),
    release = deferred();
  let publicEdits = 0,
    detailsDone = false,
    detailPayload;
  const first = service.handleHardcoreButton(
    interaction(run, "next", 0, {
      editReply: async () => {
        publicEdits++;
        entered.resolve();
        await release.promise;
      },
    }),
    logger,
  );
  await entered.promise;
  assert.equal(state(run).turn, 1);
  const duplicate = service.handleHardcoreButton(
    interaction(run, "next", 0, {
      editReply: async () => {
        publicEdits++;
      },
    }),
    logger,
  );
  const details = service.handleHardcoreButton(
    interaction(run, "view_stats_0", 0, {
      editReply: async (p) => {
        detailPayload = p;
        detailsDone = true;
      },
    }),
    logger,
  );
  await flush();
  assert(detailsDone, "private details waited for a public Discord update");
  assert(detailPayload.embeds.length);
  assert.equal(state(run).turn, 1);
  release.resolve();
  await Promise.all([first, duplicate, details]);
  assert.equal(publicEdits, 1, "a duplicate click resent the same public turn");
  assert(entries.some((e) => e.data.duplicateUpdateSkipped));
  groups.push(
    "private details bypass stalled public edits; duplicate click is coalesced",
  );

  // A stalled private edit must not hold up the next playable turn.
  const reverse = start(),
    privateEntered = deferred(),
    privateRelease = deferred();
  const heldDetails = service.handleHardcoreButton(
    interaction(reverse, "view_items_0", 0, {
      editReply: async () => {
        privateEntered.resolve();
        await privateRelease.promise;
      },
    }),
  );
  await privateEntered.promise;
  let gameDone = false;
  const game = service.handleHardcoreButton(
    interaction(reverse, "next", 0, {
      editReply: async () => {
        gameDone = true;
      },
    }),
  );
  await flush();
  assert(gameDone, "gameplay waited for a private Discord update");
  privateRelease.resolve();
  await Promise.all([heldDetails, game]);
  assert.equal(state(reverse).turn, 1);
  groups.push("gameplay bypasses stalled private edits");

  // Public updates retain ordering: no older payload can overwrite a newer turn.
  const ordered = start(),
    orderEntered = deferred(),
    orderRelease = deferred();
  const turns = [];
  const before = service.handleHardcoreButton(
    interaction(ordered, "next", 0, {
      editReply: async (p) => {
        orderEntered.resolve();
        await orderRelease.promise;
        turns.push(payloadTurn(p));
      },
    }),
  );
  await orderEntered.promise;
  save(ordered, (s) => {
    s.phase = "encounter";
    s.encounter = { type: "empty", name: "Trống" };
  });
  const after = service.handleHardcoreButton(
    interaction(ordered, "next", 1, {
      editReply: async (p) => {
        turns.push(payloadTurn(p));
      },
    }),
  );
  await flush();
  assert.equal(state(ordered).turn, 1);
  orderRelease.resolve();
  await Promise.all([before, after]);
  assert.deepEqual(turns, [1, 2]);
  groups.push("public turn updates stay ordered");

  // A later stale click still repairs the UI; only duplicates in one queue are skipped.
  let repairs = 0;
  await service.handleHardcoreButton(
    interaction(ordered, "next", 0, {
      editReply: async (p) => {
        repairs++;
        assert.equal(payloadTurn(p), 2);
      },
    }),
  );
  assert.equal(repairs, 1);
  assert.equal(state(ordered).turn, 2);
  groups.push("later stale clicks can recover the current panel");

  // Failed REST updates must release the queue and leave the saved turn recoverable.
  const failed = start();
  const fail = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    service.handleHardcoreButton(
      interaction(failed, "next", 0, {
        editReply: fail,
        followUp: fail,
      }),
      logger,
    ),
    /offline/,
  );
  assert.equal(state(failed).turn, 1);
  let recovered;
  await service.handleHardcoreButton(
    interaction(failed, "next", 0, {
      editReply: async (p) => {
        recovered = p;
      },
    }),
  );
  assert.equal(payloadTurn(recovered), 1);
  groups.push("Discord failure releases the queue and saved turn recovers");

  // Owner/message restrictions remain in effect for the independent details queue.
  const owner = start();
  let denied;
  await service.handleHardcoreButton(
    interaction(owner, "view_stats_0", 0, {
      user: { id: "other" },
      editReply: async (p) => {
        denied = p;
      },
    }),
  );
  assert(denied.content.includes("người chơi khác"));
  await service.handleHardcoreButton(
    interaction(owner, "view_stats_0", 0, {
      message: { id: "obsolete" },
      editReply: async (p) => {
        denied = p;
      },
    }),
  );
  assert(denied.content.includes("đã cũ"));
  groups.push("details keep owner and current-message checks");

  // Cashout confirms always recheck the persisted turn/event; a private preview is no lock.
  const cash = start();
  save(cash, (s) => {
    s.cleared = 1;
    s.floor = 2;
  });
  let preview;
  await service.handleHardcoreButton(
    interaction(cash, "retreat", 0, {
      editReply: async (p) => {
        preview = p;
      },
    }),
  );
  const confirm = preview.components[0].toJSON().components[0].custom_id;
  save(cash, (s) => {
    s.turn = 1;
    s.encounter = { type: "rngesus" };
  });
  await service.handleHardcoreButton(
    interaction(cash, "retreat_confirm", 0, {
      customId: confirm,
      editReply: async (p) => {
        denied = p;
      },
    }),
  );
  assert(denied.content.includes("Lượt chơi đã thay đổi"));
  assert(repo.getSession(cash.session.id));
  await service.handleHardcoreButton(
    interaction(cash, "retreat_confirm", 1, {
      customId: confirm.replace(":0:", ":1:"),
      editReply: async (p) => {
        denied = p;
      },
    }),
  );
  assert(denied.content.includes("phải xử lý"));
  assert(repo.getSession(cash.session.id));
  groups.push("withdrawal rechecks changed turn and blocked encounters");

  // Acknowledgement state lives on the actual discord.js interaction.
  const binding = start();
  const raw = interaction(binding, "view_stats_0", 0);
  raw.deferReply = async function () {
    assert.equal(this, raw);
    this.deferred = true;
  };
  raw.editReply = async function () {
    assert.equal(this, raw);
    assert(this.deferred);
  };
  await service.handleHardcoreButton(raw, logger);
  const timingEntry = entries.findLast(
    (e) => e.message === "hardcore interaction timing",
  );
  for (const key of [
    "ackMs",
    "queueMs",
    "gameMs",
    "renderMs",
    "discordMs",
    "totalMs",
  ])
    assert(
      Number.isFinite(timingEntry.data[key]) && timingEntry.data[key] >= 0,
    );
  const delayed = interaction(binding, "view_stats_0", 0, {
    createdTimestamp: Date.now() - 2500,
  });
  await service.handleHardcoreButton(delayed, logger);
  assert(
    entries.some(
      (e) =>
        e.level === "warn" &&
        e.message === "slow hardcore interaction" &&
        e.data.ingressAgeMs >= 2500,
    ),
  );
  groups.push(
    "latency stages and delayed-delivery warnings; original interaction binding",
  );

  // Representative local CPU profile, explicitly excluding real network and disk latency.
  const benchmark = start();
  const samples = [];
  for (let n = 0; n < 200; n++) {
    const s = save(benchmark, (s) => {
      s.phase = "encounter";
      s.encounter = { type: "empty", name: "Trống" };
    });
    const a = performance.now();
    const p = service.playHardcore({
      sessionId: benchmark.session.id,
      userId: benchmark.session.user_id,
      expectedTurn: s.turn,
      action: "next",
    });
    const b = performance.now();
    service
      .hardcoreEmbed(
        p.state,
        benchmark.session.user_id,
        null,
        benchmark.session.id,
      )
      .toJSON();
    service.hardcoreRows(benchmark.session.id, p.state).map((r) => r.toJSON());
    const c = performance.now();
    if (n >= 10) samples.push([b - a, c - b]);
  }
  const summary = (index) => {
    const t = samples.map((x) => x[index]).sort((a, b) => a - b);
    return {
      p50Ms: +t[Math.floor(t.length * 0.5)].toFixed(2),
      p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(2),
    };
  };
  console.log(
    JSON.stringify({
      ok: true,
      groups,
      profile: {
        database: "SQLite in-memory",
        game: summary(0),
        battleRender: summary(1),
      },
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
