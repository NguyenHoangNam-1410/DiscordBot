"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const stats = require("../src/hardcore/engine/stats"),
  core = require("../src/hardcore/engine"),
  world = require("../src/hardcore/engine/world"),
  rift = require("../src/hardcore/rift"),
  bosses = require("../src/hardcore/bosses/mechanics"),
  awake = require("../src/hardcore/awakening"),
  view = require("../src/hardcore/ui");
const session = {
  id: "rift-test",
  guild_id: "g",
  channel_id: "c",
  user_id: "u",
};
let groups = 0;
function test(n, f) {
  f();
  groups++;
  console.log("PASS " + n);
}
function state(mods = {}, k = "amazon") {
  const s = stats.createState(k, 10000);
  Object.assign(s.rift.stacks, mods);
  s.floor = 101;
  s.encounter = {
    type: "combat",
    rank: "normal",
    name: "Fixture",
    hp: 1000,
    maxHp: 1000,
    defense: 0,
    resistance: 0,
    accuracy: 1000,
    evasion: 0,
    critChance: 0,
    damageMin: 100,
    damageMax: 100,
    damageType: "physical",
    nextDamageType: "physical",
    magicChance: 0.12,
    combatTurn: 1,
    frenzy: 0,
  };
  s.maxHp = s.hp = 10000;
  s.defense = s.resistance = 0;
  s.critChance = 0;
  s.accuracy = 100000;
  s.damageMin = s.damageMax = s.spellMin = s.spellMax = 100;
  core.prepareItemCombat(s, () => 0.99);
  return s;
}
function awakened(s) {
  const f = s.floor;
  s.floor = 100;
  assert(awake.grant(s, { rank: "boss", hp: 0 }));
  s.floor = f;
  awake.prepare(s);
}
try {
  test("Twelve saved eight-type bags; exact 96 awards, duplicate/final exclusions", () => {
    const s = stats.createState("amazon", 10);
    for (let cycle = 0; cycle < 12; cycle++) {
      const keys = [];
      for (let i = 1; i <= 8; i++)
        keys.push(rift.award(s, (cycle * 8 + i) * 10, () => 0.4).key);
      assert.equal(new Set(keys).size, 8);
    }
    assert.deepEqual(Object.values(s.rift.stacks), Array(8).fill(12));
    assert.equal(s.rift.cycle, 12);
    const saved = JSON.stringify(s);
    for (const floor of [960, 970, 980, 990, 333, 666, 999])
      assert.equal(
        rift.award(s, floor, () => {
          throw Error("reroll");
        }),
        null,
      );
    assert.equal(JSON.stringify(s), saved);
    const resumed = structuredClone(s);
    core.normalize(resumed);
    assert.deepEqual(resumed.rift, s.rift);
    assert.equal(resumed.modifiers, resumed.rift.stacks);
  });
  test("Stack cap rejects atomically; normalize clamps, validates bag; tier boundaries", () => {
    const s = stats.createState("amazon", 10);
    s.rift.bag = rift.KEYS.slice();
    s.rift.stacks.stone_skin = 12;
    const saved = JSON.stringify(s);
    assert.throws(() => rift.award(s, 10, () => 0.4), /RIFT_STACK_CAP/);
    assert.equal(JSON.stringify(s), saved);
    s.rift.stacks.stone_skin = 99;
    s.rift.stacks.soul_drain = -5;
    rift.normalize(s);
    assert.equal(s.rift.stacks.stone_skin, 12);
    assert.equal(s.rift.stacks.soul_drain, 0);
    assert.deepEqual(
      [0, 1, 4, 5, 8, 9, 12].map(rift.tier),
      [0, 1, 1, 2, 2, 3, 3],
    );
    s.rift.bagIndex = 9;
    assert.throws(() => rift.normalize(s), /INVALID_RIFT_BAG/);
  });
  test("Severance and divine cleanse preserve bag order and locked encounter", () => {
    const s = state({ stone_skin: 8, unstable_rift: 9, soul_drain: 8 });
    rift.award(s, 10, () => 0.4);
    const bag = JSON.stringify([s.rift.bag, s.rift.bagIndex, s.rift.cycle]),
      combat = JSON.stringify(s.encounter.rift);
    assert.equal(rift.sever(s, "soul_drain"), 8);
    assert.equal(s.rift.stacks.soul_drain, 0);
    assert.equal(JSON.stringify(s.encounter.rift), combat);
    assert.throws(() => rift.sever(s, "unstable_rift"));
    assert.equal(
      JSON.stringify([s.rift.bag, s.rift.bagIndex, s.rift.cycle]),
      bag,
    );
    require("../src/hardcore/events/blessing").restore(s);
    assert(Object.values(s.rift.stacks).every((n) => n === 0));
    assert.equal(
      JSON.stringify([s.rift.bag, s.rift.bagIndex, s.rift.cycle]),
      bag,
    );
  });
  test("New creation snapshot: Fortified 36%, Stone 18%, no old ACC/EVA/DEF bonus", () => {
    const s = stats.createState("amazon", 10);
    s.floor = 101;
    const base = world.makeEnemy(s, "normal", null, () => 0.4);
    Object.assign(s.rift.stacks, {
      fortified: 12,
      stone_skin: 12,
      swift_horror: 12,
      elemental_dominion: 12,
    });
    const e = world.makeEnemy(s, "normal", null, () => 0.4);
    assert.equal(e.maxHp, Math.round(base.maxHp * 1.36));
    assert.equal(e.defense, base.defense);
    assert.equal(e.evasion, base.evasion);
    assert.equal(e.accuracy, base.accuracy);
    assert.equal(e.damageMin, base.damageMin);
    assert.equal(e.magicChance, 0.36);
    assert.equal(e.rift.stoneArmor, Math.floor(e.maxHp * 0.18));
  });
  test("Stone absorbs physical/magic, spills HP, applies tier Broken DEF without HP healing armor", () => {
    const s = state({ stone_skin: 5 });
    s.encounter.defense = 100;
    assert.equal(s.encounter.rift.stoneArmor, 75);
    assert.equal(bosses.applyDamage(s, 100), 100);
    assert.equal(s.encounter.hp, 975);
    assert.equal(s.encounter.rift.stoneArmor, 0);
    assert(s.encounter.rift.brokenArmor);
    assert.equal(rift.enemyDefense(s, 100), 88);
    s.encounter.hp = 1000;
    assert.equal(s.encounter.rift.stoneArmor, 0);
    const p = state({ stone_skin: 1 }, "sorceress");
    core.playerAttack(p, "skill", () => 0.1);
    assert.equal(p.encounter.rift.stoneArmor, 0);
    assert(p.encounter.hp < 1000);
  });
  test("Barrage processes armor per hit and read-only preview matches actual", () => {
    const s = state({ stone_skin: 1 });
    s.encounter.defense = 100;
    const snapshot = JSON.stringify(s),
      preview = core.skillDamagePreview(s);
    assert.equal(JSON.stringify(s), snapshot);
    const out = core.playerAttack(s, "skill", () => 0.1);
    assert.equal(out.dealt, preview.low);
    assert(s.encounter.rift.brokenArmor);
    assert(s.encounter.hp < 1000);
  });
  test("Elemental: locked magic bonus only; no physical/fixed/true bonus", () => {
    const s = state({ elemental_dominion: 12 });
    s.encounter.damageType = "magic";
    s.encounter.nextDamageType = "magic";
    s.encounter.rift.lockedCounterType = "magic";
    const hp = s.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(hp - s.hp, 115);
    const p = state({ elemental_dominion: 12 });
    const before = p.hp;
    core.enemyTurn(p, () => 0.1);
    assert.equal(before - p.hp, 100);
    assert.equal(rift.counterFactor(s, { magic: true, raw: 100 }, false), 1);
    assert.equal(
      rift.counterFactor(s, { magic: true, trueDamage: true }, false),
      1,
    );
  });
  test("Bloodlust one counter only, defense halves bonus, heal does not retrigger", () => {
    const s = state({ bloodlust: 6 });
    bosses.applyDamage(s, 501);
    assert(s.encounter.rift.bloodlustReady);
    const hp = s.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(hp - s.hp, 124);
    assert(!s.encounter.rift.bloodlustReady);
    const hp2 = s.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(hp2 - s.hp, 100);
    s.encounter.hp = 1000;
    bosses.applyDamage(s, 501);
    assert(!s.encounter.rift.bloodlustReady);
    const d = state({ bloodlust: 6 });
    bosses.applyDamage(d, 501);
    const h = d.hp;
    core.enemyTurn(d, () => 0.1, true);
    assert.equal(h - d.hp, 95);
    const blocked = state({ bloodlust: 6 });
    bosses.applyDamage(blocked, 501);
    core.enemyTurn(blocked, () => 0.1, false, true);
    assert(!blocked.encounter.rift.bloodlustReady);
  });
  test("Fortified Exposed affects next whole action, not threshold action, skips nondamage", () => {
    const s = state({ fortified: 5 });
    s.encounter.hp = 550;
    const first = core.playerAttack(s, "attack", () => 0.1);
    assert.equal(first.dealt, 100);
    assert(s.encounter.rift.fortifiedExposed);
    core.playerAttack(s, "defend", () => 0.1);
    assert(s.encounter.rift.fortifiedExposed);
    const next = core.playerAttack(s, "skill", () => 0.1);
    assert.equal(next.dealt, 194);
    assert(!s.encounter.rift.fortifiedExposed);
  });
  test("Swift natural dodge guarantees all next physical hits; safe dodge excludes it", () => {
    const s = state({ swift_horror: 5 });
    s.evasion = 100000;
    s.encounter.accuracy = 1;
    core.enemyTurn(s, () => 0.99);
    assert(s.encounter.rift.swiftExposed);
    s.accuracy = 1;
    s.encounter.evasion = 100000;
    const out = core.playerAttack(s, "skill", () => 0.99);
    assert.match(out.log, /2\/2/);
    assert(!s.encounter.rift.swiftExposed);
    const blocked = state({ swift_horror: 12 }, "assassin");
    core.enemyTurn(blocked, () => 0.99, false, true);
    assert(!blocked.encounter.rift.swiftExposed);
    assert.equal(rift.hitChance(blocked, 0.95), 1);
  });
  test("Soul Drain zero-MP/defend/block; fracture bonus once, effective cap", () => {
    const s = state({ soul_drain: 8 });
    s.mana = 0;
    core.enemyTurn(s, () => 0.1);
    assert.equal(s.encounter.rift.soulDrainCharges, 2);
    core.enemyTurn(s, () => 0.1, true);
    assert.equal(s.encounter.rift.soulDrainCharges, 1);
    assert.equal(s.mana, 0);
    s.mana = 2;
    core.enemyTurn(s, () => 0.1);
    assert.equal(s.mana, 1);
    assert(s.encounter.rift.manaFracture);
    assert.equal(s.encounter.rift.soulDrainCharges, 0);
    s.maxMana = 10;
    core.playerAttack(s, "attack", () => 0.1);
    assert.equal(s.mana, 6);
    assert(!s.encounter.rift.manaFracture);
    const blocked = state({ soul_drain: 12 });
    core.enemyTurn(blocked, () => 0.1, false, true);
    assert.equal(blocked.encounter.rift.soulDrainCharges, 3);
  });
  test("Cursed Ground precedes Consecration and Guard without altering base stats", () => {
    const s = state({ cursed_ground: 12 }, "paladin");
    awakened(s);
    s.defense = 100;
    s.resistance = 50;
    s.encounter.awakeningCombat.ground = 2;
    assert.equal(rift.defense(s, 100), 76);
    assert.equal(core.effectiveResistance(s), 42);
    assert.equal(s.defense, 100);
    assert.equal(s.resistance, 50);
    const raw = core.attackDamage(s.encounter, s, s, () => 0.1, {
      raw: 100,
      critical: false,
      defend: true,
    }).damage;
    assert.equal(
      raw,
      Math.floor(100 * (1 - world.defenseReduction(76 * 1.2 * 2, 101)) * 0.85),
    );
    s.encounter.rift.lockedCounterType = "magic";
    assert.equal(core.effectiveResistance(s, 50, true), 57);
  });
  test("Unstable exact new odds, event reward exclusion, pity unchanged", () => {
    const s = state({ unstable_rift: 12 });
    s.pityRare = 0;
    assert.deepEqual(rift.unstable(s), {
      encounter: 0.09,
      ssr: 0.24,
      mimic: 0.18,
      ancient: 0.06,
    });
    const odds = core.chestOdds(s, true);
    assert.equal(odds.ancient_mimic, 0.09);
    assert.equal(odds.mimic, 0.3);
    assert(Math.abs(odds.legendary / (1 - 0.09 - 0.3) - 0.59) < 1e-10);
    const event = core.makeChest(s, () => 0.99, true, { riftEligible: false });
    assert.equal(event.odds.ancient_mimic, 0.03);
    assert.equal(event.odds.mimic, 0.12);
    const pity = s.pityRare;
    core.makeChest(s, () => 0.99, true);
    assert.equal(s.pityRare, pity);
  });

  test("Pending awards wait for checkpoint and resume without reroll or duplicate", () => {
    const s = state();
    s.floor = 10;
    s.encounter.hp = 0;
    s.rift.bag = rift.KEYS.slice();
    s.rift.stacks.stone_skin = 4;
    core.completeFloor(s, session, () => 0.99);
    assert.equal(s.phase, "upgrade");
    assert.equal(s.rift.stacks.stone_skin, 4);
    assert.equal(s.rift.pendingAward.key, "stone_skin");
    const restored = structuredClone(s);
    core.normalize(restored);
    core.act(restored, session, "upgrade_str", () => 0.99);
    assert.equal(restored.rift.stacks.stone_skin, 5);
    assert.equal(restored.rift.pendingAward, undefined);
    assert.match(restored.lastLog, /Rift II/);
    const saved = JSON.stringify(restored);
    assert.throws(
      () => core.act(restored, session, "upgrade_str", () => 0.99),
      /INVALID_ACTION/,
    );
    assert.equal(JSON.stringify(restored), saved);
  });
  test("Pending award survives blessing and cap rejection is atomic", () => {
    const s = stats.createState("amazon", 10);
    s.rift.bag = rift.KEYS.slice();
    s.rift.stacks.stone_skin = 8;
    rift.reserve(s, 10, () => 0.4);
    assert.equal(s.rift.stacks.stone_skin, 8);
    rift.clear(s);
    assert.equal(rift.claimPending(s).after, 1);
    assert.equal(rift.claimPending(s), null);
    assert.equal(s.rift.bagIndex, 1);
    const t = stats.createState("amazon", 10);
    t.rift.bag = rift.KEYS.slice();
    rift.reserve(t, 10, () => 0.4);
    t.rift.stacks.stone_skin = 12;
    const before = JSON.stringify(t);
    assert.throws(() => rift.claimPending(t), /RIFT_STACK_CAP/);
    assert.equal(JSON.stringify(t), before);
  });
  test("Legacy snapshots and Tower stay on old rules", () => {
    for (const version of [2, 3]) {
      const s = stats.createState("amazon", 10, { gameplayVersion: version });
      delete s.rift;
      s.modifiers = { fortified: 8, stone_skin: 8 };
      core.normalize(s);
      assert(!rift.enabled(s));
      assert.equal(s.rift, undefined);
      const e = world.makeEnemy(s, "normal", null, () => 0.4);
      assert.equal(e.rift, undefined);
      assert(
        e.defense >
          world.makeEnemy({ ...s, modifiers: {} }, "normal", null, () => 0.4)
            .defense,
      );
    }
    const t = stats.createState("amazon", 10);
    t.mode = "tower_weekly";
    assert(!rift.enabled(t));
    const before = JSON.stringify(t);
    assert.equal(
      rift.award(t, 10, () => 0.4),
      null,
    );
    assert.equal(JSON.stringify(t), before);
  });
  test("Separate Deimoss HP bars rearm thresholds; same-bar phases and healing do not", () => {
    const s = state({ bloodlust: 8, fortified: 8, stone_skin: 8 });
    s.encounter.boss = { id: "deimoss", phase: 1 };
    rift.thresholds(s, 1000, 400);
    assert(s.encounter.rift.bloodlustUsedByPhase[1]);
    assert(s.encounter.rift.fortifiedUsedByPhase[1]);
    s.encounter.rift.bloodlustReady = false;
    s.encounter.rift.fortifiedExposed = false;
    rift.thresholds(s, 1000, 400);
    assert(!s.encounter.rift.bloodlustReady);
    s.encounter.boss.phase = 2;
    rift.thresholds(s, 1000, 400);
    assert(s.encounter.rift.bloodlustReady);
    assert(s.encounter.rift.fortifiedUsedByPhase[2]);
    const armor = s.encounter.rift.stoneArmor;
    s.encounter.hp = 1000;
    assert.equal(s.encounter.rift.stoneArmor, armor);
    const p = state({ bloodlust: 8 });
    p.encounter.boss = { id: "baal", phase: 1 };
    rift.thresholds(p, 1000, 400);
    p.encounter.rift.bloodlustReady = false;
    p.encounter.boss.phase = 2;
    rift.thresholds(p, 1000, 400);
    assert(!p.encounter.rift.bloodlustReady);
  });
  test("Swift Exposed applies to Arcane Echo and Grave Nova of the same action", () => {
    for (const key of ["sorceress", "necromancer"]) {
      const s = state({ swift_horror: 8, stone_skin: 1 }, key);
      awakened(s);
      if (key === "sorceress") s.classAwakening.echo = 1;
      else s.classAwakening.totems = 2;
      s.encounter.rift.swiftExposed = true;
      s.mana = 10;
      s.maxMana = 10;
      const before = JSON.stringify(s),
        forecast = core.skillDamagePreview(s);
      assert.equal(JSON.stringify(s), before);
      const out = core.playerAttack(s, "skill", () => 0.1);
      assert.equal(out.dealt, forecast.low);
      assert(!s.encounter.rift.swiftExposed);
      assert(s.encounter.rift.brokenArmor);
      assert.match(out.log, key === "sorceress" ? /Arcane Echo/ : /Grave Nova/);
    }
  });
  test("Rift counter reduces before Bark/Fury and boss MP drain explicitly replaces Soul", () => {
    const s = state(
      { cursed_ground: 12, elemental_dominion: 12, soul_drain: 12 },
      "druid",
    );
    awakened(s);
    s.classAwakening.bark = 200;
    s.encounter.rift.lockedCounterType = "magic";
    const hp = s.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(s.hp, hp);
    assert.equal(s.classAwakening.bark, 65);
    assert.equal(s.encounter.rift.soulDrainCharges, 3);
    const b = state({ bloodlust: 12 }, "barbarian");
    awakened(b);
    b.encounter.awakeningCombat.barrier = 200;
    const prior = awake.fury(b);
    core.enemyTurn(b, () => 0.1);
    assert.equal(awake.fury(b), prior);
    const own = state({ soul_drain: 12 });
    own.encounter.boss = { version: 2, id: "baal", mechanicState: {} };
    assert(rift.bossOwnDrain(own));
    const mp = own.mana;
    rift.finishCounter(own, { hit: true, physical: true, defend: false });
    assert.equal(own.mana, mp);
    assert.equal(own.encounter.rift.soulDrainCharges, 3);
    assert.match(rift.description("soul_drain", 12, own), /thay thế/);
  });

  test("All Rift private pages fit Discord and reopening keeps locked combat state", () => {
    const s = state(Object.fromEntries(rift.KEYS.map((k) => [k, 12])));
    bosses.applyDamage(s, 800);
    rift.finishCounter(s, { hit: true, physical: true, defend: false });
    const before = JSON.stringify(s);
    for (const tab of ["effects", "stats", "encounter"]) {
      const payload = view.privatePayload(s, session.id, "message", tab);
      for (const e of payload.embeds.map((e) => e.toJSON())) {
        assert((e.fields || []).every((f) => f.value.length <= 1024));
        assert(
          (e.title || "").length +
            (e.description || "").length +
            (e.footer?.text || "").length +
            (e.fields || []).reduce(
              (n, f) => n + f.name.length + f.value.length,
              0,
            ) <=
            6000,
        );
      }
    }
    assert.equal(JSON.stringify(s), before);
    const restored = structuredClone(s);
    core.normalize(restored);
    core.prepareItemCombat(restored, () => {
      throw Error("resume reroll");
    });
    assert.equal(
      JSON.stringify(restored.encounter.rift),
      JSON.stringify(s.encounter.rift),
    );
  });

  test("Modern boss immunity takes priority over Stone; saved boss healing cannot restore armor", () => {
    const s = stats.createState("amazon", 10000);
    s.bossRosterVersion = 2;
    s.floor = 100;
    s.rift.stacks.stone_skin = 8;
    s.encounter = world.makeEnemy(
      s,
      "boss",
      null,
      () => 0.4,
      require("../src/hardcore/bosses/catalogV2").CATALOG.jitan,
    );
    core.prepareItemCombat(s, () => 0.4);
    const armor = s.encounter.rift.stoneArmor;
    assert(armor > 0);
    assert.equal(bosses.applyDamage(s, 100), 0);
    assert.equal(s.encounter.rift.stoneArmor, armor);
    s.encounter.boss.mechanicState.openUntil = s.encounter.boss.round + 3;
    assert.equal(bosses.applyDamage(s, armor + 1), armor + 1);
    assert(s.encounter.rift.brokenArmor);
    s.encounter.hp = s.encounter.maxHp;
    bosses.refresh(s);
    assert.equal(s.encounter.rift.stoneArmor, 0);
    const resumed = structuredClone(s);
    core.normalize(resumed);
    assert(resumed.encounter.rift.brokenArmor);
    assert.equal(resumed.encounter.rift.stoneArmor, 0);
  });

  test("Broken Armor reduces physical DEF and magical RES by tier, with clear shield HP UI", () => {
    for (const [stack, rate] of [
      [1, 0.08],
      [5, 0.12],
      [9, 0.16],
    ]) {
      const s = state({ stone_skin: stack }, "sorceress");
      s.encounter.defense = 100;
      s.encounter.resistance = 50;
      s.encounter.rift.stoneArmor = s.encounter.rift.stoneArmorMax = 2;
      const before = core.attackDamage(s, s.encounter, s, () => 0.1, {
        player: true,
        magic: true,
        raw: 100,
        critical: false,
      }).damage;
      assert.equal(before, 50);
      bosses.applyDamage(s, 3);
      assert.equal(rift.enemyDefense(s, 100), Math.floor(100 * (1 - rate)));
      assert.equal(rift.enemyResistance(s, 50), 50 * (1 - rate));
      const after = core.attackDamage(s, s.encounter, s, () => 0.1, {
        player: true,
        magic: true,
        raw: 100,
        critical: false,
      }).damage;
      assert.equal(after, Math.round(100 * (1 - (50 * (1 - rate)) / 100)));
      assert.equal(s.encounter.resistance, 50);
      assert.match(
        rift.battle(s),
        /Lá chắn đá \*\*2 HP\*\* · còn \*\*0 HP\*\*/,
      );
      assert.match(rift.description("stone_skin", stack, s), /RES/);
    }
  });

  test("Lethal attacks and skills display post-resistance strength while HP loss stays capped", () => {
    for (const key of Object.keys(stats.CLASSES))
      for (const action of ["attack", "skill"]) {
        const s = state({}, key);
        s.encounter.hp = 1;
        s.encounter.resistance = 20;
        s.mana = s.maxMana;
        const snapshot = JSON.stringify(s);
        const preview =
          action === "skill"
            ? core.skillDamagePreview(s)
            : core.attackDamagePreview(s);
        assert(preview.low > 1, key + " " + action + " uncapped forecast");
        assert.equal(JSON.stringify(s), snapshot);
        const result = core.playerAttack(s, action, () => 0.5);
        assert.equal(result.dealt, 1);
        assert.equal(s.encounter.hp, 0);
        const amount = Number(result.log.match(/: (\d+) DMG/)[1]);
        assert(amount > 1, key + " " + action + " uncapped log");
      }
    const s = state({ stone_skin: 1 }, "sorceress");
    s.encounter.hp = 1;
    s.mana = s.maxMana;
    const result = core.playerAttack(s, "skill", () => 0.5);
    assert.equal(result.dealt, 16);
    assert(Number(result.log.match(/: (\d+) DMG/)[1]) > 16);
  });
  console.log(groups + " deterministic Rift groups passed; no simulations.");
} finally {
  db.close();
}
