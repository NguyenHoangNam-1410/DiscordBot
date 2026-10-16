"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world"),
  boss = require("../src/hardcore/bosses/mechanics"),
  guardian = require("../src/hardcore/bosses/guardian"),
  catalog = require("../src/hardcore/bosses/catalogV2"),
  awake = require("../src/hardcore/awakening");
const rng = () => 0.5;
let count = 0;
function test(name, f) {
  f();
  count++;
  console.log("PASS " + name);
}
function fresh(id = "butcher", key = "sorceress", rank = "boss") {
  const s = stats.createState(key, 100000);
  s.bossRosterVersion = 2;
  s.floor = 100;
  s.cleared = 99;
  stats.addSource(s, { vit: 10000, ene: 10000, str: 10000, dex: 10000 });
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.encounter = world.makeEnemy(s, rank, null, rng, catalog.CATALOG[id]);
  core.prepareItemCombat(s, rng);
  return s;
}
try {
  test("Every boss and final boss caps a hit and all damage in the same turn", () => {
    for (const rank of ["boss", "final_boss"]) {
      const s = fresh("butcher", "sorceress", rank),
        e = s.encounter;
      boss.beginAction(s, "skill");
      const max = e.maxHp,
        cap = Math.floor(max / 5);
      assert.equal(boss.damageStrength(s, max * 10), cap);
      assert.equal(boss.applyDamage(s, 1), 1);
      assert.equal(boss.applyDamage(s, max * 10), cap - 1);
      assert.equal(guardian.direct(s, max), 0);
      assert.equal(boss.applyDamage(s, max), 0);
      assert.equal(max - e.hp, cap);
      boss.beginAction(s, "defend");
      assert.equal(boss.applyDamage(s, max), cap);
    }
  });
  test("Echo, Nova, physical multi-hit and their previews share the turn cap", () => {
    for (const key of ["sorceress", "necromancer", "amazon"]) {
      const s = fresh("butcher", key),
        e = s.encounter;
      awake.grant(s, { rank: "boss", hp: 0 });
      s.classAwakening.echo = 1;
      s.classAwakening.totems = awake.tuning(s).totems - 1;
      s.spellMin = s.spellMax = s.damageMin = s.damageMax = 1000000;
      s.accuracy = 1000000;
      const before = JSON.stringify(s),
        cap = Math.floor(e.maxHp / 5);
      const forecast = core.skillDamagePreview(s);
      assert(forecast.low <= cap && forecast.high <= cap, key + " preview");
      assert.equal(JSON.stringify(s), before, "preview is read-only");
      const start = e.hp,
        result = core.playerAttack(s, "skill", rng);
      assert(start - e.hp <= cap, key + " damage");
      assert(result.dealt <= cap);
      assert.equal(boss.applyDamage(s, e.maxHp), 0, key + " exhausted budget");
    }
  });
  test("Reflection uses the same budget, even after the main attack and counter", () => {
    const s = fresh("butcher", "barbarian"),
      e = s.encounter,
      max = e.maxHp;
    // A guaranteed thorns source with no dependency on a particular catalog rarity.
    s.items = Object.values(core.ITEMS)
      .flat()
      .filter((i) => i.id === "living_armor")
      .map((definition) => ({ definition, level: 1 }));
    assert.equal(s.items.length, 1);
    core.prepareItemCombat(s, rng);
    s.defense = s.resistance = 0;
    s.damageMin = s.damageMax = 1000000;
    boss.beginAction(s, "attack");
    boss.applyDamage(s, max);
    core.enemyTurn(s, () => 0);
    assert(max - e.hp <= Math.floor(max / 5));
    assert.equal(guardian.direct(s, max), 0);
    boss.beginAction(s, "defend");
    s.passiveCounterUsed = 0;
    const beforeReflect = e.hp;
    const reflected = core.enemyTurn(s, () => 0);
    assert(reflected.includes("Gai"));
    assert(
      e.hp < beforeReflect,
      "Reflection really triggers when budget is available",
    );
    assert(beforeReflect - e.hp <= Math.floor(max / 5));
  });
  test("Auxiliary targets ignore the cap and do not consume the body budget", () => {
    const s = fresh("necrobot"),
      e = s.encounter,
      m = e.boss.mechanicState;
    boss.beginAction(s, "skill");
    for (const name of Object.keys(m.targets)) {
      m.target = name;
      const hp = m.targets[name].hp;
      assert.equal(boss.applyDamage(s, hp * 100), hp);
      assert.equal(e.towerGuardian.spent, 0);
    }
    m.target = "boss";
    assert.equal(
      boss.applyDamage(s, e.maxHp * 100),
      Math.floor(m.coreMaxHp / 5),
    );
  });
  test("Stone Armor consumes no HP budget and each individual hit remains capped", () => {
    const s = fresh(),
      e = s.encounter,
      cap = Math.floor(e.maxHp / 5),
      before = e.hp;
    e.rift.stoneArmor = e.rift.stoneArmorMax = Math.floor(cap / 2);
    e.rift.stacks.stone_skin = 1;
    boss.beginAction(s, "skill");
    assert.equal(boss.applyDamage(s, e.maxHp), cap);
    assert.equal(e.towerGuardian.spent, cap - e.rift.stoneArmorMax);
    boss.applyDamage(s, e.maxHp);
    assert.equal(before - e.hp, cap);
    assert.equal(boss.applyDamage(s, e.maxHp), 0);
  });
  test("Free target selectors preserve an exhausted body budget", () => {
    const s = fresh("necrobot");
    boss.beginAction(s, "skill");
    guardian.direct(s, s.encounter.maxHp);
    const before = structuredClone(s.encounter.towerGuardian);
    const choice = boss
      .choices(s)
      .find((o) => !o.disabled && boss.isFree(s, o.action));
    assert(choice);
    core.act(s, { id: "guardian", user_id: "guardian" }, choice.action, rng);
    assert.deepEqual(s.encounter.towerGuardian, before);
  });
  test("Scripted boss damage and all 41 roster bodies use the same cap", () => {
    for (const definition of [...catalog.POOL, ...catalog.FIXED]) {
      const s = fresh(definition.id),
        cap = Math.floor(
          (s.encounter.boss.mechanicState.coreMaxHp ?? s.encounter.maxHp) / 5,
        );
      boss.beginAction(s, "skill");
      assert(guardian.direct(s, s.encounter.maxHp * 100) <= cap, definition.id);
      assert.equal(
        guardian.direct(s, s.encounter.maxHp * 100),
        0,
        definition.id,
      );
    }
    const s = fresh("machine");
    boss.beginAction(s, "skill");
    guardian.direct(s, s.encounter.maxHp);
    s.encounter.boss.mechanicState.heat = 100;
    const hp = s.encounter.hp;
    boss.beforeResolution(s, { hurt: () => 0 });
    assert.equal(
      s.encounter.hp,
      hp,
      "Meltdown cannot exceed a spent turn budget",
    );
  });
  test("Normal/elite remain uncapped, and the cap does not round above 20 percent", () => {
    for (const rank of ["normal", "elite"]) {
      const s = { encounter: { rank, hp: 1000, maxHp: 1000 } };
      assert.equal(guardian.direct(s, 900), 900);
    }
    const s = { encounter: { rank: "boss", hp: 1003, maxHp: 1003 } };
    assert.equal(guardian.direct(s, 9999), 200);
  });
  test("Saved progress, healing and phase changes do not refund the turn budget", () => {
    let s = fresh(),
      max = s.encounter.maxHp,
      cap = Math.floor(max / 5);
    boss.beginAction(s, "skill");
    boss.applyDamage(s, cap - 10);
    s = core.normalize(JSON.parse(JSON.stringify(s)));
    assert.equal(guardian.direct(s, max), 10);
    s.encounter.hp = max;
    s.encounter.boss.phase++;
    assert.equal(guardian.direct(s, max), 0);
    boss.beginAction(s, "potion");
    assert.equal(guardian.direct(s, max), cap);
    s.encounter.towerGuardian.spent = -1;
    assert.throws(() => core.normalize(s), /INVALID_TOWER_GUARDIAN/);
  });
  test("Actual phase transition preserves the remaining budget; legacy bosses also cap damage", () => {
    const s = fresh("deimoss");
    s.encounter.hp = 0;
    assert(boss.advancePhase(s));
    boss.beginAction(s, "skill");
    const cap = Math.floor(s.encounter.maxHp / 5);
    s.encounter.hp = 10;
    assert.equal(boss.applyDamage(s, 1000000), 10);
    assert(boss.advancePhase(s));
    assert.equal(s.encounter.towerGuardian.spent, 10);
    assert(boss.applyDamage(s, 1000000) <= cap - 10);
    const old = stats.createState("sorceress", 100000);
    old.floor = 50;
    old.bossRosterVersion = 1;
    old.encounter = world.makeEnemy(old, "boss", null, rng);
    boss.beginAction(old, "skill");
    assert.equal(
      boss.applyDamage(old, 1000000),
      Math.floor(old.encounter.maxHp / 5),
    );
    assert.equal(boss.applyDamage(old, 1000000), 0);
  });
  test("Old saved encounters initialize lazily; boss details explain the passive", () => {
    const s = fresh();
    delete s.encounter.towerGuardian;
    assert.doesNotThrow(() => core.normalize(s));
    assert.equal(
      boss.applyDamage(s, s.encounter.maxHp * 10),
      Math.floor(s.encounter.maxHp / 5),
    );
    assert(
      require("../src/hardcore/bosses/display")
        .details(s)
        .includes("Tower's Guardian"),
    );
  });
  console.log(count + " Tower's Guardian groups passed.");
} finally {
  db.close();
}
