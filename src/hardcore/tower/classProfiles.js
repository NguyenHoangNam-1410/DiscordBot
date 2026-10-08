"use strict";
const CLASS_ROTATION = Object.freeze([
  "sorceress",
  "druid",
  "necromancer",
  "paladin",
  "amazon",
  "barbarian",
  "assassin",
]);
const PROFILES = {
  sorceress: {
    name: "Sorceress",
    skillName: "Arcane Burst",
    maxHp: 120,
    maxMana: 5,
    attackDamage: 12,
    skillDamage: 30,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 0,
    mechanic: "reflection",
    description:
      "Arcane Reflection khóa phép theo nhịp; xen kẽ đòn thường và phòng thủ để giữ MP.",
  },
  druid: {
    name: "Druid",
    skillName: "Wildfire",
    maxHp: 140,
    maxMana: 4,
    attackDamage: 15,
    skillDamage: 24,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 6,
    mechanic: "regeneration",
    description:
      "Wildfire hồi 6 HP; cửa sinh lực chỉ mở trong khoảng HP ghi trên tín hiệu.",
  },
  necromancer: {
    name: "Necromancer",
    skillName: "Soul Ward",
    maxHp: 100,
    maxMana: 5,
    attackDamage: 10,
    skillDamage: 26,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 0,
    mechanic: "ward",
    description:
      "Soul Ward cấp một Ward, chặn phản công kế tiếp rồi mất; không cộng dồn.",
  },
  paladin: {
    name: "Paladin",
    skillName: "Divine Shield",
    maxHp: 150,
    maxMana: 4,
    attackDamage: 18,
    skillDamage: 24,
    skillCost: 3,
    attackMana: 0,
    defendMana: 2,
    heal: 0,
    mechanic: "shield",
    description:
      "Phòng thủ là nguồn MP chính, giảm một nửa damage vật lý; Divine Shield chặn phản công phép hiện tại.",
  },
  amazon: {
    name: "Amazon",
    skillName: "Barrage",
    maxHp: 110,
    maxMana: 4,
    attackDamage: 16,
    skillDamage: 30,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 0,
    mechanic: "barrage",
    description:
      "Barrage có ba hit cố định; mỗi charge chắn mất một hit. Đòn thường có một hit.",
  },
  barbarian: {
    name: "Barbarian",
    skillName: "Armor Break",
    maxHp: 160,
    maxMana: 3,
    attackDamage: 24,
    skillDamage: 36,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 0,
    mechanic: "rage",
    description:
      "HP ≤35% kích hoạt Rage: damage vật lý ×1,5; Armor Break xuyên giáp ở đúng pha.",
  },
  assassin: {
    name: "Assassin",
    skillName: "Shadow Step",
    maxHp: 80,
    maxMana: 4,
    attackDamage: 14,
    skillDamage: 24,
    skillCost: 2,
    attackMana: 1,
    defendMana: 1,
    heal: 0,
    mechanic: "dodge",
    description:
      "Shadow Step né phản công hiện tại và phản kích 8 damage cố định; không roll EVA.",
  },
};
for (const p of Object.values(PROFILES)) Object.freeze(p);
Object.freeze(PROFILES);
function profile(classKey) {
  const p = PROFILES[classKey];
  if (!p) throw Error("UNKNOWN_TOWER_CLASS");
  return p;
}
module.exports = { CLASS_ROTATION, PROFILES, profile };
