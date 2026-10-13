"use strict";
const u = require("./runtimeV2"),
  dec = require("./decisionsV2");
const { CATALOG } = require("./catalogV2");
function phase(s) {
  const x = u.current(s);
  return x.b.id === "kabraxis"
    ? x.e.hp / x.e.maxHp > 2 / 3
      ? 1
      : x.e.hp / x.e.maxHp > 1 / 3
        ? 2
        : 3
    : x.b.phase;
}
function floorHp(s) {
  const x = u.current(s),
    { b, m } = x;
  if (
    ["assur", "control", "lucion", "jitan", "belial", "inarius"].includes(
      b.id,
    ) &&
    !u.isOpen(x)
  )
    return 1;
  if (
    (b.id === "necrobot" && u.aliveUnits(x).length > 1) ||
    (b.id === "akarat" && u.aliveUnits(x).length) ||
    (b.id === "manoruk" && u.aliveUnits(x).length)
  )
    return m.coreHp || 1;
  return 0;
}
function shielded(x) {
  const { b, m } = x;
  return (
    (b.id === "assur" && !u.isOpen(x)) ||
    (b.id === "control" && !u.isOpen(x)) ||
    (b.id === "jitan" && !u.isOpen(x)) ||
    (b.id === "belial" && !u.isOpen(x)) ||
    (b.id === "inarius" &&
      !(m.inarius === m.ritual && m.lilith === m.ritual) &&
      !u.isOpen(x))
  );
}
function previewDamage(s, damage) {
  const x = u.current(s),
    { b, m, e } = x;
  if (m.targets && m.target !== "boss")
    return Math.min(m.targets[m.target]?.hp || 0, damage);
  if (b.id === "jitan" && !u.isOpen(x)) return 0;
  if (shielded(x)) return Math.min(Math.max(0, e.hp - 1), damage);
  if (
    (b.id === "necrobot" && u.aliveUnits(x).length > 1) ||
    (b.id === "akarat" && u.aliveUnits(x).length) ||
    (b.id === "manoruk" && u.aliveUnits(x).length)
  )
    return 0;
  return Math.min(m.coreHp ?? Math.max(0, e.hp - floorHp(s)), damage);
}
function applyDamage(s, damage) {
  const x = u.current(s),
    { b, m, e } = x;
  damage = Math.max(0, Math.floor(damage));
  let dealt = previewDamage(s, damage);
  if (m.targets && m.target !== "boss") {
    const target = m.targets[m.target],
      name = m.target;
    target.hp -= dealt;
    e.hp -= dealt;
    if (target.hp <= 0 && dealt > 0) {
      m.killed ||= [];
      m.killed.push(name);
      m.lastBroken = name;
      if (b.id === "akarat") m.killOrder.push(name);
      if (b.id === "astrogha") m.transfers[name] = b.round + 3;
      u.autoTarget(x);
      if (b.id === "manoruk" && !u.aliveUnits(x).length && m.wave < m.waves) {
        m.wave++;
        m.reborn = false;
        for (const v of Object.values(m.targets)) v.hp = v.maxHp;
        m.reserve = 0;
        m.target = "Commander";
      }
    }
  } else if (m.coreHp != null) {
    m.coreHp -= dealt;
    e.hp -= dealt;
    if (m.coreHp <= 0) e.hp = 0;
  } else {
    if (b.id === "bartuc" && m.tether) {
      const transfer = Math.floor(dealt * 0.35);
      m.golemDamage += transfer;
      dealt -= transfer;
    }
    e.hp = Math.max(floorHp(s), e.hp - dealt);
  }
  return dealt;
}
function effectiveMaxMana(s) {
  const x = u.current(s),
    { m, b } = x;
  const broken =
    b.id === "kabraxis" && b.phase === 3 && b.seal === "arcane"
      ? m.seals.filter((v) => v === "broken").length
      : 0;
  return Math.min(s.maxMana, Math.max(2, s.maxMana - broken));
}
function resPenalty(s) {
  const x = u.current(s),
    { b, m } = x;
  return (
    (m.portalCurseUntil > b.round ? 10 : 0) +
    (b.id === "deimoss" && m.plane === 2 && m.planeTurns > 0 ? 20 : 0) +
    (b.id === "kabraxis" && b.phase === 3 && b.seal === "protection"
      ? 5 * m.seals.filter((v) => v === "broken").length
      : 0) +
    (b.id === "baal" && m.vision === 2 ? 15 : 0) +
    (b.id === "kabraxis" &&
    b.phase === 2 &&
    b.seal === "protection" &&
    b.round % 2 === 1
      ? 10
      : 0) -
    (b.id === "zakarum" && m.stolenHalos.includes("Sanctuary") ? 5 : 0)
  );
}
function defenseFactor(s) {
  const { b, m } = u.current(s);
  return (
    (b.id === "deimoss" && m.plane === 2 && m.planeTurns > 0 ? 0.75 : 1) *
    (b.id === "baal" && m.vision === 1 ? 0.7 : 1)
  );
}
function playerCrit(s, value) {
  const { b, m } = u.current(s);
  return b.id === "baal" && m.vision === 3
    ? 0
    : Math.min(
        s.critCap ?? 0.4,
        value +
          (b.id === "zakarum" && m.stolenHalos.includes("Haste") ? 0.03 : 0),
      );
}
function healingLimit(s) {
  const { b, m } = u.current(s);
  if (b.id === "deimoss" && b.phase === 3 && m.plane === 2 && m.planeTurns > 0)
    return s.hp;
  return b.id === "lilith" && m.bargain > 0 ? s.maxHp - m.healDebt : s.maxHp;
}
function skillHpCost(s) {
  const { m } = u.current(s);
  return m.curses?.some((v) => v.type === "skillHpCost")
    ? Math.max(1, Math.floor(s.maxHp * 0.01))
    : 0;
}
function healingFactor(s) {
  const { m } = u.current(s);
  return m.curses?.some((v) => v.type === "healingReduction") ? 0.85 : 1;
}
function skillCost(s, base) {
  const { b, m } = u.current(s);
  return b.id === "deimoss" &&
    b.phase === 1 &&
    m.targets.Silence?.hp > 0 &&
    b.round % 3 === 2
    ? Math.min(effectiveMaxMana(s), base + 1)
    : base;
}
function refresh(s) {
  if (!u.on(s.encounter)) return;
  const x = u.current(s),
    { b, m, e } = x;
  b.phase = phase(s);
  e.defense = b.baseDefense;
  e.resistance = b.baseRes;
  e.evasion = b.baseEvasion;
  e.critChance = b.baseCrit;
  if (
    b.id === "akarat" &&
    (m.targets.Faith.hp > 0 || m.killOrder.at(-1) === "Faith")
  )
    e.resistance += 10;
  if (b.id === "manoruk" && m.targets.Vanguard.hp > 0)
    e.defense *= 1.15 + (3 - u.aliveUnits(x).length) * 0.05;
  if (b.id === "necrobot") {
    const remaining = u.aliveUnits(x).length;
    if (m.targets.Plating.hp > 0)
      e.defense *= 1 + (0.2 + 0.1 * (3 - remaining));
    if (m.targets.Barrier.hp > 0) e.resistance += 10 + 5 * (3 - remaining);
  }
  if (b.id === "anomaly") {
    b.phase = ((b.round + (m.formOffset || 0)) % 3) + 1;
    if (u.isOpen(x)) {
      e.defense = 0;
      e.resistance = 0;
    } else {
      if (b.phase === 1) e.defense *= 1.2;
      if (b.phase === 2) e.resistance += 15;
    }
  }
  if (b.id === "quov" && m.absorbs.length === 3) e.resistance -= x.c.amount;
  if (b.id === "zakarum") {
    if (!m.halos.includes("Sanctuary")) e.resistance -= 10;
    if (m.halos.includes("Haste") && b.round % 3 === 2)
      e.defense *= m.haloUntil > b.round ? 1.3 : 1.2;
  }
  if (b.id === "kabraxis" && b.phase < 3) {
    e.defense *= 1.1;
    e.resistance += 5;
  }
  if (b.id === "kabraxis" && b.phase === 3) {
    e.defense *= 0.85;
    e.resistance -= 15;
    if (b.seal === "war")
      e.critChance += m.seals.filter((v) => v === "broken").length * 0.03;
  }
  if (b.id === "deimoss" && m.plane === 2 && m.planeTurns > 0) {
    e.defense *= 0.75;
    e.resistance -= 20;
  }
  e.defense = Math.max(0, Math.floor(e.defense));
  e.resistance = u.clamp(e.resistance, -50, 75);
  e.nextDamageType = nextType(s);
  s.mana = Math.min(s.mana, effectiveMaxMana(s));
  u.autoTarget(x);
}
function nextType(s) {
  const x = u.current(s);
  return x.e.damageType === "mixed"
    ? x.b.round % 2
      ? "magic"
      : "physical"
    : x.e.damageType;
}
function beginAction(s, action) {
  const x = u.current(s),
    { b, m } = x;
  b.inAction = true;
  b.action = action;
  b.hitCount = 0;
  b.startMana = s.mana;
  b.startHp = s.hp;
  b.actual = 0;
  b.counterHits = 0;
  b.dealt = 0;
  b.critical = false;
  b.mpChanged = false;
  m.skipCounter = false;
  m.clashWrong = false;
  if (m.lockUntil <= b.round) m.lock = null;
}
function playerFactor(s, magic) {
  const x = u.current(s),
    { b, m, c } = x;
  let f = b.playerDamageScale || 1;
  if (b.id === "butcher" && m.distance === 0) f *= 1.15;
  if (b.id === "machine") f *= m.heat >= 70 && m.heat < 100 ? 1.3 : 1;
  if (b.id === "machine" && m.shield > 0) f *= 0.85;
  if (b.id === "lucion" && !u.isOpen(x)) f *= 0.3;
  if (b.id === "phoboss") f *= 1 + m.dream * c.power;
  if (b.id === "zakarum" && m.stolenHalos.includes("Might")) f *= 1.1;
  if (b.id === "astrogha") f *= m.zone === 1 ? 1.1 : 0.9;
  if (
    b.id === "akarat" &&
    (m.targets.Faith.hp > 0 || m.killOrder.at(-1) === "Faith")
  )
    f *= 0.9;
  if (b.id === "justicar" && m.verdict === 0) f *= magic ? 0.85 : 1 + c.power;
  if (b.id === "justicar" && m.verdict === 1) f *= magic ? 1 + c.power : 0.85;
  if (b.id === "riftwalker" && (m.shieldUntil || 0) > b.round) f *= 0.8;
  if (b.id === "buyard") f *= m.heat < 40 ? 0.6 : m.heat <= 70 ? 1.2 : 1;
  if (b.id === "bartuc" && u.isOpen(x)) f *= 1.2;
  if (b.id === "lilith" && m.bargain > 0) f *= 1 + m.bargainBonus;
  if (b.id === "samael") f *= 1 + Math.min(5, m.stolen || 0) * 0.05;
  if (b.id === "juris_khan") f *= 1 + m.position * c.power;
  if (b.id === "baal" && m.vision === 3 && magic) f *= 0.85;
  if (b.id === "kabraxis" && b.phase === 3)
    f *= 1 + m.seals.filter((v) => v === "purified").length * 0.05;
  if (b.id === "deimoss" && m.planeTurns > 0) {
    if (m.plane === 0) f *= magic ? 0.75 : 1.25;
    if (m.plane === 1) f *= magic ? 1.25 : 0.75;
    if (m.plane === 2) f *= 1.15;
  }
  if (m.clone === "defend") f *= 0.8;
  return f;
}
function hit(s, damage, passive = false) {
  const b = u.bstate(s);
  if (!passive && damage > 0) b.hitCount++;
}
function afterPlayer(s, action, acted) {
  const x = u.current(s),
    { b, m, c, e } = x;
  b.dealt = acted.dealt || 0;
  b.critical = !!acted.critical;
  if (b.id === "athulua" && b.dealt > 0) m.arrow = (m.arrow + 1) % 3;
  if (b.id === "machine" && u.damaging(action))
    m.heat = Math.min(100, m.heat + b.hitCount * c.amount);
  if (b.id === "control" && b.hitCount)
    m.hints = Math.min(2, m.hints + b.hitCount);
  if (b.id === "sescheron" && b.hitCount)
    m.hints = Math.min(3, m.hints + b.hitCount);
  if (b.id === "baal" && b.dealt > 0) {
    m.purityDamage += b.dealt;
    const step = Math.max(1, Math.floor(e.maxHp * 0.15));
    if (m.purityDamage >= step) {
      m.purity = Math.min(3, m.purity + 1);
      m.purityDamage %= step;
    }
  }
  if (b.id === "kabraxis") {
    let n =
      b.seal === "war" && b.dealt > 0
        ? 1 + (b.critical ? 1 : 0)
        : b.seal === "arcane" && (b.mpChanged || s.mana !== b.startMana)
          ? 1
          : 0;
    m.resonance = Math.min(30, m.resonance + n);
    const p = phase(s);
    if (p === 3 && b.phase !== 3 && m.pending) {
      m.seals.push("broken");
      m.pending = false;
    }
    b.phase = p;
  }
  if (b.id === "deimoss" && b.phase === 2) {
    for (const [i, t] of [0.75, 0.5, 0.25].entries())
      if (e.hp <= e.maxHp * t && !m.triggered.includes(i)) {
        m.triggered.push(i);
        m.cores.push({
          threshold: t,
          stat: ["str", "ene", "vit"][i],
          amount: 8,
          curse: ["damageTaken", "skillHpCost", "healingReduction"][i],
          choice: null,
        });
      }
  }
}
function counter(s, defend = false, extra = false) {
  const x = u.current(s),
    { b, m, c, e } = x;
  const p = {
    magic: nextType(s) === "magic",
    multiplier: 1,
    critical: null,
    skip: !!m.skipCounter,
    raw: null,
    trueDamage: false,
  };
  const due = dec.beamDue(x);
  if (b.id === "butcher") {
    p.multiplier *= 1 + m.stack * c.power + (m.distance === 0 ? 0.15 : 0);
  }
  if (b.id === "necrobot" && m.targets.Weapon.hp > 0)
    p.multiplier *= 1.1 + (3 - u.aliveUnits(x).length) * 0.05;
  if (b.id === "quov") {
    const elements = elementPlan(x);
    if (m.ward != null && elements.includes(m.ward))
      p.multiplier *= 1 - c.power;
  }
  if (b.id === "bul_kathos") {
    if (m.staggerUntil > b.round) p.skip = true;
    if (m.clashWrong) p.critical = true;
  }
  if (b.id === "giyua") p.multiplier *= 1 + m.nests * c.power;
  if (b.id === "phoboss") p.multiplier *= 1 + m.dream * c.power;
  if (b.id === "zakarum") {
    if (m.halos.includes("Might"))
      p.multiplier *= 1 + c.power * (m.haloUntil > b.round ? 2 : 1);
  }
  if (b.id === "justicar") {
    if (m.verdict === 0) p.multiplier *= p.magic ? 0.85 : 1 + c.power;
    if (m.verdict === 1) p.multiplier *= p.magic ? 1 + c.power : 0.85;
    if (m.verdict === 2) p.multiplier *= 0.65;
  }
  if (b.id === "uldyssian") {
    if (m.clone === "attack") p.multiplier *= 1 + c.power;
    if (m.clone === "skill") p.magic = true;
  }
  if (b.id === "xazax") p.multiplier *= 1 + m.portals * c.power;
  if (b.id === "samael" && m.lights >= 5) p.multiplier *= 1 + c.power * 5;
  if (b.id === "death_projector") {
    p.skip = m.zone !== beamZone(x);
    p.magic = true;
    p.multiplier = c.power;
  }
  if (b.id === "akarat" && m.targets.Wrath.hp > 0) p.multiplier *= 1 + c.power;
  if (b.id === "akarat" && m.killOrder?.at(-1) === "Wrath")
    p.multiplier *= 1 + c.power;
  if (b.id === "bartuc") p.multiplier *= 1 + Math.min(c.cap, m.golem) * c.power;
  if (b.id === "jitan") p.multiplier *= 1 + m.towers * c.power;
  if (b.id === "greater_riftwalker") {
    p.skip = true;
    if (due && m.near !== stormNear(x)) {
      p.skip = false;
      p.multiplier = c.power;
    }
  }
  if (b.id === "athulua") {
    if (m.zone === arrowZone(x)) {
      p.multiplier *= c.power;
      p.skip = false;
    }
    if (m.zone === 1) p.multiplier *= 1.15;
    if (m.zone === dec.blockedZone(x)) p.skip = false;
  }
  if (b.id === "nemesis" && m.copiedDamage) {
    p.raw = m.copiedDamage;
    p.multiplier = 1;
  }
  if (b.id === "dark_star_dragon" && due) {
    p.multiplier = c.power;
    p.skip = m.cover != null && m.pillars[m.cover] > 0;
  }
  if (b.id === "juris_khan")
    p.multiplier *= 1 + m.position * c.power + (m.still >= 3 ? c.power : 0);
  if (b.id === "manoruk" && m.targets.Commander.hp > 0)
    p.multiplier *= 1 + c.power * (1 + (3 - u.aliveUnits(x).length) * 0.5);
  if (b.id === "baal") p.multiplier *= 1 + m.corruption * c.power;
  if (b.id === "belial") p.multiplier *= 1 + m.deception * c.power;
  if (b.id === "astrogha" && m.zone !== 1) p.multiplier *= 0.9;
  if (b.id === "astrogha")
    p.multiplier *=
      1 +
      (m.targets.Venom.hp > 0 || m.transfers.Venom > b.round ? c.power * 2 : 0);
  if (b.id === "atanna") {
    const dream = m.dreams[b.round % 3];
    if (dream == null) p.skip = true;
    else if (dream === 0) p.multiplier *= 1 + c.power * 2;
  }
  if (b.id === "sescheron") {
    p.multiplier *= 1 + m.rage * c.power;
    if (u.isOpen(x)) p.skip = true;
  }
  if (b.id === "nithogur")
    p.multiplier *= 1 + Math.min(c.cap, b.round) * c.power;
  if (b.id === "kabraxis") {
    p.multiplier *= b.phase === 2 ? 1.1 : b.phase === 3 ? 1.15 : 1;
    if (b.phase === 3)
      p.multiplier *= 1 + m.seals.filter((v) => v === "broken").length * 0.05;
    if (b.phase === 2 && b.round % 2 === 1) {
      if (b.seal === "war") p.critical = true;
      if (b.seal === "protection") p.magic = true;
    }
  }
  if (b.id === "deimoss") {
    if (b.phase === 1 && m.targets.Ruin.hp > 0 && !p.magic)
      p.multiplier *= 1.15;
    if (b.phase === 3 && m.planeTurns > 0) {
      if (m.plane === 0) p.multiplier *= p.magic ? 0.75 : 1.25;
      if (m.plane === 1) p.multiplier *= p.magic ? 1.25 : 0.75;
    }
    p.multiplier *=
      1 +
      m.curses
        .filter((v) => v.type === "damageTaken")
        .reduce((t, v) => t + v.amount, 0);
  }
  return p;
}
function afterCounter(s, actual, landed, defend) {
  const x = u.current(s),
    { b, m, c, e } = x;
  b.actual = (b.actual || 0) + actual;
  b.counterHits = (b.counterHits || 0) + 1;
  if (
    b.id === "quov" &&
    m.ward != null &&
    elementPlan(x).includes(m.ward) &&
    !m.absorbs.includes(m.ward)
  )
    m.absorbs.push(m.ward);
  if (
    b.id === "kabraxis" &&
    b.seal === "protection" &&
    b.counterHits === 1 &&
    s.hp > 0
  ) {
    const raw =
      b.predictedCounter ??
      ((e.damageMin + e.damageMax) / 2) * counter(s).multiplier;
    m.resonance = Math.min(30, m.resonance + 1 + (actual <= raw * 0.6 ? 1 : 0));
  }
  if (
    b.id === "deimoss" &&
    b.phase === 1 &&
    m.targets.Hunger.hp > 0 &&
    actual > 0
  ) {
    const n = u.healBoss(x, actual * 0.12);
    return "Hunger hồi " + n + " HP cho Deimoss.";
  }
  if (b.id === "astrogha" && m.transfers.Brood > b.round && actual > 0)
    u.healBoss(x, actual * 0.1);
  return "";
}
function elementPlan(x) {
  const first = x.m.pattern[x.b.round % 3];
  return x.b.depth === 3 && dec.beamDue(x)
    ? [first, x.m.pattern[(x.b.round + 1) % 3]]
    : [first];
}
const randomBeam = (x) =>
  x.s.gameplayVersion === 3 &&
  !x.s.mode?.startsWith("tower") &&
  !x.s.towerChallengeId;
const beamCycle = (x) => (randomBeam(x) ? 2 : x.c.cycle);
const beamZone = (x) =>
  randomBeam(x) && x.m.beamZone != null
    ? x.m.beamZone
    : (Math.floor(x.b.round / x.c.cycle) * (x.c.amount || 1)) % 3;
const arrowZone = (x) => (x.m.pattern[0] + (x.m.arrow || 0)) % 3;
const stormNear = (x) => Math.floor(x.b.round / x.c.cycle) % 2 === 0;
function resolveHeat(s, ops) {
  const x = u.current(s);
  if (x.b.id !== "machine" || x.m.heat < 100) return "";
  const lost = u.lose(x, s.maxHp * x.c.power, ops);
  const damage = Math.min(x.e.hp, Math.floor(x.e.maxHp * 0.06));
  x.e.hp = Math.max(0, x.e.hp - damage);
  x.m.heat = x.m.shield = 0;
  return "\n⚠ Meltdown: bạn mất " + lost + " HP; boss mất " + damage + " HP.";
}
function endAction(s, rng, ops) {
  const x = u.current(s),
    { b, m, c, e } = x,
    r = b.round;
  if (b.phaseShifted) {
    b.phaseShifted = false;
    b.inAction = false;
    refresh(s);
    return;
  }
  const hurt = (n) => {
    const lost = u.lose(x, s.maxHp * n, ops);
    if (lost) s.lastLog += "\n⚠ " + e.name + ": −" + lost + " HP (cơ chế).";
  };
  const bossHeal = (n) => {
    const gain = u.healBoss(x, n);
    if (gain) s.lastLog += "\n" + e.name + " hồi " + gain + " HP.";
  };
  switch (b.id) {
    case "death_projector":
      if (randomBeam(x)) {
        const currentZone = beamZone(x);
        // Preserve the announced direction through both counters; lock the next after resolution.
        m.beamZone =
          (r + 1) % 2 === 0
            ? (currentZone + 1 + Math.floor(rng() * 2)) % 3
            : currentZone;
      }
      break;
    case "butcher":
      if (m.distance === 0) m.stack = Math.min(c.cap, m.stack + 1);
      m.distance = Math.max(0, m.distance - 1);
      if ((r + 1) % c.cycle === 0) {
        if (m.chainCut) m.chainCut = false;
        else m.distance = 0;
      }
      break;
    case "machine":
      s.lastLog += resolveHeat(s, ops);
      break;
    case "assur":
      if (!u.isOpen(x)) m.rune = true;
      break;
    case "giyua":
      if ((r + 1) % c.cycle === 0 && m.sealUntil <= r)
        m.nests = Math.min(c.cap, m.nests + 1);
      if (m.harvestDue === r + 1) {
        if (!u.damaging(b.action) || !b.dealt)
          m.nests = Math.min(c.cap, m.nests + 1);
        delete m.harvestDue;
      }
      break;
    case "riftwalker":
      for (const echo of m.echoes.filter((v) => v.due === r + 1)) {
        if (u.damaging(echo.action)) {
          const n = Math.min(
            Math.floor(s.maxHp * c.power),
            Math.floor(echo.damage * 0.15),
          );
          u.lose(x, n, ops);
          e.hp = Math.max(0, e.hp - n);
        }
        if (echo.action === "potion") bossHeal(e.maxHp * 0.03);
        if (echo.action === "defend") m.shieldUntil = r + 3;
      }
      m.echoes = m.echoes.filter((v) => v.due > r + 1);
      if (["attack", "skill", "defend", "potion"].includes(b.action))
        m.echoes.push({ action: b.action, damage: b.dealt, due: r + 4 });
      break;
    case "phoboss":
      if ((r + 1) % c.cycle === 0) m.dream = Math.min(5, m.dream + 1);
      break;
    case "zakarum":
      if (
        m.halos.includes("Sanctuary") &&
        ((r + 1) % c.cycle === 0 || m.haloUntil > r)
      )
        bossHeal(e.maxHp * 0.02);
      break;
    case "justicar":
      if (m.verdictTurns > 0) m.verdictTurns--;
      break;
    case "uldyssian":
      if (["attack", "skill", "defend", "potion"].includes(b.action))
        m.timeline.push(b.action);
      if (m.timeline.length >= 4) {
        const counts = {};
        m.timeline.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
        m.clone =
          Object.entries(counts)
            .filter(([k]) => k !== "empty")
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        m.timeline = [];
      }
      if (m.clone === "potion") bossHeal(e.maxHp * 0.02);
      if (m.clone === "skill") s.mana = Math.max(0, s.mana - 1);
      break;
    case "lazarus":
      if (m.targets.Restoration.hp > 0) bossHeal(e.maxHp * c.power);
      if (m.targets.Drain.hp > 0 && (r + 1) % c.cycle === 0)
        s.mana = Math.max(0, s.mana - 1);
      if (m.targets.Tremor.hp > 0 && (r + 1) % c.cycle === 0) hurt(c.power);
      if (
        (r + 1) % c.cycle === 0 &&
        m.lastBroken &&
        m.targets[m.lastBroken].hp <= 0
      ) {
        const target = m.targets[m.lastBroken],
          gain = Math.min(target.maxHp, b.healBudget);
        target.hp = gain;
        b.healBudget -= gain;
        e.hp += gain;
      }
      break;
    case "xazax":
      if ((r + 1) % c.cycle === 0) m.portals = Math.min(c.cap, m.portals + 1);
      break;
    case "samael":
      if (m.lights >= 5) {
        hurt(c.power);
        m.lights = 0;
      } else if ((r + 1) % c.cycle === 0) m.lights++;
      break;
    case "akarat":
      if (
        (m.targets.Mercy.hp > 0 || m.killOrder.at(-1) === "Mercy") &&
        (r + 1) % c.cycle === 0
      )
        bossHeal(e.maxHp * 0.02);
      break;
    case "athulua":
      if (b.depth === 3 && (r + 1) % c.cycle === 0) {
        m.siegeZone = m.pattern[Math.floor(r / c.cycle) % 3];
        m.siegeUntil = r + 3;
      }
      break;
    case "buyard":
      if (m.heat > 70) {
        hurt(c.power);
        e.hp = Math.max(0, e.hp - Math.floor(e.maxHp * 0.02));
      }
      if ((r + 1) % c.cycle === 0) m.heat = Math.min(100, m.heat + 10);
      break;
    case "bartuc":
      if (m.tether) m.golem = Math.min(c.cap, m.golem + 1);
      break;
    case "lilith":
      if (m.bargain > 0) m.bargain--;
      if (!m.bargain) m.healDebt = 0;
      break;
    case "nemesis":
      if (["attack", "skill", "defend", "potion"].includes(b.action)) {
        const old = m.timeline.slice();
        m.timeline.push(b.action);
        if (m.timeline.length >= 4) {
          if (
            m.timeline[0] === m.timeline[2] &&
            m.timeline[1] === m.timeline[3]
          ) {
            m.lock = m.timeline[0];
            m.lockUntil = r + 3;
            m.copiedDamage = Math.min(
              (e.damageMin + e.damageMax) * 0.75,
              Math.max(1, b.dealt),
            );
          } else m.copiedDamage = 0;
          m.timeline = m.timeline.slice(-2);
        }
      }
      break;
    case "azmodan":
      if (!m.extinguished) m.mark--;
      m.extinguished = false;
      if (m.mark <= 0) {
        if (m.reflected) e.hp = Math.max(0, e.hp - Math.floor(e.maxHp * 0.05));
        else hurt(c.power);
        m.mark = 3;
        m.reflected = false;
      }
      break;
    case "dark_star_dragon":
      if (dec.beamDue(x) && m.cover != null) {
        m.pillars[m.cover] = Math.max(0, m.pillars[m.cover] - 1);
        m.cover = null;
      }
      break;
    case "juris_khan":
      if (!b.action?.endsWith("__forward") && !b.action?.endsWith("__back"))
        m.still = Math.min(3, m.still + 1);
      break;
    case "manoruk":
      if (m.targets.Ritualist.hp > 0 && !m.reborn && m.killed?.length) {
        const target = m.targets[m.killed.at(-1)];
        if (target.hp <= 0) {
          const n = Math.min(
            b.healBudget,
            Math.floor(
              target.maxHp * (0.4 + 0.1 * (3 - u.aliveUnits(x).length)),
            ),
          );
          target.hp = n;
          b.healBudget -= n;
          e.hp += n;
          m.reborn = true;
        }
      }
      break;
    case "baal":
      if (m.visionUntil <= r) m.vision = 0;
      if ((r + 1) % c.cycle === 0) {
        const effect = Math.floor(r / c.cycle) % 3;
        if (effect === 0) m.corruption = Math.min(c.cap, m.corruption + 1);
        if (effect === 1) {
          const n = Math.min(s.mana, 1 + (b.depth % 2));
          s.mana -= n;
          m.inferno = n;
        }
        if (effect === 2) {
          m.vision = 1 + (r % 3);
          m.visionUntil = r + 3;
        }
      }
      break;
    case "astrogha":
      if (m.targets.Brood.hp > 0) bossHeal(e.maxHp * c.power);
      break;
    case "atanna": {
      const dream = m.dreams[r % 3];
      if (dream === 1) s.mana = Math.max(0, s.mana - 1);
      if (dream === 2) bossHeal(e.maxHp * 0.03);
      if (r % 3 === 2) {
        m.dreams = m.dreams.slice(1).concat(m.dreams[0]);
        for (let i = 0; i < 3; i++)
          if (m.dreams[i] == null) m.dreams[i] = m.pattern[i];
        m.erased = false;
      }
      break;
    }
    case "inarius":
      if (m.protectUntil <= r)
        m.lilithHp = Math.max(0, m.lilithHp - c.power * 100);
      if (m.lilithHp <= 0) {
        s.hp = 0;
        s.lastDeathCause = "Lilith tử trận trong nghi lễ của Inarius.";
      }
      if ((r + 1) % c.cycle === 0) {
        m.ritual = (m.ritual + 1) % 3;
        m.inarius = (m.inarius + 1) % 3;
      }
      break;
    case "kabraxis": {
      const p = phase(s);
      if (p === 3 && m.pending) {
        m.seals.push("broken");
        m.pending = false;
      }
      b.phase = p;
      if (p === 2 && b.seal === "arcane" && (r + 1) % 2 === 0) {
        const old = s.mana;
        s.mana = Math.max(0, s.mana - 1);
        if (old > s.mana) s.lastLog += "\n🌀 Arcane Rupture: bạn mất 1 MP.";
      }
      const cycle = p === 1 ? 3 : 2;
      if (p < 3 && !m.pending && m.generated < 5 && (r + 1) % cycle === 0) {
        m.pending = true;
        m.generated++;
      }
      break;
    }
    case "deimoss":
      if (b.phase === 2)
        for (const core of m.cores)
          if (core.choice === "leave" && core.due > r) {
            bossHeal(e.maxHp * 0.025);
          }
      if (b.phase === 3 && m.planeTurns > 0) m.planeTurns--;
      break;
  }
  m.killed = [];
  m.skipCounter = false;
  m.clashWrong = false;
  b.round++;
  e.combatTurn = b.round;
  b.inAction = false;
  refresh(s);
}
function advancePhase(s, e = s.encounter) {
  if (
    !u.on(e) ||
    e.boss.id !== "deimoss" ||
    e.hp > 0 ||
    s.hp <= 0 ||
    e.boss.phase >= 3
  )
    return false;
  const b = e.boss,
    m = b.mechanicState;
  b.phase++;
  e.hp = e.maxHp = b.bars[b.phase - 1];
  b.round = 0;
  e.combatTurn = 0;
  b.phaseShifted = true;
  m.targets = null;
  m.target = "boss";
  m.cores = [];
  m.triggered = [];
  m.plane = null;
  m.planeTurns = 0;
  b.healBudget = Math.floor(e.maxHp * 0.25);
  s.lastLog +=
    "\n🌀 Deimoss · Phase " + b.phase + "/3. Không phản công khi chuyển phase.";
  refresh(s);
  return true;
}
module.exports = {
  ...u,
  dec,
  phase,
  floorHp,
  previewDamage,
  applyDamage,
  effectiveMaxMana,
  resPenalty,
  defenseFactor,
  playerCrit,
  healingLimit,
  healingFactor,
  skillHpCost,
  skillCost,
  refresh,
  nextType,
  beginAction,
  playerFactor,
  hit,
  afterPlayer,
  resolveHeat,
  counter,
  afterCounter,
  endAction,
  advancePhase,
  elementPlan,
  beamZone,
  beamCycle,
  randomBeam,
  arrowZone,
  stormNear,
  vanished: () => false,
  brainControl: () => false,
  retreatLocked: (s) => u.on(s.encounter) && s.encounter.boss.id === "kabraxis",
};
