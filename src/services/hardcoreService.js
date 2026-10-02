const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const { MessageFlags } = require("discord.js");
const { formatCoins } = require("../utils/economy");
const { db } = require("../db");
const {
  spendCoins,
  settleReservedGame,
  creditCoins,
  getAccount,
} = require("./economyService");
const { getGameBetLimit } = require("./gameBetLimitService");
const { getGameChannel } = require("./gameChannelService");
const { requireGameChannel } = require("../utils/gameChannel");
const { createFairness, fairInt } = require("./fairnessService");
const hardcoreRepository = require("./hardcoreRepository");
const { addDiamonds } = require("./playerLevelService");
const hardcoreView = require("./hardcoreView");
const {
  rarityLabel,
  normalizeEquipment,
  effectText,
} = require("./hardcoreEquipment");
const { chaosLabel } = hardcoreView;
const {
  clamp,
  hitChance,
  defenseReduction,
  physicalAfterDefense,
  magicAfterResistance,
  enemyScale,
  baseMultiplier,
  potentialPayout,
  runDiamondReward,
  REGIONS,
  RIFT_MODIFIERS,
  regionForFloor,
  checkpointGrowth,
  BOSS_MECHANICS,
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
  luckyBreakChance,
  goblinCatchChance,
  itemEffects,
  itemCurse,
  classShrineActive,
  payoutReductionCost,
  SURPRISE_EVENTS,
  MERCHANT_OFFERS,
} = require("./hardcoreEngine");
const { ITEMS } = require("../hardcore/item");

const MIN_BET = 10;
const MAX_BET = 100_000;
const MAX_PAYOUT = 10_000_000;
const MAX_FLOOR = 999;
const COMPLETION_FLOOR = 100;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const LUCKY_BREAK_LOG = "🍀 Lucky Break! Bạn tránh được hậu quả.";

const CLASSES = Object.freeze({
  amazon: {
    name: "Amazon",
    emoji: "🏹",
    hp: 100,
    damageMin: 16,
    damageMax: 23,
    defense: 5,
    accuracy: 92,
    evasion: 14,
    critChance: 0.14,
    resistance: 5,
    energy: 3,
    skill: "Barrage",
  },
  barbarian: {
    name: "Barbarian",
    emoji: "🪓",
    hp: 120,
    damageMin: 15,
    damageMax: 21,
    defense: 8,
    accuracy: 80,
    evasion: 8,
    critChance: 0.1,
    resistance: 5,
    energy: 3,
    skill: "Iron Will",
  },
  assassin: {
    name: "Assassin",
    emoji: "🗡️",
    hp: 95,
    damageMin: 14,
    damageMax: 20,
    defense: 5,
    accuracy: 90,
    evasion: 18,
    critChance: 0.18,
    resistance: 5,
    energy: 3,
    skill: "Shadow Step",
  },
  sorceress: {
    name: "Sorceress",
    emoji: "🔮",
    hp: 100,
    damageMin: 18,
    damageMax: 25,
    defense: 5,
    accuracy: 85,
    evasion: 12,
    critChance: 0.12,
    resistance: 15,
    energy: 4,
    skill: "Arcane Burst",
  },
  druid: {
    name: "Druid",
    emoji: "🌿",
    hp: 110,
    damageMin: 15,
    damageMax: 22,
    defense: 7,
    accuracy: 82,
    evasion: 10,
    critChance: 0.1,
    resistance: 10,
    energy: 3,
    skill: "Wild Regeneration",
  },
  necromancer: {
    name: "Necromancer",
    emoji: "💀",
    hp: 100,
    damageMin: 15,
    damageMax: 21,
    defense: 6,
    accuracy: 84,
    evasion: 10,
    critChance: 0.1,
    resistance: 12,
    energy: 4,
    skill: "Totem Ward",
  },
  paladin: {
    name: "Paladin",
    emoji: "🛡️",
    hp: 115,
    damageMin: 15,
    damageMax: 22,
    defense: 9,
    accuracy: 84,
    evasion: 7,
    critChance: 0.09,
    resistance: 15,
    energy: 3,
    skill: "Divine Shield",
  },
});

const ENEMY_NAMES = [
  "Cave Rat",
  "Wild Boar",
  "Moon Panther",
  "Steel Drone",
  "Dark Cultist",
  "Lost Soul",
  "Storm Shaman",
  "Stone Golem",
  "Void Spawn",
  "Annihilator",
];
const BOSS_NAMES = [
  "The Butcher",
  "Ascendant Riftwalker",
  "Assur",
  "Lucion",
  "Deimoss the Fleshweaver",
];
const FALLBACK_ITEMS = Object.freeze({
  common: [
    { name: "Rusted Edge", attack: 2, text: "+2 ATK" },
    { name: "Dented Plate", defense: 2, text: "+2 DEF" },
    { name: "Red Potion Belt", potions: 1, text: "+1 bình máu" },
    { name: "Rabbit Foot", luck: 1, text: "+1 LUCK" },
  ],
  rare: [
    {
      name: "Hunter’s Fang",
      attack: 4,
      critChance: 0.04,
      text: "+4 ATK, +4% Crit",
    },
    {
      name: "Runed Carapace",
      defense: 5,
      resistance: 5,
      text: "+5 DEF, +5 RES",
    },
    {
      name: "Heart of the Wild",
      maxHp: 22,
      heal: 22,
      text: "+22 HP tối đa và hiện tại",
    },
    { name: "Lucky Coin", luck: 3, text: "+3 LUCK" },
  ],
  legendary: [
    {
      name: "One More Hit",
      escapeTokens: 1,
      maxHp: 15,
      heal: 15,
      text: "+15 HP, nhận 1 Vé Thoát Hiểm",
    },
    {
      name: "The Last Bad Decision",
      attack: 9,
      critChance: 0.08,
      maxHp: -15,
      text: "+9 ATK, +8% Crit, −15 HP tối đa",
    },
    {
      name: "Warden’s Bulwark",
      defense: 10,
      resistance: 12,
      text: "+10 DEF, +12 RES",
    },
    {
      name: "Eye of RNGesus",
      luck: 7,
      attack: 3,
      text: "+7 LUCK, +3 ATK",
    },
  ],
  cursed: [
    {
      name: "Glass Cannon",
      attack: 14,
      defenseSet: 0,
      bonusPenalty: 0.15,
      text: "+14 ATK, DEF về 0, payout −15%",
    },
    {
      name: "Schrödinger’s Armor",
      defense: 12,
      maxHp: -20,
      bonusPenalty: 0.15,
      text: "+12 DEF, −20 HP tối đa, payout −15%",
    },
    {
      name: "Goblin’s Debt",
      luck: 10,
      bonusPenalty: 0.15,
      text: "+10 LUCK, mất 15% payout hiện tại",
    },
  ],
});

const fairStateContext = new AsyncLocalStorage();
function nextFair(maximum, context) {
  const state = fairStateContext.getStore();
  if (!state?.fair?.serverSeed) return null;
  const value = fairInt(
    state.fair.serverSeed,
    `hardcore:${context}`,
    state.fairCounter || 0,
    maximum,
  );
  state.fairCounter = (state.fairCounter || 0) + 1;
  return value;
}
function randomFloat() {
  const value = nextFair(1_000_000, "float");
  return (value ?? crypto.randomInt(1_000_000)) / 1_000_000;
}
function randomInt(min, max) {
  const value = nextFair(max - min + 1, "int");
  return min + (value ?? crypto.randomInt(max - min + 1));
}
function pick(items) {
  const value = nextFair(items.length, "pick");
  return items[value ?? crypto.randomInt(items.length)];
}

function resolvePhysicalAttack(attacker, defender, level, options = {}) {
  const hitRoll = options.hitRoll ?? randomFloat();
  if (hitRoll >= hitChance(attacker.accuracy, defender.evasion))
    return { hit: false, crit: false, raw: 0, damage: 0 };
  const base =
    options.baseDamage ?? randomInt(attacker.damageMin, attacker.damageMax);
  const multiplier = options.multiplier ?? 1;
  const critRoll = options.critRoll ?? randomFloat();
  const crit =
    critRoll <
    clamp((attacker.critChance || 0) - (defender.critResistance || 0), 0, 0.75);
  const raw = Math.floor(
    base * multiplier * (crit ? attacker.critDamage || 1.75 : 1),
  );
  return {
    hit: true,
    crit,
    raw,
    damage: physicalAfterDefense(raw, defender.defense, level),
  };
}

function makeEnemy(floor, rank = "normal", forcedName = null, modifiers = {}) {
  const rankStats = {
    normal: [1, 1, 1],
    champion: [1.4, 1.15, 1.4],
    elite: [2, 1.35, 2],
    boss: [
      2.6 + (Math.max(0, Math.floor(floor / 50) - 1) % 5) * 0.075,
      1.1 + (Math.max(0, Math.floor(floor / 50) - 1) % 5) * 0.0375,
      4,
    ],
    final_boss: [7.2, 1.05, 10],
    mimic: [1.7, 1.25, 1.8],
    ancient_mimic: [2.8, 1.5, 3],
  }[rank];
  const scale = enemyScale(floor);
  const boss = ["boss", "final_boss"].includes(rank);
  const name =
    forcedName ||
    (rank === "final_boss"
      ? BOSS_NAMES[4]
      : boss
        ? BOSS_NAMES[(Math.floor(floor / 50) - 1) % BOSS_NAMES.length]
        : rank.includes("mimic")
          ? rank === "ancient_mimic"
            ? "Ancient Mimic"
            : "Mimic"
          : pick(ENEMY_NAMES));
  const maxHp = Math.min(
    1_000_000_000_000,
    Math.max(
      10,
      Math.floor(
        28 * scale.hp * rankStats[0] * (1 + (modifiers.fortified || 0) * 0.1),
      ),
    ),
  );
  const damageFactor = 1 + (modifiers.elemental_dominion || 0) * 0.04;
  const damageMin = Math.min(
    1_000_000_000_000,
    Math.max(2, Math.floor(5 * scale.damage * rankStats[1] * damageFactor)),
  );
  const damageMax = Math.min(
    1_000_000_000_000,
    Math.max(
      damageMin + 1,
      Math.floor(9 * scale.damage * rankStats[1] * damageFactor),
    ),
  );
  const mechanic = boss ? BOSS_MECHANICS[name] : null;
  const damageType = enemyDamageType({ name, rank, mechanic });
  const enemy = {
    type: "combat",
    rank,
    name,
    hp: maxHp,
    maxHp,
    damageMin,
    damageMax,
    defense: Math.floor(
      Math.floor(4 + floor * 1.8 * (boss ? 1.25 : 1)) *
        1.1 ** (modifiers.stone_skin || 0),
    ),
    accuracy: 70 + floor * 3 + (modifiers.swift_horror || 0) * 3,
    evasion:
      4 +
      Math.floor(floor / 12) +
      (modifiers.swift_horror || 0) +
      (name === "Assur" ? 18 : 0),
    critChance: (boss ? 0.1 : 0.05) + (name === "Assur" ? 0.12 : 0),
    critDamage: 1.5,
    critResistance: boss ? 0.08 : 0,
    resistance: Math.min(60, Math.floor(floor * 0.8)),
    damageType,
    magicChance:
      damageType === "magic"
        ? 1
        : damageType === "physical"
          ? 0
          : Math.min(
              0.75,
              (rank === "elite" || rank === "ancient_mimic" ? 0.2 : 0.05) +
                (modifiers.elemental_dominion || 0) * 0.04,
            ),
    rewardMultiplier: rankStats[2],
    attacks: 0,
    incomingAttacks: 0,
    mechanic,
  };
  rollEnemyIntent(enemy);
  return enemy;
}
function rollEnemyIntent(enemy) {
  const type = enemyDamageType(enemy);
  enemy.nextDamageType =
    type === "mixed"
      ? randomFloat() < enemy.magicChance
        ? "magic"
        : "physical"
      : type;
}

function legendaryChance(state, treasure = false) {
  const unstable = state.modifiers?.unstable_rift || 0;
  return Math.min(
    treasure ? 0.7 : 0.35,
    treasure
      ? 0.35 + unstable * 0.05
      : 0.1 +
          Math.max(0, (state.pityLegendary || 0) - 9) * 0.02 +
          (state.luck || 0) * 0.002 +
          (state.legendaryFind || 0),
  );
}
function chooseRarity(state) {
  const chance = legendaryChance(state);
  const roll = randomFloat();
  if (roll < chance) return "legendary";
  if (roll < chance + 0.03) return "cursed";
  if (state.pityRare >= 5 || roll < chance + 0.25) return "rare";
  if (roll < chance + 0.65) return "common";
  if (roll < 0.95) return "empty";
  return "fake_legendary";
}

function makeChest(state, treasure = false) {
  const unstable = state.modifiers?.unstable_rift || 0;
  const mimicRoll = randomFloat();
  const kind =
    state.pityRare < 5 && mimicRoll < Math.min(0.08, 0.03 + unstable * 0.01)
      ? "ancient_mimic"
      : state.pityRare < 5 &&
          mimicRoll <
            Math.min(
              0.6,
              Math.min(0.3, 0.15 + unstable * 0.03) + (state.mimicChance || 0),
            )
        ? "mimic"
        : treasure
          ? randomFloat() < legendaryChance(state, true)
            ? "legendary"
            : "rare"
          : chooseRarity(state);
  const rarity = ITEMS[kind] ? kind : null;
  return {
    type: "chest",
    kind,
    rarity,
    item: rarity ? pick(ITEMS[rarity]) : null,
    inspected: false,
    revealed: false,
    detectionSuccess:
      randomFloat() <
      Math.min(0.95, 0.25 + state.luck * 0.03 + (state.mimicDetection || 0)),
  };
}

function rngesusChance(floor) {
  if (floor < 5) return 0;
  if (floor < 10) return 0.003;
  if (floor < 20) return 0.006;
  return 0.01;
}

function rollRngesus(state, rolls = {}) {
  const base = rngesusChance(state.floor);
  if (!base) {
    state.lastChaosChance = 0;
    state.lastChaosSpike = false;
    return false;
  }
  const volatilityRoll = rolls.volatilityRoll ?? randomFloat();
  const spikeRoll = rolls.spikeRoll ?? randomFloat();
  const severityRoll = rolls.severityRoll ?? randomFloat();
  const encounterRoll = rolls.encounterRoll ?? randomFloat();
  const volatility = 0.25 + volatilityRoll * 2.75;
  const heat = Math.min(0.025, (state.rngesusDry || 0) * 0.0005);
  const spike = spikeRoll < 0.025 ? 0.04 + severityRoll * 0.06 : 0;
  const chance = clamp(base * volatility + heat + spike, 0, 0.12);
  const hit = encounterRoll < chance;
  state.lastChaosChance = chance;
  state.lastChaosSpike = spike > 0;
  state.rngesusDry = hit ? 0 : (state.rngesusDry || 0) + 1;
  return hit;
}

function makeWrongPortal(state, rolls = {}) {
  const good = (rolls.goodRoll ?? randomFloat()) < 0.5;
  const effects = good
    ? ["healing_sanctuary", "treasure_vault", "rift_blessing"]
    : [
        "blood_rift",
        ...(state.energy > 0 ? ["mana_void"] : []),
        ...(state.potions > 0 ? ["shattered_supplies"] : []),
        "payout_corruption",
        "dimensional_curse",
      ];
  const effectRoll = rolls.effectRoll ?? randomFloat();
  return {
    type: "trap",
    kind: "wrong_portal",
    portal: {
      good,
      goodChance: 0.5,
      effect:
        effects[
          Math.min(effects.length - 1, Math.floor(effectRoll * effects.length))
        ],
    },
    enemy: good
      ? null
      : makeEnemy(state.floor, "elite", "Rift Ambusher", state.modifiers),
    luckyBreakRoll: good ? null : (rolls.luckyBreakRoll ?? randomFloat()),
  };
}
function makeSurprise(state, forcedKind = null) {
  const pool = Object.keys(SURPRISE_EVENTS).filter(
    (key) =>
      (key !== "blacksmith" ||
        (forgeTarget(state) && potentialPayout(state) > 0)) &&
      (key !== "purifier" ||
        (curseTarget(state) && potentialPayout(state) > 0)) &&
      (key !== "horadric" || forgeTarget(state)) &&
      (key !== "contract" ||
        (!state.contract && state.floor <= MAX_FLOOR - 3)) &&
      (!["merchant", "gambler"].includes(key) || potentialPayout(state) > 0) &&
      (key !== "sacrifice" ||
        state.hp > Math.max(1, Math.floor(state.maxHp * 0.2)) ||
        potentialPayout(state) > 0) &&
      (key !== "healer" || state.hp < state.maxHp || state.potions < 5),
  );
  const kind = forcedKind || pick(pool);
  const event = { type: "surprise", kind };
  if (kind === "goblin") event.successRoll = randomFloat();
  if (kind === "gambler") event.win = randomFloat() < 0.5;
  if (kind === "adventurer") {
    event.adventurerVersion = 3;
    const rarity = randomFloat() < 0.8 ? "common" : "rare";
    event.rescueItem = pick(ITEMS[rarity]);
    event.robItem = randomFloat() < 0.25 ? pick(ITEMS.legendary) : null;
  }
  if (kind === "fountain") {
    const roll = randomFloat();
    event.outcome = roll < 0.6 ? "heal" : roll < 0.85 ? "hp" : "mimic";
    if (event.outcome === "mimic")
      event.enemy = makeEnemy(
        state.floor,
        "mimic",
        "Blood Mimic",
        state.modifiers,
      );
  }
  if (kind === "horadric") {
    const target = forgeTarget(state);
    event.targetName = target.name;
    event.targetRarity = target.rarity;
    event.targetBase = target.definition?.base || "";
  }
  if (kind === "merchant") {
    const offers = Object.keys(MERCHANT_OFFERS);
    event.offers = [];
    while (event.offers.length < 3)
      event.offers.push(offers.splice(randomInt(0, offers.length - 1), 1)[0]);
    event.item = pick(ITEMS.rare);
  }
  if (kind === "mirror") {
    event.lucky = randomFloat() < 0.2;
    event.enemy = {
      ...makeEnemy(state.floor, "elite", "Mirror Clone", state.modifiers),
      hp: state.maxHp,
      maxHp: state.maxHp,
      damageMin: state.damageMin,
      damageMax: state.damageMax,
      defense: state.defense,
      accuracy: state.accuracy,
      evasion: state.evasion,
      resistance: state.resistance,
      critChance: state.critChance,
      damageType: "physical",
      nextDamageType: "physical",
      magicChance: 0,
    };
  }
  if (kind === "treasure_room") {
    event.mimicChest = pick(["red", "blue", "gold"]);
    event.enemy = makeEnemy(
      state.floor,
      "mimic",
      "Treasure Room Mimic",
      state.modifiers,
    );
  }
  if (kind === "contract") event.item = pick(ITEMS.legendary);
  if (kind === "doors") {
    event.doors = {
      light: randomFloat() < 0.7,
      gold: randomFloat() < 0.7,
      dark: randomFloat() < 0.6,
    };
    event.item = pick(ITEMS.legendary);
    event.mimic = makeEnemy(
      state.floor,
      "mimic",
      "Golden Door Mimic",
      state.modifiers,
    );
    event.boss = makeEnemy(
      state.floor,
      "boss",
      pick(BOSS_NAMES),
      state.modifiers,
    );
    event.boss.name = `Premature Rift Boss · ${event.boss.name}`;
  }
  return event;
}

function generateEncounter(state) {
  if (state.floor === MAX_FLOOR)
    return makeEnemy(state.floor, "final_boss", null, state.modifiers);
  if (state.floor % 50 === 0)
    return makeEnemy(state.floor, "boss", null, state.modifiers);
  if (rollRngesus(state)) {
    const fleeRoll = randomFloat();
    return {
      type: "rngesus",
      name: "RNGesus",
      fleeRoll,
      fleeSuccess: fleeRoll < 0.75,
      fleeChance: 0.75,
      prayerSuccess: randomFloat() < 0.3,
      prayerChance: 0.3,
      prayerRarity: randomFloat() < 0.85 ? "legendary" : "cursed",
      prayerItemRoll: randomFloat(),
      chaosChance: state.lastChaosChance,
      chaosSpike: state.lastChaosSpike,
    };
  }
  const roll = randomFloat();
  const extraChests = Math.min(
    0.16,
    (state.modifiers?.unstable_rift || 0) * 0.02,
  );
  if (roll < 0.53 - extraChests)
    return makeEnemy(state.floor, "normal", null, state.modifiers);
  if (roll < 0.65 - extraChests)
    return makeEnemy(state.floor, "elite", null, state.modifiers);
  if (roll < 0.75 - extraChests / 2) return makeChest(state);
  if (roll < 0.83 - extraChests / 2)
    return {
      type: "shrine",
      kind: pick([
        "healing",
        "armor",
        "blood",
        "experience",
        "corrupted",
        "fake",
      ]),
    };
  if (roll < 0.88) return makeChest(state, true);
  if (roll < 0.94) {
    const kind = pick(["tax_collector", "potion_thief", "wrong_portal"]);
    return kind === "wrong_portal"
      ? makeWrongPortal(state)
      : { type: "trap", kind, luckyBreakRoll: randomFloat() };
  }
  if (roll < 0.98) return makeSurprise(state);
  return { type: "empty" };
}

function grantEscapeTickets(state, amount) {
  const held = clamp(Math.floor(Number(state.escapeTokens) || 0), 0, 1);
  const received = Math.max(0, Math.floor(Number(amount) || 0));
  state.escapeTokens = Math.min(1, held + received);
  state.lastDiscardedEscapeTokens =
    (state.lastDiscardedEscapeTokens || 0) + Math.max(0, held + received - 1);
}

function applyItem(state, item, rarity = "common") {
  if (!item) return null;
  rarity = item.rarity || rarity;
  state.items = normalizeEquipment(state.items);
  const buff = { ...itemEffects(item) };
  const curse = rarity === "cursed" ? itemCurse(item) : {};
  if (!item.effects && rarity === "cursed")
    for (const key of Object.keys(curse)) delete buff[key];
  const buffDelta = applyEquipmentEffects(state, buff);
  const curseDelta = applyEquipmentEffects(state, curse);
  let equipment = state.items.find(
    (entry) =>
      entry.name === item.name &&
      entry.rarity === rarity &&
      (entry.definition?.base || "") === (item.base || ""),
  );
  if (equipment) {
    equipment.level += 1;
    equipment.text = item.text;
  } else {
    equipment = { name: item.name, rarity, text: item.text, level: 1 };
    state.items.push(equipment);
  }
  equipment.definition = { ...item };
  equipment.levelEffects ||= [];
  equipment.levelEffects.push({
    buff: buffDelta,
    curse: curseDelta,
    curseFactor: curse.bonusPenalty ? 1 - curse.bonusPenalty : 1,
    cleansed: false,
  });
  return equipment;
}
const ITEM_LIMITS = Object.freeze({
  defense: [0, Infinity],
  accuracy: [0, Infinity],
  evasion: [0, Infinity],
  luck: [0, Infinity],
  maxHp: [20, Infinity],
  maxEnergy: [1, Infinity],
  resistance: [-50, 75],
  critChance: [0, 0.75],
  potionPower: [-0.3, 0.5],
  bossDamage: [0, 1],
  eliteDamage: [0, 1],
  mimicDetection: [0, 0.5],
  goblinChance: [0, 0.3],
  legendaryFind: [0, 0.25],
  floorHpLoss: [0, 0.2],
  mimicChance: [0, 0.3],
  damageTaken: [0, 0.5],
});
function applyEquipmentEffects(state, effects) {
  const keys = [
    "damageMin",
    "damageMax",
    "hp",
    "energy",
    ...Object.keys(ITEM_LIMITS),
  ];
  const before = Object.fromEntries(
    keys.map((key) => [key, Number(state[key]) || 0]),
  );
  if (effects.attack) {
    state.damageMin = Math.max(1, state.damageMin + effects.attack);
    state.damageMax = Math.max(
      state.damageMin,
      state.damageMax + effects.attack,
    );
  }
  for (const [key, limits] of Object.entries(ITEM_LIMITS))
    if (effects[key])
      state[key] = +clamp((state[key] || 0) + effects[key], ...limits).toFixed(
        8,
      );
  if (effects.defenseSet !== undefined)
    state.defense = Math.max(0, effects.defenseSet);
  state.hp = Math.min(state.hp, state.maxHp);
  state.energy = Math.min(state.energy, state.maxEnergy);
  if (effects.heal)
    state.hp = Math.min(state.maxHp, Math.max(1, state.hp + effects.heal));
  if (effects.potions)
    state.potions = clamp(state.potions + effects.potions, 0, 5);
  if (effects.escapeTokens) grantEscapeTickets(state, effects.escapeTokens);
  if (effects.bonusPenalty) state.payoutFactor *= 1 - effects.bonusPenalty;
  return Object.fromEntries(
    keys
      .map((key) => [
        key,
        +((Number(state[key]) || 0) - before[key]).toFixed(8),
      ])
      .filter(([, delta]) => delta),
  );
}
function reverseEquipmentDelta(state, delta, restoreHp = false) {
  for (const [key, amount] of Object.entries(delta || {})) {
    if (key === "hp" || key === "energy") continue;
    const limits = ITEM_LIMITS[key] || [1, Infinity];
    state[key] = +clamp((state[key] || 0) - amount, ...limits).toFixed(8);
  }
  state.damageMax = Math.max(state.damageMin, state.damageMax);
  state.hp = Math.min(
    state.maxHp,
    restoreHp ? state.hp - (delta?.hp || 0) : state.hp,
  );
  state.energy = Math.min(
    state.maxEnergy,
    restoreHp ? state.energy - (delta?.energy || 0) : state.energy,
  );
}
function cleanseItem(state, target) {
  const record = target.levelEffects?.find((entry) => !entry.cleansed);
  if (record) {
    reverseEquipmentDelta(state, record.curse, true);
    state.payoutFactor = Math.min(1, state.payoutFactor / record.curseFactor);
    record.cleansed = true;
  } else {
    // Older saved items retain their definitions; no catalog replacement is applied.
    const curse = itemCurse(target.definition);
    const inverse = Object.fromEntries(
      Object.entries(curse)
        .filter(([key]) => !["defenseSet", "bonusPenalty"].includes(key))
        .map(([key, value]) => [key, -value]),
    );
    applyEquipmentEffects(state, inverse);
    if (curse.bonusPenalty)
      state.payoutFactor = Math.min(
        1,
        state.payoutFactor / (1 - curse.bonusPenalty),
      );
  }
  target.cleansedLevels = (target.cleansedLevels || 0) + 1;
}
function grindItem(state, target) {
  const record = target.levelEffects?.pop();
  if (record) {
    if (!record.cleansed) {
      reverseEquipmentDelta(state, record.curse, true);
      state.payoutFactor = Math.min(1, state.payoutFactor / record.curseFactor);
    } else
      target.cleansedLevels = Math.max(0, (target.cleansedLevels || 0) - 1);
    reverseEquipmentDelta(state, record.buff);
  } else {
    if (
      target.rarity === "cursed" &&
      target.level > (target.cleansedLevels || 0)
    )
      cleanseItem(state, target);
    const effects = { ...itemEffects(target.definition) };
    for (const key of [
      "heal",
      "potions",
      "escapeTokens",
      "bonusPenalty",
      "defenseSet",
    ])
      delete effects[key];
    if (!target.definition.effects && target.rarity === "cursed")
      for (const key of Object.keys(itemCurse(target.definition)))
        delete effects[key];
    applyEquipmentEffects(
      state,
      Object.fromEntries(
        Object.entries(effects).map(([key, value]) => [key, -value]),
      ),
    );
    target.cleansedLevels = Math.max(0, (target.cleansedLevels || 0) - 1);
  }
  target.level -= 1;
  if (target.level <= 0)
    state.items = state.items.filter((item) => item !== target);
}

function updatePity(state, rarity) {
  if (["legendary", "cursed"].includes(rarity)) state.pityLegendary = 0;
  else state.pityLegendary += 1;
  if (["rare", "legendary", "cursed"].includes(rarity)) state.pityRare = 0;
  else state.pityRare += 1;
}

function setNextEncounter(state, log) {
  if (state.floor >= MAX_FLOOR && state.cleared >= MAX_FLOOR) {
    state.phase = "summit";
    state.encounter = { type: "summit" };
    state.lastLog = log;
    return;
  }
  state.phase = "encounter";
  state.encounter = generateEncounter(state);
  state.lastLog = log;
}

function completeFloor(state, log, rewardMultiplier = 1) {
  const clearedFloor = state.floor;
  if (clearedFloor === MAX_FLOOR && !state.finalBossDefeated)
    throw new Error("FINAL_BOSS_REQUIRED");
  state.cleared = Math.max(state.cleared, clearedFloor);
  const previousDiamonds = state.runDiamonds || 0;
  state.runDiamonds = runDiamondReward(state);
  if (state.runDiamonds > previousDiamonds)
    log += `\n💎 Kim cương tạm giữ: **${state.runDiamonds.toLocaleString("vi-VN")}**. Rút thưởng mới nhận; tử trận mất toàn bộ.`;
  const frame = { 333: "Bạc", 666: "Vàng", 999: "Kim cương" }[clearedFloor];
  if (frame) log += `\n🏅 Đạt mốc khung hồ sơ **${frame}** (giữ vĩnh viễn).`;
  state.bonus += Math.floor(state.stake * 0.01 * rewardMultiplier);
  state.energy = Math.min(state.maxEnergy, state.energy + 1);
  if (["boss", "final_boss"].includes(state.encounter.rank)) {
    state.bosses += 1;
  }
  if (classShrineActive(state) && state.classKey === "druid") {
    const healed = Math.min(
      state.maxHp - state.hp,
      Math.floor(state.maxHp * 0.05),
    );
    state.hp += healed;
    log += `\n🌿 Class Shrine hồi ${healed} HP.`;
  }
  if (
    state.contract &&
    clearedFloor >= state.contract.from &&
    clearedFloor <= state.contract.until
  ) {
    state.contract.remaining -= 1;
    if (state.contract.remaining <= 0) {
      if (state.contract.kind === "potion") {
        const equipment = applyItem(state, state.contract.item, "legendary");
        log += `\n📜 Hoàn thành hợp đồng: nhận **${equipment.name}** [SSR].`;
      } else if (state.contract.kind === "skill") {
        state.bonus += Math.floor(state.stake * 0.5);
        log += "\n📜 Hoàn thành hợp đồng: bonus +50% cược.";
      } else {
        state.damageMin += 5;
        state.damageMax += 5;
        log += "\n📜 Hoàn thành hợp đồng: +5 ATK.";
      }
      state.contract = null;
    }
  }
  if (clearedFloor % 5 === 0) {
    const growth = checkpointGrowth(clearedFloor);
    state.maxHp += growth.hp;
    state.damageMin += growth.attack;
    state.damageMax += growth.attack;
    state.hp = state.maxHp;
    const previousPotions = state.potions;
    state.potions = Math.min(5, state.potions + 2);
    log += `\n🏕️ Checkpoint: ❤️ MAX HP +${growth.hp}, ⚔️ ATK +${growth.attack}, hồi đầy HP; 🧪 POT ${previousPotions} → ${state.potions} (tối đa 5).`;
  }
  if (
    clearedFloor % 10 === 0 &&
    clearedFloor > (state.lastModifierFloor || 0)
  ) {
    state.modifiers ||= {};
    const all = Object.keys(RIFT_MODIFIERS);
    const missing = all.filter((key) => !state.modifiers[key]);
    const key = pick(missing.length ? missing : all);
    state.modifiers[key] = (state.modifiers[key] || 0) + 1;
    state.lastModifierFloor = clearedFloor;
    log += `\n🌀 Rift: **${RIFT_MODIFIERS[key].name} ×${state.modifiers[key]}**.`;
  }
  if (clearedFloor >= COMPLETION_FLOOR) state.completed = true;
  if (state.floorHpLoss > 0) {
    const lost = Math.max(1, Math.floor(state.maxHp * state.floorHpLoss));
    state.hp = Math.max(0, state.hp - lost);
    log += `\n🩸 Lời nguyền mất ${lost} HP sau tầng.`;
    if (state.hp <= 0) {
      state.lastLog = log;
      return;
    }
  }
  if (state.classShrine && clearedFloor >= state.classShrine.until)
    state.classShrine = null;
  if (clearedFloor >= MAX_FLOOR) {
    state.floor = MAX_FLOOR;
    state.phase = "summit";
    state.encounter = { type: "summit" };
    state.lastLog = log;
    return;
  }
  state.floor = clearedFloor + 1;
  if (clearedFloor % 5 === 0 || clearedFloor === COMPLETION_FLOOR) {
    state.phase = "upgrade";
    state.encounter = { type: "upgrade", milestone: clearedFloor };
    state.lastLog = `${log}\n🎁 Chọn một nâng cấp trước tầng ${state.floor}.`;
    return;
  }
  setNextEncounter(state, log);
}

function recordRun(guildId, userId, state, reason) {
  const death = ["death", "rngesus"].includes(reason) ? 1 : 0;
  const escape = ["cashout", "summit"].includes(reason) ? 1 : 0;
  const completion = state.completed ? 1 : 0;
  hardcoreRepository.upsertRecord(guildId, userId, {
    bestFloor: state.cleared,
    runs: 1,
    deaths: death,
    escapes: escape,
    completions: completion,
  });
}

function getHardcoreRecord(guildId, userId) {
  const record = hardcoreRepository.getRecord(guildId, userId) || {
    guild_id: String(guildId),
    user_id: String(userId),
    best_floor: 0,
    runs: 0,
    deaths: 0,
    escapes: 0,
    completions: 0,
  };
  const run = getHardcoreRun(guildId, userId);
  if (!run) return record;
  return {
    ...record,
    best_floor: Math.max(record.best_floor, run.state.cleared),
    runs: record.runs + 1,
    completions: record.completions + (run.state.completed ? 1 : 0),
  };
}
function getHardcoreTop(guildId, limit = 10) {
  return hardcoreRepository.getTop(guildId, limit);
}

const getSession = hardcoreRepository.getSession;
const getHardcoreByUser = hardcoreRepository.getByUser;
function parseState(session) {
  const state = hardcoreRepository.parseState(session);
  state.escapeTokens = clamp(Math.floor(Number(state.escapeTokens) || 0), 0, 1);
  state.modifiers ||= {};
  state.payoutSpent ||= 0;
  state.payoutServiceSpent ??= state.payoutSpent;
  state.completed ||= state.cleared >= COMPLETION_FLOOR;
  state.items = normalizeEquipment(state.items);
  for (const key of Object.keys(ITEM_LIMITS)) state[key] ??= 0;
  state.contract ??= null;
  state.classShrine ??= null;
  state.runDiamonds = runDiamondReward(state);
  if (
    state.encounter.kind === "adventurer" &&
    state.encounter.adventurerVersion === 2
  ) {
    // Preserve the saved success/failure; only upgrade a successful theft's reward.
    if (state.encounter.robItem) {
      const seed = state.fair?.serverSeed || session.id;
      state.encounter.robItem =
        ITEMS.legendary[
          fairInt(
            seed,
            `hardcore:adventurer-ssr:${state.floor}`,
            state.turn,
            ITEMS.legendary.length,
          )
        ];
    }
    state.encounter.adventurerVersion = 3;
  }
  if (
    state.encounter.type === "surprise" &&
    state.encounter.kind === "adventurer" &&
    state.encounter.adventurerVersion !== 3
  ) {
    // Convert the previous R/SR/UR rewards once using a stable seed; reopening cannot reroll.
    const seed = state.fair?.serverSeed || session.id;
    state.encounter = fairStateContext.run(
      {
        fair: { serverSeed: seed },
        fairCounter: fairInt(
          seed,
          `hardcore:adventurer-upgrade:${state.floor}`,
          state.turn,
          1_000_000,
        ),
      },
      () => makeSurprise(state, "adventurer"),
    );
  }
  for (const item of state.items) {
    item.definition ||=
      ITEMS[item.rarity]?.find((entry) => entry.name === item.name) ||
      FALLBACK_ITEMS[item.rarity]?.find((entry) => entry.name === item.name);
    item.cleansedLevels = Math.min(
      item.level,
      Math.max(0, item.cleansedLevels || 0),
    );
  }
  if (
    state.payoutPenaltyVersion !== 1 &&
    state.items.every(
      (item) => item.rarity !== "cursed" || item.definition?.bonusPenalty > 0,
    )
  ) {
    const curseFactor = state.items
      .filter((item) => item.rarity === "cursed")
      .reduce(
        (factor, item) =>
          factor *
          (1 - item.definition.bonusPenalty) **
            (item.level - item.cleansedLevels),
        state.portalPayoutFactor || 1,
      );
    if (curseFactor > 0 && state.payoutFactor <= curseFactor + 1e-12) {
      const previous = potentialPayout(state);
      state.payoutFactor = curseFactor;
      state.payoutSpent += Math.max(0, potentialPayout(state) - previous);
      state.payoutPenaltyVersion = 1;
    }
  }
  if (state.encounter.kind === "wrong_portal" && !state.encounter.portal) {
    // Upgrade old portals deterministically, including runs without a fairness seed.
    const seed = state.fair?.serverSeed || session.id;
    state.encounter = fairStateContext.run(
      { ...state, fair: { serverSeed: seed } },
      () =>
        makeWrongPortal(state, {
          goodRoll:
            fairInt(
              seed,
              `hardcore:portal-upgrade:${state.floor}:good`,
              state.turn,
              1_000_000,
            ) / 1_000_000,
          effectRoll:
            fairInt(
              seed,
              `hardcore:portal-upgrade:${state.floor}:effect`,
              state.turn,
              1_000_000,
            ) / 1_000_000,
          luckyBreakRoll:
            fairInt(
              seed,
              `hardcore:lucky-break-upgrade:${state.floor}`,
              state.turn,
              1_000_000,
            ) / 1_000_000,
        }),
    );
  }
  if (state.encounter.kind === "wrong_portal")
    state.encounter.portal.goodChance ??= 0.25;
  if (
    state.encounter.type === "trap" &&
    state.encounter.luckyBreakRoll === undefined
  ) {
    state.encounter.luckyBreakRoll =
      fairInt(
        state.fair?.serverSeed || session.id,
        `hardcore:lucky-break-upgrade:${state.floor}`,
        state.turn,
        1_000_000,
      ) / 1_000_000;
  }
  if (state.encounter.type === "combat") {
    state.encounter.mechanic ||= ["boss", "final_boss"].includes(
      state.encounter.rank,
    )
      ? BOSS_MECHANICS[state.encounter.name]
      : null;
    state.encounter.damageType = enemyDamageType(state.encounter);
    state.encounter.nextDamageType ||=
      state.encounter.damageType === "mixed"
        ? fairInt(
            state.fair?.serverSeed || session.id,
            `hardcore:intent-upgrade:${state.floor}`,
            state.turn,
            1_000_000,
          ) /
            1_000_000 <
          state.encounter.magicChance
          ? "magic"
          : "physical"
        : state.encounter.damageType;
  }
  if (state.encounter.type === "rngesus") {
    state.encounter.prayerChance ??= 0.3;
    state.encounter.prayerRarity ??= "legendary";
    state.encounter.prayerItemRoll ??=
      fairInt(
        state.fair?.serverSeed || session.id,
        `hardcore:prayer-item:${state.floor}`,
        state.turn,
        1_000_000,
      ) / 1_000_000;
  }
  if (
    state.encounter.type === "rngesus" &&
    state.encounter.fleeChance !== 0.75 &&
    state.fair?.serverSeed
  ) {
    // Deterministic upgrade for previously saved 65% encounters; reopening UI cannot reroll it.
    state.encounter.fleeRoll =
      fairInt(
        state.fair.serverSeed,
        `hardcore:flee-upgrade:${state.floor}`,
        state.turn,
        1_000_000,
      ) / 1_000_000;
    state.encounter.fleeChance = 0.75;
    state.encounter.fleeSuccess = state.encounter.fleeRoll < 0.75;
  }
  // Legacy runs may have cleared 999 through an ordinary room. Require the new final boss.
  if (state.cleared >= MAX_FLOOR && !state.finalBossDefeated) {
    state.floor = MAX_FLOOR;
    state.cleared = MAX_FLOOR - 1;
    state.phase = "encounter";
    state.encounter = fairStateContext.run(
      { ...state, fair: { serverSeed: state.fair?.serverSeed || session.id } },
      () => makeEnemy(MAX_FLOOR, "final_boss", null, state.modifiers),
    );
    state.lastLog =
      "Boss cuối Deimoss chặn lối ra. Hạ boss để công nhận tầng 999.";
  }
  return state;
}
const saveState = hardcoreRepository.saveState;
const setMessageId = hardcoreRepository.setMessageId;

const startTx = db.transaction(
  ({ guildId, userId, channelId, stake, classKey, forcedEncounter = null }) => {
    const template = CLASSES[classKey];
    if (!template) throw new Error("INVALID_CLASS");
    if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET)
      throw new Error("INVALID_BET");
    const maxBet = getGameBetLimit(guildId, "hardcore");
    if (stake > maxBet) {
      const error = new Error("BET_LIMIT");
      error.maxBet = maxBet;
      throw error;
    }
    if (getHardcoreByUser(guildId, userId)) throw new Error("ACTIVE_SESSION");
    const account = spendCoins({
      guildId,
      userId,
      amount: stake,
      reason: "hardcore:reserve",
    });
    const state = {
      classKey,
      className: template.name,
      stake,
      floor: 1,
      cleared: 0,
      hp: template.hp,
      maxHp: template.hp,
      damageMin: template.damageMin,
      damageMax: template.damageMax,
      defense: template.defense,
      accuracy: template.accuracy,
      evasion: template.evasion,
      critChance: template.critChance,
      critDamage: 1.75,
      resistance: template.resistance,
      energy: template.energy,
      maxEnergy: template.energy,
      potions: 3,
      luck: 0,
      pityRare: 0,
      pityLegendary: 0,
      bosses: 0,
      bonus: 0,
      payoutFactor: 1,
      payoutSpent: 0,
      payoutServiceSpent: 0,
      payoutPenaltyVersion: 1,
      portalPayoutFactor: 1,
      escapeTokens: 0,
      items: [],
      completed: false,
      finalBossDefeated: false,
      modifiers: {},
      lastModifierFloor: 0,
      runVersion: 4,
      runDiamonds: 0,
      turn: 0,
      phase: "encounter",
      lastLog: "Run bắt đầu.",
      rngesusDry: 0,
      lastChaosChance: 0,
      lastChaosSpike: false,
      fair: createFairness(),
      fairCounter: 0,
    };
    for (const key of Object.keys(ITEM_LIMITS)) state[key] ??= 0;
    state.contract = null;
    state.classShrine = null;
    state.encounter =
      forcedEncounter ||
      fairStateContext.run(state, () => generateEncounter(state));
    const now = Date.now();
    const session = {
      id: crypto.randomBytes(6).toString("hex"),
      guild_id: String(guildId),
      user_id: String(userId),
      channel_id: String(channelId),
      message_id: null,
      created_at: now,
      updated_at: now,
    };
    hardcoreRepository.insertSession(
      { ...session, created_at: now, updated_at: now },
      state,
    );
    return { session, state, account };
  },
);

function startHardcore(args) {
  return startTx(args);
}

const SETUP_IDLE_MS = 5 * 60_000;
const setupDrafts = new Map();
function setupContext(draft) {
  return {
    balance: getAccount(draft.guildId, draft.userId).balance,
    maxBet: Math.min(MAX_BET, getGameBetLimit(draft.guildId, "hardcore")),
  };
}
function closedSetup(content) {
  return {
    content,
    embeds: [],
    components: [],
    allowedMentions: { parse: [] },
  };
}
function closeSetup(draft) {
  clearTimeout(draft.timer);
  setupDrafts.delete(draft.id);
}
function touchSetup(draft) {
  clearTimeout(draft.timer);
  draft.expiresAt = Date.now() + SETUP_IDLE_MS;
  draft.timer = setTimeout(() => {
    if (!setupDrafts.has(draft.id) || draft.busy) return;
    closeSetup(draft);
    draft
      .edit?.(
        closedSetup(
          "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để chọn lại.",
        ),
      )
      .catch(() => {});
  }, SETUP_IDLE_MS);
  draft.timer.unref?.();
}
async function openHardcoreSetup(interaction, initial = {}) {
  if (!interaction.guildId)
    return interaction.reply({
      content: "Game chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
  if (!(await requireGameChannel(interaction, "hardcore"))) return null;
  if (getHardcoreByUser(interaction.guildId, interaction.user.id))
    return interaction.reply({
      content:
        "Bạn đang có một run chưa kết thúc. Dùng `/sinhton tieptuc` để tiếp tục.",
      flags: MessageFlags.Ephemeral,
    });
  for (const previous of setupDrafts.values()) {
    if (
      previous.guildId === interaction.guildId &&
      previous.userId === interaction.user.id
    ) {
      if (previous.busy)
        return interaction.reply({
          content: "Run đang được khởi tạo. Vui lòng chờ một chút.",
          flags: MessageFlags.Ephemeral,
        });
      closeSetup(previous);
      previous.edit?.(closedSetup("Đã mở bảng chuẩn bị mới.")).catch(() => {});
    }
  }
  const draft = {
    id: crypto.randomBytes(6).toString("hex"),
    guildId: interaction.guildId,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    classKey: Object.hasOwn(CLASSES, initial.classKey)
      ? initial.classKey
      : null,
    stake:
      Number.isSafeInteger(initial.stake) &&
      initial.stake >= MIN_BET &&
      initial.stake <= MAX_BET
        ? initial.stake
        : null,
    version: 0,
    busy: false,
    messageId: null,
  };
  setupDrafts.set(draft.id, draft);
  try {
    const response = await interaction.reply({
      ...hardcoreView.hardcoreSetupPayload(draft, CLASSES, setupContext(draft)),
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });
    const message =
      response?.resource?.message || (response?.id ? response : null);
    draft.messageId = message?.id || null;
    draft.edit =
      typeof interaction.editReply === "function"
        ? (payload) => interaction.editReply(payload)
        : (payload) => message.edit(payload);
    if (setupDrafts.get(draft.id) !== draft) {
      await draft.edit(closedSetup("Đã mở bảng chuẩn bị mới."));
      return null;
    }
    touchSetup(draft);
    return draft;
  } catch (error) {
    closeSetup(draft);
    throw error;
  }
}
async function refreshSetup(interaction, draft, notice = null) {
  draft.version += 1;
  touchSetup(draft);
  if (!interaction.deferred && !interaction.replied)
    await interaction.deferUpdate();
  draft.edit = (payload) => interaction.editReply(payload);
  await draft.edit(
    hardcoreView.hardcoreSetupPayload(draft, CLASSES, setupContext(draft)),
  );
  if (notice)
    await interaction.followUp({
      content: notice,
      flags: MessageFlags.Ephemeral,
    });
}
function setupError(error) {
  return error.message === "ACTIVE_SESSION"
    ? "Bạn đang có một run chưa kết thúc. Dùng `/sinhton tieptuc`."
    : error.message === "BET_LIMIT"
      ? `Giới hạn cược hiện tại là **${formatCoins(error.maxBet)} xu**. Hãy nhập lại mức cược.`
      : error.code === "INSUFFICIENT_FUNDS"
        ? "Số dư hiện tại không đủ. Hãy nhập mức cược nhỏ hơn."
        : error.code === "ACTIVE_BLACKJACK_TABLE"
          ? "Bạn đang ở bàn Xì dách. Hãy kết thúc ván đó trước."
          : error.message === "INVALID_BET"
            ? `Nhập số nguyên từ ${MIN_BET} đến ${formatCoins(MAX_BET)} xu.`
            : "Chưa thể bắt đầu run. Hãy thử lại.";
}
async function handleHardcoreSetup(interaction, logger = console) {
  const [prefix, id, rawVersion, action] = interaction.customId.split(":");
  const draft = setupDrafts.get(id);
  if (!draft || draft.expiresAt <= Date.now()) {
    if (draft && !draft.busy) {
      closeSetup(draft);
      draft
        .edit?.(
          closedSetup(
            "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để chọn lại.",
          ),
        )
        .catch(() => {});
    }
    return interaction.reply({
      content: "Bảng chuẩn bị đã hết hạn. Dùng `/sinhton batdau` để mở lại.",
      flags: MessageFlags.Ephemeral,
    });
  }
  if (
    draft.userId !== interaction.user.id ||
    draft.guildId !== interaction.guildId ||
    draft.channelId !== interaction.channelId
  )
    return interaction.reply({
      content: "Đây là bảng chuẩn bị của người chơi khác.",
      flags: MessageFlags.Ephemeral,
    });
  if (
    (draft.messageId && draft.messageId !== interaction.message?.id) ||
    draft.busy
  )
    return interaction.reply({
      content: "Bảng này không còn nhận thao tác hoặc đang khởi tạo run.",
      flags: MessageFlags.Ephemeral,
    });
  if (draft.version !== Number(rawVersion))
    return refreshSetup(
      interaction,
      draft,
      "Lựa chọn đã thay đổi. Hãy dùng các nút mới nhất.",
    );

  if (prefix === "hardcore-setup-modal" && action === "bet") {
    const raw = interaction.fields.getTextInputValue("amount").trim();
    const stake = Number(raw);
    const context = setupContext(draft);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(stake) ||
      stake < MIN_BET ||
      stake > context.maxBet
    )
      return refreshSetup(
        interaction,
        draft,
        `Số xu phải là số nguyên từ **${MIN_BET} đến ${formatCoins(context.maxBet)}**. Hãy nhập lại.`,
      );
    if (stake > context.balance)
      return refreshSetup(
        interaction,
        draft,
        `Bạn hiện có **${formatCoins(context.balance)} xu**. Hãy nhập mức cược nhỏ hơn.`,
      );
    draft.stake = stake;
    return refreshSetup(interaction, draft);
  }
  if (action === "class") {
    const classKey = interaction.values?.[0];
    if (!Object.hasOwn(CLASSES, classKey))
      return refreshSetup(interaction, draft, "Nhân vật không hợp lệ.");
    draft.classKey = classKey;
    return refreshSetup(interaction, draft);
  }
  if (action === "bet") {
    touchSetup(draft);
    return interaction.showModal(
      hardcoreView.hardcoreBetModal(draft, setupContext(draft).maxBet),
    );
  }
  if (action === "cancel") {
    closeSetup(draft);
    return interaction.update(closedSetup("Đã hủy chuẩn bị run."));
  }
  if (action !== "start")
    return refreshSetup(interaction, draft, "Lựa chọn không hợp lệ.");
  if (!Object.hasOwn(CLASSES, draft.classKey) || draft.stake == null)
    return refreshSetup(
      interaction,
      draft,
      "Hãy chọn nhân vật và nhập số xu trước khi bắt đầu.",
    );
  const channel = getGameChannel(draft.guildId, "hardcore");
  if (!channel || channel.channel_id !== draft.channelId) {
    closeSetup(draft);
    return interaction.update(
      closedSetup(
        "Kênh Sinh tồn đã thay đổi. Hãy dùng `/sinhton batdau` tại kênh được cấu hình.",
      ),
    );
  }
  draft.busy = true;
  clearTimeout(draft.timer);
  try {
    await interaction.deferUpdate();
  } catch (error) {
    draft.busy = false;
    touchSetup(draft);
    throw error;
  }
  let started;
  try {
    started = startHardcore({
      guildId: draft.guildId,
      userId: draft.userId,
      channelId: draft.channelId,
      stake: draft.stake,
      classKey: draft.classKey,
    });
  } catch (error) {
    draft.busy = false;
    return refreshSetup(interaction, draft, setupError(error));
  }
  let message;
  try {
    message = await interaction.channel.send({
      embeds: [
        hardcoreEmbed(started.state, draft.userId, null, started.session.id),
      ],
      components: hardcoreRows(started.session.id, started.state),
      allowedMentions: { parse: [] },
    });
    setMessageId(started.session.id, message.id);
  } catch (error) {
    forceEndHardcoreSession(started.session.id, draft.guildId, draft.userId, {
      label: "setup-ui-failed",
    });
    if (message) await message.edit({ components: [] }).catch(() => {});
    draft.busy = false;
    logger.warn?.(
      { err: error, sessionId: started.session.id },
      "hardcore setup could not publish run",
    );
    return refreshSetup(
      interaction,
      draft,
      "Không thể đăng bảng game; đã hoàn lại cược. Bạn có thể thử Bắt đầu lần nữa.",
    );
  }
  closeSetup(draft);
  try {
    await interaction.editReply(
      closedSetup(
        `Đã bắt đầu **${CLASSES[draft.classKey].name}** với **${formatCoins(draft.stake)} xu**.\n${message.url ? `[Mở bảng Sinh tồn](${message.url})` : `Mã ván: ${started.session.id}`}`,
      ),
    );
  } catch (error) {
    logger.warn?.(
      { err: error, sessionId: started.session.id },
      "hardcore setup confirmation could not update",
    );
    await interaction.followUp({
      content:
        "Run đã bắt đầu trong kênh. Dùng `/sinhton tieptuc` nếu cần mở lại bảng.",
      flags: MessageFlags.Ephemeral,
    });
  }
  return started;
}

function getHardcoreRun(guildId, userId) {
  const session = getHardcoreByUser(guildId, userId);
  return session ? { session, state: parseState(session) } : null;
}

function finishRun(session, state, reason) {
  const diamonds =
    reason === "cashout" || reason === "summit" ? runDiamondReward(state) : 0;
  let payout =
    reason === "cashout" || reason === "summit" ? potentialPayout(state) : 0;
  const outcome =
    payout > state.stake ? "win" : payout === state.stake ? "draw" : "loss";
  const account = settleReservedGame({
    guildId: session.guild_id,
    userId: session.user_id,
    payout,
    stake: state.stake,
    game: "hardcore",
    outcome,
    operationId: `settle:hardcore:${session.id}`,
    countGame: reason !== "forfeit",
  });
  if (diamonds > 0)
    addDiamonds(session.guild_id, session.user_id, diamonds, {
      reason: "hardcore:cashout",
      operationId: `settle:hardcore-diamonds:${session.id}`,
    });
  recordRun(session.guild_id, session.user_id, state, reason);
  hardcoreRepository.deleteSession(session.id);
  return {
    reason,
    payout,
    diamonds,
    diamondsLost: diamonds ? 0 : runDiamondReward(state),
    outcome,
    balance: account.balance,
    achievements: account.unlockedAchievements,
    experienceGained: account.experienceGained,
    levelUps: account.levelUps,
    bonusDrops: account.bonusDrops,
  };
}
function forceEndHardcoreSession(
  id,
  guildId,
  adminId,
  { label = "admin-refund", forfeit = false } = {},
) {
  return db.transaction(() => {
    const session = hardcoreRepository.getActiveSession(id, guildId);
    if (!session) return null;
    const state = parseState(session);
    if (!forfeit)
      creditCoins({
        guildId: session.guild_id,
        userId: session.user_id,
        amount: state.stake,
        reason: `hardcore:${label}:${adminId}:${session.id}`,
        operationId: `refund:hardcore-admin:${session.id}:${session.user_id}`,
      });
    if (forfeit) recordRun(session.guild_id, session.user_id, state, "forfeit");
    hardcoreRepository.deleteSession(session.id);
    return {
      session,
      state,
      participants: [session.user_id],
      forfeited: forfeit ? state.stake : 0,
    };
  })();
}

function enemyTurn(state, defend = false, dodge = false) {
  const enemy = state.encounter;
  const previousEnergy = state.energy;
  enemy.attacks = (enemy.attacks || 0) + 1;
  const shrine = classShrineActive(state);
  const shrineDodge =
    shrine && ["assassin", "necromancer"].includes(state.classKey);
  const damageType = enemy.nextDamageType || enemyDamageType(enemy);
  rollEnemyIntent(enemy);
  if (shrineDodge) state.classShrine.consumed = true;
  if (dodge || shrineDodge)
    return "💨 Bạn chặn hoặc né hoàn toàn đòn phản công.";
  const shrineDefense =
    shrine && state.classKey === "barbarian" && state.hp <= state.maxHp * 0.3
      ? 8
      : 0;
  const defender = {
    defense: (state.defense + shrineDefense) * (defend ? 2 : 1),
    evasion: state.evasion,
    critResistance: defend ? 1 : 0,
  };
  const multiplier =
    (enemy.mechanic === "butcher" ? 1 + Math.min(5, enemy.attacks) * 0.08 : 1) *
    (enemy.hp <= enemy.maxHp * 0.5
      ? 1 + (state.modifiers?.bloodlust || 0) * 0.08
      : 1);
  let damage;
  let label;
  if (
    damageType === "magic" ||
    (damageType === "mixed" && randomFloat() < enemy.magicChance)
  ) {
    if (randomFloat() >= hitChance(enemy.accuracy, state.evasion))
      return "💨 Phép của quái đánh trượt.";
    const raw = Math.floor(
      randomInt(enemy.damageMin, enemy.damageMax) * multiplier,
    );
    const effectiveResistance =
      state.resistance -
      (state.modifiers?.cursed_ground || 0) * 4 +
      (shrine && state.classKey === "paladin" ? 10 : 0);
    damage = magicAfterResistance(raw, effectiveResistance);
    label = "🔮";
  } else {
    const hit = resolvePhysicalAttack(enemy, defender, state.floor, {
      multiplier,
    });
    if (!hit.hit) return "💨 Quái đánh trượt.";
    damage = hit.damage;
    label = hit.crit ? "💢 Critical!" : "⚔️";
  }
  const blocked = defend ? damage - Math.max(1, Math.floor(damage * 0.6)) : 0;
  if (defend) damage -= blocked;
  damage = Math.max(1, Math.floor(damage * (1 + (state.damageTaken || 0))));
  const dealt = Math.min(state.hp, damage);
  state.hp = Math.max(0, state.hp - damage);
  state.energy = Math.max(
    0,
    state.energy -
      ((state.modifiers?.soul_drain || 0) >= 5
        ? 2
        : state.modifiers?.soul_drain
          ? 1
          : 0),
  );
  let recovery = "";
  if (enemy.mechanic === "lucion") {
    const healed = Math.min(enemy.maxHp - enemy.hp, Math.floor(dealt * 0.35));
    enemy.hp += healed;
    recovery = ` Lucion hồi **${healed} HP**.`;
  }
  const riftEffects = [];
  if (previousEnergy > state.energy)
    riftEffects.push(`−${previousEnergy - state.energy} ENE`);
  return `${label} Bạn nhận **${damage} DMG**.${defend ? ` 🛡️ Thủ thế chặn thêm **${blocked} DMG** (giảm 40%, miễn chí mạng).` : ""}${recovery}${riftEffects.length ? ` 🌀 Rift: ${riftEffects.join(", ")}.` : ""}`;
}

function playerAttack(state, action) {
  const enemy = state.encounter;
  if (action === "defend") {
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
    return { log: "🛡️ Bạn thủ thế và hồi 1 năng lượng.", defend: true };
  }
  if (action === "potion") {
    if (state.potions <= 0) throw new Error("NO_POTION");
    if (state.hp >= state.maxHp) throw new Error("FULL_HP");
    const healed = Math.min(
      state.maxHp - state.hp,
      Math.max(
        20,
        Math.floor(
          state.maxHp * clamp(0.35 + (state.potionPower || 0), 0.1, 0.75),
        ),
      ),
    );
    state.potions -= 1;
    state.hp += healed;
    return { log: `🧪 Hồi **${healed} HP**.`, defend: false };
  }
  let attacks;
  let dodge = false;
  let defend = false;
  let healing = 0;
  if (action === "skill") {
    const free = state.classKey === "sorceress" && classShrineActive(state);
    if (!free && state.energy < 2) throw new Error("NO_ENERGY");
    if (free) state.classShrine.consumed = true;
    else state.energy -= 2;
    if (["sorceress", "necromancer"].includes(state.classKey)) {
      const raw = Math.floor(
        randomInt(state.damageMin, state.damageMax) *
          (state.classKey === "sorceress" ? 2.1 : 1.55),
      );
      attacks = [
        {
          hit: true,
          crit: false,
          damage: magicAfterResistance(raw, enemy.resistance),
        },
      ];
      dodge = state.classKey === "necromancer";
    } else if (state.classKey === "amazon") {
      attacks = [
        resolvePhysicalAttack(state, enemy, state.floor, { multiplier: 0.85 }),
        resolvePhysicalAttack(state, enemy, state.floor, { multiplier: 0.85 }),
      ];
      if (classShrineActive(state) && randomFloat() < 0.2)
        attacks.push(
          resolvePhysicalAttack(state, enemy, state.floor, {
            multiplier: 0.85,
          }),
        );
    } else {
      const multiplier = {
        assassin: 1.3,
        barbarian: 1.65,
        druid: 1.35,
        paladin: 1.4,
      }[state.classKey];
      attacks = [
        resolvePhysicalAttack(state, enemy, state.floor, { multiplier }),
      ];
      dodge = state.classKey === "assassin";
      defend = state.classKey === "paladin";
      if (state.classKey === "druid") {
        healing = Math.min(
          state.maxHp - state.hp,
          Math.floor(state.maxHp * 0.12),
        );
        state.hp += healing;
      }
    }
  } else {
    attacks = [resolvePhysicalAttack(state, enemy, state.floor)];
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
  }
  const hit = attacks.some((attack) => attack.hit);
  enemy.incomingAttacks = (enemy.incomingAttacks || 0) + 1;
  const immune =
    enemy.mechanic === "riftwalker" && enemy.incomingAttacks % 3 === 1;
  const calculatedDamage = immune
    ? 0
    : attacks.reduce(
        (total, attack) =>
          total +
          (attack.hit
            ? enemy.mechanic === "deimoss"
              ? Math.max(1, Math.floor(attack.damage * 0.75))
              : attack.damage
            : 0),
        0,
      );
  const bonus = ["boss", "final_boss"].includes(enemy.rank)
    ? state.bossDamage || 0
    : ["elite", "ancient_mimic"].includes(enemy.rank)
      ? state.eliteDamage || 0
      : 0;
  const damage = Math.floor(calculatedDamage * (1 + bonus));
  enemy.hp = Math.max(0, enemy.hp - damage);
  const skill =
    action === "skill" ? `✨ ${CLASSES[state.classKey].skill}: ` : "⚔️ ";
  const log = immune
    ? `${skill}Ascendant Riftwalker miễn nhiễm đòn này.`
    : !hit
      ? `${skill}Đòn đánh trượt.`
      : `${skill}${attacks.some((attack) => attack.crit) ? "CRIT! " : ""}Gây **${damage} DMG**${attacks.length > 1 ? ` qua ${attacks.length} phát` : ""}.`;
  return {
    log: `${log}${healing ? ` Hồi **${healing} HP**.` : ""}`,
    dodge,
    defend,
  };
}

function applyShrine(state, kind) {
  if (kind === "healing") {
    const heal = state.maxHp - state.hp;
    state.hp = state.maxHp;
    return `💚 Healing Shrine hồi ${heal} HP.`;
  }
  if (kind === "armor") {
    state.defense += 3;
    return "🛡️ Armor Shrine: +3 DEF.";
  }
  if (kind === "blood") {
    state.hp = Math.max(1, state.hp - 15);
    state.damageMin += 4;
    state.damageMax += 4;
    return "🩸 Mất 15 HP, +4 ATK.";
  }
  if (kind === "experience") {
    state.bonus += Math.floor(state.stake * 0.25);
    return "✨ Payout tạm thời tăng thêm 25% tiền cược.";
  }
  if (kind === "corrupted") {
    state.damageMin += 7;
    state.damageMax += 7;
    state.defense = Math.max(0, state.defense - 4);
    return "☣️ +7 ATK, −4 DEF.";
  }
  const damage = Math.max(10, Math.floor(state.maxHp * 0.3));
  state.hp = Math.max(0, state.hp - damage);
  return `🤡 Shrine giả gây ${damage} DMG.`;
}

const DISPLAY_STATS = [
  "hp",
  "maxHp",
  "damageMin",
  "damageMax",
  "defense",
  "energy",
  "potions",
  "luck",
  "critChance",
  "evasion",
  "resistance",
  "escapeTokens",
  "accuracy",
  "maxEnergy",
  "potionPower",
  "bossDamage",
  "eliteDamage",
  "mimicDetection",
  "goblinChance",
  "legendaryFind",
  "floorHpLoss",
  "mimicChance",
  "damageTaken",
];
function statSnapshot(state) {
  return Object.fromEntries(
    DISPLAY_STATS.map((key) => [key, Number(state[key]) || 0]),
  );
}
function statChanges(state, before) {
  return Object.fromEntries(
    DISPLAY_STATS.map((key) => [
      key,
      +Number((Number(state[key]) || 0) - before[key]).toFixed(4),
    ]).filter(([, change]) => change),
  );
}
function payRunService(state, service) {
  const cost = serviceCost(state, service);
  if (cost <= 0 || potentialPayout(state) < cost)
    throw new Error("INSUFFICIENT_RUN_PAYOUT");
  state.payoutSpent = (state.payoutSpent || 0) + cost;
  state.payoutServiceSpent = (state.payoutServiceSpent || 0) + cost;
  return cost;
}
function chargeCurrentPayout(state, rate) {
  const cost = payoutReductionCost(state, rate);
  state.payoutFactor *= 1 - rate;
  state.payoutTaxLoss = (state.payoutTaxLoss || 0) + cost;
  return cost;
}

function luckyBreak(state, event) {
  return (
    typeof event.luckyBreakRoll === "number" &&
    event.luckyBreakRoll < luckyBreakChance(state)
  );
}

function resolveWrongPortal(state) {
  const event = state.encounter;
  let log;
  if (event.portal.good) {
    if (event.portal.effect === "healing_sanctuary") {
      state.maxHp += 10;
      state.hp = state.maxHp;
      state.potions = Math.min(5, state.potions + 1);
      log =
        "💚 Healing Sanctuary: +10 HP tối đa, hồi đầy HP và thêm 1 bình máu (tối đa 5).";
    } else if (event.portal.effect === "treasure_vault") {
      const found = Math.floor(state.stake * 0.5);
      state.bonus += found;
      log = `💰 Treasure Vault: cộng **${found} xu** vào bonus payout (50% tiền cược).`;
    } else if (event.portal.effect === "rift_blessing") {
      state.defense += 4;
      state.resistance = clamp(state.resistance + 5, -50, 75);
      state.luck += 1;
      log = "✨ Rift Blessing: +4 DEF, +5 RES và +1 LUCK.";
    } else throw new Error("INVALID_ACTION");
    completeFloor(state, `🌀 Portal tốt! ${log}`, 0);
    return;
  }
  if (event.portal.effect === "blood_rift") {
    const damage = Math.min(
      Math.max(0, state.hp - 1),
      Math.floor(state.maxHp * 0.15),
    );
    state.hp -= damage;
    log = `🩸 Blood Rift gây **${damage} DMG** (tối đa 15% MAX HP; giữ ít nhất 1 HP).`;
  } else if (event.portal.effect === "mana_void") {
    state.energy = 0;
    log = "🕳️ Mana Void: ENE về 0.";
  } else if (event.portal.effect === "shattered_supplies") {
    const lost = Math.min(2, state.potions);
    state.potions -= lost;
    log = `📦 Shattered Supplies: mất **${lost} bình máu**.`;
  } else if (event.portal.effect === "payout_corruption") {
    const cost = chargeCurrentPayout(state, 0.1);
    state.portalPayoutFactor = (state.portalPayoutFactor || 1) * 0.9;
    log = `☣️ Payout Corruption: payout ×0,9, giảm **${cost} xu** hiện tại; áp dụng cả thưởng về sau.`;
  } else if (event.portal.effect === "dimensional_curse") {
    const previousDefense = state.defense;
    const previousResistance = state.resistance;
    state.defense = Math.max(0, state.defense - 5);
    state.resistance = clamp(state.resistance - 5, -50, 75);
    log = `💀 Dimensional Curse: −${previousDefense - state.defense} DEF, −${previousResistance - state.resistance}% RES.`;
  } else throw new Error("INVALID_ACTION");
  state.encounter = event.enemy;
  state.lastLog = `🌀 Portal xấu! ${log}\n⚠️ **Rift Ambusher** cấp Elite đánh phủ đầu!\n${enemyTurn(state)}`;
}
function payEventCost(state, rate) {
  const cost = Math.ceil(potentialPayout(state) * rate);
  if (cost <= 0 || potentialPayout(state) < cost)
    throw new Error("INSUFFICIENT_RUN_PAYOUT");
  state.payoutSpent = (state.payoutSpent || 0) + cost;
  state.payoutServiceSpent = (state.payoutServiceSpent || 0) + cost;
  return cost;
}
function resolveSurprise(state, action) {
  const event = state.encounter;
  const done = (log) => completeFloor(state, log, 0);
  const addAttack = (amount) => {
    state.damageMin = Math.max(1, state.damageMin + amount);
    state.damageMax = Math.max(state.damageMin, state.damageMax + amount);
  };
  const receive = (item) => {
    const owned = applyItem(state, item, item.rarity);
    return `Nhận **${owned.name} Lv.${owned.level}** [${rarityLabel(owned.rarity)}]: ${item.text}${item.curse ? `; curse: ${item.curse.text}` : ""}.`;
  };
  const combat = (enemy, log) => {
    state.encounter = enemy;
    state.lastLog = log;
  };
  if (event.kind === "healer" && action === "event_accept") {
    const healed = Math.min(
      state.maxHp - state.hp,
      Math.max(20, Math.floor(state.maxHp * 0.3)),
    );
    state.hp += healed;
    state.potions = Math.min(5, state.potions + 1);
    return done(
      `💚 Wandering Healer: hồi **${healed} HP**, +1 bình (tối đa 5).`,
    );
  }
  if (event.kind === "goblin" && action === "event_catch") {
    if (event.successRoll < goblinCatchChance(state)) {
      const bonus = Math.floor(state.stake * 0.25);
      state.bonus += bonus;
      return done(`💰 Bắt được Treasure Goblin! Bonus **+${bonus} xu**.`);
    }
    const lost = chargeCurrentPayout(state, 0.1);
    return done(
      `🏃 Treasure Goblin trốn thoát: payout ×0,9, mất **${lost} xu**.`,
    );
  }
  if (event.kind === "blacksmith" && action === "event_forge") {
    const target = forgeTarget(state);
    if (!target) throw new Error("NO_FORGE_ITEM");
    const cost = payEventCost(state, 0.12);
    const log = receive(target.definition);
    return done(`🔨 Rèn: ${log}\nDùng **${cost} xu** từ payout.`);
  }
  if (event.kind === "purifier" && action === "event_cleanse") {
    const target = curseTarget(state);
    if (!target) throw new Error("NO_CURSE");
    const cost = payEventCost(state, 0.2);
    cleanseItem(state, target);
    return done(
      `✨ Giải một lớp curse của **${target.name}**; giữ buff. Dùng **${cost} xu** từ payout.`,
    );
  }
  if (event.kind === "sacrifice") {
    if (action === "event_blood") {
      const lost = Math.max(1, Math.floor(state.maxHp * 0.2));
      if (state.hp <= lost) throw new Error("INSUFFICIENT_HP");
      state.hp -= lost;
      addAttack(3);
      return done(`🩸 Hiến **${lost} HP**, +3 ATK.`);
    }
    if (action === "event_gold") {
      const cost = payEventCost(state, 0.1);
      state.defense += 3;
      return done(`🛡️ +3 DEF, dùng **${cost} xu** từ payout.`);
    }
  }
  if (
    event.kind === "gambler" &&
    ["event_bet10", "event_bet25"].includes(action)
  ) {
    const cost = payEventCost(state, action === "event_bet10" ? 0.1 : 0.25);
    if (event.win) {
      // Return the stake, then credit the profit through bonus (subject to the payout cap).
      state.payoutSpent -= cost;
      state.payoutServiceSpent -= cost;
      state.bonus += Math.ceil(cost / state.payoutFactor);
      return done(
        `🎲 Cursed Gambler: thắng cược **${cost} xu**, nhận lại **${cost * 2} xu** trước trần payout.`,
      );
    }
    return done(`🎲 Cursed Gambler: thua **${cost} xu** từ payout.`);
  }
  if (
    event.kind === "adventurer" &&
    ["event_rescue", "event_rob"].includes(action)
  ) {
    if (action === "event_rescue") {
      if (state.potions < 2) throw new Error("NO_RESCUE_POTIONS");
      state.potions -= 2;
      return done(
        `🧭 Cứu Lost Adventurer bằng 2 bình máu. ${receive(event.rescueItem)}`,
      );
    }
    return done(
      event.robItem
        ? `🗡️ Cướp đồ Lost Adventurer. ${receive(event.robItem)}`
        : "🗡️ Cướp đồ Lost Adventurer. Không có gì xảy ra.",
    );
  }
  if (event.kind === "fountain" && action === "event_drink") {
    if (event.outcome === "mimic")
      return combat(event.enemy, "🩸 Blood Fountain hóa thành Blood Mimic!");
    if (event.outcome === "heal") {
      state.hp = state.maxHp;
      return done("🩸 Blood Fountain: hồi đầy HP.");
    }
    state.maxHp += 15;
    return done("🩸 Blood Fountain: +15 HP tối đa.");
  }
  if (
    event.kind === "horadric" &&
    [
      "event_grind_attack",
      "event_grind_defense",
      "event_grind_hp",
      "event_grind_ticket",
    ].includes(action)
  ) {
    const target = state.items.find(
      (item) =>
        item.name === event.targetName &&
        item.rarity === event.targetRarity &&
        (item.definition?.base || "") === event.targetBase,
    );
    if (
      !target ||
      (action === "event_grind_ticket" &&
        !["legendary", "cursed"].includes(target.rarity))
    )
      throw new Error("NO_FORGE_ITEM");
    grindItem(state, target);
    const rewards = {
      event_grind_attack: { attack: 3 },
      event_grind_defense: { defense: 4 },
      event_grind_hp: { maxHp: 10, heal: 10 },
      event_grind_ticket: { escapeTokens: 1 },
    };
    applyEquipmentEffects(state, rewards[action]);
    return done(
      `⚒️ Nghiền một level **${target.name}**: ${effectText(rewards[action], 1)}.`,
    );
  }
  if (event.kind === "merchant" && action.startsWith("event_buy_")) {
    const key = action.slice("event_buy_".length);
    if (!event.offers.includes(key)) throw new Error("INVALID_ACTION");
    const cost = payEventCost(state, MERCHANT_OFFERS[key].rate);
    let log = MERCHANT_OFFERS[key].label;
    if (key === "potion") state.potions = Math.min(5, state.potions + 1);
    if (key === "heal") state.hp = state.maxHp;
    if (key === "luck") state.luck += 1;
    if (key === "ticket") grantEscapeTickets(state, 1);
    if (key === "item") log = receive(event.item);
    return done(`🛒 Rift Merchant: ${log}; dùng **${cost} xu** từ payout.`);
  }
  if (event.kind === "mirror") {
    if (action === "event_mirror_damage") {
      const lost = Math.max(1, Math.floor(state.maxHp * 0.1));
      if (state.hp <= lost) throw new Error("INSUFFICIENT_HP");
      state.hp -= lost;
      state.damageMin = Math.floor(state.damageMin * 1.1);
      state.damageMax = Math.floor(state.damageMax * 1.1);
      return done(`🪞 Mất **${lost} HP**, +10% ATK.`);
    }
    if (action === "event_mirror_guard") {
      state.defense += 8;
      addAttack(-2);
      return done("🪞 +8 DEF, −2 ATK.");
    }
    if (action === "event_break") {
      if (event.lucky) {
        state.luck += 2;
        return done("🪞 Đập gương: +2 LUCK.");
      }
      return combat(
        event.enemy,
        "🪞 Mirror Clone xuất hiện; hạ clone để qua tầng.",
      );
    }
  }
  if (
    event.kind === "treasure_room" &&
    ["event_chest_red", "event_chest_blue", "event_chest_gold"].includes(action)
  ) {
    const key = action.slice("event_chest_".length);
    if (key === event.mimicChest)
      return combat(event.enemy, "📦 Hòm hóa thành Mimic!");
    if (key === "red") {
      addAttack(5);
      return done("📦 Hòm đỏ: +5 ATK.");
    }
    if (key === "blue") {
      state.defense += 6;
      state.resistance = clamp(state.resistance + 5, -50, 75);
      return done("📦 Hòm xanh: +6 DEF, +5 RES.");
    }
    state.bonus += Math.floor(state.stake * 0.5);
    state.luck += 1;
    return done("📦 Hòm vàng: bonus +50% cược, +1 LUCK.");
  }
  if (
    event.kind === "contract" &&
    [
      "event_contract_potion",
      "event_contract_skill",
      "event_contract_defend",
    ].includes(action)
  ) {
    if (state.contract) throw new Error("INVALID_ACTION");
    state.contract = {
      kind: action.slice("event_contract_".length),
      from: state.floor + 1,
      until: state.floor + 3,
      remaining: 3,
      item: event.item,
    };
    return done(
      "📜 Nhận Rift Contract cho 3 tầng kế tiếp. Vi phạm chỉ hủy phần thưởng.",
    );
  }
  if (event.kind === "class_shrine" && action === "event_bless") {
    state.classShrine = {
      from: state.floor + 1,
      until: state.floor + 3,
      consumed: false,
    };
    return done(
      `✨ Class Shrine chúc phúc **${CLASSES[state.classKey].name}** trong tối đa 3 tầng kế tiếp.`,
    );
  }
  if (
    event.kind === "doors" &&
    ["event_door_light", "event_door_gold", "event_door_dark"].includes(action)
  ) {
    const key = action.slice("event_door_".length);
    if (key === "light") {
      if (event.doors.light) {
        state.hp = state.maxHp;
        state.potions = Math.min(5, state.potions + 1);
        return done("🚪 Cửa sáng: hồi đầy HP, +1 bình.");
      }
      const lost = Math.min(state.hp - 1, Math.floor(state.maxHp * 0.2));
      state.hp -= lost;
      return done(`🚪 Cửa sáng: mất **${lost} HP**, giữ ít nhất 1 HP.`);
    }
    if (key === "gold") {
      if (!event.doors.gold)
        return combat(event.mimic, "🚪 Golden Door Mimic chặn đường!");
      state.bonus += Math.floor(state.stake * 0.5);
      return done("🚪 Cửa vàng: bonus +50% cược.");
    }
    if (!event.doors.dark)
      return combat(event.boss, "🚪 Premature Rift Boss xuất hiện!");
    return done(`🚪 Cửa đen: ${receive(event.item)}`);
  }
  throw new Error("INVALID_ACTION");
}

const actionTx = db.transaction(
  ({ sessionId, userId, expectedTurn, action }) => {
    const session = getSession(sessionId);
    if (!session || session.user_id !== String(userId))
      throw new Error("INVALID_SESSION");
    const state = parseState(session);
    return fairStateContext.run(state, () => {
      if (state.turn !== expectedTurn) throw new Error("STALE_ACTION");
      if (action === "retreat" && state.encounter.type === "rngesus")
        throw new Error("CANNOT_RETREAT");
      const before = statSnapshot(state);
      state.lastDiscardedEscapeTokens = 0;
      state.lastStatChanges = null;
      state.turn += 1;
      if (action === "retreat")
        return {
          settled: true,
          state,
          result: finishRun(
            session,
            state,
            state.phase === "summit"
              ? "summit"
              : state.cleared > 0
                ? "cashout"
                : "forfeit",
          ),
        };
      if (state.phase === "summit") throw new Error("INVALID_ACTION");

      if (state.phase === "upgrade") {
        if (action === "upgrade_attack") {
          state.damageMin += 5;
          state.damageMax += 5;
          state.lastLog = "⚔️ +5 ATK.";
        } else if (action === "upgrade_hp") {
          state.maxHp += 30;
          state.hp = Math.min(state.maxHp, state.hp + 30);
          state.lastLog = "❤️ +30 HP tối đa và hiện tại.";
        } else if (action === "upgrade_defense") {
          state.defense += 6;
          state.lastLog = "🛡️ +6 DEF.";
        } else if (action === "upgrade_luck") {
          state.luck += 2;
          state.lastLog = "🍀 +2 LUCK.";
        } else throw new Error("INVALID_ACTION");
        setNextEncounter(
          state,
          `${state.lastLog}\nBạn tiến vào tầng ${state.floor}.`,
        );
      } else if (state.encounter.type === "combat") {
        if (!["attack", "defend", "skill", "potion"].includes(action))
          throw new Error("INVALID_ACTION");
        const acted = playerAttack(state, action);
        let log = acted.log;
        if (
          state.contract &&
          state.floor >= state.contract.from &&
          state.floor <= state.contract.until &&
          state.contract.kind === action
        ) {
          state.contract = null;
          log = `📜 Vi phạm Rift Contract: hủy thưởng hợp đồng.\n${log}`;
        }
        if (state.encounter.hp <= 0) {
          const enemy = state.encounter;
          if (
            state.floor === MAX_FLOOR &&
            enemy.rank === "final_boss" &&
            enemy.mechanic === "deimoss"
          )
            state.finalBossDefeated = true;
          completeFloor(
            state,
            `${log}\n🏆 Đã hạ **${enemy.name}**.`,
            enemy.rewardMultiplier,
          );
        } else {
          log += `\n${enemyTurn(state, acted.defend, acted.dodge)}`;
          state.lastLog = log;
          if (state.hp <= 0)
            return {
              settled: true,
              state,
              result: finishRun(session, state, "death"),
            };
        }
      } else if (state.encounter.type === "chest") {
        const chest = state.encounter;
        if (action === "inspect") {
          if (chest.inspected) throw new Error("ALREADY_INSPECTED");
          chest.inspected = true;
          if (
            ["mimic", "ancient_mimic"].includes(chest.kind) &&
            chest.detectionSuccess
          ) {
            chest.revealed = true;
            state.lastLog =
              "👁️ Bạn phát hiện chiếc hòm đang thở. Đây là Mimic!";
          } else state.lastLog = "🔍 Không phát hiện điều gì bất thường.";
        } else if (action === "leave") {
          if (!chest.revealed) throw new Error("INVALID_ACTION");
          completeFloor(state, "🚪 Bạn tránh được Mimic và đi tiếp.", 0);
        } else if (action === "sell") {
          state.bonus += Math.floor(state.stake * 0.15);
          completeFloor(
            state,
            "💰 Bán hòm, cộng 15% tiền cược vào payout.",
            0.5,
          );
        } else if (action === "open") {
          if (["mimic", "ancient_mimic"].includes(chest.kind)) {
            updatePity(state, "empty");
            state.encounter = makeEnemy(
              state.floor,
              chest.kind,
              null,
              state.modifiers,
            );
            state.lastLog = `😈 Chiếc hòm hóa thành **${state.encounter.name}**!`;
          } else if (chest.kind === "empty") {
            updatePity(state, "empty");
            completeFloor(state, "📦 Hòm hoàn toàn trống.", 0);
          } else if (chest.kind === "fake_legendary") {
            updatePity(state, "empty");
            completeFloor(
              state,
              "🟠 Ánh sáng SSR bùng lên rồi tắt; đây là đồ giả không có chỉ số.",
              0,
            );
          } else {
            const equipment = applyItem(state, chest.item, chest.rarity);
            updatePity(state, chest.rarity);
            completeFloor(
              state,
              `🎁 ${equipment.level > 1 ? "Nâng cấp" : "Nhận"} **${chest.item.name} Lv.${equipment.level}** (${rarityLabel(chest.rarity)}): ${chest.item.text}.`,
              chest.rarity === "legendary" ? 2 : 1,
            );
          }
        } else throw new Error("INVALID_ACTION");
      } else if (state.encounter.type === "shrine") {
        if (action === "ignore")
          completeFloor(state, "🚶 Bạn bỏ qua Shrine.", 0);
        else if (action === "touch") {
          const log = applyShrine(state, state.encounter.kind);
          if (state.hp <= 0)
            return {
              settled: true,
              state,
              result: finishRun(session, state, "death"),
            };
          completeFloor(state, log, 0.5);
        } else throw new Error("INVALID_ACTION");
      } else if (["blacksmith", "cleanse"].includes(state.encounter.type)) {
        const service = state.encounter.type;
        if (action === "ignore")
          completeFloor(state, "🚶 Bạn bỏ qua dịch vụ và đi tiếp.", 0);
        else if (service === "blacksmith" && action === "forge") {
          const target = forgeTarget(state);
          if (!target) throw new Error("NO_FORGE_ITEM");
          const cost = payRunService(state, service);
          const upgraded = applyItem(state, target.definition, target.rarity);
          completeFloor(
            state,
            `🔨 Thợ rèn nâng **${upgraded.name} lên Lv.${upgraded.level}**: ${effectText(upgraded.definition, 1)}.\n💰 Đã dùng **${cost} xu** từ payout của run.`,
            0,
          );
        } else if (service === "cleanse" && action === "cleanse") {
          const target = curseTarget(state);
          if (!target) throw new Error("NO_CURSE");
          const cost = payRunService(state, service);
          cleanseItem(state, target);
          completeFloor(
            state,
            `✨ Gỡ một lớp curse của **${target.name}**; giữ buff trang bị.\n💰 Đã dùng **${cost} xu** từ payout của run.`,
            0,
          );
        } else throw new Error("INVALID_ACTION");
      } else if (state.encounter.type === "surprise") {
        if (action === "ignore")
          completeFloor(
            state,
            state.encounter.kind === "adventurer"
              ? "🚶 Bỏ mặc Lost Adventurer. Không có gì xảy ra."
              : "🚶 Bạn tránh lối đi bí ẩn và đi tiếp an toàn.",
            0,
          );
        else if (SURPRISE_EVENTS[state.encounter.kind])
          resolveSurprise(state, action);
        else if (action === "explore") {
          const event = state.encounter;
          if (event.kind === "ambush") {
            state.encounter = event.enemy;
            state.lastLog = `⚠️ **${state.encounter.name}** phục kích và ra đòn trước!\n${enemyTurn(state)}`;
            if (state.hp <= 0)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "death"),
              };
          } else if (event.kind === "healing") {
            const healed = Math.min(
              state.maxHp - state.hp,
              Math.max(20, Math.floor(state.maxHp * 0.35)),
            );
            state.hp += healed;
            state.potions += 1;
            completeFloor(
              state,
              `💚 Gặp người cứu trợ: hồi **${healed} HP**, nhận **1 bình máu**.`,
              0,
            );
          } else if (event.kind === "escape_ticket") {
            grantEscapeTickets(state, 1);
            completeFloor(
              state,
              "🎫 Người lữ hành trao **1 Vé Thoát Hiểm**. Vé tự dùng nếu chạy khỏi RNGesus thất bại.",
              0,
            );
          } else if (event.kind === "cache") {
            const found = Math.floor(state.stake * 0.5);
            state.bonus += found;
            completeFloor(
              state,
              `💰 Phát hiện kho xu: cộng **${found} xu** vào bonus của run (trước hệ số phạt payout).`,
              0,
            );
          } else throw new Error("INVALID_ACTION");
        } else throw new Error("INVALID_ACTION");
      } else if (state.encounter.type === "empty") {
        if (action !== "continue") throw new Error("INVALID_ACTION");
        completeFloor(
          state,
          "🕳️ Căn phòng không có gì. Đúng nghĩa không có gì.",
          0,
        );
      } else if (state.encounter.type === "trap") {
        if (action !== "continue") throw new Error("INVALID_ACTION");
        const event = state.encounter;
        const kind = event.kind;
        if (kind === "tax_collector") {
          if (luckyBreak(state, event))
            completeFloor(state, LUCKY_BREAK_LOG, 0);
          else {
            const cost = chargeCurrentPayout(state, 0.15);
            completeFloor(
              state,
              `🧾 Tax Collector: hệ số payout ×0,85, giảm **${cost} xu** hiện tại.`,
              0,
            );
          }
        } else if (kind === "potion_thief") {
          const avoided = state.potions > 0 && luckyBreak(state, event);
          const stolen = state.potions > 0 && !avoided ? 1 : 0;
          state.potions = Math.max(0, state.potions - stolen);
          completeFloor(
            state,
            avoided
              ? LUCKY_BREAK_LOG
              : stolen
                ? "🦹 Kẻ trộm lấy mất 1 bình máu rồi biến mất."
                : "🦹 Kẻ trộm kiểm tra túi đồ rỗng và tỏ vẻ thất vọng.",
            0,
          );
        } else if (kind === "wrong_portal") {
          resolveWrongPortal(state);
          if (state.hp <= 0)
            return {
              settled: true,
              state,
              result: finishRun(session, state, "death"),
            };
        } else throw new Error("INVALID_ACTION");
      } else if (state.encounter.type === "rngesus") {
        const event = state.encounter;
        if (action === "fight")
          return {
            settled: true,
            state,
            result: finishRun(session, state, "rngesus"),
          };
        if (action === "flee") {
          const escaped =
            typeof event.fleeRoll === "number"
              ? event.fleeRoll < 0.75
              : event.fleeSuccess;
          if (!escaped) {
            if (state.escapeTokens <= 0)
              return {
                settled: true,
                state,
                result: finishRun(session, state, "rngesus"),
              };
            state.escapeTokens -= 1;
            completeFloor(
              state,
              "🎫 Chạy thất bại! Tự dùng **1 Vé Thoát Hiểm** để cứu bạn khỏi RNGesus và đi tiếp.",
              0,
            );
          } else
            completeFloor(
              state,
              "🏃 Bạn thoát khỏi RNGesus với đôi chân run rẩy; giữ lại Vé Thoát Hiểm.",
              0,
            );
        } else if (action === "bribe") {
          const cost = chargeCurrentPayout(state, 0.4);
          completeFloor(
            state,
            `💸 Hối lộ RNGesus: hệ số payout ×0,6, giảm **${cost} xu** hiện tại để đi tiếp.`,
            0,
          );
        } else if (action === "pray") {
          if (!event.prayerSuccess)
            return {
              settled: true,
              state,
              result: finishRun(session, state, "rngesus"),
            };
          const rarity = event.prayerRarity || "legendary";
          const pool = ITEMS[rarity];
          const item =
            pool[
              Math.min(
                pool.length - 1,
                Math.floor(event.prayerItemRoll * pool.length),
              )
            ];
          const equipment = applyItem(state, item, rarity);
          completeFloor(
            state,
            `🙏 RNGesus cười và trao **${item.name} Lv.${equipment.level}** (${rarityLabel(rarity)}).`,
            2,
          );
        } else if (action === "ticket") {
          if (state.escapeTokens <= 0) throw new Error("NO_TICKET");
          state.escapeTokens -= 1;
          completeFloor(
            state,
            "🎫 Dùng một Vé Thoát Hiểm, vượt tầng an toàn.",
            0,
          );
        } else throw new Error("INVALID_ACTION");
      } else throw new Error("INVALID_ACTION");

      if (state.hp <= 0)
        return {
          settled: true,
          state,
          result: finishRun(session, state, "death"),
        };

      if (state.lastDiscardedEscapeTokens)
        state.lastLog += `\n🎫 Chỉ giữ tối đa 1 Vé Thoát Hiểm; bỏ ${state.lastDiscardedEscapeTokens} vé nhận thêm.`;
      delete state.lastDiscardedEscapeTokens;
      state.lastStatChanges = statChanges(state, before);
      // Persist cleared floors immediately; deaths and session cleanup must not erase milestones.
      if (state.cleared > 0)
        hardcoreRepository.upsertRecord(session.guild_id, session.user_id, {
          bestFloor: state.cleared,
          runs: 0,
          deaths: 0,
          escapes: 0,
          completions: 0,
        });
      saveState(session, state);
      return { settled: false, state, result: null };
    });
  },
);

function playHardcore(args) {
  return actionTx(args);
}

function hardcoreEmbed(state, userId, result = null, sessionId = null) {
  return hardcoreView.hardcoreEmbed(
    state,
    userId,
    result,
    CLASSES,
    sessionId,
    ITEMS,
  );
}
function hardcoreRows(sessionId, state, disabled = false) {
  return hardcoreView.hardcoreRows(sessionId, state, disabled, CLASSES);
}

async function showHardcoreTurn(
  interaction,
  sessionId,
  state,
  result = null,
  settled = false,
  logger = null,
) {
  try {
    return await interaction.editReply({
      embeds: [hardcoreEmbed(state, interaction.user.id, result, sessionId)],
      components: hardcoreRows(sessionId, state, settled),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logger?.warn({ err: error, sessionId }, "could not update hardcore panel");
    const fallback = {
      content:
        `⚠️ Bảng chi tiết chưa hiển thị được. **Sinh tồn · tầng ${state.floor} · lượt ${state.turn}**\n` +
        `❤️ ${state.hp}/${state.maxHp} HP\n${String(state.lastLog || "").slice(0, 700)}` +
        (result
          ? `\nKết quả: **${result.outcome === "win" ? "Thắng" : result.outcome === "draw" ? "Hòa" : "Thua"}** · Nhận ${formatCoins(result.payout)} xu.`
          : ""),
      embeds: [],
      components: hardcoreRows(sessionId, state, settled),
      allowedMentions: { parse: [] },
    };
    try {
      return await interaction.editReply(fallback);
    } catch (fallbackError) {
      logger?.warn(
        { err: fallbackError, sessionId },
        "could not restore hardcore panel",
      );
      const replacement = await interaction.followUp({
        ...fallback,
        withResponse: true,
      });
      const messageId = replacement?.resource?.message?.id || replacement?.id;
      if (messageId && !settled) setMessageId(sessionId, messageId);
      return replacement;
    }
  }
}

const hardcoreQueues = new Map();
function withHardcoreSession(sessionId, action) {
  const previous = hardcoreQueues.get(sessionId) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  hardcoreQueues.set(sessionId, next);
  return next.finally(() => {
    if (hardcoreQueues.get(sessionId) === next)
      hardcoreQueues.delete(sessionId);
  });
}
async function handleHardcoreButton(interaction, logger) {
  const [, sessionId, rawTurn, action, originMessageId] =
    interaction.customId.split(":");
  const detailAction =
    /^(?:view|page)_(stats|items|effects|encounter)_(\d{1,4})$/.exec(action);
  const openingDetails = Boolean(detailAction && !originMessageId);
  // Opening a private panel has its own reply; navigation acknowledges that panel.
  if (openingDetails)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  else await interaction.deferUpdate();
  const respond = (content) =>
    openingDetails
      ? interaction.editReply({ content, embeds: [], components: [] })
      : interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  return withHardcoreSession(sessionId, async () => {
    try {
      const session = getSession(sessionId);
      if (
        !session ||
        session.guild_id !== interaction.guildId ||
        session.channel_id !== interaction.channelId
      ) {
        return await respond(
          "Lượt Sinh tồn đã kết thúc hoặc nút không còn hợp lệ.",
        );
      }
      if (session.user_id !== interaction.user.id) {
        return await respond("Đây là lượt Sinh tồn của người chơi khác.");
      }
      const sourceMessageId = detailAction
        ? originMessageId || interaction.message?.id
        : interaction.message?.id;
      if (session.message_id && session.message_id !== sourceMessageId) {
        return await respond(
          "Bảng Sinh tồn này đã cũ. Dùng `/sinhton tieptuc` để mở bảng hiện tại.",
        );
      }
      if (detailAction) {
        const state = parseState(session);
        const payload = hardcoreView.hardcorePrivatePayload(
          state,
          CLASSES,
          ITEMS,
          sessionId,
          sourceMessageId,
          detailAction[1],
          Number(detailAction[2]),
        );
        const reply = await interaction.editReply(payload);
        hardcoreRepository.touchSession(sessionId);
        return reply;
      }
      const played = playHardcore({
        sessionId,
        userId: interaction.user.id,
        expectedTurn: Number(rawTurn),
        action,
      });
      return await showHardcoreTurn(
        interaction,
        sessionId,
        played.state,
        played.result,
        played.settled,
        logger,
      );
    } catch (error) {
      logger?.error?.(
        { err: error, sessionId, action, originMessageId },
        "hardcore interaction failed",
      );
      if (detailAction)
        return respond(
          "Không thể mở bảng chi tiết Sinh tồn. Hãy thử lại hoặc dùng `/sinhton tieptuc` để mở UI mới. Run và vật phẩm của bạn vẫn được giữ nguyên.",
        );
      if (error.message === "STALE_ACTION") {
        const currentSession = getSession(sessionId);
        if (
          currentSession &&
          (!currentSession.message_id ||
            currentSession.message_id === interaction.message?.id)
        ) {
          const currentState = parseState(currentSession);
          return showHardcoreTurn(
            interaction,
            sessionId,
            currentState,
            null,
            false,
            logger,
          );
        }
        return interaction.followUp({
          content:
            "Nút này thuộc bảng Sinh tồn cũ. Hãy mở bảng đang chơi để tiếp tục.",
          flags: MessageFlags.Ephemeral,
        });
      }
      const content =
        error.message === "NO_ENERGY"
          ? "Không đủ năng lượng dùng kỹ năng."
          : error.message === "NO_POTION"
            ? "Bạn đã hết bình máu."
            : error.message === "NO_RESCUE_POTIONS"
              ? "Cứu Lost Adventurer cần ít nhất 2 bình máu."
              : error.message === "FULL_HP"
                ? "HP đang đầy."
                : error.message === "ALREADY_INSPECTED"
                  ? "Bạn đã kiểm tra hòm này."
                  : error.message === "CANNOT_RETREAT"
                    ? "Không thể rút thưởng khi gặp RNGesus."
                    : error.message === "INSUFFICIENT_RUN_PAYOUT"
                      ? "Payout tích lũy của run chưa đủ trả phí dịch vụ."
                      : error.message === "NO_FORGE_ITEM"
                        ? "Bạn chưa có trang bị phù hợp để rèn."
                        : error.message === "NO_CURSE"
                          ? "Không có lời nguyền của đồ UR cần giải."
                          : error.message === "INSUFFICIENT_HP"
                            ? "HP hiện tại chưa đủ cho lựa chọn này."
                            : error.message === "NO_TICKET"
                              ? "Bạn không còn Vé Thoát Hiểm."
                              : "Không thể thực hiện lựa chọn này.";
      return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  });
}

function cleanupStaleHardcoreSessions(now = Date.now()) {
  const rows = hardcoreRepository.listStale(now - STALE_MS);
  const cleanup = db.transaction(() => {
    for (const session of rows) {
      const forfeit = Boolean(session.message_id);
      forceEndHardcoreSession(session.id, session.guild_id, "system", {
        label: forfeit ? "timeout-forfeit" : "timeout-refund",
        forfeit,
      });
    }
  });
  cleanup();
  return rows.length;
}

module.exports = {
  MIN_BET,
  MAX_BET,
  MAX_PAYOUT,
  MAX_FLOOR,
  COMPLETION_FLOOR,
  CLASSES,
  ITEMS,
  hitChance,
  defenseReduction,
  physicalAfterDefense,
  magicAfterResistance,
  resolvePhysicalAttack,
  enemyScale,
  makeEnemy,
  rngesusChance,
  rollRngesus,
  chaosLabel,
  baseMultiplier,
  potentialPayout,
  generateEncounter,
  makeSurprise,
  REGIONS,
  RIFT_MODIFIERS,
  regionForFloor,
  checkpointGrowth,
  makeChest,
  chooseRarity,
  legendaryChance,
  completeFloor,
  playerAttack,
  enemyTurn,
  applyItem,
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
  luckyBreakChance,
  goblinCatchChance,
  startHardcore,
  openHardcoreSetup,
  handleHardcoreSetup,
  playHardcore,
  getHardcoreByUser,
  getHardcoreRun,
  setMessageId,
  hardcoreEmbed,
  hardcoreRows,
  forceEndHardcoreSession,
  handleHardcoreButton,
  withHardcoreSession,
  getHardcoreRecord,
  getHardcoreTop,
  cleanupStaleHardcoreSessions,
};
