"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const code = fs.readFileSync(
  require("node:path").join(__dirname, "../src/webGames/public/feedback.js"),
  "utf8",
);
function fixture({
  muted = false,
  unsupported = false,
  blocked = false,
  privateStorage = false,
} = {}) {
  const nodes = new Map(),
    listeners = {},
    windowEvents = {},
    storage = new Map(muted ? [["discord-games:sound-enabled", "0"]] : []),
    audio = [];
  function element(name = "span") {
    return {
      name,
      namespaceURI: "http://www.w3.org/2000/svg",
      dataset: {},
      attrs: {},
      children: [],
      events: {},
      classList: { toggle() {} },
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      removeAttribute(k) {
        delete this.attrs[k];
      },
      append(...values) {
        this.children.push(...values);
      },
      before(node) {
        this.beforeNode = node;
      },
      replaceChildren(...values) {
        this.children = values;
      },
      addEventListener(k, v) {
        this.events[k] = v;
      },
    };
  }
  nodes.set("connection", element());
  const created = [];
  const document = {
    getElementById: (id) => nodes.get(id) || created.find((n) => n.id === id),
    createElement: (tag) => {
      const n = element(tag);
      created.push(n);
      return n;
    },
    createElementNS: (_, tag) => element(tag),
    addEventListener: (name, fn) => (listeners[name] = fn),
  };
  class AudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 10;
      this.destination = {};
      this.created = [];
      audio.push(this);
    }
    async resume() {
      if (blocked) throw Error("blocked");
      this.state = "running";
    }
    async close() {
      this.state = "closed";
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createOscillator() {
      const node = {
        frequency: {
          setValueAtTime(value) {
            assert(Number.isFinite(value) && value > 0);
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
        start() {
          node.started = true;
        },
        stop() {
          node.stopped = true;
        },
      };
      this.created.push(node);
      return node;
    }
  }
  const context = {
    document,
    AudioContext: unsupported ? undefined : AudioContext,
    localStorage: {
      getItem: (k) => {
        if (privateStorage) throw Error("blocked storage");
        return storage.get(k) ?? null;
      },
      setItem: (k, v) => {
        if (privateStorage) throw Error("blocked storage");
        storage.set(k, v);
      },
    },
    window: { addEventListener: (name, fn) => (windowEvents[name] = fn) },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  const api = context.WebGameFeedback;
  return {
    api,
    audio,
    nodes,
    created,
    storage,
    listeners,
    windowEvents,
    count: () => audio.reduce((n, a) => n + a.created.length, 0),
  };
}
const user = {
  X: { id: "100000000000000001", username: "An" },
  O: { id: "100000000000000002", username: "Bình" },
};
const cues = (f, game, before, next) =>
  JSON.parse(JSON.stringify(f.api.eventsBetween(game, before, next)));
async function main() {
  const f = fixture(),
    store = require("../src/caro/store").createStore(db);
  let room = store.create({
    guildId: "feedback",
    channelId: "c",
    user: user.X,
  });
  const view = () => store.snapshot(room, user.X.id);
  f.api.update("caro", view());
  assert.equal(
    f.audio.length,
    0,
    "Loading a room must not create autoplay audio",
  );
  let before = view();
  room = store.join(room.id, user.O);
  assert.deepEqual(cues(f, "caro", before, view()), ["join"]);
  f.api.update("caro", view());
  assert.equal(
    f.audio.length,
    0,
    "Pre-gesture events are dropped, never queued",
  );
  f.listeners.pointerdown({ isTrusted: false });
  assert.equal(f.audio.length, 0);
  f.listeners.pointerdown({ isTrusted: true });
  await Promise.resolve();
  assert.equal(f.audio.length, 1);
  assert.equal(f.audio[0].state, "running");
  f.api.update("caro", view());
  assert.equal(f.count(), 0, "Unlocking does not replay earlier joins");
  before = view();
  room = store.move(room.id, user.X.id, 0, room.version);
  assert.deepEqual(cues(f, "caro", before, view()), ["move"]);
  f.api.update("caro", view());
  assert.equal(f.count(), 1);
  f.api.update("caro", view());
  f.api.update("caro", { ...view(), serverNow: Date.now() + 100 });
  assert.equal(
    f.count(),
    1,
    "SSE and HTTP acknowledgement play the same commit once",
  );
  room = store.attachMessage(room.id, "message");
  f.api.update("caro", view());
  assert.equal(f.count(), 1, "A metadata-only version change is silent");
  const enabledCount = f.count();
  await f.api.setEnabled(false);
  assert.equal(f.storage.get("discord-games:sound-enabled"), "0");
  assert(f.audio[0].created.every((n) => n.stopped));
  room = store.move(room.id, user.O.id, 15, room.version);
  f.api.update("caro", view());
  assert.equal(f.count(), enabledCount);
  await f.api.setEnabled(true);
  f.api.update("caro", view());
  assert.equal(f.count(), enabledCount, "Unmuting does not replay muted moves");
  before = view();
  room = store.move(room.id, user.X.id, 1, room.version);
  f.api.update("caro", view());
  assert.equal(f.count(), enabledCount + 1);
  before = view();
  room = store.move(room.id, user.O.id, 16, room.version);
  assert.deepEqual(cues(f, "caro", before, view()), ["opponent", "turn"]);
  f.api.update("caro", view());
  assert.equal(f.count(), enabledCount + 4);
  for (const cell of [2, 17, 3, 18]) {
    room = store.move(room.id, room.players[room.turn].id, cell, room.version);
    f.api.update("caro", view());
  }
  before = view();
  room = store.move(room.id, user.X.id, 4, room.version);
  assert.deepEqual(cues(f, "caro", before, view()), ["win"]);
  assert.deepEqual(
    cues(f, "caro", { ...before, me: "O" }, { ...view(), me: "O" }),
    ["lose"],
  );
  assert.deepEqual(
    cues(f, "caro", { ...before, me: null }, { ...view(), me: null }),
    ["finish"],
  );
  f.api.update("caro", view());
  const finalCount = f.count();
  f.api.update("caro", view());
  assert.equal(f.count(), finalCount);
  const fresh = fixture();
  fresh.api.update("caro", view());
  fresh.listeners.pointerdown({ isTrusted: true });
  await Promise.resolve();
  fresh.api.update("caro", view());
  assert.equal(
    fresh.count(),
    0,
    "Reopening a finished board never replays its result",
  );
  assert.deepEqual(
    cues(f, "caro", view(), { ...view(), version: room.version - 1 }),
    [],
  );
  assert.deepEqual(
    cues(f, "caro", before, { ...view(), me: null }),
    [],
    "Claiming a spectator tab is a baseline, not a replay",
  );
  assert.deepEqual(
    cues(f, "caro", before, {
      ...view(),
      status: "finished",
      winner: null,
      reason: "draw",
    }),
    ["draw"],
  );
  f.storage.set("discord-games:sound-enabled", "0");
  f.windowEvents.storage({ key: "discord-games:sound-enabled" });
  assert.equal(f.api.enabled(), false);
  f.storage.set("discord-games:sound-enabled", "1");
  f.windowEvents.storage({ key: "discord-games:sound-enabled" });
  assert.equal(f.api.enabled(), true);
  f.api.connection(true);
  assert.equal(f.nodes.get("connection").dataset.connection, "connected");
  assert.equal(
    f.nodes.get("connection").attrs["aria-label"],
    "Đã kết nối trực tiếp",
  );
  assert.equal(f.nodes.get("connection").children[0].name, "svg");
  f.api.connection(false);
  assert.equal(f.nodes.get("connection").dataset.connection, "retry");
  const muted = fixture({ muted: true });
  muted.listeners.pointerdown({ isTrusted: true });
  assert.equal(muted.audio.length, 0);
  await muted.api.setEnabled(true, true);
  assert(muted.count() > 0);
  const none = fixture({ unsupported: true });
  assert.equal(
    none.created.find((n) => n.id === "sound-toggle").disabled,
    true,
  );
  await none.api.setEnabled(true, true);
  assert.equal(none.count(), 0);
  const blocked = fixture({ blocked: true });
  await blocked.api.setEnabled(true, true);
  assert.equal(blocked.count(), 0);
  const privateMode = fixture({ privateStorage: true });
  await privateMode.api.setEnabled(false);
  assert.equal(privateMode.api.enabled(), false);
  await privateMode.api.setEnabled(true, true);
  assert(privateMode.count() > 0);
  f.windowEvents.pagehide();
  assert.equal(f.audio[0].state, "closed");
  for (const game of [
    "walls",
    "dots",
    "blokus",
    "battleship",
    "mecung",
    "santorini",
  ]) {
    const s = require(`../src/${game}/store`).createStore(db);
    let r = s.create({ guildId: game, channelId: "c", user: user.X });
    let a = s.snapshot(r, user.X.id);
    r = s.join(r.id, user.O);
    let b = s.snapshot(r, user.X.id);
    assert.deepEqual(cues(f, game, a, b), ["join"]);
    if (game === "santorini") {
      a = b;
      r = s.move(r.id, user.X.id, { type: "place", cells: [0, 1] }, r.version);
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["ready"]);
      a = b;
      r = s.move(
        r.id,
        user.O.id,
        { type: "place", cells: [23, 24] },
        r.version,
      );
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["start"]);
      a = b;
      r = s.move(
        r.id,
        user.X.id,
        { type: "turn", worker: 0, to: 5, build: 0 },
        r.version,
      );
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["move"]);
    }
    if (game === "walls") {
      a = b;
      r = s.wall(
        r.id,
        user.X.id,
        { row: 3, col: 0, orientation: "h" },
        r.version,
      );
      assert.equal(cues(f, game, a, s.snapshot(r, user.X.id))[0], "wall");
    }
    if (game === "dots") {
      const { boxEdges } = require("../src/dots/engine");
      for (const edge of boxEdges(5, 0, 0)) {
        a = s.snapshot(r, user.X.id);
        r = s.move(r.id, r.players[r.turn].id, edge, r.version);
      }
      assert.equal(cues(f, game, a, s.snapshot(r, user.X.id))[0], "capture");
    }
    if (game === "blokus") {
      a = b;
      r = s.move(
        r.id,
        user.X.id,
        { pieceId: "I1", row: 4, col: 4, rotation: 0, flipped: false },
        r.version,
      );
      assert.deepEqual(cues(f, game, a, s.snapshot(r, user.X.id)), ["move"]);
    }
    if (game === "battleship") {
      r = s.randomize(r.id, user.X.id, 0);
      r = s.randomize(r.id, user.O.id, 0);
      a = s.snapshot(r, user.X.id);
      r = s.ready(r.id, user.X.id, 1);
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["ready"]);
      a = b;
      r = s.ready(r.id, user.O.id, 1);
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["start"]);
      a = b;
      r = s.shoot(r.id, user.X.id, r.placements.O[0].cell, r.version);
      b = s.snapshot(r, user.X.id);
      assert.equal(cues(f, game, a, b)[0], "hit");
      assert.equal(
        cues(f, game, a, {
          ...b,
          lastAction: { ...b.lastAction, sunk: true },
        })[0],
        "sunk",
      );
    }
    if (game === "mecung") {
      r = s.design(r.id, user.O.id, { start: 0, goal: 2, walls: [72] }, 0);
      r = s.ready(r.id, user.X.id, 0);
      a = s.snapshot(r, user.X.id);
      r = s.ready(r.id, user.O.id, 1);
      b = s.snapshot(r, user.X.id);
      assert.deepEqual(cues(f, game, a, b), ["start"]);
      a = b;
      r = s.move(r.id, user.X.id, "right", r.version);
      assert.equal(cues(f, game, a, s.snapshot(r, user.X.id))[0], "wall");
      a = s.snapshot(r, user.X.id);
      r = s.move(r.id, user.O.id, "right", r.version);
      assert.deepEqual(cues(f, game, a, s.snapshot(r, user.X.id)), [
        "opponent",
      ]);
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      feedback:
        "seven real game stores, Santorini placement/start/turn, join/move/hit/capture/results, deduplication, no autoplay/history replay, mute persistence/storage sync, unsupported/blocked audio, connection icon",
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
