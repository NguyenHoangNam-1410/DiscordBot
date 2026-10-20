"use strict";
// Chỉ số / Túi đồ / Rift chia tab con: giới hạn Discord, nội dung từng tab và nút điều hướng.
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  chars = require("../src/hardcore/characters"),
  view = require("../src/hardcore/ui"),
  catalog = require("../src/hardcore/item"),
  forge = require("../src/hardcore/equipment/forge");
const pool = Object.values(catalog.ITEMS_V3).flat();
let count = 0;
const test = (name, fn) => (fn(), count++, console.log("PASS " + name));
function runState() {
  const s = chars.preview("rha_kor", 0, "SSR");
  s.floor = 21;
  s.cleared = 20;
  s.encounter = {
    type: "combat", name: "Dummy", rank: "normal", hp: 5000, maxHp: 5000, defense: 5, resistance: 0,
    evasion: 0, accuracy: 100, critChance: 0, damageMin: 1, damageMax: 2, damageType: "physical",
    nextDamageType: "physical", combatTurn: 1,
  };
  s.phase = "encounter";
  const usable = pool.filter((i) => i.category !== "consumable" && !i.effects.escapeTokens);
  const owned = [usable.find((i) => i.rarity === "rare"), ...usable.filter((i) => i.rarity !== "rare").slice(0, 13)];
  for (const d of owned) core.receiveItem(s, d, 2);
  const lent = owned.find((d) => d.rarity === "rare");
  core.act(Object.assign(s, { encounter: { type: "surprise", kind: "horadric", name: "Forge", targetId: lent.id, forge: forge.prepareV2(lent.id) } }), { id: "d", guild_id: "g", user_id: "u", channel_id: "c" }, "forge_lend", () => 0.99);
  s.phase = "encounter";
  s.floor = 22;
  s.encounter = { type: "combat", name: "Dummy", rank: "normal", hp: 5000, maxHp: 5000, defense: 5, resistance: 0, evasion: 0, accuracy: 100, critChance: 0, damageMin: 1, damageMax: 2, damageType: "physical", nextDamageType: "physical", combatTurn: 1 };
  core.prepareItemCombat(s, () => 0.5);
  return { s, lent };
}
const text = (p) => JSON.stringify(p);
function bounds(p) {
  const e = p.embeds[0].toJSON ? p.embeds[0].toJSON() : p.embeds[0];
  const size = (e.title || "").length + (e.description || "").length + (e.footer?.text || "").length +
    (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(size <= 6000, "embed " + size);
  assert.ok((e.fields || []).length <= 25);
  for (const f of e.fields || []) assert.ok(f.value.length <= 1024 && f.name.length <= 256 && f.value.length > 0);
  const rows = p.components.map((r) => r.toJSON());
  assert.ok(rows.length <= 5);
  const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
  assert.equal(new Set(ids).size, ids.length, "custom_id không được trùng: " + ids.join(", "));
  for (const r of rows) {
    assert.ok(r.components.length <= 5);
    for (const c of r.components) assert.ok(c.custom_id.length <= 100 && /^hardcore:[^:]+:\d+:(view|page)_(stats|items|effects|encounter)_\d{1,4}:/.test(c.custom_id) && /^(view|page)_/.test(c.custom_id.split(":")[3]));
  }
  assert.ok(!/undefined|NaN|\[object/.test(text(p)));
}
const SUBS = { stats: 4, items: 3, effects: 3 };

test("Mọi tab con vừa giới hạn Discord và có hàng nút tab con", () => {
  const { s } = runState();
  for (const [tab, n] of Object.entries(SUBS))
    for (let sub = 0; sub < n; sub++) {
      const p = view.privatePayload(s, "id", "m", tab, (sub + 1) * 100);
      bounds(p);
      const rows = p.components.map((r) => r.toJSON());
      assert.equal(rows[1].components.length, n, tab + " có " + n + " tab con");
      assert.equal(rows[1].components.filter((c) => c.style === 3).length, 1, "đúng một tab con đang chọn");
      assert.ok(rows[1].components.some((c) => c.custom_id.includes(`_${tab}_${(sub + 1) * 100}:`)));
    }
  bounds(view.privatePayload(s, "id", "m", "encounter", 0));
});

test("Chỉ chuyển tab con lấy số liệu: nguồn chỉ số khớp tổng, có mục Sắp tới", () => {
  const { s } = runState();
  const t = text(view.privatePayload(s, "id", "m", "stats", 0));
  assert.match(t, /Nguồn chỉ số/);
  assert.match(t, /STR/);
  assert.match(t, /Sắp tới/);
  assert.match(t, /Checkpoint kế tiếp: tầng \*\*25\*\*/);
});

test("Nhân vật: tinh hồn/innate/affinity/awakening/mastery và trạng thái kit Rha-Kor", () => {
  const { s } = runState();
  const t = text(view.privatePayload(s, "id", "m", "stats", 200));
  assert.match(t, /Class Innate/);
  assert.match(t, /Mastery/);
  assert.match(t, /Affinity/);
  assert.match(t, /Trạng thái kit hiện tại/);
});

test("Trang bị: tổng hợp, nội tại, giới hạn; Hành động: skill/tấn công/phòng thủ kèm dự kiến sát thương", () => {
  const { s } = runState();
  const eq = text(view.privatePayload(s, "id", "m", "stats", 300));
  assert.match(eq, /Tổng hợp trang bị/);
  assert.match(eq, /Giới hạn của bạn/);
  const act = text(view.privatePayload(s, "id", "m", "stats", 400));
  assert.match(act, /Khắc Lệnh Phá Giáp/);
  assert.match(act, /Dự kiến vs quái hiện tại/);
  assert.match(act, /Phòng thủ/);
});

test("Túi đồ: vật tư, trang bị có phân trang và mục đang gửi Forge, set & di vật", () => {
  const { s, lent } = runState();
  assert.match(text(view.privatePayload(s, "id", "m", "items", 0)), /Vật tư & vé/);
  const first = view.privatePayload(s, "id", "m", "items", 200);
  assert.match(text(first), /Đang gửi Horadric Forge/);
  assert.match(text(first), new RegExp(lent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const pages = Math.ceil(s.items.length / 5);
  assert.ok(pages > 1);
  const next = view.privatePayload(s, "id", "m", "items", 201);
  assert.doesNotMatch(text(next), /Đang gửi Horadric Forge/);
  assert.ok(next.components.map((r) => r.toJSON()).some((r) => r.components.some((c) => c.custom_id.includes("page_items_202:"))));
  bounds(next);
  bounds(view.privatePayload(s, "id", "m", "items", 300));
});

test("Rift: modifier, Hiệu ứng tạm thời và Ký ức/dấu ấn nằm ở tab riêng", () => {
  const { s } = runState();
  s.modifiers.fortified = 2;
  assert.match(text(view.privatePayload(s, "id", "m", "effects", 0)), /Fortified|Bậc/);
  assert.match(text(view.privatePayload(s, "id", "m", "effects", 200)), /Hiệu ứng tạm thời|Paradox|Class Shrine/);
  assert.match(text(view.privatePayload(s, "id", "m", "effects", 300)), /Ký ức|dấu ấn|Dấu/);
});

test("Mục Sắp tới nêu tầng món Forge quay về", () => {
  const { s } = runState();
  const due = s.forgeLoans[0].due;
  assert.match(text(view.privatePayload(s, "id", "m", "stats", 0)), new RegExp("tầng \\*\\*" + due + "\\*\\*"));
});

test("Tab con và trang ngoài phạm vi được kẹp lại, route chấp nhận số gộp", () => {
  const { s } = runState();
  bounds(view.privatePayload(s, "id", "m", "stats", 999));
  bounds(view.privatePayload(s, "id", "m", "items", 299));
  const route = /^(?:view|page)_(stats|items|effects|encounter)_(\d{1,4})$/;
  assert.ok(route.test("view_items_300") && route.test("page_items_202"));
});
test("Tab Hành động và mọi tab con mở được ở tình huống không phải chiến đấu", () => {
  const { s } = runState();
  const encounters = [
    { type: "empty", name: "Empty" },
    { type: "chest", kind: "mimic", name: "Chest" },
    ...["fountain", "horadric", "merchant", "mirror"].map((k) => core.makeSurprise(s, () => 0.5, k)),
  ];
  for (const encounter of encounters) {
    const copy = structuredClone(s);
    copy.encounter = encounter;
    // Paradox Unstable Soul chỉ khóa chi phí Skill khi vào trận; ngoài trận không được đọc chi phí.
    copy.activeParadox = { version: 2, id: "unstable_soul", pairId: "volatility", milestone: 20, startFloor: 21, endFloor: 25, combatActionCount: 0, attackActionCount: 0, lockedSkillCost: null };
    for (const [tab, n] of Object.entries(SUBS))
      for (let sub = 0; sub < n; sub++)
        bounds(view.privatePayload(copy, "id", "m", tab, (sub + 1) * 100));
  }
});
test("Nhiều khoản gửi Forge cùng lúc vẫn nằm trong một field và vừa giới hạn", () => {
  const { s } = runState();
  const def = s.forgeLoans[0].definition;
  s.forgeLoans = Array.from({ length: 30 }, (_, i) => ({
    version: 1, definition: def, name: "Món có tên khá dài số " + i, level: 3, cleansedLevels: 0, from: 22, due: 40 + i,
  }));
  const p = view.privatePayload(s, "id", "m", "items", 200);
  bounds(p);
  const e = p.embeds[0].toJSON();
  const loans = e.fields.filter((f) => f.name.includes("Đang gửi Horadric Forge"));
  assert.equal(loans.length, 1);
  assert.match(loans[0].name, /\(30\)/);
  assert.match(loans[0].value, /và \d+ món nữa/);
});
console.log("detail tabs ok (" + count + ")");
