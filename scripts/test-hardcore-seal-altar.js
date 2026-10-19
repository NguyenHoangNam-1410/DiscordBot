"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  marks = require("../src/hardcore/events/explorationMarks"),
  bag = require("../src/hardcore/inventory/service"),
  levels = require("../src/services/playerLevelService"),
  view = require("../src/hardcore/ui");
const session = { id: "seals", guild_id: "sealg", user_id: "u", channel_id: "c" };
const rng = () => 0.99;
let groups = 0;
function test(name, fn) {
  fn();
  groups++;
  console.log("PASS " + name);
}
function fresh(floor = 40) {
  const s = stats.createState("barbarian", 100000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    godRngesusEnabled: false,
    encounter: { type: "empty" },
    lastLog: "",
    phase: "encounter",
    reviveTickets: 0,
  });
  return s;
}
function allSeals(s) {
  const m = marks.ensure(s);
  Object.assign(m, { outlaw: true, underworld: true, vitalBlessing: true, bountyResisted: true });
  return s;
}

test("bốn ấn có tên riêng và đúng nguồn", () => {
  assert.deepEqual(marks.SEALS.map((x) => x.key), ["outlaw", "underworld", "vitalBlessing", "bountyResisted"]);
  assert.deepEqual(marks.SEALS.map((x) => x.name), ["Ấn Phản Vương", "Ấn Hắc Giới", "Ấn Sinh Mệnh", "Ấn Truy Nã"]);
  assert.equal(new Set(marks.SEALS.map((x) => x.name)).size, 4);
});

test("chỉ đủ khi có cả bốn ấn nghịch; thiếu một ấn thì không", () => {
  for (const missing of marks.SEALS.map((x) => x.key)) {
    const s = allSeals(fresh());
    delete marks.data(s)[missing];
    assert.equal(marks.sealsComplete(s), false, `thiếu ${missing}`);
    assert.equal(marks.sealAltarDue(s), false);
  }
  const s = allSeals(fresh());
  assert.equal(marks.sealsComplete(s), true);
  assert.equal(marks.sealAltarDue(s), true);
  // ấn thuận (nộp thuế / chấp nhận) không tính
  const compliant = fresh();
  Object.assign(marks.ensure(compliant), { taxCompliant: true, thiefAccepted: true, vitalBlessing: true, bountyResisted: true });
  assert.equal(marks.sealsComplete(compliant), false);
});

test("không kích hoạt trong Tháp/V2, khi đã nhận, hoặc đang cầm Vé hồi sinh", () => {
  const tower = allSeals(fresh());
  tower.mode = "tower";
  assert.equal(marks.sealAltarDue(tower), false);
  const claimed = allSeals(fresh());
  marks.data(claimed).sealsClaimed = true;
  assert.equal(marks.sealAltarDue(claimed), false, "chỉ 1 lần/run");
  const holding = allSeals(fresh());
  holding.reviveTickets = 1;
  assert.equal(marks.sealAltarDue(holding), false, "đang cầm vé thì chưa kích hoạt");
  holding.reviveTickets = 0; // đã dùng vé
  assert.equal(marks.sealAltarDue(holding), true, "dùng vé xong thì event xuất hiện");
});

test("sinh ra event, nhận 1 Vé hồi sinh, giữ nguyên các ấn, không lặp lại", () => {
  const s = allSeals(fresh());
  const e = core.generateEncounter(s, session, rng);
  assert.equal(e.type, "surprise");
  assert.equal(e.kind, "seal_altar");
  assert.match(e.name, /Đàn Tứ Ấn/);
  s.phase = "encounter";
  s.encounter = e;
  const opts = core.actions(s);
  assert.deepEqual(opts.map((o) => o.action), ["event_seal_claim"], "chỉ có nút nhận, không bỏ qua");
  core.act(s, session, "event_seal_claim", rng);
  assert.equal(s.reviveTickets, 1);
  assert.equal(s.sealAltars, 1, "đếm số lần nhận cho thành tựu");
  assert.equal(marks.data(s).sealsClaimed, true);
  assert.equal(marks.ownedSeals(s).length, 4, "các ấn không bị tiêu hao");
  assert.match(s.lastLog, /Vé hồi sinh/);
  // không sinh lại
  s.encounter = { type: "empty" };
  for (let i = 0; i < 50; i++) assert.notEqual(core.generateEncounter(s, session, Math.random).kind, "seal_altar");
});

test("hành động sai hoặc khi chưa đủ điều kiện bị từ chối", () => {
  const s = fresh();
  s.phase = "encounter";
  s.encounter = { type: "surprise", kind: "seal_altar", name: "x", sealAltar: true };
  assert.throws(() => core.act(s, session, "event_seal_claim", rng), /INVALID_ACTION/, "chưa đủ ấn không thể nhận");
  assert.equal(s.reviveTickets, 0);
});

test("hiển thị: Rift có Tứ Ấn x/4 với tên ấn, giao diện event không lỗi", () => {
  const s = fresh();
  marks.ensure(s).outlaw = true;
  const text = JSON.stringify(marks.fields(s));
  assert(/Tứ Ấn 1\/4/.test(text) && /Ấn Phản Vương/.test(text) && /⬜/.test(text));
  allSeals(s);
  s.encounter = { type: "surprise", kind: "seal_altar", name: "Đàn Tứ Ấn · Altar of Four Seals", sealAltar: true };
  const detail = JSON.stringify(view.privatePayload(s, session.id, "public", "encounter"));
  assert(/Đàn Tứ Ấn/.test(detail) && /Vé hồi sinh/.test(detail));
  assert(/Ấn Hắc Giới/.test(JSON.stringify(marks.fields(s))));
});

test("dấu ấn mới được kiểm tra khi khôi phục", () => {
  const s = fresh();
  marks.ensure(s).sealsClaimed = "yes";
  assert.throws(() => marks.normalize(s), /INVALID_EXPLORATION_MARK/);
});

test("cửa hàng không còn bán Vé hồi sinh", () => {
  const shop = bag.shop("shop-g", Date.UTC(2026, 9, 20));
  const tickets = shop.products.filter((p) => p.typeCode === "ticket").map((p) => p.id);
  assert.deepEqual(tickets, ["survival_escape", "survival_prayer"]);
  levels.addDiamonds("shop-g", "buyer", 1000, { reason: "test" });
  assert.throws(
    () => bag.purchase({ guildId: "shop-g", userId: "buyer", itemId: "survival_revive", quantity: 1, day: shop.day, operationId: "buy-revive", now: Date.UTC(2026, 9, 20) }),
    /NOT_FOR_SALE/,
  );
  assert.equal(levels.getPlayerProgression("shop-g", "buyer").diamonds, 1000, "không bị trừ kim cương");
});

test("hoàn 300 kim cương cho mỗi Vé hồi sinh đang có, xóa vé, chạy lại không hoàn thêm", () => {
  db.prepare("DELETE FROM hardcore_inventory").run();
  bag.grant("rf-g", "p1", "survival_revive", 2);
  bag.grant("rf-g", "p1", "survival_escape", 1);
  bag.grant("rf-g2", "p2", "survival_revive", 1);
  levels.addDiamonds("rf-g", "p1", 50, { reason: "test" });
  const result = bag.refundRetiredReviveTickets();
  assert.deepEqual(result, { players: 2, tickets: 3, diamonds: 900 });
  assert.equal(levels.getPlayerProgression("rf-g", "p1").diamonds, 50 + 600);
  assert.equal(levels.getPlayerProgression("rf-g2", "p2").diamonds, 300);
  const left = db.prepare("SELECT item_id,quantity FROM hardcore_inventory WHERE guild_id='rf-g' AND user_id='p1'").all();
  assert.deepEqual(left, [{ item_id: "survival_escape", quantity: 1 }], "chỉ xóa Vé hồi sinh, giữ vật phẩm khác");
  assert.deepEqual(bag.refundRetiredReviveTickets(), { players: 0, tickets: 0, diamonds: 0 });
  assert.equal(levels.getPlayerProgression("rf-g", "p1").diamonds, 650, "không hoàn lần hai");
});

test("run đang chạy đang cầm vé giữ nguyên", () => {
  const s = fresh();
  s.reviveTickets = 1;
  assert.equal(core.reviveAfterDeath(Object.assign(s, { hp: 0, encounter: { type: "combat" } }), session, rng, "death"), true);
  assert.equal(s.reviveTickets, 0, "vé vẫn dùng bình thường");
});
console.log(`hardcore seal altar ok (${groups})`);
