"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const memory = new Database(":memory:");
memory.exec(
  "CREATE TABLE hardcore_sessions(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,state_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(guild_id,user_id))",
);
for (const [id, mode] of [
  ["old", "survival"],
  ["tower", "tower"],
])
  memory.prepare("INSERT INTO hardcore_sessions VALUES(?,?,?,?,?,?,?,?)").run(
    id,
    "migration",
    id,
    "c",
    null,
    JSON.stringify({
      gameplayVersion: 2,
      classKey: "barbarian",
      mode,
      relics: [{ id: "conquerors_covenant", acquiredFloor: 17 }],
    }),
    1,
    2,
  );
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return memory;
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine");
const stats = require("../src/hardcore/engine/stats");
const world = require("../src/hardcore/engine/world");
const gilded = require("../src/hardcore/events/gildedSoul");
const records = require("../src/hardcore/storage/relicRecords");
const loot = require("../src/hardcore/monsterLoot");
const view = require("../src/hardcore/ui");
const profile = require("../src/hardcore/ui/profile");
const achievements = require("../src/services/achievementService");
const service = require("../src/hardcore");
const repo = require("../src/hardcore/storage/sessions");
const deps = require("../src/hardcore/engine/dependencies")({});
const shrines = require("../src/hardcore/engine/shrines")(deps);
const session = { id: "gilded", guild_id: "g", user_id: "u", channel_id: "c" };
const groups = [];
function state(floor = 11, classKey = "barbarian") {
  const s = stats.createState(classKey, 10000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    lastLog: "",
    phase: "encounter",
    encounter: { type: "empty" },
  });
  return s;
}
function ritual(s) {
  s.grudge = { from: s.floor - 10, readyFloor: s.floor, stage: "waiting" };
  s.encounter = {
    type: "shrine",
    kind: "ritual",
    name: "Shrine",
    branchCount: 7,
  };
  return s;
}
function boss(s) {
  ritual(s);
  assert.equal(
    core.act(s, session, "ritual_summon", () => 0.5),
    null,
  );
  const e = s.encounter;
  Object.assign(e, {
    hp: 1000,
    maxHp: 1000,
    defense: 0,
    resistance: 0,
    evasion: 0,
    critChance: 0,
    damageMin: 10,
    damageMax: 10,
    nextDamageType: "magic",
    damageType: "magic",
  });
  return e;
}
function text(p) {
  return JSON.stringify(p.embeds.map((e) => (e.toJSON ? e.toJSON() : e)));
}
function bounds(p) {
  let size = 0;
  for (const x of p.embeds) {
    const e = x.toJSON ? x.toJSON() : x;
    assert((e.fields?.length || 0) <= 25);
    assert((e.description?.length || 0) <= 4096);
    size +=
      (e.title?.length || 0) +
      (e.description?.length || 0) +
      (e.footer?.text?.length || 0);
    for (const f of e.fields || []) {
      assert(f.value.length <= 1024);
      size += f.name.length + f.value.length;
    }
    assert(!JSON.stringify(e).includes("undefined"));
  }
  assert(size <= 6000);
}
function privateTab(s, tab) {
  return view.privatePayload(s, session.id, "m", tab, 0);
}
function activate(s) {
  s.relics = [{ id: gilded.RELIC_ID, acquiredFloor: 1 }];
  s.activeRelic = gilded.RELIC_ID;
  return s;
}
// Existing known run relics migrate with unknown time, without inventing Tower records.
assert.equal(records.totals("migration", "old").conquerors_covenant, 1);
assert.equal(
  records.history("migration", "old", "conquerors_covenant")[0].acquired_at,
  null,
);
assert.equal(records.totals("migration", "tower").conquerors_covenant, 0);
groups.push(
  "migration preserves known prior relics, unknown timestamps and Tower exclusion",
);
// Actual robbery adds a separate mark without changing the old delayed consequence.
const robbed = state(11);
robbed.encounter = core.makeSurprise(robbed, () => 0.5, "adventurer");
core.act(robbed, session, "event_rob", () => 0.5);
assert.equal(robbed.grudge.from, 11);
assert.equal(robbed.grudge.readyFloor, 21);
assert.equal(robbed.debts.length, 1);
assert.equal(gilded.mark(robbed), false);
assert.equal(robbed.grudge.readyFloor, 21);
for (const action of ["event_rescue", "event_skip"]) {
  const s = state();
  s.encounter = core.makeSurprise(s, () => 0.5, "adventurer");
  core.act(s, session, action, () => 0.5);
  assert.equal(s.grudge, undefined);
}
for (const mode of ["tower", "tower_weekly"]) {
  const s = state();
  s.mode = mode;
  assert.equal(gilded.mark(s), false);
  assert.equal(gilded.ready(ritual(s)), false);
}
groups.push(
  "robbery keeps its old memory, rescue/skip create no mark, repeat robbery keeps first due floor",
);
const waiting = state(20);
waiting.grudge = { from: 11, readyFloor: 21, stage: "waiting" };
assert.equal(shrines.makeShrine(waiting, () => 0.99).kind, "fake");
waiting.floor = 21;
for (let i = 0; i < 7; i++) {
  let draws = 0;
  const e = shrines.makeShrine(waiting, () =>
    draws++ === 0 ? (i + 0.5) / 7 : 0.5,
  );
  assert.equal(e.branchCount, 7);
  assert.equal(e.kind, [...deps.SHRINE_KINDS, "ritual"][i]);
}
waiting.grudge.stage = "completed";
assert.equal(shrines.makeShrine(waiting, () => 0.99).kind, "fake");
const skipped = ritual(state());
core.act(skipped, session, "skip", () => 0.5);
assert.equal(skipped.grudge.stage, "waiting");
assert.throws(
  () => core.act(state(), session, "ritual_summon", () => 0.5),
  /INVALID_ACTION/,
);
groups.push(
  "10-floor boundary, exactly seven equal branches, skip retains mark and forged summon rejected",
);
const idle = state();
const idleEnemy = boss(idle);
idle.hp = 80;
idle.resistance = 0;
core.act(idle, session, "defend", () => 0.5);
assert.equal(idle.hp, 80);
assert.equal(idleEnemy.idleTurns, 1);
core.act(idle, session, "defend", () => 0.5);
assert(idle.hp < 80);
const afterSecond = idle.hp;
core.act(idle, session, "defend", () => 0.5);
assert(idle.hp < afterSecond);
core.act(idle, session, "attack", () => 0.99);
assert.equal(idleEnemy.idleTurns, 0);
const beforeWait = idle.hp;
core.act(idle, session, "defend", () => 0.5);
assert.equal(idle.hp, beforeWait);
const potion = state();
boss(potion);
potion.hp = potion.maxHp * 0.4 - 1;
assert(core.actions(potion).find((a) => a.action === "potion").disabled);
assert.throws(
  () => core.act(potion, session, "potion", () => 0.5),
  /INVALID_ACTION/,
);
assert.throws(
  () => core.playerAttack(potion, "potion", () => 0.5),
  /POTION_LOCKED/,
);
potion.hp = potion.maxHp * 0.4;
assert(!core.actions(potion).find((a) => a.action === "potion").disabled);
groups.push(
  "boss waits only first consecutive nonattack, attack/miss resets wait, potion threshold enforced server-side",
);
const critical = state();
const critEnemy = boss(critical);
critical.hp = critical.maxHp;
critical.critChance = 1;
critical.damageMin = critical.damageMax = 40;
critical.activeParadox = {
  id: "time_debt",
  startFloor: 11,
  endFloor: 15,
  combatActionCount: 2,
};
const beforeCrit = critical.hp;
core.act(critical, session, "attack", () => 0.1);
const dealt = 1000 - critEnemy.hp;
assert.equal(critical.hp, beforeCrit - Math.floor(dealt * 0.1));
assert(critical.lastLog.includes("CRIT gián đoạn"));
assert(!critical.lastLog.includes("Phản công lần hai"));
const mage = state(11, "necromancer");
boss(mage);
mage.hp = mage.maxHp;
const mageHp = mage.hp;
core.act(mage, session, "skill", () => 0.5);
assert(mage.hp < mageHp);
assert(mage.lastLog.includes("Phản phệ"));
assert(mage.lastLog.includes("chặn/né"));
const isolated = state();
boss(isolated);
isolated.hp = 50;
isolated.defense = 9999;
isolated.resistance = 99;
assert.equal(
  gilded.afterAction(
    isolated,
    "skill",
    { dealt: 100, critical: true },
    core.hurt,
  ).recoil,
  10,
);
assert.equal(isolated.hp, 40);
groups.push(
  "Crit suppresses normal/double counter but keeps actual-damage recoil; class blocking, DEF and RES cannot block recoil",
);
const fatal = state();
const fatalEnemy = boss(fatal);
fatal.hp = 1;
fatalEnemy.hp = 100;
fatal.damageMin = fatal.damageMax = 1000;
assert.equal(
  core.act(fatal, session, "attack", () => 0.5),
  "death",
);
assert.equal(fatalEnemy.hp, 0);
assert.equal(gilded.owns(fatal), false);
assert.equal(fatal.kills || 0, 0);
fatal.reviveTickets = 1;
assert(core.reviveAfterDeath(fatal, session, () => 0.5, "death"));
assert.equal(core.actions(fatal)[0].action, "ritual_claim");
const reviveHp = fatal.hp;
assert.equal(
  core.act(fatal, session, "ritual_claim", () => 0.5),
  null,
);
assert.equal(fatal.hp, reviveHp);
assert(gilded.owns(fatal));
assert.equal(fatal.kills, 1);
assert.throws(
  () => core.act(fatal, session, "ritual_claim", () => 0.5),
  /INVALID_ACTION/,
);
groups.push(
  "lethal killing-hit recoil grants no relic until revival and explicit claim, no ghost attack or double reward",
);
const noBlessing = state(11);
const plain = boss(noBlessing);
plain.hp = 1;
noBlessing.hp = 55;
noBlessing.mana = 0;
noBlessing.modifiers = { bloodlust: 2, stone_skin: 1 };
const curse = core.ITEMS.cursed.find((i) => !i.curse.effects.floorHpLoss);
core.receiveItem(noBlessing, curse);
const curseBefore = structuredClone(noBlessing.items);
const riftsBefore = structuredClone(noBlessing.modifiers);
core.act(noBlessing, { ...session, id: "no-blessing" }, "attack", () => 0.5);
assert.equal(noBlessing.hp, 55);
assert(noBlessing.mana < noBlessing.maxMana);
assert.deepEqual(noBlessing.items, curseBefore);
assert.deepEqual(noBlessing.modifiers, riftsBefore);
assert.equal(noBlessing.grudge.stage, "completed");
const other = state();
boss(other).hp = 1;
other.relics = [{ id: "fatebreaker_seal", acquiredFloor: 1 }];
other.activeRelic = "fatebreaker_seal";
core.act(other, { ...session, id: "inactive" }, "attack", () => 0.5);
assert(gilded.owns(other));
assert.equal(other.activeRelic, "fatebreaker_seal");
assert.equal(gilded.damageBonus(other), 0);
const region = state(101);
boss(region);
assert.equal(loot.hasRegionBossChest(region), false);
assert(loot.odds(region).chance > 0);
groups.push(
  "Gilded victory gives no blessing, preserves curses/Rifts and one-active-LR rule; special boss gets no region chest",
);
for (const [multiple, bonus] of [
  [0, 0],
  [1.9999, 0],
  [2, 0.1],
  [5, 0.2],
  [10, 0.3],
  [20, 0.4],
  [40, 0.5],
  [100, 0.5],
])
  assert.equal(gilded.wealthBonus(multiple * 100, 100), bonus);
for (const key of ["barbarian", "sorceress"]) {
  const s = activate(state(11, key));
  s.bonus = 500000;
  s.encounter = world.makeEnemy(s, "normal", "Test", () => 0.5);
  s.encounter.defense = 0;
  s.encounter.resistance = 0;
  const attributes = stats.derive(s);
  core.playerAttack(s, "defend", () => 0.5);
  const snapshot = structuredClone(s.encounter.gildedSoulSnapshot);
  assert.equal(snapshot.coins, core.payout(s));
  assert.equal(snapshot.bonus, 0.5);
  assert.deepEqual(stats.derive(s), attributes);
  const boosted = core.attackDamage(s, s.encounter, s, () => 0.5, {
    player: true,
    magic: key === "sorceress",
    raw: 100,
    critical: false,
  }).damage;
  s.activeRelic = null;
  const base = core.attackDamage(s, s.encounter, s, () => 0.5, {
    player: true,
    magic: key === "sorceress",
    raw: 100,
    critical: false,
  }).damage;
  assert.equal(boosted, Math.floor(base * 1.5));
  s.activeRelic = gilded.RELIC_ID;
  s.bonus = 0;
  core.playerAttack(s, "defend", () => 0.5);
  assert.deepEqual(s.encounter.gildedSoulSnapshot, snapshot);
  const saved = JSON.parse(JSON.stringify(s));
  core.normalize(saved);
  assert.deepEqual(saved.encounter.gildedSoulSnapshot, snapshot);
}
groups.push(
  "wealth tiers cap at 50%, physical/magic use one multiplier, attributes unchanged and combat snapshot persists",
);
assert.equal(records.totals("g", "u").gilded_soul, 3);
assert.equal(records.record(session, fatal, gilded.RELIC_ID, 11), false);
assert.equal(
  achievements
    .getAchievements("g", "u")
    .find((a) => a.id === "hc_gilded_soul_1").complete,
  true,
);
const prestige = achievements
  .getAchievements("g", "u")
  .find((a) => a.id === "hc_gilded_soul_1");
assert.equal(prestige.reward, 0);
assert.equal(prestige.diamonds, 0);
const prof = profile.profilePayload(
  "g",
  "u",
  { id: "u", username: "Test" },
  "events",
  0,
  "Test",
);
bounds(prof);
assert(text(prof).includes("Gilded Soul"));
assert(text(prof).includes("Tầng 11"));
assert(
  achievements
    .getAchievements("migration", "old")
    .find((a) => a.id === "hc_conquerors_covenant_1").complete,
);
assert(
  achievements
    .detectAchievementUnlocks("g", "u")
    .some((a) => a.id === "hc_gilded_soul_1"),
);
assert(
  !achievements
    .detectAchievementUnlocks("g", "u")
    .some((a) => a.id === "hc_gilded_soul_1"),
);
assert(
  achievements
    .claimAchievements("g", "u")
    .some((a) => a.id === "hc_gilded_soul_1"),
);
assert(
  !achievements
    .claimAchievements("g", "u")
    .some((a) => a.id === "hc_gilded_soul_1"),
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) n FROM hardcore_god_rngesus_encounters WHERE guild_id='g'",
    )
    .get().n,
  0,
);
groups.push(
  "persistent LR counts/history, separate zero-currency achievements and one-time notifications/claims",
);
for (const s of [robbed, ritual(state()), critical, noBlessing])
  for (const tab of ["stats", "items", "effects", "encounter"]) {
    const p = privateTab(s, tab);
    bounds(p);
    if (tab === "effects" && s.grudge?.stage !== "completed")
      assert(text(p).includes("Dấu ấn oán hận"));
  }
assert(text(privateTab(critical, "encounter")).includes("10% DMG thực tế"));
assert(!text(privateTab(critical, "items")).includes("Dấu ấn oán hận"));
assert(
  !JSON.stringify(view.embed(critical).toJSON()).includes(
    "Nghi lễ Oán Hận (1/7)",
  ),
);
groups.push(
  "mark in Rift, relic in bag, current passive in stats, full mechanics in Details and bounded Discord UI",
);
// Persisted gameplay must roll back both the reward record and state on failure.
const run = service.startHardcore({
  guildId: "tx",
  userId: "tx",
  channelId: "c",
  stake: 10,
  classKey: "barbarian",
  forcedEncounter: { type: "empty" },
});
const stored = repo.parseState(repo.getSession(run.session.id));
const tx = state(11);
boss(tx).hp = 1;
Object.assign(tx, {
  turn: stored.turn,
  stake: 10,
  fair: stored.fair,
  fairCounter: stored.fairCounter,
});
tx.sources.event.str = 10000;
stats.recompute(tx);
repo.saveState(run.session, tx);
const play = () => {
  const cur = repo.parseState(repo.getSession(run.session.id));
  return service.playHardcore({
    sessionId: run.session.id,
    userId: "tx",
    expectedTurn: cur.turn,
    action: "attack",
  });
};
const original = core.act;
core.act = (...args) => {
  original(...args);
  throw Error("TEST_ROLLBACK");
};
assert.throws(play, /TEST_ROLLBACK/);
core.act = original;
assert.equal(records.totals("tx", "tx").gilded_soul, 0);
assert.equal(repo.parseState(repo.getSession(run.session.id)).encounter.hp, 1);
let won;
for (let i = 0; i < 20; i++) {
  won = play();
  if (gilded.owns(won.state)) break;
}
assert(gilded.owns(won.state));
assert.equal(records.totals("tx", "tx").gilded_soul, 1);
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "tx",
      expectedTurn: tx.turn,
      action: "attack",
    }),
  /STALE_ACTION/,
);
service.playHardcore({
  sessionId: run.session.id,
  userId: "tx",
  expectedTurn: won.state.turn,
  action: "retreat",
});
assert.equal(records.totals("tx", "tx").gilded_soul, 1);
groups.push(
  "real transaction rollback, stale-click rejection, immediate record and persistence after withdrawal",
);
console.log("Hardcore Gilded Soul: " + groups.length + " groups passed");
for (const g of groups) console.log("  ✓ " + g);
db.close();
