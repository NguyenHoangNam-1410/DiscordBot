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
for (const id of ["cothu"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "cothu-ui-" + id,
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "cothu-ui-"));
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
    if (!process.env.COTHU_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.COTHU_SCREENSHOT_DIR);
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
    source: "window.__motions=[];window.__layout=[];",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: config.origin + "/fixture/cothu" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(
    await evaluate('document.querySelectorAll("#board>.cell").length'),
    63,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll("#board .animal:not(.animal-preview)").length',
    ),
    16,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#board .water").length'),
    12,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#board .trap").length'),
    6,
  );
  assert.equal(
    await evaluate('document.querySelectorAll("#board .den").length'),
    2,
  );
  assert.equal(await evaluate('$("name-X").textContent'), users.X.username);
  assert.equal(await evaluate('$("name-O").textContent'), users.O.username);
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("#board .animal use")].every(el=>document.querySelector(el.getAttribute("href")))',
    ),
    true,
  );
  await click('[data-cell="42"]');
  await click('[data-cell="35"]');
  assert.equal(await evaluate("state.ply"), 0, "Preview does not send a move");
  assert.equal(await evaluate('$("confirm").disabled'), false);
  await click("#clear");
  assert.equal(await evaluate("from"), null);
  await evaluate("cells[42].focus()");
  await key("Enter", "Enter", 13);
  assert.equal(await evaluate("from"), 42);
  assert.equal(await evaluate("document.activeElement.dataset.cell"), "42");
  await click("#clear");
  await click("#rotate-board");
  assert.equal(
    await evaluate('$("board").firstElementChild.dataset.cell'),
    "62",
  );
  await click('[data-cell="42"]');
  await click('[data-cell="35"]');
  await click("#confirm");
  await until("state.ply===1 && !pending");
  assert.equal(await evaluate("state.history[0].from"), 42);
  assert.equal(await evaluate("state.history[0].to"), 35);
  assert.equal(
    await evaluate('document.querySelectorAll(".cell.recent").length'),
    2,
  );
  const fixture = fixtures.get("cothu");
  let room = fixture.store.get(fixture.room.id);
  await send("Page.navigate", {
    url: web.issueTicket("cothu", room.id, users.O.id),
  });
  await until('typeof state!=="undefined"&&state?.me==="O"&&connected');
  assert.equal(
    await evaluate("rotated"),
    true,
    "Blue automatically faces their pieces",
  );
  await click('[data-cell="20"]');
  await click('[data-cell="27"]');
  await click("#confirm");
  await until("state.ply===2&&!pending");
  await send("Page.navigate", { url: config.origin + "/fixture/cothu" });
  await until(
    'typeof state!=="undefined"&&state?.me==="X"&&state.ply===2&&connected',
  );
  await evaluate("cells[48].focus()");
  await key("ArrowLeft", "ArrowLeft", 37);
  assert.equal(await evaluate("document.activeElement.dataset.cell"), "47");
  await click("#rules-help");
  await until('$("rules-dialog").open');
  const before = await evaluate("state.version");
  await key("ArrowDown", "ArrowDown", 40);
  assert.equal(await evaluate("state.version"), before);
  await key("Escape", "Escape", 27);
  await until('!$("rules-dialog").open');
  for (const metrics of [
    { width: 360, height: 640, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 844, height: 390, mobile: true },
    { width: 1280, height: 900, mobile: false },
  ]) {
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: metrics.mobile,
    });
    await send("Emulation.setDeviceMetricsOverride", {
      ...metrics,
      deviceScaleFactor: 1,
    });
    await delay(200);
    const bounds = await evaluate(
      `(()=>{const board=$('board').getBoundingClientRect(),scroll=$('board').parentElement.getBoundingClientRect(),confirm=$('confirm').getBoundingClientRect();return{board:board.toJSON(),scroll:scroll.toJSON(),confirm:confirm.toJSON(),width:innerWidth,height:innerHeight}})()`,
    );
    assert(
      Math.abs(bounds.board.width / bounds.board.height - 7 / 9) < 0.01,
      "Rectangular board at " + metrics.width,
    );
    assert(bounds.board.left >= 0 && bounds.board.right <= bounds.width + 1);
    assert(
      bounds.board.top >= 0 && bounds.board.bottom <= bounds.height + 1,
      "Full board visible " + metrics.width + " " + JSON.stringify(bounds),
    );
    assert(
      bounds.confirm.bottom <= bounds.height && bounds.confirm.top >= 0,
      "Actions visible with board",
    );
    if (metrics.mobile) {
      await click('[data-panel="history"]', true);
      await until('WebGameMobile.active()==="history"');
      assert.equal(await evaluate('$("move-history").children.length'), 2);
      await delay(80);
      assert.equal(
        await evaluate(
          `(()=>{const r=$('board').getBoundingClientRect(),s=$('board').parentElement.getBoundingClientRect();return r.top>=s.top-1&&r.bottom<=s.bottom+1})()`,
        ),
        true,
        "Board fits with history menu",
      );
      await click(".wg-sheet-close", true);
      await click('[data-panel="info"]', true);
      await delay(100);
      await click(".wg-sheet-close", true);
    }
    await screenshot("cothu-" + metrics.width + "x" + metrics.height + ".png");
  }
  room = fixture.store.get(room.id);
  const E = require("../src/cothu/engine"),
    R = require("../src/cothu/rules");
  function fixtureState(pieces) {
    const seed = E.createState();
    seed.pieces = pieces.map(([side, type, cell]) => ({
      id: side + "-" + type,
      type,
      side,
      cell: R.index(cell),
    }));
    seed.repetitions = { [E.positionKey(seed)]: 1 };
    return seed;
  }
  function replaceBoard(seed) {
    room = fixture.store.get(room.id);
    Object.assign(room, {
      pieces: seed.pieces,
      repetitions: seed.repetitions,
      ply: 0,
      moves: 0,
      noCapturePly: 0,
      history: [],
      lastMove: null,
      lastAction: null,
      turn: "X",
      version: room.version + 1,
    });
    db.prepare("UPDATE cothu_rooms SET data_json=? WHERE id=?").run(
      JSON.stringify(room),
      room.id,
    );
    fixture.store.events.emit(room.id, room);
  }
  replaceBoard(
    fixtureState([
      ["red", "rat", "c9"],
      ["blue", "elephant", "g7"],
    ]),
  );
  await until("state.pieces.length===2 && state.pieces[0].effectiveRank===0");
  assert.equal(
    await evaluate(
      `document.querySelector('[data-cell="2"] .animal-rank').textContent`,
    ),
    "0",
  );
  assert.match(
    await evaluate(`document.querySelector('[data-cell="2"]').title`),
    /bậc gốc 1/,
  );
  replaceBoard(
    fixtureState([
      ["red", "lion", "b3"],
      ["blue", "cat", "b7"],
      ["blue", "elephant", "g7"],
    ]),
  );
  await until('state.pieces[0].type==="lion"');
  await click('[data-cell="43"]');
  await click('[data-cell="15"]');
  assert.equal(
    await evaluate('document.querySelectorAll(".cell.jump-path").length'),
    3,
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".capture-preview").length'),
    1,
  );
  await screenshot("cothu-jump-preview.png");
  await click("#confirm");
  await until("state.ply===1&&!pending");
  assert.equal(await evaluate("state.lastMove.jumped"), true);
  assert.match(await evaluate('$("captured").textContent'), /Mèo/);
  replaceBoard(
    fixtureState([
      ["red", "rat", "d8"],
      ["blue", "elephant", "g7"],
    ]),
  );
  await until('state.pieces[0].type==="rat"&&state.ply===0');
  await click('[data-cell="10"]');
  await click('[data-cell="3"]');
  await click("#confirm");
  await until('state.status==="finished"');
  assert.equal(await evaluate("state.endReason"), "den");
  await screenshot("cothu-victory.png");
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/cothu/room/" + room.id,
  });
  await until('typeof state!=="undefined"&&state?.me===null&&connected');
  assert.equal(await evaluate('$("confirm").disabled'), true);
  assert.equal(await evaluate("state.history.length"), 1);
  await click('[data-cell="3"]');
  assert.equal(await evaluate("from"), null);
  const guestRoom = fixture.store.join(
    fixture.store.create({
      guildId: "guest-ui",
      channelId: "c",
      user: users.X,
      rules: { first: "guest" },
    }).id,
    users.O,
  );
  await send("Page.navigate", {
    url: web.issueTicket("cothu", guestRoom.id, users.X.id),
  });
  await until('typeof state!=="undefined"&&state?.me==="X"&&connected');
  assert.equal(await evaluate("rotated"), true);
  assert.equal(await evaluate("state.sideBySeat.X"), "blue");
  assert.equal(await evaluate('$("confirm").disabled'), true);
  assert.match(await evaluate('$("role-X").textContent'), /Xanh/);
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/cothu/room/" + guestRoom.id,
  });
  await until('typeof state!=="undefined"&&state?.me===null&&connected');
  await click("#connect-player");
  await until('/^[A-F0-9]{8}$/.test($("pair-code").textContent.trim())');
  assert.equal(await evaluate('$("copy-pair-code").disabled'), false);
  web.confirmPairing(
    "cothu",
    guestRoom.id,
    users.O.id,
    await evaluate('$("pair-code").textContent.trim()'),
  );
  await until('state.me==="O"&&canAct()');
  await click('[data-cell="42"]');
  await click('[data-cell="35"]');
  await click("#confirm");
  await until("state.ply===1&&!pending");
  assert.equal(await evaluate("state.history[0].side"), "red");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      cothuUI:
        "original animal SVGs, terrain, rotate/absolute coords, preview/cancel/confirm, two seats, captured/jump/den result, rules/keyboard/history, portrait/landscape/desktop, read-only spectator",
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
          path.basename(resolved).startsWith("cothu-ui-"),
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
