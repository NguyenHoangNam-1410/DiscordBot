"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { DEFAULT_CLOCK_MS, timeMinutes } = require("../src/webGames/clock");
let clock = Date.now(),
  serial = 0;
const now = () => clock;
const players = {
  X: { id: "x", username: "Người chơi X" },
  O: { id: "o", username: "Người chơi O" },
};
const code = (fn, expected) =>
  assert.throws(fn, (error) => error.code === expected);

function browser(game) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      hidden: false,
      disabled: false,
      textContent: "",
      value: "h",
      children: [],
      style: { setProperty() {} },
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
        contains: (name) => classes.has(name),
      },
      append(child) {
        this.children.push(child);
      },
      setAttribute() {},
      addEventListener() {},
      close() {
        this.open = false;
      },
    };
  }
  const context = {
    document: {
      addEventListener() {},
      createElement: element,
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
    window: { addEventListener() {} },
    location: { hash: "", pathname: "/" },
    history: { replaceState() {} },
    Date: class extends Date {
      static now() {
        return clock - 5000;
      }
    },
    URLSearchParams,
    setInterval() {},
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, `../src/${game}/public/app.js`),
      "utf8",
    ),
    context,
  );
  return {
    accept(snapshot) {
      context.next = snapshot;
      vm.runInContext("accept(next)", context);
    },
    tick() {
      vm.runInContext("updateClock()", context);
    },
    text(mark) {
      return elements.get(`clock-${mark}`).textContent;
    },
    running(mark) {
      return elements.get(`clock-${mark}`).classList.contains("running");
    },
  };
}

try {
  assert.equal(timeMinutes(), 30);
  for (const value of [0, 181, 1.5, "30", null, NaN])
    code(() => timeMinutes(value), "INVALID_RULES");
  for (const game of ["caro", "walls"]) {
    const command = require(`../src/commands/${game}`).data.toJSON();
    const option = command.options
      .find((sub) => sub.name === "choi")
      .options.find((option) => option.name === "thoigian");
    assert.equal(option.min_value, 1);
    assert.equal(option.max_value, 180);
    assert.equal(option.type, 4);
    const { createStore } = require(`../src/${game}/store`);
    const { normalizeRules } = require(`../src/${game}/rules`);
    const store = createStore(db, now);
    const ui = browser(game);
    const create = (rules = {}) =>
      store.create({
        guildId: `clock-${++serial}`,
        channelId: "channel",
        user: players.X,
        rules,
      });
    const match = (rules = {}) => store.join(create(rules).id, players.O);
    const move = (room, cell) =>
      store.move(room.id, players[room.turn].id, cell, room.version);
    const read = (id) =>
      JSON.parse(
        db.prepare(`SELECT data_json FROM ${game}_rooms WHERE id=?`).get(id)
          .data_json,
      );
    const seed = (room) =>
      db
        .prepare(`UPDATE ${game}_rooms SET data_json=? WHERE id=?`)
        .run(JSON.stringify(room), room.id);
    const first = game === "caro" ? 0 : 67,
      second = game === "caro" ? 15 : 13;
    for (const value of [0, 181, 2.5, "15"])
      code(() => normalizeRules({ timeMinutes: value }), "INVALID_RULES");

    let room = create();
    clock += 60_000;
    assert.deepEqual(store.snapshot(store.get(room.id), null).clocks, {
      X: DEFAULT_CLOCK_MS,
      O: DEFAULT_CLOCK_MS,
    });
    ui.accept(store.snapshot(room, null));
    assert.equal(ui.text("X"), "30:00");
    assert.equal(ui.text("O"), "—");
    room = store.join(room.id, players.O);
    const started = clock;
    clock += 10_000;
    let view = store.snapshot(store.get(room.id), null);
    assert.deepEqual(view.clocks, {
      X: DEFAULT_CLOCK_MS - 10_000,
      O: DEFAULT_CLOCK_MS,
    });
    assert.equal(
      view.clockStartedAt,
      clock,
      "projected banks use the projection timestamp, not the turn start",
    );
    ui.accept(view);
    assert.equal(ui.text("X"), "29:50");
    assert.equal(ui.text("O"), "30:00");
    assert.equal(ui.running("X"), true);
    assert.equal(ui.running("O"), false);
    clock += 1000;
    ui.tick();
    assert.equal(ui.text("X"), "29:49");
    assert.equal(ui.text("O"), "30:00");
    const before = JSON.stringify(read(room.id));
    code(() => store.move(room.id, players.X.id, first, -1), "STALE_BOARD");
    code(
      () => store.move(room.id, players.O.id, second, room.version),
      "NOT_TURN",
    );
    code(
      () => store.move(room.id, "viewer", first, room.version),
      "NOT_PLAYER",
    );
    code(
      () => store.move(room.id, players.X.id, -1, room.version),
      "INVALID_CELL",
    );
    assert.equal(
      JSON.stringify(read(room.id)),
      before,
      "rejected actions never reset a clock",
    );
    room = move(room, first);
    assert.deepEqual(room.clocks, {
      X: DEFAULT_CLOCK_MS - 11_000,
      O: DEFAULT_CLOCK_MS,
    });
    ui.accept(store.snapshot(room, players.X.id));
    assert.equal(ui.text("X"), "29:49");
    assert.equal(ui.running("O"), true);
    clock += 20_000;
    ui.tick();
    assert.equal(ui.text("X"), "29:49");
    assert.equal(ui.text("O"), "29:40");
    room = move(room, second);
    const restarted = createStore(db, now);
    clock += 5000;
    view = restarted.snapshot(restarted.get(room.id), null);
    assert.deepEqual(view.clocks, {
      X: DEFAULT_CLOCK_MS - 16_000,
      O: DEFAULT_CLOCK_MS - 20_000,
    });
    ui.accept(view); // Reload/SSE must not debit the elapsed time twice.
    assert.equal(ui.text("X"), "29:44");
    assert.equal(ui.text("O"), "29:40");
    assert.equal(
      view.clocks.X + view.clocks.O,
      2 * DEFAULT_CLOCK_MS - (clock - started),
    );
    if (game === "walls") {
      const beforeWall = JSON.stringify(read(room.id));
      code(
        () =>
          store.wall(
            room.id,
            players.X.id,
            { orientation: "h", row: -1, col: 0 },
            room.version,
          ),
        "INVALID_WALL",
      );
      assert.equal(JSON.stringify(read(room.id)), beforeWall);
      room = store.wall(
        room.id,
        players.X.id,
        { orientation: "h", row: 4, col: 0 },
        room.version,
      );
      assert.equal(room.clocks.X, DEFAULT_CLOCK_MS - 16_000);
      clock += 2000;
    }
    room = store.leave(room.id, players[room.turn === "X" ? "O" : "X"].id);
    assert.equal(room.reason, "resign");
    const frozen = store.snapshot(room, null).clocks;
    ui.accept(store.snapshot(room, null));
    const displayed = [ui.text("X"), ui.text("O")];
    clock += 5000;
    assert.deepEqual(store.snapshot(store.get(room.id), null).clocks, frozen);
    ui.tick();
    assert.deepEqual([ui.text("X"), ui.text("O")], displayed);
    assert.equal(ui.running("X"), false);
    assert.equal(ui.running("O"), false);

    room = match({ timeMinutes: 1 });
    clock += 59_999;
    room = move(room, first); // Just before flag fall is a valid move.
    assert.deepEqual(room.clocks, { X: 1, O: 60_000 });
    clock += 60_000;
    code(() => move(room, second), "ROOM_CLOSED");
    room = store.get(room.id);
    assert.equal(room.winner, "X");
    assert.equal(room.reason, "timeout");
    assert.deepEqual(room.clocks, { X: 1, O: 0 });
    assert.equal(
      db
        .prepare(`SELECT count(*) n FROM ${game}_seats WHERE room_id=?`)
        .get(room.id).n,
      0,
    );
    room = match({ timeMinutes: 1 });
    clock += 60_000;
    code(() => move(room, first), "ROOM_CLOSED");
    assert.equal(
      store.get(room.id).winner,
      "O",
      "an action at the exact deadline cannot save the player",
    );
    room = match({ timeMinutes: 1 });
    clock += 65_000;
    assert.equal(
      createStore(db, now).get(room.id).reason,
      "timeout",
      "offline time is charged after restart",
    );

    room = match();
    clock += 20 * 60_000;
    room = move(room, first);
    clock += 15 * 60_000;
    room = move(room, second);
    assert.equal(
      room.status,
      "playing",
      "35-minute match is valid with time on both clocks",
    );
    assert.deepEqual(room.clocks, { X: 10 * 60_000, O: 15 * 60_000 });
    room = store.leave(room.id, players.X.id);

    // New deploys migrate old room JSON once, preserving known current-turn elapsed time.
    room = match();
    delete room.clocks;
    delete room.clockStartedAt;
    delete room.rules.timeMinutes;
    room.turnDeadline = clock + 80_000;
    room.matchDeadline = clock - 1;
    const oldVersion = room.version;
    seed(room);
    room = store.get(room.id);
    assert.equal(room.status, "playing");
    assert.equal(room.version, oldVersion + 1);
    assert.equal(room.matchDeadline, undefined);
    assert.equal(
      store.snapshot(room, null).clocks.X,
      DEFAULT_CLOCK_MS - 10_000,
    );
    clock += 5000;
    room = store.get(room.id);
    assert.equal(
      room.version,
      oldVersion + 1,
      "repeated reads never reinitialize the bank",
    );
    assert.equal(
      store.snapshot(room, null).clocks.X,
      DEFAULT_CLOCK_MS - 15_000,
    );
    assert.equal(read(room.id).matchDeadline, undefined);
    room = store.leave(room.id, players.X.id);
    delete room.clocks;
    delete room.clockStartedAt;
    room.reason = "duration";
    seed(room);
    assert.equal(
      store.get(room.id).version,
      room.version,
      "historical results stay closed and unchanged",
    );

    room = create({ timeMinutes: 5 });
    delete room.clocks;
    delete room.clockStartedAt;
    room.matchDeadline = null;
    seed(room);
    room = store.join(room.id, players.O);
    assert.deepEqual(room.clocks, { X: 300_000, O: 300_000 });
    clock += 1000;
    if (game === "caro") {
      room.board[0] = room.board[1] = room.board[2] = room.board[3] = "X";
      seed(room);
      room = move(room, 4);
    } else {
      room.positions.X = 9;
      seed(room);
      room = move(room, 0);
    }
    assert.equal(room.reason, "win");
    assert.deepEqual(room.clocks, { X: 299_000, O: 300_000 });
    assert.equal(room.clockStartedAt, null);
    assert.equal(room.turnDeadline, null);
    clock += 5000;
    assert.equal(store.snapshot(store.get(room.id), null).clocks.X, 299_000);
  }
  console.log(
    JSON.stringify({
      ok: true,
      clocks:
        "caro/walls: independent banks, no increment, server authority, UI projection, reload/restart, timeout boundaries, old saves, final results",
    }),
  );
} finally {
  db.close();
}
