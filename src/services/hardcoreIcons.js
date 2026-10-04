"use strict";
const emoji = require("../discordEmojiMap");
const icon = (key, fallback) => emoji[`:${key}:`] || fallback;
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
  crit: icon("boom", "💥"),
  potion: icon("potion", "🧪"),
  ticket: icon("ticket", "🎫"),
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
