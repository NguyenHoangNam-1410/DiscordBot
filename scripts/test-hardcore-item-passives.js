"use strict";
const assert = require("node:assert/strict"),
  path = require("node:path");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
process.env.DB_PATH = path.join(
  __dirname,
  "../data/item-passives-memory.sqlite",
);
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const p = require("../src/hardcore/itemPassives"),
  { ITEMS, validateItems } = require("../src/hardcore/item");
const stats = require("../src/services/hardcoreStats"),
  core = require("../src/services/hardcoreV2"),
  world = require("../src/services/hardcoreWorld"),
  view = require("../src/services/hardcoreV2View"),
  paradox = require("../src/services/hardcoreParadoxService");
const items = Object.values(ITEMS).flat(),
  get = (id) => items.find((x) => x.id === id);
const session = {
  id: "passive",
  guild_id: "passive",
  user_id: "passive",
  channel_id: "c",
};
function state(ids = [], classKey = "barbarian") {
  const s = stats.createState(classKey, 10000);
  s.floor = 11;
  s.cleared = 10;
  s.lastLog = "";
  s.items = ids.map((id) => ({
    definition: get(id),
    name: get(id).name,
    rarity: get(id).rarity,
    level: 1,
    cleansedLevels: 0,
  }));
  stats.recompute(s);
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.encounter = world.makeEnemy(s, "normal", "Test", () => 0.5);
  Object.assign(s.encounter, {
    hp: 100000,
    maxHp: 100000,
    defense: 0,
    resistance: 0,
    evasion: 0,
    accuracy: 1000,
    critChance: 0,
    damageMin: 30,
    damageMax: 30,
    damageType: "physical",
    nextDamageType: "physical",
  });
  return s;
}
function serial(s) {
  return core.normalize(JSON.parse(JSON.stringify(s)));
}
function textOf(payload) {
  return JSON.stringify(payload.embeds.map((e) => e.toJSON()));
}
function bounds(payload) {
  const e = payload.embeds.map((e) => e.toJSON());
  let total = 0;
  for (const x of e) {
    assert((x.fields?.length || 0) <= 25);
    assert((x.description?.length || 0) <= 4096);
    total +=
      (x.title?.length || 0) +
      (x.description?.length || 0) +
      (x.footer?.text?.length || 0);
    for (const f of x.fields || []) {
      assert(f.value.length <= 1024);
      total += f.name.length + f.value.length;
    }
  }
  assert(total <= 6000, "Discord embed limit: " + total);
}
function choose(s, id) {
  s.phase = "paradox";
  const pairId = Object.keys(paradox.PAIRS).find((k) =>
    paradox.PAIRS[k].includes(id),
  );
  s.encounter = {
    type: "paradox",
    version: 2,
    milestone: 10,
    pairId,
    choices: [id],
  };
  paradox.choose(s, id);
  s.phase = "encounter";
  s.encounter = state([], s.classKey).encounter;
}
const groups = [];
try {
  assert.equal(items.length, 63);
  assert.equal(Object.keys(p.PASSIVES).length, 63);
  validateItems();
  for (const item of items) {
    p.validate(item.passive);
    assert(p.describe(item.passive).length > 30);
    assert(Object.isFrozen(item.passive));
  }
  assert.throws(() => p.validate({ kind: "mpLeech", amount: 3 }), /INVALID/);
  const all = state(items.map((x) => x.id)),
    base = p.aggregate(all);
  for (const item of all.items) item.level = 100;
  all.items.push({ ...all.items[0] });
  assert.deepEqual(p.aggregate(all), base);
  assert.equal(base.berserk, 0.4);
  assert.equal(base.mpLeech, 0.35);
  assert.equal(base.guardReflect, 0.4);
  assert.equal(base.thorns, 0.2);
  assert.equal(base.shopDiscount, 0.2);
  assert.equal(base.eventLuck, 0.1);
  assert.equal(base.potionCapacity, 5);
  assert.equal(base.critCap, 0.15);
  assert.equal(base.evasionCap, 0.15);
  assert.equal(base.dodgeCounter, 0.5);
  assert.equal(base.startMana, 0.75);
  assert.equal(base.campHeal, 0.05);
  assert.equal(base.potionSave, 0.2);
  assert.equal(base.trapResistance, 0.25);
  assert(Object.values(base.foresight).every((x) => x === 2));
  const cleansed = state(["glass_cannon"]),
    before = p.aggregate(cleansed);
  core.cleanse(cleansed, cleansed.items[0]);
  assert.deepEqual(p.aggregate(cleansed), before);
  cleansed.items[0].level = 2;
  core.grind(cleansed, cleansed.items[0]);
  assert.equal(p.aggregate(cleansed).berserk, 0.3);
  core.grind(cleansed, cleansed.items[0]);
  assert.equal(p.aggregate(cleansed).berserk, 0);
  const old = state(["cracked_wand"]);
  old.items[0].definition = structuredClone(old.items[0].definition);
  delete old.items[0].definition.passive;
  assert.equal(p.aggregate(serial(old)).mpLeech, 0.08);
  old.items[0].definition.passive = null;
  assert.equal(p.aggregate(old).mpLeech, 0);
  groups.push(
    "63 passives, caps, distinct IDs, levels, cleanse, grinding and saved snapshots",
  );

  const cap = state([
    "bleeding_star",
    "oathbreaker",
    "ashen_wings",
    "chrono_shard",
    "golden_monocle",
    "endless_flask",
    "titan_heart",
    "alchemist_belt",
  ]);
  stats.addSource(cap, { dex: 10000 });
  assert.equal(cap.critChance, 0.75);
  assert.equal(cap.evasionCap, 0.6);
  assert.equal(cap.maxPotions, 10);
  assert.equal(world.hitChance(1, 10000), 0.55);
  assert.equal(world.hitChance(1, 10000, cap.evasionCap), 0.4);
  cap.encounter.nextDamageType = "magic";
  assert.equal(core.incomingPreview(cap).chance, 1);
  cap.potions = 9;
  core.receiveItem(cap, get("red_potion_belt"));
  assert.equal(cap.potions, 10);
  cap.encounter = { type: "empty", name: "Empty" };
  cap.floor = 15;
  core.completeFloor(cap, session, () => 0.999);
  assert.equal(cap.potions, 10);
  groups.push(
    "raised CRIT/dodge ceilings and dynamic potion receipts/checkpoint",
  );

  const rage = state(["glass_cannon", "rusted_edge"]);
  rage.items.forEach((x) => (x.cleansedLevels = x.level));
  stats.recompute(rage);
  rage.hp = rage.maxHp;
  const full = core.attackDamagePreview(rage).low;
  rage.hp = 1;
  assert(core.attackDamagePreview(rage).low > full);
  const plain = structuredClone(rage);
  plain.items.forEach(
    (x) => (x.definition = { ...x.definition, passive: null }),
  );
  stats.recompute(plain);
  assert(
    core.attackDamagePreview(rage).low <=
      Math.ceil(core.attackDamagePreview(plain).low * 1.4),
  );
  for (const classKey of Object.keys(stats.CLASSES)) {
    const leech = state(["cracked_wand", "mana_prism"], classKey);
    choose(leech, "mana_fracture");
    leech.mana = 2;
    leech.critChance = 0;
    let calls = 0;
    const result = core.playerAttack(leech, "skill", () => {
      calls++;
      return 0;
    });
    assert.equal(leech.mana, 2); // costs 1 and regains exactly 1, including Amazon multi-shot
    assert.equal((result.log.match(/Hút MP/g) || []).length, 1);
    const miss = state(["cracked_wand"]);
    choose(miss, "mana_fracture");
    miss.mana = 0;
    core.playerAttack(miss, "attack", () => 0.999);
    assert.equal(miss.mana, 0);
    const immune = state(["cracked_wand"]);
    choose(immune, "mana_fracture");
    immune.mana = 0;
    immune.encounter.mechanic = "riftwalker";
    immune.encounter.combatTurn = 0;
    core.playerAttack(immune, "attack", () => 0);
    assert.equal(immune.mana, 0);
  }
  groups.push(
    "low HP damage, MP leech once per action for all seven classes, misses and immunity",
  );

  const start = state(["mana_fragment", "spirit_lantern"]);
  start.mana = 0;
  let rolls = 0;
  core.prepareItemCombat(start, () => {
    rolls++;
    return 0;
  });
  assert.equal(start.mana, 1);
  assert.equal(rolls, 1);
  for (let i = 0; i < 4; i++) {
    core.prepareItemCombat(start, () => {
      throw Error("REROLL");
    });
    const loaded = serial(start);
    assert.equal(loaded.mana, 1);
    assert(loaded.encounter.passiveCombatStarted);
  }
  start.encounter = { ...start.encounter };
  delete start.encounter.passiveCombatStarted;
  core.prepareItemCombat(start, () => 0);
  assert.equal(start.mana, 2);
  groups.push("combat entry MP locked once across resume");

  const guard = state(["vanguard_spear"]);
  guard.hp = guard.maxHp;
  const hp = guard.encounter.hp;
  core.enemyTurn(guard, () => 0, true, false, true);
  assert(guard.encounter.hp < hp);
  const skillGuard = state(["vanguard_spear"]);
  core.enemyTurn(skillGuard, () => 0, true, false, false);
  assert.equal(skillGuard.encounter.hp, 100000);
  const thorns = state(["minor_life_charm", "living_armor"]);
  let ehp = thorns.encounter.hp;
  core.enemyTurn(thorns, () => 0);
  assert(thorns.encounter.hp < ehp);
  const corpse = state(["living_armor"]);
  corpse.hp = 1;
  core.enemyTurn(corpse, () => 0);
  assert.equal(corpse.hp, 0);
  assert.equal(corpse.encounter.hp, 100000);
  const dodge = state(["hunter_bow"]);
  let index = 0;
  core.enemyTurn(dodge, () => (index++ === 0 ? 0.999 : 0));
  assert(dodge.encounter.hp < 100000);
  assert.equal(dodge.hp, dodge.maxHp);
  const skillDodge = state(["hunter_bow"]);
  core.enemyTurn(skillDodge, () => 0, false, true);
  assert.equal(skillDodge.encounter.hp, 100000);
  const magic = state(["hunter_bow"]);
  magic.encounter.nextDamageType = "magic";
  core.enemyTurn(magic, () => 0.999);
  assert.equal(magic.encounter.hp, 100000);
  const reflect = state([
    "living_armor",
    "berserker_chains",
    "wardens_bulwark",
    "seraphic_aegis",
    "vanguard_spear",
  ]);
  stats.addSource(reflect, { maxHp: 100000 });
  reflect.hp = reflect.maxHp;
  reflect.encounter.damageMin = reflect.encounter.damageMax = 1000;
  const budget = Math.floor((reflect.damageMin + reflect.damageMax) / 4);
  core.enemyTurn(reflect, () => 0, true);
  core.enemyTurn(reflect, () => 0, true);
  assert(100000 - reflect.encounter.hp <= budget);
  assert.equal(reflect.mana, reflect.maxMana);
  const immunity = state(["living_armor"]);
  immunity.encounter.mechanic = "riftwalker";
  immunity.encounter.combatTurn = 0;
  core.act(immunity, session, "defend", () => 0);
  assert.equal(immunity.encounter.hp, 100000);
  const win = state(["living_armor", "minor_life_charm"]);
  win.encounter.hp = 1;
  core.act(win, session, "defend", () => 0.1);
  assert.equal(win.cleared, 11);
  assert.equal(win.kills, 1);
  assert.match(win.lastLog, /Hạ Test/);
  groups.push(
    "guard versus Paladin guard, actual HP loss, natural dodge, immunity, combined budget and counter kill settlement",
  );

  const potion = state(["one_more_hit", "deep_flask"]);
  potion.hp = 1;
  potion.potions = 1;
  core.playerAttack(potion, "potion", () => 0);
  assert.equal(potion.potions, 1);
  assert(potion.hp > 1);
  potion.hp = 1;
  core.playerAttack(potion, "potion", () => 0.999);
  assert.equal(potion.potions, 0);
  assert.throws(
    () => core.playerAttack(potion, "potion", () => 0),
    /NO_POTION/,
  );
  const locked = state(["one_more_hit"]);
  choose(locked, "blood_mirror");
  // Blood Mirror locks bottles above 40% HP; save chance must never bypass the lock.
  core.playerAttack(locked, "attack", () => 0);
  paradox.afterAction(locked, "attack");
  locked.hp = Math.ceil(locked.maxHp * 0.6);
  assert(paradox.potionLocked(locked));
  assert.throws(
    () => core.playerAttack(locked, "potion", () => 0),
    /POTION_LOCKED/,
  );
  const rest = state(["field_bandage", "phoenix_blood"]);
  rest.encounter = { type: "empty", name: "Empty" };
  rest.hp = 20;
  const restHP = rest.hp;
  core.act(rest, session, "next", () => 0.999);
  assert(rest.hp > restHP);
  assert.match(rest.lastLog, /Nghỉ chân/);
  const fought = state(["field_bandage"]);
  fought.encounter.hp = 1;
  fought.hp = 20;
  core.act(fought, session, "attack", () => 0);
  assert.doesNotMatch(fought.lastLog, /Nghỉ chân/);
  groups.push(
    "potion saving honors inventory and locks, peaceful healing excludes combat floors",
  );

  const discount = state([
    "goblin_hook",
    "goblin_snare",
    "golden_goblet",
    "goblins_debt",
  ]);
  for (const kind of [
    "merchant",
    "payout_shop",
    "blood_shop",
    "diamond_shop",
  ]) {
    discount.floor = 101;
    const e = core.makeSurprise(discount, () => 0.5, kind);
    for (const o of e.offers)
      if (["merchant", "payout_shop"].includes(kind)) {
        assert.equal(o.price, Math.max(1, Math.ceil(o.basePrice * 0.8)));
        assert.equal(o.discount, 0.2);
      } else assert.equal(o.discount, undefined);
    const price = JSON.stringify(e.offers);
    p.discountOffers(discount, e);
    assert.equal(JSON.stringify(e.offers), price);
    discount.encounter = e;
    assert.deepEqual(serial(discount).encounter.offers, e.offers);
  }
  const lucky = state([
    "rabbit_foot",
    "lucky_coin",
    "eternal_clover",
    "crown_of_ruin",
  ]);
  const fountain = core.makeSurprise(lucky, () => 0.94, "fountain");
  assert.equal(fountain.goodThreshold, 0.95);
  const doors = core.makeSurprise(lucky, () => 0.75, "doors");
  assert.equal(doors.doors.light, true);
  assert.equal(doors.doors.gold, true);
  assert.equal(doors.doors.dark, false);
  assert(Math.abs(doors.doorChances.light - 0.8) < 1e-9);
  groups.push(
    "stored coin discount, no diamond/HP discounts, capped good events",
  );

  const oracle = state([
    "black_sun",
    "mimic_crown",
    "eye_of_rngesus",
    "oracle_mask",
  ]);
  for (const kind of ["doors", "treasure_room", "fountain", "mirror"]) {
    const e = core.makeSurprise(oracle, () => 0.6, kind);
    oracle.encounter = e;
    assert.equal(
      e.passiveForecast.length,
      ["doors", "treasure_room"].includes(kind) ? 2 : 1,
    );
    const locked = JSON.stringify(e);
    p.prepareForecast(oracle, e, () => {
      throw Error("REROLL");
    });
    assert.equal(JSON.stringify(e), locked);
    const loaded = serial(oracle);
    assert.deepEqual(loaded.encounter.passiveForecast, e.passiveForecast);
    bounds(view.privatePayload(loaded, "p", "m", "encounter"));
    const allLabels = view
      .rows("p", loaded)
      .flatMap((r) => r.toJSON().components.map((c) => c.label || ""));
    assert(allLabels.some((l) => /An toàn|Nguy hiểm/.test(l)));
    assert.match(
      textOf(view.privatePayload(loaded, "p", "m", "encounter")),
      /Tiên tri/,
    );
  }
  const portal = {
    type: "trap",
    kind: "portal",
    name: "Wrong Portal",
    good: false,
    badEffect: "blood",
    enemy: state().encounter,
  };
  p.prepareForecast(oracle, portal, () => 0);
  assert.deepEqual(portal.passiveForecast, [{ action: "next", safe: false }]);
  const forbidden = {
    type: "rngesus",
    name: "RNGesus",
    prayerSuccess: true,
    fleeSuccess: true,
  };
  p.prepareForecast(oracle, forbidden, () => {
    throw Error("RNGESUS_FORECAST");
  });
  assert.equal(forbidden.passiveForecast, undefined);
  const trap = state([
    "chest_chalk",
    "rift_compass",
    "astral_mail",
    "null_idol",
  ]);
  trap.encounter = { type: "shrine", kind: "fake", name: "Fake" };
  const initial = trap.hp;
  core.act(trap, session, "touch", () => 0.999);
  assert.equal(
    initial - trap.hp,
    Math.floor(Math.max(10, trap.maxHp * 0.3) * 0.75),
  );
  groups.push(
    "forecasts locked and marked in UI, RNGesus exclusion, trap resistance",
  );

  const ui = state(items.map((x) => x.id));
  ui.modifiers = Object.fromEntries(
    Object.keys(world.RIFT_MODIFIERS).map((k) => [k, 100]),
  );
  for (const tab of ["stats", "items", "effects", "encounter"])
    bounds(view.privatePayload(ui, "p", "m", tab));
  assert.match(textOf(view.privatePayload(ui, "p", "m", "stats")), /Nội tại/);
  assert.match(
    textOf(view.privatePayload(ui, "p", "m", "items")),
    /Tiên tri|Cuồng chiến|Hút MP/,
  );
  assert.doesNotMatch(textOf({ embeds: [view.embed(ui)] }), /Nội tại trang bị/);
  groups.push("Discord UI boundaries and information placement");

  // Seeded statistical check exercises actual RNG consumers, rather than only forced trigger fixtures.
  let seed = 0x12345678;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const entry = state(["mana_fragment", "spirit_lantern"]);
  let entryProcs = 0;
  for (let i = 0; i < 6000; i++) {
    entry.mana = 0;
    delete entry.encounter.passiveCombatStarted;
    core.prepareItemCombat(entry, rng);
    entryProcs += entry.mana;
  }
  assert(Math.abs(entryProcs / 6000 - 0.5) < 0.03);
  const simulation = [];
  for (const classKey of Object.keys(stats.CLASSES)) {
    const s = state(
      ["angelic_engine", "hollow_crown", "cracked_wand"],
      classKey,
    );
    choose(s, "mana_fracture");
    let landed = 0,
      procs = 0;
    for (let i = 0; i < 1800; i++) {
      s.encounter.hp = 100000;
      s.mana = 2;
      const r = core.playerAttack(s, "skill", rng);
      if (s.encounter.hp < 100000) {
        landed++;
        if (r.log.includes("Hút MP")) procs++;
      }
      assert(s.mana === 1 || s.mana === 2);
    }
    assert(
      Math.abs(procs / landed - 0.35) < 0.05,
      classKey + " leech frequency",
    );
    simulation.push({ classKey, landed, rate: +(procs / landed).toFixed(3) });
  }
  console.log(
    JSON.stringify({
      simulation: "seeded passive triggers",
      entryRate: entryProcs / 6000,
      classes: simulation,
    }),
  );
  groups.push("seeded activation simulation across all seven classes");

  for (const classKey of Object.keys(stats.CLASSES))
    for (const id of Object.keys(paradox.CATALOG)) {
      const s = state(
        items.map((x) => x.id),
        classKey,
      );
      s.items.forEach((x) => (x.level = 10));
      stats.recompute(s);
      choose(s, id);
      s.classShrine = { classKey, from: 11, until: 13 };
      s.modifiers = Object.fromEntries(
        Object.keys(world.RIFT_MODIFIERS).map((k) => [k, 100]),
      );
      bounds(view.privatePayload(s, "p", "m", "stats"));
    }
  groups.push(
    "full passive/rift/paradox/shrine combinations stay inside Discord limits",
  );

  const service = require("../src/services/hardcoreService"),
    repo = require("../src/services/hardcoreRepository");
  const inventory = require("../src/services/hardcoreInventoryService");
  inventory.grant("passive-tx", "player", "living_armor", 1);
  const run = service.startHardcore({
    guildId: "passive-tx",
    userId: "player",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    loadout: { itemIds: ["living_armor"] },
    forcedEncounter: state().encounter,
  });
  assert(run.state.encounter.passiveCombatStarted);
  assert.equal(p.aggregate(run.state).thorns, 0.12);
  const saved = repo.parseState(repo.getSession(run.session.id));
  saved.encounter.hp = 1;
  saved.encounter.accuracy = 100000;
  saved.encounter.damageMin = saved.encounter.damageMax = 30;
  repo.saveState(run.session, saved);
  const played = service.playHardcore({
    sessionId: run.session.id,
    userId: "player",
    expectedTurn: saved.turn,
    action: "defend",
  });
  assert.equal(played.state.kills, 1);
  assert.equal(played.state.cleared, 1);
  assert.doesNotMatch(played.state.lastLog, /Nghỉ chân/);
  const persisted = repo.getSession(run.session.id).state_json;
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "player",
        expectedTurn: saved.turn,
        action: "defend",
      }),
    /STALE_ACTION/,
  );
  assert.equal(repo.getSession(run.session.id).state_json, persisted);
  const loaded = serial(repo.parseState(repo.getSession(run.session.id)));
  assert.equal(p.aggregate(loaded).thorns, 0.12);
  assert.equal(
    inventory
      .inventory("passive-tx", "player")
      .find((x) => x.id === "living_armor")?.quantity || 0,
    0,
  );
  groups.push(
    "loadout snapshot, transactional passive kill, persistence and stale-click rejection",
  );

  const debt = state([
    "living_armor",
    "berserker_chains",
    "wardens_bulwark",
    "seraphic_aegis",
  ]);
  choose(debt, "time_debt");
  stats.addSource(debt, { maxHp: 100000 });
  debt.hp = debt.maxHp;
  debt.activeParadox.combatActionCount = 2;
  debt.encounter.damageMin = debt.encounter.damageMax = 1000;
  core.act(debt, session, "defend", () => 0);
  assert.match(debt.lastLog, /Phản công lần hai/);
  assert(
    100000 - debt.encounter.hp <=
      Math.floor((debt.damageMin + debt.damageMax) / 4),
  );
  const final = state(["living_armor"]);
  final.floor = 999;
  final.cleared = 998;
  final.encounter.hp = 1;
  final.encounter.rank = "final_boss";
  final.encounter.mechanic = "deimoss";
  core.act(final, session, "defend", () => 0);
  assert(final.finalBossDefeated);
  assert.equal(final.phase, "summit");
  assert.equal(final.kills, 1);
  const violation = state(["one_more_hit"]);
  violation.hp = 20;
  violation.encounter.damageMin = violation.encounter.damageMax = 1;
  violation.contract = {
    kind: "potion",
    from: 11,
    until: 13,
    remaining: 3,
    item: get("phoenix_blood"),
  };
  const bottles = violation.potions;
  core.act(violation, session, "potion", () => 0);
  assert.equal(violation.potions, bottles);
  assert.equal(violation.contract, null);
  assert.match(violation.lastLog, /Vi phạm hợp đồng/);
  const ambush = state(["mana_fragment"]);
  ambush.mana = 0;
  ambush.encounter = {
    type: "trap",
    kind: "portal",
    good: false,
    name: "Wrong Portal",
    badEffect: "mana",
    enemy: ambush.encounter,
  };
  core.act(ambush, session, "next", () => 0);
  assert.equal(ambush.mana, 1);
  assert.match(ambush.lastLog, /Khởi động MP/);
  groups.push(
    "Time Debt shared cap, final boss passive kill, saved bottle contract violation and ambush MP log",
  );

  console.log(JSON.stringify({ ok: true, items: 63, groups }));
} finally {
  db.close();
}
