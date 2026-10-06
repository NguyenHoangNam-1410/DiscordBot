"use strict";
const emoji = require("../discordEmojiMap");
const { appEmoji } = require("../utils/appEmoji");
const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);
const E = {
  get coin() {
    return icon("coin", "🪙");
  },
  get hp() {
    return icon("HP", "❤️");
  },
  get attack() {
    return icon("PHYS", "⚔️");
  },
  get defense() {
    return icon("DEF", "🛡️");
  },
  get mana() {
    return icon("MANA", "💧");
  },
  get magic() {
    return icon("ELE", "🔮");
  },
  get res() {
    return icon("RES", icon("crystal_ball", "🔮"));
  },
  get shrine() {
    return icon("event_shrine", "🗿");
  },
  get chest() {
    return icon("event_chest", "📦");
  },
  get rift() {
    return icon("rift", "🌀");
  },
  get luck() {
    return icon("LUCK", "🍀");
  },
  // Resolve new application emojis at render time, after startup loads their IDs.
  get crit() {
    return icon("CRIT", "💥");
  },
  get accuracy() {
    return icon("ACC", "🎯");
  },
  get evasion() {
    return icon("EVA", "💨");
  },
  get backpack() {
    return icon("backpack", "🎒");
  },
  get checkpoint() {
    return icon("checkpoint", "🏕️");
  },
  get potion() {
    return icon("potion", "🧪");
  },
  get ticket() {
    return icon("ticket_rngesus", "🎫");
  },
  get str() {
    return icon("STR", "💪");
  },
  get dex() {
    return icon("DEX", "🗡️");
  },
  get vit() {
    return icon("VIT", "❤️");
  },
  get ene() {
    return icon("ENE", "🔮");
  },
};
// Resolve effect labels when rendering, after the application emoji registry loads.
function effectStatLabel(key) {
  const names = {
    str: ["str", "STR"],
    dex: ["dex", "DEX"],
    vit: ["vit", "VIT"],
    ene: ["ene", "ENE"],
    luck: ["luck", "LUCK"],
    maxHp: ["hp", "Max HP"],
    maxMana: ["mana", "Max MP"],
    maxEnergy: ["mana", "Max MP"],
    attack: ["attack", "ATK"],
    physical: ["attack", "Vật lý"],
    spell: ["magic", "Phép"],
    defense: ["defense", "DEF"],
    accuracy: ["accuracy", "ACC"],
    evasion: ["evasion", "EVA"],
    resistance: ["res", "RES"],
    critChance: ["crit", "CRIT"],
    potionPower: ["potion", "Hiệu lực bình"],
    bossDamage: ["attack", "DMG Boss"],
    eliteDamage: ["attack", "DMG Elite"],
    mimicDetection: ["accuracy", "Phát hiện Mimic"],
    goblinChance: ["luck", "Bắt Goblin"],
    legendaryFind: ["chest", "Tìm SSR"],
    floorHpLoss: ["hp", "HP mất/tầng"],
    mimicChance: ["chest", "Mimic"],
    damageTaken: ["defense", "DMG nhận"],
    bonusPenalty: ["coin", "Payout"],
  };
  const [symbol, label] = names[key] || ["backpack", key];
  return `${E[symbol]} ${label}`;
}
function passiveIcon(kind) {
  const symbols = {
    berserk: "attack",
    mpLeech: "mana",
    guardReflect: "defense",
    thorns: "defense",
    shopDiscount: "coin",
    eventLuck: "luck",
    potionCapacity: "potion",
    critCap: "crit",
    evasionCap: "evasion",
    dodgeCounter: "evasion",
    startMana: "mana",
    campHeal: "hp",
    potionSave: "potion",
    trapResistance: "defense",
    foresight: "accuracy",
  };
  return E[symbols[kind]] || E.backpack;
}
const SKILL_ICONS = Object.fromEntries(
  Object.entries({
    amazon: "skill_barrage",
    barbarian: "skill_ironwill",
    assassin: "skill_shadowstep",
    sorceress: "skill_arcaneburst",
    druid: "skill_windgeneration",
    necromancer: "skill_totemward",
    paladin: "skill_devineshield",
  }).map(([key, name]) => [key, icon(name, "✨")]),
);
const RIFT_ICONS = Object.fromEntries(
  [
    "stone_skin",
    "elemental_dominion",
    "bloodlust",
    "unstable_rift",
    "fortified",
    "swift_horror",
    "soul_drain",
    "cursed_ground",
  ].map((key) => [key, icon(`rift_${key}`, "🌀")]),
);
function eventIcon(key) {
  const aliases = {
    shrine: "event_shrine",
    class_shrine: "event_shrine",
    chest: "event_chest",
    treasure_room: "event_treasure_room",
    upgrade: "checkpoint",
    summit: "event_boss",
    final_boss: "event_boss",
  };
  return icon(
    aliases[key] || `event_${key}`,
    key === "boss_chest" ? E.chest : "⚠️",
  );
}
function treasureChestIcon(color) {
  return icon(`chest_${color}`, { red: "🟥", blue: "🟦", gold: "🟨" }[color]);
}
function memoryIcon(family) {
  const fallback = {
    rescue: "🤝",
    bounty: "⚖️",
    blood: "🩸",
    wealth: "💰",
    mirror: "🪞",
    divine: "🙏",
    vengeance: "👻",
    legacy: "📜",
  };
  return icon("tower_remember_" + family, fallback[family] || "📜");
}
function paradoxIcon(id) {
  const fallback = {
    blood_pact: "🩸",
    mana_fracture: "🔷",
    inverted_armor: "🛡️",
    inverted_magic: "🔮",
    hunger: "🍖",
    time_debt: "⏳",
    blood_mirror: "🪞",
    unstable_soul: "👻",
  };
  return icon(`paradox_${id}`, fallback[id] || E.rift);
}
module.exports = {
  E,
  effectStatLabel,
  passiveIcon,
  SKILL_ICONS,
  RIFT_ICONS,
  eventIcon,
  treasureChestIcon,
  paradoxIcon,
  memoryIcon,
};
