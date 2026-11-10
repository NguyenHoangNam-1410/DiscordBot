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
  room.duel.inventory.bot = ["phone", "cigarettes", "inverter"];
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
    await screenshot("coquay-debug.png");
    throw Error(
      "UI not ready: " +
        expression +
        " / " +
        errors.join("\n") +
        " / " +
        (await evaluate(
          `JSON.stringify({active:document.activeElement?.id,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.id),motions:__motions.map(m=>m.kind),layout:__layout,scroll:scrollY,btn:$("inventory-open").getBoundingClientRect().toJSON()})`,
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
    if (!process.env.COQUAY_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.COQUAY_SCREENSHOT_DIR);
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
  assert.equal(await evaluate('__motions.filter(m=>m.kind==="use").length'), 1);
  let count = await evaluate("__sounds");
  let motionCount = await evaluate("__motions.length");
  await evaluate("accept({...state})");
  assert.equal(await evaluate("__sounds"), count);
  assert.equal(
    await evaluate("__motions.length"),
    motionCount,
    "ACK/SSE duplicates never replay item animation",
  );
  await click('#tray-O [data-item="phone"]', true);
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
    await delay(500);
    const gunBounds = await evaluate(
      '(()=>{const r=$("weapon").getBoundingClientRect(),lane=$("weapon-lane-"+state.turn).getBoundingClientRect(),c=$("table-center").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,lx:lane.x+lane.width/2,ly:lane.y+lane.height/2,cx:c.x+c.width/2}})()',
    );
    assert(
      Math.abs(gunBounds.x - gunBounds.lx) < 2 &&
        Math.abs(gunBounds.y - gunBounds.ly) < 2,
      "Gun sits in active seat lane after rotation/resize: " +
        JSON.stringify(gunBounds),
    );
    assert(
      Math.abs(gunBounds.x - gunBounds.cx) < 2,
      "Gun and ammunition stay centered",
    );
    const bounds = await evaluate(
      '(()=>{const a=document.querySelector(".arena").getBoundingClientRect(),c=$("controls").getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,w:innerWidth,bottom:Math.max(a.bottom,c.bottom),h:innerHeight,page:document.documentElement.scrollHeight,seats:[...document.querySelectorAll(".seat")].map(s=>{const r=s.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}),arena:{top:a.top,bottom:a.bottom}}})()',
    );
    const header = await evaluate(
      '(()=>{const h=document.querySelector(".shell > header"),r=h.getBoundingClientRect(),a=h.querySelector(":scope > a").getBoundingClientRect(),tools=[...h.querySelectorAll("#rotate-table,#connection,#sound-toggle,#rules-help")].map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};});return {height:r.height,left:a.left-r.left,right:r.right-tools.at(-1).right,top:r.top,bottom:r.bottom,tools};})()',
    );
    const compact = metrics.mobile;
    assert.equal(header.height, compact ? 40 : 64);
    assert(
      header.left >= (compact ? 8 : 16) && header.right >= (compact ? 8 : 16),
      "Cò quay top-bar padding matches other games",
    );
    for (const [i, tool] of header.tools.entries()) {
      assert.equal(tool.width, 32);
      assert.equal(tool.height, 32);
      assert(
        tool.y >= header.top + 3 && tool.bottom <= header.bottom - 3,
        "Cò quay buttons stay within padded top bar",
      );
      if (i)
        assert(
          tool.x - header.tools[i - 1].right >= 6,
          "Cò quay rotation and tools do not overlap",
        );
    }
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
  await delay(700);
  assert.equal(
    await evaluate('$("weapon").dataset.holder'),
    "O",
    "Blank self-shot keeps the gun",
  );
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
  await delay(700);
  assert.equal(
    await evaluate('$("weapon").dataset.holder'),
    "X",
    "Gun transfers to the new turn",
  );
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.moves===4 && connected');
  assert.equal(await evaluate("WebGameFeedback.enabled()"), false);
  assert.equal(await evaluate("__sounds"), 0);
  assert.equal(
    await evaluate("__motions.length"),
    0,
    "Reloading the page does not replay past visual effects",
  );
  await click("#sound-toggle", true);
  await until("WebGameFeedback.enabled()");
  // Last blank shell reloads: neutral casings, then precisely the granted items.
  await click("#shoot-self", true);
  await until("state.moves===5 && state.round===2 && !pending");
  await until('__motions.some(m=>m.kind==="shell")');
  assert.equal(
    await evaluate('__motions.filter(m=>m.kind==="shell").length'),
    await evaluate("state.lastLoad.live+state.lastLoad.blank"),
  );
  assert(
    await evaluate(
      '__motions.filter(m=>m.kind==="shell").every(m=>m.html.includes("#art-shell")&&!m.html.includes("live")&&!m.html.includes("blank"))',
    ),
    "Reload shells reveal no hidden sequence",
  );
  await screenshot("coquay-reload.png");
  await until('__motions.some(m=>m.kind==="deal")');
  assert.equal(
    await evaluate('__motions.filter(m=>m.kind==="deal").length'),
    await evaluate(
      "state.boxes.X.received.length+state.boxes.O.received.length",
    ),
  );
  await screenshot("coquay-deal.png");
  await until(
    '!document.querySelector(".arena").dataset.phase && !document.querySelector("#table-fx").children.length',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".slot.receiving").length'),
    0,
  );
  assert.equal(
    await evaluate('$("ammo-live").textContent'),
    String(await evaluate("state.ammunition.live")),
  );
  assert.equal(
    await evaluate('$("ammo-blank").textContent'),
    String(await evaluate("state.ammunition.blank")),
  );
  motionCount = await evaluate("__motions.length");
  await evaluate("accept({...state})");
  assert.equal(await evaluate("__motions.length"), motionCount);
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
  large.duel.inventory.player[0] = "cigarettes";
  large.duel.hp.player = 19;
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
  await click('#tray-X [data-item="cigarettes"]', true);
  assert.match(await evaluate('$("item-title").textContent'), /\+1 HP/);
  await click("#use-item", true);
  await until("state.hp.X===20 && !pending");
  await until('__motions.some(m=>m.kind==="heal")');
  await screenshot("coquay-heal.png");
  await until('!document.querySelector("#table-fx").children.length');
  // All nine real items have local art; stealing is explicitly selected and server-confirmed.
  large = fixture.store.get(large.id);
  large.duel.inventory.player = [
    "adrenaline",
    "phone",
    "expired_medicine",
    "inverter",
    "cigarettes",
    "magnifier",
    "magnifier",
  ];
  large.duel.inventory.bot = ["saw", "magnifier", "adrenaline"];
  large.duel.chamber = [true, false, true, false];
  large.duel.hp.player = 18;
  large.duel.knowledge = {};
  large.duel.saw = false;
  large.version++;
  db.prepare("UPDATE coquay_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(large),
    large.id,
  );
  fixture.store.events.emit(large.id, large);
  await until('state.inventories.X.includes("adrenaline")');
  assert.equal(await evaluate("state.items.length"), 9);
  assert.equal(await evaluate('document.querySelector("#art-shield")'), null);
  assert.equal(
    await evaluate(
      'state.items.every(i=>document.querySelector("#art-"+i.id))',
    ),
    true,
  );
  const beforeSteal = await evaluate("state.moves");
  await click('#tray-X [data-item="adrenaline"]', true);
  await until('$("item-dialog").open');
  assert.equal(
    await evaluate(
      '[...$("steal-item").options].some(o=>o.value==="adrenaline")',
    ),
    false,
  );
  await evaluate(
    '$("steal-item").value="magnifier";$("steal-item").dispatchEvent(new Event("change",{bubbles:true}))',
  );
  assert.equal(await evaluate("state.moves"), beforeSteal);
  assert.match(
    await evaluate('$("steal-description").textContent'),
    /viên hiện tại/,
  );
  await screenshot("coquay-adrenaline-mobile.png");
  await click("#use-item", true);
  await until("state.moves===" + (beforeSteal + 1) + "&&!pending");
  assert.equal(await evaluate("state.knownShell"), true);
  assert.equal(
    await evaluate('state.inventories.O.includes("magnifier")'),
    false,
  );
  await until('__motions.some(m=>m.kind==="steal")');
  await until('!document.querySelector("#table-fx").children.length');
  await click('#tray-X [data-item="phone"]', true);
  await click("#use-item", true);
  await until('!pending&&state.lastAction.itemId==="phone"');
  assert.match(await evaluate('$("private-intel").textContent'), /Viên thứ/);
  assert.equal(await evaluate('Object.hasOwn(state.lastAction,"live")'), false);
  await click('#tray-X [data-item="inverter"]', true);
  await click("#use-item", true);
  await until('!pending&&state.lastAction.itemId==="inverter"');
  assert.equal(await evaluate("state.knownShell"), false);
  await click('#tray-X [data-item="expired_medicine"]', true);
  assert.match(await evaluate('$("item-note").textContent'), /có thể chết/);
  await click("#use-item", true);
  await until('!pending&&state.lastAction.itemId==="expired_medicine"');
  assert([17, 20].includes(await evaluate("state.hp.X")));
  await click("#inventory-open", true);
  await until('$("inventory-dialog").open');
  assert.match(await evaluate('$("inventory-detail").textContent'), /9 loại/);
  await screenshot("coquay-buckshot-catalog-mobile.png");
  await click('[data-close="inventory-dialog"]', true);
  assert.equal(
    await evaluate('document.querySelectorAll("#rules-help").length'),
    1,
  );
  assert.equal(
    await evaluate('document.querySelector("#rules-open, .wg-rules-entry")'),
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
  // Reduced motion still applies server results, without flying sprites or timers.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  motionCount = await evaluate("__motions.length");
  await click('#tray-X [data-item="magnifier"]', true);
  await click("#use-item", true);
  await until("state.knownShell!==null && !pending");
  assert.equal(await evaluate("__motions.length"), motionCount);
  assert.equal(
    await evaluate('document.querySelector("#table-fx").children.length'),
    0,
  );
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
  await click('#tray-X [data-item="magnifier"]', true);
  assert.equal(await evaluate('$("use-item").hidden'), true);
  assert.equal(
    await evaluate("location.pathname"),
    "/coquay/room/" + large.roomCode,
  );
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.me===null && connected');
  assert.equal(
    await evaluate("location.pathname"),
    "/coquay/room/" + large.roomCode,
  );
  assert.equal(await evaluate("roomId"), large.id);
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
