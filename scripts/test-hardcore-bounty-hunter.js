"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  marks = require("../src/hardcore/events/explorationMarks"),
  view = require("../src/hardcore/ui");
const session = { id: "bounty", guild_id: "b", user_id: "u", channel_id: "c" };
const rng = () => 0.99;
let groups = 0;
function test(name, fn) {
  fn();
  groups++;
  console.log("PASS " + name);
}
function fresh(floor = 20, tickets = 1) {
  const s = stats.createState("barbarian", 100000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    godRngesusEnabled: false,
    encounter: { type: "empty" },
    lastLog: "",
    escapeTokens: tickets,
    phase: "encounter",
  });
  return s;
}
const hunter = (s) => {
  s.phase = "encounter";
  s.encounter = { type: "trap", kind: "bounty_hunter", name: "Bounty Hunter · Thợ Săn Tiền Thưởng", good: false, lucky: true };
};
const act = (s, a) => core.act(s, session, a, rng);
const actions = (s) => core.actions(s);
const rngesus = (s) => {
  s.phase = "encounter";
  s.encounter = { type: "rngesus", name: "RNGesus", fleeChance: 1, prayerChance: 0.3, prayerSuccess: true };
};

test("điều kiện xuất hiện: V3 thường, từ tầng 20, đang giữ vé, chưa gặp", () => {
  assert.equal(marks.bountyAvailable(fresh(20, 1)), true);
  assert.equal(marks.bountyAvailable(fresh(20, 0)), false, "không có vé thì không xuất hiện");
  assert.equal(marks.bountyAvailable(fresh(19, 1)), false, "dưới tầng 20");
  const tower = fresh(20, 1);
  tower.mode = "tower";
  assert.equal(marks.bountyAvailable(tower), false, "Tháp không có");
  const old = fresh(20, 1);
  old.gameplayVersion = 2;
  assert.equal(marks.bountyAvailable(old), false, "V2 không có");
  const met = fresh(20, 1);
  marks.ensure(met).bountyDone = true;
  assert.equal(marks.bountyAvailable(met), false, "chỉ gặp 1 lần");
});

test("sinh ra trong nhóm bẫy khi đủ điều kiện; không có vé thì không bao giờ sinh", () => {
  const tally = (tickets, floor) => {
    const counts = {};
    for (let i = 0; i < 6000; i++) {
      const e = core.generateEncounter(fresh(floor, tickets), session, Math.random);
      if (e.type === "trap") counts[e.kind] = (counts[e.kind] || 0) + 1;
    }
    return counts;
  };
  const withTicket = tally(1, 20);
  assert(withTicket.bounty_hunter > 0, "Bounty Hunter xuất hiện trong nhóm bẫy");
  assert(withTicket.tax > 0 && withTicket.potion_thief > 0 && withTicket.portal > 0, "các bẫy cũ vẫn xuất hiện");
  const traps = Object.values(withTicket).reduce((a, b) => a + b, 0);
  assert(Math.abs(withTicket.bounty_hunter / traps - 0.25) < 0.08, "chia đều 4 loại bẫy khi đủ điều kiện");
  assert.equal(tally(0, 20).bounty_hunter, undefined, "không có vé thì không sinh");
  assert.equal(tally(1, 19).bounty_hunter, undefined, "dưới tầng 20 không sinh");
  const named = core.generateEncounter(fresh(20, 1), session, (() => { let i = 0; return () => [0.9, 0.5][i++ % 2]; })());
  void named;
});

test("Giao nộp: mất 1 vé, nhận VIT +40 (hồi phần Max HP tăng), chỉ gặp 1 lần", () => {
  const s = fresh(22); // tầng 22: không phải checkpoint nên không hồi đầy HP
  hunter(s);
  const opts = actions(s);
  assert.deepEqual(opts.map((o) => o.action), ["bounty_surrender", "bounty_resist"]);
  assert(!opts[0].disabled);
  const vit = s.vit, maxHp = s.maxHp;
  s.hp = 10;
  act(s, "bounty_surrender");
  assert.equal(s.escapeTokens, 0, "mất đúng 1 vé");
  assert.equal(s.vit, vit + 40);
  const gained = s.maxHp - maxHp;
  assert(gained >= 120, `VIT +40 phải tăng đáng kể Max HP (được +${gained})`);
  assert.equal(s.hp, 10 + gained, "hồi đúng phần Max HP tăng thêm");
  console.log(`  VIT +40 => Max HP ${maxHp} -> ${s.maxHp} (+${gained})`);
  assert.equal(marks.data(s).bountyBlessing, true);
  assert.equal(marks.data(s).bountyDone, true);
  assert.equal(marks.data(s).bountyCurse, undefined);
  assert.equal(marks.bountyAvailable(s), false);
  assert.equal(marks.bribeRate(s), 0.4, "Giao nộp không đổi giá hối lộ");
  assert(/Bounty Seal/.test(JSON.stringify(marks.fields(s))));
});

test("Không có vé: Giao nộp bị khóa, không thể thực hiện", () => {
  const s = fresh(20, 0);
  hunter(s);
  assert(actions(s)[0].disabled);
  assert.throws(() => act(s, "bounty_surrender"), /INVALID_ACTION/);
  assert.equal(s.escapeTokens, 0);
  assert.equal(marks.data(s).bountyDone, undefined, "hành động lỗi không để lại dấu ấn");
});

test("Chống trả: giữ vé, không đổi VIT, Hối lộ tăng dần 45% → 50% → 55% (trần 90%)", () => {
  const s = fresh();
  hunter(s);
  const vit = s.vit;
  act(s, "bounty_resist");
  assert.equal(s.escapeTokens, 1, "giữ vé");
  assert.equal(s.vit, vit);
  assert.equal(marks.data(s).bountyDone, true);
  assert.equal(marks.bountyAvailable(s), false);
  assert(/Bounty Curse/.test(JSON.stringify(marks.fields(s))));
  const rates = [];
  for (let i = 0; i < 12; i++) {
    // mỗi lần hối lộ dùng một trạng thái mới, mang theo số lần đã hối lộ để tránh phải đi hết sảnh chờ Rift
    const t = fresh(22);
    marks.ensure(t).bountyCurse = { bribes: i };
    t.bonus = 1_000_000;
    rngesus(t);
    const bribe = actions(t).find((o) => o.action === "bribe");
    assert(bribe && !bribe.disabled);
    const rate = marks.bribeRate(t);
    rates.push(Math.round(rate * 100));
    assert(bribe.label.includes(`${Math.round(rate * 100)}%`), bribe.label);
    const before = core.payout(t);
    act(t, "bribe");
    assert.equal(t.payoutEventSpent, Math.ceil(before * rate), `lần ${i + 1}: trừ ${rate * 100}% payout`);
    assert.equal(marks.data(t).bountyCurse.bribes, i + 1, "mỗi lần hối lộ tăng bộ đếm");
  }
  assert.deepEqual(rates.slice(0, 4), [45, 50, 55, 60]);
  assert.equal(Math.max(...rates), 90, "tối đa 90%");
  assert.equal(rates.at(-1), 90);
});

test("không có Bounty Curse thì Hối lộ vẫn 40%", () => {
  const s = fresh();
  s.bonus = 1_000_000;
  rngesus(s);
  assert.equal(marks.bribeRate(s), 0.4);
  assert(actions(s).find((o) => o.action === "bribe").label.includes("40%"));
  act(s, "bribe");
  assert.equal(marks.data(s).bountyCurse, undefined, "không có Bounty Curse thì không đếm");
});

test("dấu ấn được kiểm tra khi lưu/khôi phục", () => {
  const s = fresh();
  marks.ensure(s).bountyCurse = { bribes: -1 };
  assert.throws(() => marks.normalize(s), /INVALID_EXPLORATION_MARK/);
  marks.ensure(s).bountyCurse = { bribes: 2 };
  marks.ensure(s).bountyDone = "yes";
  assert.throws(() => marks.normalize(s), /INVALID_EXPLORATION_MARK/);
  marks.ensure(s).bountyDone = true;
  marks.normalize(s);
});

test("giao diện: chi tiết và nút không lỗi, hiển thị đủ hai lựa chọn", () => {
  const s = fresh();
  hunter(s);
  const detail = JSON.stringify(view.privatePayload(s, session.id, "public", "encounter"));
  assert(/Bounty Hunter/.test(detail));
  assert(/VIT/.test(detail) && /Bounty Curse/.test(detail));
  const main = JSON.stringify(view.privatePayload(s, session.id, "public", "main") || {});
  void main;
});
console.log(`hardcore bounty hunter ok (${groups})`);
