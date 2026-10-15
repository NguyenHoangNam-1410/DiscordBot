"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine");
const chars = require("../src/hardcore/characters");
const kit = require("../src/hardcore/characters/venance");
const policy = require("./hardcore-venance-policy");
const bossPolicy = require("./hardcore-boss-policy-v2");
const session = {
  id: "venance-policy-test",
  guild_id: "g",
  user_id: "u",
  channel_id: "c",
};
function fresh() {
  const s = chars.preview("venance", 0, "SSR");
  Object.assign(s, {
    floor: 6,
    cleared: 5,
    encounter: {
      type: "combat",
      name: "Fixture",
      rank: "normal",
      hp: 100000,
      maxHp: 100000,
      defense: 0,
      resistance: 0,
      evasion: 0,
      accuracy: 100,
      critChance: 0,
      damageMin: 1,
      damageMax: 1,
      damageType: "physical",
      nextDamageType: "physical",
      combatTurn: 1,
    },
  });
  core.prepareItemCombat(s, () => 0.5);
  return s;
}
try {
  const s = fresh(),
    before = JSON.stringify(s);
  assert.equal(policy.choose(s), "skill");
  assert.equal(
    JSON.stringify(s),
    before,
    "Preview decisions must not mutate the run",
  );
  core.act(s, session, "skill", () => 0.5);
  for (let n = 0; n < 3; n++) {
    assert.equal(policy.choose(s), "attack", "Never recast over a live buff");
    core.act(s, session, "attack", () => 0.5);
  }
  assert.equal(kit.frame(s).remaining, 0);
  s.mana = 0;
  assert.equal(
    policy.choose(s),
    "defend",
    "Recover two MP rather than loop on unavailable Skill",
  );
  s.encounter.hp = 1;
  assert.equal(
    policy.choose(s),
    "attack",
    "Finish without casting preparation",
  );
  s.encounter.hp = 100000;
  s.hp = 1;
  s.potions = 3;
  assert.equal(policy.choose(s), "potion");
  const heal = fresh();
  core.act(heal, session, "skill", () => 0.5);
  kit.frame(heal).ready = true;
  heal.potions = 0;
  heal.hp = 1;
  assert.equal(policy.choose(heal), "defend", "Use a ready sigil in danger");
  const boss = fresh();
  boss.floor = 100;
  boss.bossRosterVersion = 2;
  boss.encounter = require("../src/hardcore/engine/world").makeEnemy(
    boss,
    "boss",
    null,
    () => 0.5,
    require("../src/hardcore/bosses/catalogV2").CATALOG.justicar,
  );
  boss.encounter.damageMin = boss.encounter.damageMax = 1;
  boss.encounter.critChance = 0;
  core.prepareItemCombat(boss, () => 0.5);
  assert.equal(
    bossPolicy.choose(boss),
    "boss_justicar__verdict1",
    "Venance chooses the magic verdict",
  );
  core.act(boss, session, bossPolicy.choose(boss), () => 0.5);
  assert.equal(
    bossPolicy.choose(boss),
    "skill",
    "Boss fallback casts preparation",
  );
  core.act(boss, session, "skill", () => 0.5);
  assert.equal(
    bossPolicy.choose(boss),
    "attack",
    "Boss fallback uses empowered Attack",
  );
  assert.equal(
    bossPolicy.choose({ ...fresh(), encounter: { type: "prophecy" } }),
    "prophecy_arcane",
  );
  console.log(
    "PASS Venance simulation policy: buff cycle, MP recovery, healing, finishers, pure previews, boss magic choice and empowered Attack",
  );
} finally {
  db.close();
}
