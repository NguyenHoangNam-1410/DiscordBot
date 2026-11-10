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
for (const id of ["oanquan"]) {
  const store = require("../src/" + id + "/store").createStore(db);
  let room = store.create({
    guildId: "oanquan-ui-" + id,
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "oanquan-ui-"));
  const executable =
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
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
  async function until(expression, attempts = 550) {
    for (let n = 0; n < attempts; n++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    await screenshot("oanquan-debug.png");
    throw Error(
      "UI not ready: " +
        expression +
        " / " +
        errors.join("\n") +
        " / " +
        (await evaluate(
          `JSON.stringify({active:document.activeElement?.id,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.id),motions:__motions.map(m=>m.kind),layout:__layout,input:__input,scroll:scrollY,board:$("board")?.getBoundingClientRect().toJSON()})`,
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
    await delay(touch ? 360 : 50);
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
    if (!process.env.OANQUAN_SCREENSHOT_DIR) return;
    const dir = path.resolve(process.env.OANQUAN_SCREENSHOT_DIR);
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
      "window.__sfx=[];window.__osc=0;const nativeOsc=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(...args){__osc++;return nativeOsc.apply(this,args)};document.addEventListener('DOMContentLoaded',()=>{const effect=WebGameFeedback.effect;WebGameFeedback.effect=cue=>{const before=__osc;effect(cue);__sfx.push({cue,at:serverNow()-state.lastMove.at,index:replay.motionIndex,voices:__osc-before})}});window.__input=[];['pointerdown','pointerup','pointercancel','lostpointercapture','click','contextmenu','touchstart','touchend'].forEach(k=>document.addEventListener(k,e=>{__input.push([k,e.target?.id||e.target?.dataset?.pit||e.target?.dataset?.panel||e.target?.tagName,Math.round(performance.now())]);if(__input.length>40)__input.shift()},true));window.__motions=[];window.__layout=[];window.__events=[];window.__poses=new Set();window.__drops=0;setInterval(()=>{const h=document.getElementById('sowing-hand'),s=document.getElementById('sowing-stone');if(h&&!h.hidden)__poses.add(h.dataset.pose);if(s&&!s.hidden)__drops++},25);const nativeAnimate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('stone-flight'))__motions.push({className:this.className,at:performance.now()});return nativeAnimate.call(this,frames,options)};document.addEventListener('animationstart',e=>__events.push(e.animationName),true);",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: config.origin + "/fixture/oanquan" });
  await until('typeof state!=="undefined"&&state?.me==="X"&&connected');
  assert.equal(await evaluate("cells.length"), 12);
  assert.equal(
    await evaluate('document.querySelectorAll(".mandarin").length'),
    2,
  );
  assert.equal(await evaluate('$("name-X").textContent'), users.X.username);
  async function geometry() {
    const result = await evaluate(
      `(()=>{const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,right:r.right}};return {board:rect($('board')),controls:rect($('controls')),pit:rect(cells[1]),window:{w:innerWidth,h:innerHeight},scroll:document.documentElement.scrollWidth,overlap:cells.some((p,i)=>cells.some((q,j)=>i<j&&(()=>{const a=p.getBoundingClientRect(),b=q.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1})()))}})()`,
    );
    assert(
      result.board.w > 100 && result.board.h > 100,
      JSON.stringify(result),
    );
    assert(result.pit.w > 30 && result.pit.h > 24);
    assert(result.controls.b <= result.window.h, "Instructions stay visible");
    assert(result.scroll <= result.window.w + 1, "No horizontal page overflow");
    assert.equal(result.overlap, false, "Pits never overlap");
    return result;
  }
  await geometry();
  await screenshot("oanquan-desktop.png");
  assert.equal(
    await evaluate('$("confirm") || $("direction-minus") || $("clear")'),
    null,
  );
  assert.deepEqual(
    await evaluate(
      'cells.filter(c=>!c.classList.contains("quan-pit")).map(c=>c.querySelector(".pit-label").textContent).sort()',
    ),
    [..."abcdefghij"],
  );
  assert.equal(await evaluate('$("sowing-hand").hidden'), true);
  await click('[data-pit="1"]');
  assert.deepEqual(
    await evaluate(
      'cells.filter(c=>c.classList.contains("direction-option")).map(c=>Number(c.dataset.pit))',
    ),
    [0, 2],
  );
  await click('[data-pit="1"]');
  assert.equal(await evaluate("selected"), null);
  await click('[data-pit="1"]');
  await evaluate(
    '$("board").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))',
  );
  assert.equal(await evaluate("selected"), null);
  await click('[data-pit="1"]');
  await key("Escape", "Escape", 27);
  assert.equal(await evaluate("selected"), null);
  async function dragPit(from, to, touch = false, cancel = false) {
    const points = await evaluate(
      "(()=>{const p=i=>{const r=cells[i].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}};return [p(" +
        from +
        ")," +
        (to === null ? "({x:2,y:2})" : "p(" + to + ")") +
        "]})()",
    );
    if (touch)
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [points[0]],
      });
    else
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        buttons: 1,
        clickCount: 1,
        ...points[0],
      });
    for (let i = 1; i <= 6; i++) {
      const point = {
        x: points[0].x + ((points[1].x - points[0].x) * i) / 6,
        y: points[0].y + ((points[1].y - points[0].y) * i) / 6,
      };
      if (touch)
        await send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point],
        });
      else
        await send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          button: "left",
          buttons: 1,
          ...point,
        });
      await delay(25);
    }
    if (cancel)
      await evaluate(
        '$("board").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))',
      );
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
        ...points[1],
      });
    // Let Chrome finish suppressing the compatibility click after a touch drag.
    await delay(touch ? 700 : 100);
  }
  await dragPit(1, 4);
  assert.equal(await evaluate("selected"), null);
  assert.equal(await evaluate("state.ply"), 0);
  await dragPit(1, 0, false, true);
  assert.equal(await evaluate("selected"), null);
  assert.equal(await evaluate("state.ply"), 0);
  await dragPit(1, 0);
  await until("state.ply===1&&!pending&&replay!==null");
  assert.equal(await evaluate('$("clock-O").textContent'), "30:00");
  assert.equal(await evaluate('$("sowing-hand").hidden'), false);
  await until('replay?.motionIndex===1&&!$("sowing-stone").hidden');
  assert.equal(
    await evaluate("replay.view.pits[0].dan"),
    0,
    "Pit count waits for the stone to land",
  );
  await screenshot("oanquan-hand-sow.png");
  await until("replay?.view.pits[0].dan===1");
  assert.equal(
    await evaluate('__sfx.filter(s=>s.cue==="stone").length'),
    1,
    "First pebble sounds exactly on landing",
  );
  await evaluate("window.__savedReplay=replay;accept(structuredClone(state))");
  assert.equal(
    await evaluate("replay===__savedReplay"),
    true,
    "Duplicate snapshot preserves replay progress",
  );
  await until('__events.includes("pit-hit")');
  await screenshot("oanquan-capture.png");
  await until("replay===null");
  assert((await evaluate("__motions.length")) >= 6);
  const firstSfx = await evaluate("__sfx");
  assert.equal(
    firstSfx.filter((s) => s.cue === "stone").length,
    10,
    "Each of ten stones sounds once",
  );
  assert.equal(
    firstSfx.filter((s) => s.cue === "slap").length,
    1,
    "The empty pit is slapped once",
  );
  assert(
    firstSfx.every((s) => s.voices === 2),
    "Both cues reach the running audio engine",
  );
  const firstSteps = await evaluate("state.lastMove.steps");
  for (const sound of firstSfx) {
    const step = firstSteps[sound.index],
      span =
        (firstSteps[sound.index + 1]?.offset ??
          (await evaluate("state.lastMove.duration"))) - step.offset;
    const impactAt = step.offset + span * (sound.cue === "stone" ? 0.9 : 0.28);
    assert(
      sound.at >= impactAt && sound.at - impactAt < 180,
      "Sound follows the visual impact, not move submission",
    );
  }
  assert((await evaluate("__drops")) > 0);
  assert.deepEqual(
    (await evaluate("[...__poses]")).sort(),
    ["carrying", "gathering", "holding", "sowing", "tapping"].sort(),
  );
  assert.equal(
    await evaluate('$("sowing-hand").hidden&&$("sowing-stone").hidden'),
    true,
  );
  assert(await evaluate('__events.includes("pit-sow")'));
  assert.equal(
    await evaluate('$("score-X").textContent.startsWith("11 điểm")'),
    true,
  );
  await evaluate("accept(structuredClone(state))");
  assert.equal(
    await evaluate("replay"),
    null,
    "Late duplicate cannot restart animation",
  );
  assert.equal(
    await evaluate("__sfx.length"),
    firstSfx.length,
    "Duplicate snapshots cannot repeat impacts",
  );
  assert(
    (await evaluate('cells.filter(c=>c.classList.contains("recent")).length')) >
      1,
  );
  const fixture = fixtures.get("oanquan");
  let room = fixture.store.get(fixture.room.id);
  await send("Page.navigate", {
    url: web.issueTicket("oanquan", room.id, users.O.id),
  });
  await until(
    'typeof state!=="undefined"&&state?.me==="O"&&connected&&canAct()',
  );
  assert.equal(await evaluate("rotated"), true);
  await click("#rules-help");
  assert.equal(await evaluate('$("rules-dialog").open'), true);
  assert(
    (await evaluate('$("rules-dialog").textContent')).includes("quan non"),
  );
  await key("Escape", "Escape", 27);
  await until('!$("rules-dialog").open');
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
    const legal = await evaluate("state.legalMoves[0].pit");
    await click('[data-pit="' + legal + '"]', true);
    assert.equal(await evaluate("selected"), legal);
    await click('[data-pit="' + legal + '"]', true);
    assert.equal(await evaluate("selected"), null);
    await dragPit(legal, null, true);
    assert.equal(await evaluate("selected"), null);
    assert.equal(await evaluate("state.ply"), 1);
    await click('[data-panel="history"]', true);
    await until('WebGameMobile.active()==="history"', 80);
    await click(
      ".wg-sheet:not([hidden]) .wg-sheet-close, .wg-menu-dialog[open] .wg-modal-close",
      true,
    );
    await until("!WebGameMobile.active()");
    await screenshot("oanquan-" + width + "x" + height + ".png");
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(200);
  const guestPit = await evaluate("state.legalMoves[0].pit");
  await dragPit(guestPit, (guestPit + 1) % 12, true);
  await until("state.ply===2&&replay!==null");
  await until('__sfx.filter(s=>s.cue==="stone").length>=2');
  await send("Page.reload");
  await until(
    'typeof state!=="undefined"&&state?.me==="O"&&state.ply===2&&connected',
  );
  const soundCutoff = await evaluate("replay.soundAfter");
  assert.equal(
    await evaluate("__sfx.length"),
    0,
    "Reload skips the stones already played",
  );
  await click("#sound-toggle", true);
  const replayDeadline = await evaluate("state.animationUntil");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await delay(150);
  assert.equal(
    await evaluate('getComputedStyle($("sowing-stone")).display'),
    "none",
  );
  assert.equal(
    await evaluate("state.animationUntil"),
    replayDeadline,
    "Reduced motion preserves server deadline",
  );
  await send("Emulation.setEmulatedMedia", { features: [] });
  const otherTab = await send("Target.createTarget", { url: "about:blank" });
  await send("Target.activateTarget", { targetId: otherTab.targetId });
  await until("document.hidden", 80);
  const beforeBackground = await evaluate("__sfx.length");
  await delay(1200);
  assert.equal(
    await evaluate("__sfx.length"),
    beforeBackground,
    "Hidden tabs do not emit impacts",
  );
  await send("Target.activateTarget", {
    targetId: targets.find((t) => t.type === "page").id,
  });
  await until("!document.hidden", 80);
  const resumedAt = await evaluate("replay.soundAfter");
  await send("Target.closeTarget", { targetId: otherTab.targetId });
  await until("replay===null");
  assert(
    (await evaluate("__sfx"))
      .slice(beforeBackground)
      .every((s) => s.at > resumedAt),
    "Returning to the tab skips all missed impacts",
  );
  assert(
    await evaluate('__sfx.some(s=>s.cue==="stone"&&s.voices===2)'),
    "Remaining stones still sound after activation",
  );
  assert(
    (await evaluate("__sfx")).every((s) => s.at > soundCutoff),
    "No impact before the reload cutoff is replayed",
  );
  await send("Page.navigate", {
    url: web.issueTicket("oanquan", room.id, users.X.id),
  });
  await until(
    'typeof state!=="undefined"&&state?.me==="X"&&connected&&canAct()',
  );
  await click("#rotate-board");
  const clickMove = await evaluate("state.legalMoves[0]");
  await click('[data-pit="' + clickMove.pit + '"]', true);
  await click(
    '[data-pit="' + ((clickMove.pit + clickMove.direction + 12) % 12) + '"]',
    true,
  );
  await until("state.ply===3&&replay!==null");
  await until("replay===null");
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", {
    url: config.origin + "/oanquan/room/" + room.id,
  });
  await until(
    'typeof state!=="undefined"&&state?.me===null&&state.ply===3&&connected',
  );
  assert.equal(await evaluate("canAct()"), false);
  assert.equal(
    await evaluate(
      'cells.some(c=>c.classList.contains("legal")||c.classList.contains("direction-option"))',
    ),
    false,
  );
  await click('[data-pit="1"]', true);
  assert.equal(await evaluate("selected"), null);
  room = fixture.store.get(room.id);
  const move = fixture.store.snapshot(room, users[room.turn].id).legalMoves[0];
  room = fixture.store.move(room.id, users[room.turn].id, move, room.version);
  await until("state.ply===4&&replay!==null");
  await until("replay===null");
  assert(
    await evaluate('__sfx.some(s=>s.cue==="stone"&&s.voices===2)'),
    "Spectators hear the same live pebble effects",
  );
  fixture.store.leave(room.id, users.X.id);
  await until('state.status==="finished"');
  assert(
    (await evaluate('$("status-title").textContent')).includes(
      users.O.username,
    ),
  );
  assert.equal(
    await evaluate(
      'cells.some(c=>c.classList.contains("legal")||c.classList.contains("direction-option"))',
    ),
    false,
  );
  await screenshot("oanquan-result.png");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      oanquanUI:
        "desktop/portrait/landscape, mouse/touch drag, immediate click move, cancel/invalid drop, animated hand poses, synchronized stone/slap audio without duplicate/reload sounds, and delayed stone landing, paused clocks, duplicate/reload replay, guest orientation, rules/history dialog, live spectator and result",
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
          path.basename(resolved).startsWith("oanquan-ui-"),
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
