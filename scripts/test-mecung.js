"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  { createStore, WAIT_MS } = require("../src/mecung/store");
const { PRESETS, SETUP_MS, normalizeRules } = require("../src/mecung/rules");
const {
  wallCount,
  describeWall,
  wallBetween,
  destination,
  hasPath,
  designError,
  randomDesign,
} = require("../src/mecung/engine");
const { createGame } = require("../src/mecung/webGame"),
  { createWebServer } = require("../src/webGames/http");
const { roomPayload, roomsPayload } = require("../src/mecung/discord");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now),
  users = {
    X: { id: "alice", username: "Nguyễn An" },
    O: { id: "bob", username: "Trần Bình" },
  };
const create = (rules = {}, guildId = "maze-" + ++serial) =>
  store.create({ guildId, channelId: "channel", user: users.X, rules });
const setup = (rules = {}) => store.join(create(rules).id, users.O);
const draft = (room, mark, data) =>
  store.design(room.id, users[mark].id, data, room.setupRevision[mark]);
const lock = (room, mark) =>
  store.ready(room.id, users[mark].id, room.setupRevision[mark]);
const move = (room, direction) =>
  store.move(room.id, users[room.turn].id, direction, room.version);
const code = (fn, expected) => assert.throws(fn, (e) => e.code === expected);
const playing = (
  rules = {},
  a = { start: 0, goal: 2, walls: [] },
  b = { start: 0, goal: 2, walls: [] },
) => {
  let room = setup(rules);
  room = draft(room, "X", a);
  room = draft(room, "O", b);
  room = lock(room, "X");
  return lock(room, "O");
};
function independentPath(size, start, goal, walls) {
  const blocked = new Set(
      walls.flatMap((id) => {
        const e = describeWall(size, id);
        return [e.a + ":" + e.b, e.b + ":" + e.a];
      }),
    ),
    seen = new Set([start]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    if (queue[i] === goal) return true;
    const r = Math.floor(queue[i] / size),
      c = queue[i] % size;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const rr = r + dr,
        cc = c + dc,
        next = rr * size + cc;
      if (
        rr < 0 ||
        rr >= size ||
        cc < 0 ||
        cc >= size ||
        seen.has(next) ||
        blocked.has(queue[i] + ":" + next)
      )
        continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}
async function main() {
  assert.deepEqual(normalizeRules(), {
    mode: "medium",
    winCondition: "race",
    wallLimit: 30,
    timeMinutes: 30,
  });
  for (const rules of [
    { mode: "huge" },
    { winCondition: "steps" },
    { wallLimit: -1 },
    { wallLimit: 61 },
    { wallLimit: "30" },
    { timeMinutes: 0 },
    { timeMinutes: 181 },
  ])
    code(() => normalizeRules(rules), "INVALID_RULES");
  assert(require("../src/mecung/rules").RULES_TEXT.length < 2000);
  for (const size of Object.values(PRESETS)) {
    const ids = new Set();
    for (let a = 0; a < size * size; a++)
      for (const dir of ["up", "down", "left", "right"]) {
        const b = destination(size, a, dir);
        if (b === null) continue;
        const id = wallBetween(size, a, b),
          edge = describeWall(size, id);
        ids.add(id);
        assert([edge.a, edge.b].includes(a) && [edge.a, edge.b].includes(b));
        assert.equal(wallBetween(size, b, a), id);
      }
    assert.equal(ids.size, wallCount(size));
    assert.equal(wallBetween(size, size - 1, size), null);
    assert.equal(destination(size, 0, "up"), null);
    assert.equal(destination(size, 0, "left"), null);
    assert.equal(describeWall(size, -1), null);
    for (let i = 0; i < 15; i++) {
      const design = randomDesign(size, 0, size * size - 1, 60);
      assert.equal(designError(size, design, 60), null);
      assert.equal(
        independentPath(size, 0, size * size - 1, design.walls),
        true,
      );
      assert.equal(new Set(design.walls).size, design.walls.length);
    }
    const closed = Array.from({ length: size }, (_, i) => i);
    assert.equal(hasPath(size, 0, size * size - 1, closed), false);
    assert.equal(
      designError(size, { start: 0, goal: size * size - 1, walls: closed }, 60),
      "NO_PATH",
    );
  }
  for (const design of [
    null,
    {},
    { start: 0, goal: 0, walls: [] },
    { start: -1, goal: 5, walls: [] },
  ])
    assert.equal(designError(9, design, 30), "INVALID_POINTS");
  for (const walls of [
    [0, 0],
    [-1],
    [wallCount(9)],
    "bad",
    Array.from({ length: 31 }, (_, i) => i),
  ])
    assert.equal(
      designError(9, { start: 0, goal: 80, walls }, 30),
      "INVALID_WALLS",
    );
  let room = create();
  code(() => store.join(room.id, users.X), "SELF_JOIN");
  code(() => move(room, "right"), "NOT_STARTED");
  code(
    () =>
      store.create({
        guildId: room.guildId,
        channelId: "other",
        user: users.X,
      }),
    "ALREADY_PLAYING",
  );
  room = store.join(room.id, users.O);
  const old = room.version;
  room = draft(room, "X", { start: 5, goal: 7, walls: [0] });
  // Each builder's revision is independent of simultaneous updates from the opponent.
  room = store.design(
    room.id,
    users.O.id,
    { start: 10, goal: 12, walls: [1] },
    0,
  );
  assert(room.version > old);
  assert.equal(store.snapshot(room, users.X.id).design.start, 5);
  assert.equal(store.snapshot(room, users.X.id).boards.X.start, null);
  assert.equal(store.snapshot(room).design, null);
  assert.equal(store.snapshot(room).boards.O.goal, null);
  code(
    () =>
      store.design(room.id, users.X.id, { start: 0, goal: 80, walls: [] }, 0),
    "STALE_BOARD",
  );
  const saved = JSON.stringify(store.get(room.id));
  code(
    () =>
      draft(room, "X", {
        start: 0,
        goal: 80,
        walls: [0, wallBetween(9, 0, 1)],
      }),
    "NO_PATH",
  );
  assert.equal(JSON.stringify(store.get(room.id)), saved);
  room = lock(room, "X");
  code(
    () => draft(room, "X", { start: 0, goal: 1, walls: [] }),
    "ALREADY_READY",
  );
  room = lock(room, "O");
  assert.deepEqual(room.positions, { X: 10, O: 5 });
  assert.deepEqual(room.turns, { X: 1, O: 0 });
  code(
    () => store.move(room.id, "outsider", "right", room.version),
    "NOT_PLAYER",
  );
  code(
    () => store.move(room.id, users.O.id, "right", room.version),
    "NOT_TURN",
  );
  code(
    () => store.move(room.id, users.X.id, "right", room.version - 1),
    "STALE_BOARD",
  );
  code(() => move(room, "diagonal"), "INVALID_DIRECTION");
  store.leave(room.id, users.X.id);

  const vertical = wallBetween(9, 0, 1),
    horizontal = wallBetween(9, 0, 9);
  room = playing(
    { timeMinutes: 1 },
    { start: 0, goal: 2, walls: [horizontal] },
    { start: 0, goal: 2, walls: [vertical, 40] },
  );
  code(() => move(room, "up"), "OUTSIDE");
  const initial = room.version;
  clock += 1000;
  room = move(room, "right");
  assert.equal(room.positions.X, 0);
  assert.equal(room.turn, "O");
  assert.deepEqual(room.visited.X, [0]);
  assert.deepEqual(room.revealed.X, [vertical]);
  assert.equal(room.clocks.X, 59000);
  const seen = store.snapshot(room);
  assert.equal(seen.design, null);
  assert.deepEqual(seen.boards.X.revealedWalls, [vertical]);
  assert(!seen.boards.X.revealedWalls.includes(40));
  assert.equal(seen.mapsRevealed, false);
  const markBefore = room.turns.O;
  clock += 2000;
  room = move(room, "right");
  assert.equal(room.turn, "O");
  assert.equal(room.turns.O, markBefore);
  assert.equal(room.clocks.O, 58000);
  assert.equal(room.positions.O, 1);
  room = move(room, "down");
  room = move(room, "up");
  room = move(room, "left");
  assert.deepEqual(room.visited.O, [0, 1, 10]);
  room = move(room, "down");
  assert.equal(room.turn, "X");
  assert.deepEqual(room.turns, { X: 2, O: 1 });
  room = move(room, "right");
  assert.deepEqual(room.revealed.X, [vertical]);
  assert.equal(room.turn, "O");
  room = move(room, "right");
  room = move(room, "right");
  assert.equal(room.winner, "O");
  assert.equal(room.reason, "win");
  assert.equal(room.moves, 9);
  assert(room.version > initial);
  for (const userId of [users.X.id, users.O.id, null]) {
    const result = store.snapshot(room, userId);
    assert.equal(result.mapsRevealed, true);
    assert.deepEqual(
      new Set(result.boards.X.revealedWalls),
      new Set([vertical, 40]),
    );
    assert.deepEqual(result.boards.O.revealedWalls, [horizontal]);
  }
  assert.deepEqual(
    room.revealed.X,
    [vertical],
    "revealing the result preserves exploration history",
  );
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM mecung_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );

  const simple = { start: 0, goal: 1, walls: [] };
  room = playing({}, simple, simple);
  room = move(room, "right");
  assert.equal(room.status, "finished");
  assert.equal(room.winner, "X");
  assert.equal(room.turns.O, 0);
  room = playing({ winCondition: "turns" }, simple, simple);
  room = move(room, "right");
  assert.equal(room.status, "playing");
  assert.equal(room.turn, "O");
  assert.equal(room.finishedTurns.X, 1);
  assert.equal(
    store.snapshot(room).mapsRevealed,
    false,
    "catch-up is still a live match",
  );
  room = move(room, "right");
  assert.equal(room.reason, "draw");
  assert.equal(room.winner, null);
  assert.equal(
    store.snapshot(room).mapsRevealed,
    false,
    "a draw has no winner",
  );
  room = playing(
    { winCondition: "turns" },
    { ...simple, walls: [vertical] },
    simple,
  );
  room = move(room, "right");
  room = move(room, "right");
  assert.equal(room.winner, "X", "Failed catch-up turn loses immediately");
  room = playing({ winCondition: "turns" }, simple, {
    ...simple,
    walls: [vertical],
  });
  room = move(room, "right");
  room = move(room, "right");
  assert.equal(
    room.winner,
    "O",
    "Second player finishes with fewer completed turns",
  );
  room = playing(
    { winCondition: "turns" },
    { ...simple, walls: [horizontal] },
    { ...simple, walls: [vertical] },
  );
  for (const d of ["right", "down", "down", "right", "up"]) {
    room = move(room, d);
  }
  assert.equal(room.finishedTurns.X, 2);
  assert.equal(room.turn, "O");
  room = move(room, "right");
  assert.equal(room.reason, "draw");
  room = playing({ winCondition: "turns", timeMinutes: 1 }, simple, simple);
  clock += 500;
  room = move(room, "right");
  clock += 60000;
  code(() => move(room, "right"), "ROOM_CLOSED");
  assert.equal(store.get(room.id).winner, "X");
  assert.equal(store.snapshot(store.get(room.id)).mapsRevealed, true);
  room = setup();
  room = lock(room, "X");
  clock += SETUP_MS;
  code(() => lock(room, "O"), "NOT_SETUP");
  assert.equal(store.get(room.id).reason, "setup_timeout");
  assert.equal(store.get(room.id).winner, "X");
  room = setup();
  clock += SETUP_MS;
  store.sweep();
  assert.equal(store.get(room.id).reason, "setup_expired");
  assert.equal(store.snapshot(store.get(room.id)).mapsRevealed, false);
  room = create();
  clock += WAIT_MS;
  store.sweep();
  assert.equal(store.get(room.id).reason, "expired");
  room = playing();
  clock += 1000;
  room = move(room, "right");
  const reopened = new Database(db.serialize());
  assert.deepEqual(createStore(reopened, now).get(room.id), room);
  reopened.close();
  const v = room.version;
  room = store.updatePlayer(room.id, { ...users.X, globalName: "An mới" });
  assert(room.version > v);
  assert.equal(
    store.updatePlayer(room.id, { ...users.X, globalName: "An mới" }).version,
    room.version,
  );
  store.leave(room.id, users.X.id);
  const limited = create({}, "limited");
  store.setChannelLimit("limited", "channel", 1, "admin");
  code(
    () =>
      store.create({
        guildId: "limited",
        channelId: "channel",
        user: { id: "new" },
      }),
    "CHANNEL_FULL",
  );
  code(
    () => store.setChannelLimit("g", "c", 21, "admin"),
    "INVALID_ROOM_LIMIT",
  );
  const listing = roomsPayload(
    Array.from({ length: 6 }, () => limited),
    {
      ownerId: users.X.id,
      page: 1,
      limit: 10,
      guildId: "limited",
      channelId: "channel",
      roomUrl: (id) => "https://example.test/mecung/room/" + id,
    },
  );
  assert.match(listing.embeds[0].toJSON().footer.text, /Trang 2\/2/);

  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store, db })], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  async function request(route, data, cookie, origin = config.origin) {
    const response = await fetch(config.origin + "/api/games/mecung/" + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
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
  room = setup();
  assert.equal(
    (await request("design", { roomId: room.id, design: simple, revision: 0 }))
      .status,
    401,
  );
  const challenge = await request("pair", { roomId: room.id });
  assert.throws(
    () =>
      web.confirmPairing("mecung", room.id, "outsider", challenge.data.code),
    (e) => e.httpStatus === 403,
  );
  web.confirmPairing("mecung", room.id, users.X.id, challenge.data.code);
  const a = (
    await request("pair/status", {
      roomId: room.id,
      pairingToken: challenge.data.pairingToken,
    })
  ).cookie;
  const ticket = new URL(
      web.issueTicket("mecung", room.id, users.O.id),
    ).hash.slice(8),
    b = (await request("login", { ticket })).cookie;
  assert.equal(
    (
      await request(
        "design",
        { roomId: room.id, design: simple, revision: 0 },
        a,
        "https://evil.test",
      )
    ).status,
    403,
  );
  const controllers = [
    new AbortController(),
    new AbortController(),
    new AbortController(),
  ];
  const readers = await Promise.all(
    [a, b, null].map(async (cookie, i) => {
      const res = await fetch(
        config.origin + "/api/games/mecung/events?room=" + room.id,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: controllers[i].signal,
        },
      );
      const reader = res.body.getReader();
      await reader.read();
      return reader;
    }),
  );
  let next = readers.map((r) => r.read());
  const designed = await request(
    "design",
    {
      roomId: room.id,
      design: { start: 1, goal: 8, walls: [12, 13] },
      revision: 0,
    },
    a,
  );
  assert.equal(designed.status, 200);
  const projections = (await Promise.all(next)).map((e) =>
    JSON.parse(new TextDecoder().decode(e.value).split("data: ")[1].trim()),
  );
  assert.deepEqual(projections[0].design.walls, [12, 13]);
  assert.deepEqual(projections[1].design.walls, []);
  assert.equal(projections[2].design, null);
  assert.equal(projections[2].boards.O.start, null);
  await request(
    "design",
    {
      roomId: room.id,
      design: { ...simple, walls: [vertical, 40] },
      revision: 0,
    },
    b,
  );
  await request("ready", { roomId: room.id, revision: 1 }, a);
  await request("ready", { roomId: room.id, revision: 1 }, b);
  room = store.get(room.id);
  const moved = await request(
    "move",
    {
      roomId: room.id,
      direction: "right",
      version: room.version,
      userId: users.O.id,
    },
    a,
  );
  assert.equal(moved.status, 200);
  assert.equal(moved.data.me, "X");
  assert.equal(moved.data.turn, "O");
  const viewer = (await request("state?room=" + room.id)).data;
  assert.equal(viewer.design, null);
  assert.deepEqual(viewer.boards.X.revealedWalls, [vertical]);
  assert.equal(
    (
      await request(
        "move",
        { roomId: room.id, direction: "right", version: room.version },
        a,
      )
    ).status,
    409,
  );
  controllers.forEach((c) => c.abort());
  for (const reader of readers) await reader.cancel().catch(() => {});
  assert.equal(
    (await fetch(config.origin + "/mecung/room/" + room.id)).status,
    200,
  );
  assert.match(await (await fetch(config.origin + "/")).text(), /Mê cung/);
  room = store.get(room.id);
  for (let i = 0; i < 140; i++) {
    const stepped = await request(
      "move",
      {
        roomId: room.id,
        direction: i % 2 ? "up" : "down",
        version: room.version,
      },
      b,
    );
    assert.equal(
      stepped.status,
      200,
      "Continuous movement has its own bounded request budget",
    );
    room = store.get(room.id);
    assert.equal(room.turn, "O");
  }
  const ended = store.leave(room.id, users.O.id);
  assert.equal(ended.winner, "X");
  const completedView = (await request("state?room=" + room.id)).data;
  assert.equal(completedView.mapsRevealed, true);
  assert.deepEqual(completedView.boards.X.revealedWalls, ended.designs.O.walls);
  assert.deepEqual(completedView.boards.O.revealedWalls, ended.designs.X.walls);

  const command = require("../src/commands/mecung"),
    runtime = require("../src/mecung/runtime"),
    available = runtime.isAvailable,
    replies = [];
  runtime.isAvailable = () => true;
  try {
    const schema = command.data.toJSON();
    assert.deepEqual(
      schema.options[0].options.map((o) => o.name),
      ["luat", "kichthuoc", "sotuong", "thoigian"],
    );
    const interaction = {
      guildId: "discord",
      channelId: "channel",
      user: users.X,
      options: {
        getSubcommand: () => "choi",
        getInteger: () => null,
        getString: (name) => (name === "luat" ? "turns" : null),
      },
      deferReply: async () => {},
      editReply: async (p) => {
        replies.push(p);
        return { id: "lobby" };
      },
    };
    await command.execute(interaction);
    let lobby = runtime.store.listOpen("discord", "channel")[0];
    assert.equal(lobby.rules.winCondition, "turns");
    const button = {
      ...interaction,
      user: users.O,
      message: { id: "lobby" },
      customId: "mecung:join:" + lobby.id,
      deferUpdate: async () => {},
      followUp: async (p) => replies.push(p),
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    };
    assert.equal(
      await require("../src/componentRouter").routeComponentInteraction(button),
      true,
    );
    const client = {
      channels: {
        fetch: () => {
          throw Error("Use bound interaction");
        },
      },
    };
    await runtime.syncMessages(client);
    assert.match(replies.at(-1).embeds[0].toJSON().title, /DỰNG MÊ CUNG/);
    lobby = runtime.store.get(lobby.id);
    lobby = runtime.store.ready(lobby.id, users.X.id, 0);
    lobby = runtime.store.ready(lobby.id, users.O.id, 0);
    await runtime.syncMessages(client);
    assert.match(replies.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    runtime.store.leave(lobby.id, users.O.id);
    await runtime.syncMessages(client);
    assert.match(
      replies.at(-1).embeds[0].toJSON().description,
      /Nguyễn An thắng/,
    );
    await command.handleButton({ ...button, guildId: "wrong" });
    assert.match(replies.at(-1).content, /không thuộc/);
    await command.execute({
      ...interaction,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "cauhinh" },
      reply: async (p) => replies.push(p),
    });
    assert.match(replies.at(-1).content, /Chỉ quản trị/);
    const prefix = process.env.COMMAND_PREFIX;
    process.env.COMMAND_PREFIX = "!";
    try {
      await require("../src/services/slashPrefixService").handleSlashPrefix({
        guildId: "prefix-maze",
        channelId: "channel",
        author: users.X,
        content:
          "!mecung choi luat=turns kichthuoc=small sotuong=20 thoigian=10",
        channel: {},
        reply: async (p) => {
          replies.push(p);
          return { id: "prefix-lobby" };
        },
      });
      assert.deepEqual(
        runtime.store.listOpen("prefix-maze", "channel")[0].rules,
        {
          mode: "small",
          winCondition: "turns",
          wallLimit: 20,
          timeMinutes: 10,
        },
      );
    } finally {
      if (prefix === undefined) delete process.env.COMMAND_PREFIX;
      else process.env.COMMAND_PREFIX = prefix;
    }
  } finally {
    runtime.isAvailable = available;
  }
  assert(
    require("../src/commandRegistry")
      .loadCommands()
      .some((c) => c.data.toJSON().name === "mecung"),
  );
  assert(require("../src/commands/luat").RULES.mecung);
  store.sweep();
  const health = require("../src/services/operationalHealthService"),
    before = health.getOperationalHealth().active.sessions;
  room = create({}, "health-maze");
  assert.equal(health.getOperationalHealth().active.sessions, before + 1);
  store.leave(room.id, users.X.id);
  room = create({}, "reset-maze");
  store.setChannelLimit("reset-maze", "channel", 7, "admin");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "reset-maze",
  });
  assert.equal(store.get(room.id), null);
  assert.equal(store.getChannelLimit("reset-maze", "channel"), 7);
  console.log(
    JSON.stringify({
      ok: true,
      mecung:
        "edge geometry, connected designs, hidden projections, independent revisions, continued moves, bump/turn, exploration, both win rules and balanced ties, clocks, expiry, restart, HTTP/SSE, pairing, Discord/prefix, health/reset",
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
