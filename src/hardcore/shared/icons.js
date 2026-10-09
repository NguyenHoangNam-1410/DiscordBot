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
  bossCritGrowth: ["passive_boss_crit_growth", "👑"],
  freeMagicSkill: ["passive_free_magic_skill", "♾️"],
  preventRngesusEncounter: ["passive_rngesus_ward", "🔒"],
  typedCombatWard: ["passive_typed_combat_ward", "🛡️"],
  killPayoutGrowth: ["passive_kill_payout_growth", "📈"],
  runWealthDamage: ["passive_run_wealth_damage", "🔥"],
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
const MONSTER_ICON_NAMES = Object.freeze({
  "Fallen Zealot": "monster_fallen_zealot",
  "Goatman": "monster_goatman",
  "Dark Cultist": "monster_dark_cultist",
  "Lost Soul": "monster_lost_soul",
  "Possessed Citizen": "monster_possessed_citizen",
  "Necromorb": "monster_necromorb",
  "Ashen Marauder": "monster_ashen_marauder",
  "Powder Keg Fanatic": "monster_powder_keg_fanatic",
  "Necrobot": "monster_necrobot",
  "Harpylisk": "monster_harpylisk",
  "Steel Terror": "monster_steel_terror",
  "Fauztinville Drone": "monster_fauztinville_drone",
  "Teganze Spirit": "monster_teganze_spirit",
  "Storm Shaman": "monster_storm_shaman",
  "Poisoned Hunter": "monster_poisoned_hunter",
  "Elemental Guardian": "monster_elemental_guardian",
  "Moon Panther": "monster_moon_panther",
  "Witchblood Druid": "monster_witchblood_druid",
  "Wild Hunt": "monster_wild_hunt",
  "Ancient Treant": "monster_ancient_treant",
  "Corrupted Hero": "monster_corrupted_hero",
  "Unstable Anomaly": "monster_unstable_anomaly",
  "Abyssal Shrine": "monster_abyssal_shrine",
  "Rift Stalker": "monster_rift_stalker",
  "Zakarum Avatar": "monster_zakarum_avatar",
  "Heavenly Exile": "monster_heavenly_exile",
  "Heroic Guardian": "monster_heroic_guardian",
  "Fate Devourer": "monster_fate_devourer",
  "Abyssal Spire": "monster_abyssal_spire",
  "Void Spawn": "monster_void_spawn",
  "Dream Eater": "monster_dream_eater",
  "Fleshweaver Spawn": "monster_fleshweaver_spawn",
  "The Butcher": "monster_the_butcher",
  "Infernal Machine": "monster_infernal_machine",
  "Assur": "monster_assur",
  "Master Control System": "monster_master_control_system",
  "Necrobot Alpha": "monster_necrobot_alpha",
  "Quov Tsin": "monster_quov_tsin",
  "Lucion": "monster_lucion",
  "Bul-Kathos": "monster_bul_kathos",
  "Spirit of Giyua": "monster_spirit_of_giyua",
  "Ascendant Riftwalker": "monster_ascendant_riftwalker",
  "Gharbad the Weak": "monster_gharbad_the_weak",
  "Phoboss": "monster_phoboss",
  "Kabraxis, Keeper of the Seals": "monster_kabraxis",
  "The Justicar": "monster_the_justicar",
  "Uldyssian the Tainted": "monster_uldyssian_the_tainted",
  "Archbishop Lazarus": "monster_archbishop_lazarus",
  "Xazax": "monster_xazax",
  "Samael": "monster_samael",
  "Deimoss the Fleshweaver": "monster_deimoss_the_fleshweaver",
  "Mimic": "monster_mimic",
  "Ancient Mimic": "monster_ancient_mimic",
  "Blood Mimic": "monster_blood_mimic",
  "Mirror Clone": "monster_mirror_clone",
  "Covenant Guardian": "monster_covenant_guardian",
  "Avarice Revenant": "monster_avarice_revenant",
  "Bounty Hunter": "monster_bounty_hunter",
  "Vault Guardian": "monster_vault_guardian",
  "Herald of Fate": "monster_herald_of_fate",
  "Restless Spirit": "monster_restless_spirit",
  "Treasure Room Mimic": "monster_treasure_room_mimic",
  "Golden Door Mimic": "monster_golden_door_mimic",
  "Premature Rift Boss": "monster_premature_rift_boss",
  "Rift Ambusher": "monster_rift_ambusher",
  "Cave Rat": "monster_cave_rat",
  "Wild Boar": "monster_wild_boar",
  "Steel Drone": "monster_steel_drone",
  "Stone Golem": "monster_stone_golem",
  "Annihilator": "monster_annihilator",
});
const BOSS_ICON_NAMES = Object.freeze({
  butcher: "The Butcher",
  machine: "Infernal Machine",
  assur: "Assur",
  control: "Master Control System",
  necrobot: "Necrobot Alpha",
  quov: "Quov Tsin",
  lucion: "Lucion",
  bul_kathos: "Bul-Kathos",
  giyua: "Spirit of Giyua",
  riftwalker: "Ascendant Riftwalker",
  gharbad: "Gharbad the Weak",
  phoboss: "Phoboss",
  anomaly: "Unstable Anomaly",
  kabraxis: "Kabraxis, Keeper of the Seals",
  zakarum: "Zakarum Avatar",
  justicar: "The Justicar",
  uldyssian: "Uldyssian the Tainted",
  lazarus: "Archbishop Lazarus",
  xazax: "Xazax",
  samael: "Samael",
  deimoss: "Deimoss the Fleshweaver",
});
function monsterIcon(enemy) {
  const e = typeof enemy === "string" ? { name: enemy } : enemy || {};
  if (e.name === "RNGesus") return eventIcon("rngesus");
  const name = BOSS_ICON_NAMES[e.boss?.id] || e.name;
  const emojiName = MONSTER_ICON_NAMES[name] ||
    (e.memoryFamily === "mirror" ? MONSTER_ICON_NAMES["Mirror Clone"] :
      e.memoryFamily === "vengeance" || e.echoId ? MONSTER_ICON_NAMES["Restless Spirit"] : null);
  return emojiName ? icon(emojiName, "👹") : e.memoryFamily ? memoryIcon(e.memoryFamily) : "👹";
}
const RELIC_ICON_NAMES = Object.freeze({
  kingslayers_testament: "relic_kingslayers_testament",
  astral_singularity: "relic_astral_singularity",
  fatebreaker_seal: "relic_fatebreaker_seal",
  veil_of_the_absolute: "relic_veil_of_the_absolute",
  conquerors_covenant: "relic_conquerors_covenant",
  gilded_soul: "relic_gilded_soul",
});
function relicIcon(id) {
  return RELIC_ICON_NAMES[id] ? icon(RELIC_ICON_NAMES[id], "💠") : "💠";
}
function fragmentIcon(key) {
  return ["mimic", "ancient_mimic", "blood_mimic", "mirror_clone"].includes(key)
    ? icon("fragment_" + key, "🧩") : "🧩";
}
function sealIcon(kind) {
  return ["war", "protection", "arcane"].includes(kind)
    ? icon("seal_" + kind, "🔺") : "🔺";
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
    royal_blessing: "event_royal_invitation",
    covenant_blessing: "event_covenant",
  };
  return icon(
    aliases[key] || `event_${key}`,
    key === "boss_chest"
      ? E.chest
      : key === "god_rngesus"
        ? "🌟"
        : key === "royal_invitation"
          ? "🏰"
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
  MONSTER_ICON_NAMES,
  BOSS_ICON_NAMES,
  RELIC_ICON_NAMES,
  monsterIcon,
  relicIcon,
  fragmentIcon,
  sealIcon,
};
