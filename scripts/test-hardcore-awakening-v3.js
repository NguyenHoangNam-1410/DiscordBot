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
  awake = require("../src/hardcore/awakening");
const session = {
  id: "awakening-test",
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
function enemy() {
  return {
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
}
function state(k, awakened = true) {
  const s = stats.createState(k, 10000);
  // These fixtures verify the saved V3.0 Awakening contract; V3.1 has its own suite.
  s.releaseVersion = s.balanceVersion = "3.0.0";
  delete s.classInnateVersion;
  delete s.statProfile.initialVitHp;
  if (k === "amazon") Object.assign(s.statProfile.mastery, { hp: 3, evasion: 0.3 });
  if (k === "assassin") { s.statProfile.mastery.hp = 3; s.statProfile.core.baseHp = 38; }
  stats.recompute(s);
  s.hp = s.maxHp;
  s.floor = 100;
  s.encounter = { ...enemy(), rank: "boss", hp: 0 };
  if (awakened) assert(awake.grant(s, s.encounter));
  s.floor = 101;
  s.encounter = enemy();
  core.prepareItemCombat(s, () => 0.99);
  s.accuracy = 100000;
  s.mana = 10;
  s.maxMana = 10;
  return s;
}
function attack(s, a = "skill", r = () => 0.1) {
  return core.playerAttack(s, a, r);
}
try {
  test("Grant once only after living final kill at floor 100", () => {
    for (const k of Object.keys(stats.CLASSES)) {
      const s = state(k, false);
      s.floor = 100;
      s.encounter.rank = "boss";
      s.encounter.hp = 0;
      assert(awake.grant(s, s.encounter));
      assert(!awake.grant(s, s.encounter));
      assert.equal(s.items.length, 0);
      const copy = structuredClone(s);
      core.normalize(copy);
      assert.deepEqual(copy.classAwakening, s.classAwakening);
    }
    for (const patch of [
      { floor: 99 },
      { hp: 0 },
      { gameplayVersion: 2 },
      { classAwakeningVersion: undefined },
    ]) {
      const s = state("amazon", false);
      s.floor = 100;
      s.encounter.hp = 0;
      s.encounter.rank = "boss";
      Object.assign(s, patch);
      assert(!awake.grant(s, s.encounter));
    }
  });
  test("Amazon focus, miss, extra hit, shrine four shots", () => {
    const boosted = state("amazon");
    boosted.damageMin = boosted.damageMax = 100;
    boosted.critChance = 0;
    boosted.encounter.rank = "boss";
    boosted.encounter.defense = 100;
    boosted.bossDamage = 0.5;
    boosted.classAwakening.focus = 2;
    const forecast = core.skillDamagePreview(boosted);
    assert.equal(forecast.low, attack(boosted, "skill", () => 0.4).dealt);
    const s = state("amazon");
    attack(s, "attack");
    attack(s, "attack");
    assert.equal(s.classAwakening.focus, 2);
    const out = attack(s);
    assert.match(out.log, /3\/3/);
    assert.equal(s.classAwakening.focus, 0);
    s.classAwakening.focus = 2;
    s.classShrine = { classKey: "amazon", from: 101, until: 110 };
    assert.match(attack(s).log, /4\/4/);
    const miss = state("amazon");
    miss.accuracy = 0;
    miss.encounter.evasion = 100000;
    attack(miss, "attack", () => 0.99);
    assert.equal(miss.classAwakening.focus, 0);
  });
  test("Barbarian thresholds once, low start, Fury barrier and reset", () => {
    const paid = state("barbarian");
    paid.skillHpCost = 0.3;
    attack(paid);
    assert.equal(awake.fury(paid), 1);
    assert.equal(awake.combat(paid).barrier, 0);
    const s = state("barbarian");
    const m = s.maxHp;
    core.hurt(s, Math.ceil(m * 0.8));
    assert.equal(awake.fury(s), 3);
    s.hp = m;
    core.hurt(s, Math.ceil(m * 0.8));
    assert.equal(awake.fury(s), 3);
    attack(s);
    assert.equal(awake.fury(s), 0);
    assert.equal(awake.combat(s).barrier, Math.floor(m * 0.15));
    const hp = s.hp;
    core.hurt(s, 1);
    assert.equal(s.hp, hp);
    assert.equal(awake.combat(s).barrier, Math.floor(m * 0.15) - 1);
    s.encounter = enemy();
    s.hp = Math.floor(m * 0.4);
    core.prepareItemCombat(s, () => 0.99);
    assert.equal(awake.fury(s), 1);
    assert.equal(awake.combat(s).barrier, 0);
    assert.deepEqual(awake.combat(s).crossed, [0.75, 0.5]);
  });
  test("Assassin action dedup, natural dodge versus guaranteed, enhanced skill", () => {
    const s = state("assassin");
    awake.shadow(s);
    awake.shadow(s);
    assert.equal(s.classAwakening.shadow, 1);
    s.encounter.awakeningShadowGranted = false;
    awake.shadow(s);
    assert.equal(core.skillManaCost(s), 1);
    const before = s.mana;
    attack(s);
    assert.equal(s.mana, before - 1);
    assert(s.classAwakening.shadow <= 1);
    const t = state("assassin");
    core.enemyTurn(t, () => 0.99, false, true);
    assert.equal(t.classAwakening.shadow, 0);
    t.encounter.accuracy = 0;
    t.evasion = 100000;
    core.enemyTurn(t, () => 0.99);
    assert.equal(t.classAwakening.shadow, 1);
  });
  test("Sorceress paid MP only; creation does not echo same action; no recursive progress", () => {
    const s = state("sorceress");
    assert.doesNotMatch(attack(s).log, /Arcane Echo/);
    assert.equal(s.classAwakening.echoProgress, 2);
    s.mana = 10;
    assert.doesNotMatch(attack(s).log, /Arcane Echo/);
    assert.equal(s.classAwakening.echo, 1);
    assert.equal(s.classAwakening.echoProgress, 1);
    s.mana = 10;
    assert.match(attack(s).log, /Arcane Echo/);
    assert.equal(s.classAwakening.echo, 0);
    assert.equal(s.classAwakening.echoProgress, 1);
    const free = state("sorceress");
    free.classShrine = { classKey: "sorceress", from: 101, until: 110 };
    attack(free);
    assert.equal(free.classAwakening.echoProgress, 0);
  });
  test("Druid missing HP, full HP, reduced healing, barrier cap and event isolation", () => {
    for (const [missing, fraction] of [
      [0.12, 0.04],
      [0.06, 0.07],
      [0, 0.1],
    ]) {
      const s = state("druid");
      s.maxHp = 1000;
      s.hp = 1000 - Math.floor(missing * 1000);
      attack(s);
      assert.equal(s.classAwakening.bark, Math.floor(1000 * fraction));
    }
    const s = state("druid");
    s.healingReduction = 1;
    attack(s);
    assert.equal(s.classAwakening.bark, 0);
    s.healingReduction = 0;
    attack(s);
    attack(s);
    attack(s);
    assert.equal(s.classAwakening.bark, Math.floor(s.maxHp * 0.2));
    s.classAwakening.bark = 0;
    s.hp = 1;
    core.healEvent(s, s.maxHp);
    assert.equal(s.classAwakening.bark, 0);
  });
  test("Necromancer third skill Nova once, MP refund and no extra resource", () => {
    const s = state("necromancer");
    attack(s);
    attack(s);
    assert.equal(s.classAwakening.totems, 2);
    s.mana = 10;
    const out = attack(s);
    assert.match(out.log, /Grave Nova/);
    assert.equal(s.classAwakening.totems, 0);
    assert.equal(s.mana, 9);
    assert(out.dealt > 0);
  });
  test("Paladin two damaging actions, defense and potion do not consume, refresh", () => {
    const s = state("paladin");
    attack(s);
    assert.equal(awake.combat(s).ground, 2);
    assert.equal(awake.incomingDefense(s), 1.2);
    attack(s, "defend");
    assert.equal(awake.combat(s).ground, 2);
    s.hp--;
    attack(s, "potion");
    assert.equal(awake.combat(s).ground, 2);
    assert.match(attack(s, "attack").log, /Consecration/);
    assert.equal(awake.combat(s).ground, 1);
    assert.match(attack(s, "attack").log, /Consecration/);
    assert.equal(awake.combat(s).ground, 0);
    assert.equal(awake.incomingRes(s), 10);
    attack(s, "defend");
    assert.equal(awake.incomingRes(s), 0);
    attack(s);
    assert.equal(awake.combat(s).ground, 2);
  });
  test("Persistent resources resume and preview are read-only", () => {
    for (const k of Object.keys(stats.CLASSES)) {
      const s = state(k);
      attack(s);
      const a = structuredClone(s.classAwakening);
      for (let i = 0; i < 3; i++) {
        core.skillDamagePreview(s);
        core.attackDamagePreview(s);
        awake.description(s);
        core.normalize(s);
      }
      assert.deepEqual(s.classAwakening, a);
      s.encounter = enemy();
      core.prepareItemCombat(s, () => 0.99);
      assert.deepEqual(s.classAwakening, a);
    }
  });
  test("Actual boss completion grants before chest; reward remains", () => {
    const s = state("amazon", false);
    s.floor = 100;
    s.encounter = { ...enemy(), rank: "boss", hp: 1 };
    s.encounter.maxHp = 1;
    core.act(s, session, "attack", () => 0.1);
    assert(s.classAwakening);
    assert.equal(s.phase, "boss_chest");
    assert(s.encounter.type === "boss_chest");
    assert.equal(s.bossKills, 1);
  });
  test("Version safety and resource corruption", () => {
    const s = state("amazon");
    s.classAwakening.focus = 3;
    assert.throws(() => core.normalize(s), /INVALID_AWAKENING_RESOURCE/);
    const old = state("amazon", false);
    delete old.classAwakeningVersion;
    old.floor = 100;
    old.encounter.hp = 0;
    old.encounter.rank = "boss";
    assert(!awake.grant(old, old.encounter));
    assert.equal(awake.description(old), "");
  });

  test("Multiple boss phases retain resources; third Totem grants exactly one Nova", () => {
    const bosses = require("../src/hardcore/bosses/mechanics");
    for (const version of [1, 2]) {
      const s = state("necromancer");
      s.floor = 999;
      s.cleared = 998;
      s.bossRosterVersion = version;
      if (version === 2)
        s.bossDamageProfile =
          require("../src/hardcore/bosses/balanceV2").snapshot(s.classKey);
      stats.addSource(s, { vit: 10000, ene: 1000 }, "test");
      s.hp = s.maxHp;
      s.mana = s.maxMana;
      s.encounter = core.generateEncounter(s, session, () => 0.5);
      s.classAwakening.totems = 2;
      s.encounter.hp = 1;
      core.act(s, session, "skill", () => 0.1);
      assert.equal(s.encounter.boss.phase, 2);
      assert.equal(s.classAwakening.totems, 0);
      assert.equal((s.lastLog.match(/Grave Nova: hồi/g) || []).length, 1);
      assert.equal(s.cleared, 998);
      assert(awake.active(s));
      assert(!s.encounter.defeatSettled);
    }
  });
  test("Service transaction persists awakening, rejects retry, rolls back grant failure", () => {
    const service = require("../src/services/hardcoreService"),
      repo = require("../src/services/hardcoreRepository");
    const run = service.startHardcore({
      guildId: "awaken",
      userId: "player",
      channelId: "c",
      stake: 10,
      classKey: "sorceress",
      forcedEncounter: { type: "empty", name: "Empty" },
    });
    const s = repo.parseState(repo.getSession(run.session.id));
    s.floor = 100;
    s.cleared = 99;
    s.bossRosterVersion = 1;
    delete s.bossDamageProfile;
    s.encounter = { ...enemy(), rank: "boss", hp: 1, maxHp: 1 };
    s.mana = s.maxMana;
    repo.saveState(run.session, s);
    const saved = repo.getSession(run.session.id).state_json,
      grant = awake.grant;
    try {
      awake.grant = (...args) => {
        grant(...args);
        throw Error("AWAKENING_ROLLBACK");
      };
      assert.throws(
        () =>
          service.playHardcore({
            sessionId: run.session.id,
            userId: "player",
            expectedTurn: s.turn,
            action: "skill",
          }),
        /AWAKENING_ROLLBACK/,
      );
      assert.equal(repo.getSession(run.session.id).state_json, saved);
    } finally {
      awake.grant = grant;
    }
    const out = service.playHardcore({
      sessionId: run.session.id,
      userId: "player",
      expectedTurn: s.turn,
      action: "skill",
    });
    assert(awake.active(out.state));
    assert.equal(out.state.phase, "boss_chest");
    const stored = repo.getSession(run.session.id).state_json;
    assert.throws(
      () =>
        service.playHardcore({
          sessionId: run.session.id,
          userId: "player",
          expectedTurn: s.turn,
          action: "skill",
        }),
      /STALE_ACTION/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, stored);
  });
  test("Class artifacts excluded from death loot and private UI stays within limits", () => {
    const echoes = require("../src/hardcore/storage/echoes"),
      view = require("../src/hardcore/ui");
    for (const k of Object.keys(stats.CLASSES)) {
      const s = state(k);
      assert.equal(echoes.snapshot(s).items.length, 0);
      const saved = JSON.stringify(s);
      let found = false;
      for (let page = 0; page < 5; page++) {
        const p = view.privatePayload(s, "s", "m", "stats", page);
        let length = 0;
        for (const e of p.embeds) {
          const x = e.toJSON();
          length += (x.title || "").length + (x.description || "").length;
          for (const f of x.fields || []) {
            assert(f.value.length <= 1024);
            length += f.name.length + f.value.length;
            if (f.name.includes("Class Awakening")) found = true;
          }
        }
        assert(length <= 6000);
      }
      assert(found);
      assert.equal(JSON.stringify(s), saved);
    }
  });

  test("Echo and Nova use final reduced main damage exactly once", () => {
    for (const [k, key, value, ratio] of [
      ["sorceress", "echo", 1, 0.5],
      ["necromancer", "totems", 2, 0.6],
    ]) {
      const s = state(k);
      s.encounter.resistance = 60;
      s.classAwakening[key] = value;
      const plain = structuredClone(s);
      plain.classAwakening[key] = 0;
      const base = attack(plain).dealt,
        withPassive = attack(s).dealt;
      assert.equal(withPassive, base + Math.floor(base * ratio));
      assert.equal(s.classAwakening[key], 0);
    }
  });
  test("Shield absorbs final damage; skill HP cost bypasses it; Max HP clamps Bark", () => {
    const s = state("druid");
    const shield = Math.min(50, Math.floor(s.maxHp * 0.2));
    s.classAwakening.bark = shield;
    const plain = structuredClone(s);
    plain.classAwakening.bark = 0;
    const hp = s.hp;
    core.enemyTurn(plain, () => 0.1);
    const final = hp - plain.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(s.hp, hp - Math.max(0, final - shield));
    assert.equal(s.classAwakening.bark, Math.max(0, shield - final));
    s.classAwakening.bark = 20;
    core.hurt(s, 1, false);
    assert.equal(s.classAwakening.bark, 20);
    s.classAwakening.bark = 10000;
    stats.recompute(s);
    assert.equal(s.classAwakening.bark, Math.floor(s.maxHp * 0.2));
  });
  test("Empowered Shadow Step uses its own Crit roll and +0.25 multiplier", () => {
    const s = state("assassin");
    s.critChance = 0;
    s.damageMin = s.damageMax = 100;
    s.classAwakening.shadow = 2;
    const plain = structuredClone(s);
    plain.classAwakening.shadow = 0;
    const normal = attack(plain, "skill", () => 0.1);
    const enhanced = attack(s, "skill", () => 0.1);
    assert(!normal.critical);
    assert(enhanced.critical);
    assert(enhanced.dealt >= normal.dealt * 1.95);
    const invalid = state("assassin");
    invalid.classAwakening.shadow = 2;
    invalid.mana = 0;
    assert.throws(() => attack(invalid), /NO_ENERGY/);
    assert.equal(invalid.classAwakening.shadow, 2);
  });
  console.log(groups + " deterministic awakening groups passed.");
} finally {
  db.close();
}
