"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createStore, WAIT_MS } = require("../src/dots/store");
const { normalizeRules } = require("../src/dots/rules");
const {
  horizontal: h,
  vertical: v,
  edgeCount,
  describeEdge,
  boxEdges,
  claimEdge,
} = require("../src/dots/engine");
const { createGame } = require("../src/dots/webGame");
const { createGame: createCaroGame } = require("../src/caro/webGame");
const { createStore: createCaroStore } = require("../src/caro/store");
const { createWebServer } = require("../src/webGames/http");
const { roomPayload, roomsPayload } = require("../src/dots/discord");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now);
const users = {
  X: { id: "alice", username: "Alice <script>" },
  O: { id: "bob", username: "Bình" },
};
const create = (
  rules = {},
  guildId = `dots-${++serial}`,
  channelId = "channel",
) => store.create({ guildId, channelId, user: users.X, rules });
const match = (rules = {}) => store.join(create(rules).id, users.O);
const move = (room, edge) =>
  store.move(room.id, users[room.turn].id, edge, room.version);
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);

async function main() {
  assert.deepEqual(normalizeRules(), { size: 5, timeMinutes: 30 });
  for (const size of [0, 1, 2, 4, 6, 8, "5", 5.2, null])
    code(() => normalizeRules({ size }), "INVALID_RULES");
  for (const timeMinutes of [0, 181, "30"])
    code(() => normalizeRules({ timeMinutes }), "INVALID_RULES");
  for (const size of [3, 5, 7]) {
    const ids = new Set();
    for (let r = 0; r <= size; r++)
      for (let c = 0; c < size; c++) {
        const id = h(size, r, c);
        ids.add(id);
        assert.deepEqual(describeEdge(size, id), {
          orientation: "h",
          row: r,
          col: c,
        });
      }
    for (let r = 0; r < size; r++)
      for (let c = 0; c <= size; c++) {
        const id = v(size, r, c);
        ids.add(id);
        assert.deepEqual(describeEdge(size, id), {
          orientation: "v",
          row: r,
          col: c,
        });
      }
    assert.equal(ids.size, edgeCount(size));
    const board = {
      edges: Array(edgeCount(size)).fill(null),
      boxes: Array(size * size).fill(null),
    };
    // The common edge completes two neighboring squares exactly once, in either orientation.
    for (const edge of new Set([
      ...boxEdges(size, 0, 0),
      ...boxEdges(size, 0, 1),
    ]))
      if (edge !== v(size, 0, 1)) claimEdge(board, size, edge, "O");
    assert.deepEqual(claimEdge(board, size, v(size, 0, 1), "X"), [0, 1]);
    assert.equal(board.boxes[0], "X");
    assert.equal(board.boxes[1], "X");
    code(() => claimEdge(board, size, v(size, 0, 1), "O"), "OCCUPIED");
    const rotated = {
      edges: Array(edgeCount(size)).fill(null),
      boxes: Array(size * size).fill(null),
    };
    for (const edge of new Set([
      ...boxEdges(size, 0, 0),
      ...boxEdges(size, 1, 0),
    ]))
      if (edge !== h(size, 1, 0)) claimEdge(rotated, size, edge, "O");
    assert.deepEqual(claimEdge(rotated, size, h(size, 1, 0), "X"), [0, size]);
  }
  let room = create({ size: 3, timeMinutes: 1 });
  code(() => store.join(room.id, users.X), "SELF_JOIN");
  code(() => move(room, 0), "NOT_STARTED");
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
  code(() => store.join(room.id, { id: "third" }), "ROOM_FULL");
  code(() => store.move(room.id, "viewer", 0, room.version), "NOT_PLAYER");
  code(() => store.move(room.id, users.O.id, 0, room.version), "NOT_TURN");
  for (const edge of [-1, edgeCount(3), 0.2, "0", null, {}])
    code(() => move(room, edge), "INVALID_EDGE");
  const first = room;
  clock += 2000;
  room = move(room, h(3, 0, 0));
  assert.equal(room.turn, "O");
  assert.equal(room.clocks.X, 58000);
  assert.equal(room.clocks.O, 60000);
  code(() => store.move(room.id, users.X.id, 1, first.version), "STALE_BOARD");
  code(() => move(room, h(3, 0, 0)), "OCCUPIED");
  clock += 3000;
  room = move(room, v(3, 0, 0));
  clock += 4000;
  room = move(room, h(3, 1, 0));
  room = store.attachMessage(room.id, "score-lobby");
  const scoreAdapter = createGame({ store, db });
  assert.equal(scoreAdapter.discord.acknowledge(room), 1);
  const beforeBonus = room.clocks.O;
  clock += 5000;
  room = move(room, v(3, 0, 1));
  assert.equal(room.turn, "O", "closing an area retains the turn");
  assert.deepEqual(room.scores, { X: 0, O: 1 });
  assert.equal(room.boxes[0], "O");
  assert.ok(
    scoreAdapter.discord.pending().some(({ id }) => id === room.id),
    "scoring queues a Discord update even while the match remains open",
  );
  assert.equal(scoreAdapter.discord.acknowledge(room), 1);
  assert.equal(
    room.clocks.O,
    beforeBonus - 5000,
    "bonus turn does not recharge time",
  );
  clock += 6000;
  room = move(room, h(3, 0, 1));
  assert.equal(room.turn, "X");
  assert.equal(room.clocks.O, beforeBonus - 11000);
  assert.equal(room.moves, 5);
  const restarted = new Database(db.serialize());
  const restored = createStore(restarted, now).get(room.id);
  assert.deepEqual(restored.edges, room.edges);
  assert.deepEqual(restored.scores, room.scores);
  assert.equal(restored.turnDeadline, room.turnDeadline);
  restarted.close();

  // Play complete games in shuffled order: unique ownership, conservation of points and final locks.
  for (const size of [3, 5, 7]) {
    room = match({ size, timeMinutes: 180 });
    const edges = Array.from({ length: edgeCount(size) }, (_, i) => i);
    let seed = 42;
    for (let i = edges.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [edges[i], edges[j]] = [edges[j], edges[i]];
    }
    for (const edge of edges) {
      const previous = room,
        mark = room.turn;
      clock += 17;
      room = move(room, edge);
      const gained = room.scores[mark] - previous.scores[mark];
      assert.ok(gained >= 0 && gained <= 2);
      assert.equal(
        room.scores.X + room.scores.O,
        room.boxes.filter(Boolean).length,
      );
      assert.equal(room.edges.filter(Boolean).length, room.moves);
      if (room.status === "playing")
        assert.equal(room.turn, gained ? mark : mark === "X" ? "O" : "X");
      for (let box = 0; box < size * size; box++)
        if (room.boxes[box])
          assert.ok(
            boxEdges(size, Math.floor(box / size), box % size).every(
              (id) => room.edges[id],
            ),
          );
    }
    assert.equal(room.status, "finished");
    assert.equal(room.scores.X + room.scores.O, size * size);
    assert.equal(room.winner, room.scores.X > room.scores.O ? "X" : "O");
    assert.equal(room.clocks[room.turn] > 0, true);
    assert.equal(room.turnDeadline, null);
    assert.equal(
      db
        .prepare("SELECT count(*) n FROM dots_seats WHERE room_id=?")
        .get(room.id).n,
      0,
    );
    code(() => move(room, 0), "ROOM_CLOSED");
    const payload = roomPayload(
      room,
      "https://example.test/dots/room/" + room.id,
    );
    assert.match(payload.embeds[0].toJSON().title, /KẾT QUẢ/);
    assert.ok(
      payload.embeds[0].toJSON().description.includes(`${room.scores.X} ô`),
    );
  }
  room = match({ size: 3, timeMinutes: 1 });
  clock += 60000;
  code(() => move(room, 0), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "timeout");
  assert.equal(store.get(room.id).winner, "O");
  room = create();
  clock += WAIT_MS;
  code(() => store.join(room.id, users.O), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "expired");
  room = match();
  assert.equal(store.leave(room.id, users.O.id).winner, "X");
  const limited = create();
  store.setChannelLimit(limited.guildId, "channel", 1, "admin");
  code(
    () =>
      store.create({
        guildId: limited.guildId,
        channelId: "channel",
        user: { id: "new" },
      }),
    "CHANNEL_FULL",
  );
  store.setChannelLimit(limited.guildId, "channel", 2, "admin");
  assert.equal(store.getChannelLimit(limited.guildId, "channel"), 2);
  code(
    () => store.setChannelLimit("g", "c", 21, "admin"),
    "INVALID_ROOM_LIMIT",
  );
  const list = roomsPayload(store.listOpen(limited.guildId, "channel"), {
    ownerId: users.X.id,
    limit: 2,
    guildId: limited.guildId,
    channelId: "channel",
    roomUrl: (id) => `https://example.test/dots/room/${id}`,
  });
  assert.match(list.embeds[0].toJSON().title, /DANH SÁCH/);

  const game = createGame({ store, db });
  const caro = createCaroGame({ store: createCaroStore(db, now), db });
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [game, caro], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = `http://127.0.0.1:${web.server.address().port}`;
  async function request(gameId, route, data, cookie, origin = config.origin) {
    const response = await fetch(
      `${config.origin}/api/games/${gameId}/${route}`,
      {
        method: data ? "POST" : "GET",
        headers: {
          ...(data
            ? { "Content-Type": "application/json", Origin: origin }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
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
  room = match({ size: 3 });
  const viewer = await request("dots", `state?room=${room.id}`);
  assert.equal(viewer.status, 200);
  assert.equal(viewer.data.me, null);
  assert.deepEqual(viewer.data.scores, { X: 0, O: 0 });
  assert.equal(
    (
      await request("dots", "move", {
        roomId: room.id,
        edge: 0,
        version: room.version,
      })
    ).status,
    401,
  );
  const pair = await request("dots", "pair", { roomId: room.id });
  assert.throws(
    () => web.confirmPairing("dots", room.id, "stranger", pair.data.code),
    (error) => error.httpStatus === 403,
  );
  web.confirmPairing("dots", room.id, users.X.id, pair.data.code);
  const login = await request("dots", "pair/status", {
    roomId: room.id,
    pairingToken: pair.data.pairingToken,
  });
  assert.equal(login.data.connected, true);
  const a = login.cookie;
  const bTicket = new URL(
    web.issueTicket("dots", room.id, users.O.id),
  ).hash.slice(8);
  assert.equal(
    (await request("caro", "login", { ticket: bTicket })).status,
    401,
  );
  const b = (await request("dots", "login", { ticket: bTicket })).cookie;
  assert.equal(
    (
      await request(
        "dots",
        "move",
        { roomId: room.id, edge: 0, version: room.version },
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
        `${config.origin}/api/games/dots/events?room=${room.id}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: controllers[i].signal,
        },
      );
      assert.equal(res.status, 200);
      const reader = res.body.getReader();
      await reader.read();
      return reader;
    }),
  );
  const next = readers.map((reader) => reader.read());
  const moved = await request(
    "dots",
    "move",
    { roomId: room.id, edge: 0, version: room.version },
    a,
  );
  assert.equal(moved.status, 200);
  for (const event of await Promise.all(next))
    assert.match(new TextDecoder().decode(event.value), /"moves":1/);
  assert.equal(
    (
      await request(
        "dots",
        "move",
        { roomId: room.id, edge: 0, version: room.version },
        a,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request("dots", `state?room=${room.id}`, null, b)).data.edges[0],
    "X",
  );
  assert.equal(
    (await request("dots", "leave", { roomId: room.id }, b)).data.winner,
    "X",
  );
  controllers.forEach((c) => c.abort());
  for (const reader of readers) await reader.cancel().catch(() => {});
  assert.equal(
    (await fetch(config.origin + `/dots/room/${room.id}`)).status,
    200,
  );
  assert.match(
    await (await fetch(config.origin + "/")).text(),
    /Dots &amp; Boxes/,
  );

  const command = require("../src/commands/dots"),
    runtime = require("../src/dots/runtime");
  assert.equal(command.data.toJSON().name, "dots");
  assert.equal(command.data.toJSON().options.length, 4);
  const previous = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const replies = [];
    const i = {
      guildId: "discord",
      channelId: "chan",
      user: users.X,
      options: { getSubcommand: () => "choi", getInteger: () => null },
      deferReply: async () => {},
      editReply: async (p) => {
        replies.push(p);
        return { id: "lobby" };
      },
    };
    await command.execute(i);
    const r = runtime.store.listOpen("discord", "chan")[0];
    assert.equal(r.rules.size, 5);
    assert.equal(r.messageId, "lobby");
    const button = {
      ...i,
      user: users.O,
      message: { id: "lobby" },
      customId: `dots:join:${r.id}`,
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
    assert.equal(runtime.store.get(r.id).players.O.id, users.O.id);
    await command.handleButton({ ...button, guildId: "wrong" });
    assert.match(replies.at(-1).content, /không thuộc/);
    const denied = {
      ...i,
      memberPermissions: { has: () => false },
      reply: async (p) => replies.push(p),
      options: { getSubcommand: () => "cauhinh" },
    };
    await command.execute(denied);
    assert.match(replies.at(-1).content, /Chỉ quản trị/);
  } finally {
    runtime.isAvailable = previous;
  }
  assert.ok(
    require("../src/commandRegistry")
      .loadCommands()
      .some((c) => c.data.toJSON().name === "dots"),
  );
  assert.ok(require("../src/commands/luat").RULES.dots);
  const health = require("../src/services/operationalHealthService");
  store.sweep();
  const beforeHealth = health.getOperationalHealth().active.sessions;
  const healthRoom = create({}, "dots-health");
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth + 1);
  store.leave(healthRoom.id, users.X.id);
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth);
  const resetRoom = create({}, "dots-reset");
  store.setChannelLimit("dots-reset", "channel", 7, "admin");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "dots-reset",
  });
  assert.equal(store.get(resetRoom.id), null);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM dots_seats WHERE guild_id='dots-reset'")
      .get().n,
    0,
  );
  assert.equal(store.getChannelLimit("dots-reset", "channel"), 7);
  console.log(
    JSON.stringify({
      ok: true,
      dots: "edge mapping, double capture, bonus turns, clocks, complete games, restart, locks, pairing, three-client SSE, Discord",
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (web) await web.stop();
    db.close();
  });
