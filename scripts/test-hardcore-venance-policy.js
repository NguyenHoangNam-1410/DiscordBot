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
  kit.frame(s).ready = false;
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
  function fixtureBoss(id) {
    const s = fresh();
    s.floor = 700;
    s.bossRosterVersion = 2;
    s.encounter = require("../src/hardcore/engine/world").makeEnemy(
      s,
      "boss",
      null,
      () => 0.5,
      require("../src/hardcore/bosses/catalogV2").CATALOG[id],
    );
    s.encounter.damageMin = s.encounter.damageMax = 1;
    s.encounter.critChance = 0;
    core.prepareItemCombat(s, () => 0.5);
    return s;
  }
  for (const id of [
    "anomaly",
    "belial",
    "control",
    "lucion",
    "bul_kathos",
    "jitan",
  ]) {
    const s = fixtureBoss(id),
      m = s.encounter.boss.mechanicState;
    if (id === "anomaly") m.shards = [0, 1, 2];
    if (id === "control") m.hints = 2;
    if (id === "lucion") m.will = 2;
    const before = JSON.stringify(s);
    assert.equal(
      bossPolicy.choose(s),
      "skill",
      id + " prepares before opening",
    );
    assert.equal(JSON.stringify(s), before, id + " decision must stay pure");
    core.act(s, session, "skill", () => 0.5);
    const open = bossPolicy.choose(s);
    assert(
      open.startsWith("boss_" + id + "__"),
      id + " opens instead of recasting: " + open,
    );
    core.act(s, session, open, () => 0.5);
    assert.equal(
      kit.frame(s).remaining,
      2,
      id + " retains two empowered actions",
    );
    assert.equal(
      bossPolicy.choose(s),
      "attack",
      id + " uses the open damage window",
    );
  }
  const sustain = fresh();
  core.act(sustain, session, "skill", () => 0.5);
  Object.assign(kit.frame(sustain), { remaining: 0, hits: 3, ready: true });
  sustain.hp = sustain.maxHp * 0.6;
  sustain.mana = 0;
  assert.equal(
    policy.choose(sustain),
    "defend",
    "Spend old sigil and recover MP before a new cast",
  );
  const lethal = fresh();
  core.act(lethal, session, "skill", () => 0.5);
  lethal.encounter.hp = 1;
  lethal.hp = 1;
  lethal.potions = 3;
  assert.equal(
    policy.choose(lethal),
    "attack",
    "Guaranteed magic finisher avoids potion and counter",
  );
  const inarius = fixtureBoss("inarius");
  inarius.encounter.boss.mechanicState.lilithHp = 5;
  assert.equal(
    bossPolicy.choose(inarius),
    "boss_inarius__protect",
    "Protect Lilith before an urgent pull",
  );
  const butcher = fixtureBoss("butcher");
  butcher.encounter.boss.mechanicState.distance = 0;
  butcher.encounter.boss.mechanicState.stack = 3;
  assert.equal(
    bossPolicy.choose(butcher),
    "skill",
    "No endless retreat at zero distance",
  );
  const stale = fixtureBoss("justicar");
  stale.encounter.boss.mechanicState.verdict = 1;
  stale.encounter.boss.mechanicState.verdictTurns = 3;
  stale.encounter.boss.mechanicState.skipCounter = true;
  stale.encounter.damageMin = stale.encounter.damageMax = 20;
  const staleBefore = JSON.stringify(stale);
  assert(
    policy.context(stale).incoming.high > 0,
    "Previous puzzle skip is not next-turn protection",
  );
  assert.equal(JSON.stringify(stale), staleBefore);
  const insufficient = fresh();
  core.act(insufficient, session, "skill", () => 0.5);
  kit.frame(insufficient).ready = true;
  insufficient.hp = 1;
  insufficient.potions = 3;
  insufficient.encounter.damageMin = insufficient.encounter.damageMax = 100;
  assert.equal(
    policy.choose(insufficient),
    "potion",
    "Do not spend a small sigil heal into a lethal counter",
  );
  console.log(
    "PASS Venance simulation policy: buff cycle, MP recovery, healing, finishers, pure previews, boss magic choice and empowered Attack",
  );
} finally {
  db.close();
}
