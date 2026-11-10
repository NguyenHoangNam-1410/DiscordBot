"use strict";
// Optional real-browser QA: requires local Chrome (CHROME_PATH overrides the Windows default).
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createWebServer } = require("../src/webGames/http");
const users = {
  X: { id: "100000000000000001", username: "Nguyễn An" },
  O: { id: "100000000000000002", username: "Trần Bình" },
};
const fixtures = new Map(),
  games = [];
for (const id of ["caro", "walls", "battleship", "dots", "blokus", "mecung"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "sound-" + id,
    channelId: "c",
    user: users.X,
  });
  if (id !== "caro") room = store.join(room.id, users.O);
  fixtures.set(id, { store, room });
  games.push(require("../src/" + id + "/webGame").createGame({ store, db }));
}
const config = { origin: "", secure: false },
  web = createWebServer({ games, config });
const handler = web.server.listeners("request")[0];
web.server.removeAllListeners("request");
web.server.on("request", (req, res) => {
  const id = /^\/fixture\/([a-z]+)$/.exec(req.url)?.[1];
  const fixture = fixtures.get(id);
  if (!fixture) return handler(req, res);
  res.writeHead(302, {
    Location: web.issueTicket(id, fixture.room.id, users.X.id),
  });
  res.end();
});
let profile, child, ws;
const errors = [],
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "web-feedback-ui-"));
  const executable =
    process.env.CHROME_PATH ||
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
  assert(
    fs.existsSync(executable),
    "Set CHROME_PATH to a local Chrome executable",
  );
  child = spawn(
    executable,
    [
      "--headless=new",
      "--mute-audio",
      "--no-first-run",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let n = 0; !fs.existsSync(portFile) && n < 80; n++) await delay(100);
  assert(fs.existsSync(portFile), "Chrome must start");
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await (
    await fetch("http://127.0.0.1:" + port + "/json/list")
  ).json();
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let serial = 0;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(method + " timeout"));
        }, 9000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = (e) => {
    const v = JSON.parse(e.data);
    if (v.id) {
      const task = pending.get(v.id);
      if (task) {
        pending.delete(v.id);
        v.error
          ? task.reject(Error(JSON.stringify(v.error)))
          : task.resolve(v.result);
      }
    } else if (v.method === "Runtime.exceptionThrown")
      errors.push(
        v.params.exceptionDetails.exception?.description ||
          v.params.exceptionDetails.text,
      );
  };
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  }
  async function until(expression) {
    for (let n = 0; n < 100; n++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw Error("UI not ready: " + expression + " / " + errors.join("\n"));
  }
  async function click(selector, touch = false) {
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    await evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});const panel=el?.closest(".wg-panel");if(panel?.hidden && globalThis.WebGameMobile?.isMobile()) WebGameMobile.open(panel.id.replace("wg-panel-",""));})()`,
    );
    await delay(80);
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    // Scroll can be asynchronous after a layout change; measure on the following frame.
    await delay(70);
    const point = await evaluate(
      `(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`,
    );
    if (touch) {
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point],
      });
      await delay(50);
      await send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        buttons: 1,
        clickCount: 1,
        ...point,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        buttons: 0,
        clickCount: 1,
        ...point,
      });
    }
    await delay(touch ? 140 : 50);
  }
  async function key(key, code, value) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      windowsVirtualKeyCode: value,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: value,
    });
  }
  async function screenshot(name) {
    if (!process.env.WEB_FEEDBACK_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.WEB_FEEDBACK_SCREENSHOT_DIR);
    assert(
      fs.statSync(dir).isDirectory(),
      "Pre-create the screenshot directory under your user account",
    );
    await evaluate("scrollTo(0,0)");
    await delay(100);
    const { cssContentSize: s } = await send("Page.getLayoutMetrics");
    const { data } = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: s.width, height: s.height, scale: 1 },
    });
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, "base64"));
  }
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.__audioContexts=[];window.__sounds=0;const gain=AudioContext.prototype.createGain,osc=AudioContext.prototype.createOscillator;AudioContext.prototype.createGain=function(...args){if(!__audioContexts.includes(this))__audioContexts.push(this);return gain.apply(this,args)};AudioContext.prototype.createOscillator=function(...args){__sounds++;return osc.apply(this,args)};",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 760,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: config.origin + "/fixture/caro" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(await evaluate("__sounds"), 0);
  assert.equal(
    await evaluate("__audioContexts.length"),
    0,
    "No autoplay constructor on page load",
  );
  assert.equal(await evaluate('$("connection").textContent.trim()'), "");
  assert.equal(
    await evaluate('$("connection").getAttribute("aria-label")'),
    "Đã kết nối trực tiếp",
  );
  assert.equal(
    await evaluate('$("sound-toggle").getAttribute("aria-pressed")'),
    "false",
    "Speaker shows that initial audio still needs activation",
  );
  const rect = await evaluate(
    '(()=>{const r=$("sound-toggle").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,w:innerWidth}})()',
  );
  assert(
    rect.left >= 0 && rect.right <= rect.w && rect.top < 40,
    "Sound toggle in the top-right bar",
  );
  await click("#connection", true);
  await until('__audioContexts[0]?.state==="running"');
  assert.equal(
    await evaluate("__sounds"),
    0,
    "First gesture unlocks without replay",
  );
  const { store } = fixtures.get("caro");
  let room = store.join(fixtures.get("caro").room.id, users.O);
  await until('state.status==="playing" && __sounds===2');
  let count = await evaluate("__sounds");
  await evaluate("accept({...state})");
  await delay(100);
  assert.equal(
    await evaluate("__sounds"),
    count,
    "Duplicate SSE snapshot is silent",
  );
  await click("#board .cell", true);
  await until("state.moves===1 && !pending");
  assert.equal(
    await evaluate("__sounds"),
    count + 1,
    "One cue for HTTP plus SSE commit",
  );
  room = store.get(room.id);
  room = store.move(room.id, users.O.id, 15, room.version);
  await until("state.moves===2");
  await click("#sound-toggle", true);
  await until("!WebGameFeedback.enabled()");
  assert.equal(
    await evaluate('localStorage.getItem("discord-games:sound-enabled")'),
    "0",
  );
  count = await evaluate("__sounds");
  room = store.move(room.id, users.X.id, 1, room.version);
  await until("state.moves===3");
  assert.equal(await evaluate("__sounds"), count);
  await click("#sound-toggle", true);
  await until("WebGameFeedback.enabled() && __sounds>" + count);
  count = await evaluate("__sounds");
  await evaluate("accept({...state})");
  await delay(100);
  assert.equal(
    await evaluate("__sounds"),
    count,
    "Unmuting does not replay history",
  );
  for (const cell of [16, 2, 17, 3, 18]) {
    room = store.move(room.id, room.players[room.turn].id, cell, room.version);
    await until("state.moves===" + room.moves);
  }
  count = await evaluate("__sounds");
  room = store.move(room.id, users.X.id, 4, room.version);
  await until('state.status==="finished"');
  assert.equal(
    await evaluate("__sounds"),
    count + 4,
    "Victory fanfare occurs exactly once",
  );
  await screenshot("sound-mobile.png");
  await click("#sound-toggle", true);
  await until("!WebGameFeedback.enabled()");
  await send("Page.navigate", { url: config.origin + "/fixture/blokus" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(
    await evaluate('$("sound-toggle").getAttribute("aria-pressed")'),
    "false",
    "Mute preference follows other games",
  );
  const bk = fixtures.get("blokus");
  let b = bk.store.get(bk.room.id);
  b = bk.store.move(
    b.id,
    users.X.id,
    { pieceId: "I1", row: 4, col: 4, rotation: 0, flipped: false },
    b.version,
  );
  await until("state.moves===1");
  assert.equal(await evaluate("__sounds"), 0);
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.moves===1 && connected');
  assert.equal(
    await evaluate("WebGameFeedback.enabled()"),
    false,
    "Mute survives reload",
  );
  await click("#sound-toggle", true);
  await until(
    'WebGameFeedback.enabled() && __audioContexts[0]?.state==="running"',
  );
  count = await evaluate("__sounds");
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.moves===1 && connected');
  assert.equal(await evaluate("WebGameFeedback.enabled()"), true);
  assert.equal(await evaluate("__sounds"), 0);
  await click("#connection", true);
  await until('__audioContexts[0]?.state==="running"');
  assert.equal(
    await evaluate("__sounds"),
    0,
    "Reload and unlock do not replay the old move",
  );
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(160);
  assert.equal(await evaluate('$("connection").textContent.trim()'), "");
  assert.equal(
    await evaluate(
      '$("sound-toggle").getBoundingClientRect().right<=innerWidth',
    ),
    true,
  );
  await screenshot("sound-desktop.png");
  // A fresh unauthenticated viewer can activate with one tap and hear both seats.
  await send("Network.clearBrowserCookies");
  const spectatorRoom = store.create({
    guildId: "spectator-sound",
    channelId: "c",
    user: users.X,
  });
  await send("Page.navigate", {
    url: config.origin + "/caro/room/" + spectatorRoom.id,
  });
  await until('typeof state!=="undefined"&&state?.me===null&&connected');
  assert.equal(await evaluate("__audioContexts.length"), 0);
  assert.equal(
    await evaluate('$("sound-toggle").getAttribute("aria-pressed")'),
    "false",
  );
  await evaluate("window.dispatchEvent(new Event('focus'))");
  assert.equal(await evaluate("__audioContexts.length"), 0);
  await click("#sound-toggle");
  await until(
    'WebGameFeedback.enabled()&&__audioContexts[0]?.state==="running"',
  );
  assert.equal(
    await evaluate('$("sound-toggle").getAttribute("aria-pressed")'),
    "true",
  );
  assert.equal(
    await evaluate("__sounds"),
    2,
    "One click activates and plays the preview",
  );
  let watched = store.join(spectatorRoom.id, users.O);
  await until('state.status==="playing"&&__sounds===4');
  count = await evaluate("__sounds");
  watched = store.move(watched.id, users.X.id, 0, watched.version);
  await until("state.moves===1");
  assert.equal(await evaluate("__sounds"), count + 1);
  watched = store.move(watched.id, users.O.id, 15, watched.version);
  await until("state.moves===2");
  assert.equal(await evaluate("__sounds"), count + 2);
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("#board .cell")].every(el=>el.disabled)',
    ),
    true,
  );
  await click("#sound-toggle");
  count = await evaluate("__sounds");
  watched = store.move(watched.id, users.X.id, 1, watched.version);
  await until("state.moves===3");
  assert.equal(await evaluate("__sounds"), count);
  await click("#sound-toggle");
  await until("WebGameFeedback.enabled()&&__sounds>" + count);
  count = await evaluate("__sounds");
  // Simulate a browser suspension and its subsequent focus event using a real AudioContext.
  await evaluate("__audioContexts[0].suspend()");
  await until('$("sound-toggle").dataset.soundState==="waiting"');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await until(
    '__audioContexts[0].state==="running"&&$("sound-toggle").dataset.soundState==="running"',
  );
  assert.equal(
    await evaluate("__sounds"),
    count,
    "Resuming never replays missed sounds",
  );
  watched = store.move(watched.id, users.O.id, 16, watched.version);
  await until("state.moves===4");
  assert.equal(await evaluate("__sounds"), count + 1);
  for (const cell of [2, 17, 3, 18]) {
    watched = store.move(
      watched.id,
      watched.players[watched.turn].id,
      cell,
      watched.version,
    );
    await until("state.moves===" + watched.moves);
  }
  count = await evaluate("__sounds");
  watched = store.move(watched.id, users.X.id, 4, watched.version);
  await until('state.status==="finished"');
  assert.equal(
    await evaluate("__sounds"),
    count + 2,
    "Spectators hear a neutral result",
  );
  await evaluate("accept({...state})");
  await delay(60);
  assert.equal(await evaluate("__sounds"), count + 2);
  await send("Page.reload");
  await until(
    'typeof state!=="undefined"&&state?.status==="finished"&&connected',
  );
  assert.equal(await evaluate("__sounds"), 0);
  await click("#sound-toggle");
  await until("__sounds===2");
  assert.equal(await evaluate("state.me"), null);
  await screenshot("sound-spectator.png");

  await until('document.getElementById("webgame-bgm")?.readyState>=1');
  await click("#bgm-toggle");
  if (await evaluate('document.getElementById("webgame-bgm").paused'))
    await click("#bgm-toggle");
  await until('!document.getElementById("webgame-bgm").paused');
  const bgmState = await evaluate(
    '(()=>{const a=document.getElementById("webgame-bgm");a.currentTime=23; a.dispatchEvent(new Event("timeupdate"));return {src:a.getAttribute("src"),saved:JSON.parse(sessionStorage.getItem("discord-games:bgm-session-v1"))}})()',
  );
  await send("Page.reload");
  await until('document.getElementById("webgame-bgm")?.readyState>=1');
  assert.equal(
    await evaluate(
      'document.getElementById("webgame-bgm").getAttribute("src")',
    ),
    bgmState.src,
  );
  assert(
    await evaluate('document.getElementById("webgame-bgm").currentTime>=23'),
  );
  assert.deepEqual(
    await evaluate(
      'JSON.parse(sessionStorage.getItem("discord-games:bgm-session-v1")).order',
    ),
    bgmState.saved.order,
  );
  await click("#bgm-toggle");
  if (await evaluate('document.getElementById("webgame-bgm").paused'))
    await click("#bgm-toggle");
  await until('!document.getElementById("webgame-bgm").paused');
  const bgmCycle = await evaluate(
    'JSON.parse(sessionStorage.getItem("discord-games:bgm-session-v1")).order.length',
  );
  const heard = [];
  for (let i = 0; i < bgmCycle; i++) {
    const old = await evaluate(
      'document.getElementById("webgame-bgm").getAttribute("src")',
    );
    heard.push(old);
    await evaluate(
      'document.getElementById("webgame-bgm").dispatchEvent(new Event("ended"))',
    );
    if (bgmCycle > 1)
      await until(
        'document.getElementById("webgame-bgm").getAttribute("src")!==' +
          JSON.stringify(old),
      );
  }
  assert.equal(
    new Set(heard).size,
    bgmCycle,
    "All BGM tracks play before repeating",
  );
  await until('!document.getElementById("webgame-bgm").paused');
  await click("#bgm-toggle");
  assert(await evaluate('document.getElementById("webgame-bgm").paused'));
  assert.equal(
    await evaluate('localStorage.getItem("discord-games:bgm-enabled")'),
    "0",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      feedbackUI:
        "real Web Audio, viewer first-click activation, join/both seats/result, suspended-context recovery, read-only spectators, mute/unmute, ACK deduplication, cross-game/reload preferences, desktop/mobile header icons",
    }),
  );
  await send("Browser.close").catch(() => {});
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    ws?.close();
    if (child && child.exitCode === null) child.kill();
    await web.stop();
    db.close();
    if (profile) {
      await delay(1000);
      const resolved = path.resolve(profile),
        root = path.resolve(os.tmpdir());
      assert(
        path.dirname(resolved) === root &&
          path.basename(resolved).startsWith("web-feedback-ui-"),
        "Safe temp cleanup",
      );
      fs.rmSync(resolved, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
  });
