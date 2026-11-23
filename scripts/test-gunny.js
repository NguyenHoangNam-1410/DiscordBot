"use strict";
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  E = require("../src/gunny/engine"),
  { normalizeRules, WEAPONS, PHYSICS, STAMINA } = require("../src/gunny/rules"),
  Terrain = require("../src/gunny/public/terrain"),
  { createStore } = require("../src/gunny/store"),
  { createGame } = require("../src/gunny/webGame"),
  { createWebServer } = require("../src/webGames/http");
let time = Date.now(),
  serial = 0,
  web;
const store = createStore(db, () => time),
  users = {
    X: { id: "100000000000000001", username: "An <script>" },
    O: { id: "100000000000000002", username: "Bình" },
  };
const Aim = require("../src/gunny/public/aim");
const code = (fn, c) => assert.throws(fn, (e) => e.code === c);
const make = (rules = {}) =>
  store.create({
    guildId: "gunny-test-" + ++serial,
    channelId: "c",
    user: users.X,
    rules,
    seed: 123,
  });
const firingData = (r, m, data) =>
  data.type === "fire"
    ? {
        ...data,
        angle: Aim.solution(
          r.terrain,
          r.fighters[m],
          WEAPONS[data.weapon],
          data.direction,
          data.angle,
        ).horizontal,
      }
    : data;
const act = (r, m, data) =>
  store.move(r.id, users[m].id, firingData(r, m, data), r.version);
function started(rules = {}) {
  let r = store.join(make(rules).id, users.O);
  r = act(r, "X", { type: "ready", character: "cat" });
  return act(r, "O", { type: "ready", character: "robot" });
}
function flat() {
  const s = E.createState(1);
  s.terrain = s.terrain.map(() => [350, 600]);
  s.wind = 0;
  for (const [m, x] of [
    ["X", 480],
    ["O", 570],
  ])
    Object.assign(s.fighters[m], { x, y: 350 });
  return s;
}
function patch(r, fn) {
  const next = store.get(r.id);
  fn(next);
  db.prepare("UPDATE gunny_rooms SET data_json=? WHERE id=?").run(
    JSON.stringify(next),
    r.id,
  );
  return store.get(r.id);
}
async function main() {
  for (const [ms, percent] of [
    [0, 0],
    [1250, 50],
    [2500, 100],
    [3750, 50],
    [5000, 0],
    [6250, 50],
    [7500, 100],
    [8750, 50],
    [10000, 0],
    [10500, 20],
  ])
    assert.equal(
      Aim.chargePercent(ms),
      percent,
      "Repeated climb and descent use elapsed time",
    );
  const zero = E.fire(flat(), "X", {
    angle: 45,
    power: 0,
    weapon: "basic",
    direction: 1,
  });
  assert(!zero.error, "Releasing at 0% is a valid shot");
  assert(
    zero.shot.path.every((p) => p.every(Number.isFinite)),
    "Zero velocity falls under gravity without invalid positions",
  );
  assert.equal(zero.shot.power, 0);
  assert.deepEqual(E.createState(123), E.createState(123));
  assert.notDeepEqual(E.createState(123).terrain, E.createState(124).terrain);
  for (const opts of [
    { turnSeconds: 14 },
    { turnSeconds: 121 },
    { timeMinutes: 0 },
    { first: "bad" },
  ])
    code(() => normalizeRules(opts), "INVALID_RULES");
  for (const bad of [
    { angle: NaN },
    { power: Infinity },
    { weapon: "__proto__" },
    { weapon: ["basic"] },
    { direction: 0 },
    { angle: 91 },
    { power: -1 },
  ]) {
    const s = flat(),
      before = structuredClone(s);
    assert.equal(
      E.fire(s, "X", {
        angle: 0,
        power: 20,
        weapon: "basic",
        direction: 1,
        ...bad,
      }).error,
      "INVALID_SHOT",
    );
    assert.deepEqual(s, before);
  }
  for (const [weapon, w] of Object.entries(WEAPONS)) {
    const s = flat(),
      clone = structuredClone(s),
      shot = { angle: w.minAngle, power: 20, weapon, direction: 1 };
    s.fighters.O.x = 516;
    clone.fighters.O.x = 516;
    const a = E.fire(s, "X", shot),
      b = E.fire(clone, "X", shot);
    assert.deepEqual(a, b);
    assert.deepEqual(s, clone);
    assert.equal(a.shot.impact.target, "O");
    const direct = Math.min(
      100,
      a.shot.crit.O ? Math.round(w.damage * 1.5) : w.damage,
    );
    assert.equal(a.shot.damage.O, direct);
    assert.equal(s.fighters.O.hp, 100 - direct);
    // Body hits explode 20 px above the feet: small blasts may not reach the ground.
    if (w.radius >= 35) assert.notDeepEqual(s.terrain, a.shot.before.terrain);
    assert(a.shot.path.every((p) => p.every(Number.isFinite)));
    assert.equal(s.fighters.X.ammo[weapon], w.ammo < 0 ? -1 : w.ammo - 1);
  }
  let s = flat();
  s.fighters.X.ammo.nuke = 0;
  assert.equal(
    E.fire(s, "X", { angle: 45, power: 20, weapon: "nuke", direction: 1 })
      .error,
    "NO_AMMO",
  );
  s = flat();
  assert(
    E.fire(s, "X", { angle: 75, power: 1, weapon: "nuke", direction: 1 }).shot
      .damage.X > 0,
    "Own blast can hurt actor",
  );
  s = flat();
  s.fighters.O.x = 1120;
  for (let n = 0; n < STAMINA / 20; n++) assert.equal(E.walk(s, "X", 10), null);
  assert.equal(s.fighters.X.stamina, 0);
  assert.equal(E.walk(s, "X", 1), "NO_STAMINA");
  assert.equal(E.walk(s, "X", 11), "INVALID_MOVE");
  s = flat();
  s.fighters.O.x = 514;
  assert.equal(E.walk(s, "X", 1), "BLOCKED_MOVE");
  const h = Array.from({ length: 1600 }, () => [350, 600]);
  E.crater(h, 500, 350, 40);
  assert.deepEqual(h[500], [390, 600]);
  assert.deepEqual(h[400], [350, 600]);
  // Independent analytic ramps verify slope, facing and the world-space launch vector.
  const near = (a, b, message) =>
    assert(Math.abs(a - b) < 1e-8, message + `: ${a} vs ${b}`);
  for (const gradient of [-0.5, 0, 0.5]) {
    const r = flat();
    r.terrain = Terrain.fromHeights(
      r.terrain.map((_, x) =>
        Math.max(100, Math.min(400, 250 + (x - 480) * gradient)),
      ),
      600,
    );
    r.fighters.X.y = 350;
    const beta = (Math.atan(gradient) * 180) / Math.PI;
    near(
      Aim.terrainTilt(r.terrain, r.fighters.X),
      beta,
      "Tangent over the character footprint",
    );
    for (const d of [-1, 1]) {
      const g = Aim.solution(r.terrain, r.fighters.X, WEAPONS.basic, d, 45),
        expected = 45 + d * beta,
        world = d === 1 ? expected : 180 - expected;
      near(
        g.horizontal,
        expected,
        "Displayed elevation relative to horizontal",
      );
      near(g.world, world, "Needle bearing mirrors when facing left");
      near(
        g.center.x,
        480 - 20 * Math.sin((beta * Math.PI) / 180),
        "Tilted body collision center X",
      );
      near(
        g.center.y,
        350 - 20 * Math.cos((beta * Math.PI) / 180),
        "Tilted body collision center Y",
      );
      const copy = structuredClone(r),
        result = E.fire(copy, "X", {
          angle: expected,
          power: 10,
          weapon: "basic",
          direction: d,
        });
      assert(!result.error);
      near(
        result.shot.path[0][0],
        g.center.x + 22 * Math.cos((world * Math.PI) / 180),
        "Muzzle and red needle agree on X",
      );
      near(
        result.shot.path[0][1],
        g.center.y - 22 * Math.sin((world * Math.PI) / 180),
        "Muzzle and red needle agree on Y",
      );
      const dx = result.shot.path[1][0] - result.shot.path[0][0],
        dy = result.shot.path[1][1] - result.shot.path[0][1],
        v = 10 * PHYSICS.speed,
        keep = 1 - PHYSICS.drag;
      assert(
        Math.abs(dx - v * Math.cos((world * Math.PI) / 180) * keep) < 0.02,
      );
      assert(
        Math.abs(
          dy -
            (-v * Math.sin((world * Math.PI) / 180) + PHYSICS.gravity) * keep,
        ) < 0.02,
        "Authoritative projectile follows the displayed bearing",
      );
    }
  }
  for (const [id, w] of Object.entries(WEAPONS))
    for (const angle of [w.minAngle - 1, w.maxAngle + 1]) {
      const r = flat(),
        before = structuredClone(r);
      assert.equal(
        E.fire(r, "X", { angle, power: 10, weapon: id, direction: 1 }).error,
        "INVALID_SHOT",
      );
      assert.deepEqual(
        r,
        before,
        "Illegal elevation never spends ammo or damages terrain",
      );
    }
  const steep = flat();
  steep.terrain = Terrain.fromHeights(
    steep.terrain.map((_, x) =>
      Math.max(100, Math.min(400, 250 + (x - 480) * 0.8)),
    ),
    600,
  );
  steep.fighters.X.y = 350;
  assert.equal(
    E.fire(steep, "X", {
      angle: 20,
      power: 10,
      weapon: "missile",
      direction: 1,
    }).error,
    "INVALID_SHOT",
    "Server rechecks the terrain, not just the weapon's flat-ground range",
  );
  // Determinism and terrain/HP invariants across many seeds and legal trajectories.
  for (let seed = 0; seed < 120; seed++) {
    const a = E.createState(seed),
      b = structuredClone(a);
    const id = Object.keys(WEAPONS)[seed % 4],
      w = WEAPONS[id],
      dir = seed % 2 ? 1 : -1;
    const local = w.minAngle + (seed % (w.maxAngle - w.minAngle + 1));
    const shot = {
      angle: Aim.solution(a.terrain, a.fighters.X, w, dir, local).horizontal,
      power: 1 + (seed % 20),
      weapon: id,
      direction: dir,
    };
    assert.deepEqual(E.fire(a, "X", shot), E.fire(b, "X", shot));
    assert(
      a.terrain.every(
        (runs) =>
          runs.length % 2 === 0 &&
          runs.every(
            (y, i) =>
              Number.isInteger(y) &&
              y >= 0 &&
              y <= 600 &&
              (i === 0 || y > runs[i - 1]),
          ),
      ),
      "Terrain columns stay sorted, disjoint integer runs",
    );
    assert(Object.values(a.fighters).every((f) => f.hp >= 0 && f.hp <= 100));
  }
  let r = make();
  assert.match(r.roomCode, /^[a-f0-9]{8}$/i);
  assert.equal(store.resolveId(r.roomCode), r.id);
  code(
    () =>
      store.create({ guildId: r.guildId, channelId: "other", user: users.X }),
    "ALREADY_PLAYING",
  );
  r = store.join(r.id, users.O);
  assert.equal(r.status, "setup");
  assert.equal(r.clockStartedAt, null);
  code(
    () => act(r, "X", { type: "ready", character: "bad" }),
    "INVALID_CHARACTER",
  );
  r = act(r, "X", { type: "ready", character: "cat" });
  code(
    () => act(r, "X", { type: "ready", character: "bear" }),
    "ALREADY_READY",
  );
  r = act(r, "O", { type: "ready", character: "robot" });
  assert.equal(r.status, "playing");
  assert.equal(r.turn, "X");
  const before = structuredClone(r);
  code(() => act(r, "O", { type: "walk", dx: 5 }), "NOT_TURN");
  assert.deepEqual(store.get(r.id), before);
  code(
    () => store.move(r.id, users.X.id, { type: "walk", dx: 5 }, r.version - 1),
    "STALE_BOARD",
  );
  time += 4000;
  r = act(r, "X", { type: "walk", dx: 5 });
  assert.equal(r.fighters.X.stamina, STAMINA - 10);
  r = act(r, "X", {
    type: "fire",
    angle: 80,
    power: 15,
    weapon: "basic",
    direction: -1,
  });
  assert.equal(r.phase, "firing");
  assert.equal(r.clocks.X, 1800000 - 4000);
  assert.equal(store.snapshot(r, users.X.id).clockStartedAt, null);
  assert(
    JSON.stringify(store.snapshot(r)).length < 64000,
    "SSE snapshots fit backpressure limit",
  );
  code(() => act(r, "X", { type: "walk", dx: 5 }), "INVALID_ACTION");
  time = r.shot.endsAt;
  r = store.get(r.id);
  assert.equal(r.phase, "aim");
  assert.equal(r.turn, "O");
  assert.equal(r.clocks.X, 1796000);
  assert.equal(r.fighters.O.stamina, STAMINA);
  assert.equal(
    createStore(db, () => time).get(r.id).turn,
    "O",
    "Persist and recover state",
  );
  time += 30000;
  r = store.get(r.id);
  assert.equal(r.turn, "X");
  assert.equal(r.lastAction.reason, "turn_timeout");
  time = r.lastInputAt + 300000;
  r = store.get(r.id);
  assert.equal(r.reason, "idle");
  assert.equal(
    db.prepare("SELECT count(*) n FROM gunny_seats WHERE room_id=?").get(r.id)
      .n,
    0,
  );
  r = started({ timeMinutes: 1, turnSeconds: 120 });
  time += 60000;
  r = store.get(r.id);
  assert.equal(r.reason, "timeout");
  assert.equal(r.winner, "O");
  r = store.join(make().id, users.O);
  r = act(r, "X", { type: "ready", character: "bear" });
  time = r.setupDeadline;
  r = store.get(r.id);
  assert.equal(r.winner, "X");
  assert.equal(r.reason, "setup_timeout");
  r = make();
  time += 600000;
  assert.equal(store.get(r.id).reason, "expired");
  r = started();
  r = patch(r, (x) => {
    Object.assign(x, flat());
    x.fighters.O.hp = 10;
  });
  r = act(r, "X", {
    type: "fire",
    angle: 0,
    power: 20,
    weapon: "basic",
    direction: 1,
  });
  assert.equal(r.status, "playing");
  assert.equal(r.pendingOutcome.winner, "X");
  time = r.shot.endsAt;
  assert.equal(store.get(r.id).winner, "X");
  const payload = require("../src/gunny/discord").roomPayload(
    store.get(r.id),
    "https://example.com/gunny/room/" + r.roomCode,
  );
  assert.match(payload.embeds[0].toJSON().description, /chiến thắng/);
  // Real HTTP, concurrent duplicate moves, audience SSE, sessions and CSRF.
  r = started();
  const config = { origin: "", secure: false };
  web = createWebServer({ games: [createGame({ store, db })], config });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  async function request(route, data, cookie, origin = config.origin) {
    const res = await fetch(config.origin + "/api/games/gunny/" + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const cookies = [];
  for (const m of ["X", "O"]) {
    const ticket = new URL(
      web.issueTicket("gunny", r.id, users[m].id),
    ).hash.slice(8);
    const res = await request("login", { ticket });
    assert.equal(res.status, 200);
    cookies.push(res.cookie);
  }
  const viewer = (await request("state?room=" + r.roomCode)).data;
  assert.equal(viewer.me, null);
  assert(!JSON.stringify(viewer).includes(users.X.id));
  const abort = new AbortController(),
    stream = await fetch(
      config.origin + "/api/games/gunny/events?room=" + r.id,
      { signal: abort.signal },
    );
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  await reader.read();
  const next = reader.read();
  const data = firingData(r, "X", {
    roomId: r.roomCode,
    type: "fire",
    angle: 80,
    power: 15,
    weapon: "basic",
    direction: -1,
    version: r.version,
  });
  assert.equal((await request("move", data)).status, 401);
  assert.equal((await request("move", data, cookies[1])).status, 409);
  assert.equal(
    (await request("move", data, cookies[0], "https://evil.example")).status,
    403,
  );
  const results = await Promise.all([
    request("move", data, cookies[0]),
    request("move", data, cookies[0]),
  ]);
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
  assert.match(
    new TextDecoder().decode((await next).value),
    /"phase":"firing"/,
  );
  abort.abort();
  await reader.cancel().catch(() => {});
  for (const route of [
    "/gunny/room/" + r.roomCode,
    "/gunny/app.js",
    "/gunny/aim.js",
    "/gunny/terrain.js",
    "/gunny/style.css",
  ]) {
    const res = await fetch(config.origin + route);
    assert.equal(res.status, 200);
  }
  assert.match(await (await fetch(config.origin + "/")).text(), /Gunny/);
  const command = require("../src/commands/gunny"),
    runtime = require("../src/gunny/runtime"),
    available = runtime.isAvailable;
  runtime.isAvailable = () => true;
  try {
    const sent = [],
      i = {
        guildId: "discord-gunny",
        channelId: "c",
        user: users.X,
        options: {
          getSubcommand: () => "choi",
          getInteger: (n) => (n === "luot" ? 45 : 10),
          getString: () => "guest",
        },
        deferReply: async () => {},
        reply: async (p) => sent.push(p),
        editReply: async (p) => {
          sent.push(p);
          return { id: "lobby-gunny" };
        },
      };
    await command.execute(i);
    let d = runtime.store.listOpen(i.guildId, "c")[0];
    assert.equal(d.first, "O");
    assert.equal(d.rules.turnSeconds, 45);
    assert.equal(d.messageId, "lobby-gunny");
    const button = {
      ...i,
      user: users.O,
      message: { id: d.messageId },
      customId: `gunny:join:${d.id}`,
      deferUpdate: async () => {},
      followUp: async (p) => sent.push(p),
      isButton: () => true,
      isModalSubmit: () => false,
      isStringSelectMenu: () => false,
    };
    assert(
      await require("../src/componentRouter").routeComponentInteraction(button),
    );
    assert.equal(runtime.store.get(d.id).status, "setup");
    const client = {
      channels: {
        fetch: () => {
          throw Error("Expected bound interaction");
        },
      },
    };
    await runtime.syncMessages(client);
    assert.match(sent.at(-1).embeds[0].toJSON().description, /Sẵn sàng/);
    runtime.store.leave(d.id, users.O.id);
    await runtime.syncMessages(client);
    assert.match(sent.at(-1).embeds[0].toJSON().description, /chiến thắng/);
    await command.execute({
      ...i,
      memberPermissions: { has: () => false },
      options: { getSubcommand: () => "cauhinh" },
    });
    assert.match(sent.at(-1).content, /Chỉ quản trị/);
    const prefix = process.env.COMMAND_PREFIX;
    process.env.COMMAND_PREFIX = "!";
    try {
      await require("../src/services/slashPrefixService").handleSlashPrefix({
        guildId: "prefix-gunny",
        channelId: "c",
        author: users.X,
        content: "!gunny choi nguoitruoc=guest thoigian=12 luot=45",
        channel: {},
        reply: async (p) => {
          sent.push(p);
          return { id: "prefix-gunny" };
        },
      });
      const p = runtime.store.listOpen("prefix-gunny", "c")[0];
      assert.equal(p.first, "O");
      assert.equal(p.rules.timeMinutes, 12);
      assert.equal(p.rules.turnSeconds, 45);
    } finally {
      if (prefix === undefined) delete process.env.COMMAND_PREFIX;
      else process.env.COMMAND_PREFIX = prefix;
    }
  } finally {
    runtime.isAvailable = available;
  }
  const health = require("../src/services/operationalHealthService");
  store.sweep();
  let baseline = health.getOperationalHealth().active.sessions;
  const hr = make();
  assert.equal(health.getOperationalHealth().active.sessions, baseline + 1);
  store.leave(hr.id, users.X.id);
  assert(require("../src/commandRegistry").COMMAND_FILES.includes("gunny"));
  const cmd = require("../src/commands/gunny").data.toJSON();
  assert.equal(cmd.name, "gunny");
  assert.deepEqual(
    cmd.options.map((x) => x.name),
    ["choi", "phong", "cauhinh"],
  );
  console.log(
    JSON.stringify({
      ok: true,
      gunny:
        "analytic slope/facing oracles, horizontal elevation and muzzle velocity, weapon arcs and server rejection, deterministic physics, 120 seeds, collision/damage/craters, ammo/clocks/persistence, HTTP auth/race/SSE and commands",
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await web?.stop();
    db.close();
  });
