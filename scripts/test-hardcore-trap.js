const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-hardcore-trap.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const engine = require("../src/services/hardcoreEngine");
const service = require("../src/services/hardcoreService");
const { encounterText } = require("../src/services/hardcoreView");

const state = (overrides = {}) => ({
  hp: 60, maxHp: 100, stake: 1000, floor: 5, luck: 0, potions: 3, energy: 4, items: [], modifiers: {},
  damageMin: 5, damageMax: 9, defense: 10, accuracy: 10, evasion: 5, resistance: 0, critChance: 0.05, bonus: 0, cleared: 4, payoutFactor: 1, ...overrides,
});
const sum = (list) => list.reduce((total, item) => total + item.chance, 0);

// Tax Collector / Kẻ trộm: Lucky Break theo LUCK (1,5%/điểm, tối đa 30%)
for (const [luck, expected] of [[0, 0], [10, 0.15], [100, 0.3]]) {
  const tax = engine.trapOdds(state({ luck }), { kind: "tax_collector" });
  assert(Math.abs(tax[0].chance - expected) < 1e-9 && Math.abs(sum(tax) - 1) < 1e-9, `tax luck=${luck}`);
  const thief = engine.trapOdds(state({ luck }), { kind: "potion_thief" });
  assert(Math.abs(thief[0].chance - expected) < 1e-9 && Math.abs(sum(thief) - 1) < 1e-9, `thief luck=${luck}`);
}
const noPotion = engine.trapOdds(state({ potions: 0 }), { kind: "potion_thief" });
assert.equal(noPotion.length, 1); assert.equal(noPotion[0].chance, 1);

// Wrong Portal: công thức cộng đủ 100%, khớp roll thật của makeWrongPortal (cả khi thiếu ENE / bình)
for (const [name, overrides] of [["đủ ENE và bình", {}], ["hết ENE", { energy: 0 }], ["hết bình", { potions: 0 }], ["hết cả hai", { energy: 0, potions: 0 }]]) {
  const base = state(overrides);
  const odds = engine.portalEffectOdds(base);
  assert(Math.abs(sum(odds) - 1) < 1e-9, name);
  assert.equal(odds.filter((item) => item.good).length, 3);
  assert.equal(odds.filter((item) => !item.good).length, 5 - (overrides.energy === 0 ? 1 : 0) - (overrides.potions === 0 ? 1 : 0), name);
  assert(Math.abs(sum(odds.filter((item) => item.good)) - 0.5) < 1e-9);
  const N = 40_000;
  const counts = {};
  for (let i = 0; i < N; i += 1) {
    const portal = service.makeWrongPortal(base).portal;
    counts[portal.effect] = (counts[portal.effect] || 0) + 1;
  }
  for (const item of odds)
    assert(Math.abs((counts[item.effect] || 0) / N - item.chance) < 0.012, `${name}: ${item.effect} công bố ${item.chance.toFixed(3)} vs thực tế ${((counts[item.effect] || 0) / N).toFixed(3)}`);
}
const portal = service.makeWrongPortal(state());
assert.deepEqual(portal.portal.odds, engine.portalEffectOdds(state()), "Portal lưu tỷ lệ lúc tạo");

// UI
const ui = (encounter, extra) => encounterText({ ...state(extra), encounter });
const tax = ui({ kind: "tax_collector", type: "trap", luckyBreakRoll: 0.5 }, { luck: 10 });
for (const needle of ["TAX COLLECTOR", "**15,0%** · Lucky Break: tránh được thuế", "**85,0%** · Mất thuế", "186 xu"]) assert(tax.includes(needle), `tax thiếu "${needle}"`);
const thief = ui({ kind: "potion_thief", type: "trap", luckyBreakRoll: 0.5 });
for (const needle of ["**0,0%** · Lucky Break", "**100,0%** · Bị trộm mất 1 bình máu"]) assert(thief.includes(needle), `thief thiếu "${needle}"`);
assert(ui({ kind: "potion_thief", type: "trap" }, { potions: 0 }).includes("Không còn bình để mất"));
const wp = ui(portal);
for (const needle of ["WRONG PORTAL", "**16,7%** · Healing Sanctuary", "**16,7%** · Treasure Vault", "**16,7%** · Rift Blessing", "**10,0%** · Blood Rift", "**10,0%** · Mana Void", "**10,0%** · Shattered Supplies", "**10,0%** · Payout Corruption", "**10,0%** · Dimensional Curse", "Elite đánh phủ đầu", "LUCK không đổi Portal"]) assert(wp.includes(needle), `portal thiếu "${needle}"`);
// Portal của run cũ không có odds: dùng 50/50
const old = ui({ type: "trap", kind: "wrong_portal", portal: { good: true, goodChance: 0.5, effect: "treasure_vault" } });
assert(old.includes("**50,0%** · Portal tốt") && old.includes("**50,0%** · Portal xấu"));
// Không lộ kết quả đã roll
const a = service.makeWrongPortal(state(), { goodRoll: 0.1, effectRoll: 0 });
const b = service.makeWrongPortal(state(), { goodRoll: 0.9, effectRoll: 0.99 });
assert.notEqual(a.portal.effect, b.portal.effect);
assert.equal(ui(a), ui(b), "UI Portal không được lộ kết quả đã roll");
assert.equal(ui({ kind: "tax_collector", type: "trap", luckyBreakRoll: 0.01 }, { luck: 10 }), ui({ kind: "tax_collector", type: "trap", luckyBreakRoll: 0.99 }, { luck: 10 }), "UI thuế không lộ Lucky Break đã roll");

console.log(JSON.stringify({ ok: true, hardcoreTrap: true }));
process.exit(0);
