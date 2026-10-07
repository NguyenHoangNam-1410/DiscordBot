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
const world = require("../src/services/hardcoreWorld");
const view = require("../src/services/hardcoreV2View");
const bag = require("../src/services/hardcoreInventoryService");
const ui = require("../src/services/hardcoreInventoryView");
const levels = require("../src/services/playerLevelService");
const escape = core.CONSUMABLE_ITEMS.survival_escape;
const revive = core.CONSUMABLE_ITEMS.survival_revive;
const session = {
  id: "ticket-rarity",
  guild_id: "ticket-rarity",
  user_id: "player",
  channel_id: "c",
};
const groups = [];
const rng = () => 0.5;
function fresh(floor = 6) {
  const s = stats.createState("barbarian", 10000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    encounter: { type: "empty", name: "Trống" },
    lastReceivedItems: [],
  });
  return s;
}
function sequence(values) {
  return () => (values.length ? values.shift() : 0.5);
}
function text(s) {
  const embed = view.embed(s, "player").toJSON();
  assert.ok(embed.fields.every((f) => f.value.length <= 1024));
  assert.ok(!JSON.stringify(embed).includes("undefined"));
  return embed.fields.find((f) => f.name.includes("Lượt vừa rồi")).value;
}
try {
  assert.equal(escape.typeCode, "UR");
  assert.equal(revive.typeCode, "LR");
  assert.equal(escape.category, "consumable");
  assert.equal(revive.category, "consumable");
  assert.equal(revive.randomEligible, false);
  assert.equal(revive.gachaEligible, false);
  assert.equal(Object.values(core.ITEMS).flat().length, 63);
  assert.equal(core.ITEM_POOLS.cursed.length, 17);
  assert.ok(core.ITEM_POOLS.cursed.some((item) => item.id === escape.id));
  assert.ok(
    Object.values(core.ITEM_POOLS)
      .flat()
      .every((item) => item.id !== revive.id && item.typeCode !== "LR"),
  );
  groups.push(
    "UR ticket in run pool; LR excluded; equipment catalog preserved",
  );

  const relics = Object.values(core.RELIC_ITEMS);
  assert.equal(relics.length, 6);
  assert.equal(core.RELIC_RULES.maxActivePerRun, 1);
  assert.equal(core.RELIC_RULES.canSwitchDuringRun, false);
  assert.equal(core.RELIC_RULES.consumesRevivalTicketSlot, false);
  const ordinaryIds = new Set([
    ...Object.values(core.ITEMS)
      .flat()
      .map((item) => item.id),
    ...Object.keys(core.CONSUMABLE_ITEMS),
  ]);
  assert.equal(new Set(relics.map((item) => item.id)).size, relics.length);
  const gachaDefinitions = require("../src/services/itemCatalogService");
  const relicRollPool = Object.values(core.ITEM_POOLS).flat();
  for (const relic of relics) {
    assert.equal(relic.typeCode, "LR");
    assert.equal(relic.rarity, "limited");
    assert.equal(relic.category, "relic");
    assert.deepEqual(
      relic.acquisition,
      relic.id === "fatebreaker_seal"
        ? { kind: "god_rngesus", method: "blessing" }
        : null,
    );
    assert.equal(relic.runtimeEnabled, relic.id === "fatebreaker_seal");
    assert.equal(relic.passive, null);
    assert.equal(relic.curse, null);
    assert.deepEqual(relic.effects, {});
    for (const flag of [
      "levelable",
      "randomEligible",
      "gachaEligible",
      "shopEligible",
      "loadoutEligible",
    ])
      assert.equal(relic[flag], false);
    assert.ok(!ordinaryIds.has(relic.id));
    assert.ok(!relicRollPool.some((item) => item.id === relic.id));
    assert.equal(bag.product(relic.id), null);
    assert.ok(
      !gachaDefinitions.listCatalog().some((item) => item.id === relic.id),
    );
    assert.ok(Object.isFrozen(relic));
    assert.ok(Object.isFrozen(relic.relicPassive));
    assert.ok(
      Object.isFrozen(
        relic.relicPassive.thresholds ||
          relic.relicPassive.damageTypes ||
          relic.effects,
      ),
    );
  }
  const relicShop = bag.shop("lr-catalog", Date.UTC(2026, 9, 7));
  assert.ok(relicShop.itemIds.every((id) => !core.RELIC_ITEMS[id]));
  assert.equal(bag.product(revive.id).price, 300);
  groups.push(
    "six LR relic designs isolated from all reward/shop/loadout pools; revival ticket unchanged",
  );

  const s = fresh(),
    before = stats.derive(s);
  const first = core.receiveItem(s, escape);
  assert.equal(first.consumable, true);
  assert.equal(s.escapeTokens, 1);
  assert.equal(s.items.length, 0);
  assert.equal(s.lastReceivedItems[0].quantity, 1);
  assert.equal(s.lastReceivedItems[0].level, undefined);
  assert.deepEqual(stats.derive(s), before);
  core.receiveItem(s, escape, 2);
  assert.equal(s.escapeTokens, 1);
  assert.equal(s.items.length, 0);
  assert.equal(s.lastReceivedItems[1].quantity, 0);
  assert.equal(s.lastReceivedItems[1].discarded, 2);
  const saved = JSON.parse(JSON.stringify(s));
  core.normalize(saved);
  assert.equal(saved.escapeTokens, 1);
  assert.equal(saved.items.length, 0);
  assert.ok(text(saved).includes("[UR]"));
  assert.ok(text(saved).includes("Vật phẩm"));
  assert.ok(!text(saved).includes("Lv."));
  assert.ok(text(saved).includes("vé dư"));
  groups.push("one-off receipt, no level/curse/gear, cap and persistence");

  saved.encounter = {
    type: "rngesus",
    name: "RNGesus",
    fleeChance: 0.95,
    fleeSuccess: false,
  };
  const hp = saved.hp,
    cleared = saved.cleared;
  core.act(saved, session, "flee", rng);
  assert.equal(saved.escapeTokens, 0);
  assert.ok(saved.hp > 0);
  assert.equal(saved.hp, hp);
  assert.equal(saved.cleared, cleared + 1);
  groups.push("dropped ticket rescues failed RNGesus flee");

  const chest = fresh();
  chest.encounter = core.makeChest(
    chest,
    sequence([0.99, core.legendaryChance(chest) + 0.01, 0.999]),
  );
  assert.equal(chest.encounter.item.id, escape.id);
  const locked = JSON.parse(JSON.stringify(chest));
  core.normalize(locked);
  assert.equal(locked.encounter.item.id, escape.id);
  core.act(locked, session, "open", rng);
  assert.equal(locked.escapeTokens, 1);
  assert.equal(locked.items.length, 0);
  assert.ok(text(locked).includes("[UR]"));
  groups.push(
    "actual UR chest roll and saved chest cannot reroll or equip ticket",
  );

  const boss = fresh(50);
  boss.encounter = world.makeEnemy(boss, "boss", "Ticket drop boss", rng);
  Object.assign(boss.encounter, {
    hp: 1,
    maxHp: 1,
    defense: 0,
    evasion: 0,
    mechanic: null,
    combatTurn: 1,
  });
  const enemy = boss.encounter;
  const afterKill = sequence([0, 0.99, 0.999]);
  core.act(boss, session, "attack", () => (enemy.hp > 0 ? 0.5 : afterKill()));
  assert.equal(boss.escapeTokens, 1);
  assert.equal(boss.items.length, 0);
  assert.ok(boss.lastReceivedItems.some((r) => r.definition.id === escape.id));
  groups.push("actual boss LUCK drop selects UR consumable");

  const bossChest = fresh(101);
  Object.assign(bossChest, {
    cleared: 100,
    phase: "boss_chest",
    encounter: {
      type: "boss_chest",
      name: "Rương boss",
      bossFloor: 100,
      item: escape,
    },
  });
  core.act(bossChest, session, "boss_open", rng);
  assert.equal(bossChest.escapeTokens, 1);
  assert.equal(bossChest.items.length, 0);
  const shop = fresh();
  shop.encounter = {
    type: "surprise",
    kind: "blood_shop",
    name: "Blood Shop",
    offers: [{ item: escape, price: 1 }],
  };
  core.act(shop, session, "buy_0", rng);
  assert.equal(shop.escapeTokens, 1);
  assert.ok(!shop.lastLog.includes("Lv.undefined"));
  assert.ok(!text(shop).includes("Lv."));
  const prayer = fresh();
  prayer.encounter = {
    type: "rngesus",
    name: "RNGesus",
    prayerSuccess: true,
    prayerItem: escape,
  };
  core.normalize(prayer);
  core.act(prayer, session, "pray", rng);
  assert.equal(prayer.escapeTokens, 1);
  assert.equal(prayer.items.length, 0);
  assert.ok(!prayer.lastLog.includes("kèm lời nguyền"));
  groups.push("boss chest, item shop and prayer support consumable rewards");

  const today = bag.shop(session.guild_id);
  const tickets = today.products.filter((item) => item.typeCode === "ticket");
  assert.deepEqual(
    tickets.map((item) => item.price),
    [100, 100, 300],
  );
  assert.equal(today.products.length, 8);
  assert.equal(bag.product(escape.id).rarity, "UR");
  assert.equal(bag.product(revive.id).rarity, "LR");
  assert.ok(today.itemIds.every((id) => !core.CONSUMABLE_ITEMS[id]));
  levels.addDiamonds(session.guild_id, session.user_id, 1000, {
    reason: "test",
  });
  const args = {
    guildId: session.guild_id,
    userId: session.user_id,
    itemId: revive.id,
    quantity: 2,
    day: today.day,
    operationId: "buy-lr",
  };
  bag.purchase(args);
  assert.equal(bag.purchase(args).duplicate, true);
  assert.equal(
    levels.getPlayerProgression(session.guild_id, session.user_id).diamonds,
    400,
  );
  bag.grant(session.guild_id, session.user_id, escape.id, 2);
  bag.grant(session.guild_id, session.user_id, core.ITEMS.cursed[0].id, 1);
  assert.equal(
    bag.inventory(session.guild_id, session.user_id, "LR")[0].quantity,
    2,
  );
  assert.ok(
    bag
      .inventory(session.guild_id, session.user_id, "UR")
      .some((item) => item.id === escape.id),
  );
  assert.equal(
    bag.inventory(session.guild_id, session.user_id, "ticket").length,
    2,
  );
  assert.equal(
    bag.inventory(session.guild_id, session.user_id)[0].rarity,
    "LR",
  );
  const loadout = { itemIds: [], ticketIds: [revive.id, escape.id] };
  bag.consume(session.guild_id, session.user_id, loadout);
  const equipped = bag.applyLoadout(fresh(), loadout);
  assert.equal(equipped.escapeTokens, 1);
  assert.equal(equipped.reviveTickets, 1);
  assert.equal(equipped.items.length, 0);
  assert.equal(
    bag.inventory(session.guild_id, session.user_id, "LR")[0].quantity,
    1,
  );
  assert.throws(
    () => bag.validateLoadout({ itemIds: [revive.id] }),
    /INVALID_LOADOUT/,
  );
  for (const payload of [
    ui.shopPayload(session.guild_id, session.user_id),
    ui.inventoryPayload(session.guild_id, session.user_id, "LR"),
  ]) {
    const data = JSON.stringify(payload);
    assert.ok(data.includes("[LR]"));
    assert.ok(!data.includes("undefined"));
  }
  assert.equal(
    ui.loadoutPage({
      guildId: session.guild_id,
      userId: session.user_id,
      itemFilter: "all",
    }).items.length,
    1,
  );
  groups.push(
    "all tickets still sold; UR/LR filters, sorting and separate loadout slots",
  );

  // A future LR catalog item must stay out even if its flag is mistakenly true or
  // an admin database entry disguises it as UR.
  const catalog = require("../src/services/itemCatalogService");
  const get = catalog.getCatalogItem,
    list = catalog.listCatalog;
  const futureLR = {
    id: "future_lr_test",
    name: "Future LR",
    rarity: "LR",
    type: "consumable",
    gachaEligible: true,
  };
  catalog.getCatalogItem = (id) => (id === futureLR.id ? futureLR : get(id));
  catalog.listCatalog = (options) => [...list(options), futureLR];
  delete require.cache[require.resolve("../src/services/gachaPoolService")];
  const gacha = require("../src/services/gachaPoolService");
  assert.throws(
    () => gacha.addGachaItem("lr-test", futureLR.id, "UR", "admin"),
    /INVALID_GACHA_ITEM/,
  );
  db.prepare(
    "INSERT INTO gacha_pool_entries(guild_id,reward_key,kind,item_id,display_name,tier,amount,weight,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "lr-test",
    futureLR.id,
    "item",
    futureLR.id,
    futureLR.name,
    "UR",
    1,
    1,
    "admin",
    Date.now(),
  );
  assert.ok(
    !gacha.listGachaPool("lr-test").some((item) => item.itemId === futureLR.id),
  );
  assert.ok(
    !gacha.gachaItemChoices().some((item) => item.value === futureLR.id),
  );
  assert.ok(
    !gacha
      .listGachaPool("lr-test")
      .some((item) => item.itemId === escape.id || item.itemId === revive.id),
  );
  const { compareItems } = require("../src/services/itemGameService");
  assert.ok(compareItems(futureLR, { rarity: "UR" }) < 0);
  assert.ok(
    view
      .ratesFields()
      .some((f) => f.value.includes("Không xuất hiện trong Gacha")),
  );
  groups.push(
    "LR blocked from Gacha and admin choices, including future misconfigured items",
  );
  console.log(JSON.stringify({ ok: true, groups }));
} finally {
  db.close();
}
