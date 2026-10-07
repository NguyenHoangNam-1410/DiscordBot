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
function floorCheckpoint(s) {
  return {
    floor: s.floor,
    floorStep: s.floorStep,
    routeStep: s.routeStep,
    hp: s.hp,
    mana: s.mana,
    potions: s.potions,
    flags: structuredClone(s.flags),
    classCharges: structuredClone(s.classCharges),
    enemyHp: s.enemyHp,
    cleared: s.cleared,
    step: s.step,
    paradox: structuredClone(s.paradox),
    actionHistoryLength: s.actionHistory.length,
    floorMistakes: [],
  };
}
function retryFloor(s, c) {
  if (c.generatorVersion < 4 || s.status !== "failed" || !s.floorCheckpoint)
    return createState(c);
  const next = structuredClone(s),
    checkpoint = structuredClone(s.floorCheckpoint);
  Object.assign(next, checkpoint, {
    status: "playing",
    actionHistory: s.actionHistory.slice(0, checkpoint.actionHistoryLength),
    lastLog: `Thử lại tầng ${checkpoint.floor} từ bước đầu.`,
    lastOutcome: null,
    floorMistakes: [],
  });
  delete next.failure;
  delete next.failureHint;
  delete next.failedAction;
  delete next.expectedAction;
  delete next.actionHistoryLength;
  return next;
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
    maxPotions: c.character.potions || 0,
    potionHeal: c.character.potionHeal || 0,
    floorMistakes: [],
  });
  s.enemyHp = c.floors[0].hp;
  s.floorCheckpoint = floorCheckpoint(s);
  return s;
}
function currentGenerated(s, c) {
  const t = c.transitions[Math.min(s.routeStep, c.stepCount - 1)],
    f = c.floors[s.floor - 1];
  return {
    encounter: {
      ...f,
      type: t.type,
      choices: t.choices || [],
      spellLocked: Boolean(t.spellLocked),
    },
    phase: { ...t, name: t.clueTemplate },
    transition: t,
  };
}
function actionsGenerated(s, c) {
  if (s.status !== "playing") return [];
  const t = c.transitions[s.routeStep];
  if (t.type === "event")
    return t.choices.map((x) => ({ ...x, disabled: false }));
  const available =
    c.generatorVersion >= 4
      ? ["attack", "skill", "defend", "potion"]
      : ["attack", "skill", "defend"];
  return available.map((action) => ({
    action,
    label:
      action === "skill"
        ? c.combat.skillName
        : action === "attack"
          ? "Tấn công"
          : action === "defend"
            ? "Phòng thủ"
            : "Bình máu",
    disabled:
      (action === "skill" && (s.mana < t.skillCost || t.spellLocked)) ||
      (action === "potion" && s.potions < 1),
  }));
}
function damageGenerated(s, c, action) {
  const t = currentGenerated(s, c).transition,
    p = require("../hardcore/tower/classProfiles").profile(c.classKey);
  if (t.type !== "combat") return 0;
  if (c.generatorVersion >= 4)
    return action === "attack"
      ? p.attackDamage
      : action === "skill"
        ? p.skillDamage
        : 0;
  if (action === "attack")
    return p.mechanic === "barrage" && t.shieldCharges > 0
      ? 0
      : Math.floor(
          p.attackDamage *
            (p.mechanic === "rage" && s.hp <= s.maxHp * 0.35 ? 1.5 : 1),
        );
  if (action === "skill")
    return p.mechanic === "barrage"
      ? Math.floor(p.skillDamage / 3) * (3 - t.shieldCharges)
      : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0);
  return 0;
}
function counterGenerated(s, c, action) {
  const t = currentGenerated(s, c).transition,
    p = require("../hardcore/tower/classProfiles").profile(c.classKey);
  if (t.type !== "combat") return 0;
  if (c.generatorVersion >= 4)
    return action === t.expectedAction ? t.counterDamage : t.intentDamage;
  if (
    s.classCharges.ward > 0 ||
    (action === "skill" && ["shield", "dodge"].includes(p.mechanic))
  )
    return 0;
  return p.mechanic === "shield" && action === "defend"
    ? Math.floor(t.intentDamage / 2)
    : t.intentDamage;
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
      potions: s.potions,
      floor: s.floor,
      step: s.step,
      routeStep: s.routeStep,
    };
  if (c.generatorVersion >= 4) return actPuzzle(s, c, action, t, before);
  const next = require("../hardcore/tower/solver").apply(c, s, action);
  s.actionHistory.push(sha(JSON.stringify([s.turn, action])));
  s.turn++;
  if (next.status === "failed") {
    s.status = "failed";
    s.failure = next.failureHint;
    s.failureHint = next.failureHint;
    s.lastLog =
      "Sai lời giải ở tầng " + s.floor + ", bước " + (s.floorStep + 1) + ".";
    s.lastOutcome = { ...before, actionDamage: 0, counterDamage: 0 };
    return s;
  }
  const turn = s.turn,
    history = s.actionHistory,
    oldEnemy = s.enemyHp;
  Object.assign(s, next, {
    turn,
    actionHistory: history,
    step: next.floorStep,
  });
  s.cleared = next.status === "completed" ? 15 : next.floor - 1;
  s.enemyHp = Math.max(0, oldEnemy + t.enemyHpDelta);
  if (s.floor !== before.floor) {
    s.enemyHp = c.floors[s.floor - 1].hp;
    s.floorCheckpoint = floorCheckpoint(s);
  }
  if (s.flags.includes("mana_fracture"))
    s.paradox = { id: "mana_fracture", startFloor: 5, endFloor: 15 };
  const label =
    t.choices?.find((x) => x.action === action)?.label ||
    (action === "skill"
      ? c.combat.skillName
      : action === "attack"
        ? "Tấn công"
        : action === "defend"
          ? "Phòng thủ"
          : "Bình máu");
  s.lastLog = label + ": đúng nhịp " + s.routeStep + "/" + c.stepCount + ".";
  s.lastOutcome = {
    ...before,
    actionDamage: Math.abs(t.enemyHpDelta),
    counterDamage: t.counterDamage,
    heal: t.heal,
  };
  return s;
}

function actionLabel(action, c) {
  return action === "skill"
    ? c.combat.skillName
    : action === "attack"
      ? "Tấn công"
      : action === "defend"
        ? "Phòng thủ"
        : "Bình máu";
}

function abstractMistakeHint(expected, chosen) {
  if (chosen === "potion" && expected !== "potion")
    return "Dòng Sinh lực đã bị khuấy động trước khi khế ước ổn định.";
  if (expected === "potion")
    return "Một cửa sổ Sinh lực đã khép lại mà chưa được tận dụng.";
  if (expected === "defend")
    return "Dấu Hành quyết vẫn còn lưu lại trên khiên của bạn.";
  if (expected === "skill")
    return "Một Ấn Linh hồn vẫn dao động khi số bước đã cạn.";
  return "Một vết nứt vật chất chưa được khai thác trước khi cánh cửa đóng lại.";
}

function abstractFloorHint(mistakes) {
  const missedPotion = mistakes.find((x) => x.expected === "potion");
  if (missedPotion) {
    const latePotion = mistakes.some(
      (x) => x.floorStep > missedPotion.floorStep && x.chosen === "potion",
    );
    return latePotion
      ? "Sinh lực đã được gọi khi cửa sổ của nó chỉ còn là dư âm."
      : missedPotion.hint;
  }
  return mistakes[0]?.hint || "Nhịp điệu của tầng vẫn còn một chỗ lệch.";
}

function actPuzzle(s, c, action, t, before) {
  const p = require("../hardcore/tower/classProfiles").profile(c.classKey),
    mistakes = (s.floorMistakes ||= []),
    cleanSoFar = mistakes.length === 0,
    correct = action === t.expectedAction;
  s.actionHistory.push(sha(JSON.stringify([s.turn, action])));
  s.turn++;
  if (!correct)
    mistakes.push({
      floorStep: s.floorStep,
      expected: t.expectedAction,
      chosen: action,
      hint: abstractMistakeHint(t.expectedAction, action),
    });

  let actionDamage = 0,
    counterDamage = 0,
    heal = 0;
  if (correct && cleanSoFar) {
    const next = require("../hardcore/tower/solver").apply(c, s, action),
      turn = s.turn,
      history = s.actionHistory,
      oldEnemy = s.enemyHp;
    Object.assign(s, next, {
      turn,
      actionHistory: history,
      floorMistakes: mistakes,
      step: next.floorStep,
    });
    actionDamage = Math.abs(t.enemyHpDelta);
    counterDamage = t.counterDamage;
    heal = t.heal;
    s.enemyHp = Math.max(0, oldEnemy + t.enemyHpDelta);
  } else {
    actionDamage =
      action === "attack"
        ? p.attackDamage
        : action === "skill"
          ? p.skillDamage
          : 0;
    if (action === "skill") s.mana = Math.max(0, s.mana - t.skillCost);
    else if (action === "attack")
      s.mana = Math.min(s.maxMana, s.mana + t.attackMana);
    else if (action === "defend")
      s.mana = Math.min(s.maxMana, s.mana + t.defendMana);
    if (action === "potion") {
      heal = Math.min(s.potionHeal, s.maxHp - s.hp);
      s.hp += heal;
      s.potions--;
    } else if (action === "skill" && p.heal) {
      heal = Math.min(p.heal, s.maxHp - s.hp);
      s.hp += heal;
    }
    counterDamage = action === "defend" ? 0 : Math.max(1, t.counterDamage);
    s.hp = Math.max(1, s.hp - counterDamage);
    s.enemyHp = Math.max(1, s.enemyHp - actionDamage);
    s.routeStep++;
    s.floorStep++;
    s.step = s.floorStep;
  }

  const floorEnded = t.floorStep + 1 === t.floor;
  if (floorEnded && mistakes.length) {
    s.status = "failed";
    s.floor = t.floor;
    s.floorStep = t.floor;
    s.step = t.floor;
    s.failure = abstractFloorHint(mistakes);
    s.failureHint = s.failure;
  } else if (floorEnded && s.status !== "completed") {
    s.cleared = t.floor;
    s.enemyHp = c.floors[s.floor - 1].hp;
    s.floorMistakes = [];
    s.floorCheckpoint = floorCheckpoint(s);
  } else {
    s.cleared = s.status === "completed" ? 15 : s.floor - 1;
  }
  if (s.status === "completed") s.cleared = 15;
  s.lastLog =
    actionLabel(action, c) +
    ": đã dùng bước " +
    (t.floorStep + 1) +
    "/" +
    t.floor +
    " của tầng.";
  s.lastOutcome = { ...before, actionDamage, counterDamage, heal };
  return s;
}
