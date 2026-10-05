"use strict";
const { createHash } = require("node:crypto");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const clone = (s) => JSON.parse(JSON.stringify(s));
function initial(payload) {
  return {
    ...clone(payload.initialState),
    routeStep: 0,
    floor: 1,
    floorStep: 0,
    status: "playing",
    flags: [],
    classCharges: { ward: 0 },
  };
}
function options(p, s) {
  const t = p.transitions[s.routeStep];
  return t
    ? t.choices?.map((c) => c.action) ||
        ["attack", "skill", "defend"].filter(
          (a) => a !== "skill" || (s.mana >= t.skillCost && !t.spellLocked),
        )
    : [];
}
function apply(p, s, action) {
  const t = p.transitions[s.routeStep];
  if (!t || !options(p, s).includes(action)) throw Error("INVALID_ACTION");
  if (action !== t.expectedAction) return { ...s, status: "failed" };
  if (t.requiredFlags.some((f) => !s.flags.includes(f)))
    throw Error("UNSATISFIED_TOWER_FLAGS");
  if (t.hpRange && (s.hp < t.hpRange[0] || s.hp > t.hpRange[1]))
    throw Error("UNSATISFIED_HP_GATE");
  if (t.manaRange && (s.mana < t.manaRange[0] || s.mana > t.manaRange[1]))
    throw Error("UNSATISFIED_MP_GATE");
  const next = clone(s);
  next.hp += t.hpDelta;
  next.mana += t.manaDelta;
  if (
    next.hp < 1 ||
    next.hp > p.character.maxHp ||
    next.mana < 0 ||
    next.mana > p.character.maxMana
  )
    throw Error("INVALID_TOWER_RESOURCE_CURVE");
  next.flags = next.flags.filter((f) => !t.removesFlags.includes(f));
  for (const flag of t.grantsFlags)
    if (!next.flags.includes(flag)) next.flags.push(flag);
  next.flags.sort();
  next.classCharges = { ...t.classChargesAfter };
  next.routeStep++;
  if (next.routeStep === p.stepCount) {
    next.status = "completed";
    next.floor = 15;
    next.floorStep = t.floorStep + 1;
  } else {
    const n = p.transitions[next.routeStep];
    next.floor = n.floor;
    next.floorStep = n.floorStep;
  }
  return next;
}
function stateKey(s) {
  return [
    s.floor,
    s.floorStep,
    s.routeStep,
    s.hp,
    s.mana,
    s.flags.join(","),
    JSON.stringify(s.classCharges),
  ].join("|");
}
function solve(payload, { maxStates = 10000, timeoutMs = 1000 } = {}) {
  const started = performance.now(),
    memo = new Map();
  let visited = 0,
    wrongBranches = 0,
    recoverable = 0,
    minHp = Infinity;
  function visit(s) {
    if (performance.now() - started > timeoutMs)
      throw Error("TOWER_SOLVER_TIMEOUT");
    if (++visited > maxStates) throw Error("TOWER_SOLVER_STATE_LIMIT");
    minHp = Math.min(minHp, s.hp);
    if (s.status === "failed") return { wins: 0, path: [], final: null };
    if (s.status === "completed") return { wins: 1, path: [], final: s };
    const key = stateKey(s);
    if (memo.has(key)) return memo.get(key);
    let wins = 0,
      path = [],
      final = null;
    const t = payload.transitions[s.routeStep];
    for (const action of options(payload, s)) {
      const next = apply(payload, s, action),
        out = visit(next);
      if (action !== t.expectedAction) {
        wrongBranches++;
        recoverable += out.wins;
      }
      if (out.wins) {
        wins += out.wins;
        path = [action, ...out.path];
        final = out.final;
      }
    }
    const out = { wins, path, final };
    memo.set(key, out);
    return out;
  }
  const out = visit(initial(payload));
  return {
    winningPaths: out.wins,
    canonicalSolution: out.path,
    canonicalLength: out.path.length,
    wrongBranches,
    wrongBranchesRecoverable: recoverable,
    minimumHp: minHp,
    finalState: out.final,
    visited,
  };
}
function validate(payload, options = {}) {
  if (
    payload.generatorVersion !== 3 ||
    payload.floors.length !== 15 ||
    payload.transitions.length !== payload.stepCount ||
    payload.stepCount < 72 ||
    payload.stepCount > 90
  )
    throw Error("INVALID_TOWER_SHAPE");
  const first = payload.challengeId === "tower:2026:W41:sorceress:g3";
  if (first && payload.stepCount !== 81)
    throw Error("INVALID_FIRST_TOWER_LENGTH");
  const ranges = [
    [4, 5],
    [4, 5],
    [4, 5],
    [4, 6],
    [4, 6],
    [4, 6],
    [5, 6],
    [5, 6],
    [5, 6],
    [5, 6],
    [6, 7],
    [6, 7],
    [6, 7],
    [7, 8],
    [8, 10],
  ];
  const counts = {},
    templateCounts = {},
    classes = new Set(),
    memoryFloors = new Set();
  let previous = null,
    run = 0,
    previousTemplate = null,
    templateRun = 0,
    waste = 0,
    eventChoices = 0,
    earlyDelayed = false;
  for (let f = 0; f < 15; f++) {
    const floor = payload.floors[f],
      ts = payload.transitions.filter((t) => t.floor === f + 1);
    if (
      ts.length < ranges[f][0] ||
      ts.length > ranges[f][1] ||
      ts.length !== floor.stepCount ||
      new Set(ts.map((t) => t.expectedAction)).size < 2
    )
      throw Error("INVALID_TOWER_FLOOR");
    if (ts.at(-1).expectedAction === "defend")
      throw Error("INVALID_FLOOR_FINISH");
  }
  if (payload.floors.slice(11).reduce((a, f) => a + f.stepCount, 0) < 27)
    throw Error("TOWER_END_TOO_SHORT");
  for (let i = 0; i < payload.transitions.length; i++) {
    const t = payload.transitions[i];
    if (
      t.routeStep !== i ||
      t.floorStep !== i - payload.floors[t.floor - 1].stepStart
    )
      throw Error("INVALID_TOWER_ROUTE");
    if (
      !Number.isSafeInteger(t.hpDelta) ||
      !Number.isSafeInteger(t.manaDelta) ||
      !Number.isSafeInteger(t.enemyHpDelta)
    )
      throw Error("INVALID_TOWER_DELTA");
    counts[t.category] = (counts[t.category] || 0) + 1;
    templateCounts[t.clueTemplate] = (templateCounts[t.clueTemplate] || 0) + 1;
    if (templateCounts[t.clueTemplate] > 6)
      throw Error("TOWER_TEMPLATE_OVERUSED");
    templateRun = t.clueTemplate === previousTemplate ? templateRun + 1 : 1;
    if (templateRun > 2) throw Error("TOWER_TEMPLATE_REPEATED");
    previousTemplate = t.clueTemplate;
    run = t.expectedAction === previous ? run + 1 : 1;
    if (run > 3) throw Error("TOWER_ACTION_REPEATED");
    previous = t.expectedAction;
    if (t.resourceWasteWindow) {
      if (t.expectedAction !== "defend") throw Error("INVALID_WASTE_WINDOW");
      waste++;
    }
    if (t.type === "event") {
      eventChoices++;
      if (t.choices.length < 2) throw Error("INVALID_TOWER_CHOICES");
    }
    if (t.category === "memory") {
      memoryFloors.add(t.floor);
      const source = payload.transitions.filter(
        (x) => x.floor === t.memoryFloor && x.type === "combat",
      );
      const expected = source.slice().reverse()[
        (t.memoryIndex - 1) % source.length
      ]?.expectedAction;
      if (t.memoryFloor >= t.floor || t.expectedAction !== expected)
        throw Error("INVALID_MEMORY_ECHO");
    }
    if (t.floor >= 12 && t.requiredFlags.includes("debt_bound"))
      earlyDelayed = true;
    if (t.floor === 15) classes.add(t.expectedAction);
  }
  const n = payload.stepCount;
  if (
    (counts.direct || 0) / n > 0.4 ||
    (counts.resource || 0) / n < 0.2 ||
    (counts.delayed || 0) / n < 0.15 ||
    (counts.memory || 0) / n < 0.1 ||
    (counts.class || 0) / n < 0.15 ||
    waste < 4 ||
    memoryFloors.size < 2 ||
    eventChoices < 4 ||
    !earlyDelayed ||
    classes.size < 3
  )
    throw Error("TOWER_DIFFICULTY_REJECTED");

  const p = require("./classProfiles").profile(payload.classKey);
  if (
    payload.character.maxHp !== p.maxHp ||
    payload.character.maxMana !== p.maxMana ||
    payload.character.classKey !== payload.classKey
  )
    throw Error("INVALID_CLASS_BUILD");
  let runtime = initial(payload),
    enemyHp = payload.floors[0].hp;
  for (const t of payload.transitions) {
    if (
      JSON.stringify(t.classChargesBefore) !==
      JSON.stringify(runtime.classCharges)
    )
      throw Error("INVALID_TOWER_CHARGES");
    if (t.type === "combat") {
      const fractured = runtime.flags.includes("mana_fracture"),
        skillCost = fractured ? Math.max(1, p.skillCost - 1) : p.skillCost,
        attackMana = fractured ? 0 : p.attackMana;
      if (
        t.skillCost !== skillCost ||
        t.attackMana !== attackMana ||
        t.defendMana !== p.defendMana
      )
        throw Error("INVALID_CLASS_ECONOMY");
      if (t.resourceWasteWindow && runtime.mana < t.skillCost)
        throw Error("INVALID_WASTE_WINDOW");
      const a = t.expectedAction,
        mp =
          a === "skill"
            ? -skillCost
            : a === "attack"
              ? attackMana
              : p.defendMana;
      const blocked =
        runtime.classCharges.ward > 0 ||
        (a === "skill" && ["shield", "dodge"].includes(p.mechanic));
      const counter = blocked
        ? 0
        : p.mechanic === "shield" && a === "defend"
          ? Math.floor(t.intentDamage / 2)
          : t.intentDamage;
      const heal = a === "skill" ? p.heal : 0;
      const damage =
        a === "attack"
          ? Math.floor(
              p.attackDamage *
                (p.mechanic === "rage" && runtime.hp <= p.maxHp * 0.35
                  ? 1.5
                  : 1),
            )
          : a === "skill"
            ? p.mechanic === "barrage"
              ? Math.floor(p.skillDamage / 3) * (3 - t.shieldCharges)
              : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0)
            : 0;
      if (
        mp !== t.manaDelta ||
        heal - counter !== t.hpDelta ||
        counter !== t.counterDamage ||
        heal !== t.heal ||
        -damage !== t.enemyHpDelta
      )
        throw Error("INVALID_CLASS_TRANSITION");
      const ward = p.mechanic === "ward" && a === "skill" ? 1 : 0;
      if (
        t.classChargesAfter.ward !== ward ||
        t.shieldCharges < 0 ||
        t.shieldCharges > 2
      )
        throw Error("INVALID_CLASS_CHARGE_DELTA");
    } else if (
      t.hpDelta !== (t.eventKind === "hp_fork" ? -3 : 0) ||
      t.manaDelta !== 0 ||
      t.enemyHpDelta !== 0
    )
      throw Error("INVALID_EVENT_TRANSITION");
    enemyHp += t.enemyHpDelta;
    const next = apply(payload, runtime, t.expectedAction);
    if (next.floor !== runtime.floor || next.status === "completed") {
      if (enemyHp !== 0) throw Error("INVALID_ENEMY_CURVE");
      if (next.status !== "completed")
        enemyHp = payload.floors[next.floor - 1].hp;
    } else if (enemyHp <= 0) throw Error("EARLY_ENEMY_FINISH");
    runtime = next;
  }
  const proof = solve(payload, options);
  if (
    proof.winningPaths !== 1 ||
    proof.canonicalLength !== n ||
    proof.wrongBranchesRecoverable !== 0 ||
    proof.minimumHp < 1
  )
    throw Error("INVALID_TOWER_SOLUTION");
  const finalHpRatio = proof.finalState.hp / payload.character.maxHp,
    finalManaRatio = proof.finalState.mana / payload.character.maxMana;
  if (
    finalHpRatio > 0.25 ||
    finalManaRatio > 0.4 ||
    JSON.stringify(proof.finalState) !== JSON.stringify(payload.finalState)
  )
    throw Error("INVALID_TOWER_FINAL");
  const solutionHash = hash(
    payload.challengeId +
      "|" +
      payload.generatorVersion +
      "|" +
      proof.canonicalSolution.join(","),
  );
  return {
    ...proof,
    solutionHash,
    finalHpRatio,
    finalManaRatio,
    resourceWasteWindows: waste,
    memoryChecks: memoryFloors.size,
    eventChoices,
    categories: counts,
    difficultyScore: Math.round(
      n + 2 * waste + 5 * memoryFloors.size + 3 * eventChoices,
    ),
  };
}
module.exports = { initial, options, apply, solve, validate, stateKey, hash };
