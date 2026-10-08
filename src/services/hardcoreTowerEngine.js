"use strict";
const { createHash } = require("node:crypto");
const sha = (s) => createHash("sha256").update(s).digest("hex");
function solutionHash(c, actions = c.canonicalSolution) {
  if (c.generatorVersion >= 3) return c.solutionHash;
  return sha(JSON.stringify([c.challengeId, c.contentVersion, actions]));
}
function enter(s, c) {
  const e = c.floors[s.floor - 1];
  s.step = 0;
  s.phaseActions = 0;
  s.enemyHp = e.hp || 0;
}
function createState(c) {
  if (c.generatorVersion >= 3) return createGeneratedState(c);
  const s = {
    mode: "tower15",
    challengeId: c.challengeId,
    contentVersion: c.contentVersion,
    floor: 1,
    cleared: 0,
    step: 0,
    phaseActions: 0,
    hp: c.character.maxHp,
    maxHp: c.character.maxHp,
    mana: c.character.mana,
    maxMana: c.character.maxMana,
    paradox: null,
    actionHistory: [],
    turn: 0,
    status: "playing",
  };
  enter(s, c);
  return s;
}
function current(s, c) {
  if (c.generatorVersion >= 3) return currentGenerated(s, c);
  const encounter = c.floors[s.floor - 1];
  return { encounter, phase: encounter.phases?.[s.step] };
}
function costs(s, c) {
  if (c.generatorVersion >= 3)
    return { mana: currentGenerated(s, c).transition.skillCost, hp: 0 };
  return {
    mana: s.paradox?.id === "mana_fracture" ? 1 : c.combat.skillCost,
    hp:
      s.paradox?.id === "blood_pact"
        ? Math.max(1, Math.floor(s.maxHp * 0.05))
        : 0,
  };
}
function attackMana(s, c) {
  if (c.generatorVersion >= 3)
    return currentGenerated(s, c).transition.attackMana;
  return s.paradox?.id === "mana_fracture" ? 0 : c.combat.attackMana;
}
function damage(s, c, action) {
  if (c.generatorVersion >= 3) return damageGenerated(s, c, action);
  const { encounter, phase } = current(s, c);
  if (encounter.type !== "combat" || !["attack", "skill"].includes(action))
    return 0;
  const type = action === "skill" ? "magic" : "physical";
  if (
    phase.immune === "all" ||
    phase.immune === type ||
    (action === "skill" && encounter.spellLocked)
  )
    return 0;
  return Math.floor(
    (action === "skill" ? c.combat.skillDamage : c.combat.attackDamage) *
      (s.paradox?.id === "blood_pact" ? 1.3 : 1),
  );
}
function counter(s, c, action) {
  if (c.generatorVersion >= 3) return counterGenerated(s, c, action);
  const { phase } = current(s, c);
  return action === "defend"
    ? (phase.defendCounter ?? phase.counterDamage ?? 0)
    : (phase.counterDamage ?? 0);
}
function actions(s, c) {
  if (c.generatorVersion >= 3) return actionsGenerated(s, c);
  if (s.status !== "playing") return [];
  const { encounter } = current(s, c);
  if (encounter.type === "event")
    return encounter.choices.map((x) => ({
      action: x.action,
      label: x.label,
      disabled: false,
    }));
  const cost = costs(s, c);
  return [
    {
      action: "attack",
      label: "Tấn công (+" + attackMana(s, c) + " Mana)",
      disabled: false,
    },
    {
      action: "skill",
      label:
        "Arcane Burst (−" +
        cost.mana +
        " Mana" +
        (cost.hp ? ", −" + cost.hp + " HP" : "") +
        ")",
      disabled:
        !!encounter.spellLocked || s.mana < cost.mana || s.hp - cost.hp < 1,
    },
    {
      action: "defend",
      label: "Phòng thủ (+" + c.combat.defendMana + " Mana)",
      disabled: false,
    },
  ];
}
function fail(s, reason) {
  s.status = "failed";
  s.failure = reason;
}
function advance(s, c) {
  s.cleared = s.floor;
  if (s.floor === c.floors.length) {
    s.status = "completed";
    return;
  }
  s.floor++;
  enter(s, c);
}
function act(s, c, action) {
  if (c.generatorVersion >= 3) return actGenerated(s, c, action);
  if (s.challengeId !== c.challengeId || s.contentVersion !== c.contentVersion)
    throw Error("CHALLENGE_VERSION_MISMATCH");
  if (!actions(s, c).some((x) => x.action === action && !x.disabled))
    throw Error("INVALID_ACTION");
  const { encounter, phase } = current(s, c);
  // Persist only one-way fingerprints of actions; the canonical guide never enters SQLite.
  s.actionHistory.push(sha(JSON.stringify([s.turn, action])));
  s.turn++;
  const before = {
    hp: s.hp,
    mana: s.mana,
    enemyHp: s.enemyHp,
    floor: s.floor,
    step: s.step,
  };
  let dealt = 0,
    taken = 0;
  if (encounter.type === "event") {
    const choice = encounter.choices.find((x) => x.action === action);
    if (choice.healFull) s.hp = s.maxHp;
    if (choice.mana) s.mana = Math.min(s.maxMana, s.mana + choice.mana);
    if (choice.paradox)
      s.paradox = {
        id: choice.paradox,
        startFloor: s.floor + 1,
        endFloor: c.floors.length,
      };
    advance(s, c);
    s.lastLog = choice.label;
  } else {
    dealt = damage(s, c, action);
    if (action === "skill") {
      const cost = costs(s, c);
      s.hp -= cost.hp;
      s.mana -= cost.mana;
    } else
      s.mana = Math.min(
        s.maxMana,
        s.mana + (action === "attack" ? attackMana(s, c) : c.combat.defendMana),
      );
    s.enemyHp = Math.max(0, s.enemyHp - dealt);
    s.phaseActions++;
    if (phase.requiredAction && action !== phase.requiredAction) {
      taken = counter(s, c, action);
      s.hp = Math.max(0, s.hp - taken);
      fail(s, phase.failure || "Không vượt được quy luật của pha hiện tại.");
    } else if (s.enemyHp === 0) advance(s, c);
    else {
      taken = counter(s, c, action);
      s.hp = Math.max(0, s.hp - taken);
      if (!s.hp)
        fail(
          s,
          "HP về 0 sau phản công " +
            taken +
            " damage " +
            (phase.counterType === "magic" ? "phép" : "vật lý") +
            ".",
        );
      else if (phase.advanceAfter && s.phaseActions >= phase.advanceAfter) {
        s.step++;
        s.phaseActions = 0;
      } else if (s.phaseActions >= phase.maxActions)
        fail(
          s,
          phase.name +
            ": hết giới hạn " +
            phase.maxActions +
            " hành động khi quái còn " +
            s.enemyHp +
            " HP.",
        );
    }
    s.lastLog =
      (action === "skill"
        ? "Arcane Burst"
        : action === "attack"
          ? "Tấn công"
          : "Phòng thủ") +
      ": " +
      dealt +
      " damage; phản công " +
      taken +
      " damage. HP " +
      before.hp +
      " → " +
      s.hp +
      "; Mana " +
      before.mana +
      " → " +
      s.mana +
      ".";
  }
  s.lastOutcome = { ...before, actionDamage: dealt, counterDamage: taken };
  return s;
}
function solve(c) {
  if (c.generatorVersion >= 3) {
    const p = require("../hardcore/tower/solver").solve(c);
    return {
      winningPaths: p.winningPaths
        ? [{ actions: p.canonicalSolution, state: p.finalState }]
        : [],
      visited: p.visited,
    };
  }
  const winningPaths = [];
  let visited = 0;
  function visit(s, path) {
    visited++;
    if (s.status === "completed") {
      winningPaths.push({ actions: path, state: s });
      return;
    }
    if (s.status !== "playing") return;
    if (path.length > 100) throw Error("UNBOUNDED_TOWER_CHALLENGE");
    for (const option of actions(s, c).filter((x) => !x.disabled)) {
      const next = structuredClone(s);
      act(next, c, option.action);
      visit(next, [...path, option.action]);
    }
  }
  visit(createState(c), []);
  return { winningPaths, visited };
}
function verify(c) {
  if (c.generatorVersion >= 3) {
    const p = require("../hardcore/tower/solver").validate(c);
    return { ...solve(c), solutionHash: p.solutionHash, audit: p };
  }
  const proof = solve(c);
  const win = proof.winningPaths[0];
  if (
    proof.winningPaths.length !== 1 ||
    JSON.stringify(win.actions) !== JSON.stringify(c.canonicalSolution) ||
    Object.entries(c.expectedFinal).some(([k, v]) => win.state[k] !== v)
  )
    throw Error("INVALID_TOWER_SOLUTION: " + c.challengeId);
  return { ...proof, solutionHash: solutionHash(c) };
}
module.exports = {
  createState,
  current,
  costs,
  attackMana,
  damage,
  counter,
  actions,
  act,
  solve,
  verify,
  solutionHash,
  retryFloor,
};

function floorCheckpoint(s) {
  return {
    floor: s.floor,
    floorStep: s.floorStep,
    routeStep: s.routeStep,
    hp: s.hp,
    mana: s.mana,
    enemyHp: s.enemyHp,
    skillUsed: s.skillUsed,
    flags: structuredClone(s.flags),
    classCharges: structuredClone(s.classCharges),
    breakGauge: s.breakGauge,
    adaptiveArmor: s.adaptiveArmor,
    delayedEffects: structuredClone(s.delayedEffects),
    bossPhase: s.bossPhase,
    phaseHp: s.phaseHp,
    cleared: s.cleared,
    step: s.step,
    paradox: structuredClone(s.paradox),
    actionHistoryLength: s.actionHistory.length,
  };
}

function retryFloor(s, c) {
  if (c.generatorVersion < 4 || s.status !== "failed" || !s.floorCheckpoint)
    return createState(c);
  const checkpoint = structuredClone(s.floorCheckpoint),
    next = structuredClone(s),
    turn = s.turn + 1;
  Object.assign(next, checkpoint, {
    status: "playing",
    turn,
    actionHistory: s.actionHistory.slice(0, checkpoint.actionHistoryLength),
    lastLog: `Thử lại tầng ${checkpoint.floor} từ trạng thái đầu tầng.`,
    lastOutcome: null,
  });
  delete next.failure;
  delete next.failureKind;
  delete next.lastCombat;
  delete next.actionHistoryLength;
  next.floorCheckpoint = floorCheckpoint(next);
  return next;
}

function createGeneratedState(c) {
  const s = require("../hardcore/tower/solver").initial(c);
  Object.assign(s, {
    mode: "tower15",
    challengeId: c.challengeId,
    contentVersion: c.contentVersion,
    generatorVersion: c.generatorVersion,
    maxHp: c.character.maxHp,
    maxMana: c.character.maxMana,
    cleared: 0,
    step: 0,
    turn: 0,
    paradox: null,
    actionHistory: [],
  });
  s.enemyHp = c.floors[0].hp;
  s.floorCheckpoint = floorCheckpoint(s);
  return s;
}
function currentGenerated(s, c) {
  const t = c.transitions[Math.min(s.routeStep, c.stepCount - 1)],
    f = c.floors[s.floor - 1],
    transition = {
      ...t,
      // Published g3 snapshots predate the explicit flag. Derive it without
      // mutating their immutable payload so resumed runs still show Hành quyết.
      finisher:
        t.finisher ?? (t.type === "combat" && t.floorStep === f.stepCount - 1),
    };
  return {
    encounter: {
      ...f,
      type: transition.type,
      choices: transition.choices || [],
      spellLocked: Boolean(transition.spellLocked),
    },
    phase: { ...transition, name: transition.clueTemplate },
    transition,
  };
}
function actionsGenerated(s, c) {
  if (s.status !== "playing") return [];
  const t = c.transitions[s.routeStep];
  if (t.type === "event")
    return t.choices.map((x) => ({ ...x, disabled: false }));
  return ["attack", "skill", "defend"].map((action) => ({
    action,
    label:
      action === "skill"
        ? c.combat.skillName
        : action === "attack"
          ? "Tấn công"
          : "Phòng thủ",
    disabled:
      action === "skill" &&
      (s.mana < t.skillCost ||
        t.spellLocked ||
        (c.generatorVersion >= 4 && c.contentVersion < 4 && s.skillUsed)),
  }));
}
function damageGenerated(s, c, action) {
  const t = currentGenerated(s, c).transition;
  if (t.type !== "combat") return 0;
  return require("../hardcore/tower/solver").combatOutcome(c, s, t, action)
    .damage;
}
function counterGenerated(s, c, action) {
  const t = currentGenerated(s, c).transition;
  if (t.type !== "combat") return 0;
  return require("../hardcore/tower/solver").combatOutcome(c, s, t, action)
    .counter;
}
function actGenerated(s, c, action) {
  if (s.challengeId !== c.challengeId || s.contentVersion !== c.contentVersion)
    throw Error("CHALLENGE_VERSION_MISMATCH");
  if (!actionsGenerated(s, c).some((x) => x.action === action && !x.disabled))
    throw Error("INVALID_ACTION");
  const t = c.transitions[s.routeStep],
    before = {
      hp: s.hp,
      mana: s.mana,
      enemyHp: s.enemyHp,
      breakGauge: s.breakGauge,
      adaptiveArmor: s.adaptiveArmor,
      delayedEffects: structuredClone(s.delayedEffects),
      bossPhase: s.bossPhase,
      phaseHp: s.phaseHp,
      floor: s.floor,
      step: s.step,
      routeStep: s.routeStep,
    };
  const solver = require("../hardcore/tower/solver"),
    outcome =
      t.type === "combat" ? solver.combatOutcome(c, s, t, action) : null,
    next = solver.apply(c, s, action);
  s.actionHistory.push(sha(JSON.stringify([s.turn, action])));
  s.turn++;
  const turn = s.turn,
    history = s.actionHistory;
  Object.assign(s, next, {
    turn,
    actionHistory: history,
    step: next.floorStep,
  });
  s.cleared = next.status === "completed" ? 15 : next.floor - 1;
  if (s.status === "playing" && s.floor !== before.floor)
    s.floorCheckpoint = floorCheckpoint(s);
  if (s.flags.includes("mana_fracture"))
    s.paradox = { id: "mana_fracture", startFloor: 5, endFloor: 15 };
  const label =
    t.choices?.find((x) => x.action === action)?.label ||
    (action === "skill"
      ? c.combat.skillName
      : action === "attack"
        ? "Tấn công"
        : "Phòng thủ");
  if (s.status === "failed") {
    s.failure =
      t.type === "combat"
        ? "Bạn chưa hạ được quái trước khi bị nó kết liễu."
        : "Lựa chọn này khiến hành trình trong Tháp chấm dứt.";
    s.lastLog =
      t.type === "combat"
        ? label + ": quái còn sống và phản công kết liễu bạn."
        : "Lựa chọn không thể đưa bạn vượt qua Tháp.";
  } else s.lastLog = label + ": hành động đã được thực hiện.";
  s.lastOutcome = {
    ...before,
    actionDamage: outcome?.damage || 0,
    counterDamage: outcome?.counter || 0,
    heal: outcome?.heal || 0,
    enemyHeal: outcome?.enemyHeal || 0,
    enemyHpAfter: outcome?.enemyHp ?? before.enemyHp,
    directDamage: outcome?.directDamage || 0,
    echoDamage: outcome?.echoDamage || 0,
    phaseEnded: outcome?.phaseEnded || false,
  };
  return s;
}
