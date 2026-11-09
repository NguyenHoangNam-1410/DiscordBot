"use strict";
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  E = require("../src/oanquan/engine"),
  R = require("../src/oanquan/rules"),
  { createStore, WAIT_MS } = require("../src/oanquan/store");
let now = 1800000000000,
  serial = 0,
  web;
const store = createStore(db, () => now),
  users = {
    X: { id: "100000000000000001", username: "Nguyễn An" },
    O: { id: "100000000000000002", username: "Trần Bình" },
  };
const create = (rules = {}, guild = "g" + serial++) =>
  store.create({ guildId: guild, channelId: "c", user: users.X, rules });
const playing = (rules = {}) => store.join(create(rules).id, users.O);
const code = (fn, c) => assert.throws(fn, (e) => e.code === c, c);
function sparse(values, extras = {}) {
  const s = E.createState();
  s.pits.forEach((p) => (p.dan = 0));
  for (const [i, n] of Object.entries(values)) s.pits[i].dan = n;
  const left = 50 - s.pits.reduce((n, p) => n + p.dan, 0);
  s.captured.X.dan = left;
  Object.assign(s, extras);
  return s;
}
function totals(s) {
  return {
    dan:
      s.pits.reduce((n, p) => n + p.dan, 0) +
      s.captured.X.dan +
      s.captured.O.dan,
    quan:
      s.pits.reduce((n, p) => n + p.quan, 0) +
      s.captured.X.quan +
      s.captured.O.quan,
  };
}
function conserved(s) {
  assert.deepEqual(totals(s), { dan: 50, quan: 2 });
  for (const p of [...s.pits, s.captured.X, s.captured.O]) {
    assert(Number.isInteger(p.dan) && p.dan >= 0);
    assert(Number.isInteger(p.quan) && p.quan >= 0);
  }
  assert.equal(
    E.scores(s).X + E.scores(s).O,
    s.captured.X.dan +
      s.captured.O.dan +
      10 * (s.captured.X.quan + s.captured.O.quan),
  );
}
function rotated(s) {
  const n = structuredClone(s);
  n.pits = s.pits.slice(6).concat(s.pits.slice(0, 6));
  n.captured = { X: s.captured.O, O: s.captured.X };
  n.debt = { X: s.debt.O, O: s.debt.X };
  n.turn = s.turn === "X" ? "O" : "X";
  n.repetitions = {};
  return n;
}
async function main() {
  assert.deepEqual(totals(E.createState()), { dan: 50, quan: 2 });
  assert.equal(R.normalizeRules().allowYoungQuan, true);
  code(() => R.normalizeRules({ timeMinutes: 0 }), "INVALID_RULES");
  code(() => R.normalizeRules({ first: "bad" }), "INVALID_RULES");
  let s = E.createState();
  const original = JSON.stringify(s),
    r = E.applyMove(s, { pit: 1, direction: -1 });
  assert.equal(JSON.stringify(s), original);
  assert.deepEqual(
    r.state.pits.map((p) => p.dan),
    [0, 0, 6, 6, 6, 6, 1, 0, 6, 6, 6, 6],
  );
  assert.equal(r.state.captured.X.quan, 1);
  assert.equal(r.state.captured.X.dan, 1);
  assert.equal(r.move.steps.filter((s) => s.type === "sow").length, 10);
  assert.equal(r.move.steps.filter((s) => s.type === "pickup").length, 2);
  assert.equal(r.move.steps.find((s) => s.type === "capture").gap, 1);
  assert.equal(E.scores(r.state).X, 11);
  assert.equal(r.state.turn, "O");
  conserved(r.state);
  assert.equal(E.moveError(s, "O", 7, 1), "NOT_TURN");
  assert.equal(E.moveError(s, "X", 6, 1), "NOT_OWN_PIT");
  assert.equal(E.moveError(s, "X", 1, 0), "INVALID_DIRECTION");
  assert.equal(E.moveError(s, "X", 1, "1"), "INVALID_DIRECTION");
  assert.equal(E.moveError(s, "X", "1", 1), "NOT_OWN_PIT");
  s = sparse({ 1: 1, 4: 3, 7: 2 });
  let result = E.applyMove(s, { pit: 1, direction: 1 });
  assert.deepEqual(
    result.move.steps.filter((s) => s.type === "capture").map((s) => s.pit),
    [4, 6],
  );
  assert.equal(result.state.captured.X.quan, 1);
  conserved(result.state);
  result = E.applyMove(s, { pit: 1, direction: 1 }, { allowYoungQuan: false });
  assert.deepEqual(
    result.move.steps.filter((s) => s.type === "capture").map((s) => s.pit),
    [4],
  );
  assert.equal(result.move.stopReason, "young_quan");
  s = sparse({ 4: 1, 7: 2 });
  result = E.applyMove(s, { pit: 4, direction: 1 });
  assert.equal(result.move.stopReason, "quan");
  assert.equal(result.move.steps.filter((s) => s.type === "pickup").length, 1);
  s = sparse({ 1: 1, 7: 2 });
  result = E.applyMove(s, { pit: 1, direction: 1 });
  assert.equal(result.move.stopReason, "double_empty");
  assert.equal(result.move.steps.filter((s) => s.type === "capture").length, 0);
  s = sparse({ 4: 1 });
  s.captured.O.dan = 2;
  s.captured.X.dan -= 2;
  result = E.applyMove(s, { pit: 4, direction: 1 });
  assert.equal(result.state.debt.O, 3);
  assert.deepEqual(
    R.ROWS.O.map((i) => result.state.pits[i].dan),
    [1, 1, 1, 1, 1],
  );
  assert.equal(result.state.captured.O.dan, 0);
  assert.equal(result.state.captured.X.dan, s.captured.X.dan - 3);
  conserved(result.state);
  s = sparse({ 3: 1, 1: 4, 7: 5, 0: 2 });
  s.pits[0].quan = 0;
  s.captured.O.quan = 1;
  result = E.applyMove(s, { pit: 3, direction: 1 });
  assert.equal(result.reason, "all_quan");
  assert(result.state.pits.every((p) => p.dan === 0 && p.quan === 0));
  assert.equal(E.scores(result.state).X + E.scores(result.state).O, 70);
  assert.equal(result.state.captured.X.dan, 45);
  conserved(result.state);
  s = sparse({ 4: 1, 0: 49 });
  result = E.applyMove(s, { pit: 4, direction: 1 });
  assert.equal(result.reason, "no_supply");
  assert.equal(E.scores(result.state).X + E.scores(result.state).O, 70);
  conserved(result.state);
  let seed = 17,
    audited = 0,
    maxSteps = 0;
  const rng = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let g = 0; g < 150; g++) {
    s = E.createState(g % 2 ? "X" : "O");
    for (let turn = 0; turn < 500; turn++) {
      const options = E.legalMoves(s);
      assert(options.length > 0);
      const m = options[rng(options.length)],
        mirror = rotated(s),
        a = E.applyMove(s, m),
        b = E.applyMove(mirror, {
          pit: (m.pit + 6) % 12,
          direction: m.direction,
        });
      conserved(a.state);
      assert(a.move.duration > 0);
      for (let i = 0; i < a.move.steps.length; i++) {
        const step = a.move.steps[i],
          span = (a.move.steps[i + 1]?.offset ?? a.move.duration) - step.offset;
        if (step.type === "sow" || step.type === "seed")
          assert.equal(
            span,
            1000,
            "Each stone gets a full second, even on long turns",
          );
      }
      for (let n = 1; n < a.move.steps.length; n++)
        assert(a.move.steps[n].offset >= a.move.steps[n - 1].offset);
      if (!a.reason && !b.reason) {
        assert.deepEqual(rotated(a.state).pits, b.state.pits);
        assert.deepEqual(rotated(a.state).captured, b.state.captured);
        assert.deepEqual(rotated(a.state).debt, b.state.debt);
      }
      maxSteps = Math.max(maxSteps, a.move.steps.length);
      audited++;
      s = a.state;
      if (a.reason) {
        assert.equal(E.scores(s).X + E.scores(s).O, 70);
        break;
      }
    }
  }
  // The player making the last capture may still lose, or draw, after collection and debt settlement.
  for (const [xBank, oBank, winner] of [
    [0, 38, "O"],
    [18, 20, null],
  ]) {
    let finalRoom = playing();
    const ending = sparse({ 3: 1, 1: 4, 7: 5, 0: 2 });
    ending.pits[0].quan = 0;
    ending.captured.O.quan = 1;
    ending.captured.X.dan = xBank;
    ending.captured.O.dan = oBank;
    Object.assign(finalRoom, ending);
    db.prepare("UPDATE oanquan_rooms SET data_json=? WHERE id=?").run(
      JSON.stringify(finalRoom),
      finalRoom.id,
    );
    finalRoom = store.move(
      finalRoom.id,
      users.X.id,
      { pit: 3, direction: 1 },
      finalRoom.version,
    );
    assert.equal(finalRoom.status, "finished");
    assert.equal(finalRoom.winner, winner);
    assert.equal(finalRoom.reason, winner ? "all_quan" : "draw");
    assert.equal(E.scores(finalRoom).X + E.scores(finalRoom).O, 70);
    assert.equal(store.snapshot(finalRoom, users.X.id).clockStartedAt, null);
  }
  // Real persistence/turn locks, animation timing, expiry and rollback.
  let room = playing({ timeMinutes: 1 });
  const pre = JSON.stringify(store.get(room.id));
  code(
    () =>
      store.move(room.id, "stranger", { pit: 1, direction: 1 }, room.version),
    "NOT_PLAYER",
  );
  code(
    () =>
      store.move(room.id, users.O.id, { pit: 7, direction: 1 }, room.version),
    "NOT_TURN",
  );
  code(
    () =>
      store.move(room.id, users.X.id, { pit: 1, direction: 3 }, room.version),
    "INVALID_DIRECTION",
  );
  assert.equal(JSON.stringify(store.get(room.id)), pre);
  now += 1000;
  room = store.move(
    room.id,
    users.X.id,
    { pit: 1, direction: -1 },
    room.version,
  );
  assert.equal(room.clocks.X, 59000);
  assert.equal(room.turn, "O");
  assert.equal(room.clockStartedAt, room.animationUntil);
  assert.equal(
    store.snapshot(room, users.O.id).clockStartedAt,
    room.animationUntil,
  );
  const after = JSON.stringify(room);
  code(
    () =>
      store.move(
        room.id,
        users.X.id,
        { pit: 1, direction: 1 },
        room.version - 1,
      ),
    "STALE_BOARD",
  );
  code(
    () =>
      store.move(room.id, users.O.id, { pit: 8, direction: 1 }, room.version),
    "ANIMATING",
  );
  assert.equal(JSON.stringify(store.get(room.id)), after);
  now = room.animationUntil - 1;
  assert.equal(store.snapshot(store.get(room.id), users.O.id).clocks.O, 60000);
  const reopened = createStore(db, () => now);
  assert.deepEqual(reopened.get(room.id), room);
  now = room.animationUntil + 1000;
  assert.equal(store.snapshot(store.get(room.id), users.O.id).clocks.O, 59000);
  now += 59000;
  room = store.get(room.id);
  assert.equal(room.endReason, "timeout");
  assert.equal(room.winner, "X");
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM oanquan_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );
  room = create();
  now += WAIT_MS;
  assert.equal(store.get(room.id).status, "expired");
  room = playing({ first: "guest" });
  assert.equal(room.turn, "O");
  store.leave(room.id, users.X.id);
  room = create({ first: "random" });
  assert.equal(reopened.get(room.id).first, room.first);
  store.leave(room.id, users.X.id);
  const limitRoom = create({}, "limit");
  code(() => create({}, "limit"), "ALREADY_PLAYING");
  store.setChannelLimit("limit", "c", 1, "admin");
  code(
    () =>
      store.create({ guildId: "limit", channelId: "c", user: { id: "new" } }),
    "CHANNEL_FULL",
  );
  store.leave(limitRoom.id, users.X.id);
  // Shared HTTP transport: both players and a spectator receive the same timed replay.
  room = playing();
  const config = { origin: "", secure: false };
  web = require("../src/webGames/http").createWebServer({
    games: [require("../src/oanquan/webGame").createGame({ store, db })],
    config,
    now: () => now,
  });
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  async function request(route, data, cookie, origin = config.origin) {
    const response = await fetch(
      config.origin + "/api/games/oanquan/" + route,
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
      web.issueTicket("oanquan", room.id, user.id),
    ).hash.slice(8);
    cookies.push((await request("login", { ticket })).cookie);
  }
  cookies.push(null);
  const aborters = cookies.map(() => new AbortController()),
    readers = await Promise.all(
      cookies.map(async (cookie, i) => {
        const response = await fetch(
          config.origin + "/api/games/oanquan/events?room=" + room.id,
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
    const move = {
      roomId: room.id,
      version: room.version,
      pit: 1,
      direction: -1,
    };
    assert.equal((await request("move", move)).status, 401);
    assert.equal(
      (await request("move", move, cookies[0], "https://wrong.example")).status,
      403,
    );
    assert.equal((await request("move", move, cookies[1])).status, 409);
    const notifications = readers.map((r) => r.read()),
      responses = await Promise.all([
        request("move", move, cookies[0]),
        request("move", move, cookies[0]),
      ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    for (const notice of await Promise.all(notifications)) {
      const body = new TextDecoder().decode(notice.value);
      assert.match(body, /"ply":1/);
      assert.match(body, /"steps":/);
    }
    const publicState = (await request("state?room=" + room.id)).data;
    assert.equal(publicState.me, null);
    assert.deepEqual(publicState.legalMoves, []);
    assert(!JSON.stringify(publicState).includes(users.X.id));
    assert.deepEqual(
      publicState.lastMove,
      responses.find((r) => r.status === 200).data.lastMove,
    );
    const outsider = store.create({
      guildId: "foreign-http",
      channelId: "c",
      user: { id: "foreign-host" },
    });
    assert.equal(
      (await request("move", { ...move, roomId: outsider.id }, cookies[0]))
        .status,
      403,
    );
  } finally {
    aborters.forEach((c) => c.abort());
    for (const r of readers) await r.cancel().catch(() => {});
  }
  assert.equal(
    (await fetch(config.origin + "/oanquan/room/" + room.id)).status,
    200,
  );
  // Real command/button/prefix routes without connecting to Discord.
  const command = require("../src/commands/oanquan"),
    runtime = require("../src/oanquan/runtime"),
    available = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    assert.deepEqual(
      command.data.toJSON().options.map((o) => o.name),
      ["choi", "phong", "cauhinh"],
    );
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
    let r = runtime.store.listOpen("discord", "c")[0];
    assert.equal(r.first, "O");
    assert.equal(r.rules.timeMinutes, 12);
    assert.equal(r.messageId, "lobby");
    const button = {
      ...interaction,
      user: users.O,
      message: { id: "lobby" },
      customId: "oanquan:join:" + r.id,
      deferUpdate: async () => {},
      followUp: async (p) => sent.push(p),
      isButton: () => true,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
    };
    await require("../src/componentRouter").routeComponentInteraction(button);
    assert.equal(runtime.store.get(r.id).turn, "O");
    await runtime.syncMessages({
      channels: {
        fetch: () => {
          throw Error("Use bound interaction");
        },
      },
    });
    assert.match(sent.at(-1).embeds[0].toJSON().description, /Lượt Bên cam/);
    r = runtime.store.leave(r.id, users.X.id);
    await command.handleButton({
      ...button,
      customId: "oanquan:rematch:" + r.id,
    });
    assert.notEqual(runtime.store.listOpen("discord", "c")[0].id, r.id);
    process.env.COMMAND_PREFIX = "!";
    await require("../src/services/slashPrefixService").handleSlashPrefix({
      guildId: "prefix-oanquan",
      channelId: "c",
      author: users.X,
      content: "!oanquan choi nguoitruoc=guest thoigian=12",
      channel: {},
      reply: async () => ({ id: "prefix" }),
    });
    assert.equal(runtime.store.listOpen("prefix-oanquan", "c")[0].turn, "O");
    assert(!require("../src/commands/luat").RULES.oanquan);
    assert(
      require("../src/commands/webgame")
        .payload("u", "oanquan")
        .embeds[0].toJSON()
        .title.includes("Ô ăn quan"),
    );
  } finally {
    runtime.isAvailable = available;
  }
  store.sweep();
  const health = require("../src/services/operationalHealthService"),
    baseline = health.getOperationalHealth().active.sessions;
  room = create({}, "health-oanquan");
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(room.id, users.X.id);
  room = create({}, "reset-oanquan");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset-oanquan",
  });
  assert.equal(store.get(room.id), null);
  console.log(
    JSON.stringify({
      ok: true,
      oanquan:
        "sowing/relay/chains/young quan, loans/debt/end scoring, " +
        audited +
        " conserved/symmetric turns, max " +
        maxSteps +
        " steps, replay clocks/restart/locks, HTTP/3 SSE/auth, Discord/rematch/prefix, health/reset",
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
