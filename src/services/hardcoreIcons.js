"use strict";
const emoji = require("../discordEmojiMap");
const { appEmoji } = require("../utils/appEmoji");
const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);
const E = {
  hp: icon("HP", "❤️"),
  attack: icon("PHYS", "⚔️"),
  defense: icon("DEF", "🛡️"),
  mana: icon("MANA", "💧"),
  magic: icon("ELE", "🔮"),
  res: icon("RES", icon("crystal_ball", "🔮")),
  shrine: icon("event_shrine", "🗿"),
  chest: icon("event_chest", "📦"),
  rift: icon("rift", "🌀"),
  luck: icon("LUCK", "🍀"),
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
  potion: icon("potion", "🧪"),
  get ticket() {
    return icon("ticket_rngesus", "🎫");
  },
  str: icon("STR", "💪"),
  dex: icon("DEX", "🗡️"),
  vit: icon("VIT", "❤️"),
  ene: icon("ENE", "🔮"),
};
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
module.exports = { E, SKILL_ICONS, RIFT_ICONS };
