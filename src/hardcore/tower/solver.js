"use strict";
const { createHash } = require("node:crypto");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const clone = (s) => JSON.parse(JSON.stringify(s));
const reusableSkill = (p) => p.generatorVersion >= 4 && p.contentVersion >= 4;
const advancedPuzzle = (p) => reusableSkill(p) && p.contentVersion >= 5;
function resistances(payload, state, transition) {
  const adaptive = state.adaptiveArmor,
    bonus = 25;
  return {
    physical: Math.min(
      100,
      (transition.physicalResist || 0) + (adaptive === "physical" ? bonus : 0),
    ),
    magic: Math.min(
      100,
      (transition.magicResist || 0) + (adaptive === "magic" ? bonus : 0),
    ),
  };
}
function initial(payload) {
  const first = payload.floors[0];
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
    breakGauge: 0,
    adaptiveArmor: null,
    delayedEffects: [],
    bossPhase: 0,
    phaseHp: first.phaseHps?.[0] || first.hp,
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
              !(!reusableSkill(p) && p.generatorVersion >= 4 && s.skillUsed)),
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
    next.breakGauge = out.breakGauge;
    next.adaptiveArmor = out.adaptiveArmor;
    next.delayedEffects = out.delayedEffects;
    next.bossPhase = out.bossPhase;
    next.phaseHp = out.phaseHp;
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
      next.breakGauge = 0;
      next.adaptiveArmor = null;
      next.delayedEffects = [];
      next.bossPhase = 0;
      next.phaseHp =
        p.floors[n.floor - 1].phaseHps?.[0] || p.floors[n.floor - 1].hp;
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
        (!reusableSkill(payload) &&
        payload.generatorVersion >= 4 &&
        transition.finisher
          ? 0.5
          : 1),
    );
  if (action === "skill")
    damage =
      p.mechanic === "barrage"
        ? Math.floor(p.skillDamage / 3) * (3 - transition.shieldCharges)
        : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0);
  let breakGauge = state.breakGauge || 0,
    adaptiveArmor = state.adaptiveArmor || null;
  if (advancedPuzzle(payload)) {
    const resistance = resistances(payload, state, transition),
      type = action === "attack" ? "physical" : "magic";
    if (action === "attack" || action === "skill") {
      damage = Math.floor((damage * (100 - resistance[type])) / 100);
      if (action === "skill") {
        damage = Math.floor((damage * (100 + breakGauge * 20)) / 100);
        breakGauge = 0;
      } else breakGauge = Math.min(3, breakGauge + 1);
      adaptiveArmor = type;
    } else if (transition.guardIntent) breakGauge = Math.min(3, breakGauge + 1);
  } else if (reusableSkill(payload)) {
    if (
      (action === "attack" &&
        ["physical_resist", "immune"].includes(transition.stance)) ||
      (action === "skill" &&
        ["magic_resist", "immune"].includes(transition.stance))
    )
      damage = 0;
  }
  let delayedEffects = clone(state.delayedEffects || []),
    echoDamage = 0;
  if (advancedPuzzle(payload)) {
    delayedEffects = delayedEffects
      .map((effect) => ({ ...effect, turns: effect.turns - 1 }))
      .filter((effect) => {
        if (effect.turns > 0) return true;
        echoDamage += effect.damage;
        return false;
      });
    if (transition.echoDelay && damage > 0)
      delayedEffects.push({
        turns: transition.echoDelay,
        damage: Math.max(1, Math.floor(damage / 2)),
      });
  }
  const rawDamage = damage + echoDamage,
    floor = payload.floors[state.floor - 1],
    phaseHps = floor.phaseHps || [floor.hp];
  let bossPhase = state.bossPhase || 0,
    phaseHp = state.phaseHp ?? phaseHps[bossPhase],
    appliedDamage = Math.min(rawDamage, phaseHp),
    enemyHp = Math.max(0, state.enemyHp - appliedDamage),
    phaseEnded = phaseHp > 0 && appliedDamage >= phaseHp;
  phaseHp = Math.max(0, phaseHp - appliedDamage);
  if (phaseEnded && bossPhase + 1 < phaseHps.length) {
    bossPhase++;
    phaseHp = phaseHps[bossPhase];
  }
  if (!advancedPuzzle(payload)) appliedDamage = damage;
  let enemyHeal = 0;
  if (
    !reusableSkill(payload) &&
    payload.generatorVersion >= 4 &&
    action === "skill" &&
    enemyHp > 0
  ) {
    enemyHeal = damage;
    enemyHp = Math.min(payload.floors[state.floor - 1].hp, enemyHp + enemyHeal);
  }
  const ward = state.classCharges.ward > 0,
    forcedGuard =
      (advancedPuzzle(payload) && transition.guardIntent) ||
      (reusableSkill(payload) && transition.stance === "immune"),
    blocked =
      !forcedGuard &&
      (ward ||
        (action === "skill" && ["shield", "dodge"].includes(p.mechanic)));
  let counter = enemyHp === 0 || phaseEnded ? 0 : transition.intentDamage;
  if (blocked) counter = 0;
  else if (action === "defend")
    counter = transition.defendDamage ?? Math.floor(counter / 2);
  const classCharges = {
    ward: p.mechanic === "ward" && action === "skill" ? 1 : 0,
  };
  return {
    damage: appliedDamage,
    directDamage: damage,
    echoDamage,
    rawDamage,
    counter,
    heal,
    mana,
    enemyHp,
    hp: Math.max(0, Math.min(p.maxHp, state.hp + heal - counter)),
    classCharges,
    skillUsed:
      payload.generatorVersion >= 4 && !reusableSkill(payload)
        ? Boolean(state.skillUsed || action === "skill")
        : false,
    enemyHeal,
    breakGauge,
    adaptiveArmor,
    delayedEffects,
    bossPhase,
    phaseHp,
    phaseEnded,
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
    s.breakGauge || 0,
    s.adaptiveArmor || "-",
    JSON.stringify(s.delayedEffects || []),
    s.bossPhase || 0,
    s.phaseHp ?? 0,
  ].join("|");
}
function maximumRemainingDamage(payload, state) {
  const p = require("./classProfiles").profile(payload.classKey);
  if (advancedPuzzle(payload)) {
    const attack = Math.floor(
        p.attackDamage * (p.mechanic === "rage" ? 1.5 : 1),
      ),
      skill = Math.floor(
        (p.mechanic === "barrage"
          ? p.skillDamage
          : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0)) * 1.6,
      );
    let total = (state.delayedEffects || []).reduce(
      (sum, effect) => sum + effect.damage,
      0,
    );
    for (let i = state.routeStep; i < payload.transitions.length; i++) {
      const t = payload.transitions[i];
      if (t.floor !== state.floor) break;
      if (t.type !== "combat") continue;
      const best = Math.max(attack, skill);
      total += best + (t.echoDelay ? Math.floor(best / 2) : 0);
    }
    return total;
  }
  if (reusableSkill(payload)) {
    let total = 0;
    for (let i = state.routeStep; i < payload.transitions.length; i++) {
      const t = payload.transitions[i];
      if (t.floor !== state.floor) break;
      if (t.type !== "combat") continue;
      const probe = {
        ...state,
        hp: p.mechanic === "rage" ? 1 : state.hp,
        enemyHp: Number.MAX_SAFE_INTEGER,
      };
      total += Math.max(
        combatOutcome(payload, probe, t, "attack").damage,
        combatOutcome(payload, probe, t, "skill").damage,
      );
    }
    return total;
  }
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
    recoverable = 0,
    lookaheadDepth = 0,
    lookaheadBranches = 0,
    nearMissBranches = 0;
  function visit(s) {
    if (performance.now() - started > timeoutMs)
      throw Error("TOWER_SOLVER_TIMEOUT");
    if (++visited > maxStates) throw Error("TOWER_SOLVER_STATE_LIMIT");
    if (s.status === "failed")
      return {
        wins: 0,
        path: [],
        final: null,
        minWinHp: Infinity,
        maxLossDepth: 0,
        minLossEnemyHp: s.enemyHp,
      };
    if (s.status === "completed")
      return {
        wins: 1,
        path: [],
        final: s,
        minWinHp: s.hp,
        maxLossDepth: -Infinity,
        minLossEnemyHp: Infinity,
      };
    if (s.enemyHp > maximumRemainingDamage(payload, s))
      return {
        wins: 0,
        path: [],
        final: null,
        minWinHp: Infinity,
        maxLossDepth: 0,
        minLossEnemyHp: s.enemyHp,
      };
    const key = stateKey(s);
    if (memo.has(key)) return memo.get(key);
    let wins = 0,
      path = [],
      final = null,
      minWinHp = Infinity,
      maxLossDepth = -Infinity,
      minLossEnemyHp = Infinity;
    const t = payload.transitions[s.routeStep];
    for (const action of options(payload, s)) {
      const next = apply(payload, s, action),
        out = visit(next);
      if (action !== t.expectedAction) {
        wrongBranches++;
        recoverable += out.wins;
        if (!out.wins) {
          const depth = 1 + Math.max(0, out.maxLossDepth);
          lookaheadDepth = Math.max(lookaheadDepth, depth);
          if (depth >= 3) lookaheadBranches++;
          if (out.minLossEnemyHp <= payload.floors[s.floor - 1].hp * 0.15)
            nearMissBranches++;
        }
      }
      if (out.wins) {
        wins += out.wins;
        path = [action, ...out.path];
        final = out.final;
        minWinHp = Math.min(s.hp, out.minWinHp, minWinHp);
      }
      if (!out.wins) {
        maxLossDepth = Math.max(maxLossDepth, 1 + out.maxLossDepth);
        minLossEnemyHp = Math.min(minLossEnemyHp, out.minLossEnemyHp);
      }
    }
    const out = {
      wins,
      path,
      final,
      minWinHp,
      maxLossDepth,
      minLossEnemyHp,
    };
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
    lookaheadDepth,
    lookaheadBranches,
    nearMissBranches,
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
    eventChoices = 0,
    midFloorSkills = 0,
    multiSkillFloors = 0,
    echoWindows = 0,
    partialResistanceWindows = 0;
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
    if (reusableSkill(payload)) {
      const combat = ts.filter((t) => t.type === "combat"),
        skillCount = combat.filter((t) => t.expectedAction === "skill").length;
      if (new Set(combat.map((t) => t.expectedAction)).size !== 3)
        throw Error("TOWER_FLOOR_NOT_COMPLEX");
      midFloorSkills += combat
        .slice(0, -1)
        .filter((t) => t.expectedAction === "skill").length;
      if (skillCount >= 2) multiSkillFloors++;
    }
    if (advancedPuzzle(payload)) {
      const expectedPhases = f === 14 ? 3 : f >= 12 ? 2 : 1;
      if (
        floor.phaseCount !== expectedPhases ||
        floor.phaseHps.length !== expectedPhases ||
        floor.phaseHps.some((hp) => !Number.isSafeInteger(hp) || hp < 1) ||
        floor.phaseHps.reduce((sum, hp) => sum + hp, 0) !== floor.hp
      )
        throw Error("INVALID_TOWER_BOSS_PHASES");
    }
    if (ts.at(-1).expectedAction === "defend")
      throw Error("INVALID_FLOOR_FINISH");
  }
  if (payload.floors.slice(11).reduce((a, f) => a + f.stepCount, 0) < 27)
    throw Error("TOWER_END_TOO_SHORT");
  if (reusableSkill(payload) && (midFloorSkills < 10 || multiSkillFloors < 4))
    throw Error("TOWER_SKILL_TIMING_TOO_SIMPLE");
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
      reusableSkill(payload) &&
      !advancedPuzzle(payload) &&
      t.type === "combat" &&
      (t.spellLocked ||
        t.stance !==
          {
            attack: "magic_resist",
            skill: "physical_resist",
            defend: "immune",
          }[t.expectedAction])
    )
      throw Error("INVALID_TOWER_STANCE");
    if (
      advancedPuzzle(payload) &&
      t.type === "combat" &&
      (t.spellLocked ||
        ![t.physicalResist, t.magicResist].every(
          (value) =>
            Number.isSafeInteger(value) &&
            value >= 0 &&
            value <= 100 &&
            value % 25 === 0,
        ) ||
        (t.echoDelay != null && ![1, 2].includes(t.echoDelay)))
    )
      throw Error("INVALID_TOWER_ADVANCED_MECHANIC");
    if (advancedPuzzle(payload) && t.type === "combat") {
      if (t.echoDelay) echoWindows++;
      if (
        [t.physicalResist, t.magicResist].some(
          (value) => value > 0 && value < 100,
        )
      )
        partialResistanceWindows++;
    }
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
  if (
    advancedPuzzle(payload) &&
    (echoWindows < 4 || partialResistanceWindows < 15)
  )
    throw Error("TOWER_ADVANCED_VARIETY_REJECTED");
  if (
    advancedPuzzle(payload) &&
    (proof.lookaheadDepth < 3 ||
      proof.lookaheadBranches < 10 ||
      proof.nearMissBranches < 3)
  )
    throw Error("TOWER_DIFFICULTY_LOOKAHEAD_REJECTED");
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
    echoWindows,
    partialResistanceWindows,
    categories: counts,
    difficultyScore: Math.round(
      n +
        2 * waste +
        5 * memoryFloors.size +
        3 * eventChoices +
        (proof.lookaheadBranches || 0) +
        2 * (proof.nearMissBranches || 0),
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
  resistances,
  advancedPuzzle,
};
