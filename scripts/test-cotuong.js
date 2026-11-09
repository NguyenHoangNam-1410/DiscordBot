"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  E = require("../src/cotuong/engine"),
  R = require("../src/cotuong/rules"),
  legacy = require("../src/xiangqi/engine"),
  { position } = require("./generate-xiangqi-puzzles"),
  { createStore, WAIT_MS } = require("../src/cotuong/store");
const users = {
  X: { id: "100000000000000001", username: "An" },
  O: { id: "100000000000000002", username: "Bình" },
};
let now = 1800000000000,
  serial = 0,
  web;
const store = createStore(db, () => now),
  create = (rules = {}, guild = "test-" + serial++) =>
    store.create({ guildId: guild, channelId: "c", user: users.X, rules }),
  playing = (rules = {}) => store.join(create(rules).id, users.O),
  code = (fn, c) => assert.throws(fn, (e) => e.code === c, c);
function move(s, iccs) {
  return E.applyMove(s, {
    from: R.index(iccs.slice(0, 2)),
    to: R.index(iccs.slice(2)),
  });
}
async function main() {
  const fish = await E.initialize();
  let s = E.createState();
  assert.equal(s.pieces.length, 32);
  assert.equal(s.legal.length, 44);
  assert.equal(s.sideToMove, "red");
  assert.equal(s.fen, fish.startingFen("xiangqi"));
  for (let n = 0; n < 90; n++) assert.equal(R.index(R.coord(n)), n);
  code(() => R.normalizeRules({ timeMinutes: 0 }), "INVALID_RULES");
  const original = JSON.stringify(s);
  let a = move(s, "h2e2");
  assert.equal(JSON.stringify(s), original);
  assert.equal(a.state.pieces.find((p) => p.cell === R.index("e2")).type, "C");
  assert.equal(a.move.iccs, "h2e2");
  assert.equal(a.state.sideToMove, "black");
  assert.equal(E.moveError(s, "black", 0, 9), "NOT_TURN");
  assert.equal(E.moveError(s, "red", 0, 9), "NOT_OWN_PIECE");
  assert.equal(
    E.moveError(s, "red", R.index("a0"), R.index("b1")),
    "INVALID_MOVE",
  );
  assert.equal(E.moveError(s, "red", -1, 3), "INVALID_COORDINATE");
  const catalog = await require("../src/xiangqi/puzzle").loadCatalog();
  for (const side of ["r", "b"]) {
    const puzzle = catalog.find((p) => p.side === side && p.mate === 1),
      state = E.createState(puzzle.fen),
      result = move(state, puzzle.solution[0]);
    assert.equal(result.reason, "checkmate");
    assert.equal(result.winner, side === "r" ? "red" : "black");
    assert.equal(result.state.legal.length, 0);
    for (const first of ["host", "guest"]) {
      let room = playing({ first });
      Object.assign(room, state);
      room.turn = ["X", "O"].find(
        (k) => room.sideBySeat[k] === state.sideToMove,
      );
      db.prepare("UPDATE cotuong_rooms SET data_json=? WHERE id=?").run(
        JSON.stringify(room),
        room.id,
      );
      const mark = room.turn,
        m = state.legal.find((m) => m.iccs === puzzle.solution[0]);
      room = store.move(room.id, users[mark].id, m, room.version);
      assert.equal(room.winner, mark);
      assert.equal(room.status, "finished");
      assert.equal(room.endReason, "checkmate");
      assert.equal(store.snapshot(room, users[mark].id).legalMoves.length, 0);
    }
  }
  s = E.createState(
    position(
      [
        ["K", 3, 0],
        ["k", 4, 9],
        ["R", 3, 7],
        ["R", 5, 8],
      ],
      "w",
    ),
  );
  a = move(s, "d7d8");
  assert.equal(a.reason, "stalemate");
  assert.equal(a.winner, "red");
  assert.equal(a.state.check, false);
  s = E.createState();
  for (const m of [
    "b0c2",
    "b9c7",
    "c2b0",
    "c7b9",
    "b0c2",
    "b9c7",
    "c2b0",
    "c7b9",
  ]) {
    a = move(s, m);
    s = a.state;
  }
  assert.equal(a.reason, "repetition");
  assert.equal(a.winner, null);
  s = E.createState(E.INITIAL_FEN.replace("0 1", "119 1"));
  a = move(s, "a0a1");
  assert.equal(a.reason, "no_capture_limit");
  assert.equal(a.winner, null);
  let seed = 19,
    audited = 0;
  const rng = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let game = 0; game < 10; game++) {
    s = E.createState();
    const reference = new fish.Board("xiangqi");
    try {
      for (let ply = 0; ply < 80 && !s.reason; ply++) {
        const move = s.legal[rng(s.legal.length)],
          old = JSON.stringify(s),
          result = E.applyMove(s, move);
        assert(reference.push(legacy.toEngine(move.iccs)));
        assert.equal(JSON.stringify(s), old);
        s = result.state;
        assert.equal(s.fen, reference.fen());
        assert.equal(s.check, reference.isCheck());
        assert.deepEqual(
          s.legal.map((m) => m.iccs).sort(),
          legacy.legal(reference).map(legacy.fromEngine).sort(),
        );
        const live = s.pieces.filter((p) => p.cell !== null);
        assert.equal(new Set(live.map((p) => p.cell)).size, live.length);
        assert.equal(s.pieces.length, 32);
        assert.equal(s.engineLine.length, s.ply);
        audited++;
      }
    } finally {
      reference.delete();
    }
  }
  let room = playing({ timeMinutes: 1, first: "guest" });
  assert.equal(room.turn, "O");
  const originalRoom = JSON.stringify(room),
    m = room.legal[0];
  code(() => store.move(room.id, "stranger", m, room.version), "NOT_PLAYER");
  code(() => store.move(room.id, users.X.id, m, room.version), "NOT_TURN");
  code(
    () => store.move(room.id, users.O.id, { from: 90, to: 89 }, room.version),
    "INVALID_COORDINATE",
  );
  assert.equal(JSON.stringify(store.get(room.id)), originalRoom);
  now += 1000;
  room = store.move(room.id, users.O.id, m, room.version);
  assert.equal(room.clocks.O, 59000);
  assert.equal(room.turn, "X");
  const stable = JSON.stringify(room);
  code(
    () => store.move(room.id, users.X.id, room.legal[0], room.version - 1),
    "STALE_BOARD",
  );
  assert.equal(JSON.stringify(store.get(room.id)), stable);
  assert.deepEqual(createStore(db, () => now).get(room.id), room);
  assert.equal(room.engineLine.length, 1);
  now += 60000;
  assert.equal(store.get(room.id).winner, "O");
  assert.equal(store.get(room.id).endReason, "timeout");
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM cotuong_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );
  room = create();
  now += WAIT_MS;
  assert.equal(store.get(room.id).status, "expired");
  room = create({ first: "random" });
  assert.equal(createStore(db, () => now).get(room.id).first, room.first);
  store.leave(room.id, users.X.id);
  room = create({}, "limit");
  code(() => create({}, "limit"), "ALREADY_PLAYING");
  store.setChannelLimit("limit", "c", 1, "admin");
  code(
    () =>
      store.create({ guildId: "limit", channelId: "c", user: { id: "new" } }),
    "CHANNEL_FULL",
  );
  store.leave(room.id, users.X.id);
  assert(!require("../src/commands/luat").RULES.cotuong);
  assert(
    !require("../src/services/gameChannelService").GAMES.includes("cotuong"),
  );
  assert(
    !require("../src/services/gameRewardService").REWARD_GAMES.includes(
      "cotuong",
    ),
  );
  assert(require("../src/services/gameChannelService").GAMES.includes("covua"));
  assert(
    require("../src/commands/webgame")
      .payload("u", "cotuong")
      .embeds[0].toJSON()
      .title.includes("Cờ tướng"),
  );
  assert(
    !fs
      .readFileSync(
        path.join(__dirname, "../src/services/gameMessageService.js"),
        "utf8",
      )
      .includes("handleXiangqiMessage"),
  );
  assert(
    !fs
      .readFileSync(path.join(__dirname, "../src/index.js"), "utf8")
      .includes("startXiangqiMaintenance"),
  );
  assert.deepEqual(
    require("../src/commands/cotuong")
      .data.toJSON()
      .options.map((o) => o.name),
    ["choi", "phong", "cauhinh"],
  );
  // HTTP + three simultaneous streams: auth, origin, stale version and public DTO.
  const { createWebServer } = require("../src/webGames/http"),
    { createGame } = require("../src/cotuong/webGame");
  let r = playing({ first: "guest" });
  const config = { origin: "", secure: false };
  web = createWebServer({
    games: [createGame({ store, db })],
    config,
    now: () => now,
  });
  await new Promise((done) => web.server.listen(0, "127.0.0.1", done));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  async function request(route, data, cookie, origin = config.origin) {
    const response = await fetch(
      config.origin + "/api/games/cotuong/" + route,
      {
        method: data ? "POST" : "GET",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data
            ? { Origin: origin, "Content-Type": "application/json" }
            : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(5000),
      },
    );
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const cookies = [];
  for (const user of Object.values(users)) {
    const ticket = new URL(
      web.issueTicket("cotuong", r.id, user.id),
    ).hash.slice(8);
    cookies.push((await request("login", { ticket })).cookie);
  }
  cookies.push(null);
  const aborters = cookies.map(() => new AbortController()),
    readers = await Promise.all(
      cookies.map(async (cookie, i) => {
        const response = await fetch(
          config.origin + "/api/games/cotuong/events?room=" + r.id,
          {
            headers: cookie ? { Cookie: cookie } : {},
            signal: aborters[i].signal,
          },
        );
        const reader = response.body.getReader();
        await reader.read();
        return reader;
      }),
    );
  try {
    const data = { roomId: r.id, version: r.version, from: 81, to: 72 };
    assert.equal((await request("move", data, null)).status, 401);
    assert.equal(
      (await request("move", data, cookies[1], "https://bad.example")).status,
      403,
    );
    assert.equal((await request("move", data, cookies[0])).status, 409);
    const notifications = readers.map((reader) => reader.read()),
      responses = await Promise.all([
        request("move", data, cookies[1]),
        request("move", data, cookies[1]),
      ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    for (const update of await Promise.all(notifications))
      assert.match(new TextDecoder().decode(update.value), /"ply":1/);
    const publicView = (await request("state?room=" + r.id)).data;
    assert.equal(publicView.me, null);
    assert.deepEqual(publicView.legalMoves, []);
    assert(!JSON.stringify(publicView).includes(users.X.id));
    assert(!JSON.stringify(publicView).includes(users.O.id));
    const foreign = create();
    assert.equal(
      (await request("move", { ...data, roomId: foreign.id }, cookies[1]))
        .status,
      403,
    );
  } finally {
    aborters.forEach((c) => c.abort());
    for (const reader of readers) await reader.cancel().catch(() => {});
  }
  assert.equal(
    (await fetch(config.origin + "/cotuong/room/" + r.id)).status,
    200,
  );
  // Discord lifecycle, current-message edits, replay creates a fresh room, prefix.
  const command = require("../src/commands/cotuong"),
    runtime = require("../src/cotuong/runtime"),
    available = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const sent = [],
      interaction = {
        guildId: "discord",
        channelId: "c",
        user: users.X,
        options: {
          getSubcommand: () => "choi",
          getString: () => "guest",
          getInteger: () => 12,
        },
        deferReply: async () => {},
        reply: async (p) => sent.push(p),
        editReply: async (p) => {
          sent.push(p);
          return { id: "lobby" };
        },
      };
    await command.execute(interaction);
    let room = runtime.store.listOpen("discord", "c")[0];
    assert.equal(room.first, "O");
    assert.equal(room.messageId, "lobby");
    const button = {
      ...interaction,
      user: users.O,
      message: { id: "lobby" },
      customId: `cotuong:join:${room.id}`,
      deferUpdate: async () => {},
      followUp: async (p) => sent.push(p),
      isButton: () => true,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
    };
    await require("../src/componentRouter").routeComponentInteraction(button);
    assert.equal(runtime.store.get(room.id).turn, "O");
    await runtime.syncMessages({
      channels: {
        fetch: () => {
          throw Error("Use bound interaction");
        },
      },
    });
    assert.match(sent.at(-1).embeds[0].toJSON().description, /Lượt Đỏ/);
    room = runtime.store.leave(room.id, users.X.id);
    const old = JSON.stringify(room);
    await command.handleButton({
      ...button,
      customId: `cotuong:rematch:${room.id}`,
    });
    assert.equal(JSON.stringify(runtime.store.get(room.id)), old);
    assert.notEqual(runtime.store.listOpen("discord", "c")[0].id, room.id);
    process.env.COMMAND_PREFIX = "!";
    await require("../src/services/slashPrefixService").handleSlashPrefix({
      guildId: "prefix-cotuong",
      channelId: "c",
      author: users.X,
      content: "!cotuong choi nguoitruoc=guest thoigian=12",
      channel: {},
      reply: async (p) => ({ id: "prefix" }),
    });
    assert.equal(
      runtime.store.listOpen("prefix-cotuong", "c")[0].sideBySeat.O,
      "red",
    );
  } finally {
    runtime.isAvailable = available;
  }
  store.sweep();
  const health = require("../src/services/operationalHealthService"),
    baseline = health.getOperationalHealth().active.sessions;
  r = create({}, "health-cotuong");
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(r.id, users.X.id);
  r = create({}, "reset-cotuong");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset-cotuong",
  });
  assert.equal(store.get(r.id), null);
  console.log(
    JSON.stringify({
      ok: true,
      cotuong: `${audited} adapter-vs-engine positions; mate/stalemate/repetition, drag commit API locks, clock/restart, 3 SSE, Discord/prefix, health/reset`,
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
