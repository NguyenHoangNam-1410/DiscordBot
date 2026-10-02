const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-hardcore-shrine.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const engine = require("../src/services/hardcoreEngine");
const { applyShrine } = require("../src/services/hardcoreService");
const { encounterText } = require("../src/services/hardcoreView");

const base = (overrides = {}) => ({ hp: 60, maxHp: 100, stake: 1000, defense: 10, damageMin: 5, damageMax: 9, bonus: 0, ...overrides });

// Bảng tỷ lệ: 6 loại đồng đều, cộng lại đúng 100%
const outcomes = engine.shrineOutcomes(base());
assert.deepEqual(outcomes.map((item) => item.kind), [...engine.SHRINE_KINDS]);
assert(Math.abs(outcomes.reduce((sum, item) => sum + item.chance, 0) - 1) < 1e-9);
assert.deepEqual(["good", "mixed", "bad"].map((tone) => outcomes.filter((item) => item.tone === tone).length), [3, 2, 1]);

// Số liệu hiển thị khớp với thứ applyShrine thực sự làm
const text = (kind) => outcomes.find((item) => item.kind === kind).text;
let state = base();
applyShrine(state, "healing");
assert.equal(state.hp, 100); assert.match(text("healing"), /\+40 HP/);
state = base(); applyShrine(state, "armor");
assert.equal(state.defense, 13); assert.match(text("armor"), /\+3 DEF/);
state = base(); applyShrine(state, "experience");
assert.equal(state.bonus, 250); assert.match(text("experience"), /\+250 xu/);
state = base(); applyShrine(state, "blood");
assert.deepEqual([state.hp, state.damageMin, state.damageMax], [45, 9, 13]); assert.match(text("blood"), /−15 HP.*\+4 ATK/);
state = base(); applyShrine(state, "corrupted");
assert.deepEqual([state.damageMin, state.damageMax, state.defense], [12, 16, 6]); assert.match(text("corrupted"), /\+7 ATK.*−4 DEF/);
state = base(); applyShrine(state, "fake");
assert.equal(state.hp, 30); assert.match(text("fake"), /mất 30 HP/);
state = base({ hp: 30 }); applyShrine(state, "fake");
assert.equal(state.hp, 0, "đúng như cảnh báo: HP ≤ sát thương thì chết");
state = base({ maxHp: 20, hp: 20 }); applyShrine(state, "fake");
assert.equal(state.hp, 10, "sát thương tối thiểu 10");

// UI: hiện đủ 6 dòng + tổng kết, cảnh báo chết chỉ khi HP đủ thấp, không lộ loại Shrine thật
const ui = (extra, kind) => encounterText({ ...base(extra), encounter: { type: "shrine", kind } });
const view = ui({}, "healing");
for (const needle of ["16,7%", "🟢", "🟡", "🔴", "Hồi đầy HP", "+3 DEF", "Payout +250", "+4 ATK", "−4 DEF", "Shrine giả"])
  assert(view.includes(needle), `UI Shrine thiếu "${needle}"`);
assert(view.includes("🟢 có lợi 50% · 🟡 đánh đổi 33% · 🔴 gây hại 17%"));
assert(!view.includes("giết bạn"), "HP 60/100 chưa bị Shrine giả giết");
assert(ui({ hp: 30 }, "healing").includes("giết bạn"), "HP 30/100 phải cảnh báo có thể chết");
assert.equal(ui({}, "fake"), ui({}, "healing"), "UI không được lộ loại Shrine đã roll");

console.log(JSON.stringify({ ok: true, hardcoreShrine: true }));
process.exit(0);
