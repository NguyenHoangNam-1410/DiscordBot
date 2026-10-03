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
  shrine: icon("shrine", "🗿"),
  chest: icon("chest", "📦"),
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
module.exports = { E, SKILL_ICONS };
