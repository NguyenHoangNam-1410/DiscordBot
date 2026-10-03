"use strict";

const TYPE_CODES = Object.freeze({
  common: "R",
  rare: "SR",
  legendary: "SSR",
  cursed: "UR",
});
const EFFECT_KEYS = new Set([
  "attack",
  "defense",
  "maxHp",
  "resistance",
  "critChance",
  "luck",
  "heal",
  "potions",
  "escapeTokens",
  "defenseSet",
  "bonusPenalty",
  "accuracy",
  "evasion",
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
]);
function define(rarity, id, name, category, effects, text, options = {}) {
  const curse = options.curse
    ? Object.freeze({
        ...options.curse,
        effects: Object.freeze({ ...options.curse.effects }),
      })
    : null;
  return Object.freeze({
    id,
    name,
    rarity,
    typeCode: TYPE_CODES[rarity],
    category,
    tags: Object.freeze([...(options.tags || [])]),
    effects: Object.freeze({ ...effects }),
    text,
    curse,
    curseText: curse?.text || null,
  });
}
const R = (...args) => define("common", ...args);
const SR = (...args) => define("rare", ...args);
const SSR = (...args) => define("legendary", ...args);
const UR = (...args) => define("cursed", ...args);

const ITEMS = Object.freeze({
  common: Object.freeze([
    R("rusted_edge", "Rusted Edge", "weapon", { attack: 2 }, "+2 sát thương", {
      tags: ["attack"],
    }),
    R(
      "iron_dagger",
      "Iron Dagger",
      "weapon",
      { attack: 1, critChance: 0.01 },
      "+1 sát thương, +1% Crit",
      { tags: ["attack", "crit"] },
    ),
    R(
      "cracked_wand",
      "Cracked Wand",
      "weapon",
      { attack: 2, resistance: 1 },
      "+2 sát thương, +1 Resistance",
      { tags: ["attack", "magic"] },
    ),
    R(
      "hunter_bow",
      "Hunter Bow",
      "weapon",
      { attack: 1, accuracy: 3 },
      "+1 sát thương, +3 Accuracy",
      { tags: ["attack", "accuracy"] },
    ),
    R(
      "militia_spear",
      "Militia Spear",
      "weapon",
      { attack: 2, accuracy: 1 },
      "+2 sát thương, +1 Accuracy",
      { tags: ["attack"] },
    ),
    R(
      "bone_club",
      "Bone Club",
      "weapon",
      { attack: 3, accuracy: -1 },
      "+3 sát thương, −1 Accuracy",
      { tags: ["attack"] },
    ),
    R("dented_plate", "Dented Plate", "armor", { defense: 2 }, "+2 Defense", {
      tags: ["defense"],
    }),
    R(
      "wooden_buckler",
      "Wooden Buckler",
      "armor",
      { defense: 2, resistance: 1 },
      "+2 Defense, +1 Resistance",
      { tags: ["defense"] },
    ),
    R("worn_boots", "Worn Boots", "armor", { evasion: 2 }, "+2 Evasion", {
      tags: ["evasion"],
    }),
    R(
      "copper_ring",
      "Copper Ring",
      "jewelry",
      { resistance: 3 },
      "+3 Resistance",
      { tags: ["resistance"] },
    ),
    R(
      "minor_life_charm",
      "Minor Life Charm",
      "charm",
      { maxHp: 8, heal: 8 },
      "+8 HP tối đa và hiện tại",
      { tags: ["hp"] },
    ),
    R("rabbit_foot", "Rabbit Foot", "charm", { luck: 1 }, "+1 Luck", {
      tags: ["luck"],
    }),
    R(
      "red_potion_belt",
      "Red Potion Belt",
      "utility",
      { potions: 1 },
      "+1 bình máu",
      { tags: ["potion"] },
    ),
    R(
      "scout_lens",
      "Scout Lens",
      "utility",
      { accuracy: 2, mimicDetection: 0.02 },
      "+2 Accuracy, +2% phát hiện Mimic",
      { tags: ["accuracy", "chest"] },
    ),
    R(
      "mana_fragment",
      "Mana Fragment",
      "charm",
      { maxEnergy: 1 },
      "+1 Energy tối đa",
      { tags: ["energy"] },
    ),
    R(
      "battle_token",
      "Battle Token",
      "charm",
      { attack: 1, defense: 1 },
      "+1 sát thương, +1 Defense",
      { tags: ["attack", "defense"] },
    ),
    R(
      "silver_thread",
      "Silver Thread",
      "jewelry",
      { resistance: 2, evasion: 1 },
      "+2 Resistance, +1 Evasion",
      { tags: ["resistance"] },
    ),
    R(
      "traveler_map",
      "Traveler Map",
      "utility",
      { luck: 1, accuracy: 1 },
      "+1 Luck, +1 Accuracy",
      { tags: ["luck"] },
    ),
    R(
      "small_ward",
      "Small Ward",
      "armor",
      { defense: 1, maxHp: 5, heal: 5 },
      "+1 Defense, +5 HP",
      { tags: ["defense", "hp"] },
    ),
    R(
      "sharpening_stone",
      "Sharpening Stone",
      "utility",
      { attack: 2 },
      "+2 sát thương",
      { tags: ["attack"] },
    ),
    R(
      "ember_bead",
      "Ember Bead",
      "jewelry",
      { attack: 1, resistance: 2 },
      "+1 sát thương, +2 Resistance",
      { tags: ["magic"] },
    ),
    R(
      "fox_mask",
      "Fox Mask",
      "armor",
      { evasion: 2, accuracy: 1 },
      "+2 Evasion, +1 Accuracy",
      { tags: ["evasion"] },
    ),
    R("oak_talisman", "Oak Talisman", "charm", { maxHp: 10 }, "+10 HP tối đa", {
      tags: ["hp"],
    }),
    R("glass_bead", "Glass Bead", "jewelry", { critChance: 0.02 }, "+2% Crit", {
      tags: ["crit"],
    }),
    R(
      "field_bandage",
      "Field Bandage",
      "utility",
      { heal: 10 },
      "Hồi 10 HP khi nhặt",
      { tags: ["healing"] },
    ),
    R("iron_nail", "Iron Nail", "charm", { defense: 2 }, "+2 Defense", {
      tags: ["defense"],
    }),
    R("hawk_feather", "Hawk Feather", "charm", { accuracy: 4 }, "+4 Accuracy", {
      tags: ["accuracy"],
    }),
    R("smoke_vial", "Smoke Vial", "utility", { evasion: 3 }, "+3 Evasion", {
      tags: ["evasion"],
    }),
    R("cold_ash", "Cold Ash", "charm", { resistance: 3 }, "+3 Resistance", {
      tags: ["resistance"],
    }),
    R(
      "goblin_hook",
      "Goblin Hook",
      "utility",
      { goblinChance: 0.02 },
      "+2% bắt Treasure Goblin",
      { tags: ["goblin"] },
    ),
    R(
      "chest_chalk",
      "Chest Chalk",
      "utility",
      { mimicDetection: 0.03 },
      "+3% phát hiện Mimic",
      { tags: ["chest"] },
    ),
    R(
      "faded_clover",
      "Faded Clover",
      "charm",
      { luck: 1, maxHp: 3, heal: 3 },
      "+1 Luck, +3 HP",
      { tags: ["luck", "hp"] },
    ),
  ]),
  rare: Object.freeze([
    SR(
      "hunters_fang",
      "Hunter’s Fang",
      "weapon",
      { attack: 4, critChance: 0.04 },
      "+4 sát thương, +4% Crit",
      { tags: ["attack", "crit"] },
    ),
    SR(
      "runed_carapace",
      "Runed Carapace",
      "armor",
      { defense: 5, resistance: 5 },
      "+5 Defense, +5 Resistance",
      { tags: ["defense", "resistance"] },
    ),
    SR(
      "heart_of_the_wild",
      "Heart of the Wild",
      "charm",
      { maxHp: 22, heal: 22 },
      "+22 HP tối đa và hiện tại",
      { tags: ["hp"] },
    ),
    SR("lucky_coin", "Lucky Coin", "charm", { luck: 3 }, "+3 Luck", {
      tags: ["luck"],
    }),
    SR(
      "vanguard_spear",
      "Vanguard Spear",
      "weapon",
      { attack: 5, accuracy: 4 },
      "+5 sát thương, +4 Accuracy",
      { tags: ["attack", "accuracy"] },
    ),
    SR(
      "shadowstep_boots",
      "Shadowstep Boots",
      "armor",
      { evasion: 5, critChance: 0.02 },
      "+5 Evasion, +2% Crit",
      { tags: ["evasion", "crit"] },
    ),
    SR(
      "bone_talisman",
      "Bone Talisman",
      "charm",
      { maxHp: 15, heal: 15, resistance: 4 },
      "+15 HP, +4 Resistance",
      { tags: ["hp", "resistance"] },
    ),
    SR(
      "bloodstone",
      "Bloodstone",
      "jewelry",
      { attack: 4, maxHp: 10, heal: 10 },
      "+4 sát thương, +10 HP",
      { tags: ["attack", "hp"] },
    ),
    SR(
      "rift_compass",
      "Rift Compass",
      "utility",
      { luck: 2, mimicDetection: 0.08 },
      "+2 Luck, +8% phát hiện Mimic",
      { tags: ["luck", "chest"] },
    ),
    SR(
      "alchemist_belt",
      "Alchemist Belt",
      "utility",
      { potions: 1, potionPower: 0.05 },
      "+1 bình, bình máu hồi thêm 5%",
      { tags: ["potion"] },
    ),
    SR(
      "guardian_seal",
      "Guardian Seal",
      "armor",
      { defense: 6, maxHp: 8, heal: 8 },
      "+6 Defense, +8 HP",
      { tags: ["defense", "hp"] },
    ),
    SR(
      "mana_prism",
      "Mana Prism",
      "charm",
      { maxEnergy: 1, resistance: 4 },
      "+1 Energy tối đa, +4 Resistance",
      { tags: ["energy", "resistance"] },
    ),
    SR(
      "goblin_snare",
      "Goblin Snare",
      "utility",
      { goblinChance: 0.08, luck: 1 },
      "+8% bắt Goblin, +1 Luck",
      { tags: ["goblin", "luck"] },
    ),
    SR(
      "wardens_chain",
      "Warden’s Chain",
      "armor",
      { defense: 7, evasion: -1 },
      "+7 Defense, −1 Evasion",
      { tags: ["defense"] },
    ),
    SR(
      "moonlit_blade",
      "Moonlit Blade",
      "weapon",
      { attack: 5, resistance: 4 },
      "+5 sát thương, +4 Resistance",
      { tags: ["attack", "magic"] },
    ),
    SR(
      "assassins_ribbon",
      "Assassin’s Ribbon",
      "charm",
      { critChance: 0.05, evasion: 3 },
      "+5% Crit, +3 Evasion",
      { tags: ["crit", "evasion"] },
    ),
    SR(
      "lionheart_emblem",
      "Lionheart Emblem",
      "charm",
      { maxHp: 18, attack: 3 },
      "+18 HP, +3 sát thương",
      { tags: ["hp", "attack"] },
    ),
    SR(
      "stormglass",
      "Stormglass",
      "jewelry",
      { attack: 4, accuracy: 6 },
      "+4 sát thương, +6 Accuracy",
      { tags: ["attack", "accuracy"] },
    ),
    SR(
      "saints_ward",
      "Saint’s Ward",
      "armor",
      { resistance: 9, defense: 3 },
      "+9 Resistance, +3 Defense",
      { tags: ["resistance", "defense"] },
    ),
    SR(
      "riftwalkers_boots",
      "Riftwalker’s Boots",
      "armor",
      { evasion: 7, luck: 1 },
      "+7 Evasion, +1 Luck",
      { tags: ["evasion", "luck"] },
    ),
    SR(
      "executioners_mark",
      "Executioner’s Mark",
      "charm",
      { eliteDamage: 0.12, attack: 2 },
      "+12% damage lên Elite, +2 sát thương",
      { tags: ["elite", "attack"] },
    ),
    SR(
      "boss_hunters_badge",
      "Boss Hunter’s Badge",
      "charm",
      { bossDamage: 0.12, maxHp: 8 },
      "+12% damage lên Boss, +8 HP",
      { tags: ["boss"] },
    ),
    SR(
      "golden_monocle",
      "Golden Monocle",
      "utility",
      { legendaryFind: 0.03, mimicDetection: 0.05 },
      "+3% cơ hội SSR, +5% phát hiện Mimic",
      { tags: ["chest"] },
    ),
    SR(
      "deep_flask",
      "Deep Flask",
      "utility",
      { potionPower: 0.1 },
      "Bình máu hồi thêm 10%",
      { tags: ["potion"] },
    ),
    SR(
      "war_drums",
      "War Drums",
      "charm",
      { attack: 3, accuracy: 5, maxHp: 5 },
      "+3 sát thương, +5 Accuracy, +5 HP",
      { tags: ["attack"] },
    ),
    SR(
      "spirit_lantern",
      "Spirit Lantern",
      "utility",
      { resistance: 6, maxEnergy: 1 },
      "+6 Resistance, +1 Energy tối đa",
      { tags: ["energy"] },
    ),
    SR(
      "steel_lotus",
      "Steel Lotus",
      "armor",
      { defense: 5, evasion: 4 },
      "+5 Defense, +4 Evasion",
      { tags: ["defense", "evasion"] },
    ),
    SR(
      "fortune_dice",
      "Fortune Dice",
      "charm",
      { luck: 4, accuracy: -2 },
      "+4 Luck, −2 Accuracy",
      { tags: ["luck"] },
    ),
  ]),
  legendary: Object.freeze([
    SSR(
      "one_more_hit",
      "One More Hit",
      "charm",
      { escapeTokens: 1, maxHp: 15, heal: 15 },
      "+15 HP, nhận 1 Vé Thoát Hiểm",
      { tags: ["survival"] },
    ),
    SSR(
      "last_bad_decision",
      "The Last Bad Decision",
      "weapon",
      { attack: 9, critChance: 0.08, maxHp: -15 },
      "+9 sát thương, +8% Crit, −15 HP tối đa",
      { tags: ["attack", "crit"] },
    ),
    SSR(
      "wardens_bulwark",
      "Warden’s Bulwark",
      "armor",
      { defense: 10, resistance: 12 },
      "+10 Defense, +12 Resistance",
      { tags: ["defense"] },
    ),
    SSR(
      "eye_of_rngesus",
      "Eye of RNGesus",
      "charm",
      { luck: 7, attack: 3 },
      "+7 Luck, +3 sát thương",
      { tags: ["luck"] },
    ),
    SSR(
      "phoenix_blood",
      "Phoenix Blood",
      "charm",
      { maxHp: 35, heal: 35, resistance: 8 },
      "+35 HP, +8 Resistance",
      { tags: ["hp"] },
    ),
    SSR(
      "riftbreaker",
      "Riftbreaker",
      "weapon",
      { attack: 10, bossDamage: 0.2, eliteDamage: 0.15 },
      "+10 sát thương, +20% Boss damage, +15% Elite damage",
      { tags: ["boss", "elite"] },
    ),
    SSR(
      "living_armor",
      "Living Armor",
      "armor",
      { defense: 12, maxHp: 25, heal: 25 },
      "+12 Defense, +25 HP",
      { tags: ["defense", "hp"] },
    ),
    SSR(
      "mimic_crown",
      "Mimic Crown",
      "armor",
      { mimicDetection: 0.2, legendaryFind: 0.05, luck: 3 },
      "+20% phát hiện Mimic, +5% SSR, +3 Luck",
      { tags: ["chest"] },
    ),
    SSR(
      "endless_flask",
      "Endless Flask",
      "utility",
      { potionPower: 0.2, potions: 1 },
      "+1 bình, bình máu hồi thêm 20%",
      { tags: ["potion"] },
    ),
    SSR(
      "chrono_shard",
      "Chrono Shard",
      "charm",
      { evasion: 8, accuracy: 8, luck: 2 },
      "+8 Evasion, +8 Accuracy, +2 Luck",
      { tags: ["evasion"] },
    ),
    SSR(
      "seraphic_aegis",
      "Seraphic Aegis",
      "armor",
      { defense: 14, resistance: 15 },
      "+14 Defense, +15 Resistance",
      { tags: ["defense"] },
    ),
    SSR(
      "doomwhisper",
      "Doomwhisper",
      "weapon",
      { attack: 12, critChance: 0.1 },
      "+12 sát thương, +10% Crit",
      { tags: ["attack", "crit"] },
    ),
    SSR(
      "worldroot_seed",
      "Worldroot Seed",
      "charm",
      { maxHp: 45, heal: 45, defense: 5 },
      "+45 HP, +5 Defense",
      { tags: ["hp"] },
    ),
    SSR(
      "void_lens",
      "Void Lens",
      "utility",
      { legendaryFind: 0.08, mimicDetection: 0.15 },
      "+8% SSR, +15% phát hiện Mimic",
      { tags: ["chest"] },
    ),
    SSR(
      "angelic_engine",
      "Angelic Engine",
      "charm",
      { maxEnergy: 2, resistance: 8 },
      "+2 Energy tối đa, +8 Resistance",
      { tags: ["energy"] },
    ),
    SSR(
      "predators_instinct",
      "Predator’s Instinct",
      "charm",
      { eliteDamage: 0.25, critChance: 0.06, accuracy: 6 },
      "+25% Elite damage, +6% Crit, +6 Accuracy",
      { tags: ["elite"] },
    ),
    SSR(
      "deimoss_scar",
      "Deimoss Scar",
      "charm",
      { bossDamage: 0.3, attack: 6 },
      "+30% Boss damage, +6 sát thương",
      { tags: ["boss"] },
    ),
    SSR(
      "golden_goblet",
      "Golden Goblet",
      "utility",
      { goblinChance: 0.18, luck: 5 },
      "+18% bắt Goblin, +5 Luck",
      { tags: ["goblin"] },
    ),
    SSR(
      "astral_mail",
      "Astral Mail",
      "armor",
      { defense: 10, evasion: 8, resistance: 10 },
      "+10 Defense, +8 Evasion, +10 Resistance",
      { tags: ["defense"] },
    ),
    SSR(
      "blood_moon_edge",
      "Blood Moon Edge",
      "weapon",
      { attack: 11, maxHp: 20, heal: 20 },
      "+11 sát thương, +20 HP",
      { tags: ["attack", "hp"] },
    ),
    SSR(
      "oracle_mask",
      "Oracle Mask",
      "armor",
      { accuracy: 12, luck: 5, resistance: 6 },
      "+12 Accuracy, +5 Luck, +6 Resistance",
      { tags: ["accuracy"] },
    ),
    SSR(
      "eternal_clover",
      "Eternal Clover",
      "charm",
      { luck: 9, legendaryFind: 0.04 },
      "+9 Luck, +4% SSR",
      { tags: ["luck", "chest"] },
    ),
    SSR(
      "titan_heart",
      "Titan Heart",
      "charm",
      { maxHp: 60, heal: 60, attack: 4 },
      "+60 HP, +4 sát thương",
      { tags: ["hp"] },
    ),
    SSR(
      "sevenfold_sigil",
      "Sevenfold Sigil",
      "jewelry",
      { attack: 5, defense: 7, resistance: 7, luck: 3 },
      "+5 damage, +7 Defense, +7 Resistance, +3 Luck",
      { tags: ["hybrid"] },
    ),
  ]),
  cursed: Object.freeze([
    UR(
      "glass_cannon",
      "Glass Cannon",
      "weapon",
      { attack: 16, critChance: 0.08 },
      "+16 sát thương, +8% Crit",
      {
        tags: ["attack", "cursed"],
        curse: {
          id: "shattered_armor",
          effects: { defenseSet: 0 },
          text: "Defense bị đặt về 0 khi nhặt",
        },
      },
    ),
    UR(
      "schrodingers_armor",
      "Schrödinger’s Armor",
      "armor",
      { defense: 16, maxHp: 35, heal: 35 },
      "+16 Defense, +35 HP",
      {
        tags: ["defense", "cursed"],
        curse: {
          id: "frail_body",
          effects: { maxHp: -25 },
          text: "−25 HP tối đa",
        },
      },
    ),
    UR(
      "goblins_debt",
      "Goblin’s Debt",
      "charm",
      { luck: 12, goblinChance: 0.2 },
      "+12 Luck, +20% bắt Goblin",
      {
        tags: ["luck", "cursed"],
        curse: {
          id: "goblin_tax",
          effects: { bonusPenalty: 0.15 },
          text: "Mất 15% payout hiện tại",
        },
      },
    ),
    UR(
      "crown_of_ruin",
      "Crown of Ruin",
      "armor",
      { defense: 15, luck: 8 },
      "+15 Defense, +8 Luck",
      {
        tags: ["defense", "cursed"],
        curse: {
          id: "gold_decay",
          effects: { bonusPenalty: 0.1 },
          text: "Mất 10% payout hiện tại",
        },
      },
    ),
    UR(
      "blood_pact",
      "Blood Pact",
      "weapon",
      { attack: 20, critChance: 0.1 },
      "+20 sát thương, +10% Crit",
      {
        tags: ["attack", "cursed"],
        curse: {
          id: "blood_price",
          effects: { maxHp: -30 },
          text: "−30 HP tối đa",
        },
      },
    ),
    UR(
      "void_heart",
      "Void Heart",
      "charm",
      { maxHp: 60, heal: 60, resistance: 15 },
      "+60 HP, +15 Resistance",
      {
        tags: ["hp", "cursed"],
        curse: {
          id: "weak_potions",
          effects: { potionPower: -0.15 },
          text: "Bình máu hồi ít hơn 15%",
        },
      },
    ),
    UR(
      "broken_hourglass",
      "Broken Hourglass",
      "charm",
      { evasion: 12, luck: 8 },
      "+12 Evasion, +8 Luck",
      {
        tags: ["evasion", "cursed"],
        curse: {
          id: "time_bleed",
          effects: { floorHpLoss: 0.04 },
          text: "Mất 4% HP tối đa sau mỗi tầng",
        },
      },
    ),
    UR(
      "mimics_promise",
      "Mimic’s Promise",
      "utility",
      { legendaryFind: 0.12, mimicDetection: 0.1 },
      "+12% SSR, +10% phát hiện Mimic",
      {
        tags: ["chest", "cursed"],
        curse: {
          id: "mimic_attraction",
          effects: { mimicChance: 0.12 },
          text: "Tăng 12% tỷ lệ Mimic",
        },
      },
    ),
    UR(
      "berserker_chains",
      "Berserker Chains",
      "weapon",
      { attack: 22, eliteDamage: 0.2 },
      "+22 sát thương, +20% Elite damage",
      {
        tags: ["attack", "cursed"],
        curse: {
          id: "open_wounds",
          effects: { damageTaken: 0.18 },
          text: "Nhận thêm 18% sát thương",
        },
      },
    ),
    UR(
      "hollow_crown",
      "Hollow Crown",
      "armor",
      { maxEnergy: 2, resistance: 18 },
      "+2 Energy tối đa, +18 Resistance",
      {
        tags: ["energy", "cursed"],
        curse: {
          id: "paper_armor",
          effects: { defense: -10 },
          text: "−10 Defense",
        },
      },
    ),
    UR(
      "ashen_wings",
      "Ashen Wings",
      "armor",
      { evasion: 15, accuracy: 10 },
      "+15 Evasion, +10 Accuracy",
      {
        tags: ["evasion", "cursed"],
        curse: {
          id: "burned_soul",
          effects: { resistance: -20 },
          text: "−20 Resistance",
        },
      },
    ),
    UR(
      "soul_leash",
      "Soul Leash",
      "charm",
      { bossDamage: 0.35, attack: 8 },
      "+35% Boss damage, +8 sát thương",
      {
        tags: ["boss", "cursed"],
        curse: {
          id: "energy_seal",
          effects: { maxEnergy: -2 },
          text: "−2 Energy tối đa",
        },
      },
    ),
    UR(
      "bleeding_star",
      "Bleeding Star",
      "jewelry",
      { critChance: 0.18, attack: 12 },
      "+18% Crit, +12 sát thương",
      {
        tags: ["crit", "cursed"],
        curse: {
          id: "star_bleed",
          effects: { floorHpLoss: 0.06 },
          text: "Mất 6% HP tối đa sau mỗi tầng",
        },
      },
    ),
    UR(
      "null_idol",
      "Null Idol",
      "charm",
      { defense: 18, resistance: 12 },
      "+18 Defense, +12 Resistance",
      {
        tags: ["defense", "cursed"],
        curse: {
          id: "blind_faith",
          effects: { luck: -6, accuracy: -10 },
          text: "−6 Luck, −10 Accuracy",
        },
      },
    ),
    UR(
      "black_sun",
      "Black Sun",
      "charm",
      { legendaryFind: 0.15, luck: 10 },
      "+15% SSR, +10 Luck",
      {
        tags: ["luck", "cursed"],
        curse: {
          id: "dead_flask",
          effects: { potionPower: -0.2 },
          text: "Bình máu hồi ít hơn 20%",
        },
      },
    ),
    UR(
      "oathbreaker",
      "Oathbreaker",
      "weapon",
      { bossDamage: 0.25, eliteDamage: 0.25, attack: 10 },
      "+25% damage lên Boss/Elite, +10 sát thương",
      {
        tags: ["boss", "elite", "cursed"],
        curse: {
          id: "broken_guard",
          effects: { defense: -8, evasion: -6 },
          text: "−8 Defense, −6 Evasion",
        },
      },
    ),
  ]),
});

function validateItems(catalog = ITEMS) {
  const ids = new Set();
  const names = new Set();
  let payoutCurses = 0;
  const expectedCounts = { common: 32, rare: 28, legendary: 24, cursed: 16 };
  for (const rarity of ["common", "rare", "legendary", "cursed"])
    for (const item of catalog[rarity] || []) {
      if (
        !item.id ||
        !item.name ||
        item.rarity !== rarity ||
        item.typeCode !== TYPE_CODES[rarity] ||
        !item.category ||
        !item.text ||
        !item.effects ||
        !Object.keys(item.effects).length
      ) {
        throw new Error(`INVALID_HARDCORE_ITEM:${rarity}`);
      }
      if (ids.has(item.id) || names.has(item.name))
        throw new Error(`DUPLICATE_HARDCORE_ITEM:${item.id}`);
      if (rarity === "cursed" && !item.curse)
        throw new Error(`MISSING_HARDCORE_CURSE:${item.id}`);
      for (const [key, value] of Object.entries(item.effects))
        if (!EFFECT_KEYS.has(key) || !Number.isFinite(value))
          throw new Error(`INVALID_HARDCORE_EFFECT:${item.id}:${key}`);
      for (const [key, value] of Object.entries(item.curse?.effects || {})) {
        if (!EFFECT_KEYS.has(key) || !Number.isFinite(value))
          throw new Error(`INVALID_HARDCORE_CURSE_EFFECT:${item.id}:${key}`);
        if (key === "bonusPenalty") payoutCurses += 1;
      }
      ids.add(item.id);
      names.add(item.name);
    }
  if (ids.size !== 100)
    throw new Error(`INVALID_HARDCORE_ITEM_COUNT:${ids.size}`);
  for (const [rarity, count] of Object.entries(expectedCounts))
    if ((catalog[rarity] || []).length !== count)
      throw new Error(`INVALID_HARDCORE_RARITY_COUNT:${rarity}`);
  if (payoutCurses !== 2)
    throw new Error(`INVALID_HARDCORE_PAYOUT_CURSE_COUNT:${payoutCurses}`);
  return true;
}
validateItems();
module.exports = { ITEMS, TYPE_CODES, validateItems };
