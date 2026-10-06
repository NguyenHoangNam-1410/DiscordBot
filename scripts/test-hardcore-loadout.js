"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hardcore-loadout-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");
delete process.env.HARDCORE_GAMEPLAY_VERSION;
const { db } = require("../src/db");
const bag = require("../src/services/hardcoreInventoryService");
const ui = require("../src/services/hardcoreInventoryView");
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const world = require("../src/services/hardcoreWorld");
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const economy = require("../src/services/economyService");
const currency = require("../src/services/playerLevelService");
const { setGameChannel } = require("../src/services/gameChannelService");
const { routeComponentInteraction } = require("../src/componentRouter");
const guildId = "loadout";
let count = 0;
const newUser = () => `u${++count}`;
function start(
  userId = newUser(),
  loadout = {},
  encounter = { type: "empty", name: "Empty" },
) {
  return service.startHardcore({
    guildId,
    userId,
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: encounter,
    loadout,
  });
}
function play(run, action) {
  const current = repo.parseState(repo.getSession(run.session.id));
  return service.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: current.turn,
    action,
  });
}
function save(run, edit) {
  const state = repo.parseState(repo.getSession(run.session.id));
  edit(state);
  repo.saveState(run.session, state);
  return state;
}
function serialize(payload) {
  const embeds = (payload.embeds || []).map((embed) => embed.toJSON());
  const components = (payload.components || []).map((component) =>
    component.toJSON(),
  );
  assert.ok(
    embeds.reduce(
      (n, embed) =>
        n +
        (embed.title?.length || 0) +
        (embed.description?.length || 0) +
        (embed.footer?.text.length || 0) +
        (embed.fields || []).reduce(
          (n, field) => n + field.name.length + field.value.length,
          0,
        ),
      0,
    ) <= 6000,
  );
  for (const embed of embeds)
    for (const field of embed.fields || [])
      assert.ok(field.value.length > 0 && field.value.length <= 1024);
  for (const r of components)
    for (const c of r.components) {
      assert.ok(c.custom_id.length <= 100);
      if (c.options) assert.ok(c.options.length > 0 && c.options.length <= 25);
    }
  return { embeds, components };
}
async function run() {
  const beforeMidnight = Date.parse("2026-10-05T16:59:59.999Z"),
    midnight = beforeMidnight + 1;
  assert.equal(bag.vietnamDay(beforeMidnight), "2026-10-05");
  assert.equal(bag.vietnamDay(midnight), "2026-10-06");
  // Canonicalization preserves every retired quantity and is safe to repeat.
  const { ITEM_ALIASES, resolveItemId } = require("../src/hardcore/item");
  const migratedUser = newUser();
  const seedStock = db.prepare(
    "INSERT INTO hardcore_inventory(guild_id,user_id,item_id,quantity,updated_at) VALUES(?,?,?,?,?)",
  );
  const expectedStock = new Map();
  for (const [oldId, newId] of Object.entries(ITEM_ALIASES)) {
    seedStock.run(guildId, migratedUser, oldId, 2, 123);
    expectedStock.set(newId, (expectedStock.get(newId) || 0) + 2);
    assert.equal(bag.product(oldId).id, newId);
  }
  for (const id of expectedStock.keys()) {
    seedStock.run(guildId, migratedUser, id, 3, 456);
    expectedStock.set(id, expectedStock.get(id) + 3);
  }
  const migrated = bag.inventory(guildId, migratedUser);
  assert.equal(migrated.length, expectedStock.size);
  for (const entry of migrated) {
    assert.equal(entry.quantity, expectedStock.get(entry.id));
    assert.equal(entry.updatedAt, 456);
  }
  assert.deepEqual(bag.inventory(guildId, migratedUser), migrated);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM hardcore_inventory WHERE guild_id=? AND user_id=?",
      )
      .get(guildId, migratedUser).n,
    expectedStock.size,
  );
  assert.deepEqual(bag.validateLoadout({ itemIds: ["iron_dagger"] }).itemIds, [
    "hunter_bow",
  ]);
  assert.throws(
    () => bag.validateLoadout({ itemIds: ["iron_dagger", "hunter_bow"] }),
    /INVALID_LOADOUT/,
  );
  assert.throws(
    () => bag.validateLoadout({ itemIds: ["iron_dagger", "worn_boots"] }),
    /INVALID_LOADOUT/,
  );
  const beforeTake = expectedStock.get("hunter_bow");
  bag.consume(guildId, migratedUser, { itemIds: ["iron_dagger"] });
  assert.equal(
    bag.inventory(guildId, migratedUser).find((i) => i.id === "hunter_bow")
      .quantity,
    beforeTake - 1,
  );
  bag.grant(guildId, migratedUser, "worn_boots", 1);
  assert.equal(
    bag.inventory(guildId, migratedUser).find((i) => i.id === "hunter_bow")
      .quantity,
    beforeTake,
  );
  // Overflow rolls back the entire migration; neither original row is lost.
  const overflowUser = newUser();
  seedStock.run(
    guildId,
    overflowUser,
    "hunter_bow",
    Number.MAX_SAFE_INTEGER,
    1,
  );
  seedStock.run(guildId, overflowUser, "iron_dagger", 1, 1);
  assert.throws(() => bag.inventory(guildId, overflowUser), /INVALID_QUANTITY/);
  assert.equal(
    db
      .prepare(
        "SELECT quantity FROM hardcore_inventory WHERE guild_id=? AND user_id=? AND item_id=?",
      )
      .get(guildId, overflowUser, "iron_dagger").quantity,
    1,
  );
  // Saved shop aliases collapse to distinct canonical offers, then fill once.
  const oldShopGuild = "old-shop";
  const oldDay = bag.vietnamDay(beforeMidnight);
  db.prepare(
    "INSERT INTO hardcore_shop_rotations(guild_id,day,items_json,created_at) VALUES(?,?,?,?)",
  ).run(
    oldShopGuild,
    oldDay,
    JSON.stringify([
      "iron_dagger",
      "worn_boots",
      "fox_mask",
      "mana_fragment",
      "rusted_edge",
    ]),
    beforeMidnight,
  );
  const canonicalShop = bag.shop(oldShopGuild, beforeMidnight);
  assert.equal(canonicalShop.products.length, 8);
  assert.equal(new Set(canonicalShop.itemIds).size, 5);
  assert(canonicalShop.itemIds.includes("hunter_bow"));
  assert(canonicalShop.itemIds.every((id) => resolveItemId(id) === id));
  assert.deepEqual(
    bag.shop(oldShopGuild, beforeMidnight).itemIds,
    canonicalShop.itemIds,
  );
  economy.creditCoins({
    guildId: oldShopGuild,
    userId: "buyer",
    amount: 100000,
    reason: "test",
  });
  const oldPurchase = {
    guildId: oldShopGuild,
    userId: "buyer",
    itemId: "iron_dagger",
    day: oldDay,
    operationId: "old-offer",
    now: beforeMidnight,
  };
  bag.purchase(oldPurchase);
  assert.equal(bag.purchase(oldPurchase).duplicate, true);
  assert.equal(
    bag.inventory(oldShopGuild, "buyer").find((i) => i.id === "hunter_bow")
      .quantity,
    1,
  );
  // Saved in-run definitions keep their stats; resume cannot replay receipt effects.
  const oldRun = stats.createState("barbarian", 10);
  const oldDefinition = {
    id: "iron_dagger",
    name: "Iron Dagger",
    category: "weapon",
    rarity: "common",
    typeCode: "R",
    catalogVersion: 2,
    effects: { str: 1, dex: 4 },
    text: "+1 STR, +4 DEX",
    curse: null,
  };
  core.receiveItem(oldRun, oldDefinition, 2);
  core.normalize(oldRun);
  const oldSnapshot = JSON.stringify(oldRun);
  for (let i = 0; i < 3; i++) core.normalize(oldRun);
  assert.equal(JSON.stringify(oldRun), oldSnapshot);
  assert.equal(oldRun.str, 32);
  assert.equal(oldRun.dex, 22);
  const canonicalPreview = bag.preview("barbarian", 10, {
    itemIds: ["iron_dagger"],
  });
  assert.equal(canonicalPreview.items[0].definition.id, "hunter_bow");

  if (process.env.HARDCORE_MIGRATION_ONLY === "1") {
    console.log(
      "All 37 aliases: quantities, canonical loadout, consumption, idempotency, overflow rollback, saved rotation/purchase and run snapshots verified.",
    );
    return;
  }
  const today = bag.shop(guildId, beforeMidnight);
  assert.equal(today.products.length, 8);
  assert.equal(new Set(today.itemIds).size, 5);
  assert.deepEqual(bag.shop(guildId, beforeMidnight).itemIds, today.itemIds);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM hardcore_shop_rotations WHERE guild_id=?",
      )
      .get(guildId).n,
    1,
  );
  bag.shop(guildId, midnight);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM hardcore_shop_rotations WHERE guild_id=?",
      )
      .get(guildId).n,
    2,
  );
  for (const item of bag.CATALOG)
    assert.equal(
      bag.product(item.id).price,
      { R: 10000, SR: 50000, SSR: 100000, UR: 200000 }[item.typeCode],
    );
  assert.deepEqual(
    bag.TICKETS.map((item) => item.price),
    [100, 100, 300],
  );
  const buyer = newUser();
  economy.creditCoins({
    guildId,
    userId: buyer,
    amount: 1_000_000,
    reason: "test",
  });
  currency.addDiamonds(guildId, buyer, 1000, { reason: "test" });
  const args = {
    guildId,
    userId: buyer,
    itemId: today.itemIds[0],
    quantity: 2,
    day: today.day,
    operationId: "buy-coins",
    now: beforeMidnight,
  };
  const coinsBefore = economy.getAccount(guildId, buyer).balance;
  const purchase = bag.purchase(args);
  assert.equal(
    economy.getAccount(guildId, buyer).balance,
    coinsBefore - purchase.cost,
  );
  assert.equal(bag.inventory(guildId, buyer)[0].quantity, 2);
  assert.equal(bag.purchase(args).duplicate, true);
  assert.equal(bag.inventory(guildId, buyer)[0].quantity, 2);
  assert.equal(
    economy.getAccount(guildId, buyer).balance,
    coinsBefore - purchase.cost,
  );
  assert.throws(
    () => bag.purchase({ ...args, userId: "other" }),
    /INVALID_PURCHASE_ID/,
  );
  assert.throws(
    () => bag.purchase({ ...args, operationId: "new-day", now: midnight }),
    /SHOP_EXPIRED/,
  );
  assert.throws(
    () => bag.purchase({ ...args, operationId: "quantity", quantity: 0 }),
    /INVALID_QUANTITY/,
  );
  const otherId = bag.CATALOG.find(
    (item) => !today.itemIds.includes(item.id),
  ).id;
  assert.throws(
    () => bag.purchase({ ...args, operationId: "not-listed", itemId: otherId }),
    /NOT_FOR_SALE/,
  );
  for (const ticket of bag.TICKETS)
    bag.purchase({
      ...args,
      quantity: 1,
      operationId: `ticket-${ticket.id}`,
      itemId: ticket.id,
    });
  assert.equal(currency.getPlayerProgression(guildId, buyer).diamonds, 500);
  bag.purchase({
    ...args,
    quantity: 3,
    operationId: "ticket-repeat",
    itemId: "survival_escape",
  });
  assert.equal(
    bag
      .inventory(guildId, buyer, "ticket")
      .find((item) => item.id === "survival_escape").quantity,
    4,
  );
  const poor = newUser();
  assert.throws(
    () => bag.purchase({ ...args, userId: poor, operationId: "poor-coins" }),
    /INSUFFICIENT_FUNDS/,
  );
  assert.throws(
    () =>
      bag.purchase({
        ...args,
        userId: poor,
        operationId: "poor-diamonds",
        itemId: "survival_revive",
      }),
    /INSUFFICIENT_DIAMONDS/,
  );
  assert.deepEqual(bag.inventory(guildId, poor), []);

  const carrier = newUser();
  const selectedItems = ["common", "rare", "legendary", "cursed"]
    .map((rarity) => core.ITEMS[rarity][0].id)
    .concat(core.ITEMS.cursed[1].id);
  const ticketIds = bag.TICKETS.map((ticket) => ticket.id);
  for (const id of [...selectedItems, ...ticketIds])
    bag.grant(guildId, carrier, id, 2);
  assert.deepEqual(
    bag.inventory(guildId, carrier).map((item) => item.typeCode),
    ["UR", "UR", "SSR", "SR", "R", "ticket", "ticket", "ticket"],
  );
  for (const filter of bag.FILTERS)
    assert.ok(
      bag
        .inventory(guildId, carrier, filter)
        .every((item) => filter === "all" || item.typeCode === filter),
    );
  const loadout = { itemIds: selectedItems, ticketIds };
  assert.throws(
    () =>
      bag.validateLoadout({ itemIds: [selectedItems[0], selectedItems[0]] }),
    /INVALID_LOADOUT/,
  );
  assert.throws(
    () =>
      bag.validateLoadout({
        itemIds: bag.CATALOG.slice(0, 6).map((item) => item.id),
      }),
    /INVALID_LOADOUT/,
  );
  assert.throws(
    () => bag.validateLoadout({ ticketIds: [ticketIds[0], ticketIds[0]] }),
    /INVALID_LOADOUT/,
  );
  assert.throws(
    () => bag.validateLoadout({ itemIds: [ticketIds[0]] }),
    /INVALID_LOADOUT/,
  );
  assert.throws(() => start(poor, loadout), /INSUFFICIENT_HARDCORE_ITEMS/);
  assert.equal(economy.getAccount(guildId, poor).balance, 1000);
  assert.equal(repo.getByUser(guildId, poor), null);
  const preview = bag.preview("barbarian", 10, loadout);
  const run = start(carrier, loadout);
  for (const key of [
    "str",
    "dex",
    "vit",
    "ene",
    "hp",
    "maxHp",
    "defense",
    "mana",
    "maxMana",
    "prayerBoost",
    "reviveTickets",
    "escapeTokens",
  ])
    assert.equal(run.state[key], preview[key], key);
  assert.equal(run.state.items.length, 5);
  assert.ok(run.state.items.every((item) => item.level === 1));
  assert.ok(
    bag.inventory(guildId, carrier).every((item) => item.quantity === 1),
  );
  assert.throws(() => start(carrier, loadout), /ACTIVE_SESSION/);
  assert.ok(
    bag.inventory(guildId, carrier).every((item) => item.quantity === 1),
  );
  save(run, (state) => {
    state.encounter = {
      type: "rngesus",
      name: "RNGesus",
      prayerChance: 0.6,
      prayerSuccess: false,
      prayerItem: core.ITEMS.cursed[0],
      fleeSuccess: false,
      fleeChance: 0.75,
    };
    state.floor = 6;
  });
  const revived = play(run, "pray");
  assert.equal(revived.settled, false);
  assert.equal(revived.state.floor, 7);
  assert.equal(revived.state.reviveTickets, 0);
  assert.equal(revived.state.hp, Math.ceil(revived.state.maxHp * 0.5));
  assert.equal(revived.state.prayerBoost, true);
  assert.equal(service.getHardcoreRecord(guildId, carrier).deaths, 0);
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: carrier,
        expectedTurn: 0,
        action: "pray",
      }),
    /STALE_ACTION/,
  );
  save(run, (state) => {
    state.encounter = { type: "empty", name: "Empty" };
  });
  assert.equal(play(run, "retreat").settled, true);
  assert.ok(
    bag.inventory(guildId, carrier).every((item) => item.quantity === 1),
  );

  const fatalUser = newUser();
  bag.grant(guildId, fatalUser, selectedItems[0], 1);
  const fatal = start(
    fatalUser,
    { itemIds: [selectedItems[0]] },
    { type: "rngesus", name: "RNGesus" },
  );
  assert.equal(play(fatal, "fight").settled, true);
  assert.equal(bag.inventory(guildId, fatalUser).length, 0);
  const refundUser = newUser();
  bag.grant(guildId, refundUser, selectedItems[0], 1);
  bag.grant(guildId, refundUser, "survival_revive", 1);
  const refund = start(refundUser, {
    itemIds: [selectedItems[0]],
    ticketIds: ["survival_revive"],
  });
  service.forceEndHardcoreSession(refund.session.id, guildId, refundUser, {
    label: "setup-ui-failed",
  });
  assert.equal(economy.getAccount(guildId, refundUser).balance, 1000);
  assert.ok(
    bag.inventory(guildId, refundUser).every((item) => item.quantity === 1),
  );
  assert.equal(bag.inventory(guildId, refundUser).length, 2);
  assert.equal(
    service.forceEndHardcoreSession(refund.session.id, guildId, refundUser, {
      label: "setup-ui-failed",
    }),
    null,
  );

  // Prayer boost is sampled for each new encounter and persisted through normalization.
  for (const boosted of [false, true]) {
    const state = stats.createState("barbarian", 10);
    state.floor = 6;
    state.prayerBoost = boosted;
    for (let i = 0; i < 3; i++) {
      const values = [0.5, 0.5, 0, 0.5, 0.45, 0.5];
      const encounter = core.generateEncounter(
        state,
        { guild_id: guildId, user_id: newUser(), id: "prayer" },
        () => values.shift() ?? 0.5,
      );
      assert.equal(encounter.type, "rngesus");
      assert.equal(encounter.prayerSuccess, boosted);
      assert.equal(encounter.prayerChance, boosted ? 0.6 : 0.3);
      state.encounter = encounter;
      core.normalize(state);
      assert.equal(state.prayerBoost, boosted);
      assert.ok(
        core
          .actions(state)
          .find((option) => option.action === "pray")
          .label.includes(boosted ? "60%" : "30%"),
      );
    }
  }

  const rescued = start();
  save(rescued, (state) => {
    state.floor = 6;
    state.reviveTickets = 1;
    state.encounter = core.makeSurprise(state, () => 0.5, "adventurer");
  });
  const rescuedResult = play(rescued, "event_rescue");
  assert.equal(rescuedResult.state.adventurerRescue.until, 99);
  assert.equal(rescuedResult.state.debts.length, 0);
  save(rescued, (state) => {
    state.encounter = { type: "rngesus", name: "RNGesus" };
  });
  const adventurerRevival = play(rescued, "fight");
  assert.equal(adventurerRevival.settled, false);
  assert.equal(adventurerRevival.state.floor, 8);
  assert.equal(adventurerRevival.state.reviveTickets, 1);
  assert.equal(adventurerRevival.state.adventurerRescue, undefined);
  save(rescued, (state) => {
    state.encounter = { type: "rngesus", name: "RNGesus" };
  });
  assert.equal(play(rescued, "fight").state.reviveTickets, 0);
  save(rescued, (state) => {
    state.encounter = { type: "rngesus", name: "RNGesus" };
  });
  assert.equal(play(rescued, "fight").settled, true);
  const session = { id: "pure", guild_id: guildId, user_id: "pure" };
  for (const rank of [
    "normal",
    "elite",
    "boss",
    "final_boss",
    "mimic",
    "ancient_mimic",
  ]) {
    const state = stats.createState("barbarian", 10);
    state.floor = rank === "final_boss" ? 999 : 9;
    state.adventurerRescue = {
      from: rank === "final_boss" ? 900 : 1,
      until: rank === "final_boss" ? 999 : 99,
    };
    state.reviveTickets = 1;
    state.encounter = world.makeEnemy(state, rank, "Fatal", () => 0.5);
    state.encounter.damageMin = state.encounter.damageMax = 100000;
    state.encounter.accuracy = 1000;
    const enemy = state.encounter,
      hp = enemy.hp;
    const reason = core.act(state, session, "defend", () => 0.5);
    assert.equal(reason, "death");
    assert.equal(
      core.reviveAfterDeath(state, session, () => 0.5, reason),
      true,
    );
    assert.equal(state.hp, Math.ceil(state.maxHp * 0.5));
    assert.equal(state.encounter, enemy);
    assert.equal(enemy.hp, hp);
    assert.equal(state.floor, rank === "final_boss" ? 999 : 9);
    assert.equal(state.reviveTickets, 1);
    assert.equal(state.adventurerRescue, undefined);
  }
  const expired = stats.createState("barbarian", 10);
  expired.floor = 100;
  expired.encounter = { type: "rngesus" };
  expired.adventurerRescue = { from: 1, until: 99 };
  core.normalize(expired);
  assert.equal(expired.adventurerRescue, undefined);
  assert.equal(
    core.reviveAfterDeath(expired, session, () => 0.5, "rngesus"),
    false,
  );
  const boundary = stats.createState("barbarian", 10);
  boundary.floor = 99;
  boundary.encounter = { type: "empty" };
  boundary.adventurerRescue = { from: 1, until: 99 };
  core.completeFloor(boundary, session, () => 0.5, 0);
  assert.equal(boundary.adventurerRescue, undefined);
  const robber = stats.createState("barbarian", 10);
  robber.floor = 6;
  robber.encounter = core.makeSurprise(robber, () => 0.5, "adventurer");
  core.act(robber, session, "event_rob", () => 0.5);
  assert.equal(robber.adventurerRescue, undefined);
  assert.equal(robber.debts.length, 1);

  // Robbing gives SSR/UR and exclusively harmful delayed consequences.
  for (const [roll, rarity] of [
    [0.249999, "cursed"],
    [0.25, "legendary"],
    [0.999999, "legendary"],
  ]) {
    const state = stats.createState("barbarian", 10);
    state.floor = 6;
    const values = [0.5, 0.5, 0.5, 0.5, roll, 0.5];
    const event = core.makeSurprise(
      state,
      () => values.shift() ?? 0.5,
      "adventurer",
    );
    assert.equal(event.robItem.rarity, rarity);
    state.encounter = event;
    core.act(state, session, "event_rob", () => 0.5);
    assert.equal(state.items[0].rarity, rarity);
    assert.equal(state.debts[0].good, false);
  }
  for (const [kindRoll, kind] of [
    [0, "tax"],
    [0.499999, "tax"],
    [0.5, "hunter"],
    [0.999999, "hunter"],
  ]) {
    const state = stats.createState("barbarian", 10);
    state.floor = 6;
    const values = [0.5, 0, kindRoll, 0.5, 0.5];
    core.remember(state, "event_rob", () => values.shift() ?? 0.5);
    assert.equal(state.debts[0].good, false);
    assert.equal(state.debts[0].kind, kind);
    assert.ok(state.debts[0].due >= 16 && state.debts[0].due <= 36);
    state.floor = state.debts[0].due;
    state.cleared = state.floor - 1;
    // A sequence that misses RNGesus and then resolves the already locked debt.
    const encounterRolls = [0.5, 0.5, 0.99];
    state.encounter = core.generateEncounter(
      state,
      session,
      () => encounterRolls.shift() ?? 0.5,
    );
    assert.equal(state.encounter.type, "memory");
    state.hp = Math.floor(state.maxHp * 0.5);
    const factor = state.eventPayoutFactor,
      bonus = state.bonus,
      floor = state.floor;
    core.act(state, session, "next", () => 0.5);
    assert.equal(state.bonus, bonus);
    if (kind === "tax") {
      assert.equal(state.eventPayoutFactor, factor * 0.9);
      assert.equal(state.floor, floor + 1);
    } else {
      assert.equal(state.encounter.type, "combat");
      assert.equal(state.encounter.rank, "elite");
      assert.equal(state.encounter.name, "Bounty Hunter");
      assert.equal(state.floor, floor);
    }
  }
  const savedRob = stats.createState("barbarian", 10);
  savedRob.floor = 6;
  savedRob.encounter = {
    type: "surprise",
    kind: "adventurer",
    robItem: structuredClone(core.ITEMS.common[0]),
  };
  savedRob.debts = [
    { action: "event_rob", good: true, kind: "tax", due: 20 },
    { action: "pray_rngesus", good: true, kind: "tax", due: 21 },
  ];
  core.normalize(savedRob);
  assert.equal(savedRob.encounter.robItem.rarity, "legendary");
  const fixedItem = savedRob.encounter.robItem.id;
  core.normalize(savedRob);
  assert.equal(savedRob.encounter.robItem.id, fixedItem);
  assert.equal(savedRob.debts[0].good, false);
  assert.equal(savedRob.debts[0].kind, "tax");
  assert.equal(savedRob.debts[0].due, 20);
  assert.equal(savedRob.debts[1].good, true);
  savedRob.encounter = {
    type: "memory",
    debt: { action: "event_rob", good: true, kind: "hunter", due: 6 },
  };
  core.normalize(savedRob);
  assert.equal(savedRob.encounter.debt.good, false);
  const normalMemory = stats.createState("barbarian", 10);
  core.remember(normalMemory, "pray_rngesus", () => 0);
  assert.equal(normalMemory.debts[0].good, true);
  const v2View = require("../src/services/hardcoreV2View");
  assert.ok(v2View.encounterText(robber).length > 0);
  const adventurerPreview = stats.createState("barbarian", 10);
  adventurerPreview.floor = 6;
  adventurerPreview.encounter = core.makeSurprise(
    adventurerPreview,
    () => 0.5,
    "adventurer",
  );
  const adventurerText = v2View.encounterText(adventurerPreview);
  assert.ok(adventurerText.includes("[SSR]"));
  assert.ok(adventurerText.includes("Rift"));
  assert.ok(require("../src/hardcore/towerMemories").fields(adventurerPreview).some((field) => field.value.includes("50% bị thu 10% payout")));
  assert.ok(
    core
      .actions(adventurerPreview)
      .find((option) => option.action === "event_rob")
      .label.includes("SSR/UR"),
  );
  for (const field of v2View.ratesFields("encounters"))
    assert.ok(field.value.length <= 1024);

  // Special Mimics are Elites: damage bonuses apply while their locked stats and loot stay intact.
  for (const kind of ["ancient_mimic", "blood_mimic"]) {
    const state = stats.createState("barbarian", 10000);
    state.floor = 9;
    state.cleared = 8;
    const enemy =
      kind === "ancient_mimic"
        ? core.makeChest(state, () => 0.01).mimic
        : core.makeSurprise(state, () => 0.5, "fountain").enemy;
    assert.equal(enemy.rank, "elite");
    assert.equal(enemy.mimicKind, kind);
    assert.equal(enemy.rewardMultiplier, 2);
    state.encounter = enemy;
    const battle = v2View.embed(state, "user").toJSON();
    assert.ok(
      battle.fields
        .find((field) => field.name.includes("Đối thủ"))
        .value.includes("Tinh anh"),
    );
    // Test real physical and magical damage, with and without a Paradox.
    for (const classKey of ["barbarian", "sorceress"])
      for (const active of [false, true]) {
        const baseline = stats.createState(classKey, 10000);
        baseline.floor = 9;
        baseline.encounter = structuredClone(enemy);
        baseline.encounter.hp = baseline.encounter.maxHp = 10000;
        if (active)
          baseline.activeParadox = {
            version: 2,
            id: "mana_fracture",
            startFloor: 1,
            endFloor: 10,
            milestone: 0,
            combatActionCount: 0,
            attackActionCount: 0,
          };
        const boosted = structuredClone(baseline);
        boosted.eliteDamage = 0.5;
        assert.ok(
          core.skillDamagePreview(boosted).low >
            core.skillDamagePreview(baseline).low,
        );
        const before = baseline.encounter.hp;
        core.playerAttack(baseline, "skill", () => 0.5);
        core.playerAttack(boosted, "skill", () => 0.5);
        assert.ok(
          before - boosted.encounter.hp > before - baseline.encounter.hp,
        );
      }
    // Migrate both an ongoing fight and pending event enemies without changing locked combat data.
    for (const placement of ["combat", "chest", "fountain"]) {
      const saved = stats.createState("barbarian", 10000);
      saved.floor = 9;
      const legacy = structuredClone(enemy);
      legacy.rank = kind === "ancient_mimic" ? "ancient_mimic" : "mimic";
      legacy.rewardMultiplier = 3;
      delete legacy.mimicKind;
      legacy.hp -= 7;
      const combatData = [
        legacy.hp,
        legacy.maxHp,
        legacy.damageMin,
        legacy.damageMax,
        legacy.nextDamageType,
      ];
      saved.encounter =
        placement === "combat"
          ? legacy
          : placement === "chest"
            ? { type: "chest", kind, roll: 0.17, mimic: legacy }
            : { type: "surprise", kind: "fountain", roll: 0.91, enemy: legacy };
      core.normalize(saved);
      assert.equal(legacy.rank, "elite");
      assert.equal(legacy.mimicKind, kind);
      assert.deepEqual(
        [
          legacy.hp,
          legacy.maxHp,
          legacy.damageMin,
          legacy.damageMax,
          legacy.nextDamageType,
        ],
        combatData,
      );
      const once = JSON.stringify(saved);
      core.normalize(saved);
      assert.equal(JSON.stringify(saved), once);
    }
    // Verify all reward branches after an actual kill, without touching chest pity.
    for (const [roll, rarity] of kind === "ancient_mimic"
      ? [
          [0.49, "rare"],
          [0.5, "legendary"],
          [0.8, "cursed"],
        ]
      : [
          [0.59, "rare"],
          [0.6, "legendary"],
        ]) {
      const won = stats.createState("barbarian", 10000);
      Object.assign(won, {
        floor: 9,
        cleared: 8,
        pityRare: 2,
        pityLegendary: 3,
      });
      won.encounter = structuredClone(enemy);
      won.encounter.hp = 1;
      const rolls = [0.5, 0.5, 0.5, roll];
      core.act(won, session, "attack", () => rolls.shift() ?? 0.5);
      assert.equal(won.items.length, 1);
      assert.equal(won.items[0].rarity, rarity);
      assert.equal(won.pityRare, 2);
      assert.equal(won.pityLegendary, 3);
    }
  }
  const ordinaryMimic = world.makeEnemy(
    stats.createState("barbarian", 10),
    "mimic",
    "Mimic",
    () => 0.5,
  );
  assert.equal(ordinaryMimic.rank, "mimic");
  assert.equal(world.mimicKind(ordinaryMimic), null);

  serialize(ui.shopPayload(guildId, carrier));
  for (const filter of bag.FILTERS)
    serialize(ui.inventoryPayload(guildId, carrier, filter, 10));
  const draft = {
    id: "draft",
    version: 0,
    guildId,
    userId: carrier,
    classKey: "barbarian",
    stake: 10,
    ...loadout,
    stage: "loadout",
    itemFilter: "all",
    itemPage: 0,
  };
  serialize(ui.setupPayload(draft, { balance: 1000, maxBet: 100000 }));
  serialize(
    ui.setupPayload(
      { ...draft, stage: "review" },
      { balance: 1000, maxBet: 100000 },
    ),
  );
  serialize(
    ui.setupPayload(
      { ...draft, userId: poor, itemIds: [], ticketIds: [] },
      { balance: 1000, maxBet: 100000 },
    ),
  );
  for (const item of bag.CATALOG) bag.grant(guildId, "whole-pool", item.id, 1);
  const many = { ...draft, userId: "whole-pool", itemIds: [] };
  const expectedPages = Math.ceil(bag.CATALOG.length / 20);
  assert.equal(ui.loadoutPage(many).pages, expectedPages);
  for (let page = 0; page < expectedPages; page++)
    serialize(
      ui.setupPayload(
        { ...many, itemPage: page },
        { balance: 1000, maxBet: 100000 },
      ),
    );

  // Exercise real setup interactions, including stale clicks and publication rollback.
  setGameChannel(guildId, "hardcore", "c");
  const setupUser = newUser();
  for (const id of bag.CATALOG.map((item) => item.id))
    bag.grant(guildId, setupUser, id, 1);
  for (const id of ticketIds) bag.grant(guildId, setupUser, id, 1);
  let payload,
    published = 0;
  const interaction = (customId, values = []) => ({
    guildId,
    channelId: "c",
    user: { id: setupUser, username: "Test" },
    message: { id: "setup-message" },
    customId,
    values,
    channel: {
      send: async (value) => {
        serialize(value);
        published++;
        return { id: "public", url: "https://discord.com/test" };
      },
    },
    reply: async (value) => {
      payload = value;
      return { resource: { message: { id: "setup-message" } } };
    },
    editReply: async (value) => {
      payload = value;
      serialize(value);
    },
    deferUpdate: async () => {},
    update: async (value) => {
      payload = value;
    },
    followUp: async () => {},
  });
  const setup = await service.openHardcoreSetup(interaction(), {
    classKey: "barbarian",
    stake: 10,
  });
  let setupJson = serialize(payload);
  assert.ok(
    setupJson.components[1].components.some(
      (component) => component.label === "Tiếp",
    ),
  );
  const click = (action, values) =>
    service.handleHardcoreSetup(
      interaction(
        `hardcore-setup:${setup.id}:${setup.version}:${action}`,
        values,
      ),
    );
  await click("start");
  assert.equal(setup.stage, "class");
  assert.equal(published, 0);
  await click("next");
  assert.equal(setup.stage, "loadout");
  await click(
    "items",
    ui
      .loadoutPage(setup)
      .items.slice(0, 5)
      .map((item) => item.id),
  );
  assert.equal(setup.itemIds.length, 5);
  await click("items_next");
  const selected = setup.itemIds.slice();
  await click("items", [ui.loadoutPage(setup).items[0].id]);
  assert.deepEqual(setup.itemIds, selected);
  await click("tickets", ticketIds);
  assert.deepEqual(setup.ticketIds, ticketIds);
  await click("review");
  assert.equal(setup.stage, "review");
  const expected = bag.preview(setup.classKey, setup.stake, setup);
  assert.ok(
    JSON.stringify(serialize(payload).embeds).includes(String(expected.maxHp)),
  );
  assert.equal(economy.getAccount(guildId, setupUser).balance, 1000);
  await service.handleHardcoreSetup(
    interaction(`hardcore-setup:${setup.id}:0:start`),
  );
  assert.equal(published, 0);
  await click("start");
  assert.equal(published, 1);
  assert.equal(economy.getAccount(guildId, setupUser).balance, 990);
  for (const id of [...selected, ...ticketIds])
    assert.ok(
      !bag.inventory(guildId, setupUser).some((item) => item.id === id),
    );
  assert.equal(
    service.getHardcoreRun(guildId, setupUser).state.maxHp,
    expected.maxHp,
  );

  // New routes, slash aliases and owner protection.
  const schema =
    require("../src/commands/choi").standaloneCommands.sinhton.data.toJSON();
  for (const name of ["cuahang", "tuido"])
    assert.ok(schema.options.some((option) => option.name === name));
  const wrongOwner = {
    ...interaction(`hardcore-store:another:_:refresh`),
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
  };
  assert.equal(await routeComponentInteraction(wrongOwner), true);
  assert.ok(payload.content.includes("người chơi khác"));
  const storeSelect = {
    ...interaction(`hardcore-store:${setupUser}:${bag.vietnamDay()}:buy`, [
      bag.shop(guildId).products[0].id,
    ]),
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    showModal: async (modal) => {
      assert.ok(modal.toJSON().custom_id.includes(":purchase:"));
    },
  };
  assert.equal(await routeComponentInteraction(storeSelect), true);
  // A failed first publication restores the loadout; normal cancellation never spends it.
  const canceledUser = newUser();
  bag.grant(guildId, canceledUser, selectedItems[0], 1);
  const canceledInteraction = (customId) => ({
    ...interaction(customId),
    user: { id: canceledUser, username: "Canceled" },
  });
  const canceled = await service.openHardcoreSetup(canceledInteraction(), {
    classKey: "barbarian",
    stake: 10,
  });
  await service.handleHardcoreSetup(
    canceledInteraction(
      `hardcore-setup:${canceled.id}:${canceled.version}:cancel`,
    ),
  );
  assert.equal(economy.getAccount(guildId, canceledUser).balance, 1000);
  assert.equal(bag.inventory(guildId, canceledUser)[0].quantity, 1);
  const failedUser = newUser();
  bag.grant(guildId, failedUser, selectedItems[0], 1);
  bag.grant(guildId, failedUser, "survival_revive", 1);
  const failedInteraction = (customId, values) => ({
    ...interaction(customId, values),
    user: { id: failedUser, username: "Failed" },
    channel: {
      send: async () => {
        throw new Error("Missing permissions");
      },
    },
  });
  const failed = await service.openHardcoreSetup(failedInteraction(), {
    classKey: "barbarian",
    stake: 10,
  });
  const failedClick = (action, values) =>
    service.handleHardcoreSetup(
      failedInteraction(
        `hardcore-setup:${failed.id}:${failed.version}:${action}`,
        values,
      ),
      { warn: () => {} },
    );
  await failedClick("next");
  await failedClick("items", [selectedItems[0]]);
  await failedClick("tickets", ["survival_revive"]);
  await failedClick("review");
  await failedClick("start");
  assert.equal(repo.getByUser(guildId, failedUser), null);
  assert.equal(economy.getAccount(guildId, failedUser).balance, 1000);
  assert.equal(bag.inventory(guildId, failedUser).length, 2);
  assert.ok(
    bag.inventory(guildId, failedUser).every((item) => item.quantity === 1),
  );
  await failedClick("cancel");

  const storeBuyer = newUser();
  currency.addDiamonds(guildId, storeBuyer, 1000, { reason: "test" });
  const storeModal = {
    ...interaction(
      `hardcore-store:${storeBuyer}:${bag.vietnamDay()}:purchase:survival_prayer`,
    ),
    id: "modal-purchase",
    user: { id: storeBuyer },
    fields: { getTextInputValue: () => "2" },
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
  };
  assert.equal(await routeComponentInteraction(storeModal), true);
  assert.equal(
    currency.getPlayerProgression(guildId, storeBuyer).diamonds,
    800,
  );
  assert.equal(bag.inventory(guildId, storeBuyer, "ticket")[0].quantity, 2);
  await routeComponentInteraction(storeModal);
  assert.equal(
    currency.getPlayerProgression(guildId, storeBuyer).diamonds,
    800,
  );
  assert.equal(bag.inventory(guildId, storeBuyer, "ticket")[0].quantity, 2);
  for (const subcommand of ["cuahang", "tuido"]) {
    await require("../src/commands/hardcore").execute({
      ...interaction(),
      options: { getSubcommand: () => subcommand },
    });
    serialize(payload);
    const { handleGamePrefix } = require("../src/services/gamePrefixService");
    assert.equal(
      await handleGamePrefix({
        guildId,
        channelId: "c",
        content: `!sinhton ${subcommand}`,
        author: { id: setupUser, bot: false },
        reply: async (value) => {
          serialize(value);
          return { id: "prefix-message" };
        },
      }),
      true,
    );
  }
  // A flee ticket is consumed only on failure; revival is independent of it.
  const fleeUser = newUser();
  bag.grant(guildId, fleeUser, "survival_escape", 1);
  const fled = start(
    fleeUser,
    { ticketIds: ["survival_escape"] },
    { type: "rngesus", name: "RNGesus", fleeChance: 1, fleeSuccess: true },
  );
  assert.equal(play(fled, "flee").state.escapeTokens, 1);
  save(fled, (state) => {
    state.encounter = {
      type: "rngesus",
      name: "RNGesus",
      fleeChance: 0.95,
      fleeSuccess: false,
    };
  });
  assert.equal(play(fled, "flee").state.escapeTokens, 0);
  save(fled, (state) => {
    state.encounter = {
      type: "rngesus",
      name: "RNGesus",
      fleeChance: 0.9,
      fleeSuccess: false,
    };
  });
  assert.equal(play(fled, "flee").settled, true);
  // Region protection does not rescue a lethal non-combat event; a revive ticket does.
  const eventDeath = stats.createState("barbarian", 10);
  eventDeath.floor = 6;
  eventDeath.encounter = { type: "surprise", kind: "goblin", name: "Event" };
  eventDeath.adventurerRescue = { from: 1, until: 99 };
  eventDeath.hp = 0;
  assert.equal(
    core.reviveAfterDeath(eventDeath, session, () => 0.5, "death"),
    false,
  );
  eventDeath.reviveTickets = 1;
  assert.equal(
    core.reviveAfterDeath(eventDeath, session, () => 0.5, "death"),
    true,
  );
  assert.equal(eventDeath.floor, 7);
  assert.equal(eventDeath.reviveTickets, 0);
  assert.equal(eventDeath.adventurerRescue.until, 99);

  console.log("Hardcore shop/loadout/resurrection tests passed.");
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
    const target = path.resolve(directory),
      base = path.resolve(os.tmpdir());
    if (
      path.dirname(target) !== base ||
      !path.basename(target).startsWith("hardcore-loadout-")
    )
      throw new Error("Unsafe test cleanup");
    fs.rmSync(target, { recursive: true, force: true });
  });
