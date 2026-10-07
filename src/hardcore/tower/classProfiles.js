"use strict";

// Tower is a separate mode, but its characters and equipment are snapshots
// built from the live Survival catalogs. Nothing in Survival is mutated.
const survivalStats = require("../engine/stats");
const { ITEMS } = require("../item");

const CLASS_ROTATION = Object.freeze([
  "sorceress",
  "druid",
  "necromancer",
  "paladin",
  "amazon",
  "barbarian",
  "assassin",
]);
const MECHANICS = Object.freeze({
  sorceress: [
    "arcane",
    "Arcane Burst là đòn phép cố định, không Crit hoặc roll damage.",
  ],
  druid: [
    "regeneration",
    "Wild Regeneration hồi lượng HP cố định đã hiển thị khi dùng đúng ấn.",
  ],
  necromancer: [
    "soul",
    "Totem Ward được dùng như đòn phép cố định trong luật Ấn Linh hồn.",
  ],
  paladin: [
    "divine",
    "Divine Shield được dùng như đòn phép cố định; Phòng thủ là hành động riêng.",
  ],
  amazon: ["barrage", "Barrage gây lượng damage cố định khi Ấn Linh hồn mở."],
  barbarian: [
    "iron",
    "Iron Will gây lượng damage cố định; không có kích hoạt ngẫu nhiên.",
  ],
  assassin: [
    "shadow",
    "Shadow Step gây lượng damage cố định; không roll né trong Tháp.",
  ],
});
const LOADOUT_IDS = Object.freeze([
  "rusted_edge",
  "mana_fragment",
  "red_potion_belt",
]);
const ITEM_BY_ID = new Map(
  Object.values(ITEMS)
    .flat()
    .map((item) => [item.id, item]),
);

function profile(classKey) {
  const base = survivalStats.CLASSES[classKey];
  if (!base) throw Error("UNKNOWN_TOWER_CLASS");
  const state = survivalStats.createState(classKey, 0);
  state.items = LOADOUT_IDS.map((id) => ({
    definition: ITEM_BY_ID.get(id),
    level: 1,
    cleansedLevels: 1,
  }));
  survivalStats.recompute(state);
  const [mechanic, description] = MECHANICS[classKey];
  return Object.freeze({
    name: base.name,
    skillName: base.skill,
    maxHp: state.maxHp,
    maxMana: state.maxMana,
    attackDamage: Math.floor((state.damageMin + state.damageMax) / 2),
    skillDamage: Math.floor((state.spellMin + state.spellMax) / 2),
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal:
      classKey === "druid" ? Math.max(6, Math.floor(state.maxHp * 0.08)) : 0,
    mechanic,
    description,
    potions: Math.min(state.maxPotions, state.potions + 1),
    potionHeal: Math.max(1, Math.floor(state.maxHp * state.potionRate)),
    loadout: LOADOUT_IDS.map((id) => {
      const item = ITEM_BY_ID.get(id);
      return {
        id: item.id,
        name: item.name,
        rarity: item.typeCode,
        text: item.text,
      };
    }),
    survivalStats: {
      str: state.str,
      dex: state.dex,
      vit: state.vit,
      ene: state.ene,
      defense: state.defense,
      resistance: state.resistance,
      accuracy: state.accuracy,
      evasion: state.evasion,
    },
  });
}
const PROFILES = Object.freeze(
  Object.fromEntries(CLASS_ROTATION.map((key) => [key, profile(key)])),
);
module.exports = { CLASS_ROTATION, PROFILES, profile, LOADOUT_IDS };
