const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-hardcore-chest.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { makeChest, chestOdds } = require("../src/services/hardcoreService");
const { encounterText } = require("../src/services/hardcoreView");

const state = (overrides = {}) => ({ pityRare: 0, pityLegendary: 0, luck: 0, mimicChance: 0, mimicDetection: 0, legendaryFind: 0, modifiers: {}, hp: 50, maxHp: 100, stake: 1000, floor: 5, ...overrides });
const kinds = ["ancient_mimic", "mimic", "legendary", "cursed", "rare", "common", "empty", "fake_legendary"];
const sum = (odds) => kinds.reduce((total, kind) => total + odds[kind], 0);

// Công thức: tổng 100%, và khớp với phân phối thực của makeChest (mô phỏng)
const scenarios = [
  ["hòm thường", state(), false],
  ["hòm kho báu", state(), true],
  ["pity 5 (không Mimic, chắc chắn có đồ)", state({ pityRare: 5 }), false],
  ["luck + legendary cao, rift bất ổn, Mimic tăng", state({ luck: 20, legendaryFind: 0.1, pityLegendary: 15, modifiers: { unstable_rift: 4 }, mimicChance: 0.2 }), false],
  ["kho báu + rift bất ổn", state({ modifiers: { unstable_rift: 5 } }), true],
];
for (const [name, base, treasure] of scenarios) {
  const odds = chestOdds(base, treasure);
  assert(Math.abs(sum(odds) - 1) < 1e-9, `${name}: tổng tỷ lệ ${sum(odds)}`);
  const counts = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const N = 60_000;
  for (let i = 0; i < N; i += 1) counts[makeChest(base, treasure).kind] += 1;
  for (const kind of kinds)
    assert(Math.abs(counts[kind] / N - odds[kind]) < 0.012, `${name}: ${kind} công thức ${odds[kind].toFixed(3)} vs mô phỏng ${(counts[kind] / N).toFixed(3)}`);
}
assert.equal(chestOdds(state({ pityRare: 5 }), false).mimic + chestOdds(state({ pityRare: 5 }), false).ancient_mimic, 0);
assert.equal(chestOdds(state({ luck: 100 }), false).detect, 0.95, "phát hiện Mimic tối đa 95%");

// Hòm lưu tỷ lệ lúc tạo và đánh dấu loại hòm
const chest = makeChest(state(), true);
assert.equal(chest.treasure, true);
assert.deepEqual(chest.odds, chestOdds(state(), true));

// UI
const text = encounterText({ ...state(), encounter: makeChest(state(), false) });
for (const needle of ["HÒM BÍ ẨN", "Tỷ lệ khi **Mở**", "🟢", "🟡", "🔴", "Mimic — phải chiến đấu", "Hòm trống", "Đồ SSR giả", "phát hiện Mimic (nếu có) **25,0%**", "**Tổng:**"])
  assert(text.includes(needle), `UI hòm thiếu "${needle}"`);
assert(encounterText({ ...state(), encounter: makeChest(state(), true) }).includes("HÒM KHO BÁU"));
const fixed = (kind) => encounterText({ ...state(), encounter: { ...makeChest(state(), false), kind, rarity: null, item: null } });
assert.equal(fixed("mimic").replace(/\s+/g, " "), fixed("legendary").replace(/\s+/g, " "), "UI không được lộ loại hòm đã roll");
assert(!encounterText({ ...state(), encounter: { type: "chest", kind: "common", inspected: false, revealed: false } }).includes("Tỷ lệ"), "hòm của run cũ không có tỷ lệ thì bỏ phần này");
assert(encounterText({ ...state(), encounter: makeChest(state(), false) }).length < 1800, "text không quá dài");

console.log(JSON.stringify({ ok: true, hardcoreChest: true }));
process.exit(0);
