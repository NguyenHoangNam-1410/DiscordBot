const crypto = require("node:crypto");
const { listCatalog } = require("./itemCatalogService");
const { itemGames } = require("./itemGameService");

// Mỗi game có tỷ lệ riêng rơi ra vật phẩm của chính game đó sau mỗi ván hợp lệ (không rơi vật phẩm dùng chung như vé Gacha).
// Game chưa có vật phẩm riêng (Sinh tồn) thì không rơi.
const GAME_ITEM_DROP_CHANCE = Object.freeze({
  baucua: 0.04,
  taixiu: 0.04,
  duangua: 0.06,
  oantuti: 0.03,
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

module.exports = {
  GAME_ITEM_DROP_CHANCE,
  DROP_RARITY_RATES,
  dropPool,
  dropChance,
  pickDropItem,
};
