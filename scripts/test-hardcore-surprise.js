const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-hardcore-surprise.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const engine = require("../src/services/hardcoreEngine");
const service = require("../src/services/hardcoreService");
const { encounterText } = require("../src/services/hardcoreView");

const state = (overrides = {}) => ({
  hp: 60, maxHp: 100, stake: 1000, floor: 5, luck: 0, goblinChance: 0, potions: 3, items: [], modifiers: {},
  damageMin: 5, damageMax: 9, defense: 10, accuracy: 10, evasion: 5, resistance: 0, critChance: 0.05, bonus: 0,
  ...overrides,
});
const sectionChance = (sections, title, textPart) =>
  sections.find((section) => section.title === title).outcomes.find((item) => item.text.includes(textPart)).chance;

// Mọi sự kiện có may rủi: mỗi lựa chọn cộng đúng 100%; sự kiện còn lại cố định
const random = ["goblin", "gambler", "adventurer", "fountain", "mirror", "treasure_room", "doors"];
for (const kind of random) {
  const sections = engine.surpriseOdds(state(), { kind });
  assert(sections.length > 0, kind);
  for (const section of sections)
    assert(Math.abs(section.outcomes.reduce((sum, item) => sum + item.chance, 0) - 1) < 1e-9, `${kind}/${section.title} không đủ 100%`);
}
for (const kind of engine.FIXED_SURPRISES) assert.equal(engine.surpriseOdds(state(), { kind }), null, kind);
assert.deepEqual([...Object.keys(engine.SURPRISE_EVENTS)].sort(), [...random, ...engine.FIXED_SURPRISES].sort(), "mỗi sự kiện phải được phân loại may rủi hoặc cố định");

// Tỷ lệ hiển thị khớp roll thật của makeSurprise
const N = 40_000;
const tally = (kind, pickValue) => {
  const counts = {};
  for (let i = 0; i < N; i += 1) {
    const key = pickValue(service.makeSurprise(state(), kind));
    counts[key] = (counts[key] || 0) + 1;
  }
  return (key) => (counts[key] || 0) / N;
};
const near = (actual, expected, label) => assert(Math.abs(actual - expected) < 0.012, `${label}: thực tế ${actual.toFixed(3)} vs công bố ${expected.toFixed(3)}`);
let freq = tally("fountain", (e) => e.outcome);
const fountain = engine.surpriseOdds(state(), { kind: "fountain" });
near(freq("heal"), sectionChance(fountain, "Uống", "Hồi đầy"), "fountain heal");
near(freq("hp"), sectionChance(fountain, "Uống", "HP tối đa"), "fountain max hp");
near(freq("mimic"), sectionChance(fountain, "Uống", "Blood Mimic"), "fountain mimic");
freq = tally("gambler", (e) => e.win);
near(freq(true), 0.5, "gambler");
freq = tally("mirror", (e) => e.lucky);
near(freq(true), sectionChance(engine.surpriseOdds(state(), { kind: "mirror" }), "Đập gương", "LUCK"), "mirror");
freq = tally("treasure_room", (e) => e.mimicChest);
for (const color of ["red", "blue", "gold"]) near(freq(color), 1 / 3, `treasure ${color}`);
const adventurer = engine.surpriseOdds(state(), { kind: "adventurer" });
freq = tally("adventurer", (e) => (e.robItem ? "rob" : "norob"));
near(freq("rob"), sectionChance(adventurer, "Cướp đồ", "SSR"), "adventurer rob");
freq = tally("adventurer", (e) => (service.ITEMS.rare.includes(e.rescueItem) ? "rare" : "common"));
near(freq("rare"), sectionChance(adventurer, "Cứu người (mất 2 bình)", "SR"), "adventurer rescue");
for (const [door, title] of [["light", "Cửa sáng"], ["gold", "Cửa vàng"], ["dark", "Cửa đen"]]) {
  freq = tally("doors", (e) => e.doors[door]);
  near(freq(true), engine.surpriseOdds(state(), { kind: "doors" }).find((section) => section.title === title).outcomes[0].chance, title);
}
// Goblin dùng đúng công thức bắt, thay đổi theo LUCK
assert.equal(sectionChance(engine.surpriseOdds(state(), { kind: "goblin" }), "Bắt Goblin", "Bắt được"), engine.goblinCatchChance(state()));
assert(sectionChance(engine.surpriseOdds(state({ luck: 15 }), { kind: "goblin" }), "Bắt Goblin", "Bắt được") > 0.6);

// UI
const ui = (kind, extra) => encounterText({ ...state(extra), encounter: { type: "surprise", kind, successRoll: 0.5, win: true, outcome: "heal", lucky: true, mimicChest: "red", doors: { light: true, gold: false, dark: true } } });
for (const kind of random) {
  const text = ui(kind);
  assert(text.includes("🎲 **Tỷ lệ kết quả**"), `${kind}: thiếu bảng tỷ lệ`);
  assert(/\*\*\d+,\d%\*\*/.test(text), `${kind}: thiếu phần trăm`);
}
assert(ui("fountain").includes("**60,0%** · Hồi đầy HP") && ui("fountain").includes("**15,0%** · Blood Mimic"));
assert(ui("doors").includes("**Cửa đen**") && ui("doors").includes("**60,0%** · Nhận đồ SSR"));
assert(ui("treasure_room").includes("**33,3%** · Mimic"));
assert(ui("healer").includes("Không có may rủi"), "sự kiện cố định phải ghi rõ");
// Không lộ kết quả đã roll
const same = (kind, a, b) => assert.equal(encounterText({ ...state(), encounter: { type: "surprise", kind, ...a } }), encounterText({ ...state(), encounter: { type: "surprise", kind, ...b } }), `${kind} lộ kết quả đã roll`);
same("fountain", { outcome: "heal" }, { outcome: "mimic" });
same("doors", { doors: { light: true, gold: true, dark: true } }, { doors: { light: false, gold: false, dark: false } });
same("treasure_room", { mimicChest: "red" }, { mimicChest: "gold" });
same("gambler", { win: true }, { win: false });
for (const kind of Object.keys(engine.SURPRISE_EVENTS)) assert(ui(kind).length < 3000, `${kind}: text quá dài`);

console.log(JSON.stringify({ ok: true, hardcoreSurprise: true }));
process.exit(0);
