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
const store = require("../src/cotuong/store").createStore(db);
fixtures.set("cotuong", { store, room: null });
games.push(require("../src/cotuong/webGame").createGame({ store, db }));
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
  await require("../src/cotuong/engine").initialize();
  const fixtureRoom = store.join(
    store.create({ guildId: "cotuong-ui", channelId: "c", user: users.X }).id,
    users.O,
  );
  fixtures.get("cotuong").room = fixtureRoom;
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "cotuong-ui-"));
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
    await screenshot("cotuong-debug.png");
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
    if (!process.env.COTUONG_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.COTUONG_SCREENSHOT_DIR);
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
      "window.__motions=[];window.__layout=[];window.__posted=[];const nativeFetch=window.fetch;window.fetch=(url,opts)=>{if(String(url).endsWith('/move'))__posted.push(JSON.parse(opts.body));return nativeFetch(url,opts);};",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: config.origin + "/fixture/cotuong" });
  await until('typeof state!=="undefined"&&state?.me==="X"&&connected');
  assert.equal(await evaluate("cells.length"), 90);
  assert.equal(
    await evaluate('document.querySelectorAll("#board .piece").length'),
    32,
  );
  assert.equal(await evaluate('$("confirm")'), null);
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("#board .piece use")].every(el=>document.querySelector(el.getAttribute("href")))',
    ),
    true,
  );
  async function geometry() {
    const v = await evaluate(
      `(()=>{const live=cells.find(el=>el.querySelector('.piece')),b=$('board').getBoundingClientRect(),c=live.getBoundingClientRect(),s=live.querySelector('.piece').getBoundingClientRect();return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,board:{x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom},cell:{x:c.x,y:c.y,w:c.width,h:c.height},piece:{x:s.x,y:s.y,w:s.width,h:s.height},overlap:cells.some((p,i)=>cells.some((q,j)=>i<j&&(()=>{const a=p.getBoundingClientRect(),b=q.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1})()))}})()`,
    );
    assert(v.cell.w > 14 && v.cell.h > 14, JSON.stringify(v));
    assert(v.scroll <= v.w + 1);
    assert(!v.overlap);
    assert(Math.abs(v.piece.w - v.piece.h) < 1);
    assert(Math.abs(v.piece.x + v.piece.w / 2 - v.cell.x - v.cell.w / 2) < 1);
    assert(Math.abs(v.piece.y + v.piece.h / 2 - v.cell.y - v.cell.h / 2) < 1);
    return v;
  }
  async function point(cell) {
    return evaluate(
      `(()=>{const r=cells[${cell}].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  }
  async function press(cell, touch = false) {
    const p = await point(cell);
    if (touch)
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [p],
      });
    else
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        buttons: 1,
        clickCount: 1,
        ...p,
      });
    return p;
  }
  async function travel(a, b, touch = false) {
    for (let n = 1; n <= 5; n++) {
      const p = {
        x: a.x + ((b.x - a.x) * n) / 5,
        y: a.y + ((b.y - a.y) * n) / 5,
      };
      if (touch)
        await send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [p],
        });
      else
        await send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          button: "left",
          buttons: 1,
          ...p,
        });
      await delay(20);
    }
  }
  async function release(p, touch = false) {
    if (touch)
      await send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        buttons: 0,
        clickCount: 1,
        ...p,
      });
    await delay(100);
  }
  async function drop(a, b, touch = false) {
    const p = await press(a, touch),
      q = typeof b === "number" ? await point(b) : b;
    await travel(p, q, touch);
    await release(q, touch);
  }
  await geometry();
  await screenshot("cotuong-desktop.png");
  await drop(81, 73);
  assert.equal(await evaluate("state.ply"), 0);
  assert.equal(
    await evaluate("__posted.length"),
    0,
    "Invalid drop never posts",
  );
  const outside = await evaluate(
    '(()=>{const b=$("board").getBoundingClientRect();return{x:b.x-10,y:b.y+b.height/2}})()',
  );
  await drop(81, outside);
  assert.equal(await evaluate("state.ply"), 0);
  assert.equal(await evaluate("pieceAt(81)?.type"), "R");
  let p = await press(81),
    q = await point(72);
  await travel(p, q);
  assert.equal(await evaluate("!!ghost"), true);
  await screenshot("cotuong-drag.png");
  await key("Escape", "Escape", 27);
  await release(q);
  assert.equal(await evaluate("state.ply"), 0);
  assert.equal(await evaluate("ghost"), null);
  await drop(81, 72);
  await until("state.ply===1&&!pending");
  assert.equal(await evaluate("__posted.length"), 1);
  assert.equal(await evaluate("state.history[0].iccs"), "a0a1");
  assert.equal(await evaluate("pieceAt(72)?.type"), "R");
  assert.equal(
    await evaluate(
      'cells[81].classList.contains("recent-from")&&cells[72].classList.contains("recent-to")',
    ),
    true,
  );
  const fixture = fixtures.get("cotuong");
  let room = fixture.store.get(fixture.room.id);
  await send("Page.navigate", {
    url: web.issueTicket("cotuong", room.id, users.O.id),
  });
  await until('typeof state!=="undefined"&&state?.me==="O"&&connected');
  assert.equal(await evaluate("rotated"), true);
  await drop(0, 9);
  await until("state.ply===2&&!pending");
  assert.equal(await evaluate("state.history[1].iccs"), "a9a8");
  await send("Page.navigate", { url: config.origin + "/fixture/cotuong" });
  await until(
    'typeof state!=="undefined"&&state?.me==="X"&&state.ply===2&&connected',
  );
  // A newer authoritative move while dragging cancels the old gesture.
  p = await press(72);
  q = await point(63);
  await travel(p, q);
  assert.equal(await evaluate("!!ghost"), true);
  room = fixture.store.get(room.id);
  fixture.store.move(room.id, users.X.id, { from: 54, to: 45 }, room.version);
  await until("state.ply===3&&ghost===null");
  await release(q);
  assert.equal(await evaluate("state.ply"), 3);
  assert.equal(await evaluate("__posted.length"), 0);
  // Restore the turn by going as Black in the server fixture, then use touch on mobile.
  room = fixture.store.get(room.id);
  fixture.store.move(room.id, users.O.id, { from: 27, to: 36 }, room.version);
  await until("state.ply===4&&canAct()");
  for (const [width, height] of [
    [390, 844],
    [360, 640],
    [844, 390],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await delay(250);
    await geometry();
    assert.equal(
      await evaluate('document.body.classList.contains("wg-mobile")'),
      true,
    );
    p = await press(72, true);
    q = await point(63);
    await travel(p, q, true);
    await send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await delay(100);
    assert.equal(await evaluate("state.ply"), 4);
    assert.equal(await evaluate("ghost"), null);
    await screenshot("cotuong-" + width + "x" + height + ".png");
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(200);
  await drop(72, 63, true);
  await until("state.ply===5&&!pending");
  assert.equal(await evaluate("state.history[4].iccs"), "a1a2");
  assert.equal(await evaluate("__posted.length"), 1);
  await click("#rules-help", true);
  assert.equal(await evaluate('$("rules-dialog").open'), true);
  assert(
    (await evaluate('$("rules-dialog").textContent')).includes(
      "không có nút xác nhận",
    ),
  );
  await click(".wg-rules-close", true);
  await click('[data-panel="history"]', true);
  assert.equal(await evaluate("WebGameMobile.active()"), "history");
  await click(".wg-sheet-close", true);
  // Read-only spectator sees new moves and terminal state; no drag can commit.
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/cotuong/room/" + room.id,
  });
  await until(
    'typeof state!=="undefined"&&state?.me===null&&state.ply===5&&connected',
  );
  assert.equal(await evaluate("canAct()"), false);
  await drop(9, 18, true);
  assert.equal(await evaluate("__posted.length"), 0);
  assert.equal(await evaluate("state.ply"), 5);
  room = fixture.store.get(room.id);
  fixture.store.move(room.id, users.O.id, { from: 9, to: 18 }, room.version);
  await until("state.ply===6");
  assert.equal(await evaluate("pieceAt(18)?.side"), "black");
  fixture.store.leave(room.id, users.X.id);
  await until('state.status==="finished"');
  assert(
    (await evaluate('$("status-title").textContent')).includes(
      users.O.username,
    ),
  );
  assert.equal(await evaluate("canAct()"), false);
  await screenshot("cotuong-result.png");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      cotuongUI:
        "reused glyphs, centered intersection pieces, native mouse/touch drag, invalid/outside/cancel/stale gestures, immediate commit once, two seats/rotation, desktop/portrait/landscape, rules/history, live spectator/results",
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
          path.basename(resolved).startsWith("cotuong-ui-"),
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
