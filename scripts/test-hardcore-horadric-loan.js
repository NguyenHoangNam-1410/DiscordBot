"use strict";
// Horadric Forge v2: mượn trang bị, nâng +2 level rồi trả lại sau N tầng.
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const stats = require("../src/hardcore/engine/stats"),
  core = require("../src/hardcore/engine"),
  catalog = require("../src/hardcore/item"),
  forge = require("../src/hardcore/equipment/forge"),
  rules = require("../src/hardcore/equipment/rules");
const session = { id: "forge-loan", guild_id: "g", channel_id: "c", user_id: "u" };
const pool = Object.values(catalog.ITEMS_V3).flat();
const first = (rarity, curse = false) =>
  pool.find((i) => i.rarity === rarity && Boolean(i.curse) === curse && i.category !== "consumable" && !i.effects.escapeTokens);
let count = 0;
const test = (name, fn) => (fn(), count++, console.log("PASS " + name));
function fresh(def, level = 1, floor = 20) {
  const s = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
  s.floor = floor;
  s.cleared = floor - 1;
  core.receiveItem(s, def, level);
  s.encounter = { type: "surprise", kind: "horadric", name: "Forge", targetId: def.id, forge: forge.prepareV2(def.id) };
  return s;
}
const lend = (s) => core.act(s, session, "forge_lend", () => 0.99);
const item = (s, def) => s.items.find((x) => x.definition.id === def.id);

test("R được nâng ngay +2 level và không có khoản mượn", () => {
  const def = first("common"),
    s = fresh(def, 2);
  lend(s);
  assert.equal(item(s, def).level, 4);
  assert.equal(s.forgeLoans, undefined);
});

for (const [rarity, wait] of [["rare", 10], ["legendary", 25]]) {
  test(`${rarity}: mất hoàn toàn rồi trả sau ${wait} tầng với +2 level`, () => {
    const def = first(rarity),
      s = fresh(def, 2);
    lend(s);
    assert.equal(item(s, def), undefined);
    assert.equal(s.forgeLoans.length, 1);
    assert.equal(s.forgeLoans[0].due, 20 + wait + 1);
    s.floor = 20 + wait; // chưa đủ
    assert.equal(forge.returnDue(s, core.receiveItem), "");
    assert.equal(item(s, def), undefined);
    s.floor = 20 + wait + 1;
    forge.returnDue(s, core.receiveItem);
    assert.equal(item(s, def).level, 4);
    assert.equal(s.forgeLoans, undefined);
  });
}

test("Món bị mượn mất toàn bộ chỉ số (không còn trong tổng hiệu ứng)", () => {
  const def = first("legendary"),
    s = fresh(def, 1);
  const { totals: a } = require("../src/hardcore/engine/stats").sumEffects(s);
  lend(s);
  const { totals: b } = require("../src/hardcore/engine/stats").sumEffects(s);
  const key = Object.keys(def.effects).find((k) => typeof def.effects[k] === "number" && !["heal", "potions", "escapeTokens", "bonusPenalty"].includes(k));
  assert.ok((a[key] || 0) - (b[key] || 0) === def.effects[key]);
});

test("UR có nguyền: trả lại +2 level nhưng cấp nguyền giữ nguyên", () => {
  const def = first("cursed", true),
    s = fresh(def, 2);
  const curseBefore = rules.curseScale(s, item(s, def));
  lend(s);
  assert.equal(s.forgeLoans[0].due, 20 + 50 + 1);
  s.floor = 71;
  forge.returnDue(s, core.receiveItem);
  const back = item(s, def);
  assert.equal(back.level, 4);
  assert.equal(back.level - back.cleansedLevels, 2, "nguyền vẫn 2 cấp");
  assert.equal(rules.curseScale(s, back) > 0, curseBefore > 0);
});

test("Nhặt món cùng loại trong lúc mượn thì gộp level khi trả", () => {
  const def = first("rare"),
    s = fresh(def, 2);
  lend(s);
  core.receiveItem(s, def, 1);
  s.floor = 31;
  const log = forge.returnDue(s, core.receiveItem);
  assert.equal(item(s, def).level, 1 + 2 + 2);
  assert.match(log, /gộp/);
  assert.equal(s.items.filter((x) => x.definition.id === def.id).length, 1);
});

test("Tầng boss không hợp lệ: chờ tầng kế tiếp; hạn tối đa 998", () => {
  const def = first("rare"),
    s = fresh(def, 1, 40);
  lend(s);
  assert.equal(s.forgeLoans[0].due, 51);
  s.floor = 50;
  assert.equal(forge.returnDue(s, core.receiveItem), "");
  s.floor = 52;
  assert.ok(forge.returnDue(s, core.receiveItem));
  const late = fresh(first("cursed", true), 1, 950);
  lend(late);
  assert.equal(late.forgeLoans[0].due, 998);
});

test("Chỉ xuất hiện khi có ≥1 trang bị và không sau tầng 950; vẫn bỏ qua được", () => {
  const empty = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
  empty.floor = 30;
  assert.equal(forge.eligible(empty), false);
  const def = first("common"),
    s = fresh(def, 1, 951);
  assert.equal(forge.eligible(s), false);
  s.floor = 950;
  assert.equal(forge.eligible(s), true);
  s.floor = 20;
  core.act(s, session, "event_skip", () => 0.99);
  assert.equal(item(s, def).level, 1);
  assert.equal(s.forgeLoans, undefined);
});

test("Trạng thái khoản mượn được kiểm tra khi tải", () => {
  const def = first("rare"),
    s = fresh(def, 1);
  lend(s);
  forge.validateLoans(s);
  s.forgeLoans[0].due = 5;
  assert.throws(() => forge.validateLoans(s), /INVALID_FORGE_LOANS/);
});
test("Qua tầng thật: completeFloor trả món đến hạn trước khi sinh phòng mới", () => {
  const def = first("rare"),
    s = fresh(def, 1, 21);
  lend(s);
  s.phase = "encounter";
  s.floor = 31;
  s.cleared = 30;
  s.encounter = core.makeSurprise(s, () => 0.5, "fountain");
  const skip = core.actions(s).find((a) => a.action === "event_skip") || core.actions(s)[0];
  core.act(s, session, skip.action, () => 0.99);
  assert.equal(s.floor, 32);
  assert.equal(item(s, def).level, 3);
  assert.match(s.lastLog, /Horadric Forge trả lại/);
});
test("UX: chọn bất kỳ món trong túi bằng menu, Bỏ qua tách riêng, chưa chọn thì chưa xác nhận", () => {
  const view = require("../src/hardcore/ui");
  const s = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
  const usable = pool.filter((i) => i.category !== "consumable" && !i.effects.escapeTokens);
  for (const d of usable.slice(0, 30)) core.receiveItem(s, d, 1);
  s.floor = 21;
  s.cleared = 20;
  s.phase = "encounter";
  s.encounter = core.makeSurprise(s, () => 0.5, "horadric");
  assert.equal(s.encounter.forge.targetId, null);
  assert.throws(() => core.act(s, session, "forge_lend", () => 0.99), /INVALID_ACTION/);
  const ui = () => view.rows("sid", s).map((r) => r.toJSON());
  let rows = ui();
  const menu = rows[0].components[0];
  assert.equal(menu.type, 3);
  assert.equal(menu.options.length, 25, "một trang menu 25 món");
  const flat = rows.flatMap((r) => r.components);
  assert.ok(flat.some((c) => c.custom_id?.endsWith(":event_skip")), "Bỏ qua là nút riêng");
  assert.ok(!menu.options.some((o) => o.value === "event_skip"), "Bỏ qua không nằm trong menu");
  assert.ok(flat.find((c) => c.custom_id?.endsWith(":forge_lend")).disabled);
  // chọn món ở trang 2 qua phân trang, không tốn lượt
  const turn = s.turn;
  core.act(s, session, "forge_page_1", () => 0.99);
  rows = ui();
  assert.equal(rows[0].components[0].options.length, s.items.length - 25);
  const pick = s.items[s.items.length - 1];
  core.act(s, session, "forge_select_" + pick.definition.id, () => 0.99);
  assert.equal(s.turn, turn, "chọn món không tốn lượt");
  assert.equal(s.encounter.forge.targetId, pick.definition.id);
  rows = ui();
  assert.ok(rows[0].components[0].options.some((o) => o.default && o.value === pick.definition.id));
  assert.ok(!rows.flatMap((r) => r.components).find((c) => c.custom_id?.endsWith(":forge_lend")).disabled);
  const ids = rows.flatMap((r) => r.components.map((c) => c.custom_id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(rows.length <= 5);
  // chọn một món khác vẫn được, rồi bỏ qua giữ nguyên túi
  core.act(s, session, "forge_select_" + s.items[0].definition.id, () => 0.99);
  const owned = s.items.length;
  core.act(s, session, "event_skip", () => 0.99);
  assert.equal(s.items.length, owned);
  assert.equal(s.forgeLoans, undefined);
});
test("Ngẫu nhiên: nhiều khoản gửi cùng lúc luôn trả đúng +2 level và gộp đúng khi trùng loại", () => {
  let seed = 11,
    returns = 0;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const usable = pool.filter((i) => i.category !== "consumable" && !i.effects.escapeTokens);
  const pickItem = () => {
    const rarity = ["common", "rare", "legendary", "cursed"][Math.floor(rng() * 4)];
    const list = usable.filter((i) => i.rarity === rarity);
    return list[Math.floor(rng() * Math.min(list.length, 3))];
  };
  const original = forge.returnDue;
  forge.returnDue = function (s, receive) {
    const before = Object.fromEntries(s.items.map((i) => [i.definition.id, { l: i.level, c: i.cleansedLevels || 0 }]));
    const due = (s.forgeLoans || []).filter((l) => s.floor >= l.due && forge.validFloor(s.floor));
    const result = original(s, receive);
    const expect = {};
    for (const l of due) {
      expect[l.definition.id] ||= { l: 0, c: 0 };
      expect[l.definition.id].l += l.level + 2;
      expect[l.definition.id].c += l.cleansedLevels + (l.definition.curse ? 2 : 0);
    }
    for (const [id, x] of Object.entries(expect)) {
      const item = s.items.find((i) => i.definition.id === id);
      assert.ok(item, "món trả về phải có trong túi");
      assert.equal(item.level - (before[id]?.l || 0), x.l);
      assert.equal((item.cleansedLevels || 0) - (before[id]?.c || 0), x.c);
      returns++;
    }
    return result;
  };
  try {
    for (let run = 0; run < 25; run++) {
      const s = stats.createState("barbarian", 1000, { gameplayVersion: 3 });
      for (let i = 0; i < 4; i++) core.receiveItem(s, pickItem(), 1);
      let floor = 10;
      for (let step = 0; step < 120 && floor < 990; step++) {
        s.phase = "encounter";
        s.pendingMilestones = [];
        if (s.rift) s.rift.pendingAward = null;
        s.floor = floor;
        s.cleared = floor - 1;
        if (rng() < 0.35) core.receiveItem(s, pickItem(), 1);
        if (rng() < 0.35 && forge.eligible(s)) {
          s.encounter = core.makeSurprise(s, () => 0.5, "horadric");
          const target = s.items[Math.floor(rng() * s.items.length)];
          core.act(s, session, "forge_select_" + target.definition.id, rng);
          core.act(s, session, "forge_lend", rng);
        } else {
          s.encounter = core.makeSurprise(s, () => 0.5, "fountain");
          core.act(s, session, "event_skip", rng);
        }
        floor = s.floor;
        forge.validateLoans(s);
        const ids = s.items.map((x) => x.definition.id);
        assert.equal(new Set(ids).size, ids.length, "không có món trùng ID");
      }
    }
  } finally {
    forge.returnDue = original;
  }
  assert.ok(returns > 50, "phải có nhiều lần trả: " + returns);
});
test("Lịch trả: SSR gửi tầng 5, SR gửi tầng 6 → SR về tầng 17, SSR về tầng 31, qua tầng thật", () => {
  const ssr = first("legendary"),
    sr = first("rare");
  const s = fresh(ssr, 2, 5);
  core.receiveItem(s, sr, 3);
  lend(s); // gửi SSR ở tầng 5
  assert.equal(s.floor, 6);
  s.phase = "encounter";
  s.encounter = { type: "surprise", kind: "horadric", name: "Forge", targetId: sr.id, forge: forge.prepareV2(sr.id) };
  lend(s); // gửi SR ở tầng 6
  const due = Object.fromEntries(s.forgeLoans.map((l) => [l.definition.id, l.due]));
  assert.equal(due[sr.id], 6 + 10 + 1);
  assert.equal(due[ssr.id], 5 + 25 + 1);
  const walk = () => {
    s.phase = "encounter";
    s.pendingMilestones = [];
    if (s.rift) s.rift.pendingAward = null;
    s.encounter = core.makeSurprise(s, () => 0.5, "fountain");
    const skip = core.actions(s).find((a) => a.action === "event_skip");
    core.act(s, session, skip.action, () => 0.99);
  };
  while (s.floor < 40) {
    const before = s.floor;
    walk();
    if (before + 1 < 17) assert.equal(item(s, sr), undefined, "SR chưa về ở tầng " + s.floor);
    if (s.floor === 17) assert.equal(item(s, sr).level, 5, "SR về +2 ở tầng 17");
    if (s.floor < 31) assert.equal(item(s, ssr), undefined, "SSR chưa về ở tầng " + s.floor);
    if (s.floor === 31) assert.equal(item(s, ssr).level, 4, "SSR về +2 ở tầng 31");
  }
  assert.equal(s.forgeLoans, undefined);
});

test("Hai món cùng đến hạn một tầng: trả cả hai trong cùng lần, đúng level, đúng log", () => {
  const a = first("rare"),
    b = pool.find((i) => i.rarity === "rare" && i.id !== a.id && !i.curse && i.category !== "consumable" && !i.effects.escapeTokens);
  const s = fresh(a, 2, 20);
  core.receiveItem(s, b, 4);
  lend(s);
  s.phase = "encounter";
  s.pendingMilestones = [];
  if (s.rift) s.rift.pendingAward = null;
  s.floor = 20;
  s.encounter = { type: "surprise", kind: "horadric", name: "Forge", targetId: b.id, forge: forge.prepareV2(b.id) };
  lend(s);
  assert.equal(s.forgeLoans.length, 2);
  assert.equal(s.forgeLoans[0].due, s.forgeLoans[1].due, "hai món cùng hạn");
  s.floor = s.forgeLoans[0].due;
  const log = forge.returnDue(s, core.receiveItem);
  assert.equal(item(s, a).level, 4);
  assert.equal(item(s, b).level, 6);
  assert.equal((log.match(/trả lại/g) || []).length, 2);
  assert.equal(s.forgeLoans, undefined);
});

test("Hai khoản cùng loại đến hạn cùng tầng, hoặc đúng tầng boss: gộp một lần và chờ tầng hợp lệ", () => {
  const def = first("rare");
  const s = fresh(def, 2, 20);
  lend(s);
  core.receiveItem(s, def, 3);
  s.phase = "encounter";
  s.pendingMilestones = [];
  if (s.rift) s.rift.pendingAward = null;
  s.floor = 20;
  s.encounter = { type: "surprise", kind: "horadric", name: "Forge", targetId: def.id, forge: forge.prepareV2(def.id) };
  lend(s);
  assert.equal(s.forgeLoans.length, 2);
  assert.equal(new Set(s.forgeLoans.map((l) => l.definition.id)).size, 1);
  s.forgeLoans.forEach((l) => (l.due = 50));
  s.floor = 50;
  assert.equal(forge.returnDue(s, core.receiveItem), "", "tầng boss 50 không hợp lệ");
  assert.equal(s.forgeLoans.length, 2);
  s.floor = 51;
  forge.returnDue(s, core.receiveItem);
  assert.equal(s.items.filter((x) => x.definition.id === def.id).length, 1);
  assert.equal(item(s, def).level, 2 + 2 + 3 + 2);
  assert.equal(s.forgeLoans, undefined);
});
console.log("horadric loan ok (" + count + ")");
