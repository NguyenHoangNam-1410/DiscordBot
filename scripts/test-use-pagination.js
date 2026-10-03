const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-use-pagination.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const shop = require("../src/services/shopService");
const { listCatalog } = require("../src/services/itemCatalogService");
const use = require("../src/commands/use");
const { compareItems } = require("../src/services/itemGameService");

const G = "g", U = "u";
const usable = listCatalog().filter((item) => item.type === "consumable");
assert(usable.length >= 25, "cần ≥25 vật phẩm để thử phân trang");
for (const item of usable.slice(0, 25)) shop.addInventory(G, U, item.id, 1);

// Kho còn có cả màu hồ sơ mặc định nên đếm theo kho thực tế
const owned = shop.getInventory(G, U).filter((row) => row.item.type !== "gacha");
const total = owned.length;
const pages = Math.ceil(total / 10);
assert(pages >= 3, `cần ≥3 trang, có ${pages}`);
const json = (payload) => ({ embed: payload.embeds[0].toJSON(), rows: payload.components.map((row) => row.toJSON()) });
const ids = (rows) => rows.flatMap((row) => row.components.map((component) => component.custom_id));
const selectOf = (rows) => rows.find((row) => row.components[0].type === 3 && row.components[0].custom_id.startsWith("use:")).components[0];
const buttonsOf = (rows) => rows.flatMap((row) => row.components).filter((component) => component.type === 2);

// Trang đầu: 10 vật phẩm, đủ 3 trang, có hàng nút phân trang
let page = json(use.usePanel(G, U));
assert.equal(selectOf(page.rows).options.length, 10, "mỗi trang 10 vật phẩm");
assert.match(page.embed.footer.text, new RegExp(`Trang 1/${pages} · ${total} vật phẩm`));
let buttons = buttonsOf(page.rows);
assert.deepEqual(buttons.map((button) => button.disabled), [true, true, false], "trang đầu: khóa Trước, chỉ số; mở Sau");
assert.equal(new Set(ids(page.rows)).size, ids(page.rows).length, "custom_id không trùng");

// Qua các trang: không lặp, đủ 25 vật phẩm, theo thứ tự độ hiếm xuyên trang
const seen = [];
for (let p = 0; p < pages; p += 1) {
  page = json(use.usePanel(G, U, null, "all", p));
  const values = selectOf(page.rows).options.map((option) => option.value);
  assert.equal(values.length, p < pages - 1 ? 10 : total - 10 * (pages - 1));
  seen.push(...values);
  assert.equal(new Set(ids(page.rows)).size, ids(page.rows).length);
  assert.equal(selectOf(page.rows).custom_id, `use:${U}:all:${p}`, "ô chọn nhớ trang hiện tại");
  assert.match(page.embed.description, /\*\*/, "mô tả có vật phẩm");
}
assert.equal(new Set(seen).size, total, "mọi vật phẩm xuất hiện đúng một lần, không lặp giữa các trang");
const expectedOrder = owned.map((row) => row.item).sort(compareItems).map((item) => item.id);
assert.deepEqual(seen, expectedOrder, "thứ tự độ hiếm → game xuyên suốt các trang");
buttons = buttonsOf(json(use.usePanel(G, U, null, "all", pages - 1)).rows);
assert.deepEqual(buttons.map((button) => button.disabled), [false, true, true], "trang cuối: khóa Sau");
// Trang ngoài phạm vi được kẹp lại
assert.match(json(use.usePanel(G, U, null, "all", 99)).embed.footer.text, new RegExp(`Trang ${pages}/${pages}`));
assert.match(json(use.usePanel(G, U, null, "all", -5)).embed.footer.text, new RegExp(`Trang 1/${pages}`));
assert.match(json(use.usePanel(G, U, null, "all", "abc")).embed.footer.text, new RegExp(`Trang 1/${pages}`));

// Lọc theo game chỉ còn 1 trang → không có hàng phân trang
const filtered = json(use.usePanel(G, U, null, "mines"));
assert(!buttonsOf(filtered.rows).length, "ít hơn 1 trang thì không hiện nút phân trang");
const minesCount = shopCount("mines");
function shopCount(game) { return require("../src/services/shopService").getInventory(G, U).filter((row) => require("../src/services/itemGameService").itemMatchesGame(row.item, game) && row.item.type !== "gacha").length; }
assert(minesCount <= 10, "lọc Mines vừa một trang");

// Nút chuyển trang
const updates = [];
const fake = (customId, userId = U) => ({ customId, guildId: G, channelId: "c", user: { id: userId }, update: async (payload) => updates.push(payload), reply: async (payload) => updates.push({ reply: payload }) });
await_(async () => {
  await use.handlePage(fake(`use-page:${U}:all:1:next`));
  assert.match(updates.at(-1).embeds[0].toJSON().footer.text, new RegExp(`Trang 2/${pages}`));
  await use.handlePage(fake(`use-page:${U}:all:0:prev`));
  assert.match(updates.at(-1).embeds[0].toJSON().footer.text, new RegExp(`Trang 1/${pages}`));
  await use.handlePage(fake(`use-page:${U}:all:1:next`, "intruder"));
  assert.match(updates.at(-1).reply.content, /Chỉ người mở kho đồ/);
  await use.handlePage(fake(`use-page:${U}:khong-co-game:0:next`));
  assert.match(updates.at(-1).reply.content, /không hợp lệ/);
  // Đổi bộ lọc quay về trang 1
  await use.handleFilter({ ...fake(`use-filter:${U}`), values: ["all"] });
  assert.match(updates.at(-1).embeds[0].toJSON().footer.text, new RegExp(`Trang 1/${pages}`));
  console.log(JSON.stringify({ ok: true, usePagination: true }));
  process.exit(0);
});
function await_(fn) { fn().catch((error) => { console.error(error); process.exit(1); }); }
