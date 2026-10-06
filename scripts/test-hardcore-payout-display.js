"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const view = require("../src/services/hardcoreV2View");
const world = require("../src/services/hardcoreWorld");
const { baseMultiplier } = require("../src/services/hardcoreEngine");
const session = {
  id: "payout-test",
  guild_id: "payout",
  user_id: "user",
  channel_id: "c",
};
const rng = () => 0.5;
const money = (n) => Math.abs(n).toLocaleString("vi-VN");
function create(encounter, overrides = {}) {
  const s = stats.createState("barbarian", 10000);
  Object.assign(s, { floor: 5, cleared: 4, encounter, ...overrides });
  stats.recompute(s);
  return s;
}
function fields(s) {
  const e = view.embed(s, "user").toJSON();
  assert.ok(e.fields.every((f) => f.value.length <= 1024));
  assert.ok(
    !JSON.stringify(e).includes("undefined"),
    "rendered UI must not leak undefined",
  );
  assert.ok(
    e.fields.reduce(
      (n, f) => n + f.name.length + f.value.length,
      e.title.length + e.description.length,
    ) < 6000,
  );
  return e.fields;
}
function play(s, action) {
  const before = core.payout(s);
  core.act(s, session, action, rng);
  const receipt = s.lastEventResult;
  assert.ok(receipt?.payoutBefore, "event must retain a payout receipt");
  assert.equal(receipt.payoutBefore.coins, before);
  const delta = receipt.payoutAfter.coins - before;
  const change =
    money(before) +
    " → **" +
    money(receipt.payoutAfter.coins) +
    "** (" +
    (delta < 0 ? "−" : "+") +
    money(delta) +
    " xu)";
  assert.ok(s.lastLog.includes(change), s.lastLog);
  const text = fields(s)
    .map((f) => f.value)
    .join("\n");
  assert.ok(text.includes(change), text);
  assert.equal(
    (text.match(/Thưởng xu · /g) || []).length,
    1,
    "payout delta must appear once",
  );
  return receipt;
}
// Record penalties before changing the cleared floor or applying checkpoint healing.
for (const [encounter, action, rate] of [
  [{ type: "trap", name: "Thu thuế", kind: "tax", lucky: false }, "next", 0.15],
  [
    {
      type: "memory",
      name: "The Tower Remembers",
      debt: { kind: "tax", good: false },
    },
    "next",
    0.1,
  ],
  [{ type: "rngesus", name: "RNGesus" }, "bribe", 0.4],
  [
    { type: "surprise", name: "Treasure Goblin", kind: "goblin", roll: 0.99 },
    "event_catch",
    0.1,
  ],
]) {
  const s = create(encounter);
  const r = play(s, action);
  assert.equal(
    r.payoutAfter.coins,
    Math.floor(10000 * baseMultiplier({ cleared: 4 }) * (1 - rate)),
  );
  assert.equal(s.cleared, 5);
  assert.ok(
    core.payout(s) > r.payoutAfter.coins,
    "floor payout must be separate from event loss",
  );
  const f = fields(s);
  const withdrawal = f.find((x) => x.name.includes("Rút thưởng")).value;
  assert.ok(withdrawal.includes("Xu có thể nhận"));
  assert.ok(withdrawal.includes("Giảm thưởng xu"));
  assert.ok(withdrawal.includes("**" + Math.round(rate * 100) + "%**"));
  assert.ok(
    !f
      .find((x) => x.name.includes("Trang bị"))
      .value.includes("Payout sau phạt"),
  );
}
// Wrong Portal does not clear the floor, and records the loss before fighting its Elite.
{
  const s = create({ type: "empty", name: "Trống" });
  s.encounter = {
    type: "trap",
    name: "Wrong Portal",
    kind: "portal",
    good: false,
    badEffect: "payout",
    enemy: world.makeEnemy(s, rng, "elite"),
  };
  const r = play(s, "next");
  assert.equal(r.payoutAfter.coins, Math.floor(r.payoutBefore.coins * 0.9));
  assert.equal(s.cleared, 4);
  assert.equal(s.encounter.type, "combat");
}
// Positive bonuses are reduced by the existing multiplier; log the amount actually added.
for (const [encounter, action, rate] of [
  [
    { type: "shrine", name: "Shrine Experience", kind: "experience" },
    "touch",
    0.25,
  ],
  [{ type: "chest", name: "Hòm" }, "sell", 0.15],
  [
    { type: "surprise", name: "Treasure Goblin", kind: "goblin", roll: 0 },
    "event_catch",
    0.25,
  ],
  [
    {
      type: "trap",
      name: "Wrong Portal",
      kind: "portal",
      good: true,
      effect: "treasure",
    },
    "next",
    0.5,
  ],
  [
    {
      type: "memory",
      name: "The Tower Remembers",
      debt: { good: true, healRate: 0.1, bonusRate: 0.3 },
    },
    "next",
    0.3,
  ],
]) {
  const s = create(encounter, { eventPayoutFactor: 0.6 });
  const r = play(s, action);
  assert.equal(r.payoutAfter.coins - r.payoutBefore.coins, 10000 * rate * 0.6);
  assert.ok(s.lastLog.includes("(+"));
}
{
  const s = create(
    { type: "boss_chest", name: "Rương boss", bossFloor: 100 },
    { phase: "boss_chest", floor: 101, cleared: 100, eventPayoutFactor: 0.6 },
  );
  const r = play(s, "boss_sell");
  assert.equal(
    r.payoutAfter.coins - r.payoutBefore.coins,
    Math.floor(r.payoutBefore.coins * 0.5),
  );
  assert.equal(s.cleared, 100);
}
// Spending and restoring a curse have a single net receipt, with the original purchase cost preserved.
{
  const s = create({
    type: "surprise",
    kind: "merchant",
    name: "Rift Merchant",
    offers: [{ key: "potion", price: 500 }],
  });
  const r = play(s, "buy_0");
  assert.equal(r.payoutAfter.coins - r.payoutBefore.coins, -500);
  assert.equal(s.payoutSpent, 500);
  assert.ok(
    fields(s)
      .find((f) => f.name.includes("Rút thưởng"))
      .value.includes("Đã chi trong run: **500"),
  );
}
{
  const s = create({ type: "empty", name: "Trống" });
  const cursed = core.ITEMS.cursed.find((i) => i.curse?.effects.bonusPenalty);
  core.receiveItem(s, cursed);
  const spent = Math.max(1, Math.ceil(core.rawPayout(s) * 0.1));
  s.encounter = {
    type: "surprise",
    kind: "purifier",
    name: "Purifier",
    targetId: cursed.id,
  };
  const r = play(s, "event_cleanse");
  assert.equal(s.payoutSpent, spent);
  assert.equal(
    r.payoutAfter.coins,
    Math.floor(10000 * baseMultiplier({ cleared: 4 })) - spent,
  );
}
// Bonus at the cap is recorded as no cash change, never a fictitious +2500.
{
  const s = create(
    { type: "shrine", name: "Shrine Experience", kind: "experience" },
    { stake: 10000000, cleared: 100, floor: 101 },
  );
  const r = play(s, "touch");
  assert.equal(r.payoutAfter.coins, 10000000);
  assert.ok(s.lastLog.includes("(+0 xu)"));
}
{
  const s = create({ type: "empty", name: "Trống" });
  s.contract = { kind: "skill", from: 3, until: 5, remaining: 1 };
  core.act(s, session, "next", rng);
  assert.ok(s.lastLog.includes("Thưởng xu · Hoàn thành Rift Contract"));
}
// Reopening a persisted state retains the original event amounts, even after the checkpoint.
{
  const s = create({
    type: "trap",
    name: "Thu thuế",
    kind: "tax",
    lucky: false,
  });
  play(s, "next");
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(
    view
      .embed(json, "user")
      .toJSON()
      .fields.find((f) => f.name.includes("Lượt vừa rồi")).value,
    view
      .embed(s, "user")
      .toJSON()
      .fields.find((f) => f.name.includes("Lượt vừa rồi")).value,
  );
  delete json.lastEventResult.payoutBefore;
  delete json.lastEventResult.payoutAfter;
  fields(json);
}
// Application coin emojis load after modules; both the live UI and new logs must resolve them.
{
  const { E } = require("../src/services/hardcoreIcons");
  const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
  assert.equal(E.coin, "🪙");
  setApplicationEmojisForTest([["coin", "123456789012345678"]]);
  const coin = "<:coin:123456789012345678>";
  assert.equal(E.coin, coin);
  const s = create(
    {
      type: "trap",
      name: "Thu thuế",
      kind: "tax",
      lucky: false,
    },
    { payoutSpent: 164759, bonus: 500000, eventPayoutFactor: 0.381 },
  );
  play(s, "next");
  const withdrawal = fields(s).find((f) => f.name.includes("Rút thưởng")).value;
  assert.ok(withdrawal.includes("Đã chi trong run: **164.759 " + coin + "**."));
  assert.ok(s.lastLog.includes(coin + " **Thưởng xu · "));
  const old = JSON.parse(JSON.stringify(s));
  old.lastLog = old.lastLog.replace(
    coin + " **Thưởng xu · ",
    "undefined **Thưởng xu · ",
  );
  const log = fields(old).find((f) => f.name.includes("Lượt vừa rồi")).value;
  assert.ok(log.includes(coin + " **Thưởng xu · "));
  const detail = view.privatePayload(old, "payout-test", "message", "effects");
  assert.ok(!JSON.stringify(detail).includes("undefined"));
  assert.ok(JSON.stringify(detail).includes(coin));
  setApplicationEmojisForTest([]);
}
db.close();
console.log(
  "Hardcore payout display: event penalties, bonuses, costs, curse restoration, checkpoints, cap, contracts and persisted UI passed.",
);
