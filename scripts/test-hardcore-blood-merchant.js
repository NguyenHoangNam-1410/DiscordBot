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
const session = {
  id: "blood",
  guild_id: "blood",
  user_id: "player",
  channel_id: "c",
};
const safe = (rarity) =>
  core.ITEMS[rarity].find(
    (item) =>
      !["vit", "maxHp", "heal"].some(
        (key) => item.effects[key] || item.curse?.effects[key],
      ) && item.passive.kind !== "campHeal",
  );
function state(rarity = "rare", hp = 100, maxHp = 100) {
  const s = stats.createState("barbarian", 10000);
  stats.addSource(s, { maxHp: maxHp - s.maxHp });
  s.floor = 11;
  s.cleared = 10;
  s.hp = hp;
  s.encounter = {
    type: "surprise",
    kind: "blood_shop",
    name: "Blood Item Shop",
    offers: [
      {
        item: safe(rarity),
        price: Math.max(1, Math.ceil(s.maxHp * core.BLOOD_PRICES[rarity])),
      },
    ],
  };
  return s;
}
function buy(s) {
  core.act(s, session, "buy_0", () => 0.5);
}
const groups = [];
try {
  for (const [rarity, rate] of [
    ["rare", 0.12],
    ["legendary", 0.25],
    ["cursed", 0.4],
  ]) {
    for (const hp of [100, 80, 50, 1]) {
      const s = state(rarity, hp);
      const price = s.encounter.offers[0].price;
      const sourceBefore = s.sources.event.maxHp;
      assert.equal(price, Math.ceil(100 * rate));
      assert(
        !core.actions(s).find((action) => action.action === "buy_0").disabled,
      );
      buy(s);
      assert.equal(s.maxHp, 100 - price);
      assert.equal(s.hp, Math.min(hp, s.maxHp));
      assert.equal(s.sources.event.maxHp, sourceBefore - price);
      assert.equal(s.items.length, 1);
      assert.equal(s.lastEventResult.before.maxHp, 100);
      assert.equal(s.lastEventResult.after.maxHp, 100 - price);
      assert.equal(
        s.lastEventResult.directKeys.includes("hp"),
        hp > 100 - price,
      );
      assert.match(s.lastLog, /Max HP của bạn/);
      assert(s.lastLog.includes("100 → **" + (100 - price) + "**"));
    }
  }
  groups.push(
    "12/25/40% permanent capacity payment; full, injured and 1 HP players; receipt before/after",
  );

  for (const [roll, rarity] of [
    [0.1, "rare"],
    [0.7, "legendary"],
    [0.99, "cursed"],
  ]) {
    const s = state("rare", 50, 101);
    const e = core.makeSurprise(s, () => roll, "blood_shop");
    for (const offer of e.offers) {
      assert.equal(offer.item.rarity, rarity);
      assert.equal(offer.price, Math.ceil(101 * core.BLOOD_PRICES[rarity]));
      assert.equal(offer.discount, undefined);
    }
    s.encounter = e;
    const before = JSON.stringify(e);
    const loaded = core.normalize(JSON.parse(JSON.stringify(s)));
    assert.equal(JSON.stringify(loaded.encounter), before);
    const detail = view
      .privatePayload(loaded, "s", "p", "encounter")
      .embeds[0].toJSON();
    assert.match(JSON.stringify(detail), /giảm Max HP/);
    assert.equal(JSON.stringify(s.encounter), before);
  }
  groups.push(
    "rounded rates, old pending shop prices stay locked and readonly/resume cannot reroll",
  );

  const min = state("rare", 1, 1);
  assert.equal(min.encounter.offers[0].price, 1);
  assert(
    core.actions(min).find((action) => action.action === "buy_0").disabled,
  );
  const minBefore = JSON.stringify(min);
  assert.throws(() => buy(min), /INVALID_ACTION/);
  assert.equal(JSON.stringify(min), minBefore);
  const tooCostly = state();
  tooCostly.encounter.offers[0].price = tooCostly.maxHp;
  tooCostly.encounter.offers[0].item = core.ITEMS.legendary.find(
    (item) => item.effects.vit > 0,
  );
  assert.throws(() => buy(tooCostly), /INVALID_ACTION/);
  groups.push(
    "requires 1 Max HP remaining before item buffs; invalid purchase leaves state unchanged",
  );

  const lasting = state("cursed", 50);
  buy(lasting);
  const paid = lasting.maxHp;
  core.cleanse(lasting, lasting.items[0]);
  assert.equal(lasting.maxHp, paid);
  assert.equal(lasting.items[0].rarity, "cursed");
  const loaded = core.normalize(JSON.parse(JSON.stringify(lasting)));
  assert.equal(loaded.maxHp, paid);
  core.heal(loaded, 10000);
  assert.equal(loaded.hp, paid);
  assert.equal(loaded.maxHp, paid);
  loaded.floor = 15;
  loaded.cleared = 14;
  loaded.encounter = { type: "empty" };
  core.act(loaded, session, "next", () => 0.5);
  assert.equal(loaded.maxHp, paid);
  assert.equal(loaded.hp, paid);
  assert.equal(loaded.phase, "upgrade");
  core.act(loaded, session, "upgrade_vit", () => 0.5);
  assert.equal(loaded.maxHp, paid + 15);
  groups.push(
    "capacity loss persists through cleanse, save/resume, healing and checkpoint; later VIT still adds HP",
  );

  const growth = state();
  const hpItem = core.ITEMS.legendary.find((item) => item.effects.vit > 0);
  assert(hpItem);
  growth.encounter.offers[0].item = hpItem;
  growth.encounter.offers[0].price = 25;
  buy(growth);
  assert.equal(
    growth.maxHp,
    100 - 25 + hpItem.effects.vit * 3 + (hpItem.effects.maxHp || 0),
  );
  assert(growth.lastLog.includes("100 → **75**"));
  groups.push(
    "item HP buffs apply after the capacity price and payment log stays explicit",
  );

  const repeat = state();
  const originalSource = repeat.sources.event.maxHp;
  let remaining = 100,
    totalPaid = 0;
  for (const [index, rarity] of ["rare", "legendary", "cursed"].entries()) {
    repeat.floor = 11 + index * 50;
    repeat.cleared = repeat.floor - 1;
    repeat.encounter = {
      type: "surprise",
      kind: "blood_shop",
      name: "Blood Item Shop",
      offers: [
        {
          item: safe(rarity),
          price: Math.ceil(remaining * core.BLOOD_PRICES[rarity]),
        },
      ],
    };
    const price = repeat.encounter.offers[0].price;
    buy(repeat);
    remaining -= price;
    totalPaid += price;
    assert.equal(repeat.maxHp, remaining);
  }
  assert.equal(repeat.sources.event.maxHp, originalSource - totalPaid);
  groups.push(
    "multiple visits charge against the latest Max HP and permanent costs accumulate",
  );

  const ui = state();
  const publicEmbed = view.embed(ui, "player").toJSON();
  const shop = publicEmbed.fields.find((field) =>
    /Tình huống/.test(field.name),
  );
  assert.match(shop.value, /12%/);
  assert.match(shop.value, /Max HP/);
  const buttons = JSON.stringify(view.rows("s", ui).map((row) => row.toJSON()));
  assert.match(buttons, /12 Max HP/);
  assert.match(view.encounterText(ui), /Max HP trong suốt run/);
  for (const field of view.ratesFields())
    assert(field.value.length <= 1024, field.name + ": " + field.value.length);
  groups.push(
    "public price includes percentage/Max HP; buttons, private details and rules fit Discord limits",
  );

  const service = require("../src/services/hardcoreService");
  const repo = require("../src/services/hardcoreRepository");
  const run = service.startHardcore({
    guildId: "blood-tx",
    userId: "player",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: state().encounter,
  });
  const saved = repo.parseState(repo.getSession(run.session.id));
  const beforeMax = saved.maxHp,
    price = saved.encounter.offers[0].price;
  const played = service.playHardcore({
    sessionId: run.session.id,
    userId: "player",
    expectedTurn: saved.turn,
    action: "buy_0",
  });
  assert.equal(played.state.maxHp, beforeMax - price);
  const persisted = repo.getSession(run.session.id).state_json;
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "player",
        expectedTurn: saved.turn,
        action: "buy_0",
      }),
    /STALE_ACTION/,
  );
  assert.equal(repo.getSession(run.session.id).state_json, persisted);
  assert.equal(
    core.normalize(repo.parseState(repo.getSession(run.session.id))).maxHp,
    beforeMax - price,
  );
  groups.push(
    "real service persists capacity payment and duplicate clicks cannot charge again",
  );

  console.log("Blood Merchant: " + groups.length + " groups passed");
  for (const group of groups) console.log("  ✓ " + group);
} finally {
  db.close();
}
