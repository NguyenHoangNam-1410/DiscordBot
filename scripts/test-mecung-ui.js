"use strict";
// Optional real-browser QA: requires local Chrome (CHROME_PATH overrides the Windows default).
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { spawn } = require("node:child_process");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createStore } = require("../src/mecung/store");
const { createGame } = require("../src/mecung/webGame");
const { wallBetween } = require("../src/mecung/engine");
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
    Location: web.issueTicket("mecung", room.id, users.X.id),
  });
  res.end();
});
let profile, child, ws;
const errors = [],
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "mecung-ui-"));
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
    if (!process.env.MECUNG_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.MECUNG_SCREENSHOT_DIR);
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
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: config.origin + "/fixture" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  assert.equal(await evaluate("view"), "design");
  await click("#edit-start");
  await click('[data-cell="1"]');
  await until("state.design.start===1 && !pending");
  await click("#edit-goal");
  await click('[data-cell="3"]');
  await until("state.design.goal===3 && !pending");
  await click("#edit-walls");
  await click('[data-wall="73"]');
  await until("state.design.walls.includes(73) && !pending");
  await click('[data-wall="72"]');
  await until("state.design.walls.includes(72) && !pending");
  await click('[data-wall="1"]');
  await until('!pending && $("notice").textContent.includes("đường")');
  assert.deepEqual(await evaluate("state.design.walls"), [72, 73]);
  await click("#clear-walls");
  await until("state.design.walls.length===0 && !pending");
  await click("#randomize");
  await until("state.design.walls.length>0 && !pending");
  await click("#clear-walls");
  await until("state.design.walls.length===0 && !pending");
  await click("#edit-start");
  await click('[data-cell="0"]');
  await until("state.design.start===0 && !pending");
  await click("#edit-goal");
  await click('[data-cell="2"]');
  await until("state.design.goal===2 && !pending");
  await click("#edit-walls");
  await click('[data-wall="73"]');
  await until("state.design.walls.includes(73) && !pending");
  await screenshot("mecung-setup.png");
  await click("#ready");
  await click("#confirm-ready");
  await until("state.ready.X && !pending");
  room = store.get(room.id);
  room = store.design(
    room.id,
    users.O.id,
    { start: 0, goal: 2, walls: [72, 40] },
    0,
  );
  room = store.ready(room.id, users.O.id, 1);
  await until('state.status==="playing" && view==="X"');
  assert.equal(
    await evaluate('document.querySelectorAll(".edge.wall").length'),
    0,
    "No hidden walls in the DOM",
  );
  await key("d", "KeyD", 68);
  await until('state.turn==="O" && !pending');
  assert.equal(await evaluate("state.boards.X.position"), 0);
  assert.equal(
    await evaluate(
      `document.querySelector('[data-wall="72"]').classList.contains("wall")`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-wall="40"]').classList.contains("wall")`,
    ),
    false,
  );
  await screenshot("mecung-desktop.png");
  room = store.get(room.id);
  room = store.move(room.id, users.O.id, "right", room.version);
  room = store.move(room.id, users.O.id, "right", room.version);
  await until('state.turn==="X"');
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await click("#move-down", true);
  await until("state.boards.X.position===9 && !pending");
  assert.equal(await evaluate("state.turn"), "X");
  assert.deepEqual(await evaluate("state.boards.X.visited"), [0, 9]);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth"),
    false,
  );
  await screenshot("mecung-mobile.png");
  await click("#move-up", true);
  await until("state.boards.X.position===0 && !pending");
  assert.deepEqual(await evaluate("state.boards.X.visited"), [0, 9]);
  await click("#zoom-board", true);
  assert.equal(
    await evaluate('$("board-frame").classList.contains("enlarged")'),
    true,
  );
  await click("#zoom-board", true);
  for (const [k, c, v, position] of [
    ["s", "KeyS", 83, 9],
    ["d", "KeyD", 68, 10],
    ["d", "KeyD", 68, 11],
    ["w", "KeyW", 87, 2],
  ]) {
    await key(k, c, v);
    await until("state.boards.X.position===" + position + " && !pending");
  }
  await until('state.status==="finished"');
  assert.equal(await evaluate("state.winner"), "X");
  assert.equal(
    await evaluate('$("move-controls").hidden && $("leave").hidden'),
    true,
  );
  await screenshot("mecung-result.png");
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/mecung/room/" + room.id,
  });
  await until(
    'typeof state!=="undefined" && state?.status==="finished" && connected && state.me===null',
  );
  assert.equal(await evaluate("state.design"), null);
  assert.equal(
    await evaluate('[...$("view-select").options].some(o=>o.value==="design")'),
    false,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-wall="40"]').classList.contains("wall")`,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      mecungUI:
        "mouse/touch design, endpoint edits, path rejection, random/clear, lock, private DOM, keyboard and touch moves, hidden wall reveal, continued turns, exploration, SSE, mobile, zoom, finish and spectator reload",
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
          path.basename(resolved).startsWith("mecung-ui-"),
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
