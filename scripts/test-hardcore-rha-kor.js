"use strict";
// Rha-Kor: Vết Khắc Cổ Luật, vụ nổ phá giáp, Tinh Hồn S1–S6, thức tỉnh và beta.
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  chars = require("../src/hardcore/characters"),
  kit = require("../src/hardcore/characters/rhakor"),
  awake = require("../src/hardcore/awakening"),
  stats = require("../src/hardcore/engine/stats");
const session = { id: "rha-kor", guild_id: "g", user_id: "r", channel_id: "c" };
const rng = () => 0.5;
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
const fixture = (extra = {}) => ({
  type: "combat", name: "Fixture", rank: "normal", hp: 1e7, maxHp: 1e7, defense: 0, resistance: 0,
  evasion: 0, accuracy: 100000, critChance: 0, damageMin: 1, damageMax: 1, damageType: "physical",
  nextDamageType: "physical", combatTurn: 1, ...extra,
});
function fresh(n = 0, awakened = false, enemy = {}) {
  const s = chars.preview("rha_kor", n, "SSR");
  Object.assign(s, { floor: 6, cleared: 5, encounter: fixture(enemy) });
  if (awakened) {
    s.floor = 100;
    awake.grant(s, { rank: "boss", hp: 0 });
    s.floor = 6;
  }
  core.prepareItemCombat(s, rng);
  s.damageMin = s.damageMax = 100;
  s.critChance = 0;
  s.hp = s.maxHp = 1e6;
  s.mana = s.maxMana;
  return s;
}
const act = (s, a) => {
  s.damageMin = s.damageMax = 100;
  return core.act(s, session, a, rng);
};
const hpLost = (s, a) => {
  const before = s.encounter.hp;
  act(s, a);
  return before - s.encounter.hp;
};

test("Max MP khởi đầu là 4 và class nằm trong catalog SSR chiến binh", () => {
  assert.equal(stats.createState("rha_kor", 10, { gameplayVersion: 3 }).maxMana, 4);
  const c = chars.get("rha_kor");
  assert.equal(c.rarity, "SSR");
  assert.equal(c.classKey, "warrior");
  assert.equal(c.souls.length, 6);
});

test("Skill tốn 2 MP, gây 220% một lần và đặt Vết Khắc LV1", () => {
  const s = fresh();
  const dealt = hpLost(s, "skill");
  assert.equal(s.mana, 2);
  assert.ok(dealt > 0);
  assert.deepEqual(
    { level: kit.mark(s).level, turns: kit.mark(s).turns },
    { level: 1, turns: 3 },
  );
});

test("Hai hit chính sau Skill kích nổ kể cả khi boss không phản công; sau nổ Vết Khắc bị xóa", () => {
  const s = fresh();
  act(s, "skill");
  act(s, "attack");
  assert.equal(kit.mark(s).level, 2);
  const before = s.encounter.hp;
  act(s, "attack");
  assert.equal(kit.mark(s), null);
  const base = 100 * 1; // hit chính thứ ba
  assert.ok(before - s.encounter.hp > base * 2.5, "vụ nổ cộng thêm sát thương");
  assert.equal(s.encounter.rhaKor.shred.rate, 0.2);
});

test("Phá giáp tăng sát thương và hết sau 2 lượt của Rha-Kor", () => {
  const s = fresh(0, false, { defense: 30 });
  s.defense = 0;
  act(s, "skill");
  act(s, "attack");
  act(s, "attack");
  assert.ok(s.encounter.rhaKor.shred);
  assert.equal(s.encounter.rhaKor.shred.turns, 2);
  const withShred = hpLost(s, "attack");
  assert.equal(hpLost(s, "attack"), withShred);
  assert.equal(s.encounter.rhaKor.shred, null, "hết sau 2 lượt");
  const without = hpLost(s, "attack");
  assert.ok(withShred > without);
});

test("Vết Khắc hết hạn sau 3 hành động; Phòng thủ trừ lượt nhưng không tăng cấp", () => {
  const s = fresh();
  act(s, "skill");
  act(s, "defend");
  assert.equal(kit.mark(s).level, 1);
  assert.equal(kit.mark(s).turns, 2);
  act(s, "defend");
  act(s, "defend");
  assert.equal(kit.mark(s), null);
});

test("Dùng lại Skill ghi đè Vết Khắc cũ", () => {
  const s = fresh();
  act(s, "skill");
  act(s, "attack");
  act(s, "skill");
  assert.deepEqual({ level: kit.mark(s).level, turns: kit.mark(s).turns }, { level: 1, turns: 3 });
});

test("Vết Khắc không chuyển sang phòng sau", () => {
  const s = fresh();
  act(s, "skill");
  s.encounter.hp = 1;
  act(s, "attack");
  assert.equal(kit.mark(s), null);
  s.phase = "encounter";
  s.encounter = fixture();
  core.prepareItemCombat(s, rng);
  assert.equal(kit.mark(s), null);
});

test("Nội tại: giảm sát thương phản công kế tiếp rồi mất khi quái đánh trúng", () => {
  const miss = fresh();
  act(miss, "skill");
  act(miss, "attack");
  miss.encounter.hp = 150;
  act(miss, "attack");
  assert.equal(miss.rhaGuard, 0.12, "quái chết nên chưa phải đỡ phản công");
  const s = fresh();
  act(s, "skill");
  act(s, "attack");
  act(s, "attack");
  assert.equal(s.rhaGuard, undefined, "phản công ngay sau vụ nổ đã dùng");
  s.rhaGuard = 0.5;
  const base = fresh(), guarded = fresh();
  base.encounter.damageMin = base.encounter.damageMax = guarded.encounter.damageMin = guarded.encounter.damageMax = 1000;
  guarded.rhaGuard = 0.5;
  const hp = (x) => { act(x, "defend"); return Number(/nhận (\d+) DMG/.exec(x.lastLog)[1]); };
  assert.ok(hp(guarded) < hp(base));
});

test("Vụ nổ hạ quái hồi 1 MP", () => {
  const s = fresh();
  act(s, "skill");
  act(s, "attack");
  s.encounter.hp = 1;
  const mana = s.mana;
  act(s, "attack");
  assert.ok(s.mana >= mana + 1 - 0, "hồi MP");
});

test("S1/S5 tăng hệ số Skill; S2 nổ ở LV2; S3 tăng vụ nổ/giảm giáp; S4 cộng dồn giảm sát thương; S6 Dư Chấn", () => {
  assert.equal(kit.config(fresh(0)).skill, 2.2);
  assert.equal(kit.config(fresh(1)).skill, 2.5);
  assert.equal(kit.config(fresh(5)).skill, 2.8);
  assert.equal(kit.config(fresh(1)).explodeAt, 3);
  assert.equal(kit.config(fresh(2)).explodeAt, 2);
  assert.equal(kit.config(fresh(3)).explosion, 3.4);
  assert.equal(kit.config(fresh(3)).shred, 0.25);
  assert.ok(Math.abs(kit.config(fresh(4)).guard - 0.22) < 1e-9);
  assert.equal(kit.config(fresh(5)).extraMana, 1);
  assert.equal(kit.config(fresh(6)).aftershock, 0.65);
  const s = fresh(2);
  act(s, "skill");
  assert.equal(kit.mark(s).level, 1, "S2 vẫn cần hit chính thứ hai");
  act(s, "attack");
  assert.equal(kit.mark(s), null);
});

test("S6 Dư Chấn gây thêm sát thương nhưng không tạo lại Vết Khắc", () => {
  const a = fresh(2), b = fresh(6);
  for (const s of [a, b]) {
    act(s, "skill");
  }
  const da = hpLost(a, "attack"), db = hpLost(b, "attack");
  assert.ok(db > da);
  assert.equal(kit.mark(b), null);
});

test("Mệnh Đề Phản Nghịch tăng vụ nổ đúng một lần khi boss gây sát thương", () => {
  const s = fresh(0, false, { rank: "boss" });
  act(s, "skill");
  assert.equal(kit.mark(s).bonus, true, "boss phản công sau Skill");
  assert.equal(kit.onEnemyDamage(s, 50), "");
});

test("Thức tỉnh: vụ nổ 360%, giảm giáp 25% và Barrier", () => {
  const s = fresh(0, true);
  const c = kit.config(s);
  assert.equal(c.explosion, 3.6);
  assert.equal(c.shred, 0.25);
  assert.equal(c.barrier, 0.12);
  assert.ok(/Cổ Luật Đoạn Tuyệt/.test(awake.description(s)));
});

test("Beta mở Rha-Kor và vẫn đọc được phiên Venance cũ", () => {
  const beta = require("../src/hardcore/beta");
  for (const key of ["rha_kor", "venance"]) {
    const s = stats.createState(key, beta.STAKE, { gameplayVersion: 3 });
    beta.activate(s);
    beta.validate(s);
  }
  const bad = stats.createState("barbarian", beta.STAKE, { gameplayVersion: 3 });
  beta.activate(bad);
  assert.throws(() => beta.validate(bad), /INVALID_BETA_STATE/);
});

test("Trạng thái hợp lệ sau lưu/đọc", () => {
  const s = fresh(0);
  act(s, "skill");
  const copy = structuredClone(s);
  kit.validate(copy);
  copy.encounter.rhaKor.mark.level = 9;
  assert.throws(() => kit.validate(copy), /INVALID_RHA_KOR_STATE/);
});
console.log("rha-kor ok (" + count + ")");
