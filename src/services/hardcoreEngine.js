const MAX_PAYOUT = 10_000_000;
const COMPLETION_FLOOR = 100;
// Total diamonds held by this run, rather than a sum of milestone rewards.
function runDiamondReward(state) {
  const cleared = Math.max(0, Math.min(999, Number(state.cleared) || 0));
  if (cleared >= 999 && state.finalBossDefeated) return 51_200;
  const milestone = Math.min(9, Math.floor(cleared / 100));
  return milestone ? 100 * 2 ** (milestone - 1) : 0;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function luckyBreakChance(state) {
  return clamp((Number(state.luck) || 0) * 0.015, 0, 0.3);
}
function goblinCatchChance(state) {
  return clamp(
    Math.min(0.8, 0.6 + (Number(state.luck) || 0) * 0.01) +
      (state.goblinChance || 0),
    0,
    0.9,
  );
}
function hitChance(accuracy, evasion) {
  return clamp(0.75 + (accuracy - evasion) * 0.005, 0.2, 0.95);
}
function defenseReduction(defense, level) {
  return clamp(defense / (defense + 50 + level * 8), 0, 0.75);
}
function physicalAfterDefense(rawDamage, defense, level) {
  return Math.max(
    1,
    Math.floor(rawDamage * (1 - defenseReduction(defense, level))),
  );
}
function magicAfterResistance(rawDamage, resistance) {
  return Math.max(
    1,
    Math.floor(rawDamage * (1 - clamp(resistance, -50, 75) / 100)),
  );
}
const REGIONS = Object.freeze([
  { start: 1, end: 99, name: "Sanctuary", hpSlope: 0.05, damageSlope: 0.025 },
  {
    start: 100,
    end: 199,
    name: "Duncraig",
    hpSlope: 0.035,
    damageSlope: 0.018,
  },
  {
    start: 200,
    end: 299,
    name: "Fauztinville",
    hpSlope: 0.04,
    damageSlope: 0.02,
  },
  { start: 300, end: 399, name: "Teganze", hpSlope: 0.045, damageSlope: 0.022 },
  { start: 400, end: 499, name: "Scosglen", hpSlope: 0.06, damageSlope: 0.026 },
  {
    start: 500,
    end: 699,
    name: "Dimensional Labyrinth",
    hpSlope: 0.07,
    damageSlope: 0.03,
  },
  {
    start: 700,
    end: 899,
    name: "Heroic Rift",
    hpSlope: 0.09,
    damageSlope: 0.036,
  },
  {
    start: 900,
    end: 999,
    name: "Dimensional Plane",
    hpSlope: 0.11,
    damageSlope: 0.044,
  },
]);
const RIFT_MODIFIERS = Object.freeze({
  stone_skin: { name: "Stone Skin", text: "Defense quái ×1,10 mỗi stack" },
  elemental_dominion: {
    name: "Elemental Dominion",
    text: "Quái +4% sát thương; quái ngoài boss +4 điểm % cơ hội phép mỗi cộng dồn",
  },
  bloodlust: {
    name: "Bloodlust",
    text: "Quái còn tối đa 50% HP +8% sát thương mỗi cộng dồn",
  },
  unstable_rift: {
    name: "Unstable Rift",
    text: "+2 điểm % gặp hòm mỗi stack (tối đa 16); tăng Mimic và SSR của hòm kho báu",
  },
  fortified: { name: "Fortified", text: "Quái +10% HP mỗi cộng dồn" },
  swift_horror: {
    name: "Swift Horror",
    text: "Quái +3 Accuracy và +1 Evasion mỗi cộng dồn",
  },
  soul_drain: {
    name: "Soul Drain",
    text: "Đòn trúng rút 1 Energy; từ stack 5 rút 2",
  },
  cursed_ground: {
    name: "Cursed Ground",
    text: "−4 Resistance hiệu dụng khi nhận phép mỗi cộng dồn; không giảm chỉ số vĩnh viễn",
  },
});
function regionForFloor(floor) {
  return (
    REGIONS.find((region) => floor >= region.start && floor <= region.end) ||
    REGIONS.at(-1)
  );
}
function enemyScale(floor) {
  const target = clamp(Math.trunc(floor), 1, 999);
  const early = Math.min(target, 100);
  const overrun = Math.max(0, target - 100);
  return {
    hp: 1 + early * 0.065 + overrun * 0.08,
    damage: 1 + early * 0.04 + overrun * 0.038,
  };
}
function checkpointGrowth(floor) {
  return floor < 100
    ? { hp: 6, attack: 1 }
    : floor < 400
      ? { hp: 10, attack: 2 }
      : floor < 700
        ? { hp: 14, attack: 3 }
        : { hp: 30, attack: 6 };
}
function baseMultiplier(state) {
  const floor = Math.min(state.cleared, COMPLETION_FLOOR);
  const checkpoints = Math.min(20, Math.floor(floor / 5));
  return (
    1 +
    Math.min(floor, 50) * 0.06 +
    Math.max(0, floor - 50) * 0.1 +
    checkpoints * 0.15
  );
}
function potentialPayout(state) {
  if (state.cleared <= 0) return 0;
  const gross = Math.min(
    MAX_PAYOUT,
    Math.max(
      0,
      Math.floor(
        (state.stake * baseMultiplier(state) + state.bonus) *
          state.payoutFactor,
      ),
    ),
  );
  // Service fees are already spent coins, so subsequent taxes cannot reduce them.
  return Math.max(0, gross - (state.payoutSpent || 0));
}
const BOSS_DAMAGE_TYPES = Object.freeze({
  butcher: "physical",
  riftwalker: "magic",
  assur: "physical",
  lucion: "magic",
  deimoss: "physical",
});
const BOSS_MECHANICS = Object.freeze({
  "The Butcher": "butcher",
  "Ascendant Riftwalker": "riftwalker",
  Assur: "assur",
  Lucion: "lucion",
  "Deimoss the Fleshweaver": "deimoss",
});
function enemyDamageType(enemy) {
  return (
    BOSS_DAMAGE_TYPES[
      enemy.mechanic ||
        (["boss", "final_boss"].includes(enemy.rank)
          ? BOSS_MECHANICS[enemy.name]
          : null)
    ] ||
    enemy.damageType ||
    "mixed"
  );
}
function serviceCost(state, service) {
  return Math.ceil(
    potentialPayout(state) * (service === "blacksmith" ? 0.12 : 0.2),
  );
}
function itemEffects(definition) {
  if (definition?.effects) return definition.effects;
  return definition || {};
}
function itemCurse(definition) {
  if (definition?.curse) return definition.curse.effects;
  // Saved equipment predates separate buff/curse definitions.
  const effects = {};
  for (const [key, value] of Object.entries(definition || {})) {
    if (
      key === "defenseSet" ||
      key === "bonusPenalty" ||
      (typeof value === "number" && value < 0)
    )
      effects[key] = value;
  }
  return effects;
}
function classShrineActive(state) {
  return Boolean(
    state.classShrine &&
    !state.classShrine.consumed &&
    state.floor >= state.classShrine.from &&
    state.floor <= state.classShrine.until,
  );
}
function payoutReductionCost(state, rate) {
  return (
    potentialPayout(state) -
    potentialPayout({ ...state, payoutFactor: state.payoutFactor * (1 - rate) })
  );
}
const SURPRISE_EVENTS = Object.freeze({
  healer: {
    name: "Wandering Healer",
    text: "Hồi tối đa 30% Max HP (ít nhất 20), thêm 1 bình; tối đa 5 bình.",
  },
  goblin: {
    name: "Treasure Goblin",
    text: "Bắt thành công: +25% cược vào bonus. Trượt: payout ×0,9. Luck và trang bị tăng cơ hội bắt.",
  },
  blacksmith: {
    name: "Blacksmith",
    text: "Mất 12% payout hiện tại để nâng trang bị thêm 1 level. Giữ món và các level cũ; nhận thêm buff của 1 level, đồng thời nhận thêm 1 lớp lời nguyền nếu là UR.",
  },
  purifier: {
    name: "Purifier",
    text: "Mất 20% payout hiện tại để gỡ 1 lớp lời nguyền UR. Giữ trang bị, level và toàn bộ buff; hoàn phần phạt thực tế của lớp được gỡ. Các lớp nguyền khác vẫn còn.",
  },
  sacrifice: {
    name: "Altar of Sacrifice",
    text: "Hiến 20% Max HP hiện tại lấy +3 damage; hoặc trả 10% payout lấy +3 Defense.",
  },
  gambler: {
    name: "Cursed Gambler",
    text: "Cược 10% hoặc 25% payout. 50% thắng và nhận lại gấp đôi; kết quả đã lưu.",
  },
  adventurer: {
    name: "Lost Adventurer",
    text: "Cứu người: mất 2 bình máu, nhận R 80% / SR 20%. Cướp đồ: 25% nhận trang bị SSR, 75% không có gì xảy ra. Bỏ mặc: không có gì xảy ra.",
  },
  fountain: {
    name: "Blood Fountain",
    text: "60% hồi đầy HP; 25% +15 Max HP; 15% gọi Blood Mimic.",
  },
  horadric: {
    name: "Horadric Forge",
    text: "Mất 1 level trang bị và buff của level đó; món Lv.1 sẽ biến mất. Giữ các level còn lại, gỡ cả lời nguyền của level bị nghiền. Chọn nhận đúng 1 bonus: +3 sát thương, +4 Defense, +10 Max HP và hồi 10 HP, hoặc 1 Vé Thoát Hiểm nếu nghiền SSR/UR.",
  },
  merchant: {
    name: "Rift Merchant",
    text: "Ba offer được chọn sẵn trong năm loại. Trả bằng payout; mua một offer rồi đi tiếp.",
  },
  mirror: {
    name: "Mirror of Fate",
    text: "Đổi 10% Max HP lấy +10% damage; hoặc +8 Defense/−2 damage; đập: 20% +2 Luck, 80% đấu clone.",
  },
  treasure_room: {
    name: "Treasure Room",
    text: "Một trong ba hòm là Mimic. Đỏ: +5 damage; xanh: +6 Defense/+5 Resistance; vàng: +50% cược/+1 Luck.",
  },
  contract: {
    name: "Rift Contract",
    text: "Trong 3 tầng kế tiếp: không bình → SSR; không skill → +50% cược; không thủ → +5 damage. Vi phạm chỉ hủy thưởng.",
  },
  class_shrine: {
    name: "Class Shrine",
    text: "Buff riêng của class trong tối đa 3 tầng kế tiếp; hiệu ứng một đòn được tiêu thụ khi dùng.",
  },
  doors: {
    name: "Strange Doors",
    text: "Cửa sáng/vàng tốt 70%, đen tốt 60%. Sáng: hồi đầy/+1 bình hoặc mất 20% Max HP; vàng: +50% cược hoặc Mimic; đen: SSR hoặc Boss.",
  },
});
const CLASS_SHRINE_TEXT = Object.freeze({
  barbarian: "+8 Defense khi HP ≤30%.",
  assassin: "Né chắc chắn đòn phản công kế tiếp.",
  amazon: "Barrage có 20% bắn phát thứ ba.",
  druid: "Hồi 5% Max HP khi hoàn tất tầng.",
  necromancer: "Hấp thụ đòn quái kế tiếp.",
  paladin: "+10 Resistance hiệu dụng khi nhận phép.",
  sorceress: "Skill kế tiếp không tốn Energy.",
});
const MERCHANT_OFFERS = Object.freeze({
  potion: { label: "+1 bình", rate: 0.05 },
  heal: { label: "Hồi đầy HP", rate: 0.08 },
  luck: { label: "+1 Luck", rate: 0.1 },
  item: { label: "Item SR", rate: 0.15 },
  ticket: { label: "+1 Vé", rate: 0.25 },
});
function surpriseOptions(state) {
  const event = state.encounter;
  const option = (action, label, disabled = false) => ({
    action,
    label,
    disabled,
  });
  const paid = (action, label, rate) => {
    const cost = Math.ceil(potentialPayout(state) * rate);
    return option(
      action,
      `${label} · ${cost.toLocaleString("vi-VN")} xu`,
      potentialPayout(state) <= 0 || potentialPayout(state) < cost,
    );
  };
  switch (event.kind) {
    case "healer":
      return [option("event_accept", "Nhận hồi phục")];
    case "goblin":
      return [
        option(
          "event_catch",
          `Bắt Goblin ${Math.round(goblinCatchChance(state) * 100)}%`,
        ),
      ];
    case "blacksmith":
      return [paid("event_forge", "Rèn +1 level", 0.12)];
    case "purifier":
      return [paid("event_cleanse", "Gỡ 1 lớp nguyền", 0.2)];
    case "sacrifice":
      return [
        option(
          "event_blood",
          "Hiến 20% HP · +3 damage",
          state.hp <= Math.floor(state.maxHp * 0.2),
        ),
        paid("event_gold", "+3 Defense", 0.1),
      ];
    case "gambler":
      return [
        paid("event_bet10", "Cược 10%", 0.1),
        paid("event_bet25", "Cược 25%", 0.25),
      ];
    case "adventurer":
      return [
        option("event_rescue", "Cứu người · 2 bình", state.potions < 2),
        option("event_rob", "Cướp đồ · 25% SSR"),
      ];
    case "fountain":
      return [option("event_drink", "Uống")];
    case "horadric":
      return [
        option("event_grind_attack", "Đổi 1 level → +3 damage"),
        option("event_grind_defense", "Đổi 1 level → +4 Defense"),
        option("event_grind_hp", "Đổi 1 level → +10 Max HP / hồi 10"),
        option(
          "event_grind_ticket",
          "Đổi 1 level → +1 Vé",
          !["legendary", "cursed"].includes(event.targetRarity),
        ),
      ];
    case "merchant":
      return event.offers.map((key) =>
        paid(
          `event_buy_${key}`,
          MERCHANT_OFFERS[key].label,
          MERCHANT_OFFERS[key].rate,
        ),
      );
    case "mirror":
      return [
        option(
          "event_mirror_damage",
          "−10% HP · +10% damage",
          state.hp <= Math.floor(state.maxHp * 0.1),
        ),
        option("event_mirror_guard", "+8 Defense · −2 damage"),
        option("event_break", "Đập gương"),
      ];
    case "treasure_room":
      return [
        option("event_chest_red", "Hòm đỏ"),
        option("event_chest_blue", "Hòm xanh"),
        option("event_chest_gold", "Hòm vàng"),
      ];
    case "contract":
      return [
        option("event_contract_potion", "Không dùng bình"),
        option("event_contract_skill", "Không dùng skill"),
        option("event_contract_defend", "Không phòng thủ"),
      ];
    case "class_shrine":
      return [option("event_bless", "Nhận chúc phúc")];
    case "doors":
      return [
        option("event_door_light", "Cửa sáng · 70%"),
        option("event_door_gold", "Cửa vàng · 70%"),
        option("event_door_dark", "Cửa đen · 60%"),
      ];
    default:
      return [option("explore", "Khám phá")];
  }
}
function forgeTarget(state) {
  const rarity = { common: 1, rare: 2, legendary: 3, cursed: 4 };
  return (
    (state.items || [])
      .filter(
        (item) =>
          rarity[item.rarity] &&
          item.definition &&
          Object.values(itemEffects(item.definition)).some(
            (value) => typeof value === "number" && value > 0,
          ),
      )
      .sort(
        (a, b) => rarity[b.rarity] - rarity[a.rarity] || a.level - b.level,
      )[0] || null
  );
}
function curseTarget(state) {
  return (
    (state.items || []).find(
      (item) =>
        item.rarity === "cursed" &&
        Object.keys(itemCurse(item.definition)).length > 0 &&
        item.level > (item.cleansedLevels || 0),
    ) || null
  );
}
module.exports = {
  runDiamondReward,
  clamp,
  luckyBreakChance,
  goblinCatchChance,
  hitChance,
  defenseReduction,
  physicalAfterDefense,
  magicAfterResistance,
  enemyScale,
  baseMultiplier,
  potentialPayout,
  REGIONS,
  RIFT_MODIFIERS,
  regionForFloor,
  checkpointGrowth,
  BOSS_MECHANICS,
  enemyDamageType,
  serviceCost,
  forgeTarget,
  curseTarget,
  itemEffects,
  itemCurse,
  classShrineActive,
  payoutReductionCost,
  SURPRISE_EVENTS,
  CLASS_SHRINE_TEXT,
  MERCHANT_OFFERS,
  surpriseOptions,
};
