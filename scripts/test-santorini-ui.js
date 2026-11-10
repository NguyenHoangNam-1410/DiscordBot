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
for (const id of ["santorini"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "santorini-ui-" + id,
    channelId: "c",
    user: users.X,
  });
  room = store.join(room.id, users.O);
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "santorini-ui-"));
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
    await screenshot("coquay-debug.png");
    throw Error(
      "UI not ready: " +
        expression +
        " / " +
        errors.join("\n") +
        " / " +
        (await evaluate(
          `JSON.stringify({active:document.activeElement?.id,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.id),motions:__motions.map(m=>m.kind),layout:__layout,scroll:scrollY,board:$("board")?.getBoundingClientRect().toJSON()})`,
        )),
    );
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
    if (!process.env.SANTORINI_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.SANTORINI_SCREENSHOT_DIR);
    assert(
      fs.statSync(dir).isDirectory(),
      "Pre-create the screenshot directory under your user account",
    );
    const { data } = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, "base64"));
  }
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "window.__audioContexts=[];window.__sounds=0;window.__motions=[];window.__layout=[];window.addEventListener('resize',()=>__layout.push({event:'resize',w:innerWidth,h:innerHeight}));const animate=Element.prototype.animate;Element.prototype.animate=function(...args){__motions.push({kind:this.dataset.fx,html:this.innerHTML});return animate.apply(this,args)};const gain=AudioContext.prototype.createGain,osc=AudioContext.prototype.createOscillator;AudioContext.prototype.createGain=function(...args){if(!__audioContexts.includes(this))__audioContexts.push(this);return gain.apply(this,args)};AudioContext.prototype.createOscillator=function(...args){__sounds++;return osc.apply(this,args)};",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 760,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: config.origin + "/fixture/santorini" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(
    await evaluate('document.querySelectorAll("#board .cell").length'),
    25,
  );
  await click('[data-cell="0"]', true);
  assert.equal(
    await evaluate("state.workers.X[0]"),
    null,
    "Selecting a placement is preview only",
  );
  assert.equal(await evaluate('$("confirm").disabled'), true);
  await click("#clear", true);
  assert.equal(await evaluate("placement.length"), 0);
  await click('[data-cell="0"]', true);
  await click('[data-cell="1"]', true);
  await click("#confirm", true);
  await until('state.turn==="O" && !pending');
  assert.deepEqual(await evaluate("state.workers.X"), [0, 1]);
  const fixture = fixtures.get("santorini");
  let room = fixture.store.get(fixture.room.id);
  room = fixture.store.move(
    room.id,
    users.O.id,
    { type: "place", cells: [23, 24] },
    room.version,
  );
  await until('state.phase==="turn" && state.turn==="X"');
  await click('[data-cell="0"]', true);
  await click('[data-cell="5"]', true);
  assert.equal(await evaluate('$("confirm").disabled'), true);
  await click('[data-cell="0"]', true);
  assert.match(await evaluate('$("instruction").textContent'), /Xây A1/);
  assert.equal(await evaluate("state.board[0]"), 0);
  await click("#confirm", true);
  await until("state.moves===1 && !pending");
  assert.equal(await evaluate("state.board[0]"), 1);
  assert.equal(await evaluate("state.workers.X[0]"), 5);
  assert.equal(
    await evaluate('document.querySelectorAll(".cell.recent").length'),
    2,
    "Highlight the moved worker and constructed block",
  );
  for (const metrics of [
    { width: 360, height: 640, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 844, height: 390, mobile: true },
    { width: 1280, height: 900, mobile: false },
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      ...metrics,
      deviceScaleFactor: 1,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: metrics.mobile,
    });
    await delay(250);
    const layout = await evaluate(
      '(()=>{const board=$("board").getBoundingClientRect(),controls=$("controls").getBoundingClientRect();return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,board:board.toJSON(),controls:controls.toJSON(),mobile:WebGameMobile.isMobile()}})()',
    );
    assert(layout.scroll <= layout.w + 1, "No horizontal page overflow");
    assert(
      layout.board.width > 100 &&
        layout.board.top >= 0 &&
        layout.board.bottom <= layout.h,
      "Full board visible: " + JSON.stringify(layout),
    );
    assert(
      layout.controls.bottom <= layout.h,
      "Actions stay in view: " + JSON.stringify(layout),
    );
    if (metrics.mobile) {
      assert.equal(layout.mobile, true);
      assert.equal(
        await evaluate(
          'document.querySelectorAll(".wg-hud .player-avatar").length',
        ),
        2,
      );
      await click('[data-panel="info"]', true);
      await until('WebGameMobile.active()==="info"');
      assert.equal(
        await evaluate(
          'document.getElementById("rule-badges").closest(".wg-panel").hidden',
        ),
        false,
      );
      await click(
        ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
        true,
      );
      assert.equal(await evaluate("WebGameMobile.active()"), null);
    } else {
      assert.equal(layout.mobile, false);
      assert.equal(
        await evaluate(
          'document.querySelector(".sidebar .players-card")!==null',
        ),
        true,
        "Original nodes restore on desktop",
      );
    }
    assert.equal(
      await evaluate(
        '(()=>{const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return ids.length===new Set(ids).size})()',
      ),
      true,
    );
    await screenshot(`santorini-${metrics.width}x${metrics.height}.png`);
  }
  // Authoritative next turn, then a real level-3 victory without choosing a build.
  room = fixture.store.get(room.id);
  room = fixture.store.move(
    room.id,
    users.O.id,
    { type: "turn", worker: 0, to: 18, build: 23 },
    room.version,
  );
  await until('state.moves===2 && state.turn==="X"');
  room = fixture.store.get(room.id);
  room.board[5] = 2;
  room.board[6] = 3;
  db.prepare("UPDATE santorini_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(room),
    room.id,
  );
  await evaluate("refresh()");
  await click('[data-cell="5"]');
  await click('[data-cell="6"]');
  assert.equal(await evaluate('$("confirm").disabled'), false);
  assert.match(await evaluate('$("confirm").textContent'), /Thắng/);
  await click("#confirm");
  await until('state.status==="finished"');
  assert.equal(await evaluate("state.winner"), "X");
  assert.equal(await evaluate("state.board[5]"), 2);
  assert.equal(
    await evaluate('getComputedStyle($("controls")).display'),
    "none",
  );
  await screenshot("santorini-victory.png");
  await send("Page.reload");
  await until(
    'typeof state!=="undefined" && state?.status==="finished" && connected',
  );
  assert.equal(await evaluate("state.winner"), "X");
  assert.equal(await evaluate("__motions.length"), 0);
  // Anonymous audience sees the game, never actionable player controls.
  await send("Network.clearBrowserCookies");
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.me===null && connected');
  assert.equal(
    await evaluate(
      'document.querySelectorAll("#board button:not(:disabled)").length',
    ),
    0,
  );
  assert.equal(await evaluate('$("controls").hidden'), true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      santoriniUI:
        "placement preview/confirm, worker selection, move/build into vacated cell, authoritative SSE, level-3 win, gold highlights, phone portrait/landscape, desktop restoration, avatars/menu, reload and spectators",
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
          path.basename(resolved).startsWith("santorini-ui-"),
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
