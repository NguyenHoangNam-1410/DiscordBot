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
const rng = () => 0.5,
  session = { id: "rework", guild_id: "g", user_id: "u", channel_id: "c" };
let groups = 0;
function test(n, f) {
  f();
  groups++;
  console.log("PASS " + n);
}
function fresh(k, awakened = true) {
  const s = stats.createState(k, 10000);
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
  test("New revisions and calibrated boss coefficients; saved original rules remain intact", () => {
    for (const [k, v] of Object.entries({
      amazon: 2.1,
      barbarian: 0.504,
      assassin: 0.36,
      sorceress: 1.6,
      druid: 0.3,
      necromancer: 0.135,
      paladin: 0.5,
    })) {
      const s = stats.createState(k, 10);
      assert.equal(s.classInnateRevision, 2);
      assert.equal(s.itemLevelCurveVersion, 2);
      assert.equal(
        require("../src/hardcore/bosses/balanceV2").snapshot(k).playerDamage,
        v,
      );
      core.normalize(s);
    }
    const s = fresh("druid");
    s.classInnateRevision = 1;
    s.itemLevelCurveVersion = 1;
    assert.equal(awake.tuning(s).barkCap, 0.25);
    assert.equal(rules.scale(3, s), 2);
  });
  test("Druid heals 10%, creates 4% Bark plus actual overheal, caps 18%; Mark +20% and MP cooldown", () => {
    const s = fresh("druid");
    s.hp = 700;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.hp, 800);
    assert.equal(s.classAwakening.bark, 40);
    s.mana = 0;
    const hit = core.playerAttack(s, "attack", rng);
    assert.equal(hit.damage, 120);
    assert.equal(s.mana, 5);
    assert.equal(innate.combat(s).wildMpReady, 4);
    s.hp = 990;
    s.classAwakening.bark = 0;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.classAwakening.bark, 85);
    s.classAwakening.bark = 170;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.classAwakening.bark, 180);
  });
  test("Druid healing reduction applies to heal and base Bark; preview does not mutate", () => {
    const s = fresh("druid");
    s.hp = 500;
    s.healingReduction = 0.5;
    core.playerAttack(s, "skill", rng);
    assert.equal(s.hp, 550);
    assert.equal(s.classAwakening.bark, 20);
    const before = JSON.stringify(s);
    core.skillDamagePreview(s);
    view.embed(s, "u");
    assert.equal(JSON.stringify(s), before);
  });
  test("Assassin Crit healing is 2%; Barbarian Fury Barrier is 5%", () => {
    const s = fresh("assassin");
    s.hp = 500;
    s.critChance = 1;
    core.playerAttack(s, "attack", () => 0);
    assert.equal(s.hp, 520);
    const b = fresh("barbarian");
    awake.combat(b).fury = 2;
    core.playerAttack(b, "skill", rng);
    assert.equal(awake.combat(b).barrier, 100);
  });
  test("Necromancer Anchor needs three Wards, progress persists, anchored attack +15% consumes on miss", () => {
    const s = fresh("necromancer");
    for (let n = 0; n < 2; n++) {
      core.playerAttack(s, "skill", rng);
      assert(!innate.combat(s).anchor);
    }
    core.playerAttack(s, "skill", rng);
    assert(innate.combat(s).anchor);
    assert.equal(innate.combat(s).anchorProgress, 0);
    const hit = core.playerAttack(s, "attack", rng);
    assert.equal(hit.damage, 115);
    assert(hit.dodge);
    assert(!innate.combat(s).anchor);
  });
  test("Mana Shield absorbs up to 20% Max HP twice, no MP cost; defend excluded, phase recharges, preview read-only", () => {
    const s = fresh("sorceress");
    s.mana = 0;
    assert.equal(innate.absorb(s, 300, 2).remaining, 100);
    assert.equal(innate.absorb(s, 300, 2).remaining, 100);
    assert.equal(innate.absorb(s, 300, 2).remaining, 300);
    assert.equal(s.mana, 0);
    s.encounter.boss = { phase: 2 };
    const before = JSON.stringify(s);
    assert.equal(innate.manaShieldAmount(s, 300, 2), 200);
    assert.equal(JSON.stringify(s), before);
    assert.equal(innate.absorb(s, 300, 2, true).remaining, 300);
    assert.equal(innate.absorb(s, 300, 2).remaining, 100);
    assert.equal(innate.combat(s).manaShieldCharges, 1);
  });
  test("Actual Sorceress counter applies after Barrier and does not activate during Defend", () => {
    const s = fresh("sorceress");
    s.mana = 0;
    awake.combat(s).barrier = 30;
    const hp = s.hp;
    core.enemyTurn(s, () => 0.1);
    assert.equal(s.hp, hp);
    assert.equal(awake.combat(s).barrier, 0);
    assert.equal(innate.combat(s).manaShieldCharges, 1);
    core.enemyTurn(s, () => 0.1, true);
    assert.equal(innate.combat(s).manaShieldCharges, 1);
    assert(s.hp < hp);
  });
  test("Arcane Echo 80%, optional second Echo, 15% Barrier; no recursive Echo and preview range", () => {
    const s = fresh("sorceress");
    s.classAwakening.echo = 1;
    const before = JSON.stringify(s),
      p = core.skillDamagePreview(s);
    assert.equal(JSON.stringify(s), before);
    assert(p.high > p.low);
    const result = core.playerAttack(s, "skill", () => 0);
    assert.equal(result.dealt, p.high);
    assert.equal(awake.combat(s).barrier, 150);
    assert.equal(s.classAwakening.echo, 0);
    assert.equal(s.classAwakening.echoProgress, 0);
  });
  test("Paladin Holy uses 20% DEF + numeric RES; ignores normal/elite DEF, bosses retain DEF; Vindicate +15%", () => {
    const s = fresh("paladin");
    s.defense = 400;
    s.resistance = 10;
    awake.combat(s).ground = 2;
    s.encounter.defense = 100000;
    const base = core.playerAttack(s, "attack", rng);
    assert(base.log.includes("Consecration: +90 DMG."));
    s.encounter.defense = 0;
    core.playerAttack(s, "skill", rng);
    assert.equal(innate.multiplier(s, "attack"), 1.15);
  });
  test("New item curve full first three levels, later marginal values; duplicate and cleanse receipts use same curve", () => {
    const s = fresh("amazon", false);
    for (const [n, v] of [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 3.7],
      [5, 4.2],
      [6, 4.5],
      [7, 4.6],
      [8, 4.7],
      [20, 5.9],
    ])
      assert(Math.abs(rules.scale(n, s) - v) < 1e-9);
    const d = items.ITEMS_V3.common.find((i) => i.id === "rusted_edge"),
      old = s.str;
    core.receiveItem(s, d, 3);
    assert.equal(s.str - old, d.effects.str * 3);
    s.lastReceivedItems = [];
    core.receiveItem(s, d, 1);
    assert(Math.abs(s.lastReceivedItems[0].effectScale - 0.7) < 1e-9);
    assert.equal(rules.scale(3), 2);
  });
  test("Loot weights and no-consecutive selection; one-candidate fallback preserves eligibility", () => {
    const s = fresh("amazon", false),
      a = { id: "a" },
      b = { id: "b" };
    s.items = [{ definition: a, level: 6 }];
    assert.equal(loot.weight(s, a), 0.1);
    assert.equal(loot.weight(s, b), 1);
    s.lastRolledItemId = "a";
    assert.equal(loot.pick(s, [a, b], () => 0).id, "b");
    assert.equal(loot.pick(s, [a, b], () => 0).id, "a");
    assert.equal(loot.pick(s, [a], () => 0).id, "a");
  });
  test("Awakening-only Druid heal change, boss Holy DEF, and true recoil exclusions", () => {
    const early = fresh("druid", false);
    early.hp = 500;
    core.playerAttack(early, "skill", rng);
    assert.equal(early.hp, 620);
    const p = fresh("paladin");
    p.defense = 400;
    p.resistance = 10;
    p.encounter.rank = "boss";
    p.encounter.defense = 100000;
    awake.combat(p).ground = 2;
    const blocked = core.playerAttack(p, "attack", rng);
    assert(!blocked.log.includes("Consecration: +90 DMG."));
    const s = fresh("sorceress");
    s.encounter.mechanic = "avarice_revenant";
    s.encounter.gildedTrial = { from: 0, floor: s.floor };
    awake.combat(s).barrier = 500;
    core.act(s, session, "skill", rng);
    assert.equal(s.hp, 979);
    assert.equal(awake.combat(s).barrier, 400);
    assert.equal(innate.combat(s).manaShieldCharges, 2);
  });
  test("Real service persists reworked revisions/resources and rejects stale retry", () => {
    const service = require("../src/services/hardcoreService"),
      repo = require("../src/hardcore/storage/sessions");
    db.prepare(
      "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
    ).run("rework-service", "u", 1000000);
    const run = service.startHardcore({
      guildId: "rework-service",
      userId: "u",
      channelId: "c",
      stake: 10000,
      classKey: "druid",
      forcedEncounter: { type: "empty" },
    });
    Object.assign(run.state, fresh("druid"));
    repo.saveState(run.session, run.state);
    const turn = run.state.turn;
    const played = service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      expectedTurn: turn,
      action: "skill",
    });
    assert.equal(played.state.classInnateRevision, 2);
    assert.equal(played.state.itemLevelCurveVersion, 2);
    assert.equal(played.state.lootRulesVersion, 2);
    assert.equal(played.state.encounter.innateCombat.version, 2);
    assert(played.state.encounter.innateCombat.wild);
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
    repo.deleteSession(run.session.id);
  });
  console.log(groups + " deterministic rework groups passed.");
} finally {
  db.close();
}
