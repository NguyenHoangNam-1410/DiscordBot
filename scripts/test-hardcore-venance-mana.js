"use strict";
// Venance S5 (stack Dư Âm Cổ Ngữ hoàn 1 MP/stack) và S6 (hoàn 2 MP khi hết chuỗi cường hóa).
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  chars = require("../src/hardcore/characters"),
  kit = require("../src/hardcore/characters/venance"),
  awake = require("../src/hardcore/awakening");
const session = { id: "venance-mana", guild_id: "g", user_id: "v", channel_id: "c" };
const rng = () => 0.5;
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
const fixture = () => ({
  type: "combat", name: "Fixture", rank: "normal", hp: 100000, maxHp: 100000, defense: 0, resistance: 0,
  evasion: 0, accuracy: 100000, critChance: 0, damageMin: 1, damageMax: 1, damageType: "physical",
  nextDamageType: "physical", combatTurn: 1,
});
function fresh(n, awakened = false) {
  const s = chars.preview("venance", n, "SSR");
  Object.assign(s, { floor: 6, cleared: 5, encounter: fixture() });
  if (awakened) {
    s.floor = 100;
    awake.grant(s, { rank: "boss", hp: 0 });
    s.floor = 6;
  }
  core.prepareItemCombat(s, rng);
  s.spellMin = s.spellMax = 100;
  return s;
}
const act = (s, a) => {
  s.spellMin = s.spellMax = 100;
  const r = core.act(s, session, a, rng);
  s.spellMin = s.spellMax = 100;
  return r;
};
// Hạ quái bằng đòn hiện tại rồi chuyển sang trận mới để chuỗi cường hóa tiếp tục.
function killThenNextRoom(s) {
  s.encounter.hp = 1;
  act(s, "attack");
  s.phase = "encounter";
  s.encounter = fixture();
  core.prepareItemCombat(s, rng);
}

test("S0-S4 không có stack và không hoàn MP khi hết chuỗi", () => {
  for (const n of [0, 4]) {
    const s = fresh(n);
    act(s, "skill");
    assert.equal(s.mana, 2, "Skill tốn 2 MP");
    for (let i = 0; i < 3; i++) act(s, "attack");
    assert.equal(kit.frame(s).remaining, 0);
    assert.equal(s.mana, 2, `S${n}: hết chuỗi không hoàn MP`);
    assert.equal(kit.snapshot(n).killMana, 0);
    assert.equal(kit.snapshot(n).endMana, 0);
  }
});

test("S5: đánh cường hóa không hạ quái thì không có stack, không hoàn MP", () => {
  const s = fresh(5);
  act(s, "skill");
  for (let i = 0; i < 3; i++) act(s, "attack");
  assert.equal(s.mana, 2);
  assert(!kit.frame(s).stacks);
});

test("S5: mỗi quái hạ bằng đòn cường hóa = 1 stack; hết chuỗi hoàn 1 MP mỗi stack", () => {
  const s = fresh(5);
  act(s, "skill");
  killThenNextRoom(s);
  assert.equal(kit.frame(s).stacks, 1);
  assert.equal(s.mana, 2, "chưa hoàn khi chuỗi chưa kết thúc");
  assert.match(s.lastLog, /Dư Âm Cổ Ngữ: 1 stack/);
  killThenNextRoom(s);
  assert.equal(kit.frame(s).stacks, 2);
  s.mana = 0;
  s.encounter.hp = 100000;
  act(s, "attack"); // hành động cường hóa thứ 3
  assert.equal(kit.frame(s).remaining, 0);
  assert.equal(s.mana, 2, "2 stack = +2 MP (S5 chưa có hoàn kết thúc chuỗi)");
  assert.equal(kit.frame(s).stacks, 0, "stack được dùng hết");
  assert.match(s.lastLog, /hồi 2 MP/);
});

test("S5: đòn thường ngoài chuỗi cường hóa hạ quái không tạo stack", () => {
  const s = fresh(5);
  s.encounter.hp = 1;
  act(s, "attack");
  assert(!kit.frame(s)?.stacks);
});

test("S6: hết 3 hành động cường hóa hoàn thêm 2 MP, cộng cả stack, không vượt Max MP", () => {
  const s = fresh(6);
  act(s, "skill");
  killThenNextRoom(s);
  assert.equal(kit.frame(s).stacks, 1);
  s.mana = 0;
  s.encounter.hp = 100000;
  act(s, "attack");
  act(s, "attack");
  assert.equal(kit.frame(s).remaining, 0);
  assert.equal(s.mana, 3, "1 stack + 2 kết thúc chuỗi");
  assert.match(s.lastLog, /hồi 3 MP/);
  const capped = fresh(6);
  act(capped, "skill");
  for (let i = 0; i < 3; i++) act(capped, "attack");
  assert.equal(capped.mana, 4, "2 + 2 = 4, đúng Max MP");
  const full = fresh(6);
  act(full, "skill");
  full.mana = 4;
  for (let i = 0; i < 3; i++) act(full, "attack");
  assert.equal(full.mana, 4, "không vượt Max MP");
});

test("S6: không còn xung 40%; đòn thứ ba chỉ có hệ số S3", () => {
  const s = fresh(6, true);
  act(s, "skill");
  act(s, "attack");
  act(s, "attack");
  const hp = s.encounter.hp;
  act(s, "attack");
  assert.equal(hp - s.encounter.hp, 416);
  assert(!s.lastLog.includes("Xung tinh giới"));
  assert.equal("pulse" in s.venanceProfile, false);
});

test("stack tối đa 3", () => {
  const s = fresh(5);
  act(s, "skill");
  killThenNextRoom(s);
  killThenNextRoom(s);
  s.encounter.hp = 1;
  kit.frame(s).remaining = 3; // giữ chuỗi để thử trần
  kit.frame(s).stacks = 3;
  act(s, "attack");
  assert(kit.frame(s).stacks <= 3);
});

test("dùng lại Skill giữa chừng: trả stack đã có nhưng không nhận hoàn S6", () => {
  const s = fresh(6);
  act(s, "skill");
  killThenNextRoom(s);
  assert.equal(kit.frame(s).stacks, 1);
  s.mana = 4;
  act(s, "skill");
  assert.equal(s.mana, 3, "4 − 2 (Skill) + 1 (stack), không +2");
  assert.equal(kit.frame(s).stacks, 0);
  assert.equal(kit.frame(s).remaining, 3, "chuỗi mới");
});

test("hồ sơ run cũ có pulse được nâng cấp, stack hỏng bị từ chối", () => {
  const s = fresh(6);
  const old = { ...s.venanceProfile, pulse: 0.4 };
  delete old.killMana;
  delete old.endMana;
  s.venanceProfile = old;
  core.normalize(s);
  assert.equal("pulse" in s.venanceProfile, false);
  assert.equal(s.venanceProfile.killMana, 1);
  assert.equal(s.venanceProfile.endMana, 2);
  const bad = fresh(5);
  act(bad, "skill");
  bad.venanceState.stacks = 4;
  assert.throws(() => core.normalize(bad), /INVALID_VENANCE_COMBAT/);
  bad.venanceState.stacks = -1;
  assert.throws(() => core.normalize(bad), /INVALID_VENANCE_COMBAT/);
});

test("mô tả hiển thị S5/S6 và stack hiện hành", () => {
  const s5 = fresh(5);
  assert(kit.innateText(s5).includes("Dư Âm Cổ Ngữ"));
  assert(!kit.innateText(s5).includes("Hoàn nguyên (S6)"));
  const s6 = fresh(6);
  assert(kit.innateText(s6).includes("Hoàn nguyên (S6)") && kit.innateText(s6).includes("2"));
  act(s6, "skill");
  killThenNextRoom(s6);
  assert(kit.status(s6).includes("Dư Âm"));
  const s4 = fresh(4);
  assert(!kit.innateText(s4).includes("Dư Âm"));
  const catalog = require("../src/hardcore/characters/catalog.json");
  const venance = catalog.characters.find((c) => c.id === "venance");
  assert(venance.souls[4].description.includes("Dư Âm Cổ Ngữ"));
  assert(venance.souls[5].description.includes("hoàn thêm 2 MP"));
});
console.log(`venance mana ok (${count})`);
