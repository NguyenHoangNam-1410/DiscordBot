"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createStore, WAIT_MS } = require("../src/blokus/store");
const { SIZE, STARTS, normalizeRules } = require("../src/blokus/rules");
const {
  PIECES,
  ORIENTATIONS,
  transform,
  placement,
  place,
  findMove,
  score,
} = require("../src/blokus/engine");
const { createGame } = require("../src/blokus/webGame");
const { createGame: createCaroGame } = require("../src/caro/webGame");
const { createStore: createCaroStore } = require("../src/caro/store");
const { createWebServer } = require("../src/webGames/http");
const { roomPayload, roomsPayload } = require("../src/blokus/discord");
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
  guildId = `blokus-${++serial}`,
  channelId = "channel",
) => store.create({ guildId, channelId, user: users.X, rules });
const match = (rules = {}) => store.join(create(rules).id, users.O);
const move = (room, data) =>
  store.move(room.id, users[room.turn].id, data, room.version);
const code = (fn, expected) => assert.throws(fn, (e) => e.code === expected);
const mono = (row, col) => ({
  pieceId: "I1",
  row,
  col,
  rotation: 0,
  flipped: false,
});
const domino = (row, col) => ({
  pieceId: "I2",
  row,
  col,
  rotation: 0,
  flipped: false,
});
const empty = () => ({
  board: Array(196).fill(null),
  used: { X: [], O: [] },
  starts: { X: null, O: null },
});

// Independent, exhaustive board scan verifies the optimized corner-frontier search.
function legal(room, mark, cells) {
  const inside = (r, c) => r >= 0 && r < 14 && c >= 0 && c < 14;
  if (cells.some(([r, c]) => !inside(r, c) || room.board[r * 14 + c]))
    return false;
  let corner = false;
  for (const [r, c] of cells)
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (
          !inside(r + dr, c + dc) ||
          room.board[(r + dr) * 14 + c + dc] !== mark
        )
          continue;
        if (Math.abs(dr) + Math.abs(dc) === 1) return false;
        if (dr && dc) corner = true;
      }
  if (room.used[mark].length) return corner;
  const points = room.starts[mark] == null ? STARTS : [room.starts[mark]];
  return cells.some(([r, c]) => points.includes(r * 14 + c));
}
function exhaustive(room, mark) {
  for (const p of PIECES)
    if (!room.used[mark].includes(p.id))
      for (const form of ORIENTATIONS.get(p.id))
        for (let row = 0; row < 14; row++)
          for (let col = 0; col < 14; col++)
            if (
              legal(
                room,
                mark,
                form.cells.map(([r, c]) => [r + row, c + col]),
              )
            )
              return true;
  return false;
}
function canonical(cells) {
  return Array.from({ length: 8 }, (_, i) => {
    const form = cells.map(([r, c]) => {
      if (i >= 4) c = -c;
      for (let k = 0; k < i % 4; k++) [r, c] = [c, -r];
      return [r, c];
    });
    const a = Math.min(...form.map((v) => v[0])),
      b = Math.min(...form.map((v) => v[1]));
    return form
      .map(([r, c]) => [r - a, c - b])
      .sort((x, y) => x[0] - y[0] || x[1] - y[1])
      .map((v) => v.join(","))
      .join(";");
  }).sort()[0];
}
async function main() {
  assert.deepEqual(normalizeRules(), { timeMinutes: 30 });
  for (const t of [0, 181, 1.5, "30", null])
    code(() => normalizeRules({ timeMinutes: t }), "INVALID_RULES");
  assert.equal(SIZE, 14);
  assert.deepEqual(STARTS, [60, 135]);
  assert.equal(PIECES.length, 21);
  assert.equal(
    PIECES.reduce((a, p) => a + p.cells.length, 0),
    89,
  );
  // Generate all free polyominoes independently; no missing or duplicate catalog shape.
  let generated = new Map([[canonical([[0, 0]]), [[0, 0]]]]);
  for (let n = 1; n <= 5; n++) {
    const actual = new Set(
      PIECES.filter((p) => p.cells.length === n).map((p) => canonical(p.cells)),
    );
    assert.deepEqual([...actual].sort(), [...generated.keys()].sort());
    const next = new Map();
    for (const cells of generated.values())
      for (const [r, c] of cells)
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const cell = [r + dr, c + dc];
          if (cells.some((v) => v[0] === cell[0] && v[1] === cell[1])) continue;
          const candidate = [...cells, cell];
          next.set(canonical(candidate), candidate);
        }
    generated = next;
  }
  for (const p of PIECES)
    for (const f of [false, true])
      for (let r = 0; r < 4; r++) {
        const form = transform(p.cells, r, f);
        assert.equal(canonical(form), canonical(p.cells));
        assert.equal(
          new Set(form.map((v) => v.join(","))).size,
          p.cells.length,
        );
        assert.equal(Math.min(...form.map((v) => v[0])), 0);
        assert.equal(Math.min(...form.map((v) => v[1])), 0);
      }
  for (const start of STARTS) {
    const b = empty(),
      r = Math.floor(start / 14),
      c = start % 14;
    place(b, "X", mono(r, c));
    assert.equal(b.starts.X, start);
    assert.equal(
      b.starts.O,
      STARTS.find((s) => s !== start),
    );
    assert.equal(placement(b, "X", mono(r + 1, c + 1)).error, "PIECE_USED");
  }
  {
    const b = empty();
    assert.equal(placement(b, "X", mono(0, 0)).error, "START_REQUIRED");
    place(b, "X", mono(4, 4));

    assert.equal(placement(b, "X", domino(4, 5)).error, "EDGE_TOUCH");
    assert.equal(placement(b, "X", domino(0, 0)).error, "CORNER_REQUIRED");
    assert.equal(placement(b, "X", domino(5, 5)).error, null);
    assert.equal(placement(b, "X", domino(13, 13)).error, "OUTSIDE");
    assert.equal(placement(b, "X", domino(4, 4)).error, "OCCUPIED");
    // Opposing edges are allowed; same-color rules still apply to the entire shape.
    b.board[5 * 14 + 4] = "O";
    assert.equal(placement(b, "X", domino(5, 5)).error, null);
    for (const data of [
      {},
      null,
      mono(NaN, 4),
      { ...mono(4, 4), rotation: 4 },
      { ...mono(4, 4), flipped: "false" },
    ])
      assert.equal(placement(b, "O", data).error, "INVALID_PLACEMENT");
  }
  const completed = empty();
  completed.used.X = PIECES.map((p) => p.id);
  assert.equal(score(completed, "X"), 15);
  completed.used.X = completed.used.X.filter((p) => p !== "I1").concat("I1");
  assert.equal(score(completed, "X"), 20);
  assert.equal(score(completed, "O"), -89);

  let room = create({ timeMinutes: 1 });
  code(() => store.join(room.id, users.X), "SELF_JOIN");
  code(() => move(room, mono(4, 4)), "NOT_STARTED");
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
  const version = room.version;
  code(
    () => store.move(room.id, "stranger", mono(4, 4), version),
    "NOT_PLAYER",
  );
  code(() => store.move(room.id, users.O.id, mono(9, 9), version), "NOT_TURN");
  code(
    () => store.move(room.id, users.X.id, mono(4, 4), version - 1),
    "STALE_BOARD",
  );
  const unchanged = JSON.stringify(store.get(room.id));
  code(() => move(room, mono(0, 0)), "START_REQUIRED");
  assert.equal(JSON.stringify(store.get(room.id)), unchanged);
  clock += 7_000;
  room = move(room, mono(4, 4));
  assert.deepEqual(room.clocks, { X: 53_000, O: 60_000 });
  clock += 4_000;
  room = move(room, mono(9, 9));
  assert.deepEqual(room.clocks, { X: 53_000, O: 56_000 });
  const reopened = new Database(db.serialize());
  assert.deepEqual(createStore(reopened, now).get(room.id), room);
  reopened.close();
  clock += 53_000;
  code(() => move(room, domino(5, 5)), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "timeout");
  assert.equal(store.get(room.id).winner, "O");
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM blokus_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );
  room = create();
  clock += WAIT_MS;
  store.sweep();
  assert.equal(store.get(room.id).reason, "expired");
  room = match();
  const before = room.version;
  room = store.updatePlayer(room.id, { ...users.X, globalName: "Nguyễn An" });
  assert(room.version > before);
  assert.equal(
    store.updatePlayer(room.id, { ...users.X, globalName: "Nguyễn An" })
      .version,
    room.version,
  );
  const view = store.snapshot(room, null);
  assert.equal(view.me, null);
  assert.equal(view.players.X, "Nguyễn An");
  assert.deepEqual(view.playerLabels, { X: "Quân xanh", O: "Quân cam" });
  assert(!JSON.stringify(view).includes('"alice"'));
  room = store.leave(room.id, users.O.id);
  assert.equal(room.winner, "X");
  // Complete varied legal games. Every finished board is checked independently for both seats.
  let skipped = false;
  for (let game = 0; game < 12; game++) {
    room = match();
    let turns = 0;
    while (room.status === "playing") {
      const mark = room.turn;
      const pieces = [...PIECES].sort((a, b) =>
        game % 2
          ? b.cells.length - a.cells.length
          : a.cells.length - b.cells.length,
      );
      if (game > 1) pieces.push(...pieces.splice(0, game));
      const action = pieces
        .map((p) => findMove(room, mark, p.id))
        .find(Boolean);
      assert(action, "A playing seat must have a legal move");
      const form = transform(
        PIECES.find((p) => p.id === action.pieceId).cells,
        action.rotation,
        action.flipped,
      ).map(([r, c]) => [r + action.row, c + action.col]);
      assert(legal(room, mark, form));
      clock += 125;
      const previous = room.clocks[mark];
      room = move(room, action);
      assert.equal(room.clocks[mark], previous - 125);
      if (room.status === "playing" && room.turn === mark) {
        skipped = true;
        assert(room.blocked[mark === "X" ? "O" : "X"]);
      }
      assert(++turns <= 42);
    }
    for (const mark of ["X", "O"]) {
      assert.equal(exhaustive(room, mark), false);
      assert.equal(room.blocked[mark], true);
      assert.equal(new Set(room.used[mark]).size, room.used[mark].length);
    }
    const sx = score(room, "X"),
      so = score(room, "O");
    assert.equal(room.winner, sx === so ? null : sx > so ? "X" : "O");
    const payload = roomPayload(
      room,
      "https://example.test/blokus/room/" + room.id,
    );
    assert(payload.embeds[0].toJSON().description.includes(String(sx)));
    assert(
      payload.components.every((r) =>
        r.toJSON().components.every((c) => !c.custom_id),
      ),
    );
  }
  assert(skipped, "Blocked opponent must be skipped automatically");
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
  for (const limit of [0, 21, 1.5, "5"])
    code(
      () => store.setChannelLimit("g", "c", limit, "admin"),
      "INVALID_ROOM_LIMIT",
    );
  const list = roomsPayload([limited], {
    ownerId: users.X.id,
    limit: 1,
    guildId: "limited",
    channelId: "channel",
    roomUrl: (id) => `https://example.test/blokus/room/${id}`,
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
  room = match();
  const viewer = await request("blokus", `state?room=${room.id}`);
  assert.equal(viewer.status, 200);
  assert.equal(viewer.data.me, null);
  assert.deepEqual(viewer.data.scores, { X: -89, O: -89 });
  assert.equal(
    (
      await request("blokus", "move", {
        roomId: room.id,
        ...mono(4, 4),
        version: room.version,
      })
    ).status,
    401,
  );
  const pair = await request("blokus", "pair", { roomId: room.id });
  assert.throws(
    () => web.confirmPairing("blokus", room.id, "stranger", pair.data.code),
    (error) => error.httpStatus === 403,
  );
  web.confirmPairing("blokus", room.id, users.X.id, pair.data.code);
  const login = await request("blokus", "pair/status", {
    roomId: room.id,
    pairingToken: pair.data.pairingToken,
  });
  assert.equal(login.data.connected, true);
  const a = login.cookie;
  const bTicket = new URL(
    web.issueTicket("blokus", room.id, users.O.id),
  ).hash.slice(8);
  assert.equal(
    (await request("caro", "login", { ticket: bTicket })).status,
    401,
  );
  const b = (await request("blokus", "login", { ticket: bTicket })).cookie;
  assert.equal(
    (
      await request(
        "blokus",
        "move",
        { roomId: room.id, ...mono(4, 4), version: room.version },
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
        `${config.origin}/api/games/blokus/events?room=${room.id}`,
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
    "blokus",
    "move",
    { roomId: room.id, ...mono(4, 4), version: room.version },
    a,
  );
  assert.equal(moved.status, 200);
  for (const event of await Promise.all(next))
    assert.match(new TextDecoder().decode(event.value), /"moves":1/);
  assert.equal(
    (
      await request(
        "blokus",
        "move",
        { roomId: room.id, ...mono(4, 4), version: room.version },
        a,
      )
    ).status,
    409,
  );
  assert.equal(
    (await request("blokus", `state?room=${room.id}`, null, b)).data.board[60],
    "X",
  );
  assert.equal(
    (await request("blokus", "leave", { roomId: room.id }, b)).data.winner,
    "X",
  );
  controllers.forEach((c) => c.abort());
  for (const reader of readers) await reader.cancel().catch(() => {});
  assert.equal(
    (await fetch(config.origin + `/blokus/room/${room.id}`)).status,
    200,
  );
  assert.match(await (await fetch(config.origin + "/")).text(), /Blokus/);

  const command = require("../src/commands/blokus"),
    runtime = require("../src/blokus/runtime");
  assert.equal(command.data.toJSON().name, "blokus");
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
    assert.equal(r.rules.timeMinutes, 30);
    assert.equal(r.messageId, "lobby");
    const button = {
      ...i,
      user: users.O,
      message: { id: "lobby" },
      customId: `blokus:join:${r.id}`,
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
    const client = {
      channels: {
        fetch: () => {
          throw Error("Use the bound Discord interaction");
        },
      },
    };
    await runtime.syncMessages(client);
    assert.match(replies.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    runtime.store.leave(r.id, users.O.id);
    await runtime.syncMessages(client);
    assert.match(
      replies.at(-1).embeds[0].toJSON().description,
      /Alice <script> thắng/,
    );
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
    const prefixReplies = [];
    const oldPrefix = process.env.COMMAND_PREFIX;
    process.env.COMMAND_PREFIX = "!";
    try {
      await require("../src/services/slashPrefixService").handleSlashPrefix({
        guildId: "blokus-prefix",
        channelId: "channel",
        author: users.X,
        content: "!blokus choi thoigian=10",
        channel: {},
        reply: async (p) => {
          prefixReplies.push(p);
          return { id: "prefix-lobby" };
        },
      });
      assert.equal(
        runtime.store.listOpen("blokus-prefix", "channel")[0].rules.timeMinutes,
        10,
      );
      assert(prefixReplies[0].embeds.length);
    } finally {
      if (oldPrefix === undefined) delete process.env.COMMAND_PREFIX;
      else process.env.COMMAND_PREFIX = oldPrefix;
    }
  } finally {
    runtime.isAvailable = previous;
  }
  assert.ok(
    require("../src/commandRegistry")
      .loadCommands()
      .some((c) => c.data.toJSON().name === "blokus"),
  );
  assert.ok(require("../src/commands/luat").RULES.blokus);
  const health = require("../src/services/operationalHealthService");
  store.sweep();
  const beforeHealth = health.getOperationalHealth().active.sessions;
  const healthRoom = create({}, "blokus-health");
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth + 1);
  store.leave(healthRoom.id, users.X.id);
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth);
  const resetRoom = create({}, "blokus-reset");
  store.setChannelLimit("blokus-reset", "channel", 7, "admin");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "blokus-reset",
  });
  assert.equal(store.get(resetRoom.id), null);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM blokus_seats WHERE guild_id='blokus-reset'",
      )
      .get().n,
    0,
  );
  assert.equal(store.getChannelLimit("blokus-reset", "channel"), 7);
  console.log(
    JSON.stringify({
      ok: true,
      blokus:
        "21 polyominoes, rotations, corner rules, independent legality scan, complete games, skip, scoring, clocks, restart, locks, pairing, three-client SSE, Discord",
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
