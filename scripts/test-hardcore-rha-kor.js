"use strict";
// Rha-Kor: Khai Bia Cổ Luật và bốn Luật (Đoạn / Hộ / Dẫn / Phán), nội tại, Tinh Hồn S1–S6, thức tỉnh Quyền Khắc, beta.
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
  type: "combat", name: "Fixture", rank: "normal", hp: 1e8, maxHp: 1e8, defense: 0, resistance: 0,
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
  s.potions = 5;
  return s;
}
const act = (s, a) => {
  s.damageMin = s.damageMax = 100;
  return core.act(s, session, a, rng);
};
const lost = (s, a) => {
  const before = s.encounter.hp;
  act(s, a);
  return before - s.encounter.hp;
};
const f = (s) => s.encounter.rhaKor;
const taken = (s) => Number(/nhận (\d+) DMG/.exec(s.lastLog)?.[1] || 0);

test("Max MP 4; catalog SSR chiến binh với 6 Tinh Hồn mới", () => {
  assert.equal(stats.createState("rha_kor", 10, { gameplayVersion: 3 }).maxMana, 4);
  const c = chars.get("rha_kor");
  assert.equal(c.rarity, "SSR");
  assert.equal(c.classKey, "warrior");
  assert.deepEqual(c.souls.map((x) => x.name), [
    "Bia Khai Mệnh", "Nét Khắc Bền Vững", "Luật Đoạn Tuyệt", "Luật Hộ Phản Chấn", "Quyền Khắc Toàn Phần", "Cổ Luật Không Thể Xóa",
  ]);
  assert.equal(stats.CLASSES.rha_kor.skill, "Khai Bia Cổ Luật");
});

test("Skill: 2 MP, mở Cổ Luật 1 action; không dùng thì hết; nội tại bỏ qua 15% DEF", () => {
  const s = fresh(0, false, { defense: 30 });
  const open = lost(s, "skill");
  assert.equal(s.mana, 2);
  assert.ok(f(s).law);
  assert.equal(f(s).law.window, 1);
  assert.ok(open > 0);
  // Không có nội tại sẽ yếu hơn: so với cùng hit khi DEF không bị bỏ qua.
  const base = fresh(0, false, { defense: 30 });
  kit.frame(base);
  assert.ok(kit.defenseFactor(base) < 1 && Math.abs(kit.defenseFactor(base) - 0.85) < 1e-9);
  act(s, "defend"); // Luật Hộ dùng luật
  assert.equal(f(s).law, null);
});

test("Luật Đoạn: Attack +40% DMG và giảm 20% DEF mục tiêu trong 2 action", () => {
  const plain = fresh(0, false, { defense: 20 });
  const basic = lost(plain, "attack");
  const s = fresh(0, false, { defense: 20 });
  act(s, "skill");
  const doan = lost(s, "attack");
  assert.ok(doan > basic * 1.35 && doan < basic * 1.5, doan + " vs " + basic);
  assert.equal(f(s).law, null);
  assert.equal(f(s).shred.rate, 0.2);
  assert.equal(f(s).shred.turns, 2);
  const shredded = lost(s, "attack");
  assert.ok(shredded >= basic);
  act(s, "attack");
  assert.equal(f(s).shred, null, "hết sau 2 action");
});

test("Luật Hộ: Barrier 12% Max HP, hồi 2 MP, giảm sát thương 2 phản công, Attack kế tiếp −12%", () => {
  const base = fresh();
  const basic = lost(base, "attack");
  const s = fresh();
  s.maxHp = s.hp = 1000;
  act(s, "skill");
  s.mana = 2;
  act(s, "defend");
  assert.equal(s.mana, 4, "hồi 2 MP (thường chỉ 1)");
  assert.match(s.lastLog, new RegExp("Barrier " + Math.floor(s.maxHp * 0.12) + "\\b"), "Barrier 12% Max HP");
  assert.ok(f(s).barrier >= 0 && f(s).barrier <= Math.floor(s.maxHp * 0.12));
  assert.equal(f(s).hoRounds, 1, "đã qua phản công đầu, còn phản công kế tiếp");
  assert.equal(kit.guardRate(s), 0.25);
  assert.equal(kit.carryDefend(s), true, "phản công kế tiếp có hiệu quả Defense");
  const penalised = lost(s, "attack");
  assert.ok(Math.abs(penalised / basic - 0.88) < 0.02, penalised + " vs " + basic);
  assert.equal(f(s).hoRounds, 0);
  assert.equal(f(s).penalty, false, "chỉ Attack kế tiếp bị giảm");
  assert.equal(kit.guardRate(s), 0);
  // Giảm 25% sát thương nhận so với phản công không có Luật Hộ.
  const a = fresh(),
    b = fresh();
  a.encounter.damageMin = a.encounter.damageMax = b.encounter.damageMin = b.encounter.damageMax = 4000;
  b.encounter.rhaKor = { ...kit.frame(b), hoRounds: 2 };
  act(a, "attack");
  act(b, "attack");
  assert.ok(taken(b) < taken(a) && Math.abs(taken(b) / taken(a) - 0.75) < 0.03, taken(b) + " vs " + taken(a));
});

test("Luật Dẫn: Potion +15% hồi máu; Attack kế tiếp hồi 12% sát thương gây ra", () => {
  const heal = (s) => Number(/Hồi (\d+)/.exec(s.lastLog)[1]);
  const plain = fresh();
  act(plain, "attack");
  plain.hp = 1;
  act(plain, "potion");
  const s = fresh();
  act(s, "skill");
  s.hp = 1;
  act(s, "potion");
  assert.ok(Math.abs(heal(s) / heal(plain) - 1.15) < 0.04, heal(s) + " vs " + heal(plain));
  assert.equal(f(s).leech, true);
  s.hp = 5;
  const dealt = lost(s, "attack");
  const gain = Number(/Luật Dẫn: hồi (\d+) HP/.exec(s.lastLog)[1]);
  assert.equal(gain, Math.floor(dealt * 0.12));
  assert.equal(f(s).leech, false);
});

test("Luật Phán: Skill lần hai 250%, tốn 2 MP, giảm 25% DEF 1 action, kết thúc luật", () => {
  const s = fresh();
  const open = lost(s, "skill");
  const phan = lost(s, "skill");
  assert.equal(s.mana, 0, "mỗi Skill tốn 2 MP");
  assert.ok(Math.abs(phan / open - 2.5 / 1.5) < 0.02, phan + " / " + open);
  assert.equal(f(s).law, null);
  assert.equal(f(s).shred.rate, 0.25);
  assert.equal(f(s).shred.turns, 1);
  assert.equal(f(s).skillsCast, 2);
});

test("Cổ Luật không bị trừ bởi hành động của boss: hành động boss kết thúc luật", () => {
  const s = fresh();
  act(s, "skill");
  assert.ok(f(s).law);
  kit.offAction(s);
  assert.equal(f(s).law, null);
});

test("Thức tỉnh: hoàn thành Luật tạo Quyền Khắc; Attack/Skill kế tiếp +25%, hết sau 2 action", () => {
  const plain = fresh(0, true);
  const basic = lost(plain, "attack");
  const s = fresh(0, true);
  act(s, "skill");
  assert.equal(f(s).boon, null, "mở luật chưa tạo Quyền Khắc");
  act(s, "attack");
  assert.equal(f(s).boon.window, 2);
  const boosted = lost(s, "attack");
  assert.ok(Math.abs(boosted / basic - 1.25) < 0.02, boosted + " vs " + basic);
  assert.equal(f(s).boon, null, "tự tiêu thụ");
  // Không dùng thì hết sau 2 action (Defense/Potion không tiêu thụ).
  const e = fresh(0, true);
  act(e, "skill");
  act(e, "attack");
  act(e, "defend");
  assert.ok(f(e).boon);
  act(e, "potion");
  assert.equal(f(e).boon, null);
  assert.match(awake.description(s), /Quyền Khắc Cổ Luật/);
  assert.equal(kit.config(fresh(5, true)).boonBonus, 0.35);
  assert.equal(kit.config(fresh(5, true)).boonWindow, 3);
});

test("S1: Skill đầu tiên mỗi combat hoàn 1 MP khi trúng", () => {
  const s0 = fresh(0),
    s1 = fresh(1);
  act(s0, "skill");
  act(s1, "skill");
  assert.equal(s0.mana, 2);
  assert.equal(s1.mana, 3);
  act(s1, "skill");
  assert.equal(s1.mana, 1, "Skill thứ hai không hoàn MP");
});

test("S1: Cổ Luật mở bởi Skill được giữ xuyên phòng; S0 thì không; hành động boss xóa", () => {
  const room = () => {
    const next = fixture();
    return next;
  };
  for (const [soul, carries] of [[0, false], [1, true], [6, true]]) {
    const s = fresh(soul);
    s.encounter.hp = 100;
    act(s, "skill"); // hạ quái và mở Cổ Luật
    s.phase = "encounter";
    s.floor = 7;
    s.encounter = room();
    core.prepareItemCombat(s, rng);
    s.damageMin = s.damageMax = 100;
    assert.equal(Boolean(kit.frame(s).law), carries, "S" + soul);
    const basic = lost(fresh(soul), "attack");
    const strike = lost(s, "attack");
    if (carries) assert.ok(strike / basic > 1.35, "Luật Đoạn ở phòng sau");
    else assert.ok(strike / basic < 1.05);
    kit.validate(s);
  }
  const s = fresh(1);
  act(s, "skill");
  assert.ok(s.rhaCarry.law);
  kit.offAction(s);
  assert.equal(s.rhaCarry, undefined);
  s.rhaCarry = { law: { window: 9 } };
  assert.throws(() => kit.validate(s), /INVALID_RHA_KOR_STATE/);
});

test("S2: Skill kế tiếp giảm 1 MP (tối thiểu 1), Luật Phán +15%, trượt vẫn giữ hiệu ứng", () => {
  const s = fresh(2),
    s0 = fresh(0);
  act(s, "skill");
  assert.equal(core.skillManaCost(s), 1);
  assert.equal(core.skillManaCost(s0), 2);
  const phan = lost(s, "skill");
  act(s0, "skill");
  const phan0 = lost(s0, "skill");
  assert.ok(Math.abs(phan / phan0 - 1.15) < 0.02);
  assert.equal(f(s).discount, null, "đã dùng khi Skill trúng");
  // Skill trượt: giữ lại cho lần Skill kế tiếp.
  const m = fresh(2);
  act(m, "skill");
  kit.begin(m, "skill");
  assert.equal(f(m).turn.discount, true);
  kit.after(m, { landed: false });
  assert.ok(f(m).discount, "giữ giảm MP khi trượt");
  assert.equal(core.skillManaCost(m), 1);
});

test("S3/S4/S5 thông số và S4 +10% Attack sau khi Barrier hấp thụ sát thương", () => {
  const c3 = kit.config(fresh(3));
  assert.equal(c3.phan, 2.8);
  assert.equal(c3.doan, 0.8);
  assert.equal(c3.doanShred, 0.25);
  assert.equal(kit.config(fresh(2)).phan, 2.5);
  const s = fresh(4);
  s.encounter.damageMin = s.encounter.damageMax = 500;
  s.maxHp = s.hp = 10000;
  act(s, "skill");
  act(s, "defend");
  assert.equal(f(s).barrier >= 0 && f(s).barrier <= Math.floor(s.maxHp * 0.24), true, "Barrier 24% Max HP");
  assert.equal(f(s).s4, true);
  const boost = fresh(4),
    plain = fresh(0);
  assert.equal(kit.config(boost).s4Bonus, 0.1);
  assert.equal(kit.config(plain).s4Bonus, 0);
});

test("S6: Cổ Luật kéo dài 3 action, mỗi action thi triển luật tương ứng", () => {
  const s = fresh(6);
  act(s, "skill");
  assert.equal(f(s).law.window, 3);
  const basic = lost(fresh(6), "attack");
  const first = lost(s, "attack");
  assert.ok(first / basic > 1.35);
  assert.ok(f(s).law);
  const second = lost(s, "attack");
  assert.ok(second / basic > 1.35, "Luật Đoạn lần hai");
  assert.ok(f(s).law);
  s.mana = 4;
  act(s, "skill"); // Skill trong cửa sổ = Luật Phán
  assert.equal(f(s).law, null, "hết 3 action");
});

test("Class Shrine kéo dài Cổ Luật thêm 1 action", () => {
  const s = fresh();
  s.classShrine = { classKey: "rha_kor", from: 6, until: 8, consumed: false };
  act(s, "skill");
  assert.equal(f(s).law.window, 2);
});

test("Trạng thái hợp lệ sau lưu/đọc; dữ liệu hỏng bị từ chối; beta mở Rha-Kor và vẫn đọc Venance cũ", () => {
  const s = fresh(0);
  act(s, "skill");
  const copy = structuredClone(s);
  kit.validate(copy);
  copy.encounter.rhaKor.law.window = 9;
  assert.throws(() => kit.validate(copy), /INVALID_RHA_KOR_STATE/);
  const beta = require("../src/hardcore/beta");
  for (const key of ["rha_kor", "venance"]) {
    const b = stats.createState(key, beta.STAKE, { gameplayVersion: 3 });
    beta.activate(b);
    beta.validate(b);
  }
  const bad = stats.createState("barbarian", beta.STAKE, { gameplayVersion: 3 });
  beta.activate(bad);
  assert.throws(() => beta.validate(bad), /INVALID_BETA_STATE/);
});
test("Nút trận Tấn công/Phòng thủ/Skill dùng icon attack_rha_kor, defend_rha_kor, skill_rha_kor", () => {
  const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
  const view = require("../src/hardcore/ui");
  const emojiOf = (state) =>
    Object.fromEntries(
      view
        .rows("sid", state)
        .flatMap((row) => row.toJSON().components)
        .filter((c) => ["attack", "defend", "skill"].includes(c.custom_id.split(":").pop()))
        .map((c) => [c.custom_id.split(":").pop(), c.emoji?.id]),
    );
  setApplicationEmojisForTest([
    ["attack_rha_kor", "111111111111111111"],
    ["defend_rha_kor", "222222222222222222"],
    ["skill_rha_kor", "333333333333333333"],
  ]);
  try {
    assert.deepEqual(emojiOf(fresh()), {
      attack: "111111111111111111",
      defend: "222222222222222222",
      skill: "333333333333333333",
    });
    // Class khác không bị ảnh hưởng: dùng icon chung
    const other = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
    Object.assign(other, { floor: 3, cleared: 2, phase: "encounter", encounter: fixture() });
    stats.recompute(other);
    const icons = emojiOf(other);
    assert.notEqual(icons.attack, "111111111111111111");
    assert.notEqual(icons.defend, "222222222222222222");
  } finally {
    setApplicationEmojisForTest([]);
  }
});
console.log("rha-kor ok (" + count + ")");
