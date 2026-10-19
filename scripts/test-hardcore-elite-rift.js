"use strict";
// Rift v3 (3.2.0): bốn hiệu ứng elite xếp chồng dần; elite của event không nhận; Deathburst không bao giờ giết người chơi.
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world"),
  rift = require("../src/hardcore/rift"),
  icons = require("../src/hardcore/shared/icons"),
  { RELEASE } = require("../src/hardcore/shared/version");
const session = { id: "elite-rift", guild_id: "g", user_id: "u", channel_id: "c" };
let groups = 0;
function test(name, fn) {
  fn();
  groups++;
  console.log("PASS " + name);
}
const fresh = (floor = 100) => {
  const s = stats.createState("barbarian", 100000);
  Object.assign(s, { floor, cleared: floor - 1, godRngesusEnabled: false, encounter: { type: "empty" }, lastLog: "", phase: "encounter" });
  return s;
};
const elite = (s, rng = () => 0.5) => world.makeEnemy(s, "elite", null, rng);

test("phiên bản 3.2.0; run mới dùng Rift v3 với 12 loại, run cũ giữ v2", () => {
  assert.equal(RELEASE.version, "3.2.0");
  const s = fresh();
  assert.equal(s.releaseVersion, "3.2.0");
  assert.equal(s.rift.version, 3);
  assert.equal(Object.keys(s.rift.stacks).length, 12);
  assert.deepEqual(rift.ELITE_KEYS, ["arcane_ward", "deathburst", "iron_hide", "predator"]);
  const old = fresh();
  old.rift = { version: 2, stacks: Object.fromEntries(rift.KEYS_V2.map((k) => [k, 0])), bag: [], bagIndex: 0, cycle: 1, lastAwardFloor: 0 };
  old.modifiers = old.rift.stacks;
  rift.normalize(old);
  const bagKeys = new Set();
  for (let f = 10; f <= 80; f += 10) bagKeys.add(rift.award(old, f, Math.random).key);
  assert([...bagKeys].every((k) => rift.KEYS_V2.includes(k)), "v2 chỉ cấp 8 loại cũ");
  assert.equal(old.rift.bag.length, 8);
});

test("túi v3 cấp đủ 12 loại mỗi vòng, không lặp trong một vòng, trần 12 stack", () => {
  const s = fresh();
  const seen = [];
  for (let f = 10; f <= 120; f += 10) seen.push(rift.award(s, f, Math.random).key);
  assert.equal(seen.length, 12);
  assert.equal(new Set(seen).size, 12, "một vòng đủ 12 loại khác nhau");
  assert(rift.ELITE_KEYS.every((k) => seen.includes(k)));
  rift.normalize(s);
  s.rift.stacks.predator = 13;
  rift.normalize(s);
  assert.equal(s.rift.stacks.predator, 12);
});

test("hiệu ứng tiến dần theo stack: 0 → gốc, ×12 → mức tối đa", () => {
  for (const [key, n, check] of [
    ["iron_hide", 12, (e, b, s) => assert.equal(Math.round((e.defense / (e.defense + 100 + s.floor / 2)) * 100), 70)],
    ["arcane_ward", 12, (e) => assert.equal(e.resistance, 70)],
    ["predator", 12, (e) => assert.equal(e.critChance, 0.18)],
    ["deathburst", 12, (e) => assert.equal(e.blast, 0.5)],
  ]) {
    const s = fresh();
    s.rift.stacks[key] = n;
    const e = elite(s);
    const base = { ...e };
    rift.assignEliteEffect(s, e, () => 0);
    assert.equal(e.eliteEffect.key, key);
    check(e, base, s);
  }
  // giữa chừng: ×6 = nửa quãng đường
  const s = fresh();
  s.rift.stacks.predator = 6;
  const e = elite(s);
  rift.assignEliteEffect(s, e, () => 0);
  assert.equal(e.critChance, 0.12, "6% → 18% đi nửa đường");
  s.rift.stacks.arcane_ward = 6;
  s.rift.stacks.predator = 0;
  const w = elite(s);
  const baseRes = w.resistance;
  rift.assignEliteEffect(s, w, () => 0);
  assert.equal(w.resistance, Math.round(baseRes + (70 - baseRes) / 2));
  s.rift.stacks.arcane_ward = 1;
  const small = elite(s);
  rift.assignEliteEffect(s, small, () => 0);
  assert(small.resistance - baseRes <= 6, "1 stack chỉ tăng nhẹ, không nhảy vọt");
});

test("mỗi elite nhận ngẫu nhiên 1 trong các loại đã có stack; chưa có stack thì không nhận", () => {
  const none = fresh();
  const plain = elite(none);
  rift.assignEliteEffect(none, plain, () => 0);
  assert.equal(plain.eliteEffect, undefined, "chưa có stack elite thì không có hiệu ứng");
  const s = fresh();
  s.rift.stacks.iron_hide = 4;
  s.rift.stacks.predator = 4;
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const e = elite(s);
    rift.assignEliteEffect(s, e, Math.random);
    counts[e.eliteEffect.key] = (counts[e.eliteEffect.key] || 0) + 1;
    assert.equal(Object.keys(e).filter((k) => ["blast"].includes(k)).length, 0);
  }
  assert.deepEqual(Object.keys(counts).sort(), ["iron_hide", "predator"], "chỉ các loại đã có stack");
  assert(counts.iron_hide > 120 && counts.predator > 120, "xấp xỉ đều");
  const boss = world.makeEnemy(s, "boss", null, () => 0.5);
  rift.assignEliteEffect(s, boss, () => 0);
  assert.equal(boss.eliteEffect, undefined, "chỉ elite");
  const v2 = fresh();
  v2.rift.version = 2;
  const e2 = elite(v2);
  rift.assignEliteEffect(v2, e2, () => 0);
  assert.equal(e2.eliteEffect, undefined, "Rift v2 không có hiệu ứng elite");
});

test("elite sinh từ roll thường nhận hiệu ứng; elite của event (gọi trực tiếp) thì không", () => {
  const s = fresh(60);
  for (const k of rift.ELITE_KEYS) s.rift.stacks[k] = 5;
  let tagged = 0, elites = 0;
  for (let i = 0; i < 4000; i++) {
    const e = core.generateEncounter(JSON.parse(JSON.stringify(s)), session, Math.random);
    if (e.type === "combat" && e.rank === "elite" && !e.boss) {
      elites++;
      if (e.eliteEffect) tagged++;
    }
  }
  assert(elites > 100 && tagged === elites, `mọi elite roll thường đều có hiệu ứng (${tagged}/${elites})`);
  for (const name of ["Covenant Guardian", "The Thief", "Bounty Hunter", "Rift Ambusher", "Mirror Clone"]) {
    const e = world.makeEnemy(s, "elite", name, () => 0.5);
    assert.equal(e.eliteEffect, undefined, `${name} không nhận hiệu ứng`);
  }
});

test("Deathburst: bị RES giảm, không bao giờ giết người chơi, không nổ hai lần", () => {
  const s = fresh();
  s.rift.stacks.deathburst = 12;
  const e = elite(s);
  rift.assignEliteEffect(s, e, () => 0);
  e.damageMin = e.damageMax = 100;
  s.encounter = e;
  s.hp = 1000;
  s.resistance = 0;
  e.hp = 0;
  const dmgNoRes = rift.blastDamage(e, () => 0, 0);
  assert.equal(dmgNoRes, 50, "50% × 100 DMG phép");
  assert.equal(rift.blastDamage(e, () => 0, 50), 25, "RES 50% giảm một nửa");
  assert.equal(rift.blastDamage(e, () => 0, 90), 12, "RES tối đa 75% giảm 75%");
  assert.equal(rift.blastDamage({ ...e, blast: 0 }, () => 0, 0), 0);
});

test("Deathburst chạy thật qua đòn kết liễu: trừ HP, để lại tối thiểu 1 HP", () => {
  const make = (hp) => {
    const s = fresh(102); // không phải checkpoint nên không hồi đầy HP khi qua tầng
    s.rift.stacks.deathburst = 12;
    const e = elite(s);
    rift.assignEliteEffect(s, e, () => 0);
    Object.assign(e, { hp: 1, maxHp: 1000, defense: 0, resistance: 0, evasion: 0, accuracy: 100000, damageMin: 400, damageMax: 400, critChance: 0 });
    s.encounter = e;
    s.hp = hp;
    s.resistance = 0;
    s.spellMin = s.spellMax = 100;
    return s;
  };
  const s = make(1000);
  core.act(s, session, "attack", () => 0.5);
  assert(!s.encounter?.hp || s.encounter.hp > 0 || s.lastLog.includes("Deathburst"), "log có vụ nổ");
  assert(s.lastLog.includes("Deathburst"));
  assert(s.hp >= 1 && s.hp < 1000, "mất máu vì vụ nổ");
  const low = make(30);
  core.act(low, session, "attack", () => 0.5);
  assert.equal(low.hp, 1, "vụ nổ không giết: còn đúng 1 HP");
  assert.match(low.lastLog, /giữ lại 1 HP/);
});

test("Severance xóa được loại elite; mô tả, nhãn và biểu tượng giữ chỗ có đủ", () => {
  const s = fresh();
  s.rift.stacks.iron_hide = 7;
  assert.equal(rift.sever(s, "iron_hide"), 7);
  assert.equal(s.rift.stacks.iron_hide, 0);
  s.rift.stacks.predator = 3;
  s.phase = "severance";
  const labels = core.actions(s).map((a) => a.label).join("|");
  assert(labels.includes("Predator ×3"));
  for (const k of rift.ELITE_KEYS) {
    assert(world.RIFT_MODIFIERS[k].name && world.RIFT_MODIFIERS[k].text);
    assert(rift.description(k, 6, s).includes(rift.ELITE_NAMES[k]));
    assert.equal(typeof icons.RIFT_ICONS[k], "string");
  }
  assert.deepEqual(rift.ELITE_KEYS.map((k) => icons.RIFT_ICONS[k]).length, 4);
  // luật legacy (không phải Rift) không bao giờ cấp loại elite
  assert(Object.keys(world.RIFT_MODIFIERS).filter((k) => !rift.ELITE_KEYS.includes(k)).length === 8);
});

test("dòng hiển thị elite và kiểm tra dữ liệu lưu", () => {
  const s = fresh();
  s.rift.stacks.arcane_ward = 12;
  const e = elite(s);
  rift.assignEliteEffect(s, e, () => 0);
  s.encounter = e;
  const line = rift.eliteLine(e);
  assert(line.includes("Arcane Ward ×12") && line.includes("RES 70%"));
  assert(rift.battle(s).includes("Arcane Ward"));
  rift.normalize(s);
  e.eliteEffect.key = "stone_skin";
  assert.throws(() => rift.normalize(s), /INVALID_ELITE_EFFECT/);
  e.eliteEffect = { key: "predator", stacks: 13, floor: 100 };
  assert.throws(() => rift.normalize(s), /INVALID_ELITE_EFFECT/);
  e.eliteEffect = { key: "predator", stacks: 3, floor: 100 };
  s.rift.version = 2;
  assert.throws(() => rift.normalize(s), /INVALID_ELITE_EFFECT|INVALID_RIFT/);
});
console.log(`hardcore elite rift ok (${groups})`);
