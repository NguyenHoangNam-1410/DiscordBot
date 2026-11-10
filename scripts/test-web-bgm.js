"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../src/webGames/public/bgm.js"),
  "utf8",
);
const KEY = "discord-games:bgm-session-v1",
  PREF = "discord-games:bgm-enabled";
const tracks = ["a", "b", "c", "d", "e"].map(
  (n) => "/assets/bgm/" + n + ".mp3",
);
const settle = () => new Promise((r) => setImmediate(r));
async function fixture({
  session = new Map(),
  prefs = new Map(),
  blocked = false,
  list = tracks,
  privateStorage = false,
} = {}) {
  const docEvents = {},
    winEvents = {},
    nodes = [];
  class Audio {
    constructor() {
      this.paused = true;
      this.currentTime = 0;
      this.duration = 240;
      this.events = {};
      nodes.push(this);
    }
    addEventListener(k, f) {
      this.events[k] = f;
    }
    emit(k) {
      this.events[k]?.();
    }
    load() {
      this.currentTime = 0;
      this.emit("loadedmetadata");
    }
    async play() {
      if (blocked) throw Error("NotAllowedError");
      this.paused = false;
      this.emit("playing");
    }
    pause() {
      this.paused = true;
      this.emit("pause");
    }
  }
  let button;
  const storage = (map) => ({
    getItem: (k) => {
      if (privateStorage) throw Error();
      return map.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (privateStorage) throw Error();
      map.set(k, v);
    },
  });
  const document = {
    body: { append() {} },
    querySelector: () => ({
      append: (b) => {
        button = b;
      },
    }),
    createElement: () => ({
      dataset: {},
      classList: { toggle() {} },
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      addEventListener(k, f) {
        this[k] = f;
      },
      contains: () => false,
    }),
    addEventListener: (k, f) => (docEvents[k] = f),
  };
  vm.runInNewContext(source, {
    document,
    Audio,
    localStorage: storage(prefs),
    sessionStorage: storage(session),
    fetch: async () => ({ ok: true, json: async () => ({ tracks: list }) }),
    window: { addEventListener: (k, f) => (winEvents[k] = f) },
  });
  await settle();
  return { audio: nodes[0], button, session, prefs, docEvents, winEvents };
}
async function main() {
  const a = await fixture();
  assert.equal(a.audio.paused, false);
  assert(a.audio.volume < 0.3);
  const cycle = [];
  for (let i = 0; i < tracks.length; i++) {
    cycle.push(a.audio.src);
    a.audio.emit("ended");
    await settle();
  }
  assert.equal(new Set(cycle).size, tracks.length);
  assert.notEqual(a.audio.src, cycle.at(-1));
  const second = [];
  for (let i = 0; i < tracks.length; i++) {
    second.push(a.audio.src);
    a.audio.emit("ended");
    await settle();
  }
  assert.equal(new Set(second).size, tracks.length);
  a.audio.currentTime = 37.5;
  a.audio.emit("timeupdate");
  const saved = JSON.parse(a.session.get(KEY));
  a.winEvents.pagehide();
  const b = await fixture({ session: a.session, prefs: a.prefs });
  assert.equal(b.audio.src, a.audio.src);
  assert.equal(b.audio.currentTime, 37.5);
  assert.deepEqual(JSON.parse(b.session.get(KEY)).order, saved.order);
  b.button.click();
  assert(b.audio.paused);
  b.button.click();
  await settle();
  assert(!b.audio.paused);
  assert.equal(b.audio.currentTime, 37.5);
  b.button.click();
  const c = await fixture({ session: b.session, prefs: b.prefs });
  assert(c.audio.paused);
  assert.equal(c.audio.currentTime, 37.5);
  c.docEvents.pointerup({ isTrusted: true });
  await settle();
  assert(c.audio.paused);
  const d = await fixture({ blocked: true });
  assert.equal(d.button.dataset.musicState, "waiting");
  assert.equal(d.button.attrs["aria-pressed"], "false");
  const corrupt = await fixture({
    session: new Map([
      [
        KEY,
        JSON.stringify({
          order: [tracks[0], tracks[0]],
          index: 99,
          position: -1,
        }),
      ],
    ]),
  });
  assert(tracks.includes(corrupt.audio.src));
  const single = await fixture({ list: [tracks[0]] });
  single.audio.emit("ended");
  await settle();
  assert.equal(single.audio.src, tracks[0]);
  const bad = await fixture();
  for (let i = 0; i < tracks.length; i++) bad.audio.emit("error");
  assert.equal(bad.button.disabled, true);
  const empty = await fixture({ list: [] });
  assert(empty.button.disabled);
  await fixture({ privateStorage: true });
  const web = require("../src/webGames/http").createWebServer({
    games: [
      {
        id: "caro",
        name: "Caro",
        publicDir: path.join(__dirname, "../src/caro/public"),
      },
    ],
    config: { origin: "", secure: false },
  });
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + web.server.address().port;
  try {
    const manifest = await (await fetch(origin + "/api/bgm")).json();
    assert(manifest.tracks.length > 0);
    const url = origin + manifest.tracks[0],
      head = await fetch(url, { method: "HEAD" }),
      size = Number(head.headers.get("content-length"));
    assert(size > 0);
    assert.equal(head.headers.get("content-type"), "audio/mpeg");
    for (const [range, length] of [
      ["bytes=0-99", 100],
      ["bytes=-17", 17],
    ]) {
      const r = await fetch(url, { headers: { Range: range } });
      assert.equal(r.status, 206);
      assert.equal((await r.arrayBuffer()).byteLength, length);
    }
    for (const range of [
      "bytes=" + size + "-",
      "bytes=5-2",
      "bytes=0-1,3-4",
      "bytes=-0",
    ])
      assert.equal(
        (await fetch(url, { headers: { Range: range } })).status,
        416,
      );
    assert.equal(
      (await fetch(origin + "/assets/bgm/no-such-file.mp3")).status,
      404,
    );
    assert.equal(
      (await fetch(origin + "/assets/bgm/%2e%2e%2fpackage.json")).status,
      404,
    );
    const page = await fetch(origin + "/caro/");
    assert((await page.text()).includes('src="/bgm.js"'));
    assert(
      page.headers.get("content-security-policy").includes("media-src 'self'"),
    );
  } finally {
    await web.stop();
  }
  console.log(
    JSON.stringify({
      ok: true,
      bgm: "shuffle cycles, no immediate repeat, reload position/order, pause/resume/mute, blocked autoplay, bad files/storage, manifest and byte-range streaming",
    }),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
