"use strict";
const { createHash, createHmac } = require("node:crypto");
const { profile } = require("./classProfiles");
const { FIXED_POTION_HEAL, MONSTERS, tellFor } = require("./templates");
const solver = require("./solver");

const GENERATOR_VERSION = 4;
const CONTENT_VERSION = 4;
const FLOOR_LENGTHS = Object.freeze(
  Array.from({ length: 15 }, (_, i) => i + 1),
);
const POTION_STEPS = Object.freeze({ 6: 2, 10: 4, 13: 5, 15: 7 });
const ACTION_CYCLE = Object.freeze(["attack", "skill", "defend", "attack"]);

function deterministicIndex(seed, label, size) {
  return (
    createHash("sha256").update(`${seed}:${label}`).digest().readUInt32BE(0) %
    size
  );
}
function challengeId(year, week, classKey, version = GENERATOR_VERSION) {
  return `tower:${year}:W${String(week).padStart(2, "0")}:${classKey}:g${version}`;
}
function productionSeed(
  id,
  contentVersion,
  secret = process.env.TOWER_GENERATOR_SECRET,
) {
  if (!secret) throw Error("MISSING_TOWER_GENERATOR_SECRET");
  return createHmac("sha256", secret)
    .update(`${id}:${contentVersion}`)
    .digest("hex");
}
function failureHint(expected, chosen) {
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
function plannedAction({ floor, floorStep, mana, seed, nonce }) {
  if (floor === 1) return "attack";
  if (floor === 2 && floorStep === 0) return "defend";
  if (POTION_STEPS[floor] === floorStep) return "potion";
  if (floor === 12 && floorStep < 3)
    return ["defend", "attack", "skill"][floorStep];
  if (floorStep === floor - 1)
    return mana >= 2 && deterministicIndex(seed, `finish:${nonce}:${floor}`, 2)
      ? "skill"
      : "attack";
  const offset = deterministicIndex(
      seed,
      `cycle:${nonce}:${floor}`,
      ACTION_CYCLE.length,
    ),
    action = ACTION_CYCLE[(floorStep + offset) % ACTION_CYCLE.length];
  return action === "skill" && mana < 2 ? "attack" : action;
}
function conditionFor(action) {
  return {
    attack: "physical_only",
    skill: "arcane_only",
    defend: "execution_guard",
    potion: "fixed_potion_window",
  }[action];
}
function candidate(
  {
    isoYear,
    isoWeek,
    classKey,
    seed,
    startsAt,
    endsAt,
    contentVersion = CONTENT_VERSION,
  },
  nonce,
) {
  const p = profile(classKey),
    floors = [],
    transitions = [];
  let hp = p.maxHp,
    mana = p.maxMana,
    potions = p.potions;
  for (let floor = 1; floor <= 15; floor++) {
    const monster = MONSTERS[floor - 1],
      stepStart = transitions.length,
      local = [];
    let enemyHp = 0;
    for (let floorStep = 0; floorStep < floor; floorStep++) {
      let action = plannedAction({ floor, floorStep, mana, seed, nonce });
      if (action === "potion" && potions < 1)
        throw Error("INSUFFICIENT_TOWER_POTIONS");
      if (action === "skill" && mana < p.skillCost) action = "attack";

      if (action === "potion" && p.maxHp - hp < FIXED_POTION_HEAL) {
        const previous = local.findLast((t) =>
            ["attack", "skill"].includes(t.expectedAction),
          ),
          extra = FIXED_POTION_HEAL - (p.maxHp - hp);
        if (!previous || previous.hpBefore - previous.counterDamage - extra < 1)
          throw Error("INVALID_POTION_SETUP");
        previous.counterDamage += extra;
        previous.intentDamage += extra;
        previous.hpDelta -= extra;
        hp -= extra;
      }

      const hpBefore = hp,
        manaBefore = mana,
        potionsBefore = potions,
        attackMana = mana < p.maxMana ? 1 : 0,
        defendMana = mana < p.maxMana ? 1 : 0,
        manaDelta =
          action === "skill"
            ? -p.skillCost
            : action === "attack"
              ? attackMana
              : action === "defend"
                ? defendMana
                : 0,
        damage =
          action === "attack"
            ? p.attackDamage
            : action === "skill"
              ? p.skillDamage
              : 0,
        counterDamage = ["defend", "potion"].includes(action) ? 0 : 1,
        requestedHeal =
          action === "potion"
            ? FIXED_POTION_HEAL
            : action === "skill"
              ? p.heal
              : 0,
        actualHeal = Math.min(requestedHeal, p.maxHp - hp),
        hpDelta = actualHeal - counterDamage,
        potionsDelta = action === "potion" ? -1 : 0,
        variant = deterministicIndex(
          seed,
          `tell:${nonce}:${floor}:${floorStep}`,
          3,
        );
      hp += hpDelta;
      mana += manaDelta;
      potions += potionsDelta;
      enemyHp += damage;
      if (hp < 1) throw Error("LETHAL_CANONICAL_ROUTE");
      local.push({
        routeStep: transitions.length + local.length,
        floor,
        floorStep,
        type: "combat",
        expectedAction: action,
        availableActions: ["attack", "skill", "defend", "potion"],
        clueTemplate: `monster_${monster.id}`,
        clue: monster.rule,
        puzzleRule: monster.rule,
        signal: tellFor(action, floor, floorStep, variant),
        condition: conditionFor(action),
        hintByAction: Object.fromEntries(
          ["attack", "skill", "defend", "potion"].map((chosen) => [
            chosen,
            failureHint(action, chosen),
          ]),
        ),
        hpBefore,
        manaBefore,
        potionsBefore,
        hpDelta,
        manaDelta,
        potionsDelta,
        hpRange: action === "potion" ? [1, p.maxHp - FIXED_POTION_HEAL] : null,
        manaRange: action === "skill" ? [p.skillCost, p.maxMana] : null,
        enemyHpDelta: -damage,
        damage,
        heal: actualHeal,
        counterDamage,
        intentDamage: action === "defend" ? p.maxHp + 1 : counterDamage,
        counterType:
          action === "defend" ? "one_hit" : floor % 2 ? "physical" : "magic",
        skillCost: p.skillCost,
        attackMana,
        defendMana,
        requiredFlags: [],
        grantsFlags: [],
        removesFlags: [],
        classChargesBefore: { ward: 0 },
        classChargesAfter: { ward: 0 },
        shieldCharges: 0,
        spellLocked: false,
      });
    }
    if (!local.at(-1).damage) throw Error("FLOOR_MUST_END_WITH_KILL");
    floors.push({
      number: floor,
      id: monster.id,
      name: monster.name,
      mechanic: monster.id,
      rule: monster.rule,
      stepStart,
      stepCount: floor,
      hp: enemyHp,
    });
    transitions.push(...local);
  }
  const payload = {
    challengeId: challengeId(isoYear, isoWeek, classKey),
    isoYear,
    isoWeek,
    generatorVersion: GENERATOR_VERSION,
    contentVersion,
    classKey,
    seedCommitment: solver.hash(seed),
    name: `${p.name} · Tháp Suy Luận`,
    weekLabel: `TUẦN ${isoWeek}`,
    character: {
      classKey,
      name: p.name,
      maxHp: p.maxHp,
      maxMana: p.maxMana,
      mana: p.maxMana,
      potions: p.potions,
      potionHeal: FIXED_POTION_HEAL,
      ...p.survivalStats,
    },
    loadout: p.loadout,
    catalogSource: "survival-v2-readonly",
    deterministicCombat: true,
    runtimeRng: false,
    combat: {
      attackDamage: p.attackDamage,
      skillDamage: p.skillDamage,
      skillCost: p.skillCost,
      attackMana: p.attackMana,
      defendMana: p.defendMana,
      skillName: p.skillName,
      potionHeal: FIXED_POTION_HEAL,
    },
    classDescription: p.description,
    floors,
    transitions,
    initialState: { hp: p.maxHp, mana: p.maxMana, potions: p.potions },
    finalState: null,
    stepCount: 120,
    startsAt,
    endsAt,
    reward: { coins: 500000, diamonds: 250 },
    wrongActionPolicy: "hidden_until_floor_end_with_abstract_hint",
    candidateNonce: nonce,
    solutionHash: null,
    difficultyScore: 0,
  };
  let state = solver.initial(payload);
  for (const t of transitions)
    state = solver.apply(payload, state, t.expectedAction);
  payload.finalState = state;
  return payload;
}
function generate(
  options,
  { maxCandidates = 100, validate = solver.validate } = {},
) {
  if (!options.seed) throw Error("MISSING_TOWER_SEED");
  if (maxCandidates < 1 || maxCandidates > 100)
    throw Error("INVALID_CANDIDATE_LIMIT");
  let last;
  const failures = {};
  for (let nonce = 0; nonce < maxCandidates; nonce++) {
    try {
      const payload = candidate(options, nonce),
        audit = validate(payload);
      payload.solutionHash = audit.solutionHash;
      payload.difficultyScore = audit.difficultyScore;
      const { canonicalSolution, ...report } = audit;
      return { payload, canonicalSolution, audit: report };
    } catch (error) {
      last = error;
      failures[error.message] = (failures[error.message] || 0) + 1;
    }
  }
  const error = Error(`TOWER_GENERATION_FAILED: ${last?.message}`);
  error.failures = failures;
  throw error;
}
module.exports = {
  GENERATOR_VERSION,
  CONTENT_VERSION,
  FIXED_POTION_HEAL,
  FIRST_LENGTHS: FLOOR_LENGTHS,
  FLOOR_LENGTHS,
  FLOOR_PUZZLES: MONSTERS,
  challengeId,
  productionSeed,
  generate,
};
