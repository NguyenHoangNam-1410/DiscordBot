const crypto = require("node:crypto");
const { listCatalog } = require("./itemCatalogService");
const { itemGames } = require("./itemGameService");

// Mỗi game có tỷ lệ riêng rơi ra vật phẩm của chính game đó sau mỗi ván hợp lệ (không rơi vật phẩm dùng chung như vé Gacha).
// Game chưa có vật phẩm riêng (Sinh tồn) thì không rơi.
const GAME_ITEM_DROP_CHANCE = Object.freeze({
  baucua: 0.04,
  taixiu: 0.04,
  duangua: 0.06,
  blackjack: 0.04,
  poker: 0.06,
  mines: 0.04,
  chinchiro: 0.04,
  coquay: 0.05,
  vuatiengviet: 0.03,
  hardcore: 0,
});
// Tỷ lệ cố định theo độ hiếm; vật phẩm trong độ hiếm được chọn ngẫu nhiên đều dù game có bao nhiêu vật phẩm.
// Game không có vật phẩm ở một độ hiếm thì độ hiếm đó bị bỏ qua và các bậc còn lại được chuẩn hóa lại.
const DROP_RARITY_RATES = Object.freeze({ R: 60, SR: 28, SSR: 9, UR: 3 });

function dropPool(game) {
  return listCatalog().filter(
    (item) =>
      item.type !== "color" &&
      item.type !== "gacha" &&
      item.gachaEligible !== false &&
      (itemGames(item) || []).includes(game),
  );
}
function dropChance(game, multiplier = 1) {
  const base = GAME_ITEM_DROP_CHANCE[game] || 0;
  return Math.max(0, Math.min(1, base * Math.max(0, Number(multiplier) || 0)));
}
// Chọn độ hiếm theo tỷ lệ cố định rồi chọn đều trong độ hiếm; `randomInt(n)` trả số nguyên 0..n-1.
function pickDropItem(game, randomInt = crypto.randomInt) {
  const pool = dropPool(game);
  const byRarity = Object.keys(DROP_RARITY_RATES)
    .map((rarity) => ({
      rarity,
      items: pool.filter((item) => item.rarity === rarity),
    }))
    .filter((group) => group.items.length);
  if (!byRarity.length) return null;
  const total = byRarity.reduce(
    (sum, group) => sum + DROP_RARITY_RATES[group.rarity],
    0,
  );
  let roll = (randomInt(10_000) / 10_000) * total;
  const group =
    byRarity.find((entry) => (roll -= DROP_RARITY_RATES[entry.rarity]) < 0) ||
    byRarity.at(-1);
  return group.items[randomInt(group.items.length)];
}

// Thưởng vật phẩm của câu hỏi khó: độ hiếm theo đúng tỷ lệ độ hiếm của Gacha (lấy từ bảng Gacha hiện tại của server,
// bỏ phần xu vì chắc chắn nhận vật phẩm), rồi chọn đều trong các vật phẩm của game ở độ hiếm đó.
const QUESTION_TIERS = Object.freeze(["R", "SR", "SSR", "UR"]);
function questionRewardRates(game = "vuatiengviet", guildId = null) {
  const { listGachaPool } = require("./gachaPoolService");
  const items = dropPool(game);
  const weights = {};
  for (const entry of listGachaPool(guildId || "__default__", {
    luckMultiplier: 1,
  }))
    if (QUESTION_TIERS.includes(entry.tier))
      weights[entry.tier] =
        (weights[entry.tier] || 0) + Math.max(0, entry.effectiveWeight || 0);
  const tiers = QUESTION_TIERS.map((tier) => ({
    tier,
    weight: weights[tier] || 0,
    items: items.filter((item) => item.rarity === tier),
  })).filter((entry) => entry.weight > 0 && entry.items.length);
  const total = tiers.reduce((sum, entry) => sum + entry.weight, 0);
  return tiers.map((entry) => ({ ...entry, rate: (entry.weight / total) * 100 }));
}
function rollQuestionItem(
  game = "vuatiengviet",
  guildId = null,
  randomInt = crypto.randomInt,
) {
  const rates = questionRewardRates(game, guildId);
  if (!rates.length) return null;
  let roll = (randomInt(1_000_000) / 1_000_000) * 100;
  const entry = rates.find((candidate) => (roll -= candidate.rate) < 0) || rates.at(-1);
  return entry.items[randomInt(entry.items.length)];
}
// Cộng vật phẩm vào túi; lỗi cấp thưởng không được làm hỏng việc trả thưởng xu/kim cương đã trao.
function grantQuestionItem(guildId, userId, game = "vuatiengviet", randomInt) {
  try {
    const item = rollQuestionItem(game, guildId, randomInt);
    if (!item) return null;
    require("./shopService").addInventory(guildId, userId, item.id, 1);
    return item;
  } catch (error) {
    console.error("could not grant question item", error);
    return null;
  }
}

module.exports = {
  QUESTION_TIERS,
  questionRewardRates,
  rollQuestionItem,
  grantQuestionItem,
  GAME_ITEM_DROP_CHANCE,
  DROP_RARITY_RATES,
  dropPool,
  dropChance,
  pickDropItem,
};
