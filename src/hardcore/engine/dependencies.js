"use strict";
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const addSource = (...args) => dependencies.addSource(...args);
  const heal = (...args) => dependencies.heal(...args);

  const { createHash } = require("node:crypto");

  const stats = require("./stats");

  const itemPassives = require("../itemPassives");

  const monsterLoot = require("../monsterLoot");

  const godRngesus = require("../events/godRngesus");
  const covenant = require("../events/covenant");
  const gilded = require("../events/gildedSoul");
  const royal = require("../events/royalInvitation");
  const bosses = require("../bosses/mechanics");

  const memories = require("../towerMemories");

  const {
    rngesusEncounterChance,
    resetRngesusEncounter,
  } = require("../events/rngesus");

  const paradox = require("../events/paradox");

  const {
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    memoryIcon,
    treasureChestIcon,
    passiveIcon,
  } = require("../shared/icons");

  const world = require("./world");

  const echoes = require("../storage/echoes");

  const {
    ITEMS,
    ITEM_POOLS,
    CONSUMABLE_ITEMS,
    RELIC_ITEMS,
    RELIC_RULES,
  } = require("../item");

  const {
    GOBLIN_REWARDS,
    goblinRewardRarity,
  } = require("../legacy/formulas/index");

  const { spendDiamonds } = require("../../services/playerLevelService");

  const { runDiamondReward, baseMultiplier } = require("../shared/rewards");

  const { clamp, recompute, addSource: applySource, mainStat } = stats;

  const RESULT_STATS = [
    "str",
    "dex",
    "vit",
    "ene",
    "maxHp",
    "hp",
    "damageMin",
    "damageMax",
    "spellMin",
    "spellMax",
    "defense",
    "accuracy",
    "evasion",
    "resistance",
    "critChance",
    "mana",
    "maxMana",
    "luck",
    "potions",
    "escapeTokens",
    "potionRate",
  ];

  const statSnapshot = (state) =>
    Object.fromEntries(RESULT_STATS.map((key) => [key, state[key]]));

  const EVENTS = [
    "healer",
    "goblin",
    "blacksmith",
    "purifier",
    "sacrifice",
    "gambler",
    "adventurer",
    "fountain",
    "horadric",
    "merchant",
    "mirror",
    "treasure_room",
    "contract",
    "class_shrine",
    "doors",
    "duelist",
    "payout_shop",
    "blood_shop",
    "diamond_shop",
  ];

  const PURIFIER_COST_RATE = 0.1;

  const PURIFIER_EVENT_WEIGHT = 3;

  const PAID_EVENTS = new Set([
    "blacksmith",
    "purifier",
    "sacrifice",
    "gambler",
    "adventurer",
    "horadric",
    "merchant",
    "payout_shop",
    "blood_shop",
    "diamond_shop",
  ]);

  const EVENT_NAMES = {
    healer: "Wandering Healer",
    goblin: "Treasure Goblin",
    blacksmith: "Blacksmith",
    purifier: "Purifier",
    sacrifice: "Altar of Sacrifice",
    gambler: "Cursed Gambler",
    adventurer: "Lost Adventurer",
    fountain: "Blood Fountain",
    horadric: "Horadric Forge",
    merchant: "Rift Merchant",
    mirror: "Mirror of Fate",
    treasure_room: "Treasure Room",
    contract: "Rift Contract",
    class_shrine: "Class Shrine",
    doors: "Strange Doors",
    duelist: "Rift Duelist",
    payout_shop: "Payout Item Shop",
    blood_shop: "Blood Item Shop",
    diamond_shop: "Diamond Item Shop",
  };

  const pick = (pool, rng) => pool[Math.floor(rng() * pool.length)];

  const int = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));

  const randomItem = (rarity, rng) =>
    structuredClone(pick(ITEM_POOLS[rarity], rng));

  const SHRINE_KINDS = Object.freeze([
    "healing",
    "armor",
    "treasure",
    "experience",
    "corrupted",
    "fake",
  ]);

  const SHRINE_TREASURE_WEIGHTS = Object.freeze({
    common: 50,
    rare: 30,
    legendary: 15,
    cursed: 5,
  });

  const MERCHANT_PRICES = {
    potion: 0.025,
    heal: 0.04,
    luck: 0.05,
    item: 0.075,
    ticket: 0.125,
    chest: 0.075,
  };

  const PAYOUT_PRICES = Object.freeze({
    common: 0.05,
    rare: 0.12,
    legendary: 0.25,
  });

  const BLOOD_PRICES = Object.freeze({
    rare: 0.12,
    legendary: 0.25,
    cursed: 0.4,
  });

  const DIAMOND_PRICES = { rare: 100, legendary: 300, cursed: 480 };
  return {
    createHash,
    stats,
    itemPassives,
    monsterLoot,
    godRngesus,
    covenant,
    gilded,
    royal,
    bosses,
    memories,
    rngesusEncounterChance,
    resetRngesusEncounter,
    paradox,
    E,
    SKILL_ICONS,
    RIFT_ICONS,
    eventIcon,
    memoryIcon,
    treasureChestIcon,
    passiveIcon,
    world,
    echoes,
    ITEMS,
    ITEM_POOLS,
    CONSUMABLE_ITEMS,
    RELIC_ITEMS,
    RELIC_RULES,
    GOBLIN_REWARDS,
    goblinRewardRarity,
    spendDiamonds,
    runDiamondReward,
    baseMultiplier,
    clamp,
    recompute,
    applySource,
    mainStat,
    RESULT_STATS,
    statSnapshot,
    EVENTS,
    PURIFIER_COST_RATE,
    PURIFIER_EVENT_WEIGHT,
    PAID_EVENTS,
    EVENT_NAMES,
    pick,
    int,
    randomItem,
    SHRINE_KINDS,
    SHRINE_TREASURE_WEIGHTS,
    MERCHANT_PRICES,
    PAYOUT_PRICES,
    BLOOD_PRICES,
    DIAMOND_PRICES,
  };
};
