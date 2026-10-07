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
const memory = require("../src/hardcore/towerMemories");
const echoes = require("../src/services/hardcoreEchoRepository");
const { memoryIcon } = require("../src/services/hardcoreIcons");
const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
const session = {
  id: "memory",
  guild_id: "memory",
  user_id: "player",
  channel_id: "c",
};
const rng = () => 0.5;
const groups = [];
function fresh(floor = 6) {
  const s = stats.createState("barbarian", 10000);
  s.floor = floor;
  s.cleared = floor - 1;
  s.lastLog = "";
  s.encounter = { type: "empty", name: "Trống" };
  return s;
}
function encounter(s, debt) {
  s.debts = s.debts.filter((entry) => entry !== debt);
  s.floor = debt.due;
  s.cleared = s.floor - 1;
  s.phase = "encounter";
  s.encounter = memory.makeEncounter(s, debt, rng);
}
function win(s) {
  const enemy = s.encounter;
  enemy.hp = 1;
  enemy.maxHp = 1;
  enemy.defense = 0;
  enemy.evasion = 0;
  enemy.mechanic = null;
  core.act(s, session, "attack", rng);
  assert(s.encounter !== enemy);
  return enemy;
}
function json(payload) {
  return JSON.stringify(payload.embeds.map((embed) => embed.toJSON()));
}
function validateEmbed(embed) {
  const e = embed.toJSON();
  assert((e.fields || []).length <= 25);
  for (const f of e.fields || [])
    assert(f.name.length <= 256 && f.value.length <= 1024);
  const length =
    (e.title || "").length +
    (e.description || "").length +
    (e.footer?.text || "").length +
    (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert(length <= 6000, "Discord embed length: " + length);
}
try {
  assert.equal(new Set(Object.keys(memory.CATALOG).map(memoryIcon)).size, 8);
  setApplicationEmojisForTest([["tower_remember_blood", "123456789012345678"]]);
  assert.equal(
    memoryIcon("blood"),
    "<:tower_remember_blood:123456789012345678>",
  );
  setApplicationEmojisForTest([]);
  assert.equal(memoryIcon("blood"), "🩸");
  groups.push(
    "distinct placeholder icons and late application emoji resolution",
  );

  const locked = fresh();
  for (let i = 0; i < 12; i++) core.remember(locked, "pray_rngesus", rng);
  assert.equal(locked.debts.length, 8);
  assert(locked.debts.every((d) => d.due === 26 && d.family === "divine"));
  const saved = JSON.stringify(locked.debts);
  const reloaded = JSON.parse(JSON.stringify(locked));
  for (let i = 0; i < 3; i++) {
    core.normalize(reloaded);
    json(view.privatePayload(reloaded, "s", "m", "effects"));
  }
  assert.equal(JSON.stringify(reloaded.debts), saved);
  for (const kind of ["adventurer", "sacrifice", "mirror"]) {
    const full = structuredClone(locked);
    full.encounter = core.makeSurprise(full, rng, kind);
    for (const action of [
      "event_rob",
      "event_sacrifice_hp",
      "event_sacrifice_payout",
      "event_mirror_break",
    ]) {
      const choice = core.actions(full).find((a) => a.action === action);
      if (choice) {
        assert.equal(choice.disabled, true);
        assert.throws(
          () => core.act(full, session, action, rng),
          /INVALID_ACTION/,
        );
      }
    }
  }
  const fullPrayer = structuredClone(locked);
  fullPrayer.encounter = {
    type: "rngesus",
    name: "RNGesus",
    prayerSuccess: true,
    prayerItem: structuredClone(core.ITEMS.cursed[0]),
  };
  core.act(fullPrayer, session, "pray", rng);
  assert.equal(fullPrayer.debts.length, 8);
  assert.equal(fullPrayer.items[0].rarity, "cursed");
  groups.push("queue cap, unsafe action locks and persisted outcomes");

  for (const action of ["skip_event", "sell_chest", "bribe_rngesus"]) {
    const s = fresh();
    assert.equal(core.remember(s, action, rng), null);
    assert.equal(s.debts.length, 0);
  }
  const skipped = fresh();
  skipped.encounter = core.makeSurprise(skipped, rng, "healer");
  core.act(skipped, session, "event_skip", rng);
  assert.equal(skipped.debts.length, 0);
  const sold = fresh();
  sold.encounter = core.makeChest(sold, rng);
  core.act(sold, session, "sell", rng);
  assert.equal(sold.debts.length, 0);
  const bribed = fresh();
  bribed.encounter = { type: "rngesus", name: "RNGesus" };
  const bribeCost = Math.ceil(core.payout(bribed) * 0.4);
  core.act(bribed, session, "bribe", rng);
  assert.equal(bribed.debts.length, 0);
  assert.equal(bribed.eventPayoutFactor, 1);
  assert.equal(bribed.payoutEventSpent, bribeCost);
  assert.equal(bribed.payoutSpent, bribeCost);
  groups.push(
    "ordinary skips, sales and bribery no longer create unrelated consequences",
  );

  const due = fresh(50);
  const debt = {
    version: 2,
    family: "blood",
    action: "event_sacrifice_hp",
    from: 20,
    due: 49,
    kind: "blood",
  };
  due.debts.push(debt);
  assert.equal(core.generateEncounter(due, session, rng).rank, "boss");
  assert.equal(due.debts.length, 1);
  due.floor = 51;
  const sequence = [0.5, 0.5, 0.99];
  const active = core.generateEncounter(
    due,
    session,
    () => sequence.shift() ?? 0.5,
  );
  assert.equal(active.type, "memory");
  assert.equal(active.debt, debt);
  assert.equal(due.debts.length, 0);
  const rngFirst = fresh(51);
  rngFirst.debts.push(debt);
  assert.equal(
    core.generateEncounter(rngFirst, session, () => 0).type,
    "rngesus",
  );
  assert.equal(rngFirst.debts.length, 1);
  groups.push("boss and RNGesus precede pending memories");

  const blood = fresh();
  blood.encounter = core.makeSurprise(blood, rng, "sacrifice");
  core.act(blood, session, "event_sacrifice_hp", rng);
  assert.equal(blood.debts[0].family, "blood");
  assert.equal(blood.str, 36);
  encounter(blood, blood.debts[0]);
  blood.hp = 1;
  blood.potions = blood.maxPotions - 1;
  const hp = blood.hp,
    maxHp = blood.maxHp,
    factor = blood.eventPayoutFactor,
    bonus = blood.bonus;
  core.act(blood, session, "next", rng);
  assert.equal(blood.hp, hp + Math.floor(maxHp * 0.2));
  assert.equal(blood.potions, blood.maxPotions);
  assert.equal(blood.bonus, bonus);
  assert.equal(blood.eventPayoutFactor, factor);
  assert.match(blood.lastLog, /Phúc lành hiến tế/);
  groups.push("blood offering heals and supplies without random taxation");

  const wealth = fresh();
  wealth.encounter = core.makeSurprise(wealth, rng, "sacrifice");
  const paid = core.serviceCost(wealth, 0.1);
  core.act(wealth, session, "event_sacrifice_payout", rng);
  assert.equal(wealth.payoutSpent, paid);
  const wealthDebt = wealth.debts[0];
  assert.equal(wealthDebt.coins, Math.floor(wealth.stake * 1.5));
  const declined = structuredClone(wealth);
  encounter(declined, declined.debts[0]);
  const declinedBonus = declined.bonus;
  core.act(declined, session, "memory_decline", rng);
  assert.equal(declined.bonus, declinedBonus);
  encounter(wealth, wealthDebt);
  core.act(wealth, session, "next", rng);
  assert.equal(wealth.encounter.name, "Vault Guardian");
  assert.equal(wealth.encounter.rank, "elite");
  const beforeBonus = wealth.bonus,
    normalReward = Math.floor(
      wealth.stake * 0.01 * wealth.encounter.rewardMultiplier,
    );
  const rewardedEnemy = win(wealth);
  assert.equal(wealth.bonus, beforeBonus + wealthDebt.coins + normalReward);
  assert.equal(rewardedEnemy.memoryReward, undefined);
  assert.match(wealth.lastLog, /Thưởng xu.*Hiến tế tài sản/);
  assert.match(wealth.lastLog, /→/);
  groups.push("wealth trial rewards on victory only, once, with payout audit");

  const divine = fresh();
  divine.encounter = {
    type: "rngesus",
    name: "RNGesus",
    prayerSuccess: true,
    prayerChance: 0.3,
    prayerItem: structuredClone(core.ITEMS.cursed[0]),
  };
  core.act(divine, session, "pray", rng);
  assert.equal(divine.debts[0].family, "divine");
  const ur = divine.items[0];
  core.receiveItem(divine, ur.definition);
  const unchanged = structuredClone(divine);
  encounter(unchanged, unchanged.debts[0]);
  const curseBeforeDecline = unchanged.items[0].cleansedLevels || 0;
  core.act(unchanged, session, "memory_decline", rng);
  assert.equal(unchanged.items[0].cleansedLevels || 0, curseBeforeDecline);
  encounter(divine, divine.debts[0]);
  const potions = divine.potions,
    level = ur.level;
  core.act(divine, session, "memory_offering", rng);
  assert.equal(divine.potions, potions - 1);
  assert.equal(ur.cleansedLevels, 1);
  assert.equal(ur.level, level);
  assert.equal(ur.rarity, "cursed");
  assert(
    ur.level > ur.cleansedLevels,
    "one offering does not cleanse every level",
  );
  const fought = fresh();
  core.receiveItem(fought, core.ITEMS.cursed[0]);
  const foughtDebt = core.remember(fought, "pray_rngesus", rng);
  encounter(fought, foughtDebt);
  fought.potions = 0;
  assert.equal(
    core.actions(fought).find((a) => a.action === "memory_offering").disabled,
    true,
  );
  assert.throws(
    () => core.act(fought, session, "memory_offering", rng),
    /INVALID_ACTION/,
  );
  core.act(fought, session, "next", rng);
  assert.equal(fought.encounter.name, "Herald of Fate");
  assert.equal(fought.items[0].cleansedLevels || 0, 0);
  win(fought);
  assert.equal(fought.items[0].cleansedLevels, 1);
  const fallback = fresh();
  const fallbackDebt = core.remember(fallback, "pray_rngesus", rng);
  encounter(fallback, fallbackDebt);
  fallback.hp = 1;
  const fallbackMax = fallback.maxHp;
  core.act(fallback, session, "memory_offering", rng);
  assert.equal(fallback.hp, 1 + Math.floor(fallbackMax * 0.2));
  groups.push(
    "divine refusal, one-level cleansing, combat reward and fallback healing",
  );

  const mirror = fresh();
  mirror.encounter = core.makeSurprise(mirror, rng, "mirror");
  const mirrorEnemy = structuredClone(mirror.encounter.enemy);
  core.act(mirror, session, "event_mirror_break", rng);
  assert.equal(mirror.floor, 7);
  assert.notEqual(mirror.encounter.name, "Mirror Clone");
  const mirrorDebt = mirror.debts[0];
  assert.equal(mirrorDebt.family, "mirror");
  encounter(mirror, mirrorDebt);
  assert.deepEqual(
    [mirror.encounter.enemy.maxHp, mirror.encounter.enemy.damageMin],
    [mirrorEnemy.maxHp, mirrorEnemy.damageMin],
  );
  core.act(mirror, session, "next", rng);
  assert.equal(mirror.encounter.name, "Mirror Clone");
  assert.equal(mirror.debts.length, 0);
  const lucky = fresh();
  lucky.encounter = core.makeSurprise(lucky, rng, "mirror");
  lucky.encounter.roll = 0.1;
  const beforeLuck = lucky.luck;
  core.act(lucky, session, "event_mirror_break", rng);
  assert.equal(lucky.luck, beforeLuck + 2);
  assert.equal(lucky.debts.length, 0);
  groups.push("mirror preserves its 20/80 branches with one delayed clone");

  for (const [kindRoll, expected] of [
    [0.49, "tax"],
    [0.5, "hunter"],
  ]) {
    const bounty = fresh(),
      sequence = [0.5, 0, kindRoll, 0.5, 0.5];
    const d = core.remember(bounty, "event_rob", () => sequence.shift() ?? 0.5);
    assert.equal(d.family, "bounty");
    assert.equal(d.kind, expected);
    encounter(bounty, d);
    const prior = bounty.eventPayoutFactor;
    const cost = Math.ceil(
      core.payout(bounty) * (expected === "tax" ? 0.1 : 0.2),
    );
    core.act(
      bounty,
      session,
      expected === "tax" ? "next" : "memory_settle",
      rng,
    );
    assert.equal(bounty.eventPayoutFactor, prior);
    assert.equal(bounty.payoutSpent, cost);
    assert.equal(bounty.payoutEventSpent, cost);
    assert.match(bounty.lastLog, /Thưởng xu/);
  }
  const hunted = fresh();
  const hunterDebt = core.remember(hunted, "event_rob", rng);
  encounter(hunted, hunterDebt);
  core.act(hunted, session, "next", rng);
  assert.equal(hunted.encounter.name, "Bounty Hunter");
  assert.equal(hunted.encounter.rank, "elite");
  groups.push("robbery branches and voluntary hunter compensation");

  const dead = fresh(121);
  core.receiveItem(dead, core.ITEMS.legendary[0]);
  echoes.onDeath({ ...session, id: "victim", user_id: "victim" }, dead);
  const robbed = fresh(121),
    echo = echoes.claim(session, robbed);
  assert(echo);
  const template = world.makeEnemy(robbed, "elite", "Grave Echo: victim", rng);
  template.echoId = echo.id;
  template.echo = echo;
  template.echoItem = echo.profile.items[0];
  robbed.encounter = {
    type: "echo",
    name: "Grave Echo",
    echo,
    awakens: true,
    item: echo.profile.items[0],
    enemy: template,
  };
  core.act(robbed, session, "echo_rob", rng);
  assert.equal(robbed.lastReceivedItems.length, 1);
  assert.equal(
    db.prepare("SELECT id FROM hardcore_echoes WHERE id=?").get(echo.id),
    undefined,
  );
  assert.equal(robbed.debts.length, 1);
  assert.equal(robbed.debts[0].family, "vengeance");
  assert.equal(robbed.debts[0].enemy.echoId, undefined);
  const rejoined = JSON.parse(JSON.stringify(robbed));
  core.normalize(rejoined);
  encounter(rejoined, rejoined.debts[0]);
  core.act(rejoined, session, "next", rng);
  assert.equal(rejoined.encounter.echoId, undefined);
  win(rejoined);
  assert.equal(rejoined.lastReceivedItems.length, 0);
  groups.push(
    "grave loot consumed once; delayed spirit survives without an expired lease",
  );

  const legacy = fresh();
  const legacyDebt = {
    action: "sell_chest",
    due: 16,
    good: true,
    kind: "tax",
    healRate: 0.15,
    bonusRate: 0.2,
  };
  legacy.debts.push(legacyDebt);
  const legacySaved = JSON.stringify(legacy.debts);
  core.normalize(legacy);
  assert.equal(JSON.stringify(legacy.debts), legacySaved);
  encounter(legacy, legacyDebt);
  legacy.hp = 1;
  const oldBonus = legacy.bonus,
    oldFactor = legacy.eventPayoutFactor,
    oldMax = legacy.maxHp;
  core.act(legacy, session, "next", rng);
  assert.equal(legacy.bonus, oldBonus + Math.floor(legacy.stake * 0.2));
  assert.equal(legacy.hp, 1 + Math.floor(oldMax * 0.15));
  assert.equal(legacy.eventPayoutFactor, oldFactor);
  groups.push("legacy locked outcomes retain their existing behavior");

  const panelState = fresh();
  panelState.adventurerRescue = { from: 1, until: 99 };
  for (const key of Object.keys(world.RIFT_MODIFIERS))
    panelState.modifiers[key] = 100;
  for (const action of [
    "pray_rngesus",
    "event_sacrifice_hp",
    "event_sacrifice_payout",
    "mirror_break",
    "event_rob",
    "echo_rob",
    "pray_rngesus",
    "event_sacrifice_hp",
  ])
    core.remember(panelState, action, rng, {
      paid: 100,
      enemy: world.makeEnemy(panelState, "elite", "Memory", rng),
      coins: 250,
    });
  panelState.encounter = world.makeEnemy(panelState, "normal", "Quái", rng);
  const snapshot = JSON.stringify(panelState.debts);
  const first = view.privatePayload(panelState, "s", "m", "effects");
  const totalPages = Number(
    first.embeds[0].toJSON().footer.text.match(/Trang \d+\/(\d+)/)[1],
  );
  const allNames = [],
    allText = [];
  for (let page = 0; page < totalPages; page++) {
    const payload = view.privatePayload(panelState, "s", "m", "effects", page);
    validateEmbed(payload.embeds[0]);
    allNames.push(...payload.embeds[0].toJSON().fields.map((f) => f.name));
    allText.push(json(payload));
  }
  assert.equal(allNames.filter((name) => name.includes("Đang chờ")).length, 8);
  assert(allNames.some((name) => name.includes("Ân nghĩa")));
  assert(allText.join("").includes("Nguồn"));
  assert.equal(JSON.stringify(panelState.debts), snapshot);
  const battle = JSON.stringify(
    view.embed(panelState, session.user_id).toJSON(),
  );
  assert(!battle.includes("Lost Adventurer bảo hộ"));
  assert(!battle.includes("Đang chờ"));
  assert(!battle.includes("Đến hạn"));
  assert(
    !json(view.privatePayload(panelState, "s", "m", "items")).includes(
      "Ân nghĩa",
    ),
  );
  assert(
    !json(view.privatePayload(panelState, "s", "m", "stats")).includes(
      "Lost Adventurer bảo hộ",
    ),
  );
  for (const field of view.ratesFields("encounters"))
    assert(field.value.length <= 1024);
  const rates = require("../src/commands/hardcore").ratesEmbed("encounters");
  validateEmbed(rates);
  const currentUI = fresh(),
    currentDebt = core.remember(currentUI, "event_rob", rng);
  encounter(currentUI, currentDebt);
  const currentBattle = JSON.stringify(
    view.embed(currentUI, session.user_id).toJSON(),
  );
  assert(currentBattle.includes("Rift"));
  assert(!currentBattle.includes("20% payout"));
  assert(
    json(view.privatePayload(currentUI, "s", "m", "effects")).includes(
      "20% payout",
    ),
  );
  for (const row of view.rows("s", currentUI)) row.toJSON();
  setApplicationEmojisForTest([
    ["tower_remember_bounty", "123456789012345678"],
  ]);
  assert.equal(
    view.rows("s", currentUI)[0].toJSON().components[0].emoji.id,
    "123456789012345678",
  );
  setApplicationEmojisForTest([]);
  groups.push(
    "Rift-only explanations, protections, icons and Discord-safe pagination",
  );

  for (const family of ["wealth", "divine"]) {
    const failed = fresh();
    if (family === "divine") core.receiveItem(failed, core.ITEMS.cursed[0]);
    const failureDebt = core.remember(
      failed,
      family === "wealth" ? "event_sacrifice_payout" : "pray_rngesus",
      rng,
      { paid: 100 },
    );
    encounter(failed, failureDebt);
    core.act(failed, session, "next", rng);
    Object.assign(failed.encounter, {
      hp: 1000000,
      maxHp: 1000000,
      damageMin: 100000,
      damageMax: 100000,
      accuracy: 100000,
      nextDamageType: "physical",
      mechanic: null,
    });
    const priorBonus = failed.bonus;
    assert.equal(core.act(failed, session, "attack", rng), "death");
    assert.equal(failed.bonus, priorBonus);
    if (family === "divine")
      assert.equal(failed.items[0].cleansedLevels || 0, 0);
  }
  groups.push("failed wealth and divine trials grant no bonus or cleanse");

  // Real persisted actions must reject old buttons before charging a second offering.
  const service = require("../src/services/hardcoreService");
  const repo = require("../src/services/hardcoreRepository");
  const run = service.startHardcore({
    guildId: "memory-persist",
    userId: "persisted",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const persisted = repo.parseState(repo.getSession(run.session.id));
  persisted.floor = 6;
  persisted.cleared = 5;
  core.receiveItem(persisted, core.ITEMS.cursed[0]);
  const persistedDebt = core.remember(persisted, "pray_rngesus", rng);
  encounter(persisted, persistedDebt);
  repo.saveState(run.session, persisted);
  const turn = persisted.turn,
    bottles = persisted.potions;
  service.playHardcore({
    sessionId: run.session.id,
    userId: "persisted",
    expectedTurn: turn,
    action: "memory_offering",
  });
  const once = repo.parseState(repo.getSession(run.session.id));
  assert.equal(once.potions, bottles - 1);
  assert.equal(once.items[0].cleansedLevels, 1);
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "persisted",
        expectedTurn: turn,
        action: "memory_offering",
      }),
    /STALE_ACTION/,
  );
  assert.equal(
    JSON.stringify(repo.parseState(repo.getSession(run.session.id))),
    JSON.stringify(once),
  );
  groups.push(
    "persisted offerings and stale clicks cannot consume supplies or reward twice",
  );

  console.log(
    JSON.stringify({ ok: true, groups: groups.length, towerMemories: groups }),
  );
} finally {
  setApplicationEmojisForTest([]);
  db.close();
}
