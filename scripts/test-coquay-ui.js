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
for (const id of ["coquay"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "sound-" + id,
    channelId: "c",
    user: users.X,
  });
  room = store.join(room.id, users.O);
  room.duel.inventory.player = ["magnifier", "cuffs", "saw", "beer"];
  room.duel.inventory.bot = ["shield", "medicine", "inverter"];
  room.duel.chamber = [true, false, true, false];
  db.prepare("UPDATE coquay_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(room),
    room.id,
  );
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "coquay-ui-"));
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
    if (!process.env.COQUAY_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.COQUAY_SCREENSHOT_DIR);
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
  await send("Page.navigate", { url: config.origin + "/fixture/coquay" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(await evaluate("__sounds"), 0);
  await click("#connection", true);
  await until('__audioContexts[0]?.state==="running"');
  assert.equal(
    await evaluate('document.querySelectorAll("#tray-X .slot").length'),
    4,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#tray-O .slot.empty").length'),
    1,
  );
  await click('#tray-X [data-item="magnifier"]', true);
  await until('$("item-dialog").open');
  await click("#use-item", true);
  await until("state.moves===1 && !pending");
  assert.equal(await evaluate("state.knownShell"), true);
  assert.equal(await evaluate('$("private-intel").hidden'), false);
  let count = await evaluate("__sounds");
  await evaluate("accept({...state})");
  assert.equal(await evaluate("__sounds"), count);
  await click('#tray-O [data-item="shield"]', true);
  assert.equal(await evaluate('$("use-item").hidden'), true);
  await click('[data-close="item-dialog"]', true);
  await click("#rotate-table", true);
  await delay(450);
  assert.equal(
    await evaluate('$("rotate-table").getAttribute("aria-pressed")'),
    "true",
  );
  assert.equal(await evaluate('$("felt").classList.contains("rotated")'), true);
  assert.equal(await evaluate("state.moves"), 1);
  await click("#inventory-open", true);
  await until('$("inventory-dialog").open');
  assert.match(
    await evaluate('$("inventory-detail").textContent'),
    /Kính|Còng|Cưa/,
  );
  await click('[data-close="inventory-dialog"]', true);
  for (const metrics of [
    { width: 360, height: 640, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 844, height: 390, mobile: true },
    { width: 1280, height: 1000, mobile: false },
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      ...metrics,
      deviceScaleFactor: 1,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: metrics.mobile,
    });
    await delay(200);
    const bounds = await evaluate(
      '(()=>{const a=document.querySelector(".arena").getBoundingClientRect(),c=$("controls").getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,w:innerWidth,bottom:Math.max(a.bottom,c.bottom),h:innerHeight,page:document.documentElement.scrollHeight,seats:[...document.querySelectorAll(".seat")].map(s=>{const r=s.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}),arena:{top:a.top,bottom:a.bottom}}})()',
    );
    assert(bounds.scroll <= bounds.w + 1, "No horizontal page overflow");
    await screenshot(`coquay-${metrics.width}x${metrics.height}.png`);
    assert(
      bounds.seats.every(
        (s) => s.top >= bounds.arena.top && s.bottom <= bounds.arena.bottom,
      ),
      "Seats inside table: " + JSON.stringify(bounds),
    );
    assert(
      bounds.bottom <= bounds.h,
      "Table and shooting controls remain visible: " + JSON.stringify(bounds),
    );
    await screenshot(`coquay-${metrics.width}x${metrics.height}.png`);
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    mobile: true,
    deviceScaleFactor: 1,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await click("#shoot-opponent", true);
  await until("state.moves===2 && !pending");
  assert.equal(await evaluate("state.hp.O"), 4);
  assert.equal(await evaluate('$("seat-O").classList.contains("hit")'), true);
  await screenshot("coquay-impact.png");
  assert.equal(await evaluate('$("private-intel").hidden'), true);
  assert(
    (await evaluate("__sounds")) > count,
    "Committed live shot produces sound",
  );
  const fixture = fixtures.get("coquay");
  let room = fixture.store.get(fixture.room.id);
  room = fixture.store.move(
    room.id,
    users.O.id,
    { type: "shoot", target: "self" },
    room.version,
  );
  await until("state.moves===3");
  assert.equal(room.turn, "O");
  await click("#sound-toggle", true);
  await until("!WebGameFeedback.enabled()");
  count = await evaluate("__sounds");
  room = fixture.store.move(
    room.id,
    users.O.id,
    { type: "shoot", target: "opponent" },
    room.version,
  );
  await until("state.moves===4");
  assert.equal(await evaluate("__sounds"), count);
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.moves===4 && connected');
  assert.equal(await evaluate("WebGameFeedback.enabled()"), false);
  assert.equal(await evaluate("__sounds"), 0);
  await click("#sound-toggle", true);
  await until("WebGameFeedback.enabled()");
  room = fixture.store.get(room.id);
  room.duel.hp.bot = 1;
  room.duel.chamber = [true, false];
  db.prepare("UPDATE coquay_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(room),
    room.id,
  );
  await click("#shoot-opponent", true);
  await until('state.status==="finished"');
  assert.equal(await evaluate("state.winner"), "X");
  assert.match(await evaluate('$("status-title").textContent'), /thắng/);
  assert.equal(
    await evaluate('getComputedStyle($("controls")).display'),
    "none",
  );
  count = await evaluate("__sounds");
  await evaluate("accept({...state})");
  assert.equal(await evaluate("__sounds"), count);
  await screenshot("coquay-victory.png");
  await send("Page.navigate", {
    url: config.origin + "/coquay/room/" + room.id,
  });
  await until(
    'typeof state!=="undefined" && state?.status==="finished" && connected',
  );
  assert.equal(await evaluate("state.me"), "X"); // existing session survives navigation
  // Largest configurable inventory stays usable on a phone, including its last slot.
  let large = fixture.store.create({
    guildId: "max-capacity",
    channelId: "c",
    user: users.X,
    rules: { maxHp: 20, itemLimit: 12 },
  });
  large = fixture.store.join(large.id, users.O);
  large.duel.inventory.player = Array(12).fill("magnifier");
  db.prepare("UPDATE coquay_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(large),
    large.id,
  );
  await send("Page.navigate", {
    url: web.issueTicket("coquay", large.id, users.X.id),
  });
  await until(
    'typeof state!=="undefined" && state?.rules.itemLimit===12 && connected',
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#tray-X .slot").length'),
    12,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await click("#tray-X .slot:last-child", true);
  assert.equal(await evaluate('$("item-dialog").open'), true);
  await click('[data-close="item-dialog"]', true);
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/coquay/room/" + large.id,
  });
  await until(
    'typeof state!=="undefined" && state?.rules.itemLimit===12 && state.me===null && connected',
  );
  assert.equal(
    await evaluate('getComputedStyle($("controls")).display'),
    "none",
  );
  assert.equal(await evaluate('$("private-intel").hidden'), true);
  await click("#tray-X .slot:last-child", true);
  assert.equal(await evaluate('$("use-item").hidden'), true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      coquayUI:
        "trusted touch, tool dialogs/private peek, rotation, responsive table, real shots/SSE, mute persistence, terminal state and quiet history",
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
          path.basename(resolved).startsWith("coquay-ui-"),
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
