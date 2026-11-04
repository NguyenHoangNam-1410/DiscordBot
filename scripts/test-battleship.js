"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const Database = require("better-sqlite3");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "battleship-test-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");
const { db } = require("../src/db");
const { createStore, WAIT_MS } = require("../src/battleship/store");
const { PRESETS, normalizeRules } = require("../src/battleship/rules");
const {
  generateFleet,
  cellsOf,
  placementError,
  randomPlacement,
  shotView,
  sunkCount,
  remainingFleet,
} = require("../src/battleship/engine");
const { createGame } = require("../src/battleship/webGame");
const { createWebServer } = require("../src/webGames/http");
const { roomPayload, roomsPayload } = require("../src/battleship/discord");
let clock = Date.now(),
  serial = 0,
  web;
const now = () => clock,
  store = createStore(db, now);
const x = { id: "alice", username: "Alice <script>" },
  o = { id: "bob", username: "Bình" };
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);
const create = (mode = "small", rules = {}) =>
  store.create({
    guildId: `g${++serial}`,
    channelId: "c",
    user: x,
    rules: { mode, ...rules },
  });
const setup = (mode) => store.join(create(mode).id, o);
function battle(mode = "small", rules = {}) {
  let room = store.join(create(mode, rules).id, o);
  room = store.randomize(room.id, x.id, 0);
  room = store.randomize(room.id, o.id, 0);
  room = store.ready(room.id, x.id, 1);
  return store.ready(room.id, o.id, 1);
}
function allCells(room, mark) {
  return room.placements[mark].flatMap((ship) =>
    cellsOf(ship, room.fleet[ship.id], PRESETS[room.rules.mode].size),
  );
}
function assertFinalFleets(room) {
  assert.equal(room.status, "finished");
  for (const user of [x.id, o.id, "viewer", null]) {
    const final = store.snapshot(room, user);
    assert.deepEqual(final.revealedPlacements, room.placements);
    // Revealing ships must not invent shots, hits or sunk ships.
    assert.equal(final.boards.X.length, room.shots.O.length);
    assert.equal(final.boards.O.length, room.shots.X.length);
  }
  const copy = store.snapshot(room, null).revealedPlacements;
  if (copy.X.length) {
    copy.X[0].cell = -1;
    assert.notEqual(room.placements.X[0].cell, -1);
  }
}
async function main() {
  for (const mode of ["bad", null, 1, "Nhỏ"]) {
    if (mode !== null) code(() => normalizeRules({ mode }), "INVALID_RULES");
  }
  code(() => normalizeRules({ timeMinutes: 0 }), "INVALID_RULES");
  for (const [mode, preset] of Object.entries(PRESETS)) {
    for (let i = 0; i < 40; i++) {
      const fleet = generateFleet(mode);
      assert.equal(fleet.length, preset.count);
      for (let n = 2; n <= preset.maxLength; n++) assert(fleet.includes(n));
      assert(fleet.every((n) => n >= 2 && n <= preset.maxLength));
      const placements = randomPlacement(fleet, preset.size);
      assert.equal(placementError(placements, fleet, preset.size, true), null);
    }
    const worst = Array(preset.count).fill(preset.maxLength);
    for (let n = 2; n < preset.maxLength; n++) worst[n - 2] = n;
    assert.equal(
      placementError(
        randomPlacement(worst, preset.size),
        worst,
        preset.size,
        true,
      ),
      null,
    );
    let room = setup(mode);
    assert.equal(room.setupDeadline - clock, preset.count * 20_000);
    assert.deepEqual(
      store.snapshot(room, x.id).fleet,
      store.snapshot(room, o.id).fleet,
    );
    store.leave(room.id, x.id);
  }
  const fleet = [2, 3],
    ship = { id: 0, cell: 0, orientation: "h" };
  assert.equal(
    placementError([ship, { id: 1, cell: 10, orientation: "h" }], fleet, 8),
    null,
    "diagonal contact is legal",
  );
  for (const next of [2, 8])
    assert.equal(
      placementError([ship, { id: 1, cell: next, orientation: "h" }], fleet, 8),
      "SHIP_ADJACENT",
    );
  assert.equal(
    placementError([ship, { id: 1, cell: 1, orientation: "v" }], fleet, 8),
    "SHIP_OVERLAP",
  );
  for (const bad of [
    { id: 0, cell: 7, orientation: "h" },
    { id: 0, cell: 56, orientation: "v" },
    { id: 0, cell: -1, orientation: "h" },
    { id: 0, cell: 0, orientation: "diagonal" },
  ])
    assert.equal(placementError([bad], fleet, 8), "SHIP_OUTSIDE");
  for (const bad of [
    null,
    {},
    [ship, ship],
    [{ ...ship, id: 8 }],
    [{ ...ship, id: 0.5 }],
  ])
    assert.equal(placementError(bad, fleet, 8), "INVALID_FLEET");
  assert.equal(placementError([ship], fleet, 8, true), "INCOMPLETE_FLEET");
  assert.deepEqual(
    shotView(1, [ship], fleet, 8),
    { cell: 1, hit: true },
    "body hits do not reveal orientation or ship identity",
  );
  assert.deepEqual(shotView(0, [ship], fleet, 8), {
    cell: 0,
    hit: true,
    bow: "h",
  });
  assert.equal(sunkCount([ship], [0], fleet, 8), 0);
  assert.equal(sunkCount([ship], [0, 1], fleet, 8), 1);
  for (const [orientation, cells] of Object.entries({
    h: [18, 19, 20],
    v: [18, 26, 34],
    right: [18, 17, 16],
    down: [18, 10, 2],
  })) {
    const placed = { id: 1, cell: 18, orientation };
    assert.deepEqual(cellsOf(placed, 3, 8), cells);
    assert.equal(placementError([placed], fleet, 8), null);
    assert.deepEqual(shotView(18, [placed], fleet, 8), {
      cell: 18,
      hit: true,
      bow: orientation,
    });
    assert.deepEqual(shotView(cells[1], [placed], fleet, 8), {
      cell: cells[1],
      hit: true,
    });
  }
  assert.equal(cellsOf({ cell: 1, orientation: "right" }, 3, 8), null);
  assert.equal(cellsOf({ cell: 8, orientation: "down" }, 3, 8), null);
  const counterShips = [ship, { id: 1, cell: 18, orientation: "right" }];
  assert.deepEqual(remainingFleet(counterShips, [], fleet, 8), { 2: 1, 3: 1 });
  assert.deepEqual(remainingFleet(counterShips, [0], fleet, 8), { 2: 1, 3: 1 });
  assert.deepEqual(remainingFleet(counterShips, [0, 1], fleet, 8), {
    2: 0,
    3: 1,
  });
  assert.deepEqual(remainingFleet(counterShips, [0, 1, 18, 17, 16], fleet, 8), {
    2: 0,
    3: 0,
  });
  assert.deepEqual(
    remainingFleet(
      [ship, { id: 1, cell: 18, orientation: "right" }],
      [0, 1],
      [2, 2],
      8,
    ),
    { 2: 1 },
  );

  let facingRoom = setup();
  for (const orientation of ["h", "v", "right", "down"]) {
    facingRoom = store.place(
      facingRoom.id,
      x.id,
      [{ id: 0, cell: 36, orientation }],
      facingRoom.setupRevision.X,
    );
    assert.equal(
      createStore(db, now).get(facingRoom.id).placements.X[0].orientation,
      orientation,
    );
    assert.deepEqual(store.snapshot(facingRoom, null).placements, []);
  }
  store.leave(facingRoom.id, x.id);

  let room = setup();
  code(() => store.join(room.id, { id: "third" }), "ROOM_FULL");
  code(() => store.ready(room.id, x.id, 0), "INCOMPLETE_FLEET");
  code(() => store.place(room.id, "viewer", [], 0), "NOT_PLAYER");
  code(() => store.shoot(room.id, x.id, 0, room.version), "NOT_STARTED");
  code(() => store.place(room.id, x.id, [], 99), "STALE_BOARD");
  const unchanged = JSON.stringify(store.get(room.id));
  code(
    () => store.place(room.id, x.id, [{ id: 0, cell: 7, orientation: "h" }], 0),
    "SHIP_OUTSIDE",
  );
  assert.equal(JSON.stringify(store.get(room.id)), unchanged);
  const px = randomPlacement(room.fleet, 8),
    po = randomPlacement(room.fleet, 8);
  room = store.place(room.id, x.id, px, 0);
  room = store.place(room.id, o.id, po, 0); // Independent revisions avoid conflicts between simultaneous setups.
  assert.equal(room.setupRevision.X, 1);
  assert.equal(room.setupRevision.O, 1);
  assert.deepEqual(store.snapshot(room, o.id).placements, po);
  for (const user of [null, "viewer"]) {
    assert.deepEqual(store.snapshot(room, user).placements, []);
    assert.equal(store.snapshot(room, user).setupRevision, null);
  }
  assert.deepEqual(store.snapshot(room, null).placements, []);
  assert.deepEqual(store.snapshot(room, x.id).placements, px);
  room = store.ready(room.id, x.id, 1);
  assert.equal(room.status, "setup");
  clock += 20_000;
  assert.equal(
    store.snapshot(store.get(room.id), x.id).clocks.X,
    1_800_000,
    "battle clock does not run during setup",
  );
  code(() => store.randomize(room.id, x.id, 2), "ALREADY_READY");
  room = store.ready(room.id, o.id, 1);
  assert.equal(room.status, "playing");
  assert.equal(room.turn, "X");
  code(() => store.place(room.id, x.id, [], 2), "NOT_SETUP");
  code(() => store.shoot(room.id, o.id, 0, room.version), "NOT_TURN");
  code(() => store.shoot(room.id, x.id, -1, room.version), "INVALID_CELL");
  code(() => store.shoot(room.id, x.id, 64, room.version), "INVALID_CELL");
  const targets = allCells(room, "O"),
    water = Array.from({ length: 64 }, (_, i) => i).filter(
      (cell) => !allCells(room, "X").includes(cell),
    );
  const initialCounts = store.snapshot(room, null).remainingFleet.O;
  clock += 1000;
  const version = room.version;
  room = store.shoot(room.id, x.id, targets[0], room.version);
  assert.equal(room.turn, "O", "a hit still passes the turn");
  assert.equal(room.clocks.X, 1_799_000);
  assert.equal(room.lastAction.hit, true);
  assert.equal(room.lastAction.sunk, false);
  assert.deepEqual(
    store.snapshot(room, null).remainingFleet.O,
    initialCounts,
    "partial hits do not remove a ship from the tooltip",
  );
  for (const user of [null, o.id, "viewer"]) {
    const view = store.snapshot(room, user);
    assert.equal(view.revealedPlacements, null);
    assert.equal(view.boards.O.length, 1);
    assert.deepEqual(view.boards.O[0], shotView(targets[0], po, room.fleet, 8));
  }
  code(() => store.shoot(room.id, x.id, targets[1], version), "STALE_BOARD");
  for (let i = 1; i < targets.length; i++) {
    clock += 2000;
    room = store.shoot(room.id, o.id, water[i - 1], room.version);
    code(
      () => store.shoot(room.id, x.id, targets[0], room.version),
      "ALREADY_SHOT",
    );
    room = store.shoot(room.id, x.id, targets[i], room.version);
    if (i === room.fleet[po[0].id] - 1)
      assert.equal(
        store.snapshot(room, null).remainingFleet.O[room.fleet[po[0].id]],
        initialCounts[room.fleet[po[0].id]] - 1,
      );
    assert.equal(
      room.status,
      i === targets.length - 1 ? "finished" : "playing",
    );
  }
  assert.equal(room.winner, "X");
  assert.equal(room.reason, "win");
  assert.equal(store.snapshot(room, null).sunk.O, room.fleet.length);
  assert(
    Object.values(store.snapshot(room, null).remainingFleet.O).every(
      (count) => count === 0,
    ),
  );
  assert.deepEqual(store.snapshot(room, null).placements, []);
  assertFinalFleets(room);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM battleship_seats WHERE room_id=?")
      .get(room.id).n,
    0,
  );
  const stopped = store.snapshot(room, x.id).clocks;
  clock += 5000;
  assert.deepEqual(store.snapshot(store.get(room.id), x.id).clocks, stopped);
  const result = roomPayload(
    room,
    "https://example.com/battleship/",
  ).embeds[0].toJSON();
  assert.match(result.description, /thắng/);
  assert.equal(JSON.stringify(result).includes('"cell"'), false);

  room = setup("large");
  clock += 200_000;
  code(() => store.randomize(room.id, x.id, 0), "NOT_SETUP");
  assert.equal(store.get(room.id).reason, "setup_expired");
  assertFinalFleets(store.get(room.id));
  room = setup();
  room = store.randomize(room.id, x.id, 0);
  room = store.ready(room.id, x.id, 1);
  clock += 100_000;
  assert.equal(store.get(room.id).winner, "X");
  assert.equal(store.get(room.id).reason, "setup_timeout");
  assertFinalFleets(store.get(room.id));
  room = create();
  clock += WAIT_MS;
  assert.equal(store.get(room.id).reason, "expired");
  room = battle("small", { timeMinutes: 1 });
  clock += 60_000;
  code(() => store.shoot(room.id, x.id, 0, room.version), "ROOM_CLOSED");
  assert.equal(store.get(room.id).winner, "O");
  assert.equal(store.get(room.id).clocks.X, 0);
  assertFinalFleets(store.get(room.id));
  room = setup();
  assert.equal(store.leave(room.id, o.id).winner, "X");
  assertFinalFleets(store.get(room.id));
  room = create();
  assert.equal(store.leave(room.id, x.id).reason, "cancelled");
  room = battle();
  clock += 3000;
  const restoredDb = new Database(process.env.DB_PATH);
  const restored = createStore(restoredDb, now);
  assert.equal(
    restored.snapshot(restored.get(room.id), x.id).clocks.X,
    1_797_000,
  );
  assert.deepEqual(restored.get(room.id).placements, room.placements);
  restoredDb.close();

  const many = Array.from({ length: 5 }, (_, i) =>
    store.create({ guildId: "many", channelId: "many", user: { id: `p${i}` } }),
  );
  store.join(many[0].id, { id: "joined" });
  code(
    () =>
      store.create({
        guildId: "many",
        channelId: "many",
        user: { id: "sixth" },
      }),
    "CHANNEL_FULL",
  );
  code(
    () =>
      store.create({
        guildId: "many",
        channelId: "other",
        user: { id: "joined" },
      }),
    "ALREADY_PLAYING",
  );
  store.setChannelLimit("many", "many", 7, "admin");
  assert.equal(store.getChannelLimit("many", "many"), 7);
  const pages = roomsPayload(many, {
    ownerId: x.id,
    page: 1,
    limit: 7,
    guildId: "many",
    channelId: "many",
    roomUrl: (id) => `https://example.com/battleship/room/${id}`,
  });
  assert.match(pages.embeds[0].toJSON().footer.text, /1\/1/);

  // Real HTTP and SSE must project each viewer independently, including hidden setup edits.
  room = setup("large");
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store, db })], config, now });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = `http://127.0.0.1:${web.server.address().port}`;
  async function request(route, data, cookie, origin = config.origin) {
    const response = await fetch(
      `${config.origin}/api/games/battleship/${route}`,
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
  async function login(user) {
    const pair = await request("pair", { roomId: room.id });
    web.confirmPairing("battleship", room.id, user, pair.data.code);
    return request("pair/status", {
      roomId: room.id,
      pairingToken: pair.data.pairingToken,
    });
  }
  const lx = await login(x.id),
    lo = await login(o.id);
  assert.equal(lx.status, 200);
  assert.equal(lo.status, 200);
  assert.equal(
    (await request("place", { roomId: room.id, placements: [], revision: 0 }))
      .status,
    401,
  );
  assert.equal(
    (
      await request(
        "randomize",
        { roomId: room.id, revision: 0 },
        lx.cookie,
        "https://evil.example",
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
    [lx.cookie, lo.cookie, null].map(async (cookie, i) => {
      const res = await fetch(
        `${config.origin}/api/games/battleship/events?room=${room.id}`,
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
  const updates = readers.map((reader) => reader.read());
  const placed = await request(
    "place",
    {
      roomId: room.id,
      placements: randomPlacement(room.fleet, 12),
      revision: 0,
    },
    lx.cookie,
  );
  assert.equal(placed.status, 200);
  assert.equal(placed.data.placements.length, 10);
  const notifications = await Promise.all(updates);
  const values = notifications.map((n) =>
    JSON.parse(
      new TextDecoder().decode(n.value).split("data: ")[1].split("\n")[0],
    ),
  );
  assert.equal(values[0].placements.length, 10);
  assert.deepEqual(values[1].placements, []);
  assert.deepEqual(values[2].placements, []);
  assert.deepEqual(values[2].boards, { X: [], O: [] });
  for (const value of values) assert.equal(value.revealedPlacements, null);
  assert.deepEqual(
    (await request(`state?room=${room.id}`)).data.placements,
    [],
  );
  assert.equal(
    (await request(`state?room=${room.id}`, null, lo.cookie)).data
      .setupRevision,
    0,
  );
  const foreign = store.create({
    guildId: "foreign",
    channelId: "foreign",
    user: { id: "outsider" },
  });
  assert.equal(
    (await request("ready", { roomId: foreign.id, revision: 0 }, lx.cookie))
      .status,
    403,
  );
  const closingUpdates = readers.map((reader) => reader.read());
  store.leave(room.id, x.id);
  const finalUpdates = await Promise.all(closingUpdates);
  for (const update of finalUpdates) {
    const final = JSON.parse(
      new TextDecoder().decode(update.value).split("data: ")[1].split("\n")[0],
    );
    assert.equal(final.status, "finished");
    assert.deepEqual(final.revealedPlacements, store.get(room.id).placements);
  }
  for (const cookie of [lx.cookie, lo.cookie, null]) {
    const final = (await request(`state?room=${room.id}`, null, cookie)).data;
    assert.deepEqual(final.revealedPlacements, store.get(room.id).placements);
  }
  controllers.forEach((c) => c.abort());
  for (const reader of readers) await reader.cancel().catch(() => {});
  assert.equal(
    (await fetch(config.origin + `/battleship/room/${room.id}`)).status,
    200,
  );
  assert.equal((await fetch(config.origin + "/battleship/app.js")).status, 200);
  assert.match(await (await fetch(config.origin + "/")).text(), /Battleship/);
  await web.stop();
  web = null;

  // Execute the real browser source: touch fallback, private boards, turn switching and drag rotation.
  const elements = new Map(),
    events = {};
  let point = null,
    calls = [];
  function element() {
    const classes = new Set();
    return {
      hidden: false,
      disabled: false,
      textContent: "",
      dataset: {},
      checked: true,
      open: false,
      children: [],
      style: { setProperty() {} },
      classList: {
        add(...names) {
          names.forEach((n) => classes.add(n));
        },
        toggle(n, on) {
          if (on) classes.add(n);
          else classes.delete(n);
        },
        contains: (n) => classes.has(n),
      },
      events: {},
      setAttribute() {},
      setPointerCapture() {},
      append(...items) {
        this.children.push(...items);
      },
      replaceChildren(...items) {
        this.children = [...items];
      },
      addEventListener(n, fn) {
        this.events[n] = fn;
      },
      close() {
        this.open = false;
      },
      showModal() {
        this.open = true;
      },
      closest() {
        return this;
      },
    };
  }
  const context = {
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      addEventListener(n, fn) {
        events[n] = fn;
      },
      elementFromPoint() {
        return point;
      },
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/" },
    history: { replaceState() {} },
    Date,
    URLSearchParams,
    AbortSignal,
    requestAnimationFrame() {
      return 1;
    },
    setInterval() {},
    clearTimeout() {},
    fetch: async (url, options) => {
      calls.push({ url, data: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => store.snapshot(store.get(uiRoom.id), x.id),
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../src/battleship/public/app.js"),
      "utf8",
    ),
    context,
  );
  let uiRoom = setup();
  context.next = store.snapshot(uiRoom, x.id);
  vm.runInContext("accept(next); connection(true)", context);
  assert.equal(elements.get("setup-tools").hidden, false);
  assert.equal(elements.get("panel-O").hidden, true);
  assert.equal(elements.get("panel-X").hidden, false);
  assert.equal(elements.get("view-tabs").hidden, true);
  assert.equal(
    elements
      .get("board-O")
      .children.filter((el) => el.dataset.cell)
      .every((el) => el.disabled),
    true,
  );
  context.ship = { id: 0, cell: 0, orientation: "h" };
  vm.runInContext("selectedShip=0; orientation='h'", context);
  const tile = elements
    .get("board-X")
    .children.find((el) => el.dataset.cell === "0");
  await tile.events.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1).url, "/api/games/battleship/place");
  assert.equal(calls.at(-1).data.placements[0].cell, 0);
  const chip = elements.get("fleet").children[0];
  chip.events.pointerdown({
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  point = {
    dataset: { target: "X", cell: "18" },
    closest() {
      return this;
    },
  };
  events.pointermove({
    pointerId: 1,
    clientX: 30,
    clientY: 30,
    preventDefault() {},
  });
  let prevented = false;
  events.keydown({
    key: "r",
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(vm.runInContext("drag.orientation", context), "v");
  events.contextmenu({ preventDefault() {} });
  assert.equal(vm.runInContext("drag.orientation", context), "right");
  assert.equal(
    elements.get("drag-ghost").children[0].style.order,
    uiRoom.fleet[0],
  );
  events.keydown({ key: "r", preventDefault() {} });
  assert.equal(vm.runInContext("drag.orientation", context), "down");
  events.contextmenu({ preventDefault() {} });
  assert.equal(vm.runInContext("drag.orientation", context), "h");
  events.pointerup({ pointerId: 1, clientX: 30, clientY: 30 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1).data.placements[0].cell, 18);
  assert.equal(elements.get("drag-ghost").hidden, true);
  const types = elements
    .get("fleet-types-X")
    .children.map((el) => el.textContent);
  assert.deepEqual(
    types,
    Object.entries(store.snapshot(uiRoom, x.id).remainingFleet.X).map(
      ([length, count]) => `Thuyền ${length} ô × ${count}`,
    ),
  );
  elements.get("fleet-info-X").events.click();
  assert.equal(elements.get("fleet-menu-X").classList.contains("open"), true);
  elements.get("fleet-info-X").events.click();
  assert.equal(elements.get("fleet-menu-X").classList.contains("open"), false);
  elements.get("fleet-info-O").events.click();
  events.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(elements.get("fleet-menu-O").classList.contains("open"), false);
  context.next = store.snapshot(store.get(uiRoom.id), null);
  vm.runInContext("accept(next)", context);
  assert.equal(elements.get("setup-tools").hidden, true);
  assert.equal(elements.get("fleet").children.length, 0);
  assert.equal(elements.get("setup-spectator").hidden, false);
  assert.equal(elements.get("panel-X").hidden, true);
  assert.equal(elements.get("panel-O").hidden, true);
  uiRoom = battle();
  context.next = store.snapshot(uiRoom, x.id);
  vm.runInContext("accept(next)", context);
  assert.equal(vm.runInContext("view", context), "O");
  uiRoom = store.shoot(uiRoom.id, x.id, 0, uiRoom.version);
  context.next = store.snapshot(uiRoom, x.id);
  vm.runInContext("accept(next)", context);
  assert.equal(vm.runInContext("view", context), "X");
  elements.get("auto-view").checked = false;
  elements.get("view-O").events.click();
  assert.equal(vm.runInContext("view", context), "O");

  uiRoom = store.leave(uiRoom.id, o.id);
  context.next = store.snapshot(uiRoom, null);
  vm.runInContext("accept(next)", context);
  for (const side of ["X", "O"]) {
    const cells = elements
      .get("board-" + side)
      .children.filter((el) => el.dataset.cell != null);
    assert.equal(
      cells.filter((el) => el.classList.contains("ship")).length,
      allCells(uiRoom, side).length,
    );
    assert(cells.every((el) => el.disabled));
    assert.equal(elements.get("panel-" + side).hidden, false);
  }
  assert.equal(elements.get("view-tabs").hidden, false);

  const command = require("../src/commands/battleship"),
    runtime = require("../src/battleship/runtime"),
    router = require("../src/componentRouter");
  const choices = command.data
    .toJSON()
    .options.find((sub) => sub.name === "choi").options;
  assert.deepEqual(
    choices.map((o) => o.name),
    ["kichthuoc", "thoigian"],
  );
  assert.deepEqual(
    choices[0].choices.map((c) => c.value),
    ["small", "medium", "large"],
  );
  assert(
    require("../src/commandRegistry")
      .loadCommands()
      .some((c) => c.data.toJSON().name === "battleship"),
  );
  const available = runtime.isAvailable,
    originalConfirm = runtime.confirmPairing;
  runtime.isAvailable = () => true;
  try {
    const replies = [],
      interaction = {
        guildId: "discord",
        channelId: "discord",
        user: x,
        options: {
          getSubcommand: () => "choi",
          getString: () => "large",
          getInteger: () => 15,
        },
        deferReply: async () => {},
        deferUpdate: async () => {},
        editReply: async (p) => {
          replies.push(p);
          return { id: "invite" };
        },
        reply: async (p) => replies.push(p),
        followUp: async (p) => replies.push(p),
      };
    await command.execute(interaction);
    const lobby = runtime.store.listOpen("discord", "discord")[0];
    assert.equal(lobby.rules.mode, "large");
    assert.equal(lobby.rules.timeMinutes, 15);
    await router.routeComponentInteraction({
      ...interaction,
      user: o,
      customId: `battleship:join:${lobby.id}`,
      message: { id: "invite" },
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    });
    assert.equal(runtime.store.get(lobby.id).status, "setup");
    await runtime.syncMessages({
      channels: {
        fetch: async () => ({
          messages: { edit: async (_id, p) => replies.push(p) },
        }),
      },
    });
    assert.match(
      replies.at(-1).embeds[0].toJSON().description,
      /Bố trí hạm đội/,
    );
    web = createWebServer({
      games: [createGame({ store: runtime.store, db })],
      config,
    });
    runtime.confirmPairing = (id, user, code) =>
      web.confirmPairing("battleship", id, user, code);
    await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
    config.origin = `http://127.0.0.1:${web.server.address().port}`;
    const proof = await request("pair", { roomId: lobby.id });
    await router.routeComponentInteraction({
      ...interaction,
      user: x,
      customId: `battleship:confirm:${lobby.id}`,
      fields: { getTextInputValue: () => proof.data.code },
      isButton: () => false,
      isStringSelectMenu: () => false,
      isModalSubmit: () => true,
    });
    assert.match(replies.at(-1).content, /Đã xác nhận mã/);
    const paired = await request("pair/status", {
      roomId: lobby.id,
      pairingToken: proof.data.pairingToken,
    });
    assert.equal(paired.data.connected, true);
    assert.equal(
      (await request(`state?room=${lobby.id}`, null, paired.cookie)).data.me,
      "X",
    );
    await web.stop();
    web = null;
    await command.execute({
      ...interaction,
      options: { getSubcommand: () => "cauhinh", getInteger: () => 20 },
    });
    assert.match(replies.at(-1).content, /Chỉ quản trị/);
    const prefix = require("../src/services/slashPrefixService");
    await prefix.handleSlashPrefix({
      guildId: "prefix",
      channelId: "prefix",
      author: x,
      content: "!battleship choi kichthuoc=nho thoigian=10",
      channel: {},
      reply: async () => ({ id: "prefix-message" }),
    });
    assert.equal(
      runtime.store.listOpen("prefix", "prefix")[0].rules.mode,
      "small",
    );
  } finally {
    runtime.isAvailable = available;
    runtime.confirmPairing = originalConfirm;
  }
  require("../src/services/adminDataService").resetServerPlayerData({
    guildId: "discord",
  });
  assert.equal(runtime.store.listOpen("discord", "discord").length, 0);
  console.log(
    JSON.stringify({
      ok: true,
      battleship:
        "three equal fleets, geometry, private setup/SSE, per-player revisions, sinking/win, setup/battle clocks, persistence, spectators, pointer/touch/rotation, Discord and prefix",
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
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert(path.basename(directory).startsWith("battleship-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
