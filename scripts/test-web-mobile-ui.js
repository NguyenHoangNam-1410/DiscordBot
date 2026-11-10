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
for (const id of [
  "caro",
  "walls",
  "battleship",
  "dots",
  "blokus",
  "mecung",
  "santorini",
  "cothu",
  "cotuong",
  "oanquan",
]) {
  const store = require("../src/" + id + "/store").createStore(db);
  fixtures.set(id, { store, room: null });
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
  await require("../src/cotuong/engine").initialize();
  for (const [id, fixture] of fixtures) {
    const { store } = fixture;
    fixture.room = store.join(
      store.create({ guildId: "mobile-" + id, channelId: "c", user: users.X })
        .id,
      users.O,
    );
  }
  await new Promise((r) => web.server.listen(0, "127.0.0.1", r));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "web-mobile-ui-"));
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
    if (!process.env.WEB_MOBILE_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.WEB_MOBILE_SCREENSHOT_DIR);
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
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  let scrolledGames = 0;
  for (const id of fixtures.keys()) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await send("Page.navigate", { url: config.origin + "/fixture/" + id });
    await until(
      'typeof state!=="undefined" && state?.me==="X" && connected && WebGameMobile.isMobile()',
    );
    await delay(150);
    async function bounds(label) {
      const result = await evaluate(
        '(()=>{const b=(document.querySelector(".board-panel.selected .board")||document.querySelector(".board-panel .board")).getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight};})()',
      );
      assert(
        result.top >= 78 &&
          result.bottom <= result.height - 55 &&
          result.left >= 0 &&
          result.right <= result.width,
        id + " " + label + " board in viewport: " + JSON.stringify(result),
      );
      assert(
        result.scroll <= result.height + 2,
        id + " main page needs no scrolling",
      );
    }
    async function headerBounds(compact) {
      const b = await evaluate(
        '(()=>{const h=document.querySelector(".shell > header"),r=h.getBoundingClientRect(),a=h.querySelector(":scope > a").getBoundingClientRect(),tools=[...h.querySelectorAll("#connection,#sound-toggle,#rules-help")].map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};});return {height:r.height,left:a.left-r.left,right:r.right-tools.at(-1).right,top:r.top,bottom:r.bottom,tools,overflow:document.documentElement.scrollWidth>innerWidth};})()',
      );
      const pad = compact ? 8 : 16;
      assert.equal(
        b.height,
        compact ? 40 : 64,
        id + " consistent top-bar height",
      );
      assert(
        b.left >= pad && b.right >= pad && !b.overflow,
        id + " padded top-bar edges: " + JSON.stringify(b),
      );
      for (const [i, tool] of b.tools.entries()) {
        assert.equal(tool.width, 32);
        assert.equal(tool.height, 32);
        assert(
          tool.y >= b.top + 3 && tool.bottom <= b.bottom - 3,
          id + " tools have vertical breathing room",
        );
        if (i)
          assert(
            tool.x - b.tools[i - 1].right >= 6,
            id + " tools do not overlap",
          );
      }
    }
    const expectedPath = "/" + id + "/room/" + fixtures.get(id).room.roomCode;
    assert.equal(
      await evaluate("location.pathname"),
      expectedPath,
      id + " ticket opens short room URL",
    );
    assert.equal(
      await evaluate("roomId"),
      fixtures.get(id).room.id,
      "Internal requests keep the canonical UUID",
    );
    await bounds("initial");
    await headerBounds(true);
    assert.equal(
      await evaluate('document.querySelectorAll("#rules-help").length'),
      1,
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#rules-open, .wg-rules-entry, .rules")',
      ),
      null,
    );
    await click("#rules-help", true);
    assert.equal(
      await evaluate('document.querySelector("#rules-dialog:modal") !== null'),
      true,
    );
    assert.match(
      await evaluate('document.querySelector("#rules-dialog").textContent'),
      /Thắng nếu/,
    );
    await key("Escape", "Escape", 27);
    assert.equal(
      await evaluate('document.querySelector("#rules-dialog").open'),
      false,
    );
    const boardRect = () =>
      evaluate(
        '(()=>{const b=(document.querySelector(".board-panel.selected .board")||document.querySelector(".board-panel .board")).getBoundingClientRect();return [b.x,b.y,b.width,b.height];})()',
      );
    const initialRect = await boardRect();
    if (id === "caro") {
      const clockSeconds = () =>
        evaluate(
          '(()=>{const [m,s]=document.querySelector(".wg-clock").textContent.split(":").map(Number);return m*60+s;})()',
        );
      const before = await clockSeconds();
      await delay(1100);
      await evaluate("render()");
      assert(
        (await clockSeconds()) < before,
        "Rendering the same snapshot must not reset the compact clock",
      );
    }
    assert.equal(
      await evaluate('document.querySelectorAll(".wg-hud .wg-player").length'),
      2,
    );
    await click('[data-panel="info"]', true);
    await delay(100);
    await bounds("info open");
    assert.equal(await evaluate("WebGameMobile.active()"), "info");
    assert.equal(
      await evaluate(
        'document.querySelector("#wg-menu-dialog:modal") !== null',
      ),
      true,
    );
    assert.equal(
      await evaluate('document.querySelector("#wg-sheet").hidden'),
      true,
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#wg-menu-dialog").contains(document.activeElement)',
      ),
      true,
    );
    assert.deepEqual(
      await boardRect(),
      initialRect,
      id + " modal preserves board dimensions",
    );
    await screenshot(id + "-info-modal.png");
    await key("Escape", "Escape", 27);
    assert.equal(await evaluate("WebGameMobile.active()"), null);
    assert.equal(
      await evaluate("document.activeElement.dataset.panel"),
      "info",
    );
    // Avatar is also an opener; closing must return focus to that avatar.
    await click(".wg-player", true);
    await click(
      ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
      true,
    );
    await delay(100);
    await bounds("info closed");
    assert.equal(
      await evaluate('document.activeElement.classList.contains("wg-player")'),
      true,
    );
    if (id === "caro") {
      await click('[data-panel="info"]', true);
      await evaluate('document.querySelector(".wg-nav-button").focus()');
      assert.equal(
        await evaluate(
          'document.querySelector("#wg-menu-dialog").contains(document.activeElement)',
        ),
        true,
      );
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 1, y: 1 }],
      });
      await send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await until("WebGameMobile.active()===null");
    }
    await click('[data-panel="account"]', true);
    assert.equal(
      await evaluate('document.querySelector("#wg-menu-title").textContent'),
      "Tài khoản",
    );
    assert.deepEqual(await boardRect(), initialRect);
    await click("#leave", true);
    assert.equal(await evaluate('$("leave-dialog").open'), true);
    await click("#keep-playing", true);
    assert.equal(
      await evaluate(
        'document.querySelector("#wg-menu-dialog:modal") !== null',
      ),
      true,
    );
    assert.equal(
      await evaluate('document.querySelectorAll("#leave").length'),
      1,
    );
    await click(
      ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
      true,
    );
    if (["walls", "blokus", "battleship", "mecung"].includes(id)) {
      const panel = id === "blokus" ? "pieces" : "actions";
      await click('[data-panel="' + panel + '"]', true);
      await delay(100);
      await bounds("actions open");
      if (id === "walls") {
        await click("#mode-wall", true);
        assert.equal(await evaluate("mode"), "wall");
      }
      if (id === "mecung") {
        await click("#edit-walls", true);
        assert.equal(await evaluate("editMode"), "walls");
      }
      if (id === "battleship") {
        assert.equal(await evaluate('$("panel-O").hidden'), true);
        assert.equal(await evaluate('$("view-tabs").hidden'), true);
        await click("#randomize", true);
        await until("!pending && state.placements.length===state.fleet.length");
        const fixture = fixtures.get(id);
        let room = fixture.store.get(fixture.room.id);
        room = fixture.store.randomize(
          room.id,
          users.O.id,
          room.setupRevision.O,
        );
        fixture.store.ready(room.id, users.O.id, room.setupRevision.O);
        await click("#ready", true);
        await until('!pending && state.status==="playing"');
      }
      await click(
        ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
        true,
      );
    }
    if (id === "battleship") {
      await click('[data-panel="view"]', true);
      await click("#view-O", true);
      await delay(100);
      await bounds("second sea");
      await click(
        ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
        true,
      );
    }
    await screenshot(id + "-mobile.png");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 640,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(160);
    await bounds("small phone");
    await headerBounds(true);
    await click('[data-panel="info"]', true);
    await delay(100);
    await bounds("small phone menu");
    await click(
      ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
      true,
    );
    await send("Emulation.setDeviceMetricsOverride", {
      width: 844,
      height: 390,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(200);
    await bounds("landscape");
    await headerBounds(true);
    await click('[data-panel="info"]', true);
    await delay(100);
    await bounds("landscape menu");
    await click(
      ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
      true,
    );
    await click('[data-panel="info"]', true);
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(200);
    assert.equal(await evaluate("WebGameMobile.isMobile()"), false);
    assert.equal(
      await evaluate('document.querySelectorAll(".wg-panel>*").length'),
      0,
      "Original live nodes restored on desktop",
    );
    assert.equal(
      await evaluate(
        '(()=>{const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return ids.length===new Set(ids).size;})()',
      ),
      true,
    );
    assert.equal(
      await evaluate('document.querySelector("#wg-menu-dialog").open'),
      false,
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#rules-help").closest(".wg-header-tools") !== null',
      ),
      true,
    );
    await headerBounds(false);
    await screenshot(id + "-desktop-topbar.png");
    // Scroll the real desktop page, keeping the shared top-bar tools reachable.
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    await send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 1278,
      y: 580,
      deltaX: 0,
      deltaY: 280,
    });
    await delay(200);
    const sticky = await evaluate(
      '(()=>{const h=document.querySelector(".shell > header"),r=h.getBoundingClientRect(),help=document.querySelector("#rules-help"),b=help.getBoundingClientRect();return {top:r.top,scroll:scrollY,visible:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===help};})()',
    );
    if (sticky.scroll > 0) scrolledGames++;
    assert(
      Math.abs(sticky.top) < 1 && sticky.visible,
      id +
        " top-bar tools stay visible over scrolled content: " +
        JSON.stringify(sticky),
    );
    await click("#rules-help");
    assert.equal(
      await evaluate('document.querySelector("#rules-dialog:modal") !== null'),
      true,
    );
    await click(".wg-rules-close");
    // Re-enter mobile after closing a modal during desktop restoration.
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(160);
    await click('[data-panel="account"]', true);
    assert.equal(
      await evaluate(
        'document.querySelector("#wg-menu-dialog:modal #leave") !== null',
      ),
      true,
    );
    await key("Escape", "Escape", 27);
    await bounds("mobile restored");
    await send("Page.navigate", {
      url: config.origin + expectedPath.toLowerCase(),
    });
    await until('typeof state!=="undefined" && state?.me==="X" && connected');
    assert.equal(await evaluate("location.pathname"), expectedPath);
    await send("Network.clearBrowserCookies");
    await send("Page.reload");
    await until('typeof state!=="undefined" && state?.me===null && connected');
    assert.equal(await evaluate("location.pathname"), expectedPath);
    assert.equal(await evaluate("roomId"), fixtures.get(id).room.id);
    console.log(
      id +
        " short room URLs, reload/spectating, rules, modal menus and desktop restoration passed",
    );
  }
  assert(
    scrolledGames > 0,
    "Desktop fixtures must exercise actual page scrolling",
  );
  // Reconnect from a spectator tab through the actual live account controls.
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/caro/room/" + fixtures.get("caro").room.id,
  });
  await until(
    'typeof state!=="undefined" && state?.me===null && connected && WebGameMobile.isMobile()',
  );
  await click('[data-panel="account"]', true);
  await click("#connect-player", true);
  await until(
    '/^[A-F0-9]{8}$/.test(document.querySelector("#pair-code").textContent.trim())',
  );
  assert.equal(
    await evaluate(
      'document.querySelector("#wg-menu-dialog:modal #pair-panel").hidden',
    ),
    false,
  );
  await click("#copy-pair-code", true);
  await until(
    'document.querySelector("#pair-copy-status").textContent.includes("Đã sao chép")',
  );
  await screenshot("caro-account-pair-modal.png");
  const pairCode = await evaluate(
    'document.querySelector("#pair-code").textContent.trim()',
  );
  web.confirmPairing(
    "caro",
    fixtures.get("caro").room.id,
    users.X.id,
    pairCode,
  );
  await until('state.me==="X" && document.querySelector("#pair-panel").hidden');
  assert.equal(
    await evaluate(
      'document.querySelectorAll("#pair-code, #leave, #copy-pair-code").length',
    ),
    3,
  );
  assert.equal(
    await evaluate('document.querySelector("#wg-menu-dialog:modal") !== null'),
    true,
  );
  await key("Escape", "Escape", 27);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      mobile:
        "ten games, consistent padded top bars and square tools across desktop/portrait/landscape, sticky desktop top bar with clickable help after scrolling, fixed mobile top bar, top-bar rules, native modal info/account, unchanged board dimensions, Escape/backdrop/focus, nested surrender, live pairing/copy, board/action coexistence, compact clocks/avatars, menus, 360px phones, landscape, live DOM restoration, account dialog, battleship randomize and sea switch",
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
          path.basename(resolved).startsWith("web-mobile-ui-"),
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
