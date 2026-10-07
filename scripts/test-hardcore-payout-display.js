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
  if (overrides.curseFactor != null)
    core.receiveItem(s, {
      catalogVersion: 2,
      id: "payout-test-curse",
      name: "Payout test curse",
      rarity: "cursed",
      effects: {},
      curse: { effects: { bonusPenalty: 1 - overrides.curseFactor } },
    });
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
    0.05,
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
  assert.ok(withdrawal.includes("Thực nhận: **" + money(core.payout(s))));
  assert.ok(withdrawal.includes("Đã trừ:"));
  assert.ok(
    withdrawal.includes(money(r.payoutBefore.coins - r.payoutAfter.coins)),
  );
  assert.equal(s.eventPayoutFactor, 1);
  assert.ok(withdrawal.split("\n").length <= 2);
  assert.equal(
    f.find((x) => x.name.includes("Trang bị")),
    undefined,
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
  const s = create(encounter, { curseFactor: 0.6 });
  const r = play(s, action);
  assert.equal(r.payoutAfter.coins - r.payoutBefore.coins, 10000 * rate * 0.6);
  assert.ok(s.lastLog.includes("(+"));
}
{
  const s = create(
    { type: "boss_chest", name: "Rương boss", bossFloor: 100 },
    { phase: "boss_chest", floor: 101, cleared: 100, curseFactor: 0.6 },
  );
  const r = play(s, "boss_sell");
  assert.equal(r.payoutAfter.coins - r.payoutBefore.coins, s.stake * 0.6);
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
      .value.includes("**500 🪙** đã chi"),
  );
}
{
  const s = create({ type: "empty", name: "Trống" });
  const cursed = core.ITEMS.cursed.find((i) => i.curse?.effects.bonusPenalty);
  core.receiveItem(s, cursed);
  const spent = Math.max(1, Math.ceil(core.payout(s) * 0.1));
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
// Purifier prices the displayed payout before cleansing, including Blood Paradox.
// The fee is fixed spending; future earnings and other service prices are unchanged.
for (const bloodFactor of [null, -0.5, 0.5]) {
  for (const remaining of [null, 0, 1]) {
    const s = create(
      { type: "empty", name: "Trống" },
      {
        bonus: 50000,
        payoutSpent: 1234,
        curseFactor: 0.8,
        ...(bloodFactor == null
          ? {}
          : { paradox: { kind: "blood", bloodFactor, until: 20 } }),
      },
    );
    const target = core.ITEMS.cursed.find((i) => i.id === "glass_cannon");
    core.receiveItem(s, target);
    s.encounter = {
      type: "surprise",
      kind: "purifier",
      name: "Purifier",
      targetId: target.id,
    };
    if (remaining != null) s.payoutSpent += core.payout(s) - remaining;
    const before = core.payout(s),
      spent = s.payoutSpent;
    const factor = s.payoutFactor,
      eventFactor = s.eventPayoutFactor;
    const cost = Math.max(1, Math.ceil(before * core.PURIFIER_COST_RATE));
    assert.equal(core.purifierCost(s), cost);
    assert.equal(
      core.serviceCost(s, 0.12),
      Math.max(1, Math.ceil(core.rawPayout(s) * 0.12)),
    );
    const action = core.actions(s).find((a) => a.action === "event_cleanse");
    assert.equal(action.label, "Giải toàn bộ · " + cost + " xu");
    assert.equal(action.disabled, before < cost);
    const detail = JSON.stringify(
      view.privatePayload(s, "payout-test", "message", "encounter"),
    );
    assert.ok(detail.includes("payout hiện tại"));
    assert.ok(!detail.includes("payout gốc"));
    assert.ok(detail.includes(money(cost) + " xu**"));
    if (!before) {
      assert.throws(
        () => core.act(s, session, "event_cleanse", rng),
        /INVALID_ACTION/,
      );
      assert.equal(s.payoutSpent, spent);
      assert.equal(
        s.items.find((i) => i.definition.id === target.id).cleansedLevels,
        0,
      );
      continue;
    }
    // Pending, persisted Purifier encounters must use the same price when resumed.
    const resumed = JSON.parse(JSON.stringify(s));
    core.normalize(resumed);
    assert.equal(core.purifierCost(resumed), cost);
    const receipt = play(resumed, "event_cleanse");
    assert.equal(receipt.payoutAfter.coins, before - cost);
    assert.equal(resumed.payoutSpent, spent + cost);
    assert.equal(resumed.payoutFactor, factor);
    assert.equal(resumed.eventPayoutFactor, eventFactor);
    assert.equal(resumed.payoutEventSpent || 0, s.payoutEventSpent || 0);
    const clean = resumed.items.find((i) => i.definition.id === target.id);
    assert.equal(clean.cleansedLevels, clean.level);
    assert.equal(clean.rarity, "cursed");
  }
}
const purifierRule = view
  .ratesFields()
  .find((f) => f.name.includes("Purifier"));
assert.ok(purifierRule.value.includes("payout hiện tại"));
assert.ok(!purifierRule.value.includes("payout gốc"));

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
    { payoutSpent: 164759, bonus: 500000, curseFactor: 0.381 },
  );
  play(s, "next");
  const withdrawal = fields(s).find((f) => f.name.includes("Rút thưởng")).value;
  assert.ok(withdrawal.includes("**164.759 " + coin + "** đã chi"));
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
  assert.ok(!JSON.stringify(detail).includes("Payout gốc"));
  setApplicationEmojisForTest([]);
}

// Every monetary penalty uses the available payout after previous spending and curses.
// Later event bonuses and floor rewards must not inherit that penalty.
for (const curseFactor of [1, 0.8]) {
  for (const [type, action, rate] of [
    ["tax", "next", 0.15],
    ["goblin", "event_catch", 0.05],
    ["legacy", "next", 0.1],
    ["bounty", "next", 0.1],
    ["hunter", "memory_settle", 0.2],
    ["portal", "next", 0.1],
    ["rngesus", "bribe", 0.4],
  ]) {
    const s = create(
      { type: "empty", name: "Trống" },
      {
        stake: 12345,
        bonus: 50000,
        payoutSpent: 12456,
        curseFactor,
      },
    );
    const enemy = world.makeEnemy(s, rng, "elite");
    s.encounter = {
      tax: { type: "trap", kind: "tax", name: "Thu thuế", lucky: false },
      goblin: { type: "surprise", kind: "goblin", name: "Goblin", roll: 0.99 },
      legacy: {
        type: "memory",
        name: "Ký ức cũ",
        debt: { kind: "tax", good: false },
      },
      bounty: {
        type: "memory",
        name: "Truy nã",
        debt: { version: 2, family: "bounty", kind: "tax" },
      },
      hunter: {
        type: "memory",
        name: "Truy nã",
        debt: { version: 2, family: "bounty", kind: "hunter" },
        enemy,
      },
      portal: {
        type: "trap",
        name: "Wrong Portal",
        kind: "portal",
        good: false,
        badEffect: "payout",
        enemy,
      },
      rngesus: { type: "rngesus", name: "RNGesus" },
    }[type];
    const before = core.payout(s);
    const loss = Math.ceil(before * rate);
    const factor = s.payoutFactor;
    const spent = s.payoutSpent;
    const r = play(s, action);
    assert.equal(r.payoutAfter.coins, before - loss, type);
    assert.equal(s.payoutSpent, spent + loss, type);
    assert.equal(s.eventPayoutFactor, 1, type);
    assert.equal(s.payoutFactor, factor, type);
    const priorGross = (s.stake * baseMultiplier(s) + s.bonus) * factor;
    s.bonus += s.stake;
    assert.equal(
      core.payout(s),
      Math.max(0, Math.floor(priorGross + s.stake * factor) - spent - loss),
    );
  }
}
// Percent losses round up, stop at zero, and use the remaining payout on each repeat.
{
  const s = create(
    { type: "rngesus", name: "RNGesus" },
    {
      stake: 12345,
      bonus: 100000,
      payoutSpent: 50000,
    },
  );
  for (let i = 0; i < 3; i++) {
    s.phase = "encounter";
    s.encounter = { type: "rngesus", name: "RNGesus" };
    const before = core.payout(s),
      spent = s.payoutSpent;
    core.act(s, session, "bribe", rng);
    assert.equal(
      s.lastEventResult.payoutAfter.coins,
      before - Math.ceil(before * 0.4),
    );
    assert.equal(s.payoutSpent, spent + Math.ceil(before * 0.4));
    assert.equal(s.eventPayoutFactor, 1);
  }
  for (const available of [0, 1]) {
    const tiny = create({
      type: "trap",
      kind: "tax",
      name: "Tax",
      lucky: false,
    });
    tiny.payoutSpent = core.payout(tiny) - available;
    const spent = tiny.payoutSpent;
    core.act(tiny, session, "next", rng);
    assert.equal(tiny.payoutSpent - spent, Math.ceil(available * 0.15));
    if (available) assert.equal(tiny.lastEventResult.payoutAfter.coins, 0);
    assert.equal(tiny.eventPayoutFactor, 1);
  }
}
// Convert saved multipliers once, preserving cashout, curses and capped/zero payouts.
for (const overrides of [
  { eventPayoutFactor: 0.6, payoutSpent: 2000 },
  { eventPayoutFactor: 0.6, payoutSpent: 2000, curseFactor: 0.8 },
  { eventPayoutFactor: 0, payoutSpent: 2000 },
  { eventPayoutFactor: 0.6, stake: 10000000, cleared: 100 },
  { eventPayoutFactor: 0.6, payoutSpent: 200000 },
  {
    eventPayoutFactor: 0.6,
    paradox: { kind: "blood", bloodFactor: 0.5, until: 20 },
  },
]) {
  const s = create({ type: "empty", name: "Trống" }, overrides);
  const before = core.payout(s);
  const oldFactor = s.eventPayoutFactor;
  const curseFactor = s.payoutFactor / (oldFactor || 1);
  core.normalize(s);
  assert.equal(core.payout(s), before);
  assert.equal(s.eventPayoutFactor, 1);
  if (oldFactor > 0) assert.ok(Math.abs(s.payoutFactor - curseFactor) < 1e-12);
  const saved = JSON.stringify(s);
  core.normalize(s);
  assert.equal(JSON.stringify(s), saved, "normalization must not charge twice");
}
// Gambling is the explicit exception: rewards follow the actual event wager.
for (const fraction of [0.1, 0.25]) {
  for (const roll of [0.49, 0.5]) {
    const s = create(
      { type: "surprise", name: "Cursed Gambler", kind: "gambler", roll },
      {
        bonus: 50000,
        payoutSpent: 2000,
      },
    );
    const wager = core.serviceCost(s, fraction),
      bonus = s.bonus;
    play(s, fraction === 0.1 ? "event_gamble_10" : "event_gamble_25");
    assert.equal(s.payoutSpent, 2000 + wager);
    assert.equal(s.bonus, bonus + (roll < 0.5 ? wager * 2 : 0));
    assert.equal(s.eventPayoutFactor, 1);
    assert.ok(!s.lastLog.includes("lãi ròng"));
  }
}
// Boss sales are independent of accumulated payout; ordinary sales stay at 15% stake.
for (const bonus of [0, 500000]) {
  const s = create(
    { type: "boss_chest", name: "Rương boss", bossFloor: 100 },
    {
      phase: "boss_chest",
      floor: 101,
      cleared: 100,
      bonus,
      payoutSpent: 3000,
    },
  );
  const detail = JSON.stringify(view.privatePayload(s, "s", "m", "encounter"));
  assert.ok(detail.includes("100% cược"));
  assert.ok(
    core
      .actions(s)
      .some((a) => a.action === "boss_sell" && a.label.includes("100%")),
  );
  const r = play(s, "boss_sell");
  assert.equal(s.bonus, bonus + s.stake);
  assert.equal(r.payoutAfter.coins - r.payoutBefore.coins, s.stake);
}
// Pending wealth trials from old runs also use stake without rerolling the encounter.
{
  const memories = require("../src/hardcore/towerMemories");
  const s = create({ type: "empty", name: "Trống" }, { bonus: 50000 });
  const debt = {
    version: 2,
    family: "wealth",
    kind: "wealth",
    coins: 999999,
    due: 20,
  };
  s.encounter = memories.makeEncounter(s, debt, rng);
  assert.equal(s.encounter.enemy.memoryReward.coins, s.stake * 1.5);
  assert.ok(JSON.stringify(memories.fields(s)).includes("15.000"));
  core.act(s, session, "next", rng);
  // Simulate a persisted combat from before the update.
  s.encounter.memoryReward.coins = 999999;
  const enemy = s.encounter;
  enemy.hp = 1;
  enemy.defense = 0;
  enemy.evasion = 0;
  enemy.mechanic = null;
  const beforeBonus = s.bonus;
  const combatReward = Math.floor(s.stake * 0.01 * enemy.rewardMultiplier);
  core.act(s, session, "attack", () => 0.5);
  assert.equal(s.bonus - beforeBonus, s.stake * 1.5 + combatReward);
}

// Updated rule fields fit Discord and describe the same money policy as the engine.
for (const field of view
  .ratesFields()
  .filter((f) =>
    [
      "Rương boss cuối khu vực",
      "RNGesus · không được rút thưởng",
      "Rút thưởng và mất thưởng",
    ].some((name) => f.name.includes(name)),
  )) {
  assert.ok(field.value.length <= 1024);
}
assert.ok(
  view
    .ratesFields()
    .some((f) => f.value.includes("event cược thưởng theo khoản đã đặt")),
);
assert.ok(
  view.ratesFields().some((f) => f.value.includes("100% cược ban đầu")),
);

db.close();
console.log(
  "Hardcore payout display: event penalties, bonuses, costs, curse restoration, checkpoints, cap, contracts and persisted UI passed.",
);
