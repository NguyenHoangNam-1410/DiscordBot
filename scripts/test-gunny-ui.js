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
for (const id of ["gunny"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "gunny-ui-" + id,
    channelId: "c",
    user: users.X,
    seed: 123,
    rules: { turnSeconds: 120 },
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "gunny-ui-"));
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
    await screenshot("gunny-debug.png");
    throw Error(
      "UI not ready: " +
        expression +
        " / " +
        errors.join("\n") +
        " / " +
        (await evaluate("document.body.innerText")),
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
    if (!process.env.GUNNY_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.GUNNY_SCREENSHOT_DIR);
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
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: config.origin + "/fixture/gunny" });
  await until('typeof state!=="undefined" && state?.me==="X" && connected');
  await screenshot("gunny-setup.png");
  await click('[data-character="cat"]', true);
  await click("#ready", true);
  await until("state.ready.X && !pending");
  const fixture = fixtures.get("gunny");
  let room = fixture.store.get(fixture.room.id);
  room = fixture.store.move(
    room.id,
    users.O.id,
    { type: "ready", character: "robot" },
    room.version,
  );
  await until(
    'state.status==="playing" && state.phase==="aim" && !$("fire").disabled',
  );
  assert.equal(await evaluate("state.fighters.X.character"), "cat");
  await click("#info", true);
  assert.equal(await evaluate('$("info-dialog").open'), true);
  await click('[data-close="info-dialog"]', true);
  await click("#rules-help", true);
  assert.equal(await evaluate('$("rules-dialog").open'), true);
  await click(".wg-rules-close", true);
  await click("#account", true);
  assert.equal(await evaluate('$("account-dialog").open'), true);
  assert.equal(await evaluate('$("connect-player").hidden'), true);
  await click('[data-close="account-dialog"]', true);
  await click("#move-left", true);
  await until("!pending && state.fighters.X.stamina===190");
  const leftDial = await evaluate(
    '({...document.querySelector(".angle-dial").dataset,plane:$("terrain-plane").getAttribute("transform"),zone:$("angle-zone").getAttribute("d"),number:$("angle-value").textContent})',
  );
  assert.equal(
    leftDial.direction,
    "-1",
    "Walking left turns the character and the aiming dial",
  );
  assert.equal(
    leftDial.number,
    Math.round(45 - Number(leftDial.tilt)) + "°",
    "Display is the horizontal elevation, not just the slider setting",
  );
  assert(
    Math.abs(Number(leftDial.bearing) - (180 - Number(leftDial.horizontal))) <
      1e-7,
    "Left-facing red needle points to the left half at normal elevation",
  );
  await click("#direction", true);
  const rightDial = await evaluate(
    '({...document.querySelector(".angle-dial").dataset,plane:$("terrain-plane").getAttribute("transform"),zone:$("angle-zone").getAttribute("d")})',
  );
  assert.equal(rightDial.direction, "1");
  assert.equal(
    rightDial.plane,
    leftDial.plane,
    "Turning never flips the actual terrain",
  );
  assert.notEqual(
    rightDial.zone,
    leftDial.zone,
    "Allowed arc follows the facing direction",
  );
  for (const [id, min, max] of [
    ["basic", 0, 90],
    ["grenade", 20, 80],
    ["missile", 10, 70],
    ["nuke", 30, 75],
  ]) {
    await click(`[data-weapon="${id}"]`, true);
    assert.deepEqual(
      await evaluate('[Number($("angle").min),Number($("angle").max)]'),
      [min, max],
    );
    await evaluate('$("angle").value=999;$("angle").oninput()');
    assert.equal(
      await evaluate('Number($("angle").value)'),
      max,
      "Slider cannot leave the weapon's green sector",
    );
  }
  await click('[data-weapon="basic"]', true);
  await evaluate('$("angle").value=45;syncAim()');

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
      '(()=>{const c=$("battlefield").getBoundingClientRect(),f=$("fire").getBoundingClientRect(),t=document.querySelector("header").getBoundingClientRect();return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,c:c.toJSON(),f:f.toJSON(),t:t.toJSON()}})()',
    );
    assert(
      layout.scroll <= layout.w + 1,
      "No horizontal overflow " + JSON.stringify(layout),
    );
    assert(
      layout.c.width > 100 &&
        layout.c.height >= 130 &&
        layout.c.top >= 0 &&
        layout.c.bottom <= layout.h,
      "Arena visible " + JSON.stringify(layout),
    );
    assert(
      layout.f.bottom <= layout.h && layout.f.top >= 0,
      "Fire visible " + JSON.stringify(layout),
    );
    await until(
      '!$("unit-X").hidden && $("unit-X").dataset.stamina==="190" && Number.isFinite(parseFloat($("unit-X").style.top))',
    );
    const embedded = await evaluate(
      '(()=>{const a=document.querySelector(".arena").getBoundingClientRect(),u=$("unit-X").getBoundingClientRect(),f=$("fire").getBoundingClientRect();return {inside:$("fire").closest(".arena")!==null,sidebar:document.querySelector("aside.console")!==null,u:u.toJSON(),a:a.toJSON(),f:f.toJSON(),caption:$("unit-X").textContent}})()',
    );
    assert(
      embedded.inside && !embedded.sidebar,
      "Gameplay controls belong to the battlefield",
    );
    assert(
      embedded.u.top > embedded.a.top && embedded.u.bottom < embedded.f.top,
      "Stamina follows the fighter above the controls " +
        JSON.stringify(embedded),
    );
    assert.match(embedded.caption, /190/);
    assert.match(embedded.caption, /THỂ LỰC · NỘ/);
    const controlsFit = await evaluate(
      '(()=>{const a=$("aim").getBoundingClientRect(),i=$("items").getBoundingClientRect(),p=$("pass").getBoundingClientRect(),w=$("pow").getBoundingClientRect();return {ok:i.width>0&&i.bottom<=a.bottom+1&&p.right<=a.right+1&&w.width>0&&document.querySelectorAll("#items button").length===7}})()',
    );
    assert(controlsFit.ok, "Items, POW and pass fit inside the controls");
    await screenshot(`gunny-${metrics.width}x${metrics.height}.png`);
  }
  await click("#overview");
  await until('overview && !$("unit-X").hidden && !$("unit-O").hidden');
  await screenshot("gunny-overview.png");
  await click("#overview");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(await evaluate("reducedMotion.matches"), true);
  await until('!$("unit-X").hidden');
  assert.equal(
    await evaluate('getComputedStyle($("turn-clock")).animationName'),
    "none",
  );
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  const original = fixture.store.get(fixture.room.id),
    ramp = structuredClone(original),
    x = ramp.fighters.X.x;
  for (let col = Math.floor(x) - 55; col <= Math.ceil(x) + 55; col++)
    ramp.terrain[col] = [350 - (col - x) * Math.tan((26 * Math.PI) / 180), 600];
  ramp.fighters.X.y = 350;
  ramp.version++;
  db.prepare("UPDATE gunny_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(ramp),
    ramp.id,
  );
  fixture.store.events.emit(ramp.id, ramp);
  await until(
    'Math.abs(Number(document.querySelector(".angle-dial").dataset.tilt)-26)<.001',
  );
  await evaluate('direction=-1;$("angle").value=90;syncAim()');
  assert.equal(await evaluate('$("angle-value").textContent'), "64°");
  assert(
    Math.abs(
      (await evaluate(
        'Number(document.querySelector(".angle-dial").dataset.bearing)',
      )) - 116,
    ) < 0.001,
  );
  await screenshot("gunny-angle-left64.png");
  original.version = ramp.version + 1;
  db.prepare("UPDATE gunny_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(original),
    original.id,
  );
  fixture.store.events.emit(original.id, original);
  await until(
    'Math.abs(Number(document.querySelector(".angle-dial").dataset.tilt)-26)>.1',
  );
  // Holding fires exactly once after release, at the server-validated power.
  assert.deepEqual(
    await evaluate(
      '[Number($("power").min),Number($("power").max),$("power").disabled]',
    ),
    [0, 100, true],
    "The read-only power bar displays the complete percent range",
  );
  // Items: shared stamina, armed state and the POW button.
  assert.equal(await evaluate('$("pow").disabled'), true, "POW needs 100");
  assert.match(await evaluate('$("pow").textContent'), /NỘ 0/);
  await click('[data-item="triple"]', true);
  await until("!pending && state.fighters.X.armed.triple===true");
  assert.equal(await evaluate("state.fighters.X.stamina"), 90);
  assert.equal(
    await evaluate(
      '$("items").querySelector("[data-item=triple]").classList.contains("armed")',
    ),
    true,
  );
  assert.equal(
    await evaluate('$("items").querySelector("[data-item=double]").disabled'),
    true,
    "Items the stamina cannot pay for are disabled",
  );
  await evaluate(
    '$("angle").value=80;$("angle").oninput();direction=-1;$("power").value=15;$("power").oninput()',
  );
  await evaluate('$("fire").focus()');
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  await delay(220);
  assert.equal(await evaluate("charge!==null"), true, "Space starts charging");
  await key("Escape", "Escape", 27);
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: " ",
    code: "Space",
    windowsVirtualKeyCode: 32,
  });
  assert.equal(
    await evaluate("state.moves"),
    0,
    "Canceling a keyboard charge never fires",
  );
  let point = await evaluate(
    '(()=>{const r=$("fire").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...point,
  });
  const samples = [];
  for (let n = 0; n < 40; n++) {
    await delay(160);
    samples.push(
      await evaluate(
        '({elapsed:performance.now()-charge.at,percent:Number($("power").value),moves:state.moves})',
      ),
    );
  }
  assert(
    samples.every((s) => s.moves === 0 && s.percent >= 0 && s.percent <= 100),
    "Holding never fires automatically or leaves the power range",
  );
  assert(
    Math.max(...samples.map((s) => s.percent)) > 94,
    "Power reaches the upper end",
  );
  assert(
    samples.some((s, i) => i > 0 && s.percent < samples[i - 1].percent - 2),
    "Power descends after reaching the top",
  );
  assert(
    samples.some((s) => s.elapsed > 4700 && s.elapsed < 5300 && s.percent < 10),
    "Power returns to zero instead of staying capped",
  );
  assert(
    samples.at(-1).elapsed > 6000 && samples.at(-1).percent > 30,
    "Power starts rising again while the same press is held",
  );
  assert.equal(await evaluate("state.moves"), 0);
  assert.equal(await evaluate("charge!==null"), true);
  assert.equal(await evaluate('$("fire").textContent'), "THẢ");
  assert.match(await evaluate('$("power-value").textContent'), /%$/);
  await screenshot("gunny-charge.png");
  await key("Escape", "Escape", 27);
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...point,
  });
  assert.equal(
    await evaluate("state.moves"),
    0,
    "Canceling charge never sends a shot",
  );
  assert.equal(await evaluate("charge"), null);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...point,
  });
  await delay(550);

  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...point,
  });
  await until('state.phase==="firing" && state.moves===1 && !pending');
  assert.equal(await evaluate('$("fire").disabled'), true);
  assert.equal(await evaluate("state.clockStartedAt"), null);
  const fired = await evaluate(
    '({power:state.shot.power,percent:Number($("power").value)})',
  );
  assert(
    Math.abs(fired.power * 5 - fired.percent) < 0.11,
    "Server receives the percentage captured at release, converted to its power scale",
  );

  assert.equal(await evaluate("state.shot.projectiles.length"), 3);
  assert.equal(await evaluate("state.terrain"), null);
  assert.equal(
    await evaluate("scene(state.shot.startedAt+10).active.length"),
    3,
    "Three balls are replayed together",
  );
  await screenshot("gunny-projectile.png");
  await until("Date.now()+offset>=state.shot.startedAt+state.shot.flightMs");
  await screenshot("gunny-impact.png");
  await until('state.phase==="aim" && state.turn==="O"');
  assert.equal(await evaluate('$("fire").disabled'), true);
  // Audience can watch with no player controls, reload restores live battle.
  await send("Network.clearBrowserCookies");
  await send("Page.reload");
  await until('typeof state!=="undefined" && state?.me===null && connected');
  assert.equal(await evaluate('$("aim").hidden'), true);
  assert.equal(await evaluate('$("setup").hidden'), true);
  room = fixture.store.get(fixture.room.id);
  room = fixture.store.move(
    room.id,
    users.O.id,
    {
      type: "fire",
      angle:
        60 +
        require("../src/gunny/public/aim").terrainTilt(
          room.terrain,
          room.fighters.O,
        ),
      power: 10,
      weapon: "grenade",
      direction: 1,
    },
    room.version,
  );
  await until('state.phase==="firing" && state.moves===2');
  await screenshot("gunny-spectator.png");
  fixture.store.leave(room.id, users.O.id);
  await until('state.status==="finished"');
  assert.match(await evaluate('$("result-title").textContent'), /chiến thắng/);
  await screenshot("gunny-victory.png");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      gunnyUI:
        "terrain tilt and facing, horizontal angle, red needle/ground mask/weapon sectors, 64-degree left-facing ramp, clamped controls, repeating 0-100-0 charge, Space/cancel/release power, stamina, playback, PC/mobile, audience SSE and reload",
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
          path.basename(resolved).startsWith("gunny-ui-"),
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
