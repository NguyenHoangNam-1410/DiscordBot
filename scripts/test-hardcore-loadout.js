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
  assert.equal(ui.loadoutPage(many).pages, 5);
  for (let page = 0; page < 5; page++)
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
