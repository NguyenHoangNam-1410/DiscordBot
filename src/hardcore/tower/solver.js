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
    enemyHp: payload.floors[0].hp,
    skillUsed: false,
  };
}
function options(p, s) {
  const t = p.transitions[s.routeStep];
  return t
    ? t.choices?.map((c) => c.action) ||
        ["attack", "skill", "defend"].filter(
          (a) =>
            a !== "skill" ||
            (s.mana >= t.skillCost &&
              !t.spellLocked &&
              !(p.generatorVersion >= 4 && s.skillUsed)),
        )
    : [];
}
function apply(p, s, action) {
  const t = p.transitions[s.routeStep];
  if (!t || !options(p, s).includes(action)) throw Error("INVALID_ACTION");
  const next = clone(s);
  if (t.type === "event") {
    if (action !== t.expectedAction) {
      next.hp = 0;
      next.status = "failed";
      next.failureKind = "event";
      return next;
    }
    if (t.requiredFlags.some((f) => !s.flags.includes(f)))
      throw Error("UNSATISFIED_TOWER_FLAGS");
    next.hp += t.hpDelta;
    next.mana += t.manaDelta;
  } else {
    const out = combatOutcome(p, s, t, action);
    next.hp = out.hp;
    next.mana = out.mana;
    next.enemyHp = out.enemyHp;
    next.classCharges = out.classCharges;
    next.skillUsed = out.skillUsed;
    if (out.hp < 1) {
      next.status = "failed";
      next.failureKind = "combat";
      next.lastCombat = out;
      return next;
    }
  }
  if (next.hp > p.character.maxHp || next.mana < 0)
    throw Error("INVALID_TOWER_RESOURCE_CURVE");
  next.hp = Math.min(p.character.maxHp, next.hp);
  next.mana = Math.min(p.character.maxMana, next.mana);
  next.flags = next.flags.filter((f) => !t.removesFlags.includes(f));
  for (const flag of t.grantsFlags)
    if (!next.flags.includes(flag)) next.flags.push(flag);
  next.flags.sort();
  if (t.type === "event") next.classCharges = { ...t.classChargesAfter };
  next.routeStep++;
  if (next.routeStep === p.stepCount) {
    if (next.enemyHp > 0) {
      next.hp = 0;
      next.status = "failed";
      next.failureKind = "combat";
    } else {
      next.status = "completed";
      next.floor = 15;
      next.floorStep = t.floorStep + 1;
    }
  } else {
    const n = p.transitions[next.routeStep];
    if (n.floor !== t.floor) {
      if (next.enemyHp > 0) {
        next.hp = 0;
        next.status = "failed";
        next.failureKind = "combat";
        return next;
      }
      next.enemyHp = p.floors[n.floor - 1].hp;
      next.hp = p.character.maxHp;
      next.mana = p.initialState.mana;
      next.skillUsed = false;
      next.classCharges = { ward: 0 };
      next.flags = [];
    }
    next.floor = n.floor;
    next.floorStep = n.floorStep;
  }
  return next;
}
function combatOutcome(payload, state, transition, action) {
  const p = require("./classProfiles").profile(payload.classKey),
    fractured = state.flags.includes("mana_fracture"),
    skillCost = fractured ? Math.max(1, p.skillCost - 1) : p.skillCost,
    attackMana = fractured ? 0 : p.attackMana;
  let mana = state.mana,
    heal = action === "skill" ? p.heal : 0,
    damage = 0;
  if (action === "skill") mana -= skillCost;
  else
    mana = Math.min(
      p.maxMana,
      mana + (action === "attack" ? attackMana : p.defendMana),
    );
  if (action === "attack")
    damage = Math.floor(
      p.attackDamage *
        (p.mechanic === "rage" && state.hp <= p.maxHp * 0.35 ? 1.5 : 1) *
        (payload.generatorVersion >= 4 && transition.finisher ? 0.5 : 1),
    );
  if (action === "skill")
    damage =
      p.mechanic === "barrage"
        ? Math.floor(p.skillDamage / 3) * (3 - transition.shieldCharges)
        : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0);
  let enemyHp = Math.max(0, state.enemyHp - damage),
    enemyHeal = 0;
  if (payload.generatorVersion >= 4 && action === "skill" && enemyHp > 0) {
    enemyHeal = damage;
    enemyHp = Math.min(payload.floors[state.floor - 1].hp, enemyHp + enemyHeal);
  }
  const ward = state.classCharges.ward > 0,
    blocked =
      ward || (action === "skill" && ["shield", "dodge"].includes(p.mechanic));
  let counter = enemyHp === 0 ? 0 : transition.intentDamage;
  if (blocked) counter = 0;
  else if (action === "defend")
    counter = transition.defendDamage ?? Math.floor(counter / 2);
  const classCharges = {
    ward: p.mechanic === "ward" && action === "skill" ? 1 : 0,
  };
  return {
    damage,
    counter,
    heal,
    mana,
    enemyHp,
    hp: Math.max(0, Math.min(p.maxHp, state.hp + heal - counter)),
    classCharges,
    skillUsed:
      payload.generatorVersion >= 4
        ? Boolean(state.skillUsed || action === "skill")
        : false,
    enemyHeal,
  };
}
function stateKey(s) {
  return [
    s.floor,
    s.floorStep,
    s.routeStep,
    s.hp,
    s.mana,
    s.enemyHp,
    s.skillUsed ? 1 : 0,
    s.flags.join(","),
    JSON.stringify(s.classCharges),
  ].join("|");
}
function maximumRemainingDamage(payload, state) {
  const p = require("./classProfiles").profile(payload.classKey);
  let total = 0,
    bestSkillUpgrade = 0;
  const attack = Math.floor(p.attackDamage * (p.mechanic === "rage" ? 1.5 : 1));
  for (let i = state.routeStep; i < payload.transitions.length; i++) {
    const t = payload.transitions[i];
    if (t.floor !== state.floor) break;
    if (t.type !== "combat") continue;
    const skill =
      p.mechanic === "barrage"
        ? Math.floor(p.skillDamage / 3) * (3 - t.shieldCharges)
        : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0);
    total += attack;
    if (!state.skillUsed)
      bestSkillUpgrade = Math.max(bestSkillUpgrade, skill - attack);
  }
  return total + bestSkillUpgrade;
}
function solve(payload, { maxStates = 100000, timeoutMs = 5000 } = {}) {
  const started = performance.now(),
    memo = new Map();
  let visited = 0,
    wrongBranches = 0,
    recoverable = 0;
  function visit(s) {
    if (performance.now() - started > timeoutMs)
      throw Error("TOWER_SOLVER_TIMEOUT");
    if (++visited > maxStates) throw Error("TOWER_SOLVER_STATE_LIMIT");
    if (s.status === "failed")
      return { wins: 0, path: [], final: null, minWinHp: Infinity };
    if (s.status === "completed")
      return { wins: 1, path: [], final: s, minWinHp: s.hp };
    if (s.enemyHp > maximumRemainingDamage(payload, s))
      return { wins: 0, path: [], final: null, minWinHp: Infinity };
    const key = stateKey(s);
    if (memo.has(key)) return memo.get(key);
    let wins = 0,
      path = [],
      final = null,
      minWinHp = Infinity;
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
        minWinHp = Math.min(s.hp, out.minWinHp, minWinHp);
      }
    }
    const out = { wins, path, final, minWinHp };
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
    minimumHp: out.minWinHp,
    finalState: out.final,
    visited,
  };
}
function validate(payload, options = {}) {
  if (
    ![3, 4].includes(payload.generatorVersion) ||
    payload.floors.length !== 15 ||
    payload.transitions.length !== payload.stepCount ||
    payload.stepCount < 72 ||
    payload.stepCount > 90
  )
    throw Error("INVALID_TOWER_SHAPE");
  const first = /^tower:2026:W41:sorceress:g[34]$/.test(payload.challengeId);
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
    eventChoices = 0;
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
      payload.generatorVersion >= 4 &&
      t.finisher !==
        (t.type === "combat" &&
          t.floorStep === payload.floors[t.floor - 1].stepCount - 1)
    )
      throw Error("INVALID_TOWER_FINISHER");
    if (
      !Number.isSafeInteger(t.hpDelta) ||
      !Number.isSafeInteger(t.manaDelta) ||
      !Number.isSafeInteger(t.enemyHpDelta)
    )
      throw Error("INVALID_TOWER_DELTA");
    counts[t.category] = (counts[t.category] || 0) + 1;
    templateCounts[t.clueTemplate] = (templateCounts[t.clueTemplate] || 0) + 1;
    if (
      templateCounts[t.clueTemplate] > (payload.generatorVersion >= 4 ? 20 : 6)
    )
      throw Error("TOWER_TEMPLATE_OVERUSED");
    templateRun = t.clueTemplate === previousTemplate ? templateRun + 1 : 1;
    if (templateRun > 2) throw Error("TOWER_TEMPLATE_REPEATED");
    previousTemplate = t.clueTemplate;
    run = t.expectedAction === previous ? run + 1 : 1;
    if (payload.generatorVersion === 3 && run > 3)
      throw Error("TOWER_ACTION_REPEATED");
    previous = t.expectedAction;
    if (t.resourceWasteWindow) {
      if (t.expectedAction !== "defend") throw Error("INVALID_WASTE_WINDOW");
      waste++;
    }
    if (t.type === "event") {
      eventChoices++;
      if (t.choices.length < 2) throw Error("INVALID_TOWER_CHOICES");
    }
    if (payload.generatorVersion === 3 && t.category === "memory") {
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
    if (t.floor === 15) classes.add(t.expectedAction);
  }
  const n = payload.stepCount;
  const needsMemoryRules = payload.generatorVersion === 3;
  if (
    (counts.direct || 0) / n > (payload.generatorVersion >= 4 ? 0.45 : 0.4) ||
    (counts.resource || 0) / n < 0.2 ||
    (counts.delayed || 0) / n < 0.15 ||
    (needsMemoryRules && (counts.memory || 0) / n < 0.1) ||
    (counts.class || 0) / n < 0.15 ||
    (needsMemoryRules && waste < 4) ||
    (needsMemoryRules && memoryFloors.size < 2) ||
    eventChoices < 4 ||
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
  if (
    payload.generatorVersion >= 4 &&
    payload.wrongActionPolicy !== "combat_resolution"
  )
    throw Error("INVALID_TOWER_COMBAT_POLICY");
  let runtime = initial(payload);
  for (const t of payload.transitions) {
    if (
      JSON.stringify(t.classChargesBefore) !==
      JSON.stringify(runtime.classCharges)
    )
      throw Error("INVALID_TOWER_CHARGES");
    if (t.type === "combat") {
      if (
        payload.generatorVersion >= 4 &&
        Boolean(t.guardIntent) !== (t.expectedAction === "defend")
      )
        throw Error("INVALID_GUARD_INTENT");
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
      const out = combatOutcome(payload, runtime, t, t.expectedAction),
        mp = out.mana - runtime.mana,
        hp = out.hp - runtime.hp;
      if (
        mp !== t.manaDelta ||
        hp !== t.hpDelta ||
        out.counter !== t.counterDamage ||
        out.heal !== t.heal ||
        -out.damage !== t.enemyHpDelta
      )
        throw Error("INVALID_CLASS_TRANSITION");
      if (
        JSON.stringify(t.classChargesAfter) !==
          JSON.stringify(out.classCharges) ||
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
    const beforeFloor = runtime.floor,
      beforeEnemy = runtime.enemyHp;
    const next = apply(payload, runtime, t.expectedAction);
    if (next.status === "failed") throw Error("INVALID_EXPECTED_DEATH");
    const expectedEnemy = beforeEnemy + t.enemyHpDelta;
    if (next.floor !== beforeFloor || next.status === "completed") {
      if (expectedEnemy !== 0) throw Error("INVALID_ENEMY_CURVE");
      if (
        next.status !== "completed" &&
        next.enemyHp !== payload.floors[next.floor - 1].hp
      )
        throw Error("INVALID_ENEMY_RESET");
    } else if (next.enemyHp !== expectedEnemy || expectedEnemy <= 0)
      throw Error("EARLY_ENEMY_FINISH");
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
    finalManaRatio > (payload.generatorVersion >= 4 ? 0.8 : 0.4) ||
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
module.exports = {
  initial,
  options,
  apply,
  solve,
  validate,
  stateKey,
  hash,
  combatOutcome,
};
