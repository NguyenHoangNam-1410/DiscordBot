"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine");
const stats = require("../src/hardcore/engine/stats");
const world = require("../src/hardcore/engine/world");
const view = require("../src/hardcore/ui");
const bosses = require("../src/hardcore/bosses/mechanics");
const echoes = require("../src/hardcore/storage/echoes");
const service = require("../src/hardcore");
const repo = require("../src/hardcore/storage/sessions");
const session = {
  id: "recovery",
  guild_id: "recovery",
  user_id: "u",
  channel_id: "c",
};
const rng = () => 0.99;
function fresh(key = "sorceress") {
  const s = stats.createState(key, 10000);
  Object.assign(s, { floor: 6, cleared: 5, godRngesusEnabled: false });
  stats.addSource(s, { maxMana: 7 - s.maxMana });
  assert.equal(s.maxMana, 7);
  s.hp = 1;
  s.mana = 0;
  return s;
}
function bounded(s) {
  assert(s.hp >= 0 && s.hp <= s.maxHp);
  assert(s.mana >= 0 && s.mana <= bosses.effectiveMaxMana(s));
}
for (const missing of [false, true]) {
  const s = fresh();
  if (!missing) s.hp = s.maxHp;
  const h = core.healEvent(s, s.maxHp * 0.3);
  assert.equal(h.mp, 3);
  assert.equal(s.mana, 3);
  bounded(s);
  assert(h.log.includes("MP: 0 → **3**"));
  s.mana = 6;
  core.healEvent(s, s.maxHp);
  assert.equal(s.mana, 7);
  assert.equal(core.healEvent(s, s.maxHp).mp, 0);
}
for (let maxHp = 1; maxHp <= 1000; maxHp++) {
  const s = fresh();
  Object.assign(s, { maxHp, hp: maxHp, maxMana: 5 });
  assert.equal(core.healEvent(s, maxHp * 0.2).mp, 1);
}
{
  const s = fresh();
  s.healingReduction = 0.6;
  const hp = s.hp;
  core.healEvent(s, s.maxHp * 0.3);
  assert.equal(s.hp - hp, Math.floor(s.maxHp * 0.3 * 0.4));
  assert.equal(s.mana, 3); // The curse reduces HP recovery, not MP.
}
const originalOwns = echoes.owns,
  originalRelease = echoes.release;
echoes.owns = () => true;
echoes.release = () => {};
const cases = [
  [{ type: "shrine", name: "Shrine", kind: "healing" }, "touch", 1],
  [
    { type: "surprise", name: "Wandering Healer", kind: "healer" },
    "event_heal",
    0.3,
  ],
  [
    { type: "surprise", name: "Fountain", kind: "fountain", roll: 0.1 },
    "event_drink",
    1,
  ],
  [
    { type: "surprise", name: "Fountain", kind: "fountain", roll: 0.7 },
    "event_drink",
    (s) => 15 / s.maxHp,
  ],
  [
    {
      type: "surprise",
      name: "Merchant",
      kind: "merchant",
      offers: [{ key: "heal", price: 1 }],
    },
    "buy_0",
    1,
  ],
  [
    { type: "surprise", name: "Doors", kind: "doors", doors: { light: true } },
    "door_light",
    1,
  ],
  [
    {
      type: "trap",
      name: "Portal",
      kind: "portal",
      good: true,
      effect: "healing",
    },
    "next",
    1,
  ],
  [{ type: "echo", name: "Echo", echo: { id: "test" } }, "echo_pray", 0.15],
  [
    {
      type: "memory",
      name: "Memory",
      debt: { version: 2, family: "blood", kind: "blood" },
    },
    "next",
    0.2,
  ],
  [
    {
      type: "memory",
      name: "Memory",
      debt: {
        good: true,
        action: "event_rescue",
        healRate: 0.17,
        bonusRate: 0.1,
      },
    },
    "next",
    0.17,
  ],
  [
    {
      type: "memory",
      name: "Memory",
      debt: { version: 2, family: "divine", kind: "divine" },
    },
    "memory_offering",
    0.2,
  ],
];
for (const [encounter, action, rate] of cases) {
  const s = fresh();
  s.encounter = structuredClone(encounter);
  assert(
    core.actions(s).some((a) => a.action === action && !a.disabled),
    encounter.name + ": " + action + " vs " + JSON.stringify(core.actions(s)),
  );
  core.act(s, session, action, rng);
  assert.equal(
    s.mana,
    Math.ceil(s.maxMana * (typeof rate === "function" ? rate(s) : rate)),
    encounter.name,
  );
  bounded(s);
  assert(s.lastLog.includes("MP:"), s.lastLog);
  if (s.lastEventResult) assert(s.lastEventResult.directKeys.includes("mana"));
  const copy = structuredClone(s);
  core.normalize(copy);
  assert.equal(copy.mana, s.mana);
}
echoes.owns = originalOwns;
echoes.release = originalRelease;
{
  const s = fresh();
  s.encounter = world.makeEnemy(s, "elite", "Herald of Fate", rng);
  s.encounter.memoryReward = { family: "divine" };
  s.encounter.hp = 1;
  s.mana = 2;
  core.act(s, session, "skill", () => 0.5);
  assert.equal(s.mana, 2);
  assert(s.lastLog.includes("Không còn nguyền"));
  assert(s.lastLog.includes("MP: 0 → **2**"));
}
// Checkpoint, item receipt, potion, skill and periodic healing do not use event MP recovery.
{
  const s = fresh();
  s.floor = 5;
  s.cleared = 4;
  s.encounter = { type: "empty" };
  core.act(s, session, "next", rng);
  assert.equal(s.phase, "upgrade");
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.mana, 0);
}
{
  const s = fresh();
  core.heal(s, s.maxHp);
  assert.equal(s.mana, 0);
  core.receiveItem(
    s,
    core.ITEMS.common.find((i) => i.id === "field_bandage"),
  );
  assert.equal(s.mana, 0);
  s.encounter = world.makeEnemy(s, "normal", "Test", rng);
  s.hp = 1;
  core.playerAttack(s, "potion", rng);
  assert.equal(s.mana, 0);
}
for (const mode of ["tower", "tower_v4"]) {
  const s = fresh();
  s.mode = mode;
  core.healEvent(s, s.maxHp);
  assert.equal(s.mana, 0);
}
{
  const s = fresh();
  s.bossRosterVersion = 1;
  s.floor = 950;
  s.encounter = core.generateEncounter(s, session, rng);
  s.encounter.boss.dread = 3;
  core.healEvent(s, s.maxHp);
  assert.equal(s.mana, 4);
  bounded(s);
}
// Class Shrine is an event buff; its Druid recovery applies the same ratio each floor.
{
  const s = fresh("druid");
  s.classShrine = { classKey: "druid", from: 6, until: 8 };
  s.encounter = { type: "empty" };
  core.act(s, session, "next", rng);
  assert.equal(s.mana, 1);
  assert(s.lastLog.includes("Class Shrine · Druid: MP 0 → **1**"));
}
for (const [encounter, action] of [
  [{ type: "shrine", kind: "healing" }, "skip"],
  [
    { type: "surprise", name: "Wandering Healer", kind: "healer" },
    "event_skip",
  ],
  [{ type: "surprise", kind: "doors", doors: { gold: true } }, "door_gold"],
]) {
  const s = fresh();
  s.encounter = encounter;
  core.act(s, session, action, rng);
  assert.equal(s.mana, 0); // Merely encountering/skipping a heal grants no MP.
}
{
  const s = fresh("druid");
  s.floor = 5;
  s.classShrine = { classKey: "druid", from: 4, until: 7 };
  s.encounter = { type: "empty" };
  core.act(s, session, "next", rng);
  assert.equal(s.phase, "upgrade");
  assert.equal(s.mana, 1); // Only Shrine, not full MP from checkpoint.
}
// A real saved event recovers once; replaying the old interaction does not heal again.
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("recovery", "u", 1000000);
const run = service.startHardcore({
  guildId: "recovery",
  userId: "u",
  channelId: "c",
  stake: 10000,
  classKey: "sorceress",
  forcedEncounter: { type: "empty" },
});
const saved = fresh();
saved.encounter = {
  type: "surprise",
  kind: "healer",
  name: "Wandering Healer",
};
saved.fair = run.state.fair;
saved.fairCounter = run.state.fairCounter;
repo.saveState(run.session, saved);
const result = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: "event_heal",
  expectedTurn: saved.turn,
});
assert.equal(result.state.mana, 3);
const locked = repo.getByUser("recovery", "u").state_json;
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: "event_heal",
      expectedTurn: saved.turn,
    }),
  /STALE_ACTION/,
);
assert.equal(repo.getByUser("recovery", "u").state_json, locked);
const summary = JSON.stringify(view.embed(result.state, "u").toJSON());
assert(summary.includes("MP"));
assert(!summary.includes("undefined"));
console.log(
  "Event recovery: ratios/rounding/caps, 11 event branches, divine kill reward, checkpoint exclusions, Tower isolation, resume and stale persistence passed.",
);
db.close();
