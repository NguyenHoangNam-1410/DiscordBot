"use strict";
// Optional real-browser QA: requires local Chrome (CHROME_PATH overrides the Windows default).
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createStore } = require("../src/blokus/store");
const { createGame } = require("../src/blokus/webGame");
const { findMove } = require("../src/blokus/engine");
const { createWebServer } = require("../src/webGames/http");
const store = createStore(db),
  config = { origin: "", secure: false };
const users = {
  X: { id: "100000000000000001", username: "Nguyễn An" },
  O: { id: "100000000000000002", username: "Trần Bình" },
};
let room = store.join(
  store.create({ guildId: "preview", channelId: "preview", user: users.X }).id,
  users.O,
);
const web = createWebServer({ games: [createGame({ store, db })], config });
const handler = web.server.listeners("request")[0];
web.server.removeAllListeners("request");
web.server.on("request", (req, res) => {
  if (req.url !== "/fixture") return handler(req, res);
  res.writeHead(302, {
    Location: web.issueTicket("blokus", room.id, users.X.id),
  });
  res.end();
});
let profile, child, ws;
const errors = [],
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "blokus-ui-"));
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
    await delay(50);
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
    if (!process.env.BLOKUS_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.BLOKUS_SCREENSHOT_DIR);
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: config.origin + "/fixture" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  await screenshot("blokus-initial.png");
  await click('[data-piece="F5"]');
  assert.equal(
    await evaluate("selected"),
    "F5",
    "Mouse must select a piece: " +
      JSON.stringify(
        await evaluate(
          `({act:canAct(),side:$("inventory-side").value,disabled:document.querySelector('[data-piece="F5"]').disabled,height:innerHeight,scrollY,errors:$("notice").textContent})`,
        ),
      ),
  );
  await click("#board .cell:nth-child(61)");
  await key("r", "KeyR", 82);
  await key("f", "KeyF", 70);
  assert.deepEqual(
    await evaluate("[selected,rotation,flipped]"),
    ["F5", 1, true],
    "Rotate/flip hotkeys",
  );
  await click('[data-piece="I1"]');
  await click("#board .cell:nth-child(61)");
  assert.equal(await evaluate('$("confirm").disabled'), false);
  await click("#confirm");
  await until('state.moves===1 && state.turn==="O" && !pending');
  room = store.get(room.id);
  store.move(room.id, users.O.id, findMove(room, "O", "I5"), room.version);
  await until('state.moves===2 && state.turn==="X"');
  await click('[data-piece="P5"]');
  await click("#board .cell:nth-child(46)");
  assert.equal(
    await evaluate('document.querySelectorAll(".cell.recent").length'),
    5,
  );
  await screenshot("blokus-desktop.png");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await screenshot("blokus-mobile.png");
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth"),
    false,
    "No mobile horizontal overflow",
  );
  await click('[data-piece="I2"]', true);
  await click("#board .cell:nth-child(46)", true);
  await click("#rotate", true);
  await click("#flip", true);
  assert.equal(
    await evaluate("rotation===1 && flipped===true"),
    true,
    "Touch rotate/flip",
  );
  await click("#zoom-board", true);
  assert.equal(
    await evaluate('$("board").parentElement.classList.contains("enlarged")'),
    true,
  );
  await click("#zoom-board", true);
  await click("#board .cell:nth-child(76)", true);
  await key("ArrowRight", "ArrowRight", 39);
  await key("ArrowLeft", "ArrowLeft", 37);
  assert.deepEqual(await evaluate("[anchor.row,anchor.col]"), [5, 5]);
  assert.equal(await evaluate('$("confirm").disabled'), false);
  await key("Enter", "Enter", 13);
  await until('state.moves===3 && state.turn==="O" && !pending');
  room = store.get(room.id);
  store.leave(room.id, users.O.id);
  await until('state.status==="finished"');
  assert.equal(
    await evaluate(
      '$("controls").hidden && $("leave").hidden && $("status-title").textContent.includes("thắng")',
    ),
    true,
  );
  assert.deepEqual(errors, [], "No browser exceptions");
  console.log(
    JSON.stringify({
      ok: true,
      blokusUI:
        "actual mouse/touch placement preview, R/F hotkeys, mobile rotation/flip, clock, account login, opponent SSE, recent piece, zoom, result",
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
          path.basename(resolved).startsWith("blokus-ui-"),
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
