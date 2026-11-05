"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  E = require("../src/cothu/engine"),
  R = require("../src/cothu/rules"),
  { createStore, WAIT_MS } = require("../src/cothu/store");
const ix = R.index,
  at = (state, position) => E.occupant(state, ix(position));
const users = {
  X: { id: "100000000000000001", username: "An" },
  O: { id: "100000000000000002", username: "Bình" },
};
let now = 1_800_000_000_000,
  serial = 0,
  web;
const store = createStore(db, () => now);
function fixture(pieces, extra = {}) {
  const state = {
    rulesId: R.RULES_ID,
    turn: "red",
    pieces: pieces.map(([side, type, cell], i) => ({
      id: side + "-" + type + "-" + i,
      side,
      type,
      cell: ix(cell),
    })),
    ply: 0,
    noCapturePly: 0,
    repetitions: {},
    ...extra,
  };
  state.repetitions[E.positionKey(state)] = 1;
  return state;
}
const check = (s, side, from, to, expected) =>
  assert.equal(
    E.moveError(s, side, ix(from), ix(to)),
    expected,
    `${side} ${from}→${to}`,
  );
const create = (rules = {}, guild = "test-" + serial++) =>
  store.create({ guildId: guild, channelId: "c", user: users.X, rules });
function playing(rules = {}) {
  return store.join(create(rules).id, users.O);
}
function saveFixture(room, s) {
  Object.assign(room, {
    pieces: s.pieces,
    ply: s.ply,
    moves: s.ply,
    noCapturePly: s.noCapturePly,
    repetitions: s.repetitions,
    turn: Object.keys(room.sideBySeat).find(
      (k) => room.sideBySeat[k] === s.turn,
    ),
  });
  db.prepare("UPDATE cothu_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(room),
    room.id,
  );
  return room;
}
function code(fn, name) {
  assert.throws(fn, (e) => e.code === name, name);
}

// Independent exhaustive rule oracle: no engine movement, rank, terrain or occupancy helpers.
function oracle(s, side, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= 63 ||
    to < 0 ||
    to >= 63
  )
    return false;
  const p = s.pieces.find((p) => p.cell === from),
    q = s.pieces.find((p) => p.cell === to);
  if (!p || p.side !== side || q?.side === side) return false;
  const water = (c) =>
    [1, 2, 4, 5].includes(c % 7) && [3, 4, 5].includes(Math.floor(c / 7));
  const home = side === "red" ? 59 : 3;
  if (to === home) return false;
  const r = Math.floor(from / 7),
    c = from % 7,
    rr = Math.floor(to / 7),
    cc = to % 7,
    dist = Math.abs(r - rr) + Math.abs(c - cc);
  if (!dist || (r !== rr && c !== cc)) return false;
  if (dist > 1) {
    if (!["lion", "tiger"].includes(p.type) || water(from)) return false;
    const step = r === rr ? Math.sign(cc - c) : 7 * Math.sign(rr - r);
    let n = from + step,
      count = 0;
    while (n >= 0 && n < 63 && water(n)) {
      if (s.pieces.some((p) => p.cell === n)) return false;
      count++;
      n += step;
    }
    if (!count || n !== to) return false;
  }
  if ((water(from) || water(to)) && p.type !== "rat") return false;
  if (!q) return true;
  if (
    (water(from) || water(to)) &&
    !(water(from) && water(to) && q.type === "rat")
  )
    return false;
  const rank = {
    rat: 1,
    cat: 2,
    wolf: 3,
    dog: 4,
    leopard: 5,
    tiger: 6,
    lion: 7,
    elephant: 8,
  };
  const power = (p) =>
    (p.side === "red" ? [2, 4, 10] : [58, 60, 52]).includes(p.cell)
      ? 0
      : rank[p.type];
  if (!power(p)) return false;
  if (!power(q)) return true;
  if (p.type === "rat" && q.type === "elephant") return true;
  if (p.type === "elephant" && q.type === "rat") return false;
  return power(p) >= power(q);
}
async function main() {
  const initial = E.createState();
  assert.equal(initial.pieces.length, 16);
  assert.equal(new Set(initial.pieces.map((p) => p.cell)).size, 16);
  for (let c = 0; c < 63; c++) assert.equal(ix(R.coord(c)), c);
  assert.equal(R.TERRAIN.filter((t) => t.kind === "water").length, 12);
  assert.equal(R.TERRAIN.filter((t) => t.kind === "trap").length, 6);
  assert.equal(R.TERRAIN.filter((t) => t.kind === "den").length, 2);
  assert.equal(at(initial, "a3").type, "elephant");
  assert.equal(at(initial, "g7").type, "elephant");
  assert.equal(R.ANIMALS.dog.rank, 4);
  assert.equal(R.ANIMALS.wolf.rank, 3);
  code(() => R.normalizeRules({ first: "bad" }), "INVALID_RULES");
  code(() => R.normalizeRules({ timeMinutes: 0 }), "INVALID_RULES");
  let s = fixture([
    ["red", "rat", "a3"],
    ["blue", "cat", "g7"],
  ]);
  for (const to of ["a2", "a4", "b3"]) check(s, "red", "a3", to, null);
  check(s, "red", "a3", "b4", "INVALID_MOVE");
  assert.equal(E.moveError(s, "red", 6, 7), "NOT_OWN_PIECE");
  for (const [a, b, ok] of [
    ["dog", "wolf", true],
    ["cat", "cat", true],
    ["wolf", "dog", false],
    ["rat", "elephant", true],
    ["elephant", "rat", false],
    ["rat", "cat", false],
  ]) {
    s = fixture([
      ["red", a, "d4"],
      ["blue", b, "d5"],
    ]);
    check(s, "red", "d4", "d5", ok ? null : "INSUFFICIENT_RANK");
  }
  for (const [a, b] of [
    ["b3", "b4"],
    ["b4", "b3"],
  ]) {
    s = fixture([
      ["red", "rat", a],
      ["blue", "rat", b],
    ]);
    check(s, "red", a, b, "WATER_CAPTURE_FORBIDDEN");
    s.pieces.pop();
    check(s, "red", a, b, null);
  }
  s = fixture([
    ["red", "rat", "b4"],
    ["blue", "rat", "b5"],
  ]);
  check(s, "red", "b4", "b5", null);
  for (const type of Object.keys(R.ANIMALS).filter((t) => t !== "rat")) {
    s = fixture([["red", type, "b3"]]);
    check(s, "red", "b3", "b4", "WATER_FORBIDDEN");
  }
  for (const type of ["lion", "tiger"]) {
    s = fixture([
      ["red", type, "a5"],
      ["blue", "cat", "g7"],
    ]);
    check(s, "red", "a5", "d5", null);
    check(s, "red", "a5", "e5", "INVALID_MOVE");
    s.pieces.push({ id: "block", side: "red", type: "rat", cell: ix("b5") });
    check(s, "red", "a5", "d5", "JUMP_BLOCKED");
    s.pieces.at(-1).side = "blue";
    check(s, "red", "a5", "d5", "JUMP_BLOCKED");
    s.pieces.at(-1).cell = ix("b4");
    check(s, "red", "a5", "d5", null);
    s = fixture([
      ["red", type, "b3"],
      ["blue", "cat", "b7"],
    ]);
    check(s, "red", "b3", "b7", null);
    const m = E.applyMove(s, { from: ix("b3"), to: ix("b7") });
    assert.deepEqual(m.move.path, [ix("b4"), ix("b5"), ix("b6")]);
    assert.equal(m.state.pieces[1].cell, null);
    s.pieces[1].side = "red";
    check(s, "red", "b3", "b7", "OWN_PIECE");
  }
  s = fixture([
    ["red", "tiger", "a5"],
    ["blue", "lion", "d5"],
  ]);
  check(s, "red", "a5", "d5", "INSUFFICIENT_RANK");
  s = fixture([
    ["red", "rat", "c9"],
    ["blue", "elephant", "c8"],
  ]);
  assert.equal(E.effectiveRank(s.pieces[0]), 0);
  check(s, "red", "c9", "c8", "TRAPPED_ATTACKER");
  check(s, "red", "c9", "b9", null);
  const escaped = E.applyMove(s, { from: ix("c9"), to: ix("b9") });
  assert.equal(E.effectiveRank(escaped.state.pieces[0]), 1);
  s = fixture([
    ["red", "rat", "c1"],
    ["blue", "cat", "c2"],
  ]);
  assert.equal(E.effectiveRank(s.pieces[0]), 1);
  s = fixture([
    ["red", "elephant", "b1"],
    ["blue", "rat", "c1"],
  ]);
  check(s, "red", "b1", "c1", null);
  assert.equal(
    E.applyMove(s, { from: ix("b1"), to: ix("c1") }).state.pieces[1].cell,
    null,
  );
  s = fixture([
    ["red", "rat", "d2"],
    ["blue", "cat", "a9"],
  ]);
  check(s, "red", "d2", "d1", "OWN_DEN");
  s = fixture(
    [
      ["red", "rat", "d8"],
      ["blue", "elephant", "a9"],
    ],
    { noCapturePly: 99 },
  );
  assert.equal(E.applyMove(s, { from: ix("d8"), to: ix("d9") }).reason, "den");
  s = fixture([
    ["red", "cat", "b3"],
    ["blue", "cat", "b2"],
  ]);
  assert.equal(
    E.applyMove(s, { from: ix("b3"), to: ix("b2") }).reason,
    "elimination",
  );
  s = fixture([
    ["red", "cat", "a7"],
    ["red", "wolf", "b9"],
    ["blue", "rat", "a9"],
  ]);
  assert.equal(
    E.applyMove(s, { from: ix("a7"), to: ix("a8") }).reason,
    "no_legal_moves",
  );
  s = fixture([
    ["red", "rat", "a1"],
    ["blue", "rat", "g9"],
  ]);
  assert.notEqual(E.positionKey(s), E.positionKey({ ...s, turn: "blue" }));
  assert.notEqual(E.positionKey(s), E.positionKey({ ...s, rulesId: "other" }));
  for (let loop = 0; loop < 2; loop++)
    for (const [a, b] of [
      ["a1", "a2"],
      ["g9", "g8"],
      ["a2", "a1"],
      ["g8", "g9"],
    ]) {
      const result = E.applyMove(s, { from: ix(a), to: ix(b) });
      s = result.state;
      if (loop === 1 && a === "g8") assert.equal(result.reason, "threefold");
      else assert.equal(result.reason, null);
    }
  s = fixture(
    [
      ["red", "rat", "a1"],
      ["blue", "rat", "g9"],
    ],
    { noCapturePly: 99 },
  );
  assert.equal(
    E.applyMove(s, { from: ix("a1"), to: ix("a2") }).reason,
    "no_capture_limit",
  );
  s = fixture(
    [
      ["red", "cat", "d4"],
      ["blue", "rat", "d5"],
      ["blue", "elephant", "g7"],
    ],
    { noCapturePly: 99 },
  );
  assert.equal(
    E.applyMove(s, { from: ix("d4"), to: ix("d5") }).state.noCapturePly,
    0,
  );
  let seed = 78;
  const rng = (n) => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed % n;
  };
  let audited = 0;
  for (let game = 0; game < 30; game++) {
    s = E.createState();
    for (let ply = 0; ply < 160; ply++) {
      if (ply % 4 === 0) {
        for (const side of ["red", "blue"]) {
          const moves = new Set(
            E.legalMoves(s, side).map((m) => m.from + ":" + m.to),
          );
          for (const p of s.pieces.filter(
            (p) => p.side === side && p.cell !== null,
          ))
            for (let to = 0; to < 63; to++)
              assert.equal(
                moves.has(p.cell + ":" + to),
                oracle(s, side, p.cell, to),
                `${p.type} ${p.cell}:${to}`,
              );
        }
        audited++;
      }
      const legal = E.legalMoves(s);
      if (!legal.length) break;
      const before = JSON.stringify(s),
        result = E.applyMove(s, legal[rng(legal.length)]);
      assert.equal(JSON.stringify(s), before);
      s = result.state;
      const live = s.pieces.filter((p) => p.cell !== null);
      assert.equal(new Set(live.map((p) => p.cell)).size, live.length);
      if (result.reason) break;
    }
  }
  const randomRoom = create({ first: "random" });
  const chosen = randomRoom.first;
  assert.equal(store.get(randomRoom.id).first, chosen);
  assert.equal(createStore(db, () => now).get(randomRoom.id).first, chosen);
  store.leave(randomRoom.id, users.X.id);
  let drawRoom = playing();
  drawRoom = saveFixture(
    drawRoom,
    fixture(
      [
        ["red", "rat", "a1"],
        ["blue", "rat", "g9"],
      ],
      { noCapturePly: 99 },
    ),
  );
  drawRoom = store.move(
    drawRoom.id,
    users.X.id,
    { from: ix("a1"), to: ix("a2") },
    drawRoom.version,
  );
  assert.equal(drawRoom.reason, "draw");
  assert.equal(drawRoom.endReason, "no_capture_limit");
  assert.equal(drawRoom.noCapturePly, 100);
  let r = playing({ first: "guest", timeMinutes: 1 });
  assert.equal(r.turn, "O");
  assert.deepEqual(r.sideBySeat, { X: "blue", O: "red" });
  assert.equal(store.snapshot(r, users.O.id).legalMoves.length, 24);
  const unchanged = JSON.stringify(r);
  let emitted = 0;
  store.events.on(r.id, () => emitted++);
  code(
    () => store.move(r.id, users.X.id, { from: 42, to: 35 }, r.version),
    "NOT_TURN",
  );
  code(
    () => store.move(r.id, "viewer", { from: 42, to: 35 }, r.version),
    "NOT_PLAYER",
  );
  code(
    () => store.move(r.id, users.O.id, { from: 42, to: 34 }, r.version),
    "INVALID_MOVE",
  );
  assert.equal(JSON.stringify(store.get(r.id)), unchanged);
  assert.equal(emitted, 0);
  now += 1500;
  const version = r.version;
  r = store.move(
    r.id,
    users.O.id,
    { from: 42, to: 35, side: "blue", userId: users.X.id },
    version,
  );
  assert.equal(r.clocks.O, 58500);
  assert.equal(r.ply, 1);
  assert.equal(r.history[0].side, "red");
  code(
    () => store.move(r.id, users.O.id, { from: 42, to: 35 }, version),
    "STALE_BOARD",
  );
  const beforeRollback = JSON.stringify(r);
  db.exec(
    "CREATE TRIGGER cothu_abort BEFORE UPDATE ON cothu_rooms BEGIN SELECT RAISE(ABORT,'rollback fixture'); END",
  );
  const move = store.snapshot(r, users.X.id).legalMoves[0];
  assert.throws(() => store.move(r.id, users.X.id, move, r.version));
  db.exec("DROP TRIGGER cothu_abort");
  assert.equal(JSON.stringify(store.get(r.id)), beforeRollback);
  assert.equal(emitted, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cothu-restore-"));
  try {
    const file = path.join(dir, "game.sqlite");
    await db.backup(file);
    const Database = require("better-sqlite3"),
      copy = new Database(file);
    try {
      const restored = createStore(copy, () => now);
      assert.deepEqual(restored.get(r.id), r);
    } finally {
      copy.close();
    }
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith("cothu-restore-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  now += 60000;
  code(() => store.move(r.id, users.X.id, move, r.version), "ROOM_CLOSED");
  assert.equal(store.get(r.id).endReason, "timeout");
  assert.equal(store.get(r.id).winner, "O");
  assert.equal(store.get(r.id).history.length, 1);
  r = create();
  now += WAIT_MS;
  assert.equal(store.get(r.id).status, "expired");
  r = create();
  assert.equal(store.leave(r.id, users.X.id).status, "cancelled");
  r = playing();
  r = saveFixture(
    r,
    fixture([
      ["red", "rat", "d8"],
      ["blue", "elephant", "a9"],
    ]),
  );
  r = store.move(r.id, users.X.id, { from: ix("d8"), to: ix("d9") }, r.version);
  assert.equal(r.endReason, "den");
  assert.equal(r.winner, "X");
  assert.equal(store.snapshot(r, null).history.length, 1);
  code(() => store.move(r.id, users.X.id, {}, r.version), "ROOM_CLOSED");
  assert.equal(
    db.prepare("SELECT count(*) n FROM cothu_seats WHERE room_id=?").get(r.id)
      .n,
    0,
  );
  r = playing();
  r = store.leave(r.id, users.X.id);
  assert.equal(r.winner, "O");
  const rooms = [];
  for (let i = 0; i < 5; i++)
    rooms.push(
      store.create({
        guildId: "limits",
        channelId: "c",
        user: { id: "host-" + i },
      }),
    );
  code(
    () =>
      store.create({
        guildId: "limits",
        channelId: "c",
        user: { id: "sixth" },
      }),
    "CHANNEL_FULL",
  );
  code(
    () =>
      store.create({
        guildId: "limits",
        channelId: "other",
        user: { id: "host-0" },
      }),
    "ALREADY_PLAYING",
  );
  store.setChannelLimit("limits", "c", 1, "admin");
  assert.equal(store.listOpen("limits", "c").length, 5);
  // HTTP + three simultaneous streams: auth, origin, stale version and public DTO.
  const { createWebServer } = require("../src/webGames/http"),
    { createGame } = require("../src/cothu/webGame");
  r = playing({ first: "guest" });
  const config = { origin: "", secure: false };
  web = createWebServer({
    games: [createGame({ store, db })],
    config,
    now: () => now,
  });
  await new Promise((done) => web.server.listen(0, "127.0.0.1", done));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  async function request(route, data, cookie, origin = config.origin) {
    const response = await fetch(config.origin + "/api/games/cothu/" + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { Origin: origin, "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const cookies = [];
  for (const user of Object.values(users)) {
    const ticket = new URL(web.issueTicket("cothu", r.id, user.id)).hash.slice(
      8,
    );
    cookies.push((await request("login", { ticket })).cookie);
  }
  cookies.push(null);
  const aborters = cookies.map(() => new AbortController()),
    readers = await Promise.all(
      cookies.map(async (cookie, i) => {
        const response = await fetch(
          config.origin + "/api/games/cothu/events?room=" + r.id,
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
    const data = { roomId: r.id, version: r.version, from: 42, to: 35 };
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
    (await fetch(config.origin + "/cothu/room/" + r.id)).status,
    200,
  );
  // Discord lifecycle, current-message edits, replay creates a fresh room, prefix.
  const command = require("../src/commands/cothu"),
    runtime = require("../src/cothu/runtime"),
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
      customId: `cothu:join:${room.id}`,
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
      customId: `cothu:rematch:${room.id}`,
    });
    assert.equal(JSON.stringify(runtime.store.get(room.id)), old);
    assert.notEqual(runtime.store.listOpen("discord", "c")[0].id, room.id);
    process.env.COMMAND_PREFIX = "!";
    await require("../src/services/slashPrefixService").handleSlashPrefix({
      guildId: "prefix-cothu",
      channelId: "c",
      author: users.X,
      content: "!cothu choi nguoitruoc=guest thoigian=12",
      channel: {},
      reply: async (p) => ({ id: "prefix" }),
    });
    assert.equal(
      runtime.store.listOpen("prefix-cothu", "c")[0].sideBySeat.O,
      "red",
    );
  } finally {
    runtime.isAvailable = available;
  }
  store.sweep();
  const health = require("../src/services/operationalHealthService"),
    baseline = health.getOperationalHealth().active.sessions;
  r = create({}, "health-cothu");
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(r.id, users.X.id);
  r = create({}, "reset-cothu");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset-cothu",
  });
  assert.equal(store.get(r.id), null);
  console.log(
    JSON.stringify({
      ok: true,
      cothu: `${audited} independent-oracle positions; full rule exceptions, draw/priority, rollback, seat colors, deadlines/restart/history, HTTP/three SSE, Discord/rematch/prefix, health/reset`,
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
