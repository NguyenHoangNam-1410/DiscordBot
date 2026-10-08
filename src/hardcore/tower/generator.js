"use strict";
const { createHash, createHmac } = require("node:crypto");
const { profile } = require("./classProfiles");
const { makeClue, eventChoices } = require("./templates");
const solver = require("./solver");
const GENERATOR_VERSION = 4,
  CONTENT_VERSION = 5;
const FIRST_LENGTHS = [4, 4, 5, 5, 4, 5, 5, 5, 6, 5, 6, 6, 6, 7, 8];
const FLOOR_NAMES = [
  "Nhịp khai mở",
  "Trật tự MP",
  "Hai mặt lõi",
  "Ngã rẽ sinh lực",
  "Mana Paradox",
  "Mana Fracture",
  "Double Verdict",
  "Gương lưu nhịp",
  "Delayed Reflection",
  "Purification Fork",
  "Debt Collector",
  "Reverse Memory",
  "Class Seal",
  "Final Auditor",
  "The Unbroken Point",
];
function random(seed, nonce) {
  let counter = 0;
  return () =>
    createHash("sha256")
      .update(seed + ":" + nonce + ":" + counter++)
      .digest()
      .readUInt32BE(0) / 0x100000000;
}
function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function challengeId(year, week, classKey, version = GENERATOR_VERSION) {
  return (
    "tower:" +
    year +
    ":W" +
    String(week).padStart(2, "0") +
    ":" +
    classKey +
    ":g" +
    version
  );
}
function productionSeed(
  id,
  contentVersion,
  secret = process.env.TOWER_GENERATOR_SECRET,
) {
  if (!secret) throw Error("MISSING_TOWER_GENERATOR_SECRET");
  return createHmac("sha256", secret)
    .update(id + ":" + contentVersion)
    .digest("hex");
}
function costsAt(p) {
  return {
    skillCost: p.skillCost,
    attackMana: p.attackMana,
    defendMana: p.defendMana,
  };
}
function candidate(
  {
    isoYear,
    isoWeek,
    classKey,
    seed,
    startsAt,
    endsAt,
    challengeId: requestedChallengeId,
    contentVersion = CONTENT_VERSION,
  },
  nonce,
) {
  const p = profile(classKey),
    rng = random(seed, nonce),
    first = isoYear === 2026 && isoWeek === 41;
  const lengths = first
    ? FIRST_LENGTHS.slice()
    : [...Array(15)].map((_, i) => {
        const range =
          i < 3
            ? [4, 5]
            : i < 6
              ? [4, 6]
              : i < 10
                ? [5, 6]
                : i < 13
                  ? [6, 7]
                  : i === 13
                    ? [7, 8]
                    : [8, 10];
        return range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
      });
  const n = lengths.reduce((a, b) => a + b, 0);
  if (n < 72 || n > 90 || lengths.slice(11).reduce((a, b) => a + b, 0) < 27)
    throw Error("CANDIDATE_LENGTH");
  const slots = [],
    floors = [];
  for (let i = 0; i < 15; i++) {
    floors.push({
      number: i + 1,
      name: FLOOR_NAMES[i],
      stepStart: slots.length,
      stepCount: lengths[i],
      hp: 0,
    });
    for (let j = 0; j < lengths[i]; j++)
      slots.push({
        floor: i + 1,
        floorStep: j,
        routeStep: slots.length,
        type: "combat",
      });
  }
  const floorSlots = (f) => slots.filter((t) => t.floor === f);
  for (const [f, kind] of [
    [4, "hp_fork"],
    [5, "paradox"],
    [8, "mana_fork"],
    [10, "purification"],
  ]) {
    const t = floorSlots(f)[0];
    t.type = "event";
    t.eventKind = kind;
    t.choices = eventChoices(kind, nonce);
    t.expectedAction = t.choices[0].action;
    t.category =
      kind === "paradox"
        ? "class"
        : kind === "mana_fork"
          ? "resource"
          : "delayed";
  }
  function seedSequence(length) {
    const sequence = [];
    for (let i = 0; i < length; i++) {
      const choices = shuffle(["attack", "skill", "defend"], rng).filter(
        (a) =>
          (i < length - 1 || a !== "defend") &&
          !(
            sequence.slice(-3).length === 3 &&
            sequence.slice(-3).every((x) => x === a)
          ),
      );
      sequence.push(choices[0]);
    }
    return sequence;
  }
  const firstActions = [
      ...shuffle(["attack", "skill", "defend"], rng),
      ...seedSequence(lengths[0] - 3),
    ],
    eightActions = seedSequence(lengths[7] - 1);
  if (new Set(firstActions).size < 3) throw Error("CANDIDATE_FIRST_RHYTHM");
  for (const [f, seq] of [
    [1, firstActions],
    [8, eightActions],
  ]) {
    floorSlots(f)
      .filter((t) => t.type === "combat")
      .forEach((t, i) => (t.forced = seq[i]));
  }
  const reversedFirst = firstActions.slice().reverse(),
    reversedEight = eightActions.slice().reverse();
  floorSlots(12).forEach((t, i) => {
    t.forced = reversedFirst[i % reversedFirst.length];
    t.category = "memory";
    t.memoryFloor = 1;
    t.memoryIndex = i + 1;
  });
  floorSlots(14)
    .slice(0, 3)
    .forEach((t, i) => {
      t.forced = reversedEight[i];
      t.category = "memory";
      t.memoryFloor = 8;
      t.memoryIndex = i + 1;
    });
  // V4 uses one global combat law instead of per-turn answer matching:
  // build MP with Attack/Defend, then save the floor's single Skill for lethal.
  for (const t of slots)
    if (t.category === "memory") {
      delete t.category;
      delete t.memoryFloor;
      delete t.memoryIndex;
      delete t.forced;
    }
  const initialMana = p.skillCost;
  let mana = initialMana,
    forwardMana = initialMana,
    finalMana = initialMana;
  function combatPlan(length) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const actions = shuffle(
        [
          "attack",
          "defend",
          "skill",
          ...Array.from(
            { length: length - 3 },
            () => shuffle(["attack", "defend", "skill"], rng)[0],
          ),
        ],
        rng,
      );
      if (actions.at(-1) === "defend") {
        const swap = actions.findIndex((action) => action !== "defend");
        [actions[swap], actions[actions.length - 1]] = [
          actions.at(-1),
          actions[swap],
        ];
      }
      if (
        actions.some(
          (action, index) =>
            index >= 2 &&
            action === actions[index - 1] &&
            action === actions[index - 2],
        )
      )
        continue;
      let available = initialMana,
        valid = true;
      for (const action of actions) {
        if (action === "skill" && available < p.skillCost) {
          valid = false;
          break;
        }
        available = Math.max(
          0,
          Math.min(
            p.maxMana,
            available +
              (action === "skill"
                ? -p.skillCost
                : action === "attack"
                  ? p.attackMana
                  : p.defendMana),
          ),
        );
      }
      if (valid) return actions;
    }
    throw Error("CANDIDATE_COMBAT_PLAN");
  }
  for (let floor = 1; floor <= 15; floor++) {
    const combat = floorSlots(floor).filter((t) => t.type === "combat"),
      plan = combatPlan(combat.length);
    combat.forEach((t, index) => {
      t.expectedAction = plan[index];
      if (plan[index] === "attack") {
        t.physicalResist = rng() < 0.5 ? 0 : 25;
        t.magicResist = 100;
        t.armorMode = "magic_guard";
      } else if (plan[index] === "skill") {
        t.physicalResist = 100;
        t.magicResist = rng() < 0.5 ? 0 : 25;
        t.armorMode = "physical_guard";
      } else {
        t.physicalResist = 100;
        t.magicResist = 100;
        t.armorMode = "fortified";
      }
    });
  }
  for (let floor = 1; floor <= 15; floor++) {
    forwardMana = initialMana;
    for (const t of floorSlots(floor)) {
      const cost = costsAt(p);
      Object.assign(t, cost);
      t.manaBefore = forwardMana;
      if (t.type === "event") {
        t.manaDelta = 0;
        continue;
      }
      const gain =
        t.expectedAction === "skill"
          ? -cost.skillCost
          : t.expectedAction === "attack"
            ? cost.attackMana
            : cost.defendMana;
      if (t.expectedAction === "skill" && forwardMana < cost.skillCost)
        throw Error("CANDIDATE_RESOURCE_DEAD_END");
      const after = Math.max(0, Math.min(p.maxMana, forwardMana + gain));
      t.manaDelta = after - forwardMana;
      forwardMana = after;
    }
    if (floor === 15) finalMana = forwardMana;
  }
  mana = initialMana;
  const counts = { direct: 0, resource: 0, delayed: 0, memory: 0, class: 0 };
  slots.forEach((t) => {
    if (t.category) counts[t.category]++;
  });
  for (const cat of ["resource", "delayed", "class"]) {
    const target = Math.ceil(
      n * (cat === "resource" ? 0.22 : cat === "delayed" ? 0.17 : 0.18),
    );
    const eligible = shuffle(
      slots.filter((t) => !t.category && (cat !== "delayed" || t.floor >= 5)),
      rng,
    );
    if (cat === "resource")
      for (const t of eligible
        .filter(
          (x) => x.expectedAction === "defend" && x.manaBefore >= x.skillCost,
        )
        .slice(0, 4)) {
        t.category = cat;
        counts[cat]++;
      }
    for (let i = eligible.length - 1; i >= 0; i--)
      if (eligible[i].category) eligible.splice(i, 1);
    while (counts[cat] < target && eligible.length) {
      eligible.pop().category = cat;
      counts[cat]++;
    }
  }
  slots.forEach((t) => {
    if (!t.category) t.category = "direct";
  });
  for (let floor = 1; floor <= 15; floor++) {
    const combat = floorSlots(floor).filter((t) => t.type === "combat");
    for (let index = 0; index < combat.length - 2; index++)
      if (floor >= 5 && combat[index].category === "delayed" && rng() < 0.65)
        combat[index].echoDelay = rng() < 0.5 ? 1 : 2;
    const phaseCount = floor === 15 ? 3 : floor >= 13 ? 2 : 1;
    floors[floor - 1].phaseCount = phaseCount;
    floors[floor - 1].phaseNames = Array.from(
      { length: phaseCount },
      (_, index) => "Pha " + (index + 1),
    );
    if (phaseCount > 1) {
      let previousEnd = -1;
      for (let phase = 1; phase < phaseCount; phase++) {
        const target = Math.ceil((combat.length * phase) / phaseCount) - 1,
          remaining = phaseCount - phase,
          candidates = combat
            .map((t, index) => ({ t, index }))
            .filter(
              ({ t, index }) =>
                index > previousEnd &&
                index < combat.length - remaining &&
                t.expectedAction !== "defend",
            )
            .sort(
              (a, b) => Math.abs(a.index - target) - Math.abs(b.index - target),
            );
        if (!candidates.length) throw Error("CANDIDATE_BOSS_PHASE_SPLIT");
        const end = candidates[0].index;
        combat[end].phaseEnd = true;
        combat[end].bossPhase = phase - 1;
        previousEnd = end;
      }
      combat.at(-1).phaseEnd = true;
      combat.at(-1).bossPhase = phaseCount - 1;
    }
  }
  // Every floor is an independent puzzle. HP, MP, Ward and flags are reset at
  // its entrance, so no solution depends on choices made on an earlier floor.
  let ward = 0,
    wardFloor = 1;
  for (const t of slots) {
    if (t.floor !== wardFloor) {
      ward = 0;
      wardFloor = t.floor;
    }
    t.finisher =
      t.type === "combat" && t.floorStep === lengths[t.floor - 1] - 1;
    t.classChargesBefore = { ward };
    const blocked =
      t.type === "combat" &&
      (ward > 0 ||
        (p.mechanic === "dodge" && t.expectedAction === "skill") ||
        (p.mechanic === "shield" && t.expectedAction === "skill"));
    t.blocked = blocked;
    if (t.type === "combat" && ward > 0) ward = 0;
    if (p.mechanic === "ward" && t.expectedAction === "skill") ward = 1;
    t.classChargesAfter = { ward };
  }
  let finalHp = p.maxHp;
  for (let floor = 1; floor <= 15; floor++) {
    const floorTurns = floorSlots(floor),
      freeHealing = floorTurns.reduce(
        (sum, t) =>
          sum +
          ((t.finisher || t.phaseEnd || t.blocked) &&
          t.expectedAction === "skill"
            ? p.heal
            : 0),
        0,
      ),
      minimumTargetHp = Math.min(Math.floor(p.maxHp * 0.2), freeHealing + 1),
      targetHp =
        minimumTargetHp +
        Math.floor(rng() * (Math.floor(p.maxHp * 0.2) - minimumTargetHp + 1)),
      eventLoss = floorTurns.some((t) => t.eventKind === "hp_fork") ? 3 : 0,
      vulnerable = floorTurns.filter(
        (t) => t.type === "combat" && !t.blocked && !t.finisher && !t.phaseEnd,
      ),
      budget = p.maxHp - targetHp - eventLoss + freeHealing,
      weights = vulnerable.map(() => 1 + Math.floor(rng() * 5)),
      total = weights.reduce((a, b) => a + b, 0),
      losses = weights.map((w) => Math.floor((budget * w) / total));
    let remaining = budget - losses.reduce((a, b) => a + b, 0);
    for (const index of shuffle(
      losses.map((_, i) => i),
      rng,
    )) {
      if (!remaining) break;
      losses[index]++;
      remaining--;
    }
    let vi = 0,
      hp = p.maxHp;
    for (const t of floorTurns) {
      t.heal = t.type === "combat" && t.expectedAction === "skill" ? p.heal : 0;
      t.hpDelta =
        t.type === "event"
          ? t.eventKind === "hp_fork"
            ? -3
            : 0
          : t.finisher || t.phaseEnd || t.blocked
            ? t.heal
            : -losses[vi++];
      t.counterDamage = t.type === "combat" ? t.heal - t.hpDelta : 0;
      t.intentDamage =
        t.finisher || t.phaseEnd
          ? 0
          : t.blocked
            ? p.maxHp + 1
            : p.mechanic === "shield" && t.expectedAction === "defend"
              ? 2 * t.counterDamage
              : t.counterDamage;
      t.counterType =
        p.mechanic === "shield" && t.expectedAction === "skill"
          ? "magic"
          : p.mechanic === "shield" && t.expectedAction === "defend"
            ? "physical"
            : rng() < 0.5
              ? "physical"
              : "magic";
      t.requiredFlags = [];
      t.grantsFlags = [];
      t.removesFlags = [];
      t.resourceWasteWindow =
        t.category === "resource" &&
        t.expectedAction === "defend" &&
        t.manaBefore >= t.skillCost;
      t.shieldCharges =
        p.mechanic === "barrage" &&
        t.category === "class" &&
        t.expectedAction === "skill"
          ? 2
          : 0;
      t.classMechanic = p.mechanic;
      t.spellLocked = false;
      t.hpBefore = hp;
      hp += t.hpDelta;
    }
    if (hp !== targetHp) throw Error("CANDIDATE_HP_CURVE");
    if (floor === 15) finalHp = targetHp;
  }
  for (const t of slots) {
    if (t.type !== "combat") continue;
    t.guardIntent = t.expectedAction === "defend";
    if (t.expectedAction === "defend") {
      t.defendDamage = t.counterDamage;
      t.intentDamage = t.hpBefore + t.heal;
    } else {
      t.defendDamage = Math.floor(t.intentDamage / 2);
    }
  }
  const damagePayload = {
    generatorVersion: GENERATOR_VERSION,
    contentVersion,
    classKey,
    character: { maxHp: p.maxHp, maxMana: p.maxMana },
    floors,
    transitions: slots,
    initialState: { hp: p.maxHp, mana: initialMana },
  };
  for (let floor = 1; floor <= 15; floor++) {
    const floorTurns = floorSlots(floor);
    let combatState = {
        hp: p.maxHp,
        mana: initialMana,
        enemyHp: Number.MAX_SAFE_INTEGER,
        floor,
        floorStep: 0,
        routeStep: floorTurns[0].routeStep,
        flags: [],
        classCharges: { ward: 0 },
        skillUsed: false,
        breakGauge: 0,
        adaptiveArmor: null,
        delayedEffects: [],
        bossPhase: 0,
        phaseHp: Number.MAX_SAFE_INTEGER,
      },
      floorDamage = 0,
      phaseDamage = 0;
    const phaseHps = [];
    for (const t of floorTurns) {
      if (t.type === "event") {
        t.enemyHpDelta = 0;
        t.damage = 0;
        t.echoDamage = 0;
        continue;
      }
      combatState = {
        ...combatState,
        hp: t.hpBefore,
        mana: t.manaBefore,
        routeStep: t.routeStep,
        floorStep: t.floorStep,
        classCharges: { ...t.classChargesBefore },
      };
      const outcome = solver.combatOutcome(
        damagePayload,
        combatState,
        t,
        t.expectedAction,
      );
      t.enemyHpDelta = -outcome.rawDamage;
      t.damage = outcome.directDamage;
      t.echoDamage = outcome.echoDamage;
      floorDamage += outcome.rawDamage;
      phaseDamage += outcome.rawDamage;
      combatState = {
        ...combatState,
        breakGauge: outcome.breakGauge,
        adaptiveArmor: outcome.adaptiveArmor,
        delayedEffects: outcome.delayedEffects,
      };
      if (t.phaseEnd) {
        phaseHps.push(phaseDamage);
        phaseDamage = 0;
      }
    }
    if (phaseDamage || !phaseHps.length) phaseHps.push(phaseDamage);
    if (phaseHps.some((hp) => hp < 1)) throw Error("CANDIDATE_EMPTY_PHASE");
    floors[floor - 1].hp = floorDamage;
    floors[floor - 1].phaseHps = phaseHps;
  }
  mana = initialMana;
  const used = {},
    templates = [];
  let manaFloor = 1;
  for (const t of slots) {
    if (t.floor !== manaFloor) {
      mana = initialMana;
      manaFloor = t.floor;
    }
    t.manaBefore = mana;
    mana += t.manaDelta;
    t.hpRange =
      p.mechanic === "regeneration" && t.category === "class"
        ? [Math.max(1, t.hpBefore - 1), Math.min(p.maxHp, t.hpBefore + 1)]
        : null;
    if (
      p.mechanic === "rage" &&
      t.category === "class" &&
      t.expectedAction === "attack" &&
      t.hpBefore <= p.maxHp * 0.35
    )
      t.hpRange = [1, Math.floor(p.maxHp * 0.35)];
    t.manaRange =
      t.category === "resource" ? [t.manaBefore, t.manaBefore] : null;
    if (t.type === "event") {
      t.clueTemplate = "event_" + t.eventKind;
      t.clue =
        t.eventKind === "hp_fork"
          ? "Chọn mức HP khởi đầu cho puzzle của riêng tầng này."
          : t.eventKind === "paradox"
            ? "Chọn cách quản lý MP chỉ áp dụng trong tầng này."
            : t.eventKind === "mana_fork"
              ? "Chọn lượng MP khởi đầu cho phần combat của tầng này."
              : "Chọn cách thanh tẩy hiệu ứng trong puzzle hiện tại.";
      continue;
    }
    const variants = shuffle([0, 1, 2], rng).map((v) =>
      makeClue(t.category, t.expectedAction, v, {
        profile: p,
        hpRange: t.hpRange,
        memoryIndex: t.memoryIndex,
        memoryFloor: t.memoryFloor,
      }),
    );
    const clue = variants.find(
      (x) =>
        (used[x.template] || 0) < 20 &&
        !(
          templates.length >= 2 &&
          templates.at(-1) === x.template &&
          templates.at(-2) === x.template
        ),
    );
    if (!clue) throw Error("CANDIDATE_TEMPLATE_LIMIT");
    t.clueTemplate = clue.template;
    t.clue = clue.text;
    if (t.category === "resource")
      t.clue +=
        " Khóa MP trước hành động: " + t.manaBefore + "/" + p.maxMana + ".";
    used[clue.template] = (used[clue.template] || 0) + 1;
    templates.push(clue.template);
    delete t.forced;
    delete t.blocked;
    delete t.hpBefore;
    delete t.manaBefore;
  }
  const payload = {
    challengeId:
      requestedChallengeId || challengeId(isoYear, isoWeek, classKey),
    isoYear,
    isoWeek,
    generatorVersion: GENERATOR_VERSION,
    contentVersion,
    classKey,
    seedCommitment: solver.hash(seed),
    name: p.name + " · Mortal Equation",
    weekLabel: "TUẦN " + isoWeek,
    character: {
      classKey,
      name: p.name,
      maxHp: p.maxHp,
      maxMana: p.maxMana,
      mana: initialMana,
      str: p.attackDamage,
      dex: 20,
      vit: 25,
      ene: p.maxMana * 10,
      defense: classKey === "paladin" ? 20 : 6,
      resistance: classKey === "paladin" ? 35 : 23,
      accuracy: 100,
      evasion: 0,
    },
    combat: {
      attackDamage: p.attackDamage,
      skillDamage: p.skillDamage,
      skillCost: p.skillCost,
      attackMana: p.attackMana,
      defendMana: p.defendMana,
      skillName: p.skillName,
    },
    classDescription: p.description,
    floors,
    transitions: slots,
    initialState: { hp: p.maxHp, mana: initialMana },
    finalState: null,
    stepCount: n,
    startsAt,
    endsAt,
    reward: { coins: 500000, diamonds: 250 },
    wrongActionPolicy: "combat_resolution",
    candidateNonce: nonce,
    solutionHash: null,
    difficultyScore: 0,
  };
  let state = solver.initial(payload);
  for (const t of slots) state = solver.apply(payload, state, t.expectedAction);
  if (state.hp !== finalHp || state.mana !== finalMana)
    throw Error(
      `CANDIDATE_FINAL_CURVE:${state.hp}/${finalHp}:${state.mana}/${finalMana}`,
    );
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
  const error = Error("TOWER_GENERATION_FAILED: " + last?.message);
  error.failures = failures;
  throw error;
}
module.exports = {
  GENERATOR_VERSION,
  CONTENT_VERSION,
  FIRST_LENGTHS,
  challengeId,
  productionSeed,
  generate,
};
