"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
process.env.DB_PATH = path.join(__dirname, "../data/paradox-memory.sqlite");
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
delete process.env.HARDCORE_GAMEPLAY_VERSION;
const stats = require("../src/services/hardcoreStats"),
  core = require("../src/services/hardcoreV2"),
  paradox = require("../src/services/hardcoreParadoxService"),
  world = require("../src/services/hardcoreWorld"),
  view = require("../src/services/hardcoreV2View"),
  service = require("../src/services/hardcoreService"),
  repo = require("../src/services/hardcoreRepository");
const session = { id: "p", guild_id: "p", user_id: "p", channel_id: "c" };
const baseKeys = [
  "damageMin",
  "damageMax",
  "defense",
  "resistance",
  "maxHp",
  "payoutFactor",
];
const snapshot = (s) => Object.fromEntries(baseKeys.map((k) => [k, s[k]]));
function state(id = "blood_pact", classKey = "barbarian", roll = 0.5) {
  const s = stats.createState(classKey, 10);
  s.floor = 26;
  s.cleared = 25;
  s.phase = "paradox";
  const pairId = Object.keys(paradox.PAIRS).find((k) =>
    paradox.PAIRS[k].includes(id),
  );
  s.encounter = {
    type: "paradox",
    version: 2,
    milestone: 25,
    pairId,
    choices: [...paradox.PAIRS[pairId]],
  };
  paradox.choose(s, id);
  s.phase = "encounter";
  s.encounter = world.makeEnemy(s, "normal", "Test", () => 0.5);
  s.encounter.hp = s.encounter.maxHp = 100000;
  s.encounter.damageMin = s.encounter.damageMax = 1;
  s.encounter.accuracy = 1000;
  s.evasion = 0;
  paradox.prepareCombat(s, () => roll);
  return s;
}
try {
  for (const id of Object.keys(paradox.CATALOG)) {
    const s = state(id);
    const original = snapshot(s);
    for (let floor = 26; floor <= 30; floor++) {
      assert.equal(s.floor, floor);
      assert(paradox.active(s));
      const loaded = core.normalize(JSON.parse(JSON.stringify(s)));
      assert.deepEqual(loaded.activeParadox, s.activeParadox);
      assert.deepEqual(snapshot(loaded), original);
      s.encounter = { type: "empty", name: "Empty" };
      core.completeFloor(s, session, () => 0.99, 0);
      assert.deepEqual(snapshot(s), original);
    }
    assert.equal(s.floor, 31);
    assert.equal(s.activeParadox, undefined);
    paradox.expire(s, 30);
    assert.deepEqual(snapshot(s), original);
  }
  for (const [roll, pair] of [
    [0.01, "resource"],
    [0.26, "defense"],
    [0.51, "pressure"],
    [0.76, "volatility"],
  ]) {
    const e = paradox.encounter(25, () => roll);
    assert.equal(e.pairId, pair);
    assert.deepEqual(e.choices, paradox.PAIRS[pair]);
  }
  // The checkpoint upgrade precedes the new pair; rendering never draws RNG.
  const milestone = stats.createState("barbarian", 10);
  milestone.floor = 25;
  milestone.encounter = { type: "empty" };
  core.completeFloor(milestone, session, () => 0.99, 0);
  assert.equal(milestone.phase, "upgrade");
  assert.equal(milestone.hp, milestone.maxHp);
  core.act(milestone, session, "upgrade_str", () => 0.1);
  assert.equal(milestone.phase, "paradox");
  assert.equal(milestone.encounter.version, 2);
  const lockedPair = JSON.stringify(milestone.encounter);
  view.encounterText(milestone);
  assert.equal(JSON.stringify(milestone.encounter), lockedPair);
  core.act(milestone, session, "paradox_mana_fracture", () => 0.99);
  assert.deepEqual(milestone.paradoxMilestonesClaimed, [25]);
  assert.equal(milestone.activeParadox.endFloor, 30);
  const blood = state("blood_pact", "sorceress");
  const cost = paradox.hpCost(blood);
  blood.hp = cost;
  assert(core.actions(blood).find((x) => x.action === "skill").disabled);
  assert.throws(
    () => core.act(blood, session, "skill", () => 0.5),
    /INVALID_ACTION/,
  );
  blood.hp = cost + 1;
  blood.encounter.hp = 1;
  const before = blood.hp;
  core.playerAttack(blood, "skill", () => 0.5);
  assert.equal(blood.hp, before - cost);
  assert.equal(blood.hp, 1);
  assert.equal(blood.encounter.hp, 0);
  const mana = state("mana_fracture", "sorceress");
  assert.equal(core.skillManaCost(mana), 1);
  assert.equal(core.attackManaGain(mana), 0);
  assert.equal(core.actions(mana)[0].label, "+0 MP");
  mana.classShrine = {
    classKey: "sorceress",
    from: 26,
    until: 28,
    consumed: false,
  };
  assert.equal(core.skillManaCost(mana), 0);
  core.playerAttack(mana, "skill", () => 0.5);
  assert(mana.classShrine.consumed);
  const armor = state("inverted_armor");
  armor.resistance = -45;
  assert.equal(paradox.effectiveRes(armor, armor.resistance), -50);
  const magic = state("inverted_magic");
  magic.resistance = 70;
  assert.equal(paradox.effectiveRes(magic, magic.resistance), 75);
  assert.equal(magic.resistance, 70);
  for (const [id, factor] of [
    ["inverted_armor", 0.75],
    ["inverted_magic", 1.35],
  ]) {
    const s = state(id);
    s.damageTaken = 0.5;
    for (const defend of [false, true]) {
      const expected = Math.max(
        1,
        Math.floor(
          100 *
            (1 - world.defenseReduction(s.defense * (defend ? 2 : 1), 26)) *
            factor *
            1.5 *
            (defend ? 0.85 : 1),
        ),
      );
      assert.equal(
        core.attackDamage(s.encounter, s, s, () => 0, {
          raw: 100,
          critical: false,
          defend,
        }).damage,
        expected,
      );
    }
  }
  const hunger = state("hunger");
  hunger.hp = 10;
  const baselineHp = hunger.hp;
  hunger.encounter.hp = 1;
  core.act(hunger, session, "attack", () => 0);
  assert.equal(
    hunger.hp,
    baselineHp + Math.max(1, Math.floor(hunger.maxHp * 0.12)),
  );
  const potionState = state("hunger");
  potionState.potionRate = 0.35;
  assert.equal(paradox.potionRate(potionState), 0.175);
  potionState.potionRate = 0.1;
  assert.equal(paradox.potionRate(potionState), 0.1);
  const noKill = state("hunger");
  noKill.hp = 10;
  noKill.encounter = { type: "empty" };
  core.act(noKill, session, "next", () => 0.99);
  assert.equal(noKill.hp, 10);
  const debt = state("time_debt");
  const count = [];
  for (const action of ["defend", "attack", "attack", "attack"]) {
    const hp = debt.hp;
    core.act(debt, session, action, () => 0);
    count.push(hp - debt.hp);
  }
  assert.deepEqual(count, [1, 1, 2, 1]);
  assert.equal(debt.activeParadox.combatActionCount, 4);
  debt.encounter = world.makeEnemy(debt, "normal", "New", () => 0.5);
  paradox.prepareCombat(debt, () => 0.5);
  assert.equal(debt.activeParadox.combatActionCount, 0);
  assert.equal(debt.activeParadox.attackActionCount, 0);
  // The second counter uses the newly rolled mixed damage type, not a copied hit.
  const mixed = state("time_debt");
  mixed.activeParadox.combatActionCount = 2;
  mixed.encounter.damageType = "mixed";
  mixed.encounter.nextDamageType = "physical";
  mixed.encounter.magicChance = 1;
  mixed.encounter.damageMin = mixed.encounter.damageMax = 10;
  const clone = structuredClone(mixed),
    hpBefore = clone.hp;
  core.enemyTurn(clone, () => 0.5, true);
  const first = hpBefore - clone.hp;
  assert.equal(clone.encounter.nextDamageType, "magic");
  const afterFirst = clone.hp;
  core.enemyTurn(clone, () => 0.5, true);
  const second = afterFirst - clone.hp;
  core.act(mixed, session, "defend", () => 0.5);
  assert.equal(hpBefore - mixed.hp, first + second);
  const killing = state("time_debt");
  killing.activeParadox.combatActionCount = 2;
  killing.encounter.hp = 1;
  const untouched = killing.hp;
  core.act(killing, session, "attack", () => 0);
  assert.equal(killing.hp, untouched);
  // Damage order and final rounding include class, item/elite, Paradox, RES and boss reduction.
  const outgoing = state("blood_pact", "sorceress");
  outgoing.eliteDamage = 0.15;
  outgoing.encounter.rank = "elite";
  outgoing.encounter.mechanic = "deimoss";
  outgoing.encounter.resistance = 23;
  outgoing.spellMin = outgoing.spellMax = 37;
  const enemyHp = outgoing.encounter.hp;
  core.playerAttack(outgoing, "skill", () => 0.5);
  assert.equal(
    enemyHp - outgoing.encounter.hp,
    Math.floor(37 * 2.1 * 1.15 * 1.3 * 0.77 * 0.75),
  );
  const mirror = state("blood_mirror");
  mirror.hp = mirror.maxHp * 0.4;
  assert.equal(paradox.outgoing(mirror), 1.4);
  assert(!core.actions(mirror).find((x) => x.action === "potion").disabled);
  core.playerAttack(mirror, "potion", () => 0.5);
  assert(paradox.potionLocked(mirror));
  assert(core.actions(mirror).find((x) => x.action === "potion").disabled);
  assert.equal(paradox.outgoing(mirror), 1);
  for (const [roll, cost] of [
    [0.1, 0],
    [0.3, 3],
    [0.8, 2],
  ]) {
    const s = state("unstable_soul", "sorceress", roll);
    s.mana = 1;
    core.normalize(s);
    assert.equal(core.skillManaCost(s), cost);
    const saved = JSON.stringify(s);
    for (let i = 0; i < 3; i++) {
      core.normalize(s);
      core.actions(s);
      view.rows("test", s);
      view.encounterText(s);
      paradox.prepareCombat(s, () => {
        throw Error("REROLL");
      });
    }
    assert.equal(JSON.stringify(s), saved);
    assert.equal(
      core.actions(s).find((x) => x.action === "skill").disabled,
      cost > 1,
    );
    if (cost === 0) {
      core.playerAttack(s, "skill", () => 0.5);
      assert.equal(s.mana, 1);
    }
  }
  const legacy = stats.createState("barbarian", 10);
  legacy.floor = 26;
  legacy.paradox = { kind: "inverse", from: 26, until: 30 };
  assert.deepEqual(core.physicalRange(legacy), [11, 16]);
  core.normalize(legacy);
  assert.equal(legacy.paradox.kind, "inverse");
  legacy.phase = "paradox";
  legacy.encounter = { type: "paradox" };
  assert.deepEqual(
    core.actions(legacy).map((x) => x.action),
    ["paradox_blood", "paradox_inverse"],
  );
  const oldBlood = stats.createState("barbarian", 10);
  oldBlood.floor = 26;
  oldBlood.cleared = 25;
  oldBlood.paradox = { kind: "blood", from: 26, until: 30, bloodFactor: 0 };
  const originalPayout = core.rawPayout(oldBlood);
  core.hurt(oldBlood, 13);
  assert(core.payout(oldBlood) > originalPayout);
  core.heal(oldBlood, 13);
  assert.equal(core.payout(oldBlood), originalPayout);
  // Use real SQLite/fairness transaction to verify stale choice and cost/save rollback.
  const run = service.startHardcore({
    guildId: "p",
    userId: "transaction",
    channelId: "c",
    stake: 10,
    classKey: "sorceress",
    forcedEncounter: { type: "empty" },
  });
  const pending = state("mana_fracture", "sorceress");
  delete pending.activeParadox;
  pending.paradoxMilestonesClaimed = [];
  pending.phase = "paradox";
  pending.encounter = paradox.encounter(25, () => 0);
  pending.turn = 0;
  const started = repo.parseState(repo.getSession(run.session.id));
  pending.fair = started.fair;
  for (const k of Object.keys(started).filter((k) => /fair|rng|seed/i.test(k)))
    pending[k] = started[k];
  repo.saveState(run.session, pending);
  service.playHardcore({
    sessionId: run.session.id,
    userId: "transaction",
    expectedTurn: 0,
    action: "paradox_blood_pact",
  });
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "transaction",
        expectedTurn: 0,
        action: "paradox_blood_pact",
      }),
    /STALE_ACTION/,
  );
  const saved = repo.parseState(repo.getSession(run.session.id));
  saved.encounter = world.makeEnemy(saved, "normal", "Rollback", () => 0.5);
  saved.encounter.hp = 100000;
  paradox.prepareCombat(saved, () => 0.5);
  repo.saveState(run.session, saved);
  const json = repo.getSession(run.session.id).state_json;
  db.exec(
    "CREATE TRIGGER fail_paradox_save BEFORE UPDATE ON hardcore_sessions BEGIN SELECT RAISE(ABORT,'TEST_SAVE_FAILURE'); END",
  );
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: run.session.id,
        userId: "transaction",
        expectedTurn: saved.turn,
        action: "skill",
      }),
    /TEST_SAVE_FAILURE/,
  );
  assert.equal(repo.getSession(run.session.id).state_json, json);
  db.exec("DROP TRIGGER fail_paradox_save");
  console.log(
    "Paradox v2: 8 effects, expiry, costs, locked RNG, checkpoint, legacy, stale action and rollback passed.",
  );
} finally {
  db.close();
}
