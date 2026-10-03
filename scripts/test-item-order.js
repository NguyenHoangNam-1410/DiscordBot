const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-item-order.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { listCatalog } = require("../src/services/itemCatalogService");
const { compareItems, gameGroupIndex, itemGames, GAME_FILTERS } = require("../src/services/itemGameService");
const shop = require("../src/services/shopService");
const { catalogPanel } = require("../src/commands/itemCatalogView");

const RANK = { UR: 4, SSR: 3, SR: 2, R: 1 };
const rank = (item) => RANK[item.rarity] || 0;
const consumables = listCatalog().filter((item) => item.type === "consumable");

// Danh mục: độ hiếm giảm dần; trong cùng độ hiếm, nhóm game không bị xen kẽ
const sorted = [...consumables].sort(compareItems);
for (let i = 1; i < sorted.length; i += 1) assert(rank(sorted[i - 1]) >= rank(sorted[i]), "độ hiếm phải giảm dần");
for (const rarity of ["UR", "SSR", "SR", "R"]) {
  const groups = sorted.filter((item) => item.rarity === rarity).map(gameGroupIndex);
  assert.deepEqual(groups, [...groups].sort((a, b) => a - b), `${rarity}: cùng game phải đứng gần nhau (nhóm game tăng dần)`);
  const seen = new Set();
  let previous = null;
  for (const group of groups) {
    if (group !== previous) assert(!seen.has(group), `${rarity}: nhóm game ${group} bị tách rời`);
    seen.add(group);
    previous = group;
  }
}
// Thứ tự nhóm game theo GAME_FILTERS, vật phẩm dùng chung sau game, vật phẩm hồ sơ cuối
const byId = (id) => consumables.find((item) => item.id === id);
assert(gameGroupIndex(byId("horse_jackpot")) < gameGroupIndex(byId("mines_radar")), "Đua ngựa trước Mines theo GAME_FILTERS");
assert.equal(gameGroupIndex({ type: "color" }), GAME_FILTERS.length + 1);
assert.equal(gameGroupIndex({ effect: "effect_cleanser", type: "consumable" }), GAME_FILTERS.length);
assert.equal(itemGames(byId("horse_jackpot"))[0], "duangua");
// Ổn định, không phụ thuộc thứ tự đầu vào
assert.deepEqual([...consumables].reverse().sort(compareItems).map((item) => item.id), sorted.map((item) => item.id));

// Kho đồ (getInventory, dùng cho /vatpham kho, sudung, tang) cũng theo thứ tự đó dù thêm theo thứ tự nào
const G = "g", U = "u";
const picks = ["mines_radar", "horse_jackpot", "baucua_small_lens", "poker_insurance", "mines_blast_shield", "horse_consolation"].filter((id) => byId(id));
for (const id of [...picks].reverse()) shop.addInventory(G, U, id, 1);
const inventory = shop.getInventory(G, U).filter((row) => picks.includes(row.item_id));
assert.deepEqual(inventory.map((row) => row.item_id), [...picks].map((id) => byId(id)).sort(compareItems).map((item) => item.id));
for (let i = 1; i < inventory.length; i += 1) assert(rank(inventory[i - 1].item) >= rank(inventory[i].item));

// Catalog /iteminfo: các dòng hiện theo thứ tự đã sắp xếp
const description = catalogPanel(G, U, "all", 0).embeds[0].toJSON().description;
const shownNames = [...description.matchAll(/\*\*(.+?)\*\* \[(R|SR|SSR|UR)\]/g)].map((match) => match[2]);
assert(shownNames.length > 3);
for (let i = 1; i < shownNames.length; i += 1) assert(RANK[shownNames[i - 1]] >= RANK[shownNames[i]], "trang catalog phải hiện độ hiếm giảm dần");

console.log(JSON.stringify({ ok: true, itemOrder: true }));
process.exit(0);
