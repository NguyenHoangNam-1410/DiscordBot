"use strict";
const { CATALOG, config, depth } = require("./catalogV2");
const LILITH_MAX_HP = 50;
const on = (e) => e?.boss?.version === 2;
const bstate = (s) => (on(s.encounter) ? s.encounter.boss : null);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damaging = (a) => ["attack", "skill"].includes(a);
const current = (s) => {
  const b = bstate(s);
  return { s, e: s.encounter, b, m: b.mechanicState, c: config(b.id, b.floor) };
};
const open = (x, n = 2) => (x.m.openUntil = x.b.round + n + 1);
const isOpen = (x) => (x.m.openUntil || 0) > x.b.round;
function lose(x, amount, ops, nonlethal = false) {
  const damage = Math.min(
    x.s.hp - (nonlethal ? 1 : 0),
    Math.max(
      0,
      Math.floor(
        amount *
          (nonlethal
            ? 1
            : require("../events/explorationMarks").incoming(x.s, x.e)),
      ),
    ),
  );
  if (damage <= 0) return 0;
  if (ops?.hurt) ops.hurt(x.s, damage, !nonlethal);
  else x.s.hp -= damage;
  if (x.s.hp <= 0)
    x.s.lastDeathCause = x.e.name + " · cơ chế gây " + damage + " DMG chuẩn.";
  return damage;
}
function cost(x, rate, ops, currentHp = false) {
  const value = Math.max(1, Math.ceil((currentHp ? x.s.hp : x.s.maxHp) * rate));
  if (x.s.hp <= value) throw Error("INSUFFICIENT_SKILL_HP");
  lose(x, value, ops, true);
  return value;
}
function healBoss(x, amount) {
  const cap = x.m.coreMaxHp || x.e.maxHp;
  const hp = x.m.coreHp ?? x.e.hp;
  const spires =
    x.b.id === "deimoss" && x.b.phase === 1
      ? Object.values(x.m.targets).filter((v) => v.hp > 0)
      : null;
  const room = spires
    ? spires.reduce((n, v) => n + v.maxHp - v.hp, 0)
    : cap - hp;
  const n = Math.max(0, Math.min(Math.floor(amount), x.b.healBudget, room));
  if (spires) {
    let left = n;
    for (const v of spires) {
      const gain = Math.min(left, v.maxHp - v.hp);
      v.hp += gain;
      left -= gain;
    }
  }
  x.b.healBudget -= n;
  if (x.m.coreHp != null) x.m.coreHp += n;
  x.e.hp += n;
  return n;
}
function units(x, names, fraction = 0.3, waves = 1) {
  const total = Math.floor(x.e.maxHp * fraction),
    first = Math.floor(total / names.length);
  x.m.targets = Object.fromEntries(
    names.map((name, i) => [
      name,
      {
        hp: i === names.length - 1 ? total - first * i : first,
        maxHp: i === names.length - 1 ? total - first * i : first,
      },
    ]),
  );
  x.m.coreHp = x.m.coreMaxHp = x.e.maxHp - total * waves;
  x.m.target = names[0];
  x.m.wave = 1;
  x.m.waves = waves;
  x.m.reserve = total * (waves - 1);
}
const aliveUnits = (x) =>
  Object.keys(x.m.targets || {}).filter((k) => x.m.targets[k].hp > 0);
function autoTarget(x) {
  if (x.m.target !== "boss" && !(x.m.targets?.[x.m.target]?.hp > 0))
    x.m.target = aliveUnits(x)[0] || "boss";
}
function seed(s, e, d, rng) {
  const tuning = config(d.id, s.floor);
  e.hp = e.maxHp = Math.max(1, Math.floor(e.maxHp * tuning.hp));
  e.damageMin = Math.max(1, Math.floor(e.damageMin * tuning.damage));
  e.damageMax = Math.max(e.damageMin, Math.floor(e.damageMax * tuning.damage));
  const b = (e.boss = {
    version: 2,
    rosterVersion: 2,
    playerDamageScale: s.bossDamageProfile?.playerDamage || 1,
    id: d.id,
    floor: s.floor,
    depth: depth(s.floor),
    round: 0,
    phase: 1,
    baseDefense: e.defense,
    baseRes: e.resistance,
    baseEvasion: e.evasion,
    baseCrit: e.critChance,
    totalMaxHp: e.maxHp,
    healBudget: Math.floor(e.maxHp * 0.35),
    seal: s.prophecy?.kind || "war",
    mechanicState: {},
  });
  const x = { s, e, b, m: b.mechanicState, c: config(b.id, b.floor) },
    m = x.m;
  m.pattern = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [m.pattern[i], m.pattern[j]] = [m.pattern[j], m.pattern[i]];
  }
  m.cursor = 0;
  m.target = "boss";
  m.openUntil = 0;
  m.stack = 0;
  switch (b.id) {
    case "butcher":
      m.distance = 2;
      m.chainCut = false;
      break;
    case "machine":
      m.heat = 0;
      m.shield = 0;
      break;
    case "assur":
      m.charges = 0;
      m.rune = true;
      break;
    case "control":
      m.hints = 0;
      break;
    case "necrobot":
      units(x, ["Plating", "Barrier", "Weapon"]);
      break;
    case "quov":
      m.ward = null;
      m.absorbs = [];
      break;
    case "lucion":
      m.will = 0;
      break;
    case "giyua":
      m.nests = 1;
      m.sealUntil = 0;
      break;
    case "riftwalker":
      m.echoes = [];
      break;
    case "gharbad":
      m.surrenderRule = m.pattern[0];
      m.sign = m.pattern[1];
      break;
    case "phoboss":
      m.dream = 0;
      break;
    case "anomaly":
      m.shards = [];
      break;
    case "zakarum":
      m.halos = ["Might", "Sanctuary", "Haste"];
      m.stolenHalos = [];
      break;
    case "justicar":
      m.verdict = null;
      m.verdictTurns = 0;
      break;
    case "uldyssian":
      m.timeline = [];
      m.clone = null;
      break;
    case "lazarus":
      units(x, ["Restoration", "Tremor", "Drain"], 0.24);
      m.lastBroken = null;
      m.reborn = false;
      break;
    case "xazax":
      m.portals = 1;
      break;
    case "samael":
      m.lights = 0;
      break;
    case "death_projector":
      m.zone = 0;
      if (
        s.gameplayVersion === 3 &&
        !s.mode?.startsWith("tower") &&
        !s.towerChallengeId
      )
        m.beamZone = Math.floor(rng() * 3);
      break;
    case "akarat":
      units(x, ["Mercy", "Wrath", "Faith"]);
      m.killOrder = [];
      break;
    case "buyard":
      m.heat = 30;
      break;
    case "bartuc":
      m.golem = 0;
      m.tether = true;
      m.golemDamage = 0;
      break;
    case "jitan":
      m.gateOpen = false;
      m.towers = 0;
      break;
    case "greater_riftwalker":
      m.near = true;
      break;
    case "athulua":
      m.zone = 1;
      m.arrow = 0;
      m.siegeZone = null;
      m.siegeUntil = 0;
      break;
    case "lilith":
      m.bargain = 0;
      m.healDebt = 0;
      break;
    case "nemesis":
      m.timeline = [];
      m.lock = null;
      break;
    case "azmodan":
      m.mark = 3;
      m.reflected = false;
      break;
    case "dark_star_dragon":
      m.cover = null;
      m.pillars = [x.c.amount, x.c.amount, x.c.amount];
      break;
    case "juris_khan":
      m.position = 0;
      m.still = 0;
      break;
    case "manoruk":
      units(x, ["Commander", "Ritualist", "Vanguard"], 0.24, 2);
      m.reborn = false;
      break;
    case "baal":
      m.purity = 1;
      m.corruption = 0;
      m.inferno = 0;
      m.vision = 0;
      m.purityDamage = 0;
      break;
    case "belial":
      m.deception = 0;
      break;
    case "astrogha":
      units(x, ["Venom", "Web", "Brood"], 0.24);
      m.transfers = {};
      m.zone = 1;
      break;
    case "atanna":
      m.dreams = [m.pattern[0], m.pattern[1], m.pattern[2]];
      m.erased = false;
      break;
    case "inarius":
      m.inarius = 0;
      m.lilith = 2;
      m.ritual = 1;
      m.lilithHp = LILITH_MAX_HP;
      m.protectUntil = 0;
      break;
    case "sescheron":
      m.code = m.pattern.slice();
      m.input = [];
      m.hints = 0;
      m.rage = 0;
      break;
    case "nithogur":
      m.anchor = null;
      m.anchorUsed = false;
      m.rewound = false;
      break;
    case "kabraxis":
      b.depth = 0;
      m.resonance = 0;
      m.seals = [];
      m.pending = false;
      m.generated = 0;
      break;
    case "deimoss": {
      b.depth = 0;
      const first = Math.floor(e.maxHp * 0.3);
      b.bars = [first, first, e.maxHp - 2 * first];
      e.hp = e.maxHp = first;
      const a = Math.floor(first / 3);
      m.targets = {
        Ruin: { hp: a, maxHp: a },
        Silence: { hp: a, maxHp: a },
        Hunger: { hp: first - a * 2, maxHp: first - a * 2 },
      };
      m.target = "Ruin";
      m.cores = [];
      m.triggered = [];
      m.curses = [];
      m.plane = null;
      m.planeTurns = 0;
      break;
    }
  }
  return e;
}
function validate(s, e = s.encounter) {
  if (!on(e)) return;
  require("./balanceV2").validate(s);
  const b = e.boss,
    m = b.mechanicState;
  if (
    s.bossRosterVersion !== 2 ||
    ((s.bossDamageProfile != null || b.playerDamageScale != null) &&
      b.playerDamageScale !== (s.bossDamageProfile?.playerDamage || 1)) ||
    !Object.hasOwn(CATALOG, b.id) ||
    !Number.isSafeInteger(b.round) ||
    b.round < 0 ||
    b.round > 1000000 ||
    ![1, 2, 3].includes(b.phase) ||
    b.floor !== s.floor ||
    !m ||
    typeof m !== "object" ||
    b.rosterVersion !== 2
  )
    throw Error("INVALID_BOSS_STATE");
  const walk = (v, n = 0) => {
    if (n > 10) throw Error("INVALID_BOSS_STATE");
    if (typeof v === "number" && (!Number.isFinite(v) || Math.abs(v) > 1e12))
      throw Error("INVALID_BOSS_STATE");
    if (Array.isArray(v) && v.length > 50) throw Error("INVALID_BOSS_STATE");
    if (v && typeof v === "object")
      Object.values(v).forEach((k) => walk(k, n + 1));
  };
  walk(b);
  const c = config(b.id, b.floor),
    fixed = ["kabraxis", "deimoss"].includes(b.id);
  if (
    b.depth !== (fixed ? 0 : depth(s.floor)) ||
    b.healBudget < 0 ||
    b.healBudget > b.totalMaxHp ||
    (!fixed &&
      ![
        50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700,
        750, 800, 850, 900, 950,
      ].includes(b.floor))
  )
    throw Error("INVALID_BOSS_STATE");
  if (
    b.id === "kabraxis" &&
    (b.floor !== 666 ||
      !["war", "protection", "arcane"].includes(b.seal) ||
      !Number.isInteger(m.generated) ||
      m.generated < 0 ||
      m.generated > 5 ||
      m.seals.length > m.generated ||
      m.seals.some((v) => !["purified", "broken"].includes(v)))
  )
    throw Error("INVALID_BOSS_STATE");
  if (
    b.id === "deimoss" &&
    (b.floor !== 999 ||
      e.maxHp !== b.bars[b.phase - 1] ||
      (b.phase === 1
        ? !m.targets ||
          Object.values(m.targets).reduce((n, v) => n + v.hp, 0) !== e.hp
        : m.targets !== null))
  )
    throw Error("INVALID_BOSS_STATE");
  if (!["anomaly", "kabraxis", "deimoss"].includes(b.id) && b.phase !== 1)
    throw Error("INVALID_BOSS_STATE");
  if (m.targets && m.target !== "boss" && !Object.hasOwn(m.targets, m.target))
    throw Error("INVALID_BOSS_STATE");
  if (m.targets && Object.keys(m.targets).length !== 3)
    throw Error("INVALID_BOSS_STATE");
  for (const k of ["zone", "ward", "plane", "verdict", "siegeZone", "beamZone"])
    if (m[k] != null && (!Number.isInteger(m[k]) || m[k] < 0 || m[k] > 2))
      throw Error("INVALID_BOSS_STATE");
  for (const k of ["stack", "nests", "golem", "corruption", "rage"])
    if (m[k] != null && (!Number.isInteger(m[k]) || m[k] < 0 || m[k] > c.cap))
      throw Error("INVALID_BOSS_STATE");
  if (
    m.timeline &&
    (!Array.isArray(m.timeline) ||
      m.timeline.length > 4 ||
      m.timeline.some(
        (a) => !["attack", "skill", "defend", "potion", "empty"].includes(a),
      ))
  )
    throw Error("INVALID_BOSS_STATE");
  if (
    m.input &&
    (!Array.isArray(m.input) ||
      m.input.length > 2 ||
      m.input.some((n) => ![0, 1, 2].includes(n)))
  )
    throw Error("INVALID_BOSS_STATE");
  for (const u of Object.values(m.targets || {}))
    if (u.hp < 0 || u.hp > u.maxHp || u.maxHp < 0)
      throw Error("INVALID_BOSS_STATE");
  for (const [key, lo, hi] of [
    ["heat", 0, 100],
    ["distance", 0, 2],
    ["dream", 0, 5],
    ["lights", 0, 5],
    ["resonance", 0, 30],
    ["position", 0, 3],
    ["deception", 0, 5],
    ["purity", 0, 3],
    ["charges", 0, 3],
  ])
    if (m[key] != null && (m[key] < lo || m[key] > hi))
      throw Error("INVALID_BOSS_STATE");
  if (
    b.id === "deimoss" &&
    (!Array.isArray(b.bars) ||
      b.bars.length !== 3 ||
      b.bars.some((h) => !Number.isSafeInteger(h) || h < 1))
  )
    throw Error("INVALID_BOSS_STATE");
  if (
    m.pattern?.length !== 3 ||
    new Set(m.pattern).size !== 3 ||
    m.pattern.some((n) => ![0, 1, 2].includes(n))
  )
    throw Error("INVALID_BOSS_STATE");
  // Old saves keep their remaining HP, capped to the current Lilith limit.
  if (b.id === "inarius") {
    if (!Number.isFinite(m.lilithHp) || m.lilithHp < 0 || m.lilithHp > 100)
      throw Error("INVALID_BOSS_STATE");
    m.lilithHp = Math.min(LILITH_MAX_HP, m.lilithHp);
  }
}
module.exports = {
  LILITH_MAX_HP,
  on,
  bstate,
  current,
  clamp,
  damaging,
  open,
  isOpen,
  lose,
  cost,
  healBoss,
  units,
  aliveUnits,
  autoTarget,
  seed,
  validate,
};
