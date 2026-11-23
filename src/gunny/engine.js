"use strict";
// Character art and the original artillery idea come from maycuatroi1/gunny-game (MIT).
// The 2D digging terrain, shared stamina, items, delay turn order and POW follow
// classic Gunny gameplay concepts, implemented independently for this bot.
// All gameplay is evaluated at fixed 60 Hz; rendering never decides damage.
const {
  WIDTH,
  HEIGHT,
  HP,
  STAMINA,
  WALK_COST,
  POW_MAX,
  DELAY,
  PHYSICS,
  DAMAGE,
  WEAPONS,
  ITEMS,
  SHOT_ITEMS,
  BALLS,
  STATUS,
  POW,
  HEAL,
} = require("./rules");
const Terrain = require("./public/terrain");
const Aim = require("./public/aim");
const CLIMB = 16,
  GAP_MS = 300,
  HIT_RADIUS = 18;
function random(state) {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const surface = (terrain, x, y = 0) => Terrain.support(terrain, x, y) ?? HEIGHT;
function wind(state) {
  state.wind = Math.round((random(state) * 6 - 3) * 100) / 100;
  return state.wind;
}
function newFighter(x, y, direction) {
  return {
    x,
    y,
    hp: HP,
    character: "bear",
    direction,
    ammo: Object.fromEntries(
      Object.entries(WEAPONS).map(([id, w]) => [id, w.ammo]),
    ),
    stamina: STAMINA,
    delay: 0,
    pow: 0,
    status: { frozen: 0, poison: 0 },
    locked: false,
    flyCooldown: 0,
    armed: {},
    used: [],
    itemUses: {},
    turnDelay: 0,
  };
}
// Rolling hills plus floating islands between the spawns, so the map has real
// overhangs from the first turn; digging then opens caves and tunnels.
function createState(seed) {
  const s = { rngState: seed >>> 0 },
    freq = Array.from({ length: 4 }, () => 0.002 + random(s) * 0.003),
    amp = Array.from({ length: 4 }, () => 0.2 + random(s) * 0.8),
    phase = Array.from({ length: 4 }, () => random(s) * Math.PI * 2),
    sum = amp.reduce((a, b) => a + b, 0);
  const heights = Array.from({ length: WIDTH }, (_, x) =>
    Math.max(
      100,
      Math.min(
        400,
        Math.round(
          250 +
            (150 *
              amp.reduce(
                (v, a, i) =>
                  v + a * Math.sin(freq[i] * x * Math.PI * 2 + phase[i]),
                0,
              )) /
              sum +
            random(s) * 6 -
            3,
        ),
      ),
    ),
  );
  s.terrain = Terrain.fromHeights(heights, HEIGHT);
  for (let i = 0; i < 2; i++) {
    const cx = Math.round(660 + i * 150 + random(s) * 130),
      rx = Math.round(Math.min(95, cx - 560, 1040 - cx, 55 + random(s) * 40)),
      ry = Math.round(13 + random(s) * 8),
      ground = Terrain.topSurface(s.terrain, cx),
      cy = Math.round(Math.max(70 + ry, ground - 120 - random(s) * 90 - ry));
    if (rx > 30) Terrain.addEllipse(s.terrain, cx, cy, rx, ry);
  }
  s.fighters = {};
  for (const [mark, x, direction] of [
    ["X", 480, 1],
    ["O", 1120, -1],
  ])
    s.fighters[mark] = newFighter(x, surface(s.terrain, x), direction);
  wind(s);
  return s;
}
// Walking moves one column at a time with the shared Terrain.step rules.
function walk(state, mark, dx) {
  if (!Number.isInteger(dx) || !dx || Math.abs(dx) > 10) return "INVALID_MOVE";
  const f = state.fighters[mark],
    sign = Math.sign(dx);
  if (f.locked) return "FROZEN";
  const budget = Math.min(Math.abs(dx), Math.floor(f.stamina / WALK_COST));
  if (budget <= 0) return "NO_STAMINA";
  const others = Object.entries(state.fighters)
    .filter(([side, o]) => side !== mark && o.hp > 0)
    .map(([, o]) => o);
  let moved = 0;
  for (let i = 0; i < budget; i++) {
    const next = Terrain.step(state.terrain, f, sign, others, CLIMB);
    if (!next) break;
    f.x = next.x;
    f.y = next.y;
    moved++;
  }
  if (!moved) return "BLOCKED_MOVE";
  f.stamina -= moved * WALK_COST;
  f.direction = sign;
  return null;
}
// After the ground changes every living fighter rests on the surface below its
// feet; a column with nothing underneath means falling out of the map.
function settle(state) {
  const fallen = [];
  for (const [side, f] of Object.entries(state.fighters)) {
    if (f.hp <= 0) continue;
    const y = Terrain.support(state.terrain, f.x, f.y);
    if (y === null || y >= HEIGHT) {
      f.y = HEIGHT;
      f.hp = 0;
      fallen.push(side);
    } else f.y = y;
  }
  return fallen;
}
function crater(terrain, x, y, r) {
  return Terrain.carve(terrain, x, y, r);
}
const round2 = (v) => Math.round(v * 100) / 100;
function flight(state, mark, start, velocity, w, windFactor) {
  const bodies = Object.entries(state.fighters)
      .filter(([side, f]) => side !== mark && f.hp > 0)
      .map(([side, f]) => [side, Aim.bodyCenter(state.terrain, f)]),
    drag = PHYSICS.drag * w.drag;
  let { x, y } = start,
    { vx, vy } = velocity,
    impact = null,
    ticks = 0;
  const path = [[x, y]];
  for (; ticks < 900 && !impact; ticks++) {
    vx += state.wind * PHYSICS.wind * windFactor;
    vy += PHYSICS.gravity * w.gravity;
    vx -= vx * drag;
    vy -= vy * drag;
    const nx = x + vx,
      ny = y + vy,
      steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) / 3));
    for (let step = 1; step <= steps; step++) {
      const px = x + ((nx - x) * step) / steps,
        py = y + ((ny - y) * step) / steps;
      const hit = bodies.find(
        ([, b]) => Math.hypot(px - b.x, py - b.y) <= HIT_RADIUS,
      );
      if (hit) {
        impact = { type: "player", x: px, y: py, target: hit[0] };
        break;
      }
      if (Terrain.solid(state.terrain, px, py)) {
        impact = { type: "terrain", x: px, y: py };
        break;
      }
      if (px < -100 || px > WIDTH + 100 || py > HEIGHT + 100) {
        impact = { type: "miss", x: px, y: py };
        break;
      }
    }
    x = nx;
    y = ny;
    if (ticks % 2 === 0) path.push([round2(x), round2(y)]);
  }
  if (!impact) impact = { type: "miss", x, y };
  impact.x = round2(impact.x);
  impact.y = round2(impact.y);
  path.push([impact.x, impact.y]);
  return { path, impact, ticks };
}
// Damage keeps half its strength at the blast edge; a direct hit lands in full.
function blastDamage(base, distance, radius, direct) {
  if (direct) return base;
  if (distance >= radius) return 0;
  return base * (1 - (1 - DAMAGE.edge) * (distance / radius));
}
function explode(state, mark, impact, radius, base, armed) {
  const result = {
    damage: { X: 0, O: 0 },
    crit: { X: false, O: false },
    effects: { X: [], O: [] },
  };
  if (impact.type === "miss") return result;
  const bodies = Object.fromEntries(
    Object.entries(state.fighters).map(([side, f]) => [
      side,
      Aim.bodyCenter(state.terrain, f),
    ]),
  );
  for (const [side, f] of Object.entries(state.fighters)) {
    if (f.hp <= 0) continue;
    const distance = Math.max(
        0,
        Math.hypot(impact.x - bodies[side].x, impact.y - bodies[side].y) - 12,
      ),
      own = side === mark;
    let raw = blastDamage(base, distance, radius, impact.target === side);
    if (raw <= 0) continue;
    if (!own && random(state) < DAMAGE.critChance) {
      raw *= DAMAGE.critMultiplier;
      result.crit[side] = true;
    }
    if (own) raw *= DAMAGE.selfMultiplier;
    if (f.status.frozen > 0) {
      raw *= DAMAGE.frozenMultiplier;
      f.status.frozen = 0;
      result.effects[side].push("thaw");
    }
    let dealt = Math.max(1, Math.round(raw));
    // Your own blast can wound you but never finish you off.
    if (own) dealt = Math.min(dealt, f.hp - 1);
    dealt = Math.min(dealt, f.hp);
    if (dealt <= 0) continue;
    f.hp -= dealt;
    result.damage[side] = dealt;
    if (f.hp > 0)
      f.pow = Math.min(
        POW_MAX,
        f.pow +
          Math.min(POW.damageTakenCap, Math.round(dealt * POW.damageTaken)),
      );
    if (!own && f.hp > 0) {
      if (armed.freeze) {
        f.status.frozen = STATUS.freezeTurns;
        result.effects[side].push("freeze");
      }
      if (armed.poison) {
        f.status.poison = STATUS.poisonTurns;
        result.effects[side].push("poison");
      }
    }
  }
  crater(state.terrain, impact.x, impact.y, radius);
  return result;
}
// Fly: land on the last free point of the flight path, then drop onto the
// ground below it. Flying out of the map keeps the shooter where they were.
function teleport(state, mark, sim) {
  if (sim.impact.type === "miss") return null;
  const actor = state.fighters[mark],
    cols = state.terrain;
  let landing = null;
  for (let i = sim.path.length - 1; i >= 0 && !landing; i--) {
    const [px, py] = sim.path[i];
    if (!Terrain.solid(cols, px, py) && px >= 16 && px <= WIDTH - 17)
      landing = { x: Math.round(px), y: py };
  }
  if (!landing) return null;
  let x = landing.x,
    y = Terrain.support(cols, x, landing.y);
  const other = Object.entries(state.fighters).find(
    ([side, o]) => side !== mark && o.hp > 0,
  )?.[1];
  if (
    other &&
    y !== null &&
    Math.abs(x - other.x) < 34 &&
    Math.abs(y - other.y) < 40
  ) {
    x = Math.max(16, Math.min(WIDTH - 17, other.x + (x < other.x ? -34 : 34)));
    y = Terrain.support(cols, x, landing.y);
  }
  actor.x = x;
  if (y === null || y >= HEIGHT) {
    actor.y = HEIGHT;
    actor.hp = 0;
    return { x, y: HEIGHT, fell: true };
  }
  actor.y = y;
  return { x, y, fell: false };
}
const fightersView = (fighters) =>
  Object.fromEntries(
    Object.entries(fighters).map(([side, f]) => [
      side,
      {
        x: f.x,
        y: f.y,
        hp: f.hp,
        pow: f.pow,
        status: { ...f.status },
        character: f.character,
        direction: f.direction,
      },
    ]),
  );
function validShot(state, mark, { angle, power, weapon, direction }) {
  return (
    Number.isFinite(angle) &&
    angle >= -90 &&
    angle <= 180 &&
    Number.isFinite(power) &&
    power >= 0 &&
    power <= 20 &&
    [1, -1].includes(direction) &&
    typeof weapon === "string" &&
    Object.hasOwn(WEAPONS, weapon) &&
    Aim.allowed(
      state.terrain,
      state.fighters[mark],
      WEAPONS[weapon],
      direction,
      angle,
    )
  );
}
function fire(state, mark, data) {
  if (!validShot(state, mark, data)) return { error: "INVALID_SHOT" };
  const { angle, power, weapon, direction } = data,
    actor = state.fighters[mark],
    armed = actor.armed || {},
    fly = !!armed.fly,
    w = fly ? WEAPONS.basic : WEAPONS[weapon];
  if (!fly && actor.ammo[weapon] === 0) return { error: "NO_AMMO" };
  const before = {
    terrain: Terrain.clone(state.terrain),
    fighters: fightersView(state.fighters),
  };
  const localAngle = angle - direction * Aim.terrainTilt(state.terrain, actor),
    first = Aim.solution(state.terrain, actor, w, direction, localAngle);
  actor.direction = direction;
  if (!fly && actor.ammo[weapon] > 0) actor.ammo[weapon]--;
  const spread =
      !fly && armed.triple ? BALLS.triple : { angles: [0], power: [1] },
    volleys = !fly && armed.double ? BALLS.double.volleys : 1,
    pow = !fly && !!armed.pow,
    multiplier =
      (armed.power ? 1.3 : 1) *
      (pow ? POW.damage : 1) *
      (armed.triple ? BALLS.triple.damage : 1) *
      (armed.double ? BALLS.double.damage : 1),
    base = WEAPONS[weapon].damage * multiplier,
    radius = Math.round(WEAPONS[weapon].radius * (pow ? POW.radius : 1)),
    windFactor = pow ? 0 : w.windFactor;
  if (pow) actor.pow = 0;
  const projectiles = [],
    damage = { X: 0, O: 0 },
    crit = { X: false, O: false },
    fallen = [];
  let clock = 0,
    moved = null;
  for (let volley = 0; volley < volleys && actor.hp > 0; volley++) {
    const g = Aim.solution(state.terrain, actor, w, direction, localAngle);
    const flights = spread.angles
      .map((offset, ball) => {
        const world = ((g.world + offset) * Math.PI) / 180,
          speed = power * PHYSICS.speed * spread.power[ball];
        return {
          ball,
          ...flight(
            state,
            mark,
            g.muzzle,
            { vx: speed * Math.cos(world), vy: -speed * Math.sin(world) },
            w,
            windFactor,
          ),
        };
      })
      .sort((a, b) => a.ticks - b.ticks || a.ball - b.ball);
    let end = clock;
    for (const sim of flights) {
      const flightMs = Math.max(120, Math.round((sim.ticks * 1000) / 60)),
        entry = {
          volley,
          ball: sim.ball,
          startMs: clock,
          flightMs,
          path: sim.path,
          impact: sim.impact,
          radius: fly ? 0 : radius,
          dig: !fly && sim.impact.type !== "miss",
          damage: { X: 0, O: 0 },
          crit: { X: false, O: false },
          effects: { X: [], O: [] },
        };
      if (fly) {
        moved = teleport(state, mark, sim);
        entry.teleport = moved;
        if (moved?.fell) fallen.push(mark);
      } else {
        Object.assign(
          entry,
          explode(state, mark, sim.impact, radius, base, armed),
        );
        for (const side of settle(state)) fallen.push(side);
      }
      for (const side of ["X", "O"]) {
        damage[side] += entry.damage[side];
        crit[side] ||= entry.crit[side];
      }
      entry.after = fightersView(state.fighters);
      projectiles.push(entry);
      end = Math.max(end, clock + flightMs);
    }
    clock = end + GAP_MS;
  }
  const alive = Object.entries(state.fighters)
    .filter(([, f]) => f.hp > 0)
    .map(([side]) => side);
  const last = projectiles[projectiles.length - 1];
  return {
    shot: {
      mark,
      angle,
      localAngle,
      terrainTilt: first.tilt,
      worldAngle: first.world,
      muzzle: first.muzzle,
      power,
      weapon,
      direction,
      items: Object.keys(armed).filter((k) => armed[k]),
      pow,
      fly,
      teleport: moved,
      projectiles,
      path: last.path,
      impact: last.impact,
      damage,
      crit,
      fallen: [...new Set(fallen)],
      before,
      flightMs: Math.max(200, Math.min(15000, clock - GAP_MS)),
    },
    outcome:
      alive.length === 2
        ? null
        : {
            winner: alive[0] || null,
            reason: alive.length === 0 ? "draw" : fallen.length ? "fall" : "hp",
          },
  };
}
// Items spend the shared stamina pool and add delay; shot items arm the next
// shot, Heal applies at once.
function useItem(state, mark, id) {
  const f = state.fighters[mark],
    item =
      typeof id === "string" && Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
  if (!item) return "INVALID_ITEM";
  if (f.locked) return "FROZEN";
  if (f.used.includes(id)) return "ITEM_USED";
  if (item.perMatch && (f.itemUses[id] || 0) >= item.perMatch)
    return "ITEM_LIMIT";
  if (id === "fly" && f.flyCooldown > 0) return "FLY_COOLDOWN";
  if (
    (id === "fly" && (SHOT_ITEMS.some((k) => f.armed[k]) || f.armed.pow)) ||
    (SHOT_ITEMS.includes(id) && f.armed.fly)
  )
    return "ITEM_CONFLICT";
  if (id === "heal" && f.hp >= HP) return "FULL_HP";
  if (f.stamina < item.cost) return "NO_STAMINA";
  f.stamina -= item.cost;
  f.turnDelay += item.delay;
  f.used.push(id);
  f.itemUses[id] = (f.itemUses[id] || 0) + 1;
  if (id === "heal") f.hp = Math.min(HP, f.hp + HEAL);
  else f.armed[id] = true;
  if (id === "fly") f.flyCooldown = item.cooldown + 1;
  return null;
}
function usePow(state, mark) {
  const f = state.fighters[mark];
  if (f.pow < POW_MAX) return "POW_NOT_READY";
  if (f.armed.pow) return "ITEM_USED";
  if (f.armed.fly) return "ITEM_CONFLICT";
  f.armed.pow = true;
  return null;
}
// Delay bookkeeping for the fighter who just finished acting.
function addDelay(
  state,
  mark,
  kind,
  { weapon, aimMs = 0, turnSeconds = 30 } = {},
) {
  const f = state.fighters[mark];
  let delay;
  if (kind === "fire") {
    const seconds = Math.min(Math.max(0, aimMs), turnSeconds * 1000) / 1000;
    delay =
      DELAY.turn +
      (WEAPONS[weapon]?.delay || 0) +
      f.turnDelay +
      Math.round(seconds * DELAY.aimPerSecond);
    if (!f.armed.pow) f.pow = Math.min(POW_MAX, f.pow + POW.perShot);
  } else if (kind === "pass") {
    delay = DELAY.pass + f.turnDelay;
    f.pow = Math.min(POW_MAX, f.pow + POW.perPass);
  } else delay = DELAY.timeout + f.turnDelay;
  f.delay += delay;
  return delay;
}
// Lowest delay acts next; on a tie the other fighter goes, then delays are
// rebased so the actor starts at 0.
function chooseNext(state, last) {
  const alive = Object.entries(state.fighters).filter(([, f]) => f.hp > 0);
  if (!alive.length) return null;
  alive.sort(
    ([a, fa], [b, fb]) =>
      fa.delay - fb.delay || (a === last ? 1 : 0) - (b === last ? 1 : 0),
  );
  const [next, nf] = alive[0],
    base = nf.delay;
  for (const f of Object.values(state.fighters))
    f.delay = Math.max(0, f.delay - base);
  return next;
}
// Start-of-turn upkeep: refill stamina, tick cooldowns, apply freeze and poison.
function startTurn(state, mark) {
  for (const [side, f] of Object.entries(state.fighters)) {
    if (side !== mark) f.locked = false;
  }
  const f = state.fighters[mark],
    report = { mark, poison: 0, frozen: false };
  f.stamina = STAMINA;
  f.armed = {};
  f.used = [];
  f.turnDelay = 0;
  if (f.flyCooldown > 0) f.flyCooldown--;
  f.locked = f.status.frozen > 0;
  if (f.locked) {
    f.status.frozen--;
    report.frozen = true;
  }
  if (f.status.poison > 0) {
    report.poison = Math.min(f.hp, STATUS.poisonDamage);
    f.hp -= report.poison;
    f.status.poison--;
  }
  return report;
}
// Rooms saved before the 2D terrain update kept a heightmap and turn fields.
function upgradeState(room) {
  if (!room.terrain && Array.isArray(room.heights)) {
    room.terrain = Terrain.fromHeights(room.heights, HEIGHT);
    delete room.heights;
  }
  for (const f of Object.values(room.fighters || {})) {
    const fresh = newFighter(f.x, f.y, f.direction);
    for (const [key, value] of Object.entries(fresh))
      if (f[key] === undefined) f[key] = value;
    delete f.moveRemaining;
  }
  const shot = room.shot;
  if (shot && !shot.projectiles) {
    shot.projectiles = [
      {
        volley: 0,
        ball: 0,
        startMs: 0,
        flightMs: shot.flightMs,
        path: shot.path,
        impact: shot.impact,
        radius: WEAPONS[shot.weapon]?.radius || 20,
        dig: shot.impact?.type !== "miss",
        damage: shot.damage,
        crit: { X: false, O: false },
        effects: { X: [], O: [] },
        after: fightersView(room.fighters),
      },
    ];
    if (shot.before?.heights) {
      shot.before.terrain = Terrain.fromHeights(shot.before.heights, HEIGHT);
      delete shot.before.heights;
    }
  }
  return room;
}
module.exports = {
  createState,
  newFighter,
  random,
  wind,
  surface,
  walk,
  settle,
  crater,
  flight,
  blastDamage,
  fire,
  useItem,
  usePow,
  addDelay,
  chooseNext,
  startTurn,
  upgradeState,
};
