"use strict";
const emoji = require("../../discordEmojiMap");
const { appEmoji } = require("../../utils/appEmoji");
const icon = (key, fallback) => appEmoji(key, emoji[`:${key}:`] || fallback);
const TICKET_TYPES = Object.freeze({
  survival_escape: Object.freeze({
    name: "Vé thoát",
    emojiName: "ticket_rngesus",
    fallback: "🎫",
  }),
  survival_prayer: Object.freeze({
    name: "Vé cầu nguyện",
    emojiName: "ticket_prayer",
    fallback: "🙏",
  }),
  survival_revive: Object.freeze({
    name: "Vé hồi sinh",
    emojiName: "ticket_revive",
    fallback: "🎟️",
  }),
});
function ticketIcon(id) {
  const ticket = TICKET_TYPES[id];
  return ticket ? icon(ticket.emojiName, ticket.fallback) : "🎫";
}
const BUFF_ICON_NAMES = Object.freeze({
  potionPower: ["stat_potion_power", "⚗️"],
  bossDamage: ["stat_boss_damage", "👑"],
  eliteDamage: ["stat_elite_damage", "🔱"],
  mimicDetection: ["stat_mimic_detection", "👁️"],
  goblinChance: ["stat_goblin_chance", "🪤"],
  legendaryFind: ["stat_ssr_find", "🌟"],
  damageTaken: ["stat_damage_taken", "💢"],
  floorHpLoss: ["stat_floor_hp_loss", "🩸"],
  mimicChance: ["stat_mimic_chance", "👹"],
  payout: ["stat_payout", "💰"],
  berserk: ["passive_berserk", "😡"],
  mpLeech: ["passive_mp_leech", "🦇"],
  guardReflect: ["passive_guard_reflect", "↩️"],
  thorns: ["passive_thorns", "🌵"],
  shopDiscount: ["passive_shop_discount", "🏷️"],
  eventLuck: ["passive_event_luck", "🎲"],
  potionCapacity: ["passive_potion_capacity", "🧰"],
  critCap: ["passive_crit_cap", "📈"],
  evasionCap: ["passive_evasion_cap", "🪽"],
  dodgeCounter: ["passive_dodge_counter", "🥷"],
  startMana: ["passive_start_mana", "⚡"],
  campHeal: ["passive_camp_heal", "🛌"],
  potionSave: ["passive_potion_save", "⏳"],
  trapResistance: ["passive_trap_resistance", "🧱"],
  foresight: ["passive_foresight", "🔭"],
});
function buffIcon(key) {
  const definition = BUFF_ICON_NAMES[key];
  return definition ? icon(...definition) : "✨";
}
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
    return ticketIcon("survival_escape");
  },
  get prayerTicket() {
    return ticketIcon("survival_prayer");
  },
  get reviveTicket() {
    return ticketIcon("survival_revive");
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
Object.defineProperties(
  E,
  Object.fromEntries(
    [
      "potionPower",
      "bossDamage",
      "eliteDamage",
      "mimicDetection",
      "goblinChance",
      "legendaryFind",
      "damageTaken",
      "floorHpLoss",
      "mimicChance",
      "payout",
    ].map((key) => [key, { enumerable: true, get: () => buffIcon(key) }]),
  ),
);
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
    potionPower: ["potionPower", "Hiệu lực bình"],
    bossDamage: ["bossDamage", "DMG Boss"],
    eliteDamage: ["eliteDamage", "DMG Elite"],
    mimicDetection: ["mimicDetection", "Phát hiện Mimic"],
    goblinChance: ["goblinChance", "Bắt Goblin"],
    legendaryFind: ["legendaryFind", "Tìm SSR"],
    floorHpLoss: ["floorHpLoss", "HP mất/tầng"],
    mimicChance: ["mimicChance", "Mimic"],
    damageTaken: ["damageTaken", "DMG nhận"],
    bonusPenalty: ["payout", "Payout"],
  };
  const [symbol, label] = names[key] || ["backpack", key];
  return `${E[symbol]} ${label}`;
}
function passiveIcon(kind) {
  return buffIcon(kind);
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
    key === "boss_chest"
      ? E.chest
      : key === "god_rngesus"
        ? "🌟"
        : key === "ritual"
          ? "🕯️"
          : "⚠️",
  );
}
function treasureChestIcon(color) {
  return icon(`chest_${color}`, { red: "🟥", blue: "🟦", gold: "🟨" }[color]);
}
function memoryIcon(family) {
  const fallback = {
    grudge: "🕯️",
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
  TICKET_TYPES,
  ticketIcon,
  BUFF_ICON_NAMES,
  buffIcon,
  effectStatLabel,
  passiveIcon,
  SKILL_ICONS,
  RIFT_ICONS,
  eventIcon,
  treasureChestIcon,
  paradoxIcon,
  memoryIcon,
};
