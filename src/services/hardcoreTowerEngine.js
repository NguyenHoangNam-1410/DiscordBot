"use strict";
const { createHash } = require("node:crypto");
const sha = (s) => createHash("sha256").update(s).digest("hex");
function solutionHash(c, actions = c.canonicalSolution) {
  return sha(JSON.stringify([c.challengeId, c.contentVersion, actions]));
}
function enter(s, c) {
  const e = c.floors[s.floor - 1];
  s.step = 0;
  s.phaseActions = 0;
  s.enemyHp = e.hp || 0;
}
function createState(c) {
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
  const encounter = c.floors[s.floor - 1];
  return { encounter, phase: encounter.phases?.[s.step] };
}
function costs(s, c) {
  return {
    mana: s.paradox?.id === "mana_fracture" ? 1 : c.combat.skillCost,
    hp:
      s.paradox?.id === "blood_pact"
        ? Math.max(1, Math.floor(s.maxHp * 0.05))
        : 0,
  };
}
function attackMana(s, c) {
  return s.paradox?.id === "mana_fracture" ? 0 : c.combat.attackMana;
}
function damage(s, c, action) {
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
  const { phase } = current(s, c);
  return action === "defend"
    ? (phase.defendCounter ?? phase.counterDamage ?? 0)
    : (phase.counterDamage ?? 0);
}
function actions(s, c) {
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
};
