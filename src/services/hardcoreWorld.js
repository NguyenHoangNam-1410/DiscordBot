"use strict";
const { clamp } = require("./hardcoreStats");
const REGIONS = [
  [
    1,
    99,
    "Sanctuary",
    ["Fallen Zealot", "Goatman", "Dark Cultist", "Lost Soul"],
  ],
  [
    100,
    199,
    "Duncraig",
    ["Possessed Citizen", "Necromorb", "Ashen Marauder", "Powder Keg Fanatic"],
  ],
  [
    200,
    299,
    "Fauztinville",
    ["Necrobot", "Harpylisk", "Steel Terror", "Fauztinville Drone"],
  ],
  [
    300,
    399,
    "Teganze",
    ["Teganze Spirit", "Storm Shaman", "Poisoned Hunter", "Elemental Guardian"],
  ],
  [
    400,
    499,
    "Scosglen",
    ["Moon Panther", "Witchblood Druid", "Wild Hunt", "Ancient Treant"],
  ],
  [
    500,
    699,
    "Dimensional Labyrinth",
    ["Corrupted Hero", "Unstable Anomaly", "Abyssal Shrine", "Rift Stalker"],
  ],
  [
    700,
    899,
    "Heroic Rift",
    ["Zakarum Avatar", "Heavenly Exile", "Heroic Guardian", "Fate Devourer"],
  ],
  [
    900,
    999,
    "Dimensional Plane",
    ["Abyssal Spire", "Void Spawn", "Dream Eater", "Fleshweaver Spawn"],
  ],
].map(([start, end, name, enemies]) => ({ start, end, name, enemies }));
const RIFT_MODIFIERS = {
  stone_skin: {
    name: "Stone Skin",
    text: "**Quái** được tăng DEF khi xuất hiện, tối đa **+64%**.",
  },
  elemental_dominion: {
    name: "Elemental Dominion",
    text: "**Quái** được tăng DMG, tối đa **+24%**. Với quái dùng cả vật lý lẫn phép, tỷ lệ ra đòn phép cũng tăng, tối đa **24 điểm phần trăm**.",
  },
  bloodlust: {
    name: "Bloodlust",
    text: "Khi **quái** còn dưới **50%** Max HP, DMG phản công của **quái** tăng, tối đa **+48%**.",
  },
  unstable_rift: {
    name: "Unstable Rift",
    text: "**Bạn** dễ gặp hòm thường và kho báu hơn. Hòm dễ gặp Mimic/Ancient Mimic hơn; trong nhánh kho báu an toàn, tỷ lệ nhận SSR cao hơn. Không thể xóa bằng Rift Severance.",
  },
  fortified: {
    name: "Fortified",
    text: "**Quái** được tăng Max HP khi xuất hiện, tối đa **+64%**.",
  },
  swift_horror: {
    name: "Swift Horror",
    text: "**Quái** được tăng ACC và EVA khi xuất hiện: quái đánh bạn dễ trúng hơn và né đòn vật lý của bạn tốt hơn.",
  },
  soul_drain: {
    name: "Soul Drain",
    text: "**Quái** hút **1** MP của **bạn** mỗi khi phản công trúng; MP của bạn không xuống dưới **0**. Mỗi trận: **1–4** cộng dồn cho **1** lần hút, **5–8** cho **2** lần, từ **9** cho **3** lần. Trúng đòn vẫn tiêu hao lần hút khi bạn đang **0** MP. Đánh trượt hoặc bị chặn hoàn toàn không tiêu hao lần hút.",
  },
  cursed_ground: {
    name: "Cursed Ground",
    text: "**Bạn** bị giảm RES hiệu dụng khi nhận sát thương phép, tối đa **24 điểm phần trăm**.",
  },
};
const BOSSES = [
  { name: "The Butcher", mechanic: "butcher", damageType: "physical" },
  { name: "Ascendant Riftwalker", mechanic: "riftwalker", damageType: "magic" },
  { name: "Assur", mechanic: "assur", damageType: "physical" },
  { name: "Lucion", mechanic: "lucion", damageType: "magic" },
  {
    name: "Deimoss the Fleshweaver",
    mechanic: "deimoss",
    damageType: "physical",
  },
];
function effectiveStacks(n) {
  return Math.min(
    8,
    Math.min(n, 3) +
      Math.min(Math.max(0, n - 3), 5) * 0.5 +
      Math.max(0, n - 8) * 0.25,
  );
}
function regionForFloor(floor) {
  return (
    REGIONS.find((r) => floor >= r.start && floor <= r.end) || REGIONS.at(-1)
  );
}
function makeEnemy(state, rank = "normal", name = null, rng = Math.random) {
  const floor = state.floor,
    mods = state.modifiers || {};
  const stacks = (key) => effectiveStacks(mods[key] || 0);
  const scaleHp =
    1 + Math.min(floor, 100) * 0.065 + Math.max(0, floor - 100) * 0.08;
  const scaleDmg =
    1 + Math.min(floor, 100) * 0.04 + Math.max(0, floor - 100) * 0.038;
  const late = clamp((floor - 400) / 599, 0, 1);
  const boss = ["boss", "final_boss"].includes(rank)
    ? BOSSES[
        rank === "final_boss" ? 4 : Math.max(0, Math.floor(floor / 50) - 1) % 5
      ]
    : null;
  const factors = {
    normal: [1, 1],
    champion: [1.4, 1.15],
    elite: [2, 1.35],
    mimic: [1.7, 1.25],
    ancient_mimic: [2.8, 1.5],
    boss: [4, 1.6],
    final_boss: [7.2, 2],
  };
  const [hpFactor, damageFactor] = factors[rank] || factors.normal;
  const hp = Math.round(
    28 *
      scaleHp *
      hpFactor *
      (1 + stacks("fortified") * 0.08) *
      (1 + late * 0.5),
  );
  const damage =
    scaleDmg *
    damageFactor *
    (1 + stacks("elemental_dominion") * 0.03) *
    (1 + late * 0.9);
  const magicChance = clamp(
    0.12 + stacks("elemental_dominion") * 0.03,
    0,
    0.75,
  );
  const damageType = boss?.damageType || "mixed";
  const names = regionForFloor(floor).enemies;
  return {
    type: "combat",
    rank,
    name: name || boss?.name || names[Math.floor(rng() * names.length)],
    mechanic: boss?.mechanic || null,
    hp,
    maxHp: hp,
    damageMin: Math.max(1, Math.floor(5 * damage)),
    damageMax: Math.max(1, Math.floor(9 * damage)),
    defense: Math.round((5 + floor * 0.65) * (1 + stacks("stone_skin") * 0.08)),
    accuracy: 75 + floor * 0.25 + stacks("swift_horror") * 3,
    evasion:
      Math.min(100, 5 + floor * 0.08) +
      stacks("swift_horror") * 1.5 +
      (boss?.mechanic === "assur" ? 18 : 0),
    resistance: Math.min(60, Math.floor(floor * 0.06)),
    critChance: boss?.mechanic === "assur" ? 0.2 : 0.06,
    critDamage: 1.75,
    damageType,
    magicChance,
    nextDamageType:
      damageType === "mixed"
        ? rng() < magicChance
          ? "magic"
          : "physical"
        : damageType,
    frenzy: 0,
    combatTurn: 0,
    drainCharges: Math.min(3, Math.ceil((mods.soul_drain || 0) / 4)),
    rewardMultiplier: rank === "normal" ? 1 : rank === "elite" ? 2 : 3,
  };
}
function hitChance(accuracy, evasion) {
  return (
    1 -
    clamp(
      Math.max(0, evasion) / (Math.max(1, accuracy) + Math.max(0, evasion)),
      0.05,
      0.45,
    )
  );
}
function defenseReduction(defense, floor) {
  return clamp(
    Math.max(0, defense) / (Math.max(0, defense) + 100 + floor / 2),
    0,
    0.7,
  );
}
module.exports = {
  REGIONS,
  RIFT_MODIFIERS,
  BOSSES,
  effectiveStacks,
  regionForFloor,
  makeEnemy,
  hitChance,
  defenseReduction,
};
