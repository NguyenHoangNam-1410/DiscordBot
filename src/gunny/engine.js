"use strict";
// Adapted from maycuatroi1/gunny-game (MIT declaration in upstream metadata).
// All gameplay is evaluated at fixed 60 Hz; rendering never decides damage.
const { WIDTH, HEIGHT, HP, MOVE, WEAPONS } = require("./rules");
const Aim = require("./public/aim");
function random(state) {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const surface = (heights, x) =>
  HEIGHT - (heights[Math.max(0, Math.min(WIDTH - 1, Math.floor(x)))] || 0);
function wind(state) {
  state.wind = Math.round((random(state) * 6 - 3) * 100) / 100;
  return state.wind;
}
function createState(seed) {
  const s = { rngState: seed >>> 0 },
    freq = Array.from({ length: 4 }, () => 0.002 + random(s) * 0.003),
    amp = Array.from({ length: 4 }, () => 0.2 + random(s) * 0.8),
    phase = Array.from({ length: 4 }, () => random(s) * Math.PI * 2),
    sum = amp.reduce((a, b) => a + b, 0);
  s.heights = Array.from({ length: WIDTH }, (_, x) =>
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
  s.fighters = {};
  for (const [mark, x, direction] of [
    ["X", 480, 1],
    ["O", 1120, -1],
  ])
    s.fighters[mark] = {
      x,
      y: surface(s.heights, x),
      hp: HP,
      character: "bear",
      direction,
      ammo: Object.fromEntries(
        Object.entries(WEAPONS).map(([id, w]) => [id, w.ammo]),
      ),
      moveRemaining: MOVE,
    };
  wind(s);
  return s;
}
function walk(state, mark, dx) {
  if (!Number.isInteger(dx) || !dx || Math.abs(dx) > 10) return "INVALID_MOVE";
  const f = state.fighters[mark],
    other = state.fighters[mark === "X" ? "O" : "X"],
    sign = Math.sign(dx);
  let moved = 0;
  const budget = Math.min(Math.abs(dx), f.moveRemaining);
  for (let i = 0; i < budget; i++) {
    const x = f.x + sign,
      y = surface(state.heights, x);
    if (
      x < 16 ||
      x > WIDTH - 17 ||
      Math.abs(x - other.x) < 34 ||
      y < f.y - 16 ||
      y >= HEIGHT
    )
      break;
    f.x = x;
    f.y = y;
    moved++;
  }
  if (!moved) return "BLOCKED_MOVE";
  f.moveRemaining -= moved;
  f.direction = sign;
  return null;
}
function crater(heights, x, y, r) {
  for (
    let col = Math.max(0, Math.floor(x - r));
    col <= Math.min(WIDTH - 1, Math.ceil(x + r));
    col++
  ) {
    const d = col - x;
    if (Math.abs(d) > r) continue;
    heights[col] = Math.max(
      0,
      Math.min(heights[col], Math.floor(HEIGHT - y - Math.sqrt(r * r - d * d))),
    );
  }
}
function fire(state, mark, { angle, power, weapon, direction }) {
  if (
    !Number.isFinite(angle) ||
    angle < -90 ||
    angle > 180 ||
    !Number.isFinite(power) ||
    power < 0 ||
    power > 20 ||
    ![1, -1].includes(direction) ||
    typeof weapon !== "string" ||
    !Object.hasOwn(WEAPONS, weapon)
  )
    return { error: "INVALID_SHOT" };
  const actor = state.fighters[mark],
    w = WEAPONS[weapon];
  if (!Aim.allowed(state.heights, actor, w, direction, angle))
    return { error: "INVALID_SHOT" };
  if (actor.ammo[weapon] === 0) return { error: "NO_AMMO" };
  const a = ((direction === 1 ? angle : 180 - angle) * Math.PI) / 180;
  const localAngle =
      angle - direction * Aim.terrainTilt(state.heights, actor.x),
    geometry = Aim.solution(state.heights, actor, w, direction, localAngle);
  const bodies = Object.fromEntries(
    Object.entries(state.fighters).map(([side, f]) => [
      side,
      Aim.bodyCenter(state.heights, f),
    ]),
  );
  let x = geometry.muzzle.x,
    y = geometry.muzzle.y,
    vx = power * 0.5 * Math.cos(a),
    vy = -power * 0.5 * Math.sin(a);
  const path = [[x, y]];
  let impact = null,
    ticks = 0;
  for (; ticks < 900 && !impact; ticks++) {
    vx += state.wind * 0.01;
    vy += 0.15 * w.gravity;
    const nx = x + vx,
      ny = y + vy,
      steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) / 3));
    for (let step = 1; step <= steps; step++) {
      const px = x + ((nx - x) * step) / steps,
        py = y + ((ny - y) * step) / steps;
      const hit = Object.entries(state.fighters).find(
        ([side, f]) =>
          side !== mark &&
          f.hp > 0 &&
          Math.hypot(px - bodies[side].x, py - bodies[side].y) <= 18,
      );
      if (hit) {
        impact = { type: "player", x: px, y: py, target: hit[0] };
        break;
      }
      if (px >= 0 && px < WIDTH && py >= surface(state.heights, px)) {
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
    if (ticks % 2 === 0)
      path.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }
  if (!impact) impact = { type: "miss", x, y };
  path.push([
    Math.round(impact.x * 100) / 100,
    Math.round(impact.y * 100) / 100,
  ]);
  const before = {
    heights: [...state.heights],
    fighters: structuredClone(state.fighters),
  };
  actor.direction = direction;
  if (actor.ammo[weapon] > 0) actor.ammo[weapon]--;
  const damage = { X: 0, O: 0 },
    fallen = [];
  if (impact.type !== "miss") {
    for (const [side, f] of Object.entries(state.fighters)) {
      const d = Math.max(
        0,
        Math.hypot(impact.x - bodies[side].x, impact.y - bodies[side].y) - 12,
      );
      const hit =
        impact.target === side
          ? w.damage
          : d < w.radius
            ? Math.max(1, Math.round(w.damage * (1 - d / w.radius)))
            : 0;
      damage[side] = Math.min(f.hp, hit);
      f.hp = Math.max(0, f.hp - hit);
    }
    crater(state.heights, impact.x, impact.y, w.radius);
    for (const [side, f] of Object.entries(state.fighters)) {
      f.y = surface(state.heights, f.x);
      if (f.y >= HEIGHT && f.hp > 0) {
        damage[side] += f.hp;
        f.hp = 0;
        fallen.push(side);
      }
    }
  }
  const alive = Object.entries(state.fighters)
    .filter(([, f]) => f.hp > 0)
    .map(([side]) => side);
  return {
    shot: {
      mark,
      angle,
      localAngle,
      terrainTilt: geometry.tilt,
      worldAngle: geometry.world,
      muzzle: geometry.muzzle,
      power,
      weapon,
      direction,
      path,
      impact,
      damage,
      fallen,
      before,
      flightMs: Math.max(200, Math.min(5000, (ticks * 1000) / 60)),
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
module.exports = { createState, random, wind, surface, walk, crater, fire };
