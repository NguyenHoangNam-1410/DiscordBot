"use strict";
const { createHash, createHmac } = require("node:crypto");
const { profile } = require("./classProfiles");
const { makeClue, eventChoices } = require("./templates");
const solver = require("./solver");
const GENERATOR_VERSION = 3,
  CONTENT_VERSION = 1;
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
function costsAt(p, t) {
  const fractured = t.floor > 5 || (t.floor === 5 && t.floorStep > 0);
  return {
    skillCost: fractured ? Math.max(1, p.skillCost - 1) : p.skillCost,
    attackMana: fractured ? 0 : p.attackMana,
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
  const finalMana = Math.floor(rng() * (Math.floor(p.maxMana * 0.4) + 1));
  const failed = new Set(),
    orders = slots.map(() => shuffle(["attack", "skill", "defend"], rng));
  function buildReverse(i, mana, nextAction, repeat, mask) {
    if (i < 0) return mana;
    const key = [i, mana, nextAction, repeat, mask].join("|");
    if (failed.has(key)) return null;
    const t = slots[i],
      cost = costsAt(p, t);
    Object.assign(t, cost);
    if (t.type === "event") {
      t.manaDelta = 0;
      return buildReverse(
        i - 1,
        mana,
        null,
        0,
        i === 0 || slots[i - 1].floor !== t.floor ? 0 : mask,
      );
    }
    for (const a of orders[i]) {
      const delta =
        a === "skill"
          ? -cost.skillCost
          : a === "attack"
            ? cost.attackMana
            : cost.defendMana;
      const before = mana - delta,
        bit = { attack: 1, skill: 2, defend: 4 }[a],
        newMask = mask | bit;
      if (
        before < 0 ||
        before > p.maxMana ||
        (t.forced && a !== t.forced) ||
        (t.floorStep === lengths[t.floor - 1] - 1 && a === "defend") ||
        (a === nextAction && repeat >= 3)
      )
        continue;
      const boundary = i === 0 || slots[i - 1].floor !== t.floor;
      if (
        boundary &&
        ((newMask & (newMask - 1)) === 0 || (t.floor === 15 && newMask !== 7))
      )
        continue;
      const initial = buildReverse(
        i - 1,
        before,
        a,
        a === nextAction ? repeat + 1 : 1,
        boundary ? 0 : newMask,
      );
      if (initial !== null) {
        t.expectedAction = a;
        t.manaDelta = delta;
        return initial;
      }
    }
    failed.add(key);
    return null;
  }
  const initialMana = buildReverse(n - 1, finalMana, null, 0, 0);
  if (initialMana === null) throw Error("CANDIDATE_RESOURCE_DEAD_END");
  let mana = initialMana;
  let forwardMana = initialMana;
  slots.forEach((t) => {
    t.manaBefore = forwardMana;
    forwardMana += t.manaDelta;
  });
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
  // Walk backward from the boss's small surviving HP budget. Ward/dodge steps
  // take no damage; Druid healing is accounted for in the fixed counter curve.
  let ward = 0;
  for (const t of slots) {
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
  const finalHp = 1 + Math.floor(rng() * Math.floor(p.maxHp * 0.2));
  let budget = p.maxHp - finalHp - 3;
  const vulnerable = slots.filter((t) => t.type === "combat" && !t.blocked);
  const weights = vulnerable.map(() => 1 + Math.floor(rng() * 5)),
    total = weights.reduce((a, b) => a + b, 0);
  const losses = weights.map((w) => Math.floor((budget * w) / total));
  let remaining = budget - losses.reduce((a, b) => a + b, 0);
  for (const index of shuffle(
    losses.map((_, i) => i),
    rng,
  )) {
    if (!remaining) break;
    losses[index]++;
    remaining--;
  }
  let vi = 0;
  for (const t of slots) {
    t.hpDelta =
      t.type === "event"
        ? t.eventKind === "hp_fork"
          ? -3
          : 0
        : t.blocked
          ? 0
          : -losses[vi++];
    t.heal = t.type === "combat" && t.expectedAction === "skill" ? p.heal : 0;
    t.counterDamage = t.type === "combat" ? t.heal - t.hpDelta : 0;
    t.intentDamage = t.blocked
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
    if (t.type === "event") {
      if (t.eventKind === "hp_fork") t.grantsFlags = ["debt_bound"];
      if (t.eventKind === "paradox") t.grantsFlags = ["mana_fracture"];
      if (t.eventKind === "mana_fork") t.grantsFlags = ["mirror_bound"];
    }
    if (t.floor >= 12) t.requiredFlags.push("debt_bound");
    if (t.category === "delayed" && t.floor >= 5)
      t.requiredFlags.push("debt_bound");
    if (t.category === "memory")
      t.requiredFlags.push("memory_" + t.memoryFloor);
    if (
      t.floorStep === lengths[t.floor - 1] - 1 &&
      (t.floor === 1 || t.floor === 8)
    )
      t.grantsFlags.push("memory_" + t.floor);
    t.requiredFlags = [...new Set(t.requiredFlags)];
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
    t.spellLocked =
      p.mechanic === "reflection" &&
      t.category === "class" &&
      t.expectedAction !== "skill";
  }
  let hp = finalHp;
  for (let i = n - 1; i >= 0; i--) {
    const t = slots[i];
    hp -= t.hpDelta;
    t.hpBefore = hp;
  }
  if (hp !== p.maxHp) throw Error("CANDIDATE_HP_CURVE");
  mana = initialMana;
  const used = {},
    templates = [];
  for (const t of slots) {
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
    let damage = 0;
    if (t.expectedAction === "attack")
      damage = Math.floor(
        p.attackDamage *
          (p.mechanic === "rage" && t.hpBefore <= p.maxHp * 0.35 ? 1.5 : 1),
      );
    if (t.expectedAction === "skill")
      damage =
        p.mechanic === "barrage"
          ? Math.floor(p.skillDamage / 3) * (3 - t.shieldCharges)
          : p.skillDamage + (p.mechanic === "dodge" ? 8 : 0);
    t.enemyHpDelta = damage ? -damage : 0;
    t.damage = damage;
    floors[t.floor - 1].hp += damage;
    if (t.type === "event") {
      t.clueTemplate = "event_" + t.eventKind;
      t.clue =
        t.eventKind === "hp_fork"
          ? "Khế ước đầu run sẽ bị thu nợ từ tầng 12. Hồi phục xóa dấu và đóng cửa thu nợ."
          : t.eventKind === "paradox"
            ? "Chuỗi này cần Mana Fracture. Lựa chọn tồn tại đến cuối run."
            : t.eventKind === "mana_fork"
              ? "Gương tầng 14 cần giữ nguyên nhịp combat tầng 8. Nạp đầy MP sẽ đổi nhịp."
              : "Cửa thu nợ chỉ mở khi dấu khế ước đầu run vẫn còn.";
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
        (used[x.template] || 0) < 6 &&
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
    if (t.floor === 1)
      t.clue += " Ghi nhớ chuỗi combat tầng 1 để đảo nhịp ở tầng 12.";
    if (t.floor === 8)
      t.clue += " Ghi nhớ chuỗi combat tầng 8 để đảo nhịp ở tầng 14.";
    used[clue.template] = (used[clue.template] || 0) + 1;
    templates.push(clue.template);
    delete t.forced;
    delete t.blocked;
    delete t.hpBefore;
    delete t.manaBefore;
  }
  const payload = {
    challengeId: challengeId(isoYear, isoWeek, classKey),
    isoYear,
    isoWeek,
    generatorVersion: GENERATOR_VERSION,
    contentVersion,
    classKey,
    seedCommitment: solver.hash(seed),
    name: p.name + " · Perfect Chain",
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
    wrongActionPolicy: "immediate_reset",
    candidateNonce: nonce,
    solutionHash: null,
    difficultyScore: 0,
  };
  let state = solver.initial(payload);
  for (const t of slots) state = solver.apply(payload, state, t.expectedAction);
  if (state.hp !== finalHp || state.mana !== finalMana)
    throw Error("CANDIDATE_FINAL_CURVE");
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
