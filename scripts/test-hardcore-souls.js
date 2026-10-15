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
  awake = require("../src/hardcore/awakening"),
  innate = require("../src/hardcore/innate"),
  rules = require("../src/hardcore/equipment/rules"),
  loot = require("../src/hardcore/equipment/loot"),
  items = require("../src/hardcore/item"),
  view = require("../src/hardcore/ui");
const souls = require("../src/hardcore/characters/souls");
const rng = () => 0.5,
  session = { id: "rework", guild_id: "g", user_id: "u", channel_id: "c" };
let groups = 0;
function test(n, f) {
  f();
  groups++;
  console.log("PASS " + n);
}
function fresh(k, level = 6, awakened = true) {
  const s = stats.createState(k, 10000);
  souls.attach(s, k, level);
  Object.assign(s, {
    floor: 6,
    cleared: 5,
    encounter: {
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
    },
  });
  stats.addSource(s, { maxHp: 1000 - s.maxHp, maxMana: 10 - s.maxMana });
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  if (awakened) {
    s.floor = 100;
    awake.grant(s, { rank: "boss", hp: 0 });
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
try {
  test("All 7 characters, S0-S6 normalize and immutable damage previews", () => {
    for (const k of Object.keys(stats.CLASSES))
      for (let n = 0; n <= 6; n++) {
        const s = fresh(k, n);
        const before = JSON.stringify(s);
        core.skillDamagePreview(s);
        core.attackDamagePreview(s);
        assert.equal(JSON.stringify(s), before);
        const copy = structuredClone(s);
        core.normalize(copy);
        assert.equal(souls.level(copy), n);
        if (n === 6)
          for (let page = 0; page < 4; page++) {
            const p = view.privatePayload(s, "souls", "u", "stats", page);
            for (const e of p.embeds)
              assert(e.toJSON().fields.every((f) => f.value.length <= 1024));
            assert(!JSON.stringify(p).includes("undefined"));
          }
        assert.equal(souls.level({ ...s, mode: "tower_weekly" }), 0);
      }
  });
  test("Intermediate levels unlock combat openers, healing and awakening coefficients at the correct ranks", () => {
    for (let n = 0; n <= 6; n++) {
      const amazon = fresh("amazon", n);
      assert.equal(amazon.classAwakening.focus, n >= 4 ? 1 : 0);
      assert.equal(fresh("assassin", n).classAwakening.shadow, n >= 4 ? 1 : 0);
      assert.equal(
        innate.combat(fresh("necromancer", n)).anchorProgress,
        n >= 2 ? 1 : 0,
      );
      core.playerAttack(amazon, "attack", rng);
      assert.equal(innate.multiplier(amazon, "skill"), n >= 1 ? 1.18 : 1.15);
      const sorceress = fresh("sorceress", n);
      assert.equal(awake.tuning(sorceress).echo, n >= 3 ? 0.9 : 0.8);
      assert.equal(awake.tuning(sorceress).echoShield, n >= 4 ? 0.18 : 0.15);
      assert.equal(awake.tuning(sorceress).echoExtra, n >= 5 ? 0.25 : 0.2);
      const druid = fresh("druid", n);
      assert.equal(awake.tuning(druid).healRate, n >= 5 ? 0.11 : 0.1);
      assert.equal(awake.tuning(druid).barkCap, n >= 4 ? 0.22 : 0.18);
      const paladin = fresh("paladin", n);
      paladin.hp = 500;
      core.playerAttack(paladin, "skill", rng);
      assert.equal(paladin.hp, n >= 2 ? 540 : 530);
      assert.equal(awake.incomingDefense(paladin), n >= 4 ? 1.25 : 1.2);
    }
  });
  test("S0 snapshot and historical runs keep identical combat outcomes for every character", () => {
    for (const k of Object.keys(stats.CLASSES)) {
      const current = fresh(k, 0),
        historical = structuredClone(current);
      delete historical.characterSoul;
      for (const action of ["attack", "skill", "defend", "attack", "skill"]) {
        assert.deepEqual(
          core.playerAttack(current, action, rng),
          core.playerAttack(historical, action, rng),
        );
        assert.deepEqual(
          core.enemyTurn(current, rng, action === "defend"),
          core.enemyTurn(historical, rng, action === "defend"),
        );
        const compared = structuredClone(current);
        delete compared.characterSoul;
        assert.deepEqual(compared, historical, k + ": " + action);
      }
    }
  });
  test("Amazon Bloodlust, accuracy, Focus opener, stronger Focus/main and once-per-combat MP", () => {
    const s = fresh("amazon");
    assert.equal(s.classAwakening.focus, 1);
    s.mana = 0;
    core.playerAttack(s, "attack", rng);
    assert.equal(innate.multiplier(s, "skill"), 1.18);
    assert(souls.frame(s).basicMana);
    assert.equal(s.classAwakening.focus, 2);
    const p = core.skillDamagePreview(s);
    const r = core.playerAttack(s, "skill", rng);
    assert.equal(r.dealt, p.low);
    assert.equal(r.dealt, 314);
    assert.equal(s.classAwakening.focus, 0);
    assert(souls.frame(s).basicAttempt);
    assert(!souls.frame(s).basicAccuracy);
    const hit = fresh("amazon", 2);
    hit.accuracy = 1;
    hit.encounter.evasion = 1;
    assert(core.playerAttack(hit, "attack", () => 0.57).dealt > 0);
    assert.equal(core.playerAttack(hit, "attack", () => 0.57).dealt, 0);
  });
  test("Barbarian DEF, emergency Barrier once, Fury DMG/Barrier, refund and full Fury finisher", () => {
    const s = fresh("barbarian");
    s.hp = 400;
    core.playerAttack(s, "defend", rng);
    assert.equal(souls.frame(s).guardBarrier, 30);
    core.enemyTurn(s, rng, true);
    assert.equal(souls.frame(s).guardBarrier, 0);
    core.playerAttack(s, "defend", rng);
    assert.equal(souls.frame(s).guardBarrier, 0);
    awake.combat(s).fury = 3;
    s.mana = 5;
    const p = core.skillDamagePreview(s);
    const r = core.playerAttack(s, "skill", rng);
    assert.equal(r.dealt, p.low);
    assert.equal(r.dealt, 279);
    assert.equal(awake.combat(s).barrier, 180);
    assert.equal(s.mana, 4);
    assert.equal(innate.defenseFactor(s), 1.35);
    assert(souls.frame(s).furyMana);
  });
  test("Assassin base AVOID, Crit heal, enhanced Step, initial Shadow and single MP refund", () => {
    const s = fresh("assassin");
    assert.equal(s.classAwakening.shadow, 1);
    assert(Math.abs(innate.avoidChance(s) - (0.07 + s.dex * 0.0005)) < 1e-9);
    s.hp = 500;
    s.mana = 0;
    s.critChance = 0.9;
    core.playerAttack(s, "attack", () => 0);
    assert.equal(s.hp, 525);
    assert(souls.frame(s).critMana);
    s.classAwakening.shadow = 2;
    s.mana = 10;
    const r = core.playerAttack(s, "skill", () => 0);
    assert(r.critical);
    assert.equal(r.dealt, 273);
    assert.equal(s.mana, 9);
  });
  test("Sorceress 22% shield, one MP refund across phases, Echo 90% plus second Echo, 18% barrier and one opener boost", () => {
    const s = fresh("sorceress");
    s.mana = 0;
    assert.equal(innate.absorb(s, 300, 0).remaining, 80);
    assert.equal(s.mana, 1);
    innate.absorb(s, 300, 0);
    assert.equal(s.mana, 1);
    s.encounter.boss = { phase: 2 };
    innate.absorb(s, 300, 0);
    assert.equal(s.mana, 1);
    delete s.encounter.boss;
    s.classAwakening.echo = 1;
    s.mana = 10;
    const p = core.skillDamagePreview(s);
    const r = core.playerAttack(s, "skill", () => 0);
    assert.equal(r.dealt, p.high);
    assert.equal(awake.combat(s).barrier, 180);
    assert(souls.frame(s).firstEcho);
    assert.equal(awake.tuning(s).echoExtra, 0.25);
  });
  test("Druid Mark, one extra MP, stronger heal/Bark, cap and one nonlethal Bark break recovery", () => {
    const s = fresh("druid");
    s.hp = 500;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.hp, 610);
    assert.equal(innate.multiplier(s, "attack"), 1.25);
    s.mana = 0;
    core.playerAttack(s, "attack", rng);
    assert(souls.frame(s).wildMana);
    s.classAwakening.bark = 1;
    s.encounter.damageMin = s.encounter.damageMax = 20;
    s.hp = 500;
    core.enemyTurn(s, rng);
    assert.equal(s.hp, 531);
    assert(souls.frame(s).barkRescue);
    s.classAwakening.bark = 1;
    core.enemyTurn(s, rng);
    assert.equal(s.hp, 512);
    const dead = fresh("druid");
    dead.hp = 1;
    dead.classAwakening.bark = 1;
    core.enemyTurn(dead, rng);
    assert.equal(dead.hp, 0);
    assert(!souls.frame(dead).barkRescue);
    const capped = fresh("druid");
    core.playerAttack(capped, "skill", rng);
    assert.equal(capped.classAwakening.bark, 105);
    assert.equal(awake.tuning(capped).barkCap, 0.22);
  });
  test("Necromancer opener Anchor, stronger damage, miss MP, first Nova heal and second Nova bonus", () => {
    const s = fresh("necromancer");
    assert.equal(innate.combat(s).anchorProgress, 1);
    core.playerAttack(s, "skill", rng);
    core.playerAttack(s, "skill", rng);
    assert(innate.combat(s).anchor);
    assert.equal(souls.frame(s).novaHits, 1);
    assert.equal(innate.multiplier(s, "attack"), 1.2);
    s.mana = 0;
    core.playerAttack(s, "attack", () => 0.99);
    assert.equal(s.mana, 8);
    assert(!innate.combat(s).anchor);
    s.hp = 500;
    s.mana = 10;
    core.playerAttack(s, "skill", rng);
    s.mana = 10;
    const p = core.skillDamagePreview(s);
    const r = core.playerAttack(s, "skill", rng);
    assert.equal(r.dealt, p.low);
    assert.equal(souls.frame(s).novaHits, 2);
    const healing = fresh("necromancer");
    healing.hp = 500;
    core.playerAttack(healing, "skill", rng);
    core.playerAttack(healing, "skill", rng);
    assert.equal(healing.hp, 530);
  });
  test("Paladin stronger Vindicate/heal, DEF, Holy coefficient and once-per-combat Holy bonus", () => {
    const s = fresh("paladin");
    s.hp = 500;
    s.defense = 400;
    s.resistance = 10;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.hp, 540);
    assert.equal(innate.multiplier(s, "attack"), 1.18);
    assert.equal(awake.incomingDefense(s), 1.25);
    const p = core.attackDamagePreview(s);
    const r = core.playerAttack(s, "attack", rng);
    assert.equal(r.dealt, p.low);
    assert(souls.frame(s).firstHoly);
    assert(r.log.includes("Consecration"));
    const f = innate.combat(s);
    f.killEligible = true;
    s.encounter.defeatSettled = true;
    s.hp = 500;
    innate.finish(s, s.encounter, core.heal, 10);
    assert.equal(s.hp, 750);
  });
  test("Invalid snapshots rejected, S0 legacy accepted, no midrun attach or Tower bonuses", () => {
    const s = fresh("amazon");
    s.characterSoul.soulLevel = 7;
    assert.throws(() => core.normalize(s), /INVALID_CHARACTER_SOUL/);
    const old = fresh("druid", 0);
    delete old.characterSoul;
    core.normalize(old);
    assert.equal(souls.level(old), 0);
    assert.throws(
      () => souls.attach(old, "druid", 6),
      /INVALID_CHARACTER_SOUL/,
    );
  });
  test("S6 boss bonus is isolated, snapshotted and does not affect normal enemies", () => {
    const s = fresh("amazon"),
      tune = require("../src/hardcore/characters/soulTuning.json");
    const saved = s.characterSoul.bossMultiplier,
      original = tune.bossMultipliers.amazon;
    tune.bossMultipliers.amazon = 5;
    assert.equal(s.characterSoul.bossMultiplier, saved);
    tune.bossMultipliers.amazon = original;
    assert.equal(souls.bossFactor(s), 1);
    s.encounter.rank = "boss";
    assert.equal(souls.bossFactor(s), saved);
    s.characterSoul.soulLevel = 5;
    assert.equal(souls.bossFactor(s), 1);
  });
  test("Real transaction persists soul snapshot and once-only flags; stale retry changes nothing", () => {
    const service = require("../src/hardcore"),
      repo = require("../src/hardcore/storage/sessions");
    db.prepare(
      "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
    ).run("soul-service", "u", 1000000);
    const run = service.startHardcore({
      guildId: "soul-service",
      userId: "u",
      channelId: "c",
      stake: 10000,
      classKey: "druid",
      forcedEncounter: { type: "empty" },
    });
    assert.equal(run.state.characterSoul.soulLevel, 0);
    Object.assign(run.state, fresh("druid"));
    repo.saveState(run.session, run.state);
    const turn = run.state.turn;
    const played = service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      expectedTurn: turn,
      action: "skill",
    });
    assert.equal(played.state.characterSoul.soulLevel, 6);
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
    const resumed = JSON.parse(saved);
    core.normalize(resumed);
    assert.deepEqual(resumed.characterSoul, played.state.characterSoul);
    repo.deleteSession(run.session.id);
  });
  console.log(groups + " soul combat groups passed; no simulations.");
} finally {
  db.close();
}
