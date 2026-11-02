"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "caro-test-"));
process.env.DB_PATH = path.join(directory, "caro.sqlite");
const { db } = require("../src/db");
const {
  createStore,
  WAIT_MS,
  TURN_MS,
  MATCH_MS,
} = require("../src/caro/store");
const { SIZE, winningLine } = require("../src/caro/engine");
const { createWebServer } = require("../src/caro/http");
const { readConfig } = require("../src/caro/config");
const { roomPayload } = require("../src/caro/discord");
const vm = require("node:vm");
let clock = Date.now(),
  serial = 0,
  web,
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

  let room = create();
  code(() => store.join(room.id, alice), "SELF_JOIN");
  code(() => create(bob, room.guildId), "CHANNEL_BUSY");
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
  clock += TURN_MS;
  code(() => store.move(room.id, alice.id, 0, room.version), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "timeout");
  assert.equal(store.get(room.id).winner, "O");
  room = create();
  clock += WAIT_MS;
  code(() => store.join(room.id, bob), "ROOM_CLOSED");
  assert.equal(store.get(room.id).reason, "expired");
  room = match();
  // Duration only wins the race if its deadline is earlier than the current turn deadline.
  const payload = JSON.parse(
    db.prepare("SELECT data_json FROM caro_rooms WHERE id=?").get(room.id)
      .data_json,
  );
  payload.matchDeadline = clock + 1000;
  db.prepare("UPDATE caro_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(payload),
    room.id,
  );
  clock += MATCH_MS;
  assert.equal(store.get(room.id).reason, "duration");
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
  assert.equal(restartStore.get(persisted.id).turnDeadline, clock + TURN_MS);
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
    410,
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

  const command = require("../src/commands/caro");
  assert.equal(command.data.toJSON().name, "caro");
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
    assert.ok(link.url.endsWith(`/room/${lobby.id}`));
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
    await runtime.syncMessages({
      channels: {
        fetch: async () => ({
          messages: {
            edit: async (id, payload) => messages.push(payload),
          },
        }),
      },
    });
    assert.match(messages.at(-1).embeds[0].toJSON().title, /ĐANG ĐẤU/);
    assert.match(messages.at(-1).embeds[0].toJSON().description, /<@bob>/);
    runtime.store.leave(lobby.id, alice.id);
    await runtime.syncMessages({
      channels: {
        fetch: async () => ({
          messages: {
            edit: async (id, payload) => {
              assert.equal(id, "lobby-message");
              messages.push(payload);
            },
          },
        }),
      },
    });
    assert.match(messages.at(-1).embeds[0].toJSON().title, /KẾT QUẢ/);
    assert.equal(
      db.prepare("SELECT ui_dirty FROM caro_rooms WHERE id=?").get(lobby.id)
        .ui_dirty,
      0,
    );
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
      caro: "engine, rooms, persistence, two-client sync, authentication, HTTP, Discord registration",
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
    if (reopened?.open) reopened.close();
    if (db.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
