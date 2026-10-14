"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
delete process.env.HARDCORE_EQUIPMENT_RULES_VERSION;
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const stats = require("../src/hardcore/engine/stats"),
  core = require("../src/hardcore/engine"),
  view = require("../src/hardcore/ui");
const catalog = require("../src/hardcore/item"),
  rules = require("../src/hardcore/equipment/rules"),
  loot = require("../src/hardcore/equipment/loot"),
  affinity = require("../src/hardcore/equipment/affinityEffects"),
  forge = require("../src/hardcore/equipment/forge");
const cls = Object.keys(stats.CLASSES),
  get = (id) =>
    Object.values(catalog.ITEMS_V3)
      .flat()
      .find((i) => i.id === id),
  session = { id: "items-v3", guild_id: "g", channel_id: "c", user_id: "u" };
let groups = 0;
function test(name, fn) {
  fn();
  groups++;
  console.log("PASS " + name);
}
function state(k = "assassin") {
  const s = stats.createState(k, 10000);
  // Preserve saved original equipment curve and loot contracts.
  s.itemLevelCurveVersion = 1;
  delete s.lootRulesVersion;
  s.classInnateRevision = 1;
  s.encounter = { type: "empty", name: "Empty" };
  return s;
}
function sequence(values) {
  let index = 0;
  return () => {
    assert(index < values.length, "Unexpected RNG consumption");
    return values[index++];
  };
}
function combat(k) {
  const s = state(k);
  s.encounter = {
    type: "combat",
    name: "Fixture",
    rank: "normal",
    hp: 100000,
    maxHp: 100000,
    defense: 0,
    resistance: 0,
    accuracy: 1000,
    evasion: 0,
    critChance: 0,
    damageMin: 20,
    damageMax: 20,
    damageType: "physical",
    nextDamageType: "physical",
    combatTurn: 1,
  };
  const i = Object.values(catalog.ITEMS_V3)
    .flat()
    .find((x) => x.affinity.classes.includes(k));
  core.receiveItem(s, i);
  core.prepareItemCombat(s, () => 0.99);
  return s;
}
try {
  test("Equipment V3 is enabled without env; old saved markers remain unchanged", () => {
    delete process.env.HARDCORE_EQUIPMENT_RULES_VERSION;
    const fresh = stats.createState("amazon", 10000);
    assert(rules.enabled(fresh));
    assert.equal(fresh.catalogVersion, 3);
    process.env.HARDCORE_EQUIPMENT_RULES_VERSION = "0";
    assert(rules.enabled(stats.createState("amazon", 10000)));
    delete process.env.HARDCORE_EQUIPMENT_RULES_VERSION;
  });

  test("100 definitions preserve current 63; matrix complete", () => {
    assert.deepEqual(
      Object.values(catalog.ITEMS_V3).map((p) => p.length),
      [32, 28, 24, 16],
    );
    for (const old of Object.values(catalog.LEGACY_ITEMS).flat()) {
      const next = get(old.id);
      assert.deepEqual(next.effects, old.effects);
      assert.deepEqual(next.passive, old.passive);
      assert.deepEqual(next.curse, old.curse);
    }
    for (const k of cls)
      for (const pool of Object.values(catalog.ITEMS_V3)) {
        assert(pool.some((i) => loot.relation(i, k) === "match"));
        assert(pool.some((i) => loot.relation(i, k) === "universal"));
        assert(pool.some((i) => loot.relation(i, k) === "off"));
      }
  });
  test("Curve boundaries, safe high levels, no accumulated rounding", () => {
    [0, 1, 1.6, 2, 2.3, 2.5, 2.6, 2.65, 2.675].forEach((v, l) =>
      assert(Math.abs(rules.scale(l) - v) < 1e-12),
    );
    let previous = 0;
    for (const l of [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      10,
      30,
      100,
      10000,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const v = rules.scale(l);
      assert(v >= previous && v <= 2.7);
      previous = v;
    }
    assert.throws(() => rules.scale(Infinity));
    assert.throws(() => rules.scale(1.1));
  });
  test("Bucket boundary and rarity per class, deterministic (no simulations)", () => {
    for (const k of cls)
      for (const r of Object.keys(catalog.ITEMS_V3))
        for (const [roll, expected] of [
          [0, "match"],
          [0.549999, "match"],
          [0.55, "universal"],
          [0.799999, "universal"],
          [0.8, "off"],
          [0.999999, "off"],
        ]) {
          const s = state(k),
            numbers = r === "cursed" ? [0.99, roll, 0.4] : [roll, 0.4];
          const item = loot.single(s, r, sequence(numbers), "boundary");
          assert.equal(item.rarity, r);
          assert.equal(loot.relation(item, k), expected);
          assert(!s.affinityFallbackAudit);
        }
  });
  test("Three misses then forced match; offer counted once; consumable excluded", () => {
    const s = state();
    for (let i = 1; i <= 3; i++) {
      loot.single(s, "common", sequence([0.7, 0.4]), "miss");
      assert.equal(s.affinityPity.missStreak, i);
    }
    const forced = loot.single(s, "common", sequence([0.4]), "guarantee");
    assert.equal(loot.relation(forced, s.classKey), "match");
    assert.equal(s.affinityPity.missStreak, 0);
    const offer = loot.offers(
      s,
      ["common", "common", "common"],
      sequence([0.7, 0, 0.9, 0, 0.1, 0]),
      "shop",
    );
    assert.equal(new Set(offer.map((i) => i.id)).size, 3);
    assert.equal(s.affinityPity.missStreak, 0);
    loot.offers(
      s,
      ["common", "common", "common"],
      sequence([0.7, 0, 0.7, 0, 0.7, 0]),
      "shop",
    );
    assert.equal(s.affinityPity.missStreak, 1);
    const before = structuredClone(s.affinityPity);
    assert.equal(
      loot.single(s, "cursed", sequence([0, 0]), "ticket").category,
      "consumable",
    );
    assert.deepEqual(s.affinityPity, before);
  });
  test("All equipment active, duplicate curve, no free HP/MP, unchanged common passives", () => {
    const s = state();
    s.hp = 1;
    s.mana = 0;
    const choices = catalog.ITEMS_V3.common
      .filter(
        (i) => !i.effects.heal && !i.effects.potions && !i.effects.escapeTokens,
      )
      .slice(0, 8);
    for (const d of choices) {
      core.receiveItem(s, d);
      assert.equal(s.hp, 1);
      assert.equal(s.mana, 0);
    }
    assert.equal(s.items.length, 8);
    const target = s.items[0],
      before = affinity.strength(s);
    core.receiveItem(s, target.definition, 20);
    assert.equal(target.level, 21);
    assert.equal(affinity.strength(s), before);
    const copy = JSON.parse(JSON.stringify(s));
    stats.recompute(copy);
    assert.deepEqual(stats.derive(copy), stats.derive(s));
  });
  test("Cleanse then duplicate contributes only curve difference; grind no absorbed stats", () => {
    const s = state("barbarian"),
      d = get("crown_of_ruin");
    assert(d);
    core.receiveItem(s, d);
    const i = s.items[0];
    core.cleanse(s, i);
    assert.equal(rules.curseScale(s, i), 0);
    core.receiveItem(s, d);
    assert(Math.abs(rules.curseScale(s, i) - 0.6) < 1e-12);
    const before = structuredClone(s.sources);
    core.grind(s, i);
    assert.equal(i.level, 1);
    assert.equal(rules.curseScale(s, i), 0);
    assert.deepEqual(s.sources, before);
    core.grind(s, i);
    assert.equal(s.items.length, 0);
    assert.equal(affinity.strength(s), 0);
    const bool = get("glass_cannon");
    core.receiveItem(s, bool, 1000, 999);
    assert.equal(
      s.defense,
      Math.ceil(
        stats.derive({
          ...s,
          items: s.items.map((item) => ({ ...item, cleansedLevels: item.level })),
        }).defense / 2,
      ),
    );
    core.cleanse(s, s.items[0]);
    assert(s.defense > 0);
  });
  test("Receipt rules and snapshot exclusion; fixed items do not change pity", () => {
    const s = state("druid"),
      d = structuredClone(get("field_bandage"));
    d.effects = { heal: 10 };
    d.receipt.onDuplicate = false;
    s.hp = 1;
    core.receiveItem(s, d);
    assert.equal(s.hp, 11);
    core.receiveItem(s, d);
    assert.equal(s.hp, 11);
    const snapshot = {
      definition: structuredClone(d),
      level: 2,
      cleansedLevels: 0,
    };
    core.receiveSnapshot(s, snapshot);
    assert.equal(s.hp, 11);
    const pity = structuredClone(s.affinityPity);
    stats.recompute(s);
    assert.deepEqual(s.affinityPity, pity);
  });
  test("Legacy V2 and V3 keep saved linear contributions and Forge absorption", () => {
    for (const gameplayVersion of [2, 3]) {
      const s = stats.createState("barbarian", 10000, { gameplayVersion });
      if (gameplayVersion === 3) {
        delete s.equipmentRulesVersion;
        delete s.itemLevelCurveVersion;
        delete s.affinityVersion;
        s.catalogVersion = 2;
        delete s.affinityPity;
      }
      s.encounter = { type: "empty" };
      const d = catalog.LEGACY_ITEMS.common[0];
      core.receiveItem(s, d, 3);
      assert.equal(rules.itemScale(s, s.items[0]), 3);
      assert(!s.items[0].definition.affinity);
      core.grind(s, s.items[0]);
      assert(Object.keys(s.sources.absorbed).length > 0);
    }
  });
  test("Forge two stages, exact one boon, no skip/retreat/stale credit", () => {
    const s = state("amazon");
    s.floor = 21;
    s.cleared = 20;
    core.receiveItem(s, get("hunter_bow"), 2);
    s.encounter = {
      type: "surprise",
      kind: "horadric",
      name: "Forge",
      targetId: "hunter_bow",
      forge: forge.prepare(s, "hunter_bow"),
    };
    core.act(s, session, "forge_grind", () => 0.99);
    assert.equal(s.items[0].level, 1);
    assert.equal(s.encounter.forge.stage, "boon");
    assert.throws(
      () => core.act(s, session, "retreat", () => 0.99),
      /CANNOT_RETREAT/,
    );
    assert(!core.actions(s).some((a) => a.action === "event_skip"));
    const saved = JSON.parse(JSON.stringify(s));
    core.normalize(saved);
    assert.deepEqual(saved.encounter.forge, s.encounter.forge);
    assert.throws(() => core.act(s, session, "forge_grind", () => 0.99));
    assert.throws(() => core.act(s, session, "event_skip", () => 0.99));
    core.act(s, session, "forge_boon_0", () => 0.99);
    assert.equal(s.sources.forgeBoon.dex, 1);
    assert.throws(() => core.act(s, session, "forge_boon_0", () => 0.99));
    assert.equal(s.sources.forgeBoon.dex, 1);
  });
  test("Shop offers unique, event pity once; non-equipment chests excluded", () => {
    const s = state();
    s.floor = 200;
    s.cleared = 199;
    const e = core.makeSurprise(s, () => 0.7, "payout_shop");
    assert.equal(e.offers.length, 3);
    assert.equal(new Set(e.offers.map((o) => o.item.id)).size, 3);
    assert.equal(s.affinityPity.missStreak, 1);
    const before = structuredClone(s.affinityPity);
    const chest = core.makeChest(s, () => 0);
    assert(["mimic", "ancient_mimic"].includes(chest.kind));
    assert.equal(chest.item, null);
    assert.deepEqual(s.affinityPity, before);
  });
  test("Class behavior: natural dodge/crit, first-shot accuracy, low HP, mana, Ward, sustain, Guard", () => {
    const assassin = combat("assassin");
    affinity.dodge(assassin);
    assert(affinity.outgoing(assassin, false, true) > 1);
    affinity.afterAttack(assassin, { landed: 1, critical: true });
    assert.equal(assassin.encounter.affinityCombat.marks, 0);
    const forced = combat("assassin");
    core.enemyTurn(forced, () => 0.99, false, true);
    assert.equal(forced.encounter.affinityCombat.marks, 0);
    const natural = combat("assassin");
    natural.encounter.accuracy = 1;
    natural.evasion = 10000;
    core.enemyTurn(natural, () => 0.99);
    assert.equal(natural.encounter.affinityCombat.marks, 1);
    const amazon = combat("amazon");
    assert(affinity.accuracy(amazon) > 0);
    affinity.afterAttack(amazon, { landed: 2 });
    assert.equal(affinity.accuracy(amazon), 0);
    assert(affinity.outgoing(amazon, false, false) > 1);
    const barb = combat("barbarian");
    barb.hp = 1;
    assert(affinity.outgoing(barb, false, false) > 1);
    assert(affinity.incoming(barb) < 1);
    const sorc = combat("sorceress");
    sorc.mana = 0;
    assert(affinity.outgoing(sorc, true, false) > 1);
    for (let i = 0; i < 3; i++)
      affinity.afterAttack(sorc, { landed: 1, magic: true, paidMana: 2 });
    assert.equal(sorc.mana, 1);
    const necro = combat("necromancer");
    affinity.block(necro);
    assert(affinity.reflection(necro, 0, false, 100) > 0);
    assert.equal(affinity.reflection(necro, 0, false, 100), 0);
    const druid = combat("druid");
    assert(affinity.healing(druid) > 1);
    druid.hp = druid.maxHp;
    core.playerAttack(druid, "defend", () => 0.99);
    assert.equal(druid.hp, druid.maxHp);
    const paladin = combat("paladin");
    core.playerAttack(paladin, "skill", () => 0.99);
    assert.equal(paladin.encounter.affinityCombat.guard, 0);
    core.playerAttack(paladin, "defend", () => 0.99);
    assert.equal(paladin.encounter.affinityCombat.guard, 1);
    assert(affinity.outgoing(paladin, false, false) > 1);
  });
  test("Read-only previews and UI do not mutate RNG/affinity; Discord bounds", () => {
    const s = combat("sorceress");
    const before = JSON.stringify(s);
    core.attackDamagePreview(s);
    core.skillDamagePreview(s);
    core.incomingPreview(s);
    for (const tab of ["items", "stats", "effects", "encounter"]) {
      const p = view.privatePayload(s, "session", "message", tab);
      let total = 0;
      for (const e of p.embeds) {
        const j = e.toJSON();
        for (const f of j.fields || []) {
          assert(f.value.length <= 1024);
          total += f.value.length + f.name.length;
        }
        total += (j.description || "").length + (j.title || "").length;
      }
      assert(total <= 6000);
    }
    assert.equal(JSON.stringify(s), before);
    assert(
      view
        .privatePayload(s, "session", "message", "items")
        .embeds[0].toJSON()
        .fields.some((f) => f.value.includes("Hợp class")),
    );
  });
  test("Affinity state rollback and replay restored from saved transaction snapshot", () => {
    const s = state(),
      before = JSON.stringify(s);
    const tx = db.transaction(() => {
      loot.single(s, "common", sequence([0.7, 0.3]), "tx");
      throw Error("ROLLBACK");
    });
    assert.throws(tx, /ROLLBACK/);
    const restored = JSON.parse(before);
    assert.equal(restored.affinityPity.missStreak, 0);
    const saved = JSON.stringify(restored);
    core.normalize(restored);
    assert.equal(
      JSON.stringify(restored.affinityPity),
      JSON.stringify(JSON.parse(saved).affinityPity),
    );
  });
  test("Tower snapshots survive changes to live catalog/profile; old payload outcomes identical", () => {
    const gen = require("../src/hardcore/tower/generator"),
      solver = require("../src/hardcore/tower/solver"),
      profiles = require("../src/hardcore/tower/classProfiles"),
      snap = require("../src/hardcore/tower/snapshots");
    const generated = gen.generate({
        isoYear: 2026,
        isoWeek: 42,
        classKey: "druid",
        seed: "equipment-v3-snapshot-fixture",
        startsAt: 1,
        endsAt: 2,
      }),
      p = generated.payload;
    assert.equal(p.catalogVersion, 3);
    assert.equal(p.itemDefinitionSnapshots.length, 100);
    assert(p.classProfileSnapshot && p.towerClassProfileSnapshot);
    const hash = solver.validate(p).solutionHash,
      before = JSON.stringify(p);
    const read = profiles.profile;
    profiles.profile = () => {
      throw Error("LIVE_PROFILE_READ");
    };
    const item = get("hunter_bow"),
      original = item.effects.dex;
    item.effects.dex = 999;
    assert.equal(solver.validate(p).solutionHash, hash);
    assert.equal(JSON.stringify(p), before);
    const old = structuredClone(p);
    for (const k of [
      "equipmentSnapshotVersion",
      "towerClassProfileSnapshot",
      "classProfileSnapshot",
      "itemDefinitionSnapshots",
      "catalogVersion",
      "affinityVersion",
      "equipmentRulesVersion",
    ])
      delete old[k];
    assert.equal(snap.read(old).heal, p.towerClassProfileSnapshot.heal);
    assert.equal(solver.validate(old).solutionHash, hash);
    item.effects.dex = original;
    profiles.profile = read;
  });

  test("Persisted transactions: Forge stale retries and affinity rollback", () => {
    const service = require("../src/services/hardcoreService"),
      repo = require("../src/services/hardcoreRepository"),
      inv = require("../src/hardcore/inventory/service");
    inv.grant("eq-v3", "player", "hunter_bow", 1);
    const run = service.startHardcore({
      guildId: "eq-v3",
      userId: "player",
      channelId: "c",
      stake: 10,
      classKey: "amazon",
      loadout: { itemIds: ["hunter_bow"] },
      forcedEncounter: { type: "empty", name: "Empty" },
    });
    const s = repo.parseState(repo.getSession(run.session.id));
    assert(rules.enabled(s));
    s.floor = 21;
    s.cleared = 20;
    s.encounter = {
      type: "surprise",
      kind: "horadric",
      name: "Forge",
      targetId: "hunter_bow",
      forge: forge.prepare(s, "hunter_bow"),
    };
    repo.saveState(run.session, s);
    const first = service.playHardcore({
      sessionId: run.session.id,
      userId: "player",
      expectedTurn: s.turn,
      action: "forge_grind",
    });
    assert.equal(first.state.encounter.forge.stage, "boon");
    assert.equal(first.state.items.length, 0);
    const persisted = repo.getSession(run.session.id).state_json;
    assert.throws(
      () =>
        service.playHardcore({
          sessionId: run.session.id,
          userId: "player",
          expectedTurn: s.turn,
          action: "forge_grind",
        }),
      /STALE_ACTION/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, persisted);
    const done = service.playHardcore({
      sessionId: run.session.id,
      userId: "player",
      expectedTurn: first.state.turn,
      action: "forge_boon_0",
    });
    assert.equal(done.state.sources.forgeBoon.dex, 1);
    const next = repo.parseState(repo.getSession(run.session.id));
    next.encounter = {
      type: "surprise",
      kind: "doors",
      name: "Doors",
      doors: { dark: true },
    };
    next.phase = "encounter";
    repo.saveState(run.session, next);
    const saved = repo.getSession(run.session.id).state_json,
      original = loot.single;
    try {
      loot.single = (...args) => {
        original(...args);
        throw Error("FORCED_LOOT_ROLLBACK");
      };
      assert.throws(
        () =>
          service.playHardcore({
            sessionId: run.session.id,
            userId: "player",
            expectedTurn: next.turn,
            action: "door_dark",
          }),
        /FORCED_LOOT_ROLLBACK/,
      );
      assert.equal(repo.getSession(run.session.id).state_json, saved);
    } finally {
      loot.single = original;
    }
    const reward = service.playHardcore({
      sessionId: run.session.id,
      userId: "player",
      expectedTurn: next.turn,
      action: "door_dark",
    });
    assert.equal(reward.state.items.length, 1);
    assert(
      reward.state.affinityPity.missStreak >= 0 &&
        reward.state.affinityPity.missStreak <= 3,
    );
    const stored = repo.getSession(run.session.id).state_json;
    assert.throws(
      () =>
        service.playHardcore({
          sessionId: run.session.id,
          userId: "player",
          expectedTurn: next.turn,
          action: "door_dark",
        }),
      /STALE_ACTION/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, stored);
  });
  test("Boss chest offers exactly one reward and keeps rarity/pity locked", () => {
    const s = combat("amazon"),
      world = require("../src/services/hardcoreWorld");
    s.floor = world.REGIONS.find((r) => r.start > 1).start;
    s.cleared = s.floor - 1;
    s.encounter.rank = "boss";
    s.encounter.hp = 1;
    s.encounter.maxHp = 1;
    s.encounter.evasion = 0;
    core.act(s, session, "attack", () => 0.5);
    assert.equal(s.phase, "boss_chest");
    assert.equal(s.encounter.offers.length, 3);
    assert.equal(new Set(s.encounter.offers.map((i) => i.id)).size, 3);
    const locked = JSON.stringify(s.encounter),
      pity = structuredClone(s.affinityPity);
    view.privatePayload(s, "s", "m", "encounter");
    assert.equal(JSON.stringify(s.encounter), locked);
    assert.deepEqual(s.affinityPity, pity);
    const before = s.items.reduce((n, i) => n + i.level, 0);
    core.act(s, session, "boss_pick_1", () => 0.99);
    assert.equal(
      s.items.reduce((n, i) => n + i.level, 0),
      before + 1,
    );
    assert.throws(() => core.act(s, session, "boss_pick_1", () => 0.99));
    assert.equal(
      s.items.reduce((n, i) => n + i.level, 0),
      before + 1,
    );
  });
  test("New affinity rates fit Discord fields; catalogs remain separated", () => {
    assert(view.ratesFields("loot").some((f) => f.value.includes("55%")));
    for (const category of ["loot", "combat", "rewards"])
      for (const field of view.ratesFields(category))
        assert(field.value.length <= 1024, field.name);
  });

  test("Large levels, full inventory UI and dormant off-class affinity", () => {
    for (const k of cls) {
      const s = state(k);
      for (const d of Object.values(catalog.ITEMS_V3).flat())
        core.receiveItem(s, d, 10);
      for (const tab of ["items", "stats", "effects"]) {
        const pages = tab === "items" ? 20 : 1;
        for (let page = 0; page < pages; page++) {
          const payload = view.privatePayload(s, "s", "m", tab, page);
          let total = 0;
          for (const embed of payload.embeds) {
            const e = embed.toJSON();
            total +=
              (e.title || "").length +
              (e.description || "").length +
              (e.footer?.text || "").length;
            assert((e.fields || []).length <= 25);
            for (const f of e.fields || []) {
              assert(f.value.length <= 1024);
              total += f.name.length + f.value.length;
            }
          }
          assert(total <= 6000, k + " " + tab + " page " + page + " " + total);
        }
      }
      const off = state(k),
        d = catalog.ITEMS_V3.common.find((i) => loot.relation(i, k) === "off");
      core.receiveItem(off, d);
      assert.equal(affinity.strength(off), 0);
    }
    const high = state();
    core.receiveItem(high, get("hunter_bow"), Number.MAX_SAFE_INTEGER);
    assert.equal(high.items[0].level, Number.MAX_SAFE_INTEGER);
    const saved = JSON.stringify(high);
    assert.throws(() => core.receiveItem(high, get("hunter_bow")));
    assert.equal(JSON.stringify(high), saved);
    const d = structuredClone(get("field_bandage"));
    d.effects = { heal: 10 };
    d.receipt.onDuplicate = false;
    const receipt = state("druid");
    receipt.hp = 1;
    core.receiveItem(receipt, d, 3);
    assert.equal(receipt.hp, 11);
  });

  test("Three-slot capacity, inaccessible branches and hidden reward resume", () => {
    for (const k of cls)
      for (const rarity of Object.keys(catalog.ITEMS_V3))
        for (const bucket of [0.1, 0.7, 0.9]) {
          const s = state(k),
            numbers = [];
          for (let slot = 0; slot < 3; slot++) {
            if (rarity === "cursed") numbers.push(0.99);
            numbers.push(bucket, 0);
          }
          const offered = loot.offers(
            s,
            [rarity, rarity, rarity],
            sequence(numbers),
            "three-slot",
          );
          assert.equal(new Set(offered.map((i) => i.id)).size, 3);
          assert(!s.affinityFallbackAudit);
        }
    assert(catalog.validateItems(catalog.ITEMS_V3));
    const s = state();
    s.encounter = {
      type: "rngesus",
      name: "RNGesus",
      prayerItem: null,
      prayerSuccess: true,
    };
    const before = structuredClone(s.affinityPity);
    core.normalize(s);
    assert.equal(s.encounter.prayerItem, null);
    assert.deepEqual(s.affinityPity, before);
    const blocked = state();
    blocked.floor = 20;
    blocked.potions = 0;
    blocked.affinityPity.missStreak = 3;
    const e = core.makeSurprise(blocked, () => 0.5, "adventurer");
    assert.equal(loot.relation(e.robItem, blocked.classKey), "match");
    assert.equal(blocked.affinityPity.missStreak, 0);
    assert.notEqual(
      loot.single(state(), "cursed", sequence([0.1, 0]), "equipment-only", {
        consumables: false,
      }).category,
      "consumable",
    );
  });
  console.log(
    "Equipment V3: " + groups + " deterministic groups passed; no simulations.",
  );
} finally {
  db.close();
}
