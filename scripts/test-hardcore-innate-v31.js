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
  innate = require("../src/hardcore/innate"),
  awake = require("../src/hardcore/awakening"),
  bosses = require("../src/hardcore/bosses/mechanics"),
  modern = require("../src/hardcore/bosses/mechanicsV2"),
  world = require("../src/hardcore/engine/world"),
  catalog = require("../src/hardcore/bosses/catalogV2"),
  affinity = require("../src/hardcore/equipment/affinityEffects"),
  view = require("../src/hardcore/ui");
const session = { id: "innate", guild_id: "g", user_id: "u", channel_id: "c" },
  rng = () => 0.5;
let groups = 0;
function test(name, fn) {
  fn();
  console.log("PASS " + name);
  groups++;
}
function enemy() {
  return {
    type: "combat",
    name: "Fixture",
    rank: "normal",
    hp: 1000000,
    maxHp: 1000000,
    defense: 0,
    resistance: 0,
    accuracy: 100000,
    evasion: 0,
    critChance: 0,
    damageMin: 100,
    damageMax: 100,
    damageType: "physical",
    nextDamageType: "physical",
    combatTurn: 1,
  };
}
function fresh(k, awakened = false) {
  const s = stats.createState(k, 10000);
  // Saved original V3.1 fixture: new rework is tested separately.
  s.classInnateRevision = 1;
  s.itemLevelCurveVersion = 1;
  delete s.lootRulesVersion;
  Object.assign(s, {
    floor: 6,
    cleared: 5,
    godRngesusEnabled: false,
    bossRosterVersion: 2,
    encounter: enemy(),
  });
  stats.addSource(s, { maxHp: 1000 - s.maxHp, maxMana: 10 - s.maxMana });
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  if (awakened) {
    s.floor = 100;
    assert(awake.grant(s, { rank: "boss", hp: 0 }));
    s.floor = 6;
  }
  core.prepareItemCombat(s, rng);
  Object.assign(s, {
    damageMin: 100,
    damageMax: 100,
    spellMin: 100,
    spellMax: 100,
    defense: 0,
    resistance: 0,
    evasion: 0,
    critChance: 0,
    accuracy: 100000,
  });
  return s;
}
function hit(s, a = "attack", r = rng) {
  return core.playerAttack(s, a, r);
}
function seq(values) {
  return () => values.shift() ?? 0.5;
}
function spellCounter(s) {
  s.encounter.damageType = s.encounter.nextDamageType = "magic";
  s.encounter.rift.lockedCounterType = "magic";
}
function legacy(s) {
  s.releaseVersion = s.balanceVersion = "3.0.0";
  delete s.classInnateVersion;
  delete s.statProfile.initialVitHp;
  if (s.classKey === "amazon")
    Object.assign(s.statProfile.mastery, { hp: 3, evasion: 0.3 });
  if (s.classKey === "assassin") {
    s.statProfile.mastery.hp = 3;
    s.statProfile.core.baseHp = 38;
  }
  return s;
}
try {
  test("V3.1 new profiles and saved V3.0 snapshots remain valid; Tower/V2 have no Innate", () => {
    const a = stats.createState("amazon", 10),
      n = stats.createState("assassin", 10);
    assert.equal(a.releaseVersion, "3.2.0");
    assert.equal(a.maxHp, 110);
    assert.equal(n.maxHp, 118);
    assert.equal(a.statProfile.mastery.evasion, 0.45);
    assert.equal(
      require("../src/hardcore/bosses/balanceV2").snapshot("assassin")
        .playerDamage,
      0.36,
    );
    assert.equal(
      require("../src/hardcore/bosses/balanceV2").snapshot("druid")
        .playerDamage,
      0.3,
    );
    for (const k of Object.keys(stats.CLASSES)) {
      const s = fresh(k);
      assert(innate.enabled(s));
      const copy = structuredClone(s);
      core.normalize(copy);
      assert.deepEqual(copy.encounter.innateCombat, s.encounter.innateCombat);
      const old = legacy(fresh(k));
      core.normalize(old);
      assert(!innate.enabled(old));
      assert.equal(awake.tuning(old).echo, 0.5);
      s.mode = "tower";
      assert(!innate.enabled(s));
      assert.equal(innate.avoidChance(s), 0);
      assert.equal(innate.defenseFactor(s), 1);
    }
    assert(
      !innate.enabled(
        stats.createState("assassin", 10, { gameplayVersion: 2 }),
      ),
    );
    const bad = fresh("amazon");
    bad.encounter.innateCombat.actions = -1;
    assert.throws(() => core.normalize(bad), /INNATE/);
  });
  test("Amazon Bloodlust: attack refresh, full Barrage action and Focus shot, miss consumes once", () => {
    const s = fresh("amazon", true);
    assert.equal(hit(s).dealt, 100);
    assert(innate.combat(s).bloodlust);
    assert.equal(hit(s).dealt, 115);
    assert.equal(s.classAwakening.focus, 2);
    const saved = JSON.stringify(s),
      forecast = core.skillDamagePreview(s);
    assert.equal(JSON.stringify(s), saved);
    const skill = hit(s, "skill");
    assert.equal(skill.dealt, 274);
    assert.equal(forecast.low, skill.dealt);
    assert(!innate.combat(s).bloodlust);
    assert.equal(s.classAwakening.focus, 0);
    innate.combat(s).bloodlust = true;
    s.accuracy = 0;
    s.encounter.evasion = 100000;
    assert.equal(hit(s, "attack", () => 0.99).dealt, 0);
    assert(!innate.combat(s).bloodlust);
  });
  test("Assassin AVOID scales from total DEX and handles physical then magic natural dodge", () => {
    const s = fresh("assassin", true);
    for (const [dex, chance] of [
      [30, 0.065],
      [200, 0.15],
      [500, 0.3],
      [800, 0.45],
      [1000, 0.55],
      [2000, 0.55],
    ]) {
      s.dex = dex;
      assert(Math.abs(innate.avoidChance(s) - chance) < 1e-12);
    }
    s.dex = 30;
    const hp = s.hp,
      log = core.enemyTurn(s, seq([0, 0]));
    assert.equal(s.hp, hp);
    assert(log.includes("AVOID"));
    assert.equal(s.classAwakening.shadow, 1);
    s.encounter.awakeningShadowGranted = false;
    spellCounter(s);
    const spellLog = core.enemyTurn(s, seq([0]));
    assert.equal(s.hp, hp);
    assert(spellLog.includes("AVOID"));
    assert.equal(s.classAwakening.shadow, 2);
    s.encounter.awakeningShadowGranted = false;
    s.classAwakening.shadow = 0;
    core.enemyTurn(s, rng, false, true);
    assert.equal(s.classAwakening.shadow, 0);
    s.hp = 500;
    s.healingReduction = 0.5;
    s.critChance = 1;
    hit(s, "attack", () => 0.1);
    assert.equal(s.hp, 515);
  });
  test("AVOID creates Affinity Shadow Mark; Shadow Step cannot create one", () => {
    const s = fresh("assassin");
    const item = Object.values(core.ITEMS)
      .flat()
      .find(
        (i) =>
          i.affinity?.classes.includes("assassin") &&
          i.affinityEffect?.effects.assassin,
      );
    assert(item);
    core.receiveItem(s, item);
    s.dex = 1000;
    spellCounter(s);
    s.encounter.affinityCombat.marks = 0;
    core.enemyTurn(s, () => 0);
    assert.equal(s.encounter.affinityCombat.marks, 1);
    s.encounter.affinityCombat.marks = 0;
    core.enemyTurn(s, rng, false, true);
    assert.equal(s.encounter.affinityCombat.marks, 0);
  });
  test("Titan applies 25% DEF before Rift, suppresses only the next counter Crit, Fury cannot be farmed", () => {
    const s = fresh("barbarian", true);
    s.defense = 100;
    s.encounter.critChance = 1;
    const c = awake.combat(s);
    s.hp = 200;
    awake.hpChanged(s, 1000);
    assert.equal(c.fury, 1);
    assert.deepEqual(c.crossed, [0.75, 0.5, 0.25]);
    s.hp = 1000;
    s.hp = 200;
    awake.hpChanged(s, 1000);
    assert.equal(c.fury, 1);
    s.hp = 1000;
    c.fury = 2;
    hit(s, "skill");
    assert.equal(c.fury, 0);
    assert.equal(c.barrier, 120);
    assert.equal(innate.defenseFactor(s), 1.25);
    const incoming = core.attackDamage(s.encounter, s, s, rng, {
      critical: true,
    });
    assert(!incoming.crit);
    core.enemyTurn(s, rng);
    assert.equal(innate.defenseFactor(s), 1);
    assert(core.attackDamage(s.encounter, s, s, rng, { critical: true }).crit);
    const low = fresh("barbarian");
    low.hp = 400;
    low.floor = 100;
    awake.grant(low, { rank: "boss", hp: 0 });
    low.floor = 6;
    core.prepareItemCombat(low, rng);
    assert.equal(awake.combat(low).fury, 1);
    assert.deepEqual(awake.combat(low).crossed, [0.75, 0.5]);
  });
  test("Druid Mark refreshes and boosts the next whole action; MP cooldown counts combat actions", () => {
    const s = fresh("druid", true);
    s.hp = 900;
    s.mana = 2;
    hit(s, "skill");
    assert.equal(s.hp, 1000);
    assert.equal(s.classAwakening.bark, 60);
    assert(innate.combat(s).wild);
    const before = s.mana;
    const attack = hit(s);
    assert.equal(attack.dealt, 115);
    assert.equal(s.mana, before + core.attackManaGain(s) + 1);
    assert(!innate.combat(s).wild);
    const ready = innate.combat(s).wildMpReady;
    hit(s, "skill");
    assert(innate.combat(s).wild);
    assert.equal(innate.combat(s).wildMpReady, ready);
    hit(s);
    assert.equal(innate.combat(s).wildMpReady, 6);
    const reduced = fresh("druid", true);
    reduced.hp = 900;
    reduced.healingReduction = 0.5;
    hit(reduced, "skill");
    assert.equal(reduced.classAwakening.bark, 25);
    reduced.classAwakening.bark = 249;
    hit(reduced, "skill");
    assert.equal(reduced.classAwakening.bark, 250);
  });
  test("Necromancer Anchor grants on every third combat action, attack miss consumes it, Nova every two Wards", () => {
    const s = fresh("necromancer", true);
    hit(s, "skill");
    assert(innate.combat(s).anchor);
    assert.equal(s.classAwakening.totems, 1);
    const forecast = core.skillDamagePreview(s);
    const second = hit(s, "skill");
    assert.equal(second.dealt, 255);
    assert.equal(forecast.low, 255);
    assert.equal(s.classAwakening.totems, 0);
    assert.equal(s.mana, 7);
    s.accuracy = 0;
    s.encounter.evasion = 100000;
    const missed = hit(s, "attack", () => 0.99);
    assert(missed.dodge);
    assert.equal(missed.dealt, 0);
    assert(!innate.combat(s).anchor);
    hit(s, "skill");
    assert(innate.combat(s).anchor);
    const n = fresh("necromancer");
    hit(n, "skill");
    n.mana = 0;
    const landed = hit(n);
    assert(landed.dodge);
    assert.equal(n.mana, core.attackManaGain(n) + 1);
  });
  test("Paladin heals on Shield, powers the next action, rewards only completed main-target kill", () => {
    const s = fresh("paladin");
    s.hp = 500;
    hit(s, "skill");
    assert.equal(s.hp, 530);
    assert(innate.combat(s).vindicate);
    s.mana = 0;
    s.encounter.hp = 1;
    core.act(s, session, "attack", seq([0.5, 0.99, 0.99, 0.99]));
    assert.equal(s.hp, 680);
    assert.equal(s.mana, 5);
    assert(s.lastLog.includes("Vindicate"));
    const p = fresh("paladin", true);
    p.floor = 150;
    p.cleared = 149;
    p.encounter = world.makeEnemy(
      p,
      "boss",
      null,
      rng,
      catalog.CATALOG.necrobot,
    );
    core.prepareItemCombat(p, rng);
    p.hp = 500;
    innate.combat(p).vindicate = true;
    p.encounter.boss.mechanicState.target = "Weapon";
    p.encounter.boss.mechanicState.targets.Weapon.hp = 1;
    hit(p);
    assert(!innate.combat(p).killEligible);
    assert.equal(p.hp, 500);
  });
  test("Phase changes keep Innate/resources but grant no Paladin kill heal", () => {
    const s = fresh("paladin", true);
    s.floor = 999;
    s.cleared = 998;
    s.encounter = world.makeEnemy(
      s,
      "final_boss",
      null,
      rng,
      catalog.CATALOG.deimoss,
    );
    core.prepareItemCombat(s, rng);
    const c = innate.combat(s);
    c.vindicate = true;
    s.hp = 500;
    s.encounter.hp = 0;
    assert(modern.advancePhase(s));
    assert.equal(s.hp, 500);
    assert.strictEqual(innate.combat(s), c);
    assert(c.vindicate);
    const d = fresh("druid", true);
    d.classAwakening.bark = 100;
    innate.combat(d).wild = true;
    const e = d.encounter;
    innate.finish(d, e, core.heal, 10);
    assert.equal(d.classAwakening.bark, 0);
    assert(!e.innateCombat);
    d.encounter = enemy();
    core.prepareItemCombat(d, rng);
    assert(!innate.combat(d).wild);
  });
  test("Sorceress Echo is 65%, grants 10% Echo Shield and preview never mutates resources", () => {
    const s = fresh("sorceress", true);
    s.classAwakening.echo = 1;
    const saved = JSON.stringify(s);
    const forecast = core.skillDamagePreview(s);
    assert.equal(JSON.stringify(s), saved);
    assert.equal(forecast.low, 346);
    const played = hit(s, "skill");
    assert.equal(played.dealt, 346);
    assert.equal(awake.combat(s).barrier, 100);
    assert.equal(s.classAwakening.echo, 0);
  });
  test("Mana Shield applies after Barrier, only once, and preserves one Skill of MP", () => {
    const s = fresh("sorceress", true);
    s.mana = 3;
    s.encounter.damageMin = s.encounter.damageMax = 200;
    awake.combat(s).barrier = 100;
    const saved = JSON.stringify(s);
    assert.equal(core.incomingPreview(s).high, 75);
    assert.equal(JSON.stringify(s), saved);
    const log = core.enemyTurn(s, rng);
    assert.equal(s.hp, 925);
    assert.equal(s.mana, 2);
    assert.equal(awake.combat(s).barrier, 0);
    assert(log.includes("Mana Shield"));
    core.enemyTurn(s, rng);
    assert.equal(s.hp, 725);
    assert.equal(s.mana, 2);
    const n = fresh("sorceress", true);
    n.mana = 2;
    core.enemyTurn(n, rng);
    assert.equal(n.mana, 2);
    assert(!innate.combat(n).manaShieldUsed);
    const z = fresh("sorceress", true);
    z.mana = 3;
    awake.combat(z).barrier = 500;
    core.enemyTurn(z, rng);
    assert.equal(z.hp, 1000);
    assert.equal(z.mana, 3);
    assert(!innate.combat(z).manaShieldUsed);
  });
  test("True damage bypasses guaranteed dodge, AVOID, Barrier and Mana Shield; recoil bypasses Barrier", () => {
    const original = bosses.counter;
    try {
      bosses.counter = () => ({
        magic: false,
        trueDamage: true,
        raw: 100,
        multiplier: 1,
        skip: false,
      });
      for (const k of ["assassin", "necromancer", "sorceress", "barbarian"]) {
        const s = fresh(k, true);
        s.dex = 1000;
        s.mana = 10;
        awake.combat(s).barrier = 200;
        const hp = s.hp;
        core.enemyTurn(s, () => 0, false, true);
        assert.equal(s.hp, hp - 100);
        assert.equal(awake.combat(s).barrier, 200);
        assert.equal(s.mana, 10);
        assert(!innate.combat(s).manaShieldUsed);
      }
    } finally {
      bosses.counter = original;
    }
    const s = fresh("barbarian", true);
    awake.combat(s).barrier = 500;
    const x = { s, e: s.encounter };
    modern.lose(x, 100, { hurt: core.hurt });
    assert.equal(s.hp, 900);
    assert.equal(awake.combat(s).barrier, 500);
  });
  test("Free selectors do not advance cooldowns and private UI fits Discord", () => {
    for (const k of Object.keys(stats.CLASSES)) {
      const s = fresh(k, true);
      const saved = JSON.stringify(s);
      for (const e of view.privatePayload(s, "i", "m", "stats").embeds) {
        const json = e.toJSON();
        assert((json.fields || []).every((f) => f.value.length <= 1024));
        assert((json.description || "").length <= 4096);
      }
      assert.equal(JSON.stringify(s), saved);
    }
    const s = fresh("necromancer");
    s.floor = 150;
    s.cleared = 149;
    s.encounter = world.makeEnemy(
      s,
      "boss",
      null,
      rng,
      catalog.CATALOG.necrobot,
    );
    core.prepareItemCombat(s, rng);
    const count = innate.combat(s).actions;
    core.act(s, session, "boss_necrobot__target_Weapon", rng);
    assert.equal(innate.combat(s).actions, count);
  });
  test("Astral Singularity limits Ward only, not the separate Anchor dodge", () => {
    const s = fresh("necromancer", true);
    s.relics = [{ id: "astral_singularity", acquiredFloor: 1 }];
    s.activeRelic = "astral_singularity";
    hit(s, "skill");
    assert(innate.combat(s).anchor);
    const next = hit(s, "attack");
    assert(next.dodge);
    assert(!innate.combat(s).anchor);
  });
  test("Avarice backlash bypasses Barrier while its ordinary counter still uses Barrier", () => {
    const s = fresh("sorceress", true);
    s.encounter.mechanic = "avarice_revenant";
    s.encounter.gildedTrial = { from: 0, floor: s.floor };
    awake.combat(s).barrier = 500;
    core.act(s, session, "skill", rng);
    assert.equal(s.hp, 979);
    assert.equal(awake.combat(s).barrier, 400);
    assert(!innate.combat(s).manaShieldUsed);
  });
  test("Battle shows remaining Fury/Echo/Bark Barrier beside ACC, hides zero and never changes state", () => {
    for (const k of ["barbarian", "sorceress", "druid"]) {
      const s = fresh(k, true);
      const c = awake.combat(s);
      if (k === "druid") s.classAwakening.bark = s.maxHp;
      else c.barrier = 67;
      const amount =
        k === "druid" ? Math.floor(s.maxHp * awake.tuning(s).barkCap) : 67;
      const before = JSON.stringify(s);
      const text = view.embed(s, "u").toJSON().description;
      const line = text.split("\n").find((x) => x.includes("ACC:"));
      assert(line.includes("Barrier: **" + amount + "**"), k);
      assert.equal(JSON.stringify(s), before);
      if (k === "druid") s.classAwakening.bark = 0;
      else c.barrier = 0;
      assert(!view.embed(s, "u").toJSON().description.includes("Barrier:"));
    }
  });
  test("Mana Shield uses locked Paradox cost through counters and handles portal ambush", () => {
    const make = () => {
      const s = fresh("sorceress");
      s.activeParadox = {
        version: 2,
        id: "unstable_soul",
        milestone: 5,
        startFloor: 6,
        endFloor: 10,
        combatActionCount: 0,
        attackActionCount: 0,
        lockedSkillCost: null,
      };
      return s;
    };
    const normal = make();
    require("../src/hardcore/events/paradox").prepareCombat(normal, rng);
    core.act(normal, session, "defend", rng);
    assert(innate.combat(normal).manaShieldUsed);
    assert.equal(normal.activeParadox.lockedSkillCost, 2);
    assert.equal(innate.combat(normal).counterSkillCost, undefined);
    const ambush = make();
    core.enemyTurn(ambush, rng);
    assert.equal(ambush.activeParadox.lockedSkillCost, 2);
    assert(innate.combat(ambush).manaShieldUsed);
  });
  test("Real service persists Anchor/Bone cooldown state and stale retries cannot duplicate resources", () => {
    const service = require("../src/services/hardcoreService"),
      repo = require("../src/hardcore/storage/sessions");
    db.prepare(
      "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
    ).run("innate-service", "u", 1000000);
    const run = service.startHardcore({
      guildId: "innate-service",
      userId: "u",
      channelId: "c",
      stake: 10000,
      classKey: "necromancer",
      forcedEncounter: { type: "empty" },
    });
    Object.assign(run.state, fresh("necromancer", true));
    repo.saveState(run.session, run.state);
    const turn = run.state.turn;
    const played = service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      expectedTurn: turn,
      action: "skill",
    });
    assert(played.state.encounter.innateCombat.anchor);
    assert.equal(played.state.classAwakening.totems, 1);
    const saved = repo.getSession(run.session.id).state_json;
    assert.throws(
      () =>
        service.playHardcore({
          sessionId: run.session.id,
          userId: "u",
          expectedTurn: turn,
          action: "skill",
        }),
      /STALE/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, saved);
    const again = service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      expectedTurn: played.state.turn,
      action: "attack",
    });
    assert(!again.state.encounter.innateCombat.anchor);
    assert.equal(again.state.encounter.innateCombat.actions, 2);
    repo.deleteSession(run.session.id);
  });
  console.log(groups + " deterministic V3.1 Innate groups passed.");
} finally {
  db.close();
}
