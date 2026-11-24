"use strict";
// Gunny mechanics: 2D terrain, digging/falling, shared stamina and items,
// multi-ball and multi-volley shots, fly, delay turn order, POW, status effects
// and physics/damage calibration. Uses SQLite in memory.
const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db"),
  E = require("../src/gunny/engine"),
  R = require("../src/gunny/rules"),
  T = require("../src/gunny/public/terrain"),
  Aim = require("../src/gunny/public/aim"),
  { createStore } = require("../src/gunny/store");

const code = (fn, c) => assert.throws(fn, (e) => e.code === c);
function flat(top = 350) {
  const s = E.createState(1);
  s.terrain = s.terrain.map(() => [top, 600]);
  s.wind = 0;
  Object.assign(s.fighters.X, { x: 480, y: top });
  Object.assign(s.fighters.O, { x: 1120, y: top });
  return s;
}
const legal = (s, mark, weapon, direction, local) =>
  Aim.solution(s.terrain, s.fighters[mark], R.WEAPONS[weapon], direction, local)
    .horizontal;

// ---- Terrain: true 2D runs, tunnels, overhangs, islands -------------------
{
  const cols = Array.from({ length: 1600 }, () => [350, 600]);
  T.carve(cols, 480, 430, 30);
  assert(T.solid(cols, 480, 360), "ground above the tunnel stays");
  assert(!T.solid(cols, 480, 430), "tunnel is hollow");
  assert(T.solid(cols, 480, 470), "floor below the tunnel stays");
  assert.equal(cols[480].length, 4, "one column now has two solid runs");
  assert.equal(T.support(cols, 480, 350), 350, "standing on the roof");
  assert.equal(T.support(cols, 480, 420), cols[480][2], "inside: next floor");
  T.addEllipse(cols, 800, 150, 60, 15);
  assert(T.solid(cols, 800, 150) && !T.solid(cols, 800, 200));
  assert.equal(T.topSurface(cols, 800), cols[800][0]);
  const gen = E.createState(7);
  assert(
    gen.terrain.some((runs) => runs.length >= 4),
    "generated maps contain floating islands",
  );
  for (const m of ["X", "O"]) {
    const f = gen.fighters[m];
    assert(T.headroom(gen.terrain, f.x, f.y), "spawns have headroom");
    assert.equal(T.support(gen.terrain, f.x, f.y), f.y);
  }
}

// ---- Digging and falling --------------------------------------------------
{
  const s = flat();
  T.carve(s.terrain, 480, 440, 30);
  assert.deepEqual(E.settle(s), []);
  assert.equal(s.fighters.X.y, 350, "a tunnel underneath does not drop you");
  T.carve(s.terrain, 480, 380, 32);
  E.settle(s);
  assert(s.fighters.X.y > 400, "losing the ground drops you into the cave");
  assert.equal(s.fighters.X.hp, R.HP, "falling into a cave is not damage");
  for (let x = 470; x <= 490; x++) s.terrain[x] = [];
  assert.deepEqual(E.settle(s), ["X"], "nothing below: fall out of the map");
  assert.equal(s.fighters.X.hp, 0);
}

// ---- Walking on 2D terrain ------------------------------------------------
{
  let s = flat();
  for (let x = 482; x < 520; x++) s.terrain[x] = [340, 600]; // 10 px step
  assert.equal(E.walk(s, "X", 5), null);
  assert.equal(s.fighters.X.y, 340, "climbs a small step");
  s = flat();
  for (let x = 481; x < 520; x++) s.terrain[x] = [300, 600]; // 50 px wall
  assert.equal(E.walk(s, "X", 5), "BLOCKED_MOVE");
  s = flat();
  for (let x = 481; x < 520; x++) s.terrain[x] = [300, 330, 350, 600]; // low roof
  assert.equal(E.walk(s, "X", 5), "BLOCKED_MOVE", "no headroom under a ledge");
  s = flat();
  for (let x = 400; x < 490; x++) s.terrain[x] = [250, 270, 350, 600];
  Object.assign(s.fighters.X, { x: 486, y: 250 });
  assert.equal(E.walk(s, "X", 10), null);
  assert.equal(
    s.fighters.X.y,
    350,
    "walking off an island drops to the ground",
  );
  s = flat();
  assert.equal(E.walk(s, "X", 10), null);
  assert.equal(s.fighters.X.stamina, R.STAMINA - 10 * R.WALK_COST);
  s.fighters.X.locked = true;
  assert.equal(E.walk(s, "X", 1), "FROZEN");
}

// ---- Physics calibration --------------------------------------------------
{
  const s = flat(500),
    range = (weapon, angle, wind = 0, windFactor) => {
      s.wind = wind;
      const w = R.WEAPONS[weapon],
        v = R.PHYSICS.maxForce,
        a = (angle * Math.PI) / 180;
      return (
        E.flight(
          s,
          "Z",
          { x: 100, y: 480 },
          { vx: v * Math.cos(a), vy: -v * Math.sin(a) },
          w,
          windFactor ?? w.windFactor,
        ).impact.x - 100
      );
    };
  const basic = range("basic", 45);
  assert(basic > 1150 && basic < 1350, `basic max range ${basic}`);
  // Every weapon shares the throw force; only mass/weight/wind/drag differ.
  for (const w of Object.values(R.WEAPONS))
    assert(w.mass > 0 && w.weight > 0 && !("speed" in w));
  assert(range("basic", 45) > range("basic", 65), "45° outranges 65°");
  assert(range("missile", 45) > basic * 1.2, "missile flies flatter");
  assert(range("grenade", 45) < basic, "grenade has more drag");
  assert(range("basic", 45, 3) > basic + 40, "tailwind carries further");
  assert(range("basic", 45, -3) < basic - 40, "headwind shortens");
  assert.equal(
    Math.round(range("basic", 45, 3, 0)),
    Math.round(basic),
    "zero wind factor ignores wind",
  );
  assert.equal(E.blastDamage(40, 0, 20, false), 40);
  assert.equal(E.blastDamage(40, 10, 20, false), 30);
  assert.equal(E.blastDamage(40, 20, 20, false), 0);
  assert.equal(E.blastDamage(40, 99, 20, true), 40, "direct hit is full");
}

// ---- Damage rules: self, crit determinism, frozen ------------------------
{
  let s = flat();
  s.fighters.X.hp = 5;
  E.fire(s, "X", {
    angle: legal(s, "X", "nuke", 1, 75),
    power: 1,
    weapon: "nuke",
    direction: 1,
  });
  assert.equal(s.fighters.X.hp, 1, "own blast never kills");
  let crits = 0;
  for (let seed = 0; seed < 200; seed++) {
    s = flat();
    s.rngState = seed;
    s.fighters.O.x = 516;
    const a = E.fire(structuredClone(s), "X", {
        angle: 0,
        power: 20,
        weapon: "basic",
        direction: 1,
      }),
      b = E.fire(structuredClone(s), "X", {
        angle: 0,
        power: 20,
        weapon: "basic",
        direction: 1,
      });
    assert.deepEqual(a, b, "seeded crits are deterministic");
    if (a.shot.crit.O) {
      crits++;
      assert.equal(
        a.shot.damage.O,
        Math.round(R.WEAPONS.basic.damage * R.DAMAGE.critMultiplier),
      );
    } else assert.equal(a.shot.damage.O, R.WEAPONS.basic.damage);
  }
  assert(crits > 4 && crits < 35, `crit rate ~8%: ${crits}/200`);
  s = flat();
  s.rngState = 1;
  s.fighters.O.x = 516;
  s.fighters.O.status.frozen = 1;
  const r = E.fire(s, "X", {
    angle: 0,
    power: 20,
    weapon: "grenade",
    direction: 1,
  });
  assert.equal(r.error, "INVALID_SHOT", "grenade min angle is 20°");
  const hit = E.fire(s, "X", {
    angle: 0,
    power: 20,
    weapon: "basic",
    direction: 1,
  });
  assert.equal(
    hit.shot.damage.O,
    Math.round(
      (hit.shot.crit.O ? 1.5 : 1) *
        R.WEAPONS.basic.damage *
        R.DAMAGE.frozenMultiplier,
    ),
  );
  assert.equal(s.fighters.O.status.frozen, 0, "damage breaks the ice");
  assert.deepEqual(hit.shot.projectiles[0].effects.O, ["thaw"]);
}

// ---- Items: stamina, limits, conflicts -----------------------------------
{
  const s = flat();
  const f = s.fighters.X;
  assert.equal(E.useItem(s, "X", "nope"), "INVALID_ITEM");
  assert.equal(E.useItem(s, "X", "__proto__"), "INVALID_ITEM");
  assert.equal(E.useItem(s, "X", "triple"), null);
  assert.equal(f.stamina, R.STAMINA - R.ITEMS.triple.cost);
  assert.equal(E.useItem(s, "X", "triple"), "ITEM_USED");
  assert.equal(
    E.useItem(s, "X", "double"),
    "NO_STAMINA",
    "×3 and ×2 cannot stack",
  );
  assert.equal(E.useItem(s, "X", "fly"), "ITEM_CONFLICT");
  assert.equal(E.useItem(s, "X", "heal"), "FULL_HP");
  f.hp = 50;
  assert.equal(E.useItem(s, "X", "heal"), null, "heal fits the stamina left");
  assert.equal(f.hp, 50 + R.HEAL);
  assert.equal(f.stamina, R.STAMINA - R.ITEMS.triple.cost - R.ITEMS.heal.cost);
  assert.equal(E.useItem(s, "X", "power"), "NO_STAMINA");
  E.startTurn(s, "X");
  assert.deepEqual(f.armed, {}, "armed items reset each turn");
  f.hp = 50;
  assert.equal(E.useItem(s, "X", "heal"), null);
  E.startTurn(s, "X");
  assert.equal(E.useItem(s, "X", "heal"), "ITEM_LIMIT", "heal twice per match");
  assert.equal(f.turnDelay, 0, "turn delay resets each turn");
  assert.equal(E.useItem(s, "X", "power"), null);
  assert.equal(f.turnDelay, R.ITEMS.power.delay);
  assert.equal(E.walk(s, "X", 10), null, "items and walking share stamina");
  assert.equal(f.stamina, R.STAMINA - R.ITEMS.power.cost - 10 * R.WALK_COST);
  f.locked = true;
  assert.equal(E.useItem(s, "X", "freeze"), "FROZEN");
}

// ---- Multi-ball (×3) and multi-volley (×2) --------------------------------
{
  let s = flat();
  s.fighters.O.x = 516;
  E.useItem(s, "X", "triple");
  let r = E.fire(s, "X", {
    angle: 10,
    power: 20,
    weapon: "basic",
    direction: 1,
  });
  assert.equal(r.shot.projectiles.length, 3);
  assert.deepEqual(
    Object.keys(s.fighters.X.lastShot),
    ["angle", "localAngle", "worldAngle", "power", "weapon", "direction"],
    "the last shot is remembered for the ghost marks",
  );
  assert.equal(s.fighters.X.lastShot.power, 20);
  assert.deepEqual(
    r.shot.projectiles.map((p) => p.volley),
    [0, 0, 0],
  );
  assert.equal(new Set(r.shot.projectiles.map((p) => p.ball)).size, 3);
  assert(
    r.shot.projectiles.every((p) => p.startMs === 0),
    "balls leave together",
  );
  for (const p of r.shot.projectiles)
    if (p.impact.target === "O")
      assert.equal(
        p.damage.O,
        Math.round((p.crit.O ? 1.5 : 1) * R.WEAPONS.basic.damage * 0.6),
      );
  s = flat();
  s.terrain = s.terrain.map(() => [500, 600]);
  Object.assign(s.fighters.X, { y: 500 });
  Object.assign(s.fighters.O, { y: 500 });
  E.useItem(s, "X", "triple");
  r = E.fire(s, "X", { angle: 45, power: 14, weapon: "basic", direction: 1 });
  const xs = r.shot.projectiles.map((p) => p.impact.x).sort((a, b) => a - b);
  assert(xs[2] - xs[0] > 40, "the three balls spread out");
  s = flat();
  s.fighters.O.x = 900;
  E.useItem(s, "X", "double");
  r = E.fire(s, "X", { angle: 45, power: 12, weapon: "basic", direction: 1 });
  assert.equal(r.shot.projectiles.length, 2);
  const [one, two] = r.shot.projectiles;
  assert.equal(two.volley, 1);
  assert(two.startMs >= one.startMs + one.flightMs, "second volley waits");
  assert(r.shot.flightMs >= two.startMs + two.flightMs);
  assert(one.after && two.after, "fighter states after each impact");
}

// ---- Fly ------------------------------------------------------------------
{
  const s = flat();
  assert.equal(E.useItem(s, "X", "fly"), null);
  assert.equal(E.useItem(s, "X", "freeze"), "ITEM_CONFLICT");
  assert.equal(E.usePow(s, "X"), "POW_NOT_READY");
  const before = structuredClone(s.terrain),
    r = E.fire(s, "X", { angle: 45, power: 10, weapon: "nuke", direction: 1 });
  assert(r.shot.fly && r.shot.teleport, "teleported");
  assert.deepEqual(s.terrain, before, "fly never digs");
  assert.deepEqual(r.shot.damage, { X: 0, O: 0 });
  assert.equal(s.fighters.X.ammo.nuke, 1, "fly spends no ammo");
  assert(s.fighters.X.x > 600, "moved forward");
  assert.equal(s.fighters.X.y, 350);
  E.startTurn(s, "X");
  assert.equal(E.useItem(s, "X", "fly"), "FLY_COOLDOWN");
  E.startTurn(s, "X");
  assert.equal(E.useItem(s, "X", "fly"), "FLY_COOLDOWN");
  E.startTurn(s, "X");
  assert.equal(E.useItem(s, "X", "fly"), null, "usable after 2 turns");
}

// ---- Status: freeze and poison --------------------------------------------
{
  const s = flat();
  s.fighters.O.x = 516;
  s.rngState = 3;
  E.useItem(s, "X", "freeze");
  E.useItem(s, "X", "poison");
  E.fire(s, "X", { angle: 0, power: 20, weapon: "basic", direction: 1 });
  assert.equal(s.fighters.O.status.frozen, R.STATUS.freezeTurns);
  assert.equal(s.fighters.O.status.poison, R.STATUS.poisonTurns);
  const hp = s.fighters.O.hp,
    report = E.startTurn(s, "O");
  assert(report.frozen && s.fighters.O.locked);
  assert.equal(report.poison, R.STATUS.poisonDamage);
  assert.equal(s.fighters.O.hp, hp - R.STATUS.poisonDamage);
  assert.equal(E.walk(s, "O", -5), "FROZEN");
  assert.equal(E.useItem(s, "O", "power"), "FROZEN");
  E.startTurn(s, "X");
  assert.equal(s.fighters.O.locked, false, "frozen only for one own turn");
  E.startTurn(s, "O");
  assert.equal(s.fighters.O.locked, false);
  E.startTurn(s, "O");
  assert.equal(s.fighters.O.status.poison, 0, "poison lasts 3 turns");
}

// ---- POW ------------------------------------------------------------------
{
  let s = flat();
  s.fighters.O.x = 516;
  s.rngState = 5;
  E.fire(s, "X", { angle: 0, power: 20, weapon: "basic", direction: 1 });
  assert(s.fighters.O.pow > 0, "taking damage builds POW");
  const powBefore = s.fighters.X.pow;
  E.addDelay(s, "X", "fire", { weapon: "basic" });
  assert.equal(
    s.fighters.X.pow,
    powBefore + R.POW.perShot,
    "firing builds POW",
  );
  s = flat();
  s.fighters.X.pow = 100;
  assert.equal(E.usePow(s, "X"), null);
  assert.equal(E.usePow(s, "X"), "ITEM_USED");
  assert.equal(E.useItem(s, "X", "fly"), "ITEM_CONFLICT");
  s.fighters.O.x = 560;
  s.rngState = 11;
  const r = E.fire(s, "X", {
    angle: 0,
    power: 20,
    weapon: "basic",
    direction: 1,
  });
  assert(r.shot.pow);
  assert.equal(r.shot.projectiles[0].radius, Math.round(20 * R.POW.radius));
  assert.equal(
    r.shot.damage.O,
    Math.round(
      (r.shot.crit.O ? 1.5 : 1) * R.WEAPONS.basic.damage * R.POW.damage,
    ),
  );
  assert.equal(s.fighters.X.pow, 0, "POW is spent");
  E.addDelay(s, "X", "fire", { weapon: "basic" });
  assert.equal(s.fighters.X.pow, 0, "a POW shot does not refill POW");
  // POW shots ignore wind.
  const calm = flat(),
    windy = flat();
  windy.wind = 3;
  for (const st of [calm, windy]) {
    st.fighters.X.pow = 100;
    E.usePow(st, "X");
  }
  const a = E.fire(calm, "X", {
      angle: 45,
      power: 12,
      weapon: "basic",
      direction: 1,
    }),
    b = E.fire(windy, "X", {
      angle: 45,
      power: 12,
      weapon: "basic",
      direction: 1,
    });
  assert.equal(a.shot.impact.x, b.shot.impact.x);
}

// ---- Delay turn order -----------------------------------------------------
{
  const s = flat();
  s.fighters.O.delay = 1;
  assert.equal(E.chooseNext(s, null), "X");
  E.addDelay(s, "X", "fire", { weapon: "basic", aimMs: 10_000 });
  assert.equal(
    s.fighters.X.delay,
    R.DELAY.turn + R.WEAPONS.basic.delay + 10 * R.DELAY.aimPerSecond,
  );
  assert.equal(E.chooseNext(s, "X"), "O");
  assert.equal(s.fighters.O.delay, 0, "delays rebase to the actor");
  E.useItem(s, "O", "triple");
  E.useItem(s, "O", "power");
  E.addDelay(s, "O", "fire", { weapon: "nuke", aimMs: 30_000 });
  assert.equal(E.chooseNext(s, "O"), "X");
  E.addDelay(s, "X", "pass");
  assert.equal(
    E.chooseNext(s, "X"),
    "X",
    "a heavy turn can hand the opponent two turns in a row",
  );
  s.fighters.O.delay = s.fighters.X.delay;
  assert.equal(E.chooseNext(s, "X"), "O", "ties go to the other fighter");
}

// ---- Legacy rooms ---------------------------------------------------------
{
  const legacy = {
    heights: Array(1600).fill(250),
    fighters: {
      X: { x: 480, y: 350, hp: 90, direction: 1, ammo: {}, moveRemaining: 30 },
      O: {
        x: 1120,
        y: 350,
        hp: 80,
        direction: -1,
        ammo: {},
        moveRemaining: 60,
      },
    },
    shot: {
      weapon: "basic",
      path: [[0, 0]],
      impact: { type: "miss", x: 0, y: 0 },
      damage: { X: 0, O: 0 },
      flightMs: 500,
      before: { heights: Array(1600).fill(250), fighters: {} },
    },
  };
  E.upgradeState(legacy);
  assert.deepEqual(legacy.terrain[0], [350, 600]);
  assert(!("heights" in legacy));
  assert.equal(legacy.fighters.X.stamina, R.STAMINA);
  assert(!("moveRemaining" in legacy.fighters.X));
  assert.equal(legacy.shot.projectiles.length, 1);
  assert.deepEqual(legacy.shot.before.terrain[0], [350, 600]);
}

// ---- Store: items, POW, pass, poison finish, snapshot size ---------------
{
  let time = 1_700_000_000_000;
  const store = createStore(db, () => time),
    users = {
      X: { id: "200000000000000001", username: "An" },
      O: { id: "200000000000000002", username: "Bình" },
    };
  const act = (r, m, data) => store.move(r.id, users[m].id, data, r.version);
  const patch = (r, fn) => {
    const next = store.get(r.id);
    fn(next);
    db.prepare("UPDATE gunny_rooms SET data_json=? WHERE id=?").run(
      JSON.stringify(next),
      r.id,
    );
    return store.get(r.id);
  };
  let r = store.create({
    guildId: "mech",
    channelId: "c",
    user: users.X,
    rules: {},
    seed: 9,
  });
  r = store.join(r.id, users.O);
  r = act(r, "X", { type: "ready", character: "bear" });
  r = act(r, "O", { type: "ready", character: "cat" });
  assert.equal(r.turn, "X");
  assert.equal(r.fighters.O.delay, 1);
  r = act(r, "X", { type: "item", item: "power" });
  assert.equal(r.fighters.X.stamina, R.STAMINA - R.ITEMS.power.cost);
  code(() => act(r, "X", { type: "item", item: "power" }), "ITEM_USED");
  code(() => act(r, "X", { type: "pow" }), "POW_NOT_READY");
  code(() => act(r, "O", { type: "item", item: "power" }), "NOT_TURN");
  time += 2000;
  r = act(r, "X", { type: "pass" });
  assert.equal(r.turn, "O", "pass hands the turn over");
  assert.equal(r.fighters.X.pow, R.POW.perPass);
  assert.equal(r.phase, "aim");
  r = patch(r, (x) => {
    x.fighters.X.status.poison = 1;
    x.fighters.X.hp = 4;
    x.fighters.X.delay = 0; // X acts right after O
  });
  r = act(r, "O", { type: "pass" });
  assert.equal(r.status, "finished");
  assert.equal(r.reason, "poison");
  assert.equal(r.winner, "O");

  r = store.create({
    guildId: "mech2",
    channelId: "c",
    user: users.X,
    rules: {},
    seed: 9,
  });
  r = store.join(r.id, users.O);
  r = act(r, "X", { type: "ready", character: "bear" });
  r = act(r, "O", { type: "ready", character: "cat" });
  r = act(r, "X", { type: "item", item: "triple" });
  const shot = {
    type: "fire",
    angle: Aim.solution(r.terrain, r.fighters.X, R.WEAPONS.missile, 1, 30)
      .horizontal,
    power: 20,
    weapon: "missile",
    direction: 1,
  };
  r = act(r, "X", shot);
  assert.equal(r.phase, "firing");
  assert.equal(r.shot.projectiles.length, 3);
  const view = store.snapshot(r, users.X.id);
  assert.equal(view.terrain, null, "firing snapshots omit the final terrain");
  assert(view.shot.before.terrain.length === 1600);
  assert(JSON.stringify(view).length < 60_000, "fits the SSE budget");
  assert.deepEqual(view.items, R.ITEMS);
  assert.equal(r.history.at(-1).items.join(), "triple");
  time = r.shot.endsAt;
  r = store.get(r.id);
  assert.equal(r.phase, "aim");
  assert.equal(r.turn, "O");
  assert(store.snapshot(r).terrain.length === 1600);
}

// ---- Snapshots skip known terrain; rooms wake at their own deadlines -----
(async () => {
  const store = createStore(db), // real clock: deadline wakeups enabled
    users = {
      X: { id: "300000000000000001", username: "An" },
      O: { id: "300000000000000002", username: "Bình" },
    };
  const act = (r, m, data) => store.move(r.id, users[m].id, data, r.version);
  let r = store.create({
    guildId: "wake",
    channelId: "c",
    user: users.X,
    rules: {},
    seed: 4,
  });
  r = store.join(r.id, users.O);
  r = act(r, "X", { type: "ready", character: "bear" });
  r = act(r, "O", { type: "ready", character: "cat" });
  const memo = {};
  assert.equal(
    store.snapshot(r, users.X.id, { stream: memo }).terrain.length,
    1600,
  );
  assert.equal(memo.terrainRev, 0);
  r = act(r, "X", { type: "walk", dx: 5 });
  const light = store.snapshot(r, users.X.id, { stream: memo });
  assert.equal(light.terrain, null, "same terrain is not resent");
  assert(JSON.stringify(light).length < 8000, "walk updates stay small");
  assert.equal(
    store.snapshot(r, users.X.id, { request: { terrainRev: 0 } }).terrain,
    null,
  );
  assert.equal(store.snapshot(r, users.X.id).terrain.length, 1600);
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("no wakeup")), 8000);
    store.events.on(r.id, (room) => {
      if (room.phase === "aim" && room.turnNo === 2) {
        clearTimeout(timer);
        resolve(room);
      }
    });
  });
  r = act(r, "X", {
    type: "fire",
    angle: Aim.solution(r.terrain, r.fighters.X, R.WEAPONS.nuke, 1, 60)
      .horizontal,
    power: 8,
    weapon: "nuke",
    direction: 1,
  });
  const next = await changed;
  assert.equal(next.turn, "O", "the turn changes without anyone polling");
  assert(next.terrainRev > 0, "digging bumps the terrain revision");
  assert.equal(
    store.snapshot(next, users.X.id, { stream: memo }).terrain.length,
    1600,
    "a new revision is sent again",
  );
  store.leave(r.id, users.X.id);
  console.log(
    JSON.stringify({
      ok: true,
      gunnyMechanics:
        "2D terrain/tunnels/islands, dig+fall, walking, physics calibration, damage/crit/self/frozen, items+stamina, ×3/×2 shots, fly, freeze/poison, POW, delay order, legacy upgrade, store flow, terrain-skipping snapshots, deadline wakeups",
    }),
  );
  db.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
