"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { legalMoves, wallError, hasPath } = require("../src/walls/engine");
const { normalizeRules } = require("../src/walls/rules");
const { createStore, WAIT_MS } = require("../src/walls/store");
const { DEFAULT_CLOCK_MS } = require("../src/webGames/clock");
const { createGame } = require("../src/walls/webGame");
const { createWebServer } = require("../src/webGames/http");
const { roomPayload } = require("../src/walls/discord");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now);
const alice = { id: "alice", username: "Alice" },
  bob = { id: "bob", username: "Bình" };
const create = (rules = {}, guildId = `g${++serial}`) =>
  store.create({ guildId, channelId: "channel", user: alice, rules });
const match = (rules) => {
  const r = create(rules);
  return store.join(r.id, bob);
};
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);
function seed(room, changes) {
  const next = { ...store.get(room.id), ...changes };
  db.prepare("UPDATE walls_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(next),
    room.id,
  );
  return next;
}
const gap = (a, b) =>
  Math.floor(a / 9) === Math.floor(b / 9)
    ? { orientation: "v", row: Math.floor(a / 9), col: Math.min(a % 9, b % 9) }
    : {
        orientation: "h",
        row: Math.min(Math.floor(a / 9), Math.floor(b / 9)),
        col: a % 9,
      };

async function main() {
  assert.deepEqual(normalizeRules(), {
    wallLength: 2,
    wallLimit: 10,
    timeMinutes: 30,
  });
  for (const input of [
    { wallLength: 0 },
    { wallLength: 3 },
    { wallLength: 1.5 },
    { wallLimit: -1 },
    { wallLimit: 21 },
    { wallLimit: "10" },
  ])
    code(() => normalizeRules(input), "INVALID_RULES");
  assert.deepEqual(legalMoves({ X: 76, O: 4 }, "X", [], 2), [67, 75, 77]);
  assert.equal(hasPath(76, 0, [], 2), true);
  assert.equal(hasPath(4, 8, [], 2), true);
  // All four directions: straight jumps take priority; a fence behind enables only side jumps.
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const opponent = (4 + dr) * 9 + 4 + dc,
      beyond = (4 + dr * 2) * 9 + 4 + dc * 2;
    const positions = { X: 40, O: opponent };
    const sides = dr
      ? [opponent - 1, opponent + 1]
      : [opponent - 9, opponent + 9];
    const straight = legalMoves(positions, "X", [], 1);
    assert(straight.includes(beyond));
    assert(!straight.includes(opponent));
    for (const side of sides) assert(!straight.includes(side));
    const behind = gap(opponent, beyond),
      blocked = legalMoves(positions, "X", [behind], 1);
    assert(!blocked.includes(beyond));
    for (const side of sides) assert(blocked.includes(side));
    assert(
      !legalMoves(
        positions,
        "X",
        [behind, gap(opponent, sides[0])],
        1,
      ).includes(sides[0]),
    );
    const separated = legalMoves(positions, "X", [gap(40, opponent)], 1);
    assert(!separated.includes(beyond));
    for (const side of sides) assert(!separated.includes(side));
  }
  assert.deepEqual(legalMoves({ X: 13, O: 4 }, "X", [], 2), [3, 5, 12, 14, 22]);
  const pos = { X: 76, O: 4 },
    h = { orientation: "h", row: 3, col: 3 };
  assert.equal(
    wallError([h], { orientation: "h", row: 3, col: 4 }, 2, pos),
    "WALL_OVERLAP",
  );
  assert.equal(
    wallError([h], { orientation: "v", row: 3, col: 3 }, 2, pos),
    "WALL_CROSSING",
  );
  assert.equal(
    wallError([h], { orientation: "h", row: 3, col: 5 }, 2, pos),
    null,
  );
  assert.equal(
    wallError([h], { orientation: "v", row: 2, col: 2 }, 2, pos),
    null,
    "walls may touch endpoints",
  );
  for (const wall of [
    { orientation: "x", row: 0, col: 0 },
    { orientation: "h", row: 8, col: 0 },
    { orientation: "h", row: 0, col: 8 },
    { orientation: "v", row: 8, col: 0 },
    { orientation: "v", row: 0, col: 8 },
    { orientation: "h", row: 0.5, col: 0 },
  ])
    assert.equal(wallError([], wall, 2, pos), "INVALID_WALL");
  assert.equal(
    wallError([], { orientation: "h", row: 7, col: 8 }, 1, pos),
    null,
  );
  assert.equal(
    wallError([], { orientation: "v", row: 8, col: 7 }, 1, pos),
    null,
  );
  const partial = [
    { orientation: "h", row: 7, col: 4 },
    { orientation: "v", row: 8, col: 3 },
  ];
  assert.equal(
    wallError(partial, { orientation: "v", row: 8, col: 4 }, 1, pos),
    "NO_PATH",
  );
  const topPartial = [
    { orientation: "h", row: 0, col: 4 },
    { orientation: "v", row: 0, col: 3 },
  ];
  assert.equal(
    wallError(topPartial, { orientation: "v", row: 0, col: 4 }, 1, pos),
    "NO_PATH",
    "cannot seal either player",
  );

  let room = create({ wallLength: 1 });
  assert.deepEqual(room.positions, pos);
  assert.deepEqual(room.wallsLeft, { X: 10, O: 10 });
  code(() => store.join(room.id, alice), "SELF_JOIN");
  code(() => store.move(room.id, alice.id, 67, room.version), "NOT_STARTED");
  room = store.join(room.id, bob);
  code(() => store.move(room.id, "viewer", 67, room.version), "NOT_PLAYER");
  code(() => store.move(room.id, bob.id, 13, room.version), "NOT_TURN");
  code(() => store.move(room.id, alice.id, 66, room.version), "ILLEGAL_MOVE");
  code(() => store.move(room.id, alice.id, 75, -1), "STALE_BOARD");
  room = store.wall(room.id, alice.id, partial[0], room.version);
  assert.equal(room.turn, "O");
  assert.equal(room.wallsLeft.X, 9);
  room = store.wall(room.id, bob.id, partial[1], room.version);
  const unchanged = JSON.stringify(room);
  code(
    () =>
      store.wall(
        room.id,
        alice.id,
        { orientation: "v", row: 8, col: 4 },
        room.version,
      ),
    "NO_PATH",
  );
  assert.equal(
    JSON.stringify(store.get(room.id)),
    unchanged,
    "rejected walls consume neither a turn nor inventory",
  );
  code(() => store.move(room.id, alice.id, 75, room.version), "ILLEGAL_MOVE");
  room = store.move(room.id, alice.id, 77, room.version);
  assert.equal(room.moves, 3);
  assert.equal(createStore(db, now).get(room.id).positions.X, 77);
  assert.deepEqual(store.snapshot(room, null).legalMoves, []);
  assert.equal(store.snapshot(room, null).me, null);
  const restored = store.get(room.id);
  assert.equal(restored.walls.length, 2);
  store.leave(room.id, bob.id);
  assert.equal(store.get(room.id).winner, "X");
  assert.match(
    roomPayload(
      store.get(room.id),
      "https://games.example/walls/",
    ).embeds[0].toJSON().description,
    /Alice thắng/,
  );

  room = match({ wallLimit: 0 });
  code(
    () =>
      store.wall(
        room.id,
        alice.id,
        { orientation: "h", row: 0, col: 0 },
        room.version,
      ),
    "NO_WALLS",
  );
  room = store.move(room.id, alice.id, 75, room.version);
  room = store.move(room.id, bob.id, 5, room.version);
  for (let row = 7; row >= 0; row--) {
    room = store.move(room.id, alice.id, row * 9 + 3, room.version);
    if (row > 0)
      room = store.move(room.id, bob.id, (8 - row) * 9 + 5, room.version);
  }
  assert.equal(room.winner, "X");
  assert.equal(room.reason, "win");
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM walls_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );
  code(() => store.move(room.id, alice.id, 4, room.version), "ROOM_CLOSED");
  room = seed(match(), { positions: { X: 13, O: 67 }, turn: "O" });
  assert.equal(store.move(room.id, bob.id, 76, room.version).winner, "O");
  room = match();
  clock += DEFAULT_CLOCK_MS;
  assert.equal(store.get(room.id).winner, "O");
  assert.equal(store.get(room.id).reason, "timeout");
  room = create();
  clock += WAIT_MS;
  assert.equal(store.get(room.id).reason, "expired");
  room = seed(match(), { matchDeadline: clock + 1 });
  clock += 2;
  assert.equal(store.get(room.id).status, "playing");
  assert.equal(store.get(room.id).matchDeadline, undefined);
  const concurrent = Array.from({ length: 5 }, (_, i) =>
    store.create({ guildId: "many", channelId: "many", user: { id: `p${i}` } }),
  );
  code(
    () =>
      store.create({
        guildId: "many",
        channelId: "many",
        user: { id: "extra" },
      }),
    "CHANNEL_FULL",
  );
  code(
    () =>
      store.create({ guildId: "many", channelId: "other", user: { id: "p0" } }),
    "ALREADY_PLAYING",
  );
  for (const r of concurrent) store.leave(r.id, r.players.X.id);

  room = match({ wallLength: 2, wallLimit: 3 });
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store })], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = `http://127.0.0.1:${web.server.address().port}`;
  async function request(route, { cookie, data, origin = config.origin } = {}) {
    const response = await fetch(config.origin + "/api/games/walls/" + route, {
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
  const ticket = new URL(
    web.issueTicket("walls", room.id, alice.id),
  ).hash.slice(8);
  const login = await request("login", { data: { ticket } });
  assert.equal(login.status, 200);
  assert.equal((await request(`state?room=${room.id}`)).data.me, null);
  assert.equal(
    (
      await request("wall", {
        data: {
          roomId: room.id,
          row: 0,
          col: 0,
          orientation: "h",
          version: room.version,
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("wall", {
        cookie: login.cookie,
        data: {
          roomId: room.id,
          row: 0,
          col: 0,
          orientation: "h",
          version: room.version,
        },
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const controllers = [new AbortController(), new AbortController()];
  const readers = await Promise.all(
    [login.cookie, null].map(async (cookie, i) => {
      const response = await fetch(
        config.origin + `/api/games/walls/events?room=${room.id}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: controllers[i].signal,
        },
      );
      const reader = response.body.getReader();
      await reader.read();
      return reader;
    }),
  );
  const updates = readers.map((reader) => reader.read());
  const placement = await request("wall", {
    cookie: login.cookie,
    data: {
      roomId: room.id,
      row: 4,
      col: 3,
      orientation: "h",
      version: room.version,
    },
  });
  assert.equal(placement.status, 200);
  assert.equal(placement.data.wallsLeft.X, 2);
  assert.equal(placement.data.turn, "O");
  for (const next of await Promise.all(updates))
    assert.match(new TextDecoder().decode(next.value), /"orientation":"h"/);
  assert.equal(
    (
      await request("move", {
        cookie: login.cookie,
        data: { roomId: room.id, cell: 67, version: room.version },
      })
    ).status,
    409,
  );
  const ended = readers.map((reader) => reader.read());
  store.leave(room.id, bob.id);
  for (const next of await Promise.all(ended))
    assert.match(new TextDecoder().decode(next.value), /"winner":"X"/);
  controllers.forEach((c) => c.abort());
  for (const reader of readers) await reader.cancel().catch(() => {});
  assert.match(
    await (await fetch(config.origin + `/walls/room/${room.id}`)).text(),
    /Chặn đường/,
  );
  assert.equal((await fetch(config.origin + "/walls/app.js")).status, 200);
  await web.stop();
  web = null;

  // Browser role controls and gap selection use authoritative move lists, never grant spectators actions.
  const elements = new Map();
  const documentEvents = {};
  function element() {
    return {
      hidden: false,
      disabled: false,
      textContent: "",
      value: "h",
      style: { setProperty() {} },
      classList: { toggle() {} },
      children: [],
      events: {},
      append(child) {
        this.children.push(child);
      },
      setAttribute() {},
      addEventListener(name, fn) {
        this.events[name] = fn;
      },
      click() {
        return this.events.click?.();
      },
      close() {
        this.open = false;
      },
      showModal() {
        this.open = true;
      },
    };
  }
  const sandbox = {
    document: {
      addEventListener(name, handler) {
        documentEvents[name] = handler;
      },
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/" },
    history: { replaceState() {} },
    Date,
    URLSearchParams,
    setInterval() {},
    clearTimeout() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/walls/public/app.js"), "utf8"),
    sandbox,
  );
  const browserRoom = match();
  sandbox.next = store.snapshot(browserRoom, null);
  vm.runInContext("accept(next); connection(true)", sandbox);
  assert.equal(elements.get("controls").hidden, true);
  assert.equal(elements.get("leave").hidden, true);
  assert.equal(vm.runInContext("cells.every(c=>c.disabled)", sandbox), true);
  sandbox.next = store.snapshot(browserRoom, alice.id);
  vm.runInContext("accept(next)", sandbox);
  assert.equal(elements.get("controls").hidden, false);
  assert.equal(
    vm.runInContext("cells.filter(c=>!c.disabled).length", sandbox),
    3,
  );
  elements.get("mode-wall").events.click();
  assert.equal(vm.runInContext("mode", sandbox), "wall");
  const slots = elements
    .get("board")
    .children.filter((e) => e.className === "wall-slot");
  assert(slots.length > 0);
  slots[0].events.click();
  assert.equal(elements.get("confirm-wall").disabled, false);
  const press = async (key, extra = {}) => {
    const event = {
      key,
      target: { tagName: "BODY", closest: () => null },
      preventDefault() {
        this.prevented = true;
      },
      ...extra,
    };
    await documentEvents.keydown(event);
    return event;
  };
  const selectedBefore = vm.runInContext("selectedWall.orientation", sandbox);
  await press("r");
  assert.notEqual(
    vm.runInContext("selectedWall.orientation", sandbox),
    selectedBefore,
  );
  assert.equal(elements.get("orientation").value, "v");
  await press("Escape");
  assert.equal(vm.runInContext("selectedWall", sandbox), null);
  assert.equal(vm.runInContext("mode", sandbox), "move");
  await press("f");
  assert.equal(vm.runInContext("mode", sandbox), "wall");
  // No action while typing, holding a key, a dialog is open, or viewing as a spectator.
  await press("r", { target: { tagName: "INPUT" } });
  assert.equal(elements.get("orientation").value, "v");
  await press("r", { repeat: true });
  assert.equal(elements.get("orientation").value, "v");
  elements.get("leave-dialog").open = true;
  await press("r");
  assert.equal(elements.get("orientation").value, "v");
  elements.get("leave-dialog").open = false;
  sandbox.keyboardRequests = [];
  vm.runInContext(
    "api = async (url, data) => { keyboardRequests.push({url, data}); return {...state, version:state.version+1, turn:'O'}; }",
    sandbox,
  );
  await press("w");
  assert.equal(sandbox.keyboardRequests.length, 1);
  assert.equal(sandbox.keyboardRequests[0].data.cell, 67);
  await press("a");
  assert.equal(
    sandbox.keyboardRequests.length,
    1,
    "out-of-turn keys cannot send actions",
  );
  sandbox.next = {
    ...store.snapshot(browserRoom, alice.id),
    positions: { X: 40, O: 31 },
    legalMoves: [22, 39, 41, 49],
    version: 50,
  };
  vm.runInContext("accept(next)", sandbox);
  await press("ArrowUp");
  assert.equal(
    sandbox.keyboardRequests.at(-1).data.cell,
    22,
    "keyboard uses a legal straight jump",
  );
  sandbox.next = {
    ...sandbox.next,
    version: 52,
    legalMoves: [30, 32, 39, 41, 49],
  };
  vm.runInContext("accept(next)", sandbox);
  await press("q");
  assert.equal(
    sandbox.keyboardRequests.at(-1).data.cell,
    30,
    "diagonal shortcut only targets an allowed side jump",
  );
  sandbox.next = { ...sandbox.next, version: 54, me: "X" };
  vm.runInContext("accept(next)", sandbox);
  await press("r");
  const confirmSlots = elements
    .get("board")
    .children.filter((e) => e.className === "wall-slot");
  confirmSlots.at(-1).events.click();
  await press("Enter");
  assert.equal(sandbox.keyboardRequests.at(-1).url, "/api/wall");
  assert.equal(sandbox.keyboardRequests.at(-1).data.version, 54);
  sandbox.next = { ...sandbox.next, version: 56, me: null };
  vm.runInContext("accept(next)", sandbox);
  const beforeSpectatorKey = sandbox.keyboardRequests.length;
  await press("w");
  assert.equal(sandbox.keyboardRequests.length, beforeSpectatorKey);
  // Return to the fixture's actual final state after keyboard-only browser simulations.
  vm.runInContext("state = null", sandbox);
  sandbox.next = store.snapshot(store.leave(browserRoom.id, bob.id), null);
  vm.runInContext("accept(next)", sandbox);
  assert.match(elements.get("status-title").textContent, /Alice thắng/);
  assert.equal(elements.get("controls").hidden, true);

  const command = require("../src/commands/walls"),
    runtime = require("../src/walls/runtime"),
    router = require("../src/componentRouter");
  const oldAvailable = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const replies = [];
    const interaction = {
      guildId: "discord",
      channelId: "discord",
      user: alice,
      options: {
        getSubcommand: () => "choi",
        getInteger: (key) =>
          ({ daituong: 1, sotuong: 4, thoigian: 15 })[key] ?? null,
      },
      deferReply: async () => {},
      deferUpdate: async () => {},
      editReply: async (p) => {
        replies.push(p);
        return { id: "wall-message" };
      },
      followUp: async (p) => replies.push(p),
      reply: async (p) => replies.push(p),
    };
    await command.execute(interaction);
    const lobby = runtime.store.listOpen("discord", "discord")[0];
    assert.equal(lobby.rules.wallLength, 1);
    assert.equal(lobby.rules.wallLimit, 4);
    assert.equal(lobby.rules.timeMinutes, 15);
    assert.equal(
      replies[0].components[0]
        .toJSON()
        .components.find((c) => c.style === 5)
        .url.endsWith(`/walls/room/${lobby.roomCode}`),
      true,
    );
    await router.routeComponentInteraction({
      ...interaction,
      user: bob,
      customId: `walls:join:${lobby.id}`,
      message: { id: "wall-message" },
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    });
    await runtime.syncMessages({
      channels: {
        fetch: () => {
          throw Error("unexpected bot route");
        },
      },
    });
    assert.match(replies.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    runtime.store.leave(lobby.id, bob.id);
    await runtime.syncMessages({
      channels: {
        fetch: () => {
          throw Error("unexpected bot route");
        },
      },
    });
    assert.match(replies.at(-1).embeds[0].toJSON().description, /Alice thắng/);
    await command.execute({
      ...interaction,
      options: { getSubcommand: () => "cauhinh", getInteger: () => 10 },
    });
    assert.match(replies.at(-1).content, /Chỉ quản trị/);
    assert(
      require("../src/commandRegistry")
        .loadCommands()
        .some((c) => c.data.toJSON().name === "walls"),
    );
    const prefix = require("../src/services/slashPrefixService");
    const prefixReplies = [];
    await prefix.handleSlashPrefix({
      guildId: "prefix",
      channelId: "prefix",
      author: alice,
      content: "!walls choi daituong=1 sotuong=2 thoigian=10",
      channel: {},
      reply: async (p) => {
        prefixReplies.push(p);
        return { id: "prefix-message" };
      },
    });
    assert.equal(
      runtime.store.listOpen("prefix", "prefix")[0].rules.wallLimit,
      2,
    );
    assert.equal(
      runtime.store.listOpen("prefix", "prefix")[0].rules.timeMinutes,
      10,
    );
  } finally {
    runtime.isAvailable = oldAvailable;
  }
  const health = require("../src/services/operationalHealthService");
  store.sweep();
  const beforeHealth = health.getOperationalHealth().active.sessions;
  const healthRoom = create({}, "walls-health");
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth + 1);
  store.leave(healthRoom.id, alice.id);
  assert.equal(health.getOperationalHealth().active.sessions, beforeHealth);
  const resetRoom = store.create({
    guildId: "walls-reset",
    channelId: "reset",
    user: alice,
  });
  store.setChannelLimit("walls-reset", "reset", 7, "admin");
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "walls-reset",
  });
  assert.equal(store.get(resetRoom.id), null);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM walls_seats WHERE guild_id='walls-reset'",
      )
      .get().n,
    0,
  );
  assert.equal(store.getChannelLimit("walls-reset", "reset"), 7);
  console.log(
    JSON.stringify({
      ok: true,
      walls:
        "Quoridor jumps, fence geometry/path safety, turns, persistence, spectators, HTTP/SSE, Discord/prefix, keyboard, health/reset",
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
    if (db.open) db.close();
  });
