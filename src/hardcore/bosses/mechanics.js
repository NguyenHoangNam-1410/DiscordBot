"use strict";
const roster = require("./roster");
const on = (e) => e?.boss?.version === roster.VERSION;
const bstate = (s) => (on(s.encounter) ? s.encounter.boss : null);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const damaging = (a) => a === "attack" || a === "skill";
function seed(s, e, definition, rng) {
  const b = (e.boss = {
    version: roster.VERSION,
    id: definition.id,
    floor: s.floor,
    round: 0,
    phase: 1,
    baseDefense: e.defense,
    baseRes: e.resistance,
    baseEvasion: e.evasion,
    baseCrit: e.critChance,
    frenzy: 0,
    overheat: 0,
    normals: 0,
    mythal: 0,
    nests: 0,
    nightmare: 0,
    portals: 0,
    dread: 0,
    flesh: 0,
    damageMemory: 0,
    memoryActions: 0,
    feedback: false,
    vulnerable: 0,
    malic: false,
    lastAction: null,
    chain: 0,
    grace: false,
    graceWeak: 0,
    returnBonus: 0,
    surrender: null,
    seal: s.prophecy?.kind || "war",
    sealPower: 0,
    sealDebuff: 0,
    totalMaxHp: e.maxHp,
  });
  if (b.id === "machine") e.hp = e.maxHp *= 2;
  if (b.id === "kabraxis") {
    e.critChance = b.baseCrit = 0.12;
    e.resistance = b.baseRes = Math.min(75, e.resistance + 10);
    if (b.seal === "protection") e.hp = e.maxHp = Math.round(e.maxHp * 1.25);
    b.totalMaxHp = e.maxHp;
  }
  if (b.id === "deimoss") {
    const first = Math.floor(e.maxHp * 0.3);
    b.bars = [first, first, e.maxHp - first * 2];
    e.hp = e.maxHp = b.bars[0];
    b.phase = 1;
  }
  if (b.id === "lazarus") e.drainCharges = 0;
  // The generated enemy is not assigned to the run until the caller returns.
  refresh({ ...s, encounter: e }, rng);
  return e;
}
function vanished(s) {
  const b = bstate(s);
  return b?.id === "riftwalker" && b.round % 3 === 2;
}
function brainControl(s) {
  const b = bstate(s);
  return b?.id === "lucion" && b.malic;
}
function effectiveMaxMana(s) {
  return Math.min(
    s.maxMana,
    Math.max(2, s.maxMana - (bstate(s)?.id === "samael" ? bstate(s).dread : 0)),
  );
}
function resPenalty(s) {
  const b = bstate(s);
  return b?.id === "quov" ? b.mythal : b?.id === "kabraxis" ? b.sealDebuff : 0;
}
function phase(s) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return 0;
  if (b.id === "kabraxis")
    return e.hp / e.maxHp > 2 / 3 ? 1 : e.hp / e.maxHp > 1 / 3 ? 2 : 3;
  return b.phase;
}
function refresh(s, rng) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return;
  b.phase = phase(s);
  e.defense = b.baseDefense;
  e.resistance = b.baseRes;
  e.evasion = b.baseEvasion;
  e.critChance = b.baseCrit;
  if (b.id === "necrobot") {
    e.defense *= b.round % 2 === 0 ? 1.4 : 0.7;
    e.resistance = clamp(b.baseRes + (b.round % 2 === 0 ? -15 : 20), -50, 75);
  }
  if (b.id === "anomaly") {
    b.phase = (b.round % 3) + 1;
    e.defense *= b.phase === 1 ? 1.4 : b.phase === 3 ? 0.7 : 1;
    e.resistance = clamp(
      b.baseRes + (b.phase === 2 ? 20 : b.phase === 3 ? -20 : 0),
      -50,
      75,
    );
  }
  if (b.id === "zakarum" && b.graceWeak > 0) {
    e.defense *= 0.85;
    e.resistance -= 15;
  }
  if (b.id === "kabraxis" && b.phase === 3) {
    e.defense *= 0.85;
    e.resistance -= 15;
  }
  if (b.id === "kabraxis" && b.arcaneWeak > 0) e.resistance -= 10;
  if (b.id === "deimoss" && b.phase === 3) e.critChance += 0.1;
  e.defense = Math.max(0, Math.round(e.defense));
  if (b.id === "gharbad" && b.surrender == null) b.surrender = rng() < 0.25;
  e.nextDamageType = nextType(s);
  s.mana = Math.min(s.mana, effectiveMaxMana(s));
}
function nextType(s) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return e.nextDamageType;
  if (b.id === "machine" && b.round % 3 === 2) return "physical";
  if (b.id === "anomaly") return b.round % 3 === 0 ? "physical" : "magic";
  if (b.id === "samael" && b.round % 4 === 3) return "physical";
  if (b.id === "kabraxis" && b.seal === "protection")
    return b.round % 3 === 0 ? "physical" : "magic";
  if (b.id === "uldyssian" && b.repeat && b.action === "defend") return "magic";
  if (e.damageType !== "mixed") return e.damageType;
  return (b.id === "deimoss" ? Math.floor(b.round / 3) : b.round) % 2 === 0
    ? "physical"
    : "magic";
}
function beginAction(s, action) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return;
  b.inAction = true;
  delete b.counterPlan;
  b.action = action;
  b.hitCount = 0;
  b.usedFullMana = s.mana === effectiveMaxMana(s);
  b.wasFeedback = b.feedback;
  b.wasFlame = b.normals >= 2;
  b.wasMalic = b.malic;
  b.wasVanished = vanished(s);
  b.wasSurrender = b.surrender;
  b.graceBroken = false;
  b.repeat = action !== "potion" && action === b.lastAction;
  b.counterInterrupted = false;
  b.usedReturnBonus = b.returnBonus || 0;
  if (b.id === "bul_kathos" && action !== "potion") {
    b.chain = damaging(action)
      ? b.lastAction === action
        ? b.chain + 1
        : 1
      : 0;
    b.lastAction = action;
  }
  if (b.id === "uldyssian") {
    e.evasion = b.baseEvasion + (b.repeat && action === "attack" ? 30 : 0);
    e.resistance = b.baseRes + (b.repeat && action === "skill" ? 20 : 0);
  }
  if (b.id === "quov" && action === "defend")
    b.mythal = Math.max(0, b.mythal - 5);
  if (b.id === "butcher" && action === "defend")
    b.frenzy = Math.max(0, b.frenzy - 1);
  if (b.id === "assur" && b.normals >= 2 && action === "defend") {
    b.returnBonus = 0.3;
    b.counterInterrupted = true;
  }
  if (
    b.id === "kabraxis" &&
    b.phase === 2 &&
    b.seal === "arcane" &&
    action === "skill" &&
    b.usedFullMana
  ) {
    b.arcaneWeak = 1;
    e.resistance = b.baseRes - 10;
  }
}
function playerFactor(s, magic, passive = false) {
  const b = bstate(s);
  if (!b) return 1;
  if (passive ? vanished(s) : b.wasVanished) return 0;
  if (!passive && b.id === "giyua" && b.action === "attack" && b.nests > 0)
    return 0;
  let factor = 1;
  if (b.id === "lucion" && b.vulnerable <= 0) factor *= 0.01;
  if (
    b.id === "necrobot" &&
    ((b.round % 2 === 0 && !magic) || (b.round % 2 === 1 && magic))
  )
    factor *= 0.7;
  if (b.id === "anomaly" && b.round % 3 === 2) factor *= 1.5;
  if (
    !passive &&
    b.id === "justicar" &&
    ((Math.floor(b.round / 2) % 2 === 0 && b.action === "attack") ||
      (Math.floor(b.round / 2) % 2 === 1 && b.action === "skill"))
  )
    factor *= 0.6;
  if (b.id === "deimoss" && b.phase === 1) factor *= 0.75;
  if (b.id === "zakarum" && b.grace) {
    factor *= 0.25;
    if (!passive) {
      b.grace = false;
      b.graceBroken = true;
      b.pendingGraceBreak = true;
    }
  }
  if (!passive) factor *= 1 + (b.usedReturnBonus || 0);
  return factor;
}
function hit(s, damage, passive = false) {
  const b = bstate(s);
  if (b && damage > 0) {
    if (!passive) b.hitCount++;
    if (passive && b.id === "zakarum" && b.grace) {
      b.grace = false;
      b.graceBroken = true;
      b.pendingGraceBreak = true;
    }
    if (b.pendingGraceBreak) {
      s.encounter.defense = Math.round(s.encounter.defense * 0.85);
      s.encounter.resistance -= 15;
      b.pendingGraceBreak = false;
    }
  }
}
function floorHp(s, e = s.encounter) {
  const b = on(e) ? e.boss : null;
  return b?.id === "control" &&
    (!b.feedbackResolved || (b.memoryActions >= 1 && damaging(b.action)))
    ? 1
    : 0;
}
function afterPlayer(s, action, acted) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return;
  if (acted.defend && action !== "defend") {
    if (b.id === "quov") b.mythal = Math.max(0, b.mythal - 5);
    if (b.id === "butcher") b.frenzy = Math.max(0, b.frenzy - 1);
    if (b.id === "assur" && (b.inAction ? b.wasFlame : b.normals >= 2)) {
      b.returnBonus = 0.3;
      b.counterInterrupted = true;
    }
  }
  if (b.id === "uldyssian" && b.repeat && action === "skill")
    s.mana = Math.max(0, s.mana - 1);
  if (b.id === "giyua" && action === "attack" && b.nests > 0) {
    b.nests--;
    acted.log += "\n👻 Phá một Spirit Nest; không gây damage lên boss.";
  }
  if (
    damaging(action) &&
    (acted.dealt > 0 || (b.id === "control" && acted.damage > 0))
  ) {
    if (b.usedReturnBonus) {
      b.returnBonus = 0;
      acted.log +=
        "\n✨ Đã dùng buff đòn đánh +" +
        Math.round(b.usedReturnBonus * 100) +
        "%.";
    }
    if (b.id === "machine") b.overheat += b.hitCount;
    if (b.id === "control" && !b.wasFeedback) {
      b.damageMemory += acted.damage ?? acted.dealt;
      b.memoryActions++;
      if (b.memoryActions >= 2) {
        b.feedback = true;
        b.feedbackResolved = false;
      }
    }
    if (b.id === "lucion" && b.vulnerable > 0 && !b.wasMalic) b.vulnerable--;
    if (b.id === "phoboss" && action === "skill") b.nightmare = 0;
    if (b.id === "xazax" && action === "skill")
      b.portals = Math.max(0, b.portals - 1);
    if (b.id === "samael" && (acted.critical || action === "skill"))
      b.dread = Math.max(0, b.dread - 1);
  }
  if (b.id === "lucion" && b.wasMalic) {
    if (action === "skill") {
      b.vulnerable = 2;
      b.malic = false;
    } else {
      e.hp = Math.min(e.maxHp, e.hp + Math.floor(e.maxHp * 0.5));
      b.malic = false;
      acted.log += "\n⚠️ Bỏ lỡ Malic: Lucion hồi 50% Max HP và phản công ×1,5.";
    }
  }
  if (b.id === "riftwalker" && vanished(s) && action === "defend")
    s.mana = Math.min(effectiveMaxMana(s), s.mana + 1);
  if (b.id === "gharbad" && b.wasSurrender && action === "defend") {
    s.mana = Math.min(effectiveMaxMana(s), s.mana + 1);
    b.returnBonus = 0.3;
    acted.log +=
      "\n✨ Đọc đúng False Surrender: hồi tổng 2 MP, đòn tiếp theo +30%.";
  }
  if (b.id === "deimoss" && b.phase === 2 && action === "potion")
    b.flesh = Math.min(3, b.flesh + 1);
  if (b.id === "kabraxis") refresh(s, () => 0.5);
  if (b.id === "kabraxis" && action !== "potion") {
    b.skillChain =
      action === "skill"
        ? b.lastAction === "skill"
          ? (b.skillChain || 1) + 1
          : 1
        : 0;
    b.lastAction = action;
  }
}
function counter(s, defend = false, extra = false) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return { magic: e.nextDamageType === "magic", multiplier: 1 };
  if (b.inAction && !extra && b.counterPlan) return { ...b.counterPlan };
  let p = {
    magic: nextType(s) === "magic",
    multiplier: 1,
    critical: null,
    skip: false,
    trueDamage: false,
    raw: null,
  };
  const a = b.inAction ? b.action : null;
  if (b.id === "butcher") p.multiplier *= 1 + b.frenzy * 0.08;
  if (b.id === "machine") {
    p.multiplier *= 1 + b.overheat * 0.08;
    if (b.round % 3 === 2) {
      p.magic = false;
      p.multiplier *= 2.5;
      if (b.overheat >= 3) p.skip = true;
    }
  }
  if (b.id === "assur" && b.normals >= 2) {
    p.magic = true;
    p.multiplier *= 2;
    if (defend || b.counterInterrupted) p.skip = true;
  }
  if (b.id === "control" && (b.inAction ? b.wasFeedback : b.feedback)) {
    p.magic = true;
    p.raw = b.damageMemory * 0.25;
    p.multiplier = 1;
    if (defend) p.skip = true;
  }
  if (b.id === "lucion" && (b.inAction ? b.wasMalic : b.malic) && a !== "skill")
    p.multiplier *= 1.5;
  if (b.id === "bul_kathos" && b.chain >= 2) {
    p.multiplier *= 1.5;
    p.critical = true;
  }
  if (b.id === "giyua") p.multiplier *= 1 + b.nests * 0.24;
  if (b.id === "riftwalker" && vanished(s)) p.skip = true;
  if (b.id === "gharbad" && (b.inAction ? b.wasSurrender : b.surrender)) {
    if (!a || damaging(a)) p.multiplier *= 1.8;
    else p.skip = true;
  }
  if (b.id === "phoboss") p.multiplier *= 1 + b.nightmare * 0.15;
  if (b.id === "kabraxis") {
    p.multiplier *= b.phase === 2 ? 1.15 : b.phase === 3 ? 1.2 : 1;
    if (b.seal === "arcane" && s.mana === 0) p.multiplier *= 1.3;
    if (b.seal === "war" && extra) {
      p.multiplier *=
        (b.phase === 2 && b.skillChain >= 2 ? 1 : 0.6) +
        (b.phase === 2 ? b.sealPower * 0.1 : 0);
      p.critical = false;
    }
    if (b.phase === 2 && (b.round + 1) % 3 === 0)
      p.multiplier *= 1 + b.sealPower * 0.05;
  }
  if (b.id === "xazax") {
    p.multiplier *= 1 + b.portals * 0.06;
    if (b.portals >= 5) {
      p.trueDamage = true;
      p.raw = Math.max(1, Math.floor(s.maxHp * 0.5));
      p.critical = false;
    }
  }
  if (b.id === "samael" && b.round % 4 === 3) {
    p.magic = false;
    p.multiplier *= 3;
    if (defend) p.multiplier *= 0.3;
  }
  if (b.id === "deimoss")
    p.multiplier *= b.phase === 2 ? 1 + b.flesh * 0.1 : b.phase === 3 ? 1.3 : 1;
  if (b.inAction && !extra) b.counterPlan = { ...p };
  return p;
}
function afterCounter(s, actual, landed, defend) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return "";
  const logs = [];
  if (b.id === "butcher" && landed && actual > 0 && !defend)
    b.frenzy = Math.min(5, b.frenzy + 1);
  if (b.id === "assur") {
    if (b.inAction ? b.wasFlame : b.normals >= 2) b.normals = 0;
    else b.normals = Math.min(2, b.normals + 1);
  }
  if (b.id === "control" && (b.inAction ? b.wasFeedback : b.feedback)) {
    b.feedback = false;
    b.feedbackResolved = true;
    b.damageMemory = 0;
    b.memoryActions = 0;
  }
  if (b.id === "quov" && landed && actual > 0 && !defend)
    b.mythal = Math.min(20, b.mythal + 5);
  if (b.id === "lucion" && landed && actual > 0) {
    const hp = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + Math.floor(e.maxHp * 0.1));
    logs.push("👻 Soul Feast: Lucion hồi " + (e.hp - hp) + " HP.");
  }
  if (b.id === "phoboss" && landed && actual > 0 && s.mana > 0) {
    s.mana--;
    b.nightmare = Math.min(5, b.nightmare + 1);
    logs.push("🌙 Dream Eater: hút 1 MP, Nightmare " + b.nightmare + "/5.");
  }
  if (b.id === "kabraxis" && landed && actual > 0) {
    if (b.seal === "arcane" && s.mana > 0) {
      const drain = Math.min(s.mana, 1 + (b.phase === 2 ? b.sealPower : 0));
      s.mana -= drain;
      logs.push("🔮 Mana Hunger: hút " + drain + " MP.");
    }
    if (b.seal === "protection" && b.round % 3 === 2 && !defend) {
      b.sealDebuff = 5 + b.sealPower;
      b.debuffUntil = b.round + 3;
      logs.push("🛡️ Shattered Aegis: RES −" + b.sealDebuff + " trong 2 vòng.");
    }
  }
  if (b.id === "samael" && b.round % 4 === 3 && defend) {
    b.dread = Math.min(3, b.dread + 1);
    s.mana = Math.min(s.mana, effectiveMaxMana(s));
    logs.push(
      "⭐ Dread " +
        b.dread +
        "/3: Max MP hiệu dụng " +
        effectiveMaxMana(s) +
        ".",
    );
  }
  if (b.id === "deimoss" && b.phase === 2 && actual > 0 && !defend) {
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + Math.floor(actual * 0.15));
    logs.push("🩸 Flesh Feast: hồi " + (e.hp - before) + " HP ở Phase 2.");
  }
  return logs.join("\n");
}
function endAction(s, rng) {
  const e = s.encounter,
    b = bstate(s);
  if (!b) return;
  b.inAction = false;
  if (b.phaseShifted) {
    delete b.phaseShifted;
    refresh(s, rng);
    return;
  }
  b.round++;
  e.combatTurn = b.round;
  if (b.id === "machine" && b.round % 3 === 0) b.overheat = 0;
  if (b.id === "giyua" && b.round % 2 === 0) b.nests = Math.min(3, b.nests + 1);
  if (b.id === "lucion" && b.round % 3 === 0) b.malic = true;
  if (b.id === "riftwalker" && b.round % 3 === 0) b.returnBonus = 0.25;
  if (b.id === "gharbad") {
    b.surrender = null;
    refresh(s, rng);
  }
  if (b.id === "zakarum") {
    if (b.graceBroken) b.graceWeak = 1;
    else if (b.graceWeak > 0) b.graceWeak--;
    if (b.round % 3 === 0) b.grace = true;
  }
  if (b.id === "uldyssian" && b.action !== "potion") b.lastAction = b.action;
  if (b.id === "lazarus") {
    const previous = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + Math.floor(e.maxHp * 0.08));
    s.mana = Math.max(0, s.mana - 1);
    s.lastLog +=
      "\n🗿 Black Hand Totem: boss hồi " +
      (e.hp - previous) +
      " HP; bạn mất tối đa 1 MP.";
  }
  if (b.id === "xazax" && b.round % 2 === 0)
    b.portals = Math.min(5, b.portals + 1);
  if (b.id === "kabraxis") {
    if (b.phase === 2 && b.round % 3 === 0)
      b.sealPower = Math.min(3, b.sealPower + 1);
    if (b.debuffUntil <= b.round) b.sealDebuff = 0;
    if (b.arcaneWeak > 0) b.arcaneWeak--;
  }
  refresh(s, rng);
}
function advancePhase(s, e = s.encounter) {
  const b = on(e) ? e.boss : null;
  if (!b || b.id !== "deimoss" || e.hp > 0 || b.phase >= 3 || s.hp <= 0)
    return false;
  b.phase++;
  e.hp = e.maxHp = b.bars[b.phase - 1];
  b.flesh = 0;
  b.round = 0;
  e.combatTurn = 0;
  b.phaseShifted = true;
  s.lastLog +=
    "\n🌀 DEIMOSS — PHASE " +
    b.phase +
    "/3: " +
    ["", "ABYSSAL SPIRES", "FLESH FEAST", "DIMENSIONAL COLLAPSE"][b.phase] +
    ". Thanh mới đầy HP; không phản công khi chuyển phase.";
  refresh(s, () => 0.5);
  return true;
}
function retreatLocked(s) {
  return on(s.encounter) && s.encounter.boss.id === "kabraxis";
}
module.exports = {
  ...roster,
  on,
  bstate,
  seed,
  vanished,
  brainControl,
  effectiveMaxMana,
  resPenalty,
  phase,
  refresh,
  beginAction,
  playerFactor,
  hit,
  floorHp,
  afterPlayer,
  counter,
  afterCounter,
  endAction,
  advancePhase,
  retreatLocked,
};
