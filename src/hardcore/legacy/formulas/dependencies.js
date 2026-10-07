// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const MAX_PAYOUT = 10_000_000;

  const COMPLETION_FLOOR = 100;

  const GOBLIN_REWARDS = Object.freeze({
    bonusRate: 0.25,
    lossRate: 0.05,
    rarities: Object.freeze({ rare: 0.6, legendary: 0.35, cursed: 0.05 }),
  });

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
    {
      start: 300,
      end: 399,
      name: "Teganze",
      hpSlope: 0.045,
      damageSlope: 0.022,
    },
    {
      start: 400,
      end: 499,
      name: "Scosglen",
      hpSlope: 0.06,
      damageSlope: 0.026,
    },
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
    stone_skin: { name: "Stone Skin", text: "DEF quái ×1,10 mỗi stack" },
    elemental_dominion: {
      name: "Elemental Dominion",
      text: "Quái +4% ATK; quái ngoài boss +4 điểm % cơ hội phép mỗi cộng dồn",
    },
    bloodlust: {
      name: "Bloodlust",
      text: "Quái còn tối đa 50% HP +8% ATK mỗi cộng dồn",
    },
    unstable_rift: {
      name: "Unstable Rift",
      text: "+2 điểm % gặp hòm mỗi stack (tối đa 16); tăng Mimic và SSR của hòm kho báu",
    },
    fortified: { name: "Fortified", text: "Quái +10% HP mỗi cộng dồn" },
    swift_horror: {
      name: "Swift Horror",
      text: "Quái +3 ACC và +1 EVA mỗi cộng dồn",
    },
    soul_drain: {
      name: "Soul Drain",
      text: "Đòn trúng rút 1 ENE; từ stack 5 rút 2",
    },
    cursed_ground: {
      name: "Cursed Ground",
      text: "−4 RES hiệu dụng khi nhận phép mỗi cộng dồn; không giảm chỉ số vĩnh viễn",
    },
  });

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

  const SURPRISE_EVENTS = Object.freeze({
    healer: {
      name: "Wandering Healer",
      text: "Hồi tối đa 30% MAX HP (ít nhất 20), thêm 1 bình; tối đa 5 bình.",
    },
    goblin: {
      name: "Treasure Goblin",
      text: "Bắt thành công: bonus +25% cược và 1 trang bị (60% SR / 35% SSR / 5% UR có nguyền). Trượt: trừ một lần 5% payout hiện tại, làm tròn lên 1 xu. LUCK và trang bị tăng tỷ lệ bắt.",
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
      text: "Hiến 20% MAX HP hiện tại lấy +3 ATK; hoặc trả 10% payout lấy +3 DEF.",
    },
    gambler: {
      name: "Cursed Gambler",
      text: "Cược 10% hoặc 25% payout; thắng thì nhận lại gấp đôi. Kết quả đã lưu.",
    },
    adventurer: {
      name: "Lost Adventurer",
      text: "Cứu người: mất 2 bình máu để nhận trang bị. Cướp đồ: có thể nhận trang bị SSR hoặc không có gì xảy ra. Bỏ mặc: không có gì xảy ra.",
    },
    fountain: {
      name: "Blood Fountain",
      text: "Uống một ngụm: có thể hồi đầy HP, tăng MAX HP hoặc gọi Blood Mimic.",
    },
    horadric: {
      name: "Horadric Forge",
      text: "Mất 1 level trang bị và buff của level đó; món Lv.1 sẽ biến mất. Giữ các level còn lại, gỡ cả lời nguyền của level bị nghiền. Chọn nhận đúng 1 bonus: +3 ATK, +4 DEF, +10 MAX HP và hồi 10 HP, hoặc 1 Vé thoát nếu nghiền SSR/UR.",
    },
    merchant: {
      name: "Rift Merchant",
      text: "Ba offer được chọn sẵn trong năm loại. Trả bằng payout; mua một offer rồi đi tiếp.",
    },
    mirror: {
      name: "Mirror of Fate",
      text: "Đổi 10% MAX HP lấy +10% ATK; hoặc +8 DEF/−2 ATK; hoặc đập gương (may rủi).",
    },
    treasure_room: {
      name: "Treasure Room",
      text: "Một trong ba hòm là Mimic. Đỏ: +5 ATK; xanh: +6 DEF/+5 RES; vàng: +50% cược/+1 LUCK.",
    },
    contract: {
      name: "Rift Contract",
      text: "Trong 3 tầng kế tiếp: không bình → SSR; không skill → +50% cược; không thủ → +5 ATK. Vi phạm chỉ hủy thưởng.",
    },
    class_shrine: {
      name: "Class Shrine",
      text: "Buff riêng của class trong tối đa 3 tầng kế tiếp; hiệu ứng một đòn được tiêu thụ khi dùng.",
    },
    doors: {
      name: "Strange Doors",
      text: "Mỗi cửa có thể tốt hoặc xấu. Sáng: hồi đầy/+1 bình hoặc mất 20% MAX HP; vàng: +50% cược hoặc Mimic; đen: SSR hoặc Boss.",
    },
  });

  const CLASS_SHRINE_TEXT = Object.freeze({
    barbarian: "+8 DEF khi HP ≤30%.",
    assassin: "Né chắc chắn đòn phản công kế tiếp.",
    amazon: "Barrage có 20% bắn phát thứ ba.",
    druid: "Hồi 5% MAX HP khi hoàn tất tầng.",
    necromancer: "Hấp thụ đòn quái kế tiếp.",
    paladin: "+10 RES hiệu dụng khi nhận phép.",
    sorceress: "Skill kế tiếp không tốn ENE.",
  });

  const MERCHANT_OFFERS = Object.freeze({
    potion: { label: "+1 bình", rate: 0.05 },
    heal: { label: "Hồi đầy HP", rate: 0.08 },
    luck: { label: "+1 LUCK", rate: 0.1 },
    item: { label: "Item SR", rate: 0.15 },
    ticket: { label: "+1 Vé thoát", rate: 0.25 },
  });

  // Shrine: loại hiệu ứng được chọn đồng đều khi gặp, số liệu dùng chung cho cả xử lý lẫn UI.
  const SHRINE_KINDS = Object.freeze([
    "healing",
    "armor",
    "experience",
    "blood",
    "corrupted",
    "fake",
  ]);

  const SHRINE_EFFECTS = Object.freeze({
    armorDefense: 3,
    bloodHp: 15,
    bloodAttack: 4,
    experiencePercent: 0.25,
    corruptedAttack: 7,
    corruptedDefense: 4,
    fakeMaxHpPercent: 0.3,
    fakeMinDamage: 10,
  });

  // Tỷ lệ của các sự kiện bí ẩn có may rủi; makeSurprise dùng chung để UI luôn khớp với roll thật.
  const SURPRISE_ODDS = Object.freeze({
    gamblerWin: 0.5,
    adventurerRescueCommon: 0.8,
    adventurerRobLegendary: 0.25,
    fountainHeal: 0.6,
    fountainMaxHp: 0.25,
    fountainMimic: 0.15,
    mirrorLucky: 0.2,
    treasureRoomMimic: 1 / 3,
    doorLight: 0.7,
    doorGold: 0.7,
    doorDark: 0.6,
  });

  const FIXED_SURPRISES = Object.freeze([
    "healer",
    "blacksmith",
    "purifier",
    "sacrifice",
    "merchant",
    "horadric",
    "contract",
    "class_shrine",
  ]);

  // Bẫy: Wrong Portal chọn đồng đều trong nhóm tốt/xấu; makeWrongPortal và UI dùng chung các hằng số này.
  const PORTAL_GOOD_CHANCE = 0.5;

  const PORTAL_GOOD_EFFECTS = Object.freeze([
    "healing_sanctuary",
    "treasure_vault",
    "rift_blessing",
  ]);

  const PORTAL_EFFECT_TEXT = Object.freeze({
    healing_sanctuary: "Healing Sanctuary: +10 HP tối đa, hồi đầy HP, +1 bình",
    treasure_vault: "Treasure Vault: bonus +50% cược",
    rift_blessing: "Rift Blessing: +4 DEF, +5 RES, +1 LUCK",
    blood_rift: "Blood Rift: mất tối đa 15% MAX HP (giữ ít nhất 1 HP)",
    mana_void: "Mana Void: ENE về 0",
    shattered_supplies: "Shattered Supplies: mất tối đa 2 bình máu",
    payout_corruption: "Payout Corruption: payout ×0,9 từ đây về sau",
    dimensional_curse: "Dimensional Curse: −5 DEF, −5% RES",
  });
  return {
    MAX_PAYOUT,
    COMPLETION_FLOOR,
    GOBLIN_REWARDS,
    REGIONS,
    RIFT_MODIFIERS,
    BOSS_DAMAGE_TYPES,
    BOSS_MECHANICS,
    SURPRISE_EVENTS,
    CLASS_SHRINE_TEXT,
    MERCHANT_OFFERS,
    SHRINE_KINDS,
    SHRINE_EFFECTS,
    SURPRISE_ODDS,
    FIXED_SURPRISES,
    PORTAL_GOOD_CHANCE,
    PORTAL_GOOD_EFFECTS,
    PORTAL_EFFECT_TEXT,
  };
};
