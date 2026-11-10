"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caro-test-"));
process.env.DB_PATH = path.join(directory, "caro.sqlite");
const { db } = require("../src/db");
const { createStore, WAIT_MS } = require("../src/caro/store");
const { DEFAULT_CLOCK_MS } = require("../src/webGames/clock");
const { SIZE, winningLine } = require("../src/caro/engine");
const { normalizeRules, DEFAULT_RULES } = require("../src/caro/rules");
const { createWebServer } = require("../src/caro/http");
const { readConfig } = require("../src/caro/config");
const { roomPayload } = require("../src/caro/discord");
const vm = require("node:vm");
let clock = Date.now(),
  serial = 0,
  web,
  sharedWeb,
  reopened;
const now = () => clock;
const store = createStore(db, now);
const alice = { id: "alice", username: "Alice <script>" },
  bob = { id: "bob", username: "Bình" };
function create(user = alice, guildId = `g${++serial}`, channelId = "channel") {
  return store.create({ guildId, channelId, user });
}
function match() {
  const room = create();
  store.join(room.id, bob);
  return store.get(room.id);
}
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);

async function main() {
  assert.deepEqual(readConfig({}), { enabled: false });
  assert.equal(readConfig({ CARO_WEB_ENABLED: "true" }).host, "127.0.0.1");
  assert.deepEqual(
    readConfig({ WEB_ENABLED: "false", CARO_WEB_ENABLED: "true" }),
    { enabled: false },
  );
  assert.equal(
    readConfig({
      WEB_ENABLED: "true",
      WEB_PORT: "3123",
      CARO_WEB_PORT: "3001",
      WEB_PUBLIC_URL: "https://games.example",
    }).port,
    3123,
  );
  assert.equal(
    readConfig({
      WEB_ENABLED: "true",
      WEB_PUBLIC_URL: "https://games.example",
      CARO_PUBLIC_URL: "https://old.example",
    }).origin,
    "https://games.example",
  );
  for (const url of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/game",
    "https://example.com/?secret=1",
  ])
    assert.throws(() =>
      readConfig({ CARO_WEB_ENABLED: "true", CARO_PUBLIC_URL: url }),
    );
  assert.throws(() =>
    readConfig({ CARO_WEB_ENABLED: "true", CARO_WEB_PORT: "abc" }),
  );

  for (const delta of [1, SIZE, SIZE + 1, SIZE - 1]) {
    const board = Array(SIZE * SIZE).fill(null),
      start = 4 * SIZE + 7;
    for (let i = 0; i < 6; i++) board[start + i * delta] = "X";
    assert.equal(winningLine(board, start + 2 * delta, "X").length, 6);
    board[start + 3 * delta] = "O";
    assert.equal(winningLine(board, start + 2 * delta, "X").length, 0);
  }
  const wrap = Array(225).fill(null);
  for (const cell of [13, 14, 15, 16, 17]) wrap[cell] = "X";
  assert.equal(
    winningLine(wrap, 15, "X").length,
    0,
    "no wrapping between rows",
  );

  for (const bad of [
    { size: 8 },
    { size: 26 },
    { size: 10.5 },
    { winLength: 7 },
    { winLength: 2 },
    { blockBothEnds: "false" },
  ])
    code(() => normalizeRules(bad), "INVALID_RULES");
  for (const size of [9, 15, 25]) {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      const r = 2,
        c = dc < 0 ? 7 : 2,
        board = Array(size * size).fill(null);
      const at = (n) => (r + dr * n) * size + c + dc * n;
      for (let i = 0; i < 4; i++) board[at(i)] = "X";
      board[at(-1)] = "O";
      board[at(4)] = "O";
      assert.equal(
        winningLine(board, at(2), "X", { size, winLength: 4 }).length,
        4,
      );
      assert.equal(
        winningLine(board, at(2), "X", {
          size,
          winLength: 4,
          blockBothEnds: true,
        }).length,
        0,
      );
      board[at(-1)] = null;
      assert.equal(
        winningLine(board, at(2), "X", {
          size,
          winLength: 4,
          blockBothEnds: true,
        }).length,
        4,
      );
      board[at(4)] = "X";
      assert.equal(
        winningLine(board, at(2), "X", {
          size,
          winLength: 4,
          exactLength: true,
        }).length,
        0,
      );
      assert.equal(
        winningLine(board, at(2), "X", { size, winLength: 4 }).length,
        5,
      );
    }
  }
  const edgeBoard = Array(81).fill(null);
  for (const i of [0, 1, 2]) edgeBoard[i] = "X";
  edgeBoard[3] = "O";
  assert.equal(
    winningLine(edgeBoard, 1, "X", {
      size: 9,
      winLength: 3,
      blockBothEnds: true,
    }).length,
    3,
  );
  assert.equal(
    winningLine(edgeBoard, 1, "X", {
      size: 9,
      winLength: 3,
      blockBothEnds: true,
      edgeBlocks: true,
    }).length,
    0,
  );
  // A custom room keeps its rules across moves, reconnects and storage reads.
  let custom = store.create({
    guildId: "custom",
    channelId: "custom",
    user: alice,
    rules: { size: 9, winLength: 3, blockBothEnds: true, exactLength: true },
  });
  custom = store.join(custom.id, bob);
  assert.equal(custom.board.length, 81);
  code(
    () => store.move(custom.id, alice.id, 81, custom.version),
    "INVALID_CELL",
  );
  for (const [user, cell] of [
    [alice, 0],
    [bob, 9],
    [alice, 1],
    [bob, 10],
    [alice, 2],
  ])
    custom = store.move(custom.id, user.id, cell, custom.version);
  assert.equal(custom.winner, "X");
  assert.equal(createStore(db, now).get(custom.id).rules.winLength, 3);
  assert.match(
    roomPayload(custom, "https://games.example/caro/").embeds[0].toJSON()
      .description,
    /Đúng 3 quân/,
  );
  assert.match(
    store.snapshot(custom, alice.id).rulesLabel,
    /Chặn 2 đầu không thắng/,
  );
  // Pre-refactor rooms have no rules field and must retain the original rules.
  const legacy = { ...custom };
  delete legacy.rules;
  assert.deepEqual(store.snapshot(legacy, alice.id).rules, DEFAULT_RULES);

  // Multiple rooms share a channel, but capacity and one seat per guild stay authoritative.
  assert.equal(
    db
      .prepare("PRAGMA index_list(caro_rooms)")
      .all()
      .find((i) => i.name === "idx_caro_open_channel").unique,
    0,
  );
  assert.equal(store.getChannelLimit("caps", "channel"), 5);
  for (const invalid of [0, -1, 21, 2.5, "5", null])
    code(
      () => store.setChannelLimit("caps", "channel", invalid, alice.id),
      "INVALID_ROOM_LIMIT",
    );
  const capacityRooms = Array.from({ length: 5 }, (_, i) =>
    store.create({
      guildId: "caps",
      channelId: "channel",
      user: { id: `cap-${i}` },
    }),
  );
  code(
    () =>
      store.create({
        guildId: "caps",
        channelId: "channel",
        user: { id: "cap-extra" },
      }),
    "CHANNEL_FULL",
  );
  assert.equal(store.listOpen("caps", "channel").length, 5);
  const elsewhere = store.create({
    guildId: "caps",
    channelId: "elsewhere",
    user: { id: "cap-elsewhere" },
  });
  assert.equal(store.listOpen("caps", "elsewhere").length, 1);
  code(
    () =>
      store.create({
        guildId: "caps",
        channelId: "third",
        user: { id: "cap-0" },
      }),
    "ALREADY_PLAYING",
  );
  code(
    () => store.join(capacityRooms[1].id, { id: "cap-0" }),
    "ALREADY_PLAYING",
  );
  store.join(capacityRooms[0].id, { id: "cap-opponent" });
  assert.equal(store.get(capacityRooms[1].id).status, "waiting");
  store.setChannelLimit("caps", "channel", 2, alice.id);
  assert.equal(
    store.listOpen("caps", "channel").length,
    5,
    "reducing capacity must not close existing rooms",
  );
  const otherConnection = new Database(process.env.DB_PATH);
  const otherStore = createStore(otherConnection, now);
  assert.equal(
    otherStore.getChannelLimit("caps", "channel"),
    2,
    "channel configuration survives a separate connection",
  );
  code(
    () =>
      otherStore.create({
        guildId: "caps",
        channelId: "channel",
        user: { id: "cap-extra" },
      }),
    "CHANNEL_FULL",
  );
  otherConnection.close();
  assert.equal(store.getChannelLimit("other-guild", "channel"), 5);
  for (const r of capacityRooms) store.leave(r.id, r.players.X.id);
  const replacement = store.create({
    guildId: "caps",
    channelId: "channel",
    user: { id: "cap-extra" },
  });
  assert.equal(
    store.listOpen("caps", "channel").length,
    1,
    "finished rooms release capacity",
  );
  store.leave(replacement.id, "cap-extra");
  store.leave(elsewhere.id, "cap-elsewhere");
  const expiring = store.create({
    guildId: "expiry-cap",
    channelId: "channel",
    user: alice,
  });
  store.setChannelLimit("expiry-cap", "channel", 1, alice.id);
  clock += WAIT_MS;
  assert.equal(store.listOpen("expiry-cap", "channel").length, 0);
  assert.equal(store.get(expiring.id).reason, "expired");
  const afterExpiry = store.create({
    guildId: "expiry-cap",
    channelId: "channel",
    user: bob,
  });
  store.leave(afterExpiry.id, bob.id);

  let room = create();
  code(() => store.join(room.id, alice), "SELF_JOIN");
  const secondRoom = create(bob, room.guildId);
  assert.equal(store.listOpen(room.guildId, room.channelId).length, 2);
  store.leave(secondRoom.id, bob.id);
  code(() => create(alice, room.guildId, "other"), "ALREADY_PLAYING");
  code(() => store.leave(room.id, "stranger"), "NOT_PLAYER");
  code(() => store.move(room.id, alice.id, 0, room.version), "NOT_STARTED");
  store.join(room.id, bob);
  code(() => store.join(room.id, { id: "third" }), "ROOM_FULL");
  room = store.get(room.id);
  code(() => store.move(room.id, "stranger", 0, room.version), "NOT_PLAYER");
  code(() => store.move(room.id, bob.id, 0, room.version), "NOT_TURN");
  for (const cell of [-1, 225, 1.2, "0", null])
    code(
      () => store.move(room.id, alice.id, cell, room.version),
      "INVALID_CELL",
    );
  code(() => store.move(room.id, alice.id, 0, -1), "STALE_BOARD");
  let updated = store.move(room.id, alice.id, 0, room.version);
  code(() => store.move(room.id, alice.id, 0, room.version), "STALE_BOARD");
  code(() => store.move(room.id, bob.id, 0, updated.version), "OCCUPIED");
  assert.equal(store.get(room.id).moves, 1);
  const restored = createStore(db, now).get(room.id);
  assert.equal(restored.board[0], "X");
  assert.equal(restored.turn, "O");
  // From a stale client, a rejected request must not replace another player's accepted move.
  updated = store.move(room.id, bob.id, 15, updated.version);
  for (let col = 1; col <= 4; col++) {
    updated = store.move(room.id, alice.id, col, updated.version);
    if (col < 4)
      updated = store.move(room.id, bob.id, 15 + col, updated.version);
  }
  assert.equal(updated.winner, "X");
  assert.equal(updated.reason, "win");
  assert.equal(updated.winningCells.length, 5);
  code(() => store.move(room.id, bob.id, 20, updated.version), "ROOM_CLOSED");
  assert.equal(
    db.prepare("SELECT count(*) n FROM caro_seats WHERE room_id=?").get(room.id)
      .n,
    0,
  );
  create(alice, room.guildId); // Both channel and player locks have been released.
  assert.ok(
    !JSON.stringify(store.snapshot(updated, alice.id)).includes("guildId"),
  );
  assert.equal(store.snapshot(updated, "stranger").me, null);
  assert.ok(JSON.stringify(roomPayload(updated)).length < 6000);

  room = match();
  clock += DEFAULT_CLOCK_MS;
  code(() => store.move(room.id, alice.id, 0, room.version), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "timeout");
  assert.equal(store.get(room.id).winner, "O");
  room = create();
  clock += WAIT_MS;
  code(() => store.join(room.id, bob), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "expired");
  room = match();
  // Obsolete match caps no longer end a game while the player still has time.
  const payload = JSON.parse(
    db.prepare("SELECT data_json FROM caro_rooms WHERE id=?").get(room.id)
      .data_json,
  );
  payload.matchDeadline = clock + 1000;
  db.prepare("UPDATE caro_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(payload),
    room.id,
  );
  clock += 1001;
  assert.equal(store.get(room.id).status, "playing");
  assert.equal(store.get(room.id).matchDeadline, undefined);
  room = match();
  assert.equal(store.leave(room.id, bob.id).winner, "X");
  code(() => store.leave(room.id, bob.id), "ROOM_CLOSED");
  room = create();
  assert.equal(store.leave(room.id, alice.id).reason, "cancelled");

  const persisted = match();
  store.move(persisted.id, alice.id, 100, persisted.version);
  db.pragma("wal_checkpoint(FULL)");
  reopened = new Database(process.env.DB_PATH);
  const restartStore = createStore(reopened, now);
  assert.equal(
    restartStore.get(persisted.id).board[100],
    "X",
    "a new database connection restores the board",
  );
  assert.equal(restartStore.get(persisted.id).turn, "O");
  assert.equal(
    restartStore.get(persisted.id).turnDeadline,
    clock + DEFAULT_CLOCK_MS,
  );
  reopened.close();
  reopened = null;

  room = match();
  const config = { origin: "", secure: false };
  web = createWebServer({ store, config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = `http://127.0.0.1:${web.server.address().port}`;
  async function request(
    route,
    { cookie, data, origin = config.origin, raw, headers = {} } = {},
  ) {
    const response = await fetch(config.origin + route, {
      method: data || raw ? "POST" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data || raw
          ? { Origin: origin, "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      body: raw || (data ? JSON.stringify(data) : undefined),
      signal: AbortSignal.timeout(5000),
    });
    return { response, status: response.status, data: await response.json() };
  }
  async function login(userId) {
    const url = web.issueTicket(room.id, userId);
    const ticket = new URL(url).hash.slice("#ticket=".length);
    const result = await request("/api/login", { data: { ticket } });
    assert.equal(result.status, 200);
    assert.equal(result.data.roomId, room.id);
    assert.match(
      result.response.headers.get("set-cookie"),
      /HttpOnly; SameSite=Strict/,
    );
    assert.equal(
      (await request("/api/login", { data: { ticket } })).status,
      401,
      "ticket is single use",
    );
    return result.response.headers.get("set-cookie").split(";")[0];
  }
  assert.equal((await request("/healthz")).data.ok, true);
  const viewer = await request(`/api/state?room=${room.id}`);
  assert.equal(viewer.status, 200);
  assert.equal(viewer.data.me, null);
  assert.ok(!JSON.stringify(viewer.data).includes('"id":"alice"'));
  assert.equal(
    (
      await request("/api/move", {
        data: { roomId: room.id, cell: 0, version: room.version },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/leave", { data: { roomId: room.id } })).status,
    401,
  );
  const aCookie = await login(alice.id),
    bCookie = await login(bob.id);
  assert.equal(
    (await request(`/api/state?room=${room.id}`, { cookie: aCookie })).data.me,
    "X",
  );
  assert.equal(
    (await request(`/api/state?room=${persisted.id}`, { cookie: aCookie }))
      .status,
    200,
    "same Discord player may restore another own room",
  );
  const unrelated = create({ id: "unrelated" });
  assert.equal(
    (await request(`/api/state?room=${unrelated.id}`, { cookie: aCookie }))
      .status,
    200,
  );
  assert.equal(
    (await request(`/api/state?room=${unrelated.id}`, { cookie: aCookie })).data
      .me,
    null,
  );
  assert.equal(
    (
      await request("/api/leave", {
        cookie: aCookie,
        data: { roomId: unrelated.id },
      })
    ).status,
    403,
  );
  // Public room links never grant a seat. Only the Discord-confirmed browser gets a session.
  const pairing = await request("/api/pair", { data: { roomId: room.id } });
  const pairCookie = pairing.response.headers.get("set-cookie").split(";")[0];
  assert.match(pairing.data.code, /^[A-F0-9]{8}$/);
  assert.equal(
    (await request("/api/pair/status", { cookie: pairCookie, data: {} })).data
      .connected,
    false,
  );
  assert.throws(
    () => web.confirmPairing(room.id, "stranger", pairing.data.code),
    (e) => e.httpStatus === 403,
  );
  code(
    () => web.confirmPairing(unrelated.id, "unrelated", pairing.data.code),
    "PAIR_INVALID",
  );
  code(() => web.confirmPairing(room.id, alice.id, "BADCODE!"), "PAIR_INVALID");
  web.confirmPairing(room.id, alice.id, pairing.data.code.toLowerCase());
  code(
    () => web.confirmPairing(room.id, bob.id, pairing.data.code),
    "PAIR_INVALID",
  );
  const paired = await request("/api/pair/status", {
    cookie: pairCookie,
    data: {},
  });
  assert.equal(paired.data.connected, true);
  const pairedCookie = paired.response.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request(`/api/state?room=${room.id}`, { cookie: pairedCookie })).data
      .me,
    "X",
  );
  assert.equal(
    (await request("/api/pair/status", { cookie: pairCookie, data: {} }))
      .status,
    200,
  );
  assert.equal((await request("/api/pair/status", { data: {} })).status, 410);
  const expiredPair = await request("/api/pair", {
    data: { roomId: unrelated.id },
  });
  clock += 5 * 60_000;
  code(
    () => web.confirmPairing(unrelated.id, "unrelated", expiredPair.data.code),
    "PAIR_INVALID",
  );
  // Restore test clock before the active match's turn deadline.
  clock -= 5 * 60_000;
  assert.equal(
    (
      await request("/api/move", {
        cookie: aCookie,
        data: { roomId: room.id, cell: 0, version: room.version },
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/move", { cookie: aCookie, raw: "{" })).status,
    400,
  );
  assert.equal(
    (
      await request("/api/move", {
        cookie: aCookie,
        raw: JSON.stringify({ junk: "x".repeat(2100) }),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await request("/api/move", {
        cookie: aCookie,
        data: { roomId: room.id, cell: 0, version: room.version },
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );

  const controllers = [
    new AbortController(),
    new AbortController(),
    new AbortController(),
  ];
  const readers = await Promise.all(
    [aCookie, bCookie, null].map(async (cookie, index) => {
      const response = await fetch(
        `${config.origin}/api/events?room=${room.id}`,
        {
          headers: cookie ? { Cookie: cookie } : {},
          signal: controllers[index].signal,
        },
      );
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      const first = await reader.read();
      assert.match(new TextDecoder().decode(first.value), /"moves":0/);
      return reader;
    }),
  );
  const live = readers.map((reader) => reader.read());
  const move = await request("/api/move", {
    cookie: aCookie,
    data: { roomId: room.id, cell: 112, version: room.version },
  });
  assert.equal(move.status, 200);
  for (const next of await Promise.all(live)) {
    const text = new TextDecoder().decode(next.value);
    assert.match(text, /"moves":1/);
    assert.match(text, /"lastCell":112/);
  }
  assert.equal(
    (
      await request("/api/move", {
        cookie: aCookie,
        data: { roomId: room.id, cell: 113, version: room.version },
      })
    ).status,
    409,
  );
  const refreshed = await request(`/api/state?room=${room.id}`, {
    cookie: bCookie,
  });
  assert.equal(
    refreshed.data.board[112],
    "X",
    "reload/reconnect returns the committed board",
  );
  assert.equal(refreshed.data.turn, "O");
  const ended = readers.map((reader) => reader.read());
  const leave = await request("/api/leave", {
    cookie: bCookie,
    data: { roomId: room.id },
  });
  assert.equal(leave.data.winner, "X");
  for (const next of await Promise.all(ended)) {
    assert.match(new TextDecoder().decode(next.value), /"reason":"resign"/);
  }
  const resultPayload = roomPayload(store.get(room.id), web.roomUrl(room.id));
  assert.match(resultPayload.embeds[0].toJSON().description, /Alice.*thắng!/);
  assert.equal(resultPayload.components[0].toJSON().components[0].style, 5);
  for (const controller of controllers) controller.abort();
  for (const reader of readers) await reader.cancel().catch(() => {});

  const ticketUrl = web.issueTicket(room.id, alice.id),
    ticket = new URL(ticketUrl).hash.slice(8);
  clock += 5 * 60_000;
  assert.equal(
    (await request("/api/login", { data: { ticket } })).status,
    401,
    "expired tickets are rejected",
  );
  clock += 12 * 60 * 60_000;
  assert.equal(
    (await request(`/api/state?room=${room.id}`, { cookie: aCookie })).status,
    200,
    "expired player sessions fall back to watching",
  );
  assert.equal(
    (await request(`/api/state?room=${room.id}`, { cookie: aCookie })).data.me,
    null,
  );
  const page = await fetch(config.origin + `/room/${room.id}`);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(await page.text(), /Caro · Bàn đấu trực tiếp/);

  // Exercise the actual browser renderer without a network or a browser dependency.
  const elements = new Map();
  const element = () => ({
    style: { setProperty() {} },
    hidden: false,
    disabled: false,
    textContent: "",
    open: false,
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {},
    append() {},
    close() {
      this.open = false;
    },
    showModal() {
      this.open = true;
    },
  });
  const sandbox = {
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/" },
    history: { replaceState() {} },
    URLSearchParams,
    Date,
    setInterval() {},
    clearTimeout() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../src/caro/public/app.js"), "utf8"),
    sandbox,
  );
  const browserRoom = match();
  sandbox.next = store.snapshot(browserRoom, null);
  vm.runInContext("accept(next); connection(true)", sandbox);
  assert.match(elements.get("status-label").textContent, /XEM TRỰC TIẾP/);
  assert.equal(elements.get("leave").hidden, true);
  assert.equal(vm.runInContext("cells.every(c => c.disabled)", sandbox), true);
  sandbox.next = store.snapshot(browserRoom, alice.id);
  vm.runInContext("accept(next)", sandbox);
  assert.equal(elements.get("leave").hidden, false);
  assert.equal(vm.runInContext("cells[0].disabled", sandbox), false);
  elements.get("leave-dialog").open = true;
  sandbox.next = store.snapshot(store.leave(browserRoom.id, bob.id), null);
  vm.runInContext("accept(next)", sandbox);
  assert.equal(elements.get("leave-dialog").open, false);
  assert.match(elements.get("status-title").textContent, /Alice.*thắng/);
  sandbox.next = store.snapshot(custom, alice.id);
  vm.runInContext("state = null; accept(next)", sandbox);
  assert.equal(vm.runInContext("cells.length", sandbox), 81);
  assert.match(elements.get("board-caption").textContent, /9 × 9 · Đúng 3/);
  assert.match(
    elements.get("rules-detail").textContent,
    /Chặn 2 đầu không thắng/,
  );

  // A second test-only game proves shared sessions and strict routing/projection boundaries.
  const {
    createWebServer: createSharedServer,
  } = require("../src/webGames/http");
  const { createGame } = require("../src/caro/webGame");
  const privateEvents = new (require("node:events").EventEmitter)();
  const privateRoom = { id: room.id, status: "playing", version: 0 };
  let privateMoves = 0;
  const privateGame = {
    id: "private-test",
    name: "Private test",
    publicDir: path.join(__dirname, "../src/caro/public"),
    errors: {},
    isOpen: () => true,
    store: {
      events: privateEvents,
      sweep() {},
      get: (id) => (id === privateRoom.id ? privateRoom : null),
      seat: (r, user) => (user === alice.id ? "X" : null),
      snapshot: (r, user) => ({
        id: r.id,
        version: r.version,
        secret: user === alice.id ? "own-ships" : null,
      }),
    },
    actions: {
      move: () => {
        privateMoves++;
        privateRoom.version++;
        return privateRoom;
      },
    },
  };
  const sharedConfig = { origin: "", secure: false };
  sharedWeb = createSharedServer({
    games: [createGame({ store }), privateGame],
    legacyGame: "caro",
    config: sharedConfig,
    now,
  });
  await new Promise((resolve) =>
    sharedWeb.server.listen(0, "127.0.0.1", resolve),
  );
  sharedConfig.origin = `http://127.0.0.1:${sharedWeb.server.address().port}`;
  async function sharedRequest(route, { cookie, data } = {}) {
    const response = await fetch(sharedConfig.origin + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data
          ? { Origin: sharedConfig.origin, "Content-Type": "application/json" }
          : {}),
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
  const portal = await fetch(sharedConfig.origin + "/");
  assert.match(await portal.text(), /href="\/caro\/"/);
  assert.match(
    await (await fetch(sharedConfig.origin + "/portal.js")).text(),
    /ticket/,
  );
  assert.equal((await fetch(sharedConfig.origin + "/caro/app.js")).status, 200);
  assert.equal(
    (await fetch(sharedConfig.origin + "/battleship/app.js")).status,
    404,
  );
  const oldLink = await fetch(sharedConfig.origin + `/room/${room.id}`, {
    redirect: "manual",
  });
  assert.equal(oldLink.headers.get("location"), `/caro/room/${room.id}`);
  assert.equal(
    (await sharedRequest(`/api/games/caro/state?room=${room.id}`)).data.rules
      .size,
    15,
  );
  assert.equal(
    (await sharedRequest(`/api/games/private-test/state?room=${room.id}`)).data
      .secret,
    null,
  );
  assert.equal(
    (await sharedRequest(`/api/games/missing/state?room=${room.id}`)).status,
    404,
  );
  const sharedTicket = new URL(
    sharedWeb.issueTicket("caro", room.id, alice.id),
  ).hash.slice(8);
  assert.equal(
    (
      await sharedRequest("/api/games/private-test/login", {
        data: { ticket: sharedTicket },
      })
    ).status,
    401,
  );
  const sharedLogin = await sharedRequest("/api/games/caro/login", {
    data: { ticket: sharedTicket },
  });
  assert.equal(sharedLogin.status, 200);
  assert.equal(
    (
      await sharedRequest(`/api/games/private-test/state?room=${room.id}`, {
        cookie: sharedLogin.cookie,
      })
    ).data.secret,
    "own-ships",
    "one confirmed browser session works across registered games",
  );
  assert.equal(
    (
      await sharedRequest("/api/games/private-test/move", {
        data: { roomId: room.id },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await sharedRequest("/api/games/private-test/move", {
        cookie: sharedLogin.cookie,
        data: { roomId: room.id },
      })
    ).status,
    200,
  );
  assert.equal(privateMoves, 1);
  assert.notEqual(store.get(room.id).version, privateRoom.version);
  const crossPair = await sharedRequest("/api/games/private-test/pair", {
    data: { roomId: room.id },
  });
  code(
    () =>
      sharedWeb.confirmPairing("caro", room.id, alice.id, crossPair.data.code),
    "PAIR_INVALID",
  );
  sharedWeb.confirmPairing(
    "private-test",
    room.id,
    alice.id,
    crossPair.data.code,
  );
  assert.equal(
    (
      await sharedRequest("/api/games/caro/pair/status", {
        cookie: crossPair.cookie,
        data: {},
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await sharedRequest("/api/games/private-test/pair/status", {
        cookie: crossPair.cookie,
        data: {},
      })
    ).data.connected,
    true,
  );
  const spectatorController = new AbortController();
  const spectatorResponse = await fetch(
    sharedConfig.origin + `/api/games/private-test/events?room=${room.id}`,
    { signal: spectatorController.signal },
  );
  const spectatorReader = spectatorResponse.body.getReader();
  assert.match(
    new TextDecoder().decode((await spectatorReader.read()).value),
    /"secret":null/,
  );
  const privateUpdate = spectatorReader.read();
  privateEvents.emit(room.id, { ...privateRoom, version: 2 });
  const privateText = new TextDecoder().decode((await privateUpdate).value);
  assert.match(privateText, /"version":2/);
  assert.doesNotMatch(privateText, /own-ships/);
  spectatorController.abort();
  await spectatorReader.cancel().catch(() => {});
  await sharedWeb.stop();
  sharedWeb = null;

  // Discord editors with identical room IDs in different games must stay separate too.
  const { createRuntime } = require("../src/webGames/runtime");
  privateRoom.messageId = "fixture-message";
  const sentGames = [],
    acknowledgedGames = [];
  const runtimeFixtures = ["first", "second"].map((id) => ({
    ...privateGame,
    id,
    discord: {
      pending: () => [{ id: privateRoom.id }],
      payload: () => ({ content: id }),
      acknowledge: () => {
        acknowledgedGames.push(id);
        return 1;
      },
      restore() {},
      discard() {},
    },
  }));
  const fixtureRuntime = createRuntime({ games: runtimeFixtures });
  for (const game of runtimeFixtures)
    fixtureRuntime.bindInteraction(game.id, privateRoom.id, {
      editReply: async (payload) => sentGames.push(payload.content),
    });
  await fixtureRuntime.syncMessages({
    channels: {
      fetch: () => {
        throw Error("unexpected bot route");
      },
    },
  });
  assert.deepEqual(sentGames, ["first", "second"]);
  assert.deepEqual(acknowledgedGames, ["first", "second"]);
  await fixtureRuntime.stop();

  const command = require("../src/commands/caro");
  assert.equal(command.data.toJSON().name, "caro");
  assert.deepEqual(
    command.data
      .toJSON()
      .options.find((o) => o.name === "choi")
      .options.map((o) => o.name),
    ["kichthuoc", "sothang", "chan2dau", "bienchan", "dungsoquan", "thoigian"],
  );
  const replies = [];
  await command.execute({
    guildId: "g",
    options: { getSubcommand: () => "choi" },
    reply: async (p) => replies.push(p),
  });
  assert.match(replies[0].content, /chưa được bật/);
  assert.ok(replies[0].flags);
  // Exercise Discord lobby creation and component routing without sending any Discord request.
  const runtime = require("../src/caro/runtime");
  const originalAvailable = runtime.isAvailable,
    originalIssue = runtime.issueTicket,
    originalConfirm = runtime.confirmPairing;
  runtime.isAvailable = () => true;
  runtime.issueTicket = (id, userId) =>
    `https://caro.example/#ticket=${id}-${userId}`;
  try {
    const messages = [];
    const interaction = {
      guildId: "discord-test",
      channelId: "discord-channel",
      user: alice,
      options: { getSubcommand: () => "choi" },
      deferReply: async () => {},
      deferUpdate: async () => {},
      followUp: async (payload) => messages.push(payload),
      editReply: async (payload) => {
        messages.push(payload);
        return { id: "lobby-message" };
      },
    };
    await command.execute(interaction);
    assert.equal(messages.length, 1);
    assert.match(messages[0].embeds[0].toJSON().title, /CHỜ ĐỐI THỦ/);
    const lobby = JSON.parse(
      db
        .prepare(
          "SELECT data_json FROM caro_rooms WHERE guild_id='discord-test'",
        )
        .get().data_json,
    );
    assert.equal(lobby.messageId, "lobby-message");
    // A slash response must still update when the permanent bot route cannot access the channel.
    const deniedClient = {
      channels: {
        fetch: async () => {
          throw Object.assign(new Error("Missing Access"), { code: 50001 });
        },
      },
    };
    const router = require("../src/componentRouter");
    const button = {
      ...interaction,
      user: bob,
      customId: `caro:join:${lobby.id}`,
      message: { id: "lobby-message" },
      isButton: () => true,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
    };
    assert.equal(await router.routeComponentInteraction(button), true);
    assert.equal(runtime.store.get(lobby.id).players.O.id, bob.id);
    assert.match(messages.at(-1).content, /Đã tham gia/);
    const link = messages[0].components[0]
      .toJSON()
      .components.find((c) => c.style === 5);
    assert.ok(link.url.endsWith(`/room/${lobby.roomCode}`));
    assert.equal(link.custom_id, undefined);
    let modal;
    await command.handleButton({
      ...button,
      customId: `caro:connect:${lobby.id}`,
      showModal: async (p) => {
        modal = p.toJSON();
      },
    });
    assert.equal(modal.custom_id, `caro:confirm:${lobby.id}`);
    let confirmation;
    runtime.confirmPairing = (...args) => {
      confirmation = args;
    };
    await router.routeComponentInteraction({
      ...button,
      message: undefined,
      customId: modal.custom_id,
      isButton: () => false,
      isModalSubmit: () => true,
      fields: { getTextInputValue: () => "AB12CD34" },
    });
    assert.deepEqual(confirmation, [lobby.id, bob.id, "AB12CD34"]);
    await command.handleButton({
      ...button,
      user: { id: "viewer" },
      customId: `caro:connect:${lobby.id}`,
      reply: async (p) => messages.push(p),
    });
    assert.match(messages.at(-1).content, /khán giả/);
    // The real runtime checks membership before issuing links; do the same in our ticket stub.
    runtime.issueTicket = (id, userId) => {
      if (!runtime.store.seat(runtime.store.get(id), userId))
        throw Object.assign(
          new Error("Bạn không phải người chơi của phòng này."),
          { code: "NOT_PLAYER" },
        );
      return `https://caro.example/#ticket=${id}`;
    };
    await command.handleButton({
      ...button,
      user: { id: "third" },
      customId: `caro:open:${lobby.id}`,
    });
    assert.match(messages.at(-1).content, /không phải người chơi/);
    await command.handleButton({ ...button, guildId: "wrong" });
    assert.match(messages.at(-1).content, /không thuộc phòng/);
    await command.handleButton({ ...button, message: { id: "wrong" } });
    assert.match(messages.at(-1).content, /không thuộc phòng/);
    // Retry after a partially successful join still allows opening the existing room.
    await command.handleButton({
      ...button,
      customId: `caro:open:${lobby.id}`,
    });
    assert.ok(messages.at(-1).components);
    await runtime.syncMessages(deniedClient);
    assert.match(messages.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    assert.match(messages.at(-1).embeds[0].toJSON().description, /<@bob>/);
    runtime.store.leave(lobby.id, alice.id);
    await runtime.syncMessages(deniedClient);
    assert.match(messages.at(-1).embeds[0].toJSON().title, /KẾT QUẢ/);
    assert.equal(
      db.prepare("SELECT ui_dirty FROM caro_rooms WHERE id=?").get(lobby.id)
        .ui_dirty,
      0,
    );
    // Slash options must reach the persisted rules and both displayed views.
    await command.execute({
      ...interaction,
      guildId: "settings-guild",
      channelId: "settings-channel",
      options: {
        getSubcommand: () => "choi",
        getInteger: (key) =>
          ({ kichthuoc: 25, sothang: 6, thoigian: 15 })[key] ?? null,
        getBoolean: (key) =>
          ({ chan2dau: true, bienchan: true, dungsoquan: true })[key] ?? null,
      },
    });
    const configuredRoom = JSON.parse(
      db
        .prepare(
          "SELECT data_json FROM caro_rooms WHERE guild_id='settings-guild'",
        )
        .get().data_json,
    );
    assert.equal(configuredRoom.board.length, 625);
    assert.deepEqual(configuredRoom.rules, {
      size: 25,
      winLength: 6,
      blockBothEnds: true,
      exactLength: true,
      edgeBlocks: true,
      timeMinutes: 15,
    });
    assert.match(
      messages.at(-1).embeds[0].toJSON().description,
      /Bàn 25×25 · Đúng 6 quân/,
    );
    sandbox.next = runtime.store.snapshot(configuredRoom, alice.id);
    vm.runInContext("state = null; accept(next)", sandbox);
    assert.equal(vm.runInContext("cells.length", sandbox), 625);
    assert.match(
      elements.get("rules-detail").textContent,
      /Mép bàn có tính chặn/,
    );
    runtime.store.leave(configuredRoom.id, alice.id);
    await runtime.syncMessages(deniedClient);
    // Missing access at command time must not leave a playable room with an unsyncable UI.
    const deniedReplies = [];
    await command.execute({
      ...interaction,
      channelId: "denied-channel",
      appPermissions: new (require("discord.js").PermissionsBitField)(0n),
      reply: async (payload) => deniedReplies.push(payload),
    });
    assert.match(deniedReplies[0].content, /View Channel/);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM caro_rooms WHERE channel_id='denied-channel'",
        )
        .get().n,
      0,
    );
    // After the interaction expires, use the bot route and retain the failed update for retry.
    const accessRoom = runtime.store.create({
      guildId: "access",
      channelId: "access-channel",
      user: alice,
    });
    runtime.store.attachMessage(accessRoom.id, "access-message");
    runtime.bindInteraction(accessRoom.id, {
      createdTimestamp: Date.now() - 16 * 60_000,
      editReply: async () => {
        throw Error("expired editor used");
      },
    });
    runtime.store.join(accessRoom.id, bob);
    const warnings = [];
    await runtime.syncMessages(deniedClient, {
      warn: (data, message) => warnings.push({ data, message }),
    });
    assert.equal(
      db
        .prepare("SELECT ui_dirty FROM caro_rooms WHERE id=?")
        .get(accessRoom.id).ui_dirty,
      1,
    );
    assert.equal(warnings[0].data.code, 50001);
    assert.equal(warnings[0].data.channelId, "access-channel");
    assert.equal(warnings[0].data.stage, "channel_fetch");
    // Restoring access must deliver the newest result rather than discard the dirty flag.
    runtime.bindInteraction(accessRoom.id, {
      editReply: async () => {
        throw Object.assign(new Error("Invalid Webhook Token"), {
          code: 50027,
        });
      },
    });
    runtime.store.leave(accessRoom.id, alice.id);
    await runtime.syncMessages({
      channels: {
        fetch: async () => ({
          messages: { edit: async (id, payload) => messages.push(payload) },
        }),
      },
    });
    assert.match(messages.at(-1).embeds[0].toJSON().description, /Bình thắng/);
    // An in-flight lobby update must not acknowledge a newer final result.
    const raceRoom = runtime.store.create({
      guildId: "race",
      channelId: "race",
      user: alice,
    });
    runtime.store.attachMessage(raceRoom.id, "race-message");
    runtime.store.join(raceRoom.id, bob);
    let releaseEdit;
    const editGate = new Promise((resolve) => {
      releaseEdit = resolve;
    });
    const racing = runtime.syncMessages({
      channels: { fetch: async () => ({ messages: { edit: () => editGate } }) },
    });
    await Promise.resolve();
    runtime.store.leave(raceRoom.id, bob.id);
    releaseEdit();
    await racing;
    assert.equal(
      db.prepare("SELECT ui_dirty FROM caro_rooms WHERE id=?").get(raceRoom.id)
        .ui_dirty,
      1,
    );
    await runtime.syncMessages({
      channels: {
        fetch: async () => ({
          messages: { edit: async (id, payload) => messages.push(payload) },
        }),
      },
    });
    assert.match(
      messages.at(-1).embeds[0].toJSON().description,
      /Alice.*thắng/,
    );
    // The live runtime must publish join/end events without waiting for its five-second sweep.
    const probe = require("node:net").createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const savedEnv = {
      CARO_WEB_ENABLED: process.env.CARO_WEB_ENABLED,
      CARO_WEB_PORT: process.env.CARO_WEB_PORT,
      CARO_PUBLIC_URL: process.env.CARO_PUBLIC_URL,
    };
    Object.assign(process.env, {
      CARO_WEB_ENABLED: "true",
      CARO_WEB_PORT: String(port),
      CARO_PUBLIC_URL: `http://127.0.0.1:${port}`,
    });
    const deliveries = [];
    await runtime.start({
      channels: {
        fetch: async () => ({
          messages: {
            edit: async (id, payload) => deliveries.push({ id, payload }),
          },
        }),
      },
    });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    async function waitDelivery(title) {
      const deadline = Date.now() + 1500;
      while (
        !deliveries.some((d) =>
          d.payload.embeds[0].toJSON().title.includes(title),
        )
      ) {
        if (Date.now() > deadline)
          throw Error(`Missing immediate Discord update: ${title}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    const liveRoom = runtime.store.create({
      guildId: "live",
      channelId: "live",
      user: alice,
    });
    runtime.store.attachMessage(liveRoom.id, "live-message");
    runtime.store.join(liveRoom.id, bob);
    await waitDelivery("ĐANG ĐẤU");
    runtime.store.leave(liveRoom.id, alice.id);
    await waitDelivery("KẾT QUẢ");
    assert.match(
      deliveries.at(-1).payload.embeds[0].toJSON().description,
      /Bình thắng/,
    );
    const failInteraction = {
      ...interaction,
      channelId: "failed-channel",
      editReply: async () => {
        throw Error("test send failure");
      },
    };
    await assert.rejects(
      () => command.execute(failInteraction),
      /test send failure/,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM caro_seats WHERE guild_id='discord-test'",
        )
        .get().n,
      0,
    );
    let releaseFetch,
      continuedAfterStop = false;
    const gate = new Promise((resolve) => {
      releaseFetch = resolve;
    });
    db.prepare("UPDATE caro_rooms SET ui_dirty=1 WHERE id=?").run(lobby.id);
    const blockedSync = runtime.syncMessages({
      channels: { fetch: () => gate },
    });
    await runtime.stop();
    releaseFetch({
      messages: {
        edit: () => {
          continuedAfterStop = true;
          throw new Error("notification continued during shutdown");
        },
      },
    });
    await blockedSync;
    assert.equal(
      continuedAfterStop,
      false,
      "shutdown does not continue Discord delivery",
    );
    // Configuration, list pagination, ownership and prefix equivalents work through the real command/router.
    const directoryReplies = [];
    const directoryInteraction = {
      ...interaction,
      guildId: "directory",
      channelId: "directory-channel",
      reply: async (payload) => directoryReplies.push(payload),
      editReply: async (payload) => directoryReplies.push(payload),
      options: { getSubcommand: () => "cauhinh", getInteger: () => 7 },
    };
    await command.execute(directoryInteraction);
    assert.match(directoryReplies.at(-1).content, /Chỉ quản trị/);
    assert.equal(
      runtime.store.getChannelLimit("directory", "directory-channel"),
      5,
    );
    const administrator = {
      has: (permission) =>
        permission === require("discord.js").PermissionFlagsBits.Administrator,
    };
    await command.execute({
      ...directoryInteraction,
      memberPermissions: administrator,
    });
    assert.equal(
      runtime.store.getChannelLimit("directory", "directory-channel"),
      7,
    );
    await command.execute({
      ...directoryInteraction,
      memberPermissions: administrator,
      options: {
        getSubcommand: () => "cauhinh",
        getInteger: () => 3,
        getChannel: () => ({
          id: "configured-other-channel",
          guildId: "directory",
        }),
      },
    });
    assert.equal(
      runtime.store.getChannelLimit("directory", "configured-other-channel"),
      3,
    );
    assert.equal(
      runtime.store.getChannelLimit("directory", "directory-channel"),
      7,
    );
    const directoryRooms = Array.from({ length: 7 }, (_, i) =>
      runtime.store.create({
        guildId: "directory",
        channelId: "directory-channel",
        user: { id: `directory-${i}` },
      }),
    );
    const showDirectory = {
      ...directoryInteraction,
      options: { getSubcommand: () => "phong" },
    };
    await command.execute(showDirectory);
    assert.equal(directoryReplies.at(-1).embeds[0].toJSON().fields.length, 5);
    assert.match(
      directoryReplies.at(-1).embeds[0].toJSON().footer.text,
      /7 phòng.*Trang 1\/2/,
    );
    assert.equal(
      directoryReplies.at(-1).flags,
      require("discord.js").MessageFlags.Ephemeral,
    );
    const firstPageIds = new Set(
      directoryReplies
        .at(-1)
        .embeds[0].toJSON()
        .fields.map((f) => f.name.slice(-8)),
    );
    const nextButton = directoryReplies
      .at(-1)
      .components.at(-1)
      .toJSON()
      .components.at(-1);
    await router.routeComponentInteraction({
      ...button,
      ...directoryInteraction,
      customId: nextButton.custom_id,
    });
    assert.equal(directoryReplies.at(-1).embeds[0].toJSON().fields.length, 2);
    assert.match(
      directoryReplies.at(-1).embeds[0].toJSON().footer.text,
      /Trang 2\/2/,
    );
    for (const field of directoryReplies.at(-1).embeds[0].toJSON().fields)
      assert.equal(firstPageIds.has(field.name.slice(-8)), false);
    const stranger = {
      ...button,
      ...directoryInteraction,
      user: { id: "stranger" },
      customId: nextButton.custom_id,
    };
    await command.handleButton(stranger);
    assert.match(directoryReplies.at(-1).content, /Chỉ người mở danh sách/);
    for (const r of directoryRooms) runtime.store.leave(r.id, r.players.X.id);
    await command.handleButton({
      ...button,
      ...directoryInteraction,
      customId: nextButton.custom_id,
    });
    assert.match(
      directoryReplies.at(-1).embeds[0].toJSON().description,
      /Chưa có phòng/,
    );
    assert.match(
      directoryReplies.at(-1).embeds[0].toJSON().footer.text,
      /Trang 1\/1/,
    );
    const prefixReplies = [];
    const prefixMessage = {
      guildId: "directory",
      channelId: "directory-channel",
      author: alice,
      content: "!caro cauhinh phongtoida=6",
      member: { permissions: administrator },
      channel: {},
      reply: async (payload) => {
        prefixReplies.push(payload);
        return { id: "prefix-reply" };
      },
    };
    const { handleSlashPrefix } = require("../src/services/slashPrefixService");
    assert.equal(await handleSlashPrefix(prefixMessage), true);
    assert.equal(
      runtime.store.getChannelLimit("directory", "directory-channel"),
      6,
    );
    await handleSlashPrefix({ ...prefixMessage, content: "!caro phong" });
    assert.match(
      prefixReplies.at(-1).embeds[0].toJSON().title,
      /DANH SÁCH PHÒNG/,
    );
    await handleSlashPrefix({
      ...prefixMessage,
      guildId: "prefix-clock",
      content: "!caro choi thoigian=10",
    });
    assert.equal(
      runtime.store.listOpen("prefix-clock", "directory-channel")[0].rules
        .timeMinutes,
      10,
    );
  } finally {
    runtime.isAvailable = originalAvailable;
    runtime.issueTicket = originalIssue;
    runtime.confirmPairing = originalConfirm;
  }
  assert.ok(
    require("../src/commandRegistry")
      .loadCommands()
      .some((c) => c.data.toJSON().name === "caro"),
  );
  console.log(
    JSON.stringify({
      ok: true,
      caro: "configurable rules, legacy rooms, shared web routing/sessions, private projections, live sync, Discord registration",
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
    if (sharedWeb) await sharedWeb.stop();
    if (reopened?.open) reopened.close();
    if (db.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
