const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "gamebot-hardcore-"));
process.env.DB_PATH = path.join(temporary, "simulation.sqlite");
const { db } = require("../src/db");
// Only this disposable simulation database trades durability for speed.
db.pragma("journal_mode = MEMORY");
db.pragma("synchronous = OFF");
const fairness = require("../src/services/fairnessService");
const repository = require("../src/services/hardcoreRepository");
const backend = process.env.HARDCORE_SIM_BACKEND || "sqlite";
if (!["sqlite", "memory"].includes(backend)) throw new Error("INVALID_BACKEND");
if (backend === "memory") {
  // Same game service and fairness rolls, without serializing large item ledgers each turn.
  const sessions = new Map();
  const userSessions = new Map();
  const records = new Map();
  const key = (guildId, userId) => `${guildId}:${userId}`;
  repository.getSession = (id) => sessions.get(String(id)) || null;
  repository.getActiveSession = (id, guildId) => {
    const session = sessions.get(String(id));
    return session?.guild_id === String(guildId) ? session : null;
  };
  repository.getByUser = (guildId, userId) =>
    userSessions.get(key(guildId, userId)) || null;
  repository.parseState = (session) => session.simState;
  repository.insertSession = (session, state) => {
    const saved = { ...session, simState: state };
    sessions.set(session.id, saved);
    userSessions.set(key(session.guild_id, session.user_id), saved);
  };
  repository.saveState = (session, state) => {
    sessions.get(session.id).simState = state;
  };
  repository.deleteSession = (id) => {
    const session = sessions.get(String(id));
    if (!session) return 0;
    userSessions.delete(key(session.guild_id, session.user_id));
    sessions.delete(String(id));
    return 1;
  };
  repository.getRecord = (guildId, userId) =>
    records.get(key(guildId, userId)) || null;
  repository.upsertRecord = (guildId, userId, values) => {
    const old = repository.getRecord(guildId, userId) || {
      best_floor: 0,
      runs: 0,
      deaths: 0,
      escapes: 0,
      completions: 0,
    };
    records.set(key(guildId, userId), {
      ...old,
      best_floor: Math.max(old.best_floor, values.bestFloor),
      runs: old.runs + values.runs,
      deaths: old.deaths + values.deaths,
      escapes: old.escapes + values.escapes,
      completions: old.completions + values.completions,
    });
  };
}
const simulationSeed =
  process.env.HARDCORE_SIM_SEED || "survival-holdout-2026-10-02";
let seedKey = "setup";
fairness.createFairness = () => {
  const serverSeed = crypto
    .createHash("sha256")
    .update(`${simulationSeed}:${seedKey}`)
    .digest("hex");
  return {
    algorithm: "HMAC-SHA256",
    serverSeed,
    commit: fairness.commitment(serverSeed),
  };
};
const hardcore = require("../src/services/hardcoreService");
const engine = require("../src/services/hardcoreEngine");
const { getAccount } = require("../src/services/economyService");
const { createFairness } = require("../src/services/fairnessService");
const runs = Math.max(10, Math.min(100_000, Number(process.argv[2]) || 100));
const targetFloor = Math.max(1, Math.min(999, Number(process.argv[3]) || 999));
const maxTurns = Math.max(
  100,
  Math.min(100_000, Number(process.argv[4]) || 40_000),
);
const selectedClass = process.argv[5] || "all";
const rematches = Math.max(0, Math.min(1000, Number(process.argv[6]) || 0));
const policy = process.env.HARDCORE_SIM_POLICY || "balanced";
const revealedChestAction = process.env.HARDCORE_SIM_REVEALED_CHEST || "sell";
if (!["sell", "leave"].includes(revealedChestAction))
  throw new Error("INVALID_CHEST_POLICY");
const bestPolicies = Object.freeze({
  amazon: "balanced",
  barbarian: "balanced",
  assassin: "attack2",
  sorceress: "balanced",
  druid: "adaptive",
  necromancer: "adaptive",
  paladin: "adaptive",
});
const stake = Math.max(
  10,
  Math.min(100_000, Number(process.env.HARDCORE_SIM_STAKE) || 100_000),
);
if (
  ![
    "attack",
    "balanced",
    "health",
    "luck",
    "adaptive",
    "health2",
    "attack2",
    "best",
  ].includes(policy)
)
  throw new Error("INVALID_POLICY");
const classesToRun =
  selectedClass === "all"
    ? Object.keys(hardcore.CLASSES)
    : selectedClass.split(",");
if (classesToRun.some((classKey) => !Object.hasOwn(hardcore.CLASSES, classKey)))
  throw new Error("INVALID_CLASS");

function actionFor(state, strategy = policy) {
  // Decisions use public stats and revealed encounters, never saved hidden results.
  if (state.phase === "upgrade") {
    const checkpoint = state.cleared / 5;
    if (strategy === "adaptive")
      return (state.damageMin + state.damageMax) / 2 < state.maxHp / 6
        ? "upgrade_attack"
        : "upgrade_hp";
    if (strategy === "health2")
      return checkpoint % 3 === 0 ? "upgrade_attack" : "upgrade_hp";
    if (strategy === "attack2")
      return checkpoint % 3 === 0 ? "upgrade_hp" : "upgrade_attack";
    if (strategy === "luck" && state.luck < 35 && checkpoint % 3 === 0)
      return "upgrade_luck";
    const hpEvery = strategy === "health" ? 1 : strategy === "attack" ? 5 : 2;
    return checkpoint % hpEvery === 0 ? "upgrade_hp" : "upgrade_attack";
  }
  if (state.phase === "summit") return "retreat";
  const encounter = state.encounter;
  if (encounter.type === "combat") {
    const attack = (state.damageMin + state.damageMax) / 2;
    const hit = engine.hitChance(state.accuracy, encounter.evasion);
    const crit = engine.clamp(
      state.critChance - (encounter.critResistance || 0),
      0,
      0.75,
    );
    const reduction = encounter.mechanic === "deimoss" ? 0.75 : 1;
    const bonus = ["boss", "final_boss"].includes(encounter.rank)
      ? state.bossDamage || 0
      : ["elite", "ancient_mimic"].includes(encounter.rank)
        ? state.eliteDamage || 0
        : 0;
    const normalDamage =
      engine.physicalAfterDefense(attack, encounter.defense, state.floor) *
      hit *
      (1 + crit * ((state.critDamage || 1.75) - 1)) *
      reduction *
      (1 + bonus);
    const immune =
      encounter.mechanic === "riftwalker" &&
      ((encounter.incomingAttacks || 0) + 1) % 3 === 1;
    const skillReady =
      state.energy >= 2 ||
      (state.classKey === "sorceress" && engine.classShrineActive(state));
    const rawCounter =
      encounter.damageMax *
      (encounter.mechanic === "butcher"
        ? 1 + Math.min(5, (encounter.attacks || 0) + 1) * 0.08
        : 1) *
      (encounter.hp <= encounter.maxHp * 0.5
        ? 1 + (state.modifiers?.bloodlust || 0) * 0.08
        : 1);
    const magic = encounter.nextDamageType === "magic";
    const worstCounter =
      (magic
        ? engine.magicAfterResistance(
            rawCounter,
            state.resistance - (state.modifiers?.cursed_ground || 0) * 4,
          )
        : engine.physicalAfterDefense(
            rawCounter * (encounter.critDamage || 1.5),
            state.defense,
            state.floor,
          )) *
      (1 + (state.damageTaken || 0));
    const healing = Math.max(
      20,
      Math.floor(
        state.maxHp * engine.clamp(0.35 + (state.potionPower || 0), 0.1, 0.75),
      ),
    );
    const turns = Math.min(
      8,
      Math.ceil(encounter.hp / Math.max(1, normalDamage)),
    );
    const protectedSkill =
      skillReady && ["assassin", "necromancer"].includes(state.classKey);
    const needHeal =
      state.hp < Math.max(worstCounter * 1.6, state.maxHp * 0.32) ||
      (state.potions >= 4 && state.hp < state.maxHp * 0.6) ||
      state.hp < worstCounter * Math.min(3, turns);
    if (
      state.potions > 0 &&
      needHeal &&
      state.maxHp - state.hp >= healing * 0.75 &&
      !protectedSkill &&
      !(state.classKey === "druid" && skillReady && state.hp > worstCounter)
    )
      return "potion";
    // Defending does not advance Riftwalker's incoming-attack counter.
    if (immune) return protectedSkill ? "skill" : "attack";
    if (
      skillReady &&
      (protectedSkill ||
        encounter.hp > normalDamage * 0.8 ||
        state.hp < worstCounter * 2 ||
        (state.classKey === "druid" && state.hp < state.maxHp * 0.9))
    )
      return "skill";
    if (
      state.energy === 1 &&
      (state.modifiers?.soul_drain || 0) === 0 &&
      turns > 2 &&
      ["assassin", "necromancer", "paladin"].includes(state.classKey)
    )
      return "defend";
    return "attack";
  }
  if (encounter.type === "chest")
    return encounter.revealed
      ? revealedChestAction
      : encounter.inspected
        ? "open"
        : "inspect";
  if (encounter.type === "shrine") return "ignore";
  if (encounter.type === "rngesus")
    return state.escapeTokens > 0 ? "flee" : "bribe";
  if (encounter.type === "surprise") {
    const paid = (action, rate) =>
      hardcore.potentialPayout(state) > 0 &&
      Math.ceil(hardcore.potentialPayout(state) * rate) <=
        hardcore.potentialPayout(state)
        ? action
        : "ignore";
    switch (encounter.kind) {
      case "healer":
        return "event_accept";
      case "goblin":
        return "event_catch";
      case "blacksmith": {
        const target = hardcore.forgeTarget(state);
        return target &&
          (target.rarity !== "cursed" ||
            target.cleansedLevels >= target.level) &&
          !engine.itemCurse(target.definition).floorHpLoss
          ? paid("event_forge", 0.12)
          : "ignore";
      }
      case "purifier":
        return hardcore.curseTarget(state)
          ? paid("event_cleanse", 0.2)
          : "ignore";
      case "sacrifice":
        return paid("event_gold", 0.1);
      case "gambler":
        return "ignore";
      case "adventurer":
        return "event_rob";
      case "fountain":
        return state.hp < state.maxHp * 0.5 ? "event_drink" : "ignore";
      case "horadric":
        return "ignore";
      case "merchant": {
        const offers = encounter.offers;
        const choice =
          state.hp < state.maxHp * 0.5 && offers.includes("heal")
            ? "heal"
            : state.potions < 3 && offers.includes("potion")
              ? "potion"
              : offers.includes("item")
                ? "item"
                : offers.includes("luck") && state.luck < 60
                  ? "luck"
                  : !state.escapeTokens && offers.includes("ticket")
                    ? "ticket"
                    : null;
        return choice
          ? paid(`event_buy_${choice}`, engine.MERCHANT_OFFERS[choice].rate)
          : "ignore";
      }
      case "mirror":
        return state.hp > state.maxHp * 0.45 && state.floor < 950
          ? "event_mirror_damage"
          : "event_mirror_guard";
      case "treasure_room":
        return state.hp > state.maxHp * 0.65 ? "event_chest_red" : "ignore";
      case "contract":
        return state.potions >= 3 && state.hp > state.maxHp * 0.75
          ? "event_contract_potion"
          : "event_contract_defend";
      case "class_shrine":
        return "event_bless";
      case "doors":
        return state.hp < state.maxHp * 0.65 ? "event_door_light" : "ignore";
      default:
        return "ignore";
    }
  }
  if (encounter.type === "blacksmith" || encounter.type === "cleanse") {
    const target =
      encounter.type === "blacksmith"
        ? hardcore.forgeTarget(state)
        : hardcore.curseTarget(state);
    return target &&
      (encounter.type !== "blacksmith" || target.rarity !== "cursed") &&
      hardcore.potentialPayout(state) >=
        hardcore.serviceCost(state, encounter.type)
      ? encounter.type === "blacksmith"
        ? "forge"
        : "cleanse"
      : "ignore";
  }
  return "continue";
}

const report = {};
for (const classKey of classesToRun) {
  const classPolicy = policy === "best" ? bestPolicies[classKey] : policy;
  const floors = [];
  const finalStates = [];
  const deathFloors = {};
  let timeouts = 0;
  for (let i = 0; i < runs; i += 1) {
    const userId = `${classKey}-${i}`;
    seedKey = `${classKey}:${i}`;
    getAccount("simulation", userId);
    db.prepare(
      "UPDATE economy_accounts SET balance=? WHERE guild_id=? AND user_id=?",
    ).run(1_000_000, "simulation", userId);
    const started = hardcore.startHardcore({
      guildId: "simulation",
      userId,
      channelId: "c",
      stake,
      classKey,
    });
    let state = started.state;
    let captured = false;
    for (
      let turn = 0;
      turn < maxTurns && state.cleared < targetFloor;
      turn += 1
    ) {
      if (
        !captured &&
        state.floor === 999 &&
        state.encounter.rank === "final_boss"
      ) {
        finalStates.push(structuredClone(state));
        captured = true;
      }
      const played = hardcore.playHardcore({
        sessionId: started.session.id,
        userId,
        expectedTurn: state.turn,
        action: actionFor(state, classPolicy),
      });
      state = played.state;
      if (played.settled) break;
    }
    floors.push(
      state.finalBossDefeated && state.hp > 0
        ? 999
        : Math.min(998, state.cleared),
    );
    if (state.hp <= 0)
      deathFloors[state.floor] = (deathFloors[state.floor] || 0) + 1;
    if (hardcore.getHardcoreByUser("simulation", userId)) {
      if (state.cleared < targetFloor) timeouts += 1;
      hardcore.forceEndHardcoreSession(
        started.session.id,
        "simulation",
        "simulation",
        { forfeit: true },
      );
    }
    if ((i + 1) % 100 === 0)
      console.error(
        `${classPolicy}/${classKey}: ${i + 1}/${runs} runs, ${floors.filter((floor) => floor >= 999).length} wins`,
      );
  }
  let finalAttempts = 0;
  let finalWins = 0;
  for (const snapshot of finalStates) {
    for (let attempt = 0; attempt < rematches; attempt += 1) {
      const userId = `${classKey}-final-${finalAttempts++}`;
      seedKey = `${classKey}:rematch:${finalAttempts}`;
      getAccount("simulation", userId);
      db.prepare(
        "UPDATE economy_accounts SET balance=? WHERE guild_id=? AND user_id=?",
      ).run(1_000_000, "simulation", userId);
      const { session } = hardcore.startHardcore({
        guildId: "simulation",
        userId,
        channelId: "c",
        stake,
        classKey,
      });
      let state = {
        ...structuredClone(snapshot),
        fair: createFairness(),
        fairCounter: 0,
        turn: 0,
      };
      repository.saveState(session, state);
      for (let turn = 0; turn < maxTurns && state.cleared < 999; turn += 1) {
        const played = hardcore.playHardcore({
          sessionId: session.id,
          userId,
          expectedTurn: state.turn,
          action: actionFor(state, classPolicy),
        });
        state = played.state;
        if (played.settled) break;
      }
      if (state.finalBossDefeated) finalWins += 1;
      if (hardcore.getHardcoreByUser("simulation", userId))
        hardcore.forceEndHardcoreSession(
          session.id,
          "simulation",
          "simulation",
          { forfeit: true },
        );
    }
  }
  const sorted = [...floors].sort((a, b) => a - b);
  report[classKey] = {
    runs,
    policy: classPolicy,
    revealedChestAction,
    backend,
    simulationSeed,
    stake,
    completedPercent: +(
      (100 * floors.filter((floor) => floor >= 999).length) /
      runs
    ).toFixed(4),
    mostFrequentDeathFloors: Object.entries(deathFloors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([floor, count]) => ({ floor: Number(floor), count })),
    zeroWinsUpper95Percent: floors.every((floor) => floor < 999)
      ? +(100 * (1 - 0.05 ** (1 / runs))).toFixed(4)
      : null,
    targetFloor,
    maxTurns,
    timeouts,
    equipmentSource: "src/hardcore/item.js",
    passedFloor10: floors.filter((floor) => floor >= 10).length,
    passedFloor50: floors.filter((floor) => floor >= 50).length,
    passedFloor100: floors.filter((floor) => floor >= 100).length,
    reachedFinalBoss: finalStates.length,
    completed999: floors.filter((floor) => floor >= 999).length,
    finalAttempts,
    finalWins,
    finalStateMeans: finalStates.length
      ? Object.fromEntries(
          ["maxHp", "damageMax", "defense", "potions", "resistance"].map(
            (key) => [
              key,
              Math.round(
                finalStates.reduce((total, state) => total + state[key], 0) /
                  finalStates.length,
              ),
            ],
          ),
        )
      : null,
    finalBossMeans: finalStates.length
      ? Object.fromEntries(
          ["maxHp", "damageMax", "defense"].map((key) => [
            key,
            Math.round(
              finalStates.reduce(
                (total, state) => total + state.encounter[key],
                0,
              ) / finalStates.length,
            ),
          ]),
        )
      : null,
    estimatedCompletionPercent: finalAttempts
      ? +(
          (((100 * finalStates.length) / runs) * finalWins) /
          finalAttempts
        ).toFixed(4)
      : null,
    maxFloor: sorted.at(-1),
    medianFloor: sorted[Math.floor(runs / 2)],
    meanFloor: +(floors.reduce((sum, floor) => sum + floor, 0) / runs).toFixed(
      2,
    ),
  };
  console.error(
    `${policy}/${classKey}: ${runs} runs completed, ${finalStates.length} reached Deimoss, ${floors.filter((floor) => floor >= 999).length} won`,
  );
}
console.log(JSON.stringify(report, null, 2));
db.close();
if (
  path.dirname(temporary) === path.resolve(os.tmpdir()) &&
  path.basename(temporary).startsWith("gamebot-hardcore-")
)
  fs.rmSync(temporary, { recursive: true, force: true });
