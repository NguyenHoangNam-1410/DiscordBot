"use strict";
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const E = require("../src/santorini/engine");
const { normalizeRules } = require("../src/santorini/rules");
const { createStore, WAIT_MS } = require("../src/santorini/store");
const { createGame } = require("../src/santorini/webGame");
const { createWebServer } = require("../src/webGames/http");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now);
const users = {
  X: { id: "100000000000000001", username: "An <script>" },
  O: { id: "100000000000000002", username: "Bình" },
};
const create = (rules = {}, guildId = `s-${++serial}`, channelId = "channel") =>
  store.create({ rules, guildId, channelId, user: users.X });
const match = (rules = {}) => store.join(create(rules).id, users.O);
const act = (r, data) => store.move(r.id, users[r.turn].id, data, r.version);
function placed(rules = {}) {
  let r = match(rules);
  r = act(r, { type: "place", cells: [0, 1] });
  return act(r, { type: "place", cells: [23, 24] });
}
const code = (fn, c) => assert.throws(fn, (e) => e.code === c);
function patch(r, fn) {
  const next = store.get(r.id);
  fn(next);
  db.prepare("UPDATE santorini_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(next),
    r.id,
  );
  return store.get(r.id);
}
// Independent enumeration of moves/builds, including diagonal boundaries and vacated cells.
function oracle(r, side) {
  const list = [],
    own = r.workers[side];
  for (let worker = 0; worker < 2; worker++) {
    const from = own[worker];
    for (let to = 0; to < 25; to++) {
      const adjacent = (a, b) =>
        a !== b &&
        Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 &&
        Math.abs((a % 5) - (b % 5)) <= 1;
      const occupied = (c) => [...r.workers.X, ...r.workers.O].includes(c);
      if (
        !adjacent(from, to) ||
        occupied(to) ||
        r.board[to] === 4 ||
        r.board[to] - r.board[from] > 1
      )
        continue;
      if (r.board[from] === 2 && r.board[to] === 3) {
        list.push({ worker, to, builds: [], win: true });
        continue;
      }
      const builds = [];
      for (let b = 0; b < 25; b++)
        if (adjacent(to, b) && r.board[b] < 4 && (b === from || !occupied(b)))
          builds.push(b);
      if (builds.length) list.push({ worker, to, builds, win: false });
    }
  }
  return list;
}
async function main() {
  assert.deepEqual(normalizeRules(), { timeMinutes: 30, first: "host" });
  for (const t of [0, 181, 1.5, "30", null])
    code(() => normalizeRules({ timeMinutes: t }), "INVALID_RULES");
  code(() => normalizeRules({ first: "youngest" }), "INVALID_RULES");
  assert.deepEqual(E.neighbors(0), [1, 5, 6]);
  assert.equal(E.neighbors(12).length, 8);
  assert(!E.neighbors(4).includes(5));
  let r = match();
  assert.equal(r.turn, "X");
  assert.equal(r.phase, "placement");
  code(() => act(r, { type: "place", cells: [0, 0] }), "INVALID_PLACEMENT");
  code(() => act(r, { type: "place", cells: [-1, 25] }), "INVALID_PLACEMENT");
  code(
    () =>
      store.move(r.id, "outsider", { type: "place", cells: [0, 1] }, r.version),
    "NOT_PLAYER",
  );
  code(
    () =>
      store.move(r.id, users.O.id, { type: "place", cells: [0, 1] }, r.version),
    "NOT_TURN",
  );
  code(
    () =>
      store.move(
        r.id,
        users.X.id,
        { type: "place", cells: [0, 1] },
        r.version - 1,
      ),
    "STALE_BOARD",
  );
  clock += 1200;
  r = act(r, { type: "place", cells: [0, 1] });
  assert.equal(r.clocks.X, 1800000 - 1200);
  code(() => act(r, { type: "place", cells: [1, 2] }), "INVALID_PLACEMENT");
  clock += 500;
  r = act(r, { type: "place", cells: [23, 24] });
  assert.equal(r.clocks.O, 1800000 - 500);
  assert.equal(r.phase, "turn");
  assert.equal(r.turn, "X");
  const before = store.get(r.id);
  code(
    () => act(r, { type: "turn", worker: 0, to: 5, build: 24 }),
    "INVALID_BUILD",
  );
  assert.deepEqual(
    store.get(r.id),
    before,
    "Invalid compound turn never commits the move or clock",
  );
  code(
    () => act(r, { type: "turn", worker: "0", to: 5, build: 0 }),
    "INVALID_WORKER",
  );
  code(
    () => act(r, { type: "turn", worker: 0, to: 1, build: 0 }),
    "INVALID_MOVE",
  );
  clock += 300;
  r = act(r, { type: "turn", worker: 0, to: 6, build: 0 });
  assert.equal(r.board[0], 1);
  assert.equal(r.workers.X[0], 6);
  assert.equal(r.clocks.X, 1800000 - 1500);
  assert.equal(r.turn, "O");
  assert.deepEqual(
    createStore(db, now).get(r.id),
    r,
    "Restart retains positions, board and banks",
  );
  r = placed({ first: "guest" });
  assert.equal(r.first, "O");
  assert.equal(r.turn, "O");
  r = patch(r, (r) => {
    r.board[18] = 2;
    r.workers.O = [18, 24];
    r.board[12] = 3;
    r.board[13] = 4;
  });
  code(
    () => act(r, { type: "turn", worker: 0, to: 13, build: 18 }),
    "INVALID_MOVE",
  );
  r = act(r, { type: "turn", worker: 0, to: 12, build: 11 });
  assert.equal(r.winner, "O");
  assert.equal(r.reason, "level3");
  assert.equal(r.board[11], 0, "Winning upward move has no build");
  r = placed();
  r = patch(r, (r) => {
    r.workers.X = [6, 1];
    r.board[6] = 3;
    r.board[7] = 3;
  });
  assert.equal(
    E.turnResult(r, "X", { worker: 0, to: 7, build: 6 }).win,
    false,
    "Moving level 3 to level 3 does not win",
  );
  r = act(r, { type: "turn", worker: 0, to: 7, build: 6 });
  assert.equal(r.status, "playing");
  assert.equal(r.board[6], 4, "Build dome on vacated level 3");
  r = placed();
  r = patch(r, (r) => {
    r.workers.X = [6, 1];
    r.board[6] = 3;
  });
  assert(
    !E.turnResult(r, "X", { worker: 0, to: 12, build: 6 }).error,
    "Descending several levels is legal",
  );
  r = patch(r, (r) => {
    r.board[12] = 2;
    r.board[7] = 3;
  });
  r = act(r, { type: "turn", worker: 1, to: 2, build: 7 });
  assert.equal(
    r.board[7],
    4,
    "Ground worker can build at any neighboring height",
  );
  r = placed();
  r = patch(r, (r) => {
    r.board[5] = 2;
  });
  code(
    () => act(r, { type: "turn", worker: 0, to: 5, build: 0 }),
    "INVALID_MOVE",
  );
  // Trapping the opponent ends immediately; no pass or auto-skip.
  r = placed();
  r = patch(r, (r) => {
    r.workers.O = [20, 24];
    for (const c of [15, 16, 21, 18, 19, 23]) r.board[c] = 4;
  });
  r = act(r, { type: "turn", worker: 0, to: 5, build: 0 });
  assert.equal(r.reason, "blocked");
  assert.equal(r.winner, "X");
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM santorini_seats WHERE room_id=?")
      .get(r.id).n,
    0,
  );
  r = match({ timeMinutes: 1 });
  clock += 60001;
  code(() => act(r, { type: "place", cells: [0, 1] }), "ROOM_CLOSED");
  assert.equal(store.get(r.id).winner, "O");
  r = placed({ timeMinutes: 1 });
  clock += 60000;
  code(
    () => act(r, { type: "turn", worker: 0, to: 5, build: 0 }),
    "ROOM_CLOSED",
  );
  assert.equal(store.get(r.id).reason, "timeout");
  r = create();
  clock += WAIT_MS;
  assert.equal(store.get(r.id).reason, "expired");
  r = placed();
  assert.equal(store.leave(r.id, users.O.id).winner, "X");
  r = create({}, "lock");
  code(() => create({}, "lock"), "ALREADY_PLAYING");
  store.leave(r.id, users.X.id);
  store.setChannelLimit("limit", "channel", 1, "admin");
  r = create({}, "limit");
  code(
    () =>
      store.create({ guildId: "limit", channelId: "channel", user: users.O }),
    "CHANNEL_FULL",
  );
  store.leave(r.id, users.X.id);
  // Complete seeded games checked against the independent enumerator.
  let seed = 613;
  const rng = (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  const economyRows = db.prepare("SELECT count(*) n FROM game_history").get().n;
  for (let game = 0; game < 80; game++) {
    r = placed({ first: game % 2 ? "guest" : "host" });
    while (r.status === "playing") {
      const legal = oracle(r, r.turn);
      assert.deepEqual(E.legalTurns(r, r.turn), legal);
      assert(legal.length);
      const m = legal[rng(legal.length)],
        mark = r.turn;
      r = act(r, {
        type: "turn",
        worker: m.worker,
        to: m.to,
        build: m.win ? null : m.builds[rng(m.builds.length)],
      });
      assert(r.board.every((h) => Number.isInteger(h) && h >= 0 && h <= 4));
      assert(new Set([...r.workers.X, ...r.workers.O]).size === 4);
      assert(r.moves <= 100, "Each nonwinning turn adds one building piece");
      if (r.status === "finished") {
        assert.equal(r.winner, mark);
        if (r.reason === "blocked") assert.equal(oracle(r, r.turn).length, 0);
      }
    }
  }
  assert.equal(
    db.prepare("SELECT count(*) n FROM game_history").get().n,
    economyRows,
    "Web play has no economy settlement",
  );
  // HTTP: one room, two authenticated players and a public spectator stream.
  r = placed();
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store, db })], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  const request = async (route, data, cookie, origin = config.origin) => {
    const res = await fetch(config.origin + "/api/games/santorini/" + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const login = async (id) =>
    (
      await request("login", {
        ticket: new URL(web.issueTicket("santorini", r.id, id)).hash.slice(8),
      })
    ).cookie;
  const cookies = [await login(users.X.id), await login(users.O.id), null],
    aborters = cookies.map(() => new AbortController());
  const readers = await Promise.all(
    cookies.map(async (cookie, i) => {
      const res = await fetch(
        `${config.origin}/api/games/santorini/events?room=${r.id}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: aborters[i].signal,
        },
      );
      assert.equal(res.status, 200);
      const reader = res.body.getReader();
      await reader.read();
      return reader;
    }),
  );
  try {
    const streams = readers.map((reader) => reader.read()),
      data = {
        roomId: r.id,
        type: "turn",
        worker: 0,
        to: 5,
        build: 0,
        version: r.version,
      };
    assert.equal(
      (await request("move", data, cookies[0], "https://evil.example")).status,
      403,
    );
    assert.equal((await request("move", data, null)).status, 401);
    assert.equal((await request("move", data, cookies[1])).status, 409);
    const results = await Promise.all([
      request("move", data, cookies[0]),
      request("move", data, cookies[0]),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    for (const stream of await Promise.all(streams))
      assert.match(new TextDecoder().decode(stream.value), /"moves":1/);
    const viewer = (await request("state?room=" + r.id)).data;
    assert.equal(viewer.me, null);
    assert(!JSON.stringify(viewer).includes(users.X.id));
    assert.deepEqual(viewer.legalTurns, []);
  } finally {
    aborters.forEach((a) => a.abort());
    for (const reader of readers) await reader.cancel().catch(() => {});
  }
  assert.equal(
    (await fetch(config.origin + "/santorini/room/" + r.id)).status,
    200,
  );
  assert.match(await (await fetch(config.origin + "/")).text(), /Santorini/);
  const command = require("../src/commands/santorini"),
    runtime = require("../src/santorini/runtime"),
    available = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const sent = [],
      i = {
        guildId: "discord",
        channelId: "c",
        user: users.X,
        options: {
          getSubcommand: () => "choi",
          getInteger: () => 10,
          getString: () => "guest",
        },
        deferReply: async () => {},
        reply: async (p) => sent.push(p),
        editReply: async (p) => {
          sent.push(p);
          return { id: "lobby" };
        },
      };
    await command.execute(i);
    r = runtime.store.listOpen("discord", "c")[0];
    assert.equal(r.first, "O");
    assert.equal(r.messageId, "lobby");
    const button = {
      ...i,
      user: users.O,
      message: { id: "lobby" },
      customId: `santorini:join:${r.id}`,
      deferUpdate: async () => {},
      followUp: async (p) => sent.push(p),
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    };
    assert(
      await require("../src/componentRouter").routeComponentInteraction(button),
    );
    assert.equal(runtime.store.get(r.id).status, "playing");
    const client = {
      channels: {
        fetch: () => {
          throw Error("Use bound interaction");
        },
      },
    };
    await runtime.syncMessages(client);
    assert.match(sent.at(-1).embeds[0].toJSON().description, /Đang đặt thợ/);
    runtime.store.leave(r.id, users.O.id);
    await runtime.syncMessages(client);
    assert.match(sent.at(-1).embeds[0].toJSON().description, /thắng/);
    await command.handleButton({ ...button, guildId: "wrong" });
    assert.match(sent.at(-1).content, /không thuộc/);
    await command.execute({
      ...i,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "cauhinh" },
    });
    assert.match(sent.at(-1).content, /Chỉ quản trị/);
    const prefix = process.env.COMMAND_PREFIX;
    process.env.COMMAND_PREFIX = "!";
    try {
      await require("../src/services/slashPrefixService").handleSlashPrefix({
        guildId: "prefix",
        channelId: "c",
        author: users.X,
        content: "!santorini choi nguoitruoc=guest thoigian=12",
        channel: {},
        reply: async (p) => {
          sent.push(p);
          return { id: "prefix" };
        },
      });
      assert.equal(runtime.store.listOpen("prefix", "c")[0].first, "O");
    } finally {
      if (prefix === undefined) delete process.env.COMMAND_PREFIX;
      else process.env.COMMAND_PREFIX = prefix;
    }
  } finally {
    runtime.isAvailable = available;
  }
  assert(
    !require("../src/services/gameChannelService").GAMES.includes("santorini"),
  );
  const health = require("../src/services/operationalHealthService");
  store.sweep();
  const baseline = health.getOperationalHealth().active.sessions;
  r = create({}, "health");
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(r.id, users.X.id);
  r = create({}, "reset");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset",
  });
  assert.equal(store.get(r.id), null);
  console.log(
    JSON.stringify({
      ok: true,
      santorini:
        "basic rules, placement, diagonals, heights/domes, immediate win, trapped loss, 80 oracle-checked games, atomic turns, clocks, restart, locks, three-client SSE, Discord/prefix, health/reset",
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (web) await web.stop();
    db.close();
  });
