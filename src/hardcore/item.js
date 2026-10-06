"use strict";
// Sinh tồn 2.0.0 — generated from docs/releases/hardcore-2.0.0-spec.md.
const passives = require("./itemPassives");
const ITEMS = {
  common: [
    {
      id: "rusted_edge",
      name: "Rusted Edge",
      category: "weapon",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.1,
      },
      effects: {
        str: 5,
      },
      text: "+5 STR",
      curse: null,
    },
    {
      id: "cracked_wand",
      name: "Cracked Wand",
      category: "weapon",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "mpLeech",
        amount: 0.08,
      },
      effects: {
        ene: 5,
      },
      text: "+5 ENE",
      curse: null,
    },
    {
      id: "hunter_bow",
      name: "Hunter Bow",
      category: "weapon",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "dodgeCounter",
        amount: 0.1,
      },
      effects: {
        dex: 5,
      },
      text: "+5 DEX",
      curse: null,
    },
    {
      id: "minor_life_charm",
      name: "Minor Life Charm",
      category: "charm",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "thorns",
        amount: 0.05,
      },
      effects: {
        vit: 5,
      },
      text: "+5 VIT",
      curse: null,
    },
    {
      id: "rabbit_foot",
      name: "Rabbit Foot",
      category: "charm",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "eventLuck",
        amount: 0.02,
      },
      effects: {
        luck: 1,
      },
      text: "+1 Luck",
      curse: null,
    },
    {
      id: "red_potion_belt",
      name: "Red Potion Belt",
      category: "utility",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "potionCapacity",
        amount: 1,
      },
      effects: {
        potions: 1,
      },
      text: "+1 bình khi nhận mỗi cấp",
      curse: null,
    },
    {
      id: "mana_fragment",
      name: "Mana Fragment",
      category: "charm",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "startMana",
        amount: 0.2,
      },
      effects: {
        maxMana: 1,
      },
      text: "+1 Max MP",
      curse: null,
    },
    {
      id: "field_bandage",
      name: "Field Bandage",
      category: "utility",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "campHeal",
        amount: 0.01,
      },
      effects: {
        heal: 10,
      },
      text: "hồi 10 HP khi nhận mỗi cấp",
      curse: null,
    },
    {
      id: "goblin_hook",
      name: "Goblin Hook",
      category: "utility",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "shopDiscount",
        amount: 0.03,
      },
      effects: {
        goblinChance: 0.02,
      },
      text: "+2% bắt Goblin",
      curse: null,
    },
    {
      id: "chest_chalk",
      name: "Chest Chalk",
      category: "utility",
      rarity: "common",
      typeCode: "R",
      catalogVersion: 2,
      passive: {
        kind: "trapResistance",
        amount: 0.05,
      },
      effects: {
        mimicDetection: 0.03,
      },
      text: "+3% phát hiện Mimic",
      curse: null,
    },
  ],
  rare: [
    {
      id: "heart_of_the_wild",
      name: "Heart of the Wild",
      category: "charm",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "campHeal",
        amount: 0.02,
      },
      effects: {
        vit: 10,
      },
      text: "+10 VIT",
      curse: null,
    },
    {
      id: "lucky_coin",
      name: "Lucky Coin",
      category: "charm",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "eventLuck",
        amount: 0.03,
      },
      effects: {
        luck: 3,
      },
      text: "+3 Luck",
      curse: null,
    },
    {
      id: "vanguard_spear",
      name: "Vanguard Spear",
      category: "weapon",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "guardReflect",
        amount: 0.15,
      },
      effects: {
        str: 10,
      },
      text: "+10 STR",
      curse: null,
    },
    {
      id: "shadowstep_boots",
      name: "Shadowstep Boots",
      category: "armor",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "dodgeCounter",
        amount: 0.15,
      },
      effects: {
        dex: 10,
      },
      text: "+10 DEX",
      curse: null,
    },
    {
      id: "rift_compass",
      name: "Rift Compass",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "trapResistance",
        amount: 0.1,
      },
      effects: {
        mimicDetection: 0.08,
      },
      text: "+8% phát hiện Mimic",
      curse: null,
    },
    {
      id: "alchemist_belt",
      name: "Alchemist Belt",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "potionCapacity",
        amount: 1,
      },
      effects: {
        potions: 2,
      },
      text: "+2 bình khi nhận mỗi cấp",
      curse: null,
    },
    {
      id: "mana_prism",
      name: "Mana Prism",
      category: "charm",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "mpLeech",
        amount: 0.12,
      },
      effects: {
        ene: 10,
      },
      text: "+10 ENE",
      curse: null,
    },
    {
      id: "goblin_snare",
      name: "Goblin Snare",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "shopDiscount",
        amount: 0.05,
      },
      effects: {
        goblinChance: 0.08,
      },
      text: "+8% bắt Goblin",
      curse: null,
    },
    {
      id: "executioners_mark",
      name: "Executioner’s Mark",
      category: "charm",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "critCap",
        amount: 0.03,
      },
      effects: {
        eliteDamage: 0.12,
      },
      text: "+12% damage Elite",
      curse: null,
    },
    {
      id: "boss_hunters_badge",
      name: "Boss Hunter’s Badge",
      category: "charm",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.15,
      },
      effects: {
        bossDamage: 0.12,
      },
      text: "+12% damage Boss",
      curse: null,
    },
    {
      id: "golden_monocle",
      name: "Golden Monocle",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "evasionCap",
        amount: 0.03,
      },
      effects: {
        legendaryFind: 0.03,
      },
      text: "+3% tìm SSR",
      curse: null,
    },
    {
      id: "deep_flask",
      name: "Deep Flask",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "potionSave",
        amount: 0.08,
      },
      effects: {
        potionPower: 0.1,
      },
      text: "+10% hiệu lực bình",
      curse: null,
    },
    {
      id: "spirit_lantern",
      name: "Spirit Lantern",
      category: "utility",
      rarity: "rare",
      typeCode: "SR",
      catalogVersion: 2,
      passive: {
        kind: "startMana",
        amount: 0.3,
      },
      effects: {
        maxMana: 2,
      },
      text: "+2 Max MP",
      curse: null,
    },
  ],
  legendary: [
    {
      id: "one_more_hit",
      name: "One More Hit",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "potionSave",
        amount: 0.12,
      },
      effects: {
        vit: 12,
        escapeTokens: 1,
      },
      text: "+12 VIT · +1 Vé Thoát Hiểm khi nhận mỗi cấp",
      curse: null,
    },
    {
      id: "the_last_bad_decision",
      name: "The Last Bad Decision",
      category: "weapon",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.22,
      },
      effects: {
        str: 12,
        dex: 12,
        vit: -5,
      },
      text: "+12 STR, +12 DEX, -5 VIT",
      curse: null,
    },
    {
      id: "wardens_bulwark",
      name: "Warden’s Bulwark",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "guardReflect",
        amount: 0.25,
      },
      effects: {
        str: 10,
        vit: 8,
        ene: 8,
      },
      text: "+10 STR, +8 VIT, +8 ENE",
      curse: null,
    },
    {
      id: "eye_of_rngesus",
      name: "Eye of RNGesus",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["doors", "portal"],
      },
      effects: {
        str: 5,
        dex: 5,
        ene: 5,
        luck: 7,
      },
      text: "+5 STR, +5 DEX, +5 ENE · +7 Luck",
      curse: null,
    },
    {
      id: "phoenix_blood",
      name: "Phoenix Blood",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "campHeal",
        amount: 0.03,
      },
      effects: {
        vit: 16,
        ene: 8,
      },
      text: "+16 VIT, +8 ENE",
      curse: null,
    },
    {
      id: "riftbreaker",
      name: "Riftbreaker",
      category: "weapon",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "thorns",
        amount: 0.12,
      },
      effects: {
        str: 12,
        dex: 8,
        bossDamage: 0.2,
        eliteDamage: 0.15,
      },
      text: "+12 STR, +8 DEX · +20% damage Boss, +15% damage Elite",
      curse: null,
    },
    {
      id: "living_armor",
      name: "Living Armor",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "thorns",
        amount: 0.12,
      },
      effects: {
        str: 10,
        vit: 16,
      },
      text: "+10 STR, +16 VIT",
      curse: null,
    },
    {
      id: "mimic_crown",
      name: "Mimic Crown",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["treasure_room", "fountain"],
      },
      effects: {
        dex: 6,
        ene: 6,
        luck: 3,
        mimicDetection: 0.2,
        legendaryFind: 0.05,
      },
      text: "+6 DEX, +6 ENE · +3 Luck, +20% phát hiện Mimic, +5% tìm SSR",
      curse: null,
    },
    {
      id: "endless_flask",
      name: "Endless Flask",
      category: "utility",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "potionCapacity",
        amount: 2,
      },
      effects: {
        vit: 10,
        ene: 8,
        potionPower: 0.2,
        potions: 1,
      },
      text: "+10 VIT, +8 ENE · +20% hiệu lực bình, +1 bình khi nhận mỗi cấp",
      curse: null,
    },
    {
      id: "chrono_shard",
      name: "Chrono Shard",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "evasionCap",
        amount: 0.05,
      },
      effects: {
        dex: 20,
        luck: 2,
      },
      text: "+20 DEX · +2 Luck",
      curse: null,
    },
    {
      id: "seraphic_aegis",
      name: "Seraphic Aegis",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "guardReflect",
        amount: 0.25,
      },
      effects: {
        str: 10,
        vit: 6,
        ene: 12,
      },
      text: "+10 STR, +6 VIT, +12 ENE",
      curse: null,
    },
    {
      id: "doomwhisper",
      name: "Doomwhisper",
      category: "weapon",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "critCap",
        amount: 0.05,
      },
      effects: {
        str: 14,
        dex: 12,
      },
      text: "+14 STR, +12 DEX",
      curse: null,
    },
    {
      id: "worldroot_seed",
      name: "Worldroot Seed",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "campHeal",
        amount: 0.03,
      },
      effects: {
        str: 4,
        vit: 22,
      },
      text: "+4 STR, +22 VIT",
      curse: null,
    },
    {
      id: "void_lens",
      name: "Void Lens",
      category: "utility",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["mirror", "portal"],
      },
      effects: {
        dex: 8,
        ene: 8,
        mimicDetection: 0.15,
        legendaryFind: 0.08,
      },
      text: "+8 DEX, +8 ENE · +15% phát hiện Mimic, +8% tìm SSR",
      curse: null,
    },
    {
      id: "angelic_engine",
      name: "Angelic Engine",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "mpLeech",
        amount: 0.18,
      },
      effects: {
        vit: 6,
        ene: 18,
        maxMana: 2,
      },
      text: "+6 VIT, +18 ENE · +2 Max MP",
      curse: null,
    },
    {
      id: "predators_instinct",
      name: "Predator’s Instinct",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "dodgeCounter",
        amount: 0.25,
      },
      effects: {
        str: 6,
        dex: 14,
        eliteDamage: 0.25,
      },
      text: "+6 STR, +14 DEX · +25% damage Elite",
      curse: null,
    },
    {
      id: "deimoss_scar",
      name: "Deimoss Scar",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.22,
      },
      effects: {
        str: 14,
        vit: 6,
        bossDamage: 0.3,
      },
      text: "+14 STR, +6 VIT · +30% damage Boss",
      curse: null,
    },
    {
      id: "golden_goblet",
      name: "Golden Goblet",
      category: "utility",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "shopDiscount",
        amount: 0.08,
      },
      effects: {
        dex: 6,
        vit: 6,
        luck: 5,
        goblinChance: 0.18,
      },
      text: "+6 DEX, +6 VIT · +5 Luck, +18% bắt Goblin",
      curse: null,
    },
    {
      id: "astral_mail",
      name: "Astral Mail",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "trapResistance",
        amount: 0.15,
      },
      effects: {
        str: 6,
        dex: 8,
        vit: 6,
        ene: 8,
      },
      text: "+6 STR, +8 DEX, +6 VIT, +8 ENE",
      curse: null,
    },
    {
      id: "blood_moon_edge",
      name: "Blood Moon Edge",
      category: "weapon",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "thorns",
        amount: 0.12,
      },
      effects: {
        str: 14,
        vit: 12,
      },
      text: "+14 STR, +12 VIT",
      curse: null,
    },
    {
      id: "oracle_mask",
      name: "Oracle Mask",
      category: "armor",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["doors", "mirror"],
      },
      effects: {
        dex: 12,
        ene: 10,
        luck: 5,
      },
      text: "+12 DEX, +10 ENE · +5 Luck",
      curse: null,
    },
    {
      id: "eternal_clover",
      name: "Eternal Clover",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "eventLuck",
        amount: 0.04,
      },
      effects: {
        dex: 4,
        vit: 4,
        luck: 9,
        legendaryFind: 0.04,
      },
      text: "+4 DEX, +4 VIT · +9 Luck, +4% tìm SSR",
      curse: null,
    },
    {
      id: "titan_heart",
      name: "Titan Heart",
      category: "charm",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "potionCapacity",
        amount: 2,
      },
      effects: {
        str: 6,
        vit: 22,
      },
      text: "+6 STR, +22 VIT",
      curse: null,
    },
    {
      id: "sevenfold_sigil",
      name: "Sevenfold Sigil",
      category: "jewelry",
      rarity: "legendary",
      typeCode: "SSR",
      catalogVersion: 2,
      passive: {
        kind: "startMana",
        amount: 0.4,
      },
      effects: {
        str: 7,
        dex: 7,
        vit: 7,
        ene: 7,
        luck: 3,
      },
      text: "+7 STR, +7 DEX, +7 VIT, +7 ENE · +3 Luck",
      curse: null,
    },
  ],
  cursed: [
    {
      id: "glass_cannon",
      name: "Glass Cannon",
      category: "weapon",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.3,
      },
      effects: {
        str: 35,
        dex: 15,
      },
      text: "+35 STR, +15 DEX",
      curse: {
        id: "glass_cannon_curse",
        effects: {
          defenseSet: 0,
        },
        text: "Defense = 0",
      },
    },
    {
      id: "schrodingers_armor",
      name: "Schrödinger’s Armor",
      category: "armor",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "guardReflect",
        amount: 0.35,
      },
      effects: {
        str: 20,
        vit: 30,
      },
      text: "+20 STR, +30 VIT",
      curse: {
        id: "schrodingers_armor_curse",
        effects: {
          vit: -12,
        },
        text: "-12 VIT",
      },
    },
    {
      id: "goblins_debt",
      name: "Goblin’s Debt",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "shopDiscount",
        amount: 0.12,
      },
      effects: {
        dex: 20,
        vit: 15,
        luck: 12,
        goblinChance: 0.2,
      },
      text: "+20 DEX, +15 VIT · +12 Luck, +20% bắt Goblin",
      curse: {
        id: "goblins_debt_curse",
        effects: {
          bonusPenalty: 0.15,
        },
        text: "mất 15% payout hiện tại mỗi cấp nhận",
      },
    },
    {
      id: "crown_of_ruin",
      name: "Crown of Ruin",
      category: "armor",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "eventLuck",
        amount: 0.06,
      },
      effects: {
        str: 20,
        vit: 15,
        luck: 8,
      },
      text: "+20 STR, +15 VIT · +8 Luck",
      curse: {
        id: "crown_of_ruin_curse",
        effects: {
          bonusPenalty: 0.1,
        },
        text: "mất 10% payout hiện tại mỗi cấp nhận",
      },
    },
    {
      id: "blood_pact",
      name: "Blood Pact",
      category: "weapon",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "berserk",
        amount: 0.3,
      },
      effects: {
        str: 40,
        dex: 10,
      },
      text: "+40 STR, +10 DEX",
      curse: {
        id: "blood_pact_curse",
        effects: {
          vit: -15,
        },
        text: "-15 VIT",
      },
    },
    {
      id: "void_heart",
      name: "Void Heart",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "campHeal",
        amount: 0.04,
      },
      effects: {
        vit: 35,
        ene: 20,
      },
      text: "+35 VIT, +20 ENE",
      curse: {
        id: "void_heart_curse",
        effects: {
          potionPower: -0.15,
        },
        text: "-15% hiệu lực bình",
      },
    },
    {
      id: "broken_hourglass",
      name: "Broken Hourglass",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "dodgeCounter",
        amount: 0.35,
      },
      effects: {
        dex: 40,
        luck: 8,
      },
      text: "+40 DEX · +8 Luck",
      curse: {
        id: "broken_hourglass_curse",
        effects: {
          floorHpLoss: 0.04,
        },
        text: "mất 4% Max HP sau mỗi tầng",
      },
    },
    {
      id: "mimics_promise",
      name: "Mimic’s Promise",
      category: "utility",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["treasure_room", "fountain", "doors"],
      },
      effects: {
        dex: 20,
        ene: 15,
        mimicDetection: 0.1,
        legendaryFind: 0.12,
      },
      text: "+20 DEX, +15 ENE · +10% phát hiện Mimic, +12% tìm SSR",
      curse: {
        id: "mimics_promise_curse",
        effects: {
          mimicChance: 0.12,
        },
        text: "+12% Mimic",
      },
    },
    {
      id: "berserker_chains",
      name: "Berserker Chains",
      category: "weapon",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "thorns",
        amount: 0.18,
      },
      effects: {
        str: 40,
        dex: 10,
        eliteDamage: 0.2,
      },
      text: "+40 STR, +10 DEX · +20% damage Elite",
      curse: {
        id: "berserker_chains_curse",
        effects: {
          damageTaken: 0.18,
        },
        text: "nhận thêm 18% damage",
      },
    },
    {
      id: "hollow_crown",
      name: "Hollow Crown",
      category: "armor",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "mpLeech",
        amount: 0.25,
      },
      effects: {
        vit: 10,
        ene: 40,
        maxMana: 2,
      },
      text: "+10 VIT, +40 ENE · +2 Max MP",
      curse: {
        id: "hollow_crown_curse",
        effects: {
          str: -15,
        },
        text: "-15 STR",
      },
    },
    {
      id: "ashen_wings",
      name: "Ashen Wings",
      category: "armor",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "evasionCap",
        amount: 0.08,
      },
      effects: {
        dex: 40,
        ene: 10,
      },
      text: "+40 DEX, +10 ENE",
      curse: {
        id: "ashen_wings_curse",
        effects: {
          resistance: -20,
        },
        text: "-20 Resistance",
      },
    },
    {
      id: "soul_leash",
      name: "Soul Leash",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "startMana",
        amount: 0.5,
      },
      effects: {
        str: 20,
        ene: 25,
        bossDamage: 0.35,
      },
      text: "+20 STR, +25 ENE · +35% damage Boss",
      curse: {
        id: "soul_leash_curse",
        effects: {
          maxMana: -2,
        },
        text: "-2 Max MP",
      },
    },
    {
      id: "bleeding_star",
      name: "Bleeding Star",
      category: "jewelry",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "critCap",
        amount: 0.08,
      },
      effects: {
        str: 20,
        dex: 30,
      },
      text: "+20 STR, +30 DEX",
      curse: {
        id: "bleeding_star_curse",
        effects: {
          floorHpLoss: 0.06,
        },
        text: "mất 6% Max HP sau mỗi tầng",
      },
    },
    {
      id: "null_idol",
      name: "Null Idol",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "trapResistance",
        amount: 0.2,
      },
      effects: {
        str: 20,
        vit: 15,
        ene: 20,
      },
      text: "+20 STR, +15 VIT, +20 ENE",
      curse: {
        id: "null_idol_curse",
        effects: {
          dex: -15,
          luck: -6,
        },
        text: "-15 DEX, -6 Luck",
      },
    },
    {
      id: "black_sun",
      name: "Black Sun",
      category: "charm",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "foresight",
        scopes: ["doors", "portal", "treasure_room", "fountain", "mirror"],
      },
      effects: {
        dex: 10,
        ene: 30,
        luck: 10,
        legendaryFind: 0.15,
      },
      text: "+10 DEX, +30 ENE · +10 Luck, +15% tìm SSR",
      curse: {
        id: "black_sun_curse",
        effects: {
          potionPower: -0.2,
        },
        text: "-20% hiệu lực bình",
      },
    },
    {
      id: "oathbreaker",
      name: "Oathbreaker",
      category: "weapon",
      rarity: "cursed",
      typeCode: "UR",
      catalogVersion: 2,
      passive: {
        kind: "critCap",
        amount: 0.1,
      },
      effects: {
        str: 25,
        dex: 15,
        vit: 10,
        bossDamage: 0.25,
        eliteDamage: 0.25,
      },
      text: "+25 STR, +15 DEX, +10 VIT · +25% damage Boss, +25% damage Elite",
      curse: {
        id: "oathbreaker_curse",
        effects: {
          str: -10,
          dex: -10,
        },
        text: "-10 STR, -10 DEX",
      },
    },
  ],
};
const TYPE_CODES = Object.freeze({
  common: "R",
  rare: "SR",
  legendary: "SSR",
  cursed: "UR",
});
function validateItems(catalog = ITEMS) {
  const ids = new Set();
  for (const [rarity, count] of Object.entries({
    common: 10,
    rare: 13,
    legendary: 24,
    cursed: 16,
  })) {
    if (catalog[rarity]?.length !== count)
      throw new Error("INVALID_HARDCORE_ITEM_COUNT");
    const targets = new Set();
    for (const item of catalog[rarity]) {
      if (rarity === "common" || rarity === "rare") {
        const keys = Object.keys(item.effects);
        if (
          keys.length !== 1 ||
          targets.has(keys[0]) ||
          item.effects[keys[0]] <= 0
        )
          throw new Error("DUPLICATE_HARDCORE_ITEM_ROLE:" + item.id);
        targets.add(keys[0]);
      }
      if (
        ids.has(item.id) ||
        item.rarity !== rarity ||
        !Object.keys(item.effects).length ||
        (rarity === "cursed" && !Object.keys(item.curse?.effects || {}).length)
      )
        throw new Error("INVALID_HARDCORE_ITEM:" + item.id);
      for (const value of Object.values({
        ...item.effects,
        ...item.curse?.effects,
      }))
        if (!Number.isFinite(value)) throw new Error("INVALID_HARDCORE_EFFECT");
      passives.validate(item.passive);
      ids.add(item.id);
    }
  }
  return true;
}
validateItems();
const ITEM_ALIASES = Object.freeze({
  iron_dagger: "hunter_bow",
  militia_spear: "rusted_edge",
  bone_club: "rusted_edge",
  dented_plate: "minor_life_charm",
  wooden_buckler: "minor_life_charm",
  worn_boots: "hunter_bow",
  copper_ring: "cracked_wand",
  scout_lens: "chest_chalk",
  battle_token: "rusted_edge",
  silver_thread: "cracked_wand",
  traveler_map: "rabbit_foot",
  small_ward: "minor_life_charm",
  sharpening_stone: "rusted_edge",
  ember_bead: "cracked_wand",
  fox_mask: "hunter_bow",
  oak_talisman: "minor_life_charm",
  glass_bead: "hunter_bow",
  iron_nail: "rusted_edge",
  hawk_feather: "hunter_bow",
  smoke_vial: "hunter_bow",
  cold_ash: "cracked_wand",
  faded_clover: "rabbit_foot",
  hunters_fang: "shadowstep_boots",
  runed_carapace: "heart_of_the_wild",
  bone_talisman: "heart_of_the_wild",
  bloodstone: "vanguard_spear",
  guardian_seal: "heart_of_the_wild",
  wardens_chain: "vanguard_spear",
  moonlit_blade: "mana_prism",
  assassins_ribbon: "shadowstep_boots",
  lionheart_emblem: "heart_of_the_wild",
  stormglass: "shadowstep_boots",
  saints_ward: "mana_prism",
  riftwalkers_boots: "shadowstep_boots",
  war_drums: "vanguard_spear",
  steel_lotus: "shadowstep_boots",
  fortune_dice: "lucky_coin",
});
const definitions = new Map(
  Object.values(ITEMS)
    .flat()
    .map((item) => [item.id, item]),
);
for (const [oldId, targetId] of Object.entries(ITEM_ALIASES))
  if (definitions.has(oldId) || !definitions.has(targetId))
    throw new Error("INVALID_HARDCORE_ITEM_ALIAS:" + oldId);
function resolveItemId(id) {
  return Object.hasOwn(ITEM_ALIASES, id) ? ITEM_ALIASES[id] : id;
}
for (const pool of Object.values(ITEMS)) {
  for (const item of pool) {
    Object.freeze(item.effects);
    Object.freeze(item.passive.scopes);
    Object.freeze(item.passive);
    if (item.curse) {
      Object.freeze(item.curse.effects);
      Object.freeze(item.curse);
    }
    Object.freeze(item);
  }
  Object.freeze(pool);
}
Object.freeze(ITEMS);
module.exports = {
  ITEMS,
  TYPE_CODES,
  ITEM_ALIASES,
  resolveItemId,
  validateItems,
};
