"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world");
const bosses = require("../src/hardcore/bosses/mechanics"),
  display = require("../src/hardcore/bosses/display"),
  view = require("../src/hardcore/ui");
const service = require("../src/hardcore"),
  repo = require("../src/hardcore/storage/sessions");
const session = { id: "boss", guild_id: "boss", user_id: "u", channel_id: "c" };
const rng = () => 0.5;
const groups = [];
function state(floor = 50, key = "sorceress") {
  const s = stats.createState(key, 10000);
  s.bossRosterVersion = 1;
  s.floor = floor;
  s.cleared = floor - 1;
  stats.addSource(
    s,
    { vit: 500, ene: 300, str: 200, dex: 200, luck: 0 },
    "test",
  );
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  s.godRngesusEnabled = false;
  s.encounter = core.generateEncounter(s, session, rng);
  if (s.encounter.type === "boss_gate")
    core.act(s, session, "enter_kabraxis", rng);
  return s;
}
function e(s) {
  return s.encounter;
}
function b(s) {
  return e(s).boss;
}
function action(s, a, random = rng) {
  return core.act(s, session, a, random);
}
function hard(s) {
  e(s).hp = e(s).maxHp = 100000;
  e(s).damageMin = e(s).damageMax = 10;
  e(s).evasion = 0;
  e(s).defense = 0;
  e(s).resistance = 0;
  b(s).baseDefense = 0;
  b(s).baseRes = 0;
  b(s).baseEvasion = 0;
  return s;
}
function bounds(p) {
  let size = 0;
  for (const item of p.embeds) {
    const x = item.toJSON ? item.toJSON() : item;
    size +=
      (x.title || "").length +
      (x.description || "").length +
      (x.footer?.text || "").length;
    assert((x.fields || []).length <= 25);
    for (const f of x.fields || []) {
      assert(f.value.length <= 1024);
      size += f.name.length + f.value.length;
    }
    assert(!JSON.stringify(x).includes("undefined"));
  }
  assert(size <= 6000);
}
function readOnly(s) {
  const before = JSON.stringify(s);
  bounds({ embeds: [view.embed(s, "u")] });
  for (const tab of ["stats", "items", "effects", "encounter"])
    bounds(view.privatePayload(s, "boss", "m", tab));
  core.attackDamagePreview(s);
  core.skillDamagePreview(s);
  core.incomingPreview(s);
  assert.equal(JSON.stringify(s), before);
}
assert.equal(bosses.ROSTER.length, 21);
assert.equal(new Set(bosses.ROSTER.map((r) => r.id)).size, 21);
for (const def of bosses.ROSTER) {
  const s = state(def.floor);
  assert.equal(e(s).name, def.name);
  if (def.id === "gharbad") assert.equal(typeof b(s).surrender, "boolean");
  if (def.id === "necrobot") {
    assert.equal(e(s).defense, Math.round(b(s).baseDefense * 1.4));
    assert.equal(e(s).resistance, Math.max(-50, b(s).baseRes - 15));
  }
  if (def.id === "anomaly")
    assert.equal(e(s).defense, Math.round(b(s).baseDefense * 1.4));
  readOnly(s);
  const copy = JSON.parse(JSON.stringify(s));
  core.normalize(copy);
  assert.deepEqual(copy.encounter, s.encounter);
}
for (const mode of ["tower", "tower_v4"]) {
  const s = stats.createState("sorceress", 10000);
  Object.assign(s, { floor: 100, mode, bossRosterVersion: 1 });
  assert.equal(
    world.makeEnemy(s, "boss", null, rng).name,
    "Ascendant Riftwalker",
  );
  assert(!world.makeEnemy(s, "boss", null, rng).boss);
}
const legacy = stats.createState("sorceress", 10000);
legacy.floor = 100;
legacy.encounter = world.makeEnemy(legacy, "boss", null, rng);
const locked = structuredClone(legacy.encounter);
core.normalize(legacy);
assert.deepEqual(legacy.encounter, locked);
assert.equal(
  world.makeEnemy(legacy, "boss", null, rng).name,
  "Infernal Machine",
);
groups.push(
  "21 unique bosses, exact floors, Tower isolation, old combat retained, readonly UI and JSON resume",
);
let s = hard(state(50));
action(s, "attack", () => 0.1);
assert.equal(b(s).frenzy, 1);
action(s, "defend", () => 0.1);
assert.equal(b(s).frenzy, 0);
action(s, "attack", () => 0.999);
assert.equal(b(s).frenzy, 0);
s = hard(state(100));
for (let i = 0; i < 2; i++) action(s, "attack", () => 0.1);
assert.equal(b(s).overheat, 2);
assert(display.status(s).includes("Tia vật lý"));
const hp = s.hp;
action(s, "attack", () => 0.1);
assert.equal(s.hp, hp);
assert.equal(b(s).overheat, 0);
s = hard(state(150));
action(s, "attack");
action(s, "attack");
assert.equal(b(s).normals, 2);
const assurHp = s.hp;
action(s, "defend");
assert.equal(s.hp, assurHp);
assert.equal(b(s).returnBonus, 0.3);
assert.equal(b(s).normals, 0);
s = hard(state(200));
e(s).hp = 1;
action(s, "skill");
assert.equal(e(s).hp, 1);
s.mana = 10;
action(s, "skill");
assert(b(s).feedback);
assert.equal(e(s).hp, 1);
action(s, "defend");
assert(b(s).feedbackResolved);
assert.equal(b(s).damageMemory, 0);
s.mana = 10;
action(s, "skill");
assert.notEqual(s.floor, 200);
groups.push(
  "Butcher landed Frenzy/defend, Machine interrupt, Assur telegraph and Control no softlock/grounding shield",
);
s = hard(state(250));
assert.equal(b(s).round, 0);
action(s, "defend");
assert.equal(b(s).round, 1);
assert(display.status(s).includes("Energy Barrier"));
s = hard(state(300));
for (let i = 0; i < 5; i++) action(s, "attack", () => 0.1);
assert.equal(b(s).mythal, 20);
const res = core.effectiveResistance(s);
action(s, "defend", () => 0.1);
assert.equal(b(s).mythal, 15);
assert.equal(core.effectiveResistance(s), res + 5);
s = hard(state(350));
for (let i = 0; i < 3; i++) action(s, "defend", () => 0.1);
assert(b(s).malic);
s.mana = 0;
assert.equal(core.skillManaCost(s), 0);
const lhp = e(s).hp;
action(s, "skill", () => 0.9);
assert.equal(e(s).hp, lhp - 20000 + 10000); // Soul Feast heals on the ordinary counter.
assert.equal(b(s).vulnerable, 2);
assert.equal(s.mana, 0);
readOnly(s);
s = hard(state(400, "barbarian"));
action(s, "attack", () => 0.1);
action(s, "attack", () => 0.1);
assert.equal(b(s).chain, 2);
assert(bosses.counter(s).critical);
action(s, "defend");
assert.equal(b(s).chain, 0);
s = hard(state(450));
action(s, "defend");
action(s, "defend");
assert.equal(b(s).nests, 1);
const ghp = e(s).hp;
action(s, "attack");
assert.equal(e(s).hp, ghp);
assert.equal(b(s).nests, 0);
groups.push(
  "Adaptive phases, Mythal combat-only RES, free Malic true damage, repeated-action Crit and Nest targeting",
);
s = hard(state(500));
action(s, "defend");
action(s, "defend");
assert(bosses.vanished(s));
const rhp = s.hp;
s.mana = 0;
action(s, "defend");
assert.equal(s.hp, rhp);
assert.equal(s.mana, 2);
assert.equal(b(s).returnBonus, 0.25);
s = hard(state(550));
b(s).surrender = true;
s.mana = 0;
action(s, "defend");
assert.equal(s.mana, 2);
assert.equal(b(s).returnBonus, 0.3);
const save = JSON.parse(JSON.stringify(s));
core.normalize(save);
assert.equal(b(save).surrender, b(s).surrender);
s = hard(state(600));
s.mana = 0;
action(s, "defend", () => 0.1);
assert.equal(b(s).nightmare, 1);
s.mana = 10;
action(s, "skill", () => 0.1);
assert.equal(b(s).nightmare, 1); // Skill cleared old stacks, its counter drains one new MP.
s = hard(state(650));
for (const p of [2, 3, 1]) {
  action(s, "defend");
  assert.equal(b(s).phase, p);
}
groups.push(
  "Rift shift safe action/MP, saved False Surrender, Nightmare skill cleanse and fixed Anomaly cycle",
);
for (const kind of ["war", "protection", "arcane"]) {
  s = state(333);
  assert.equal(e(s).type, "prophecy");
  const before = structuredClone(s.sources);
  action(s, "prophecy_" + kind);
  assert.equal(s.prophecy.kind, kind);
  assert.equal(s.floor, 334);
  assert.notDeepEqual(s.sources, before);
  assert.throws(() => action(s, "prophecy_" + kind), /INVALID_ACTION/);
  const copy = JSON.parse(JSON.stringify(s));
  core.normalize(copy);
  assert.equal(copy.prophecy.kind, kind);
  s.floor = 666;
  s.cleared = 665;
  s.pendingMilestones = [];
  s.encounter = core.generateEncounter(s, session, () => 0.8);
  assert.equal(e(s).type, "boss_gate");
  const reward = structuredClone(e(s).enemy.boss.rewardItem);
  assert.equal(reward.rarity, "cursed");
  readOnlyGate(s);
  const beforeRewards = s.bonus;
  action(s, "enter_kabraxis");
  assert.equal(b(s).seal, kind);
  assert.throws(() => action(s, "retreat"), /CANNOT_RETREAT/);
  assert(
    !view
      .rows("boss", s)
      .flatMap((r) => r.toJSON().components)
      .some((c) => c.custom_id.endsWith(":retreat")),
  );
  e(s).hp = 1;
  s.mana = 10;
  action(s, "skill", () => 0.1);
  assert.equal(s.prophecy.awakened, true);
  assert.equal(
    s.bonus - beforeRewards,
    Math.floor(s.stake * 0.666) + Math.floor(s.stake * 0.03),
  );
  assert(s.items.some((i) => i.definition.id === reward.id));
  assert(!s.pendingBossChest);
  assert.notEqual(s.floor, 666);
}
for (const [roll, rarity] of [
  [0.665999, "legendary"],
  [0.666, "cursed"],
]) {
  const run = stats.createState("barbarian", 10000);
  Object.assign(run, { bossRosterVersion: 1, floor: 666 });
  const gate = core.generateEncounter(run, session, () => roll);
  assert.equal(gate.enemy.boss.rewardItem.rarity, rarity);
  assert.notEqual(gate.enemy.boss.rewardItem.category, "consumable");
}
function readOnlyGate(s) {
  const old = JSON.stringify(s);
  bounds({ embeds: [view.embed(s, "u")] });
  bounds(view.privatePayload(s, "boss", "m", "encounter"));
  assert.equal(JSON.stringify(s), old);
}
groups.push(
  "333 seals one-time source buffs, locked equipment rewards and 666 gate/cashout prohibition/awakening once",
);
s = hard(state(700, "amazon"));
b(s).grace = true;
const copy = structuredClone(s);
const low = core.skillDamagePreview(s).low;
assert.equal(JSON.stringify(s), JSON.stringify(copy));
const hit = core.playerAttack(s, "skill", () => 0);
assert(hit.damage >= low);
assert.equal(b(s).grace, false);
assert(b(s).graceBroken);
s = hard(state(750));
action(s, "defend");
action(s, "defend");
assert(display.status(s).includes("Judgment of Power"));
s = hard(state(800));
s.mana = 2;
action(s, "skill");
s.mana = 2;
action(s, "skill");
assert.equal(s.mana, 0);
assert(b(s).repeat);
s.hp -= 20;
action(s, "potion");
assert.equal(b(s).lastAction, "skill");
s = hard(state(850));
e(s).hp = 50000;
s.mana = 4;
action(s, "defend");
assert.equal(e(s).hp, 58000);
assert.equal(e(s).drainCharges, 0);
s = hard(state(900));
b(s).portals = 5;
assert(core.incomingPreview(s).trueDamage);
s.mana = 10;
action(s, "skill");
assert.equal(b(s).portals, 4);
assert(!core.incomingPreview(s).trueDamage);
s = hard(state(950));
b(s).round = 3;
bosses.refresh(s, rng);
s.mana = 10;
action(s, "defend");
assert.equal(b(s).dread, 1);
assert.equal(bosses.effectiveMaxMana(s), 9);
action(s, "skill");
assert.equal(b(s).dread, 0);
groups.push(
  "Barrage shield per-hit, Justicar action type, Memory potion handling, immortal Totem, Portal warning and Dread",
);
s = state(999, "sorceress");
const enemy = e(s),
  bars = [...b(s).bars],
  initial = s.bonus;
assert.deepEqual(bars, [7205, 7205, 9607]);
for (const p of [2, 3]) {
  enemy.hp = 1;
  s.mana = 10;
  const hp = s.hp;
  action(s, "skill", () => 0.1);
  assert.equal(b(s).phase, p);
  assert.equal(enemy.hp, bars[p - 1]);
  assert.equal(s.hp, hp);
  assert.equal(s.bonus, initial);
  assert.equal(s.cleared, 998);
  assert.equal(s.finalBossDefeated, false);
  readOnly(s);
  const saved = JSON.parse(JSON.stringify(s));
  core.normalize(saved);
  assert.deepEqual(saved.encounter, enemy);
}
enemy.hp = 1;
s.mana = 10;
action(s, "skill", () => 0.1);
assert(s.finalBossDefeated);
assert.equal(s.phase, "summit");
assert.equal(s.cleared, 999);
assert.equal(s.bossKills, 1);
groups.push(
  "Deimoss three exact HP bars, overflow discarded, transition has no counter/reward and only final phase settles",
);
// Resource boundaries and saved telegraphs for every class and boss.
for (const key of Object.keys(stats.CLASSES))
  for (const def of bosses.ROSTER)
    for (const hp of [1, "full"])
      for (const mp of [0, "full"])
        for (const potions of [0, 5]) {
          const run = state(def.floor, key);
          if (hp === 1) run.hp = 1;
          run.mana = mp === 0 ? 0 : run.maxMana;
          run.potions = potions;
          readOnly(run);
          action(run, "defend");
          assert(run.hp >= 0 && run.hp <= run.maxHp);
          assert(run.mana >= 0 && run.mana <= bosses.effectiveMaxMana(run));
          assert(run.potions >= 0);
          if (run.encounter.type === "combat")
            assert(run.encounter.hp <= run.encounter.maxHp);
        }
groups.push(
  "1 HP/0 MP/full/no potion boundaries for 7 classes × 21 bosses, valid UI and nonnegative resources",
);
// A repeat Shield cycle must prevent a killing second hit before its Feedback.
s = hard(state(200));
for (const a of ["skill", "attack", "defend"]) {
  s.mana = 10;
  action(s, a);
}
assert(b(s).feedbackResolved);
s.mana = 10;
action(s, "skill");
e(s).hp = 1;
s.mana = 10;
action(s, "skill");
assert.equal(e(s).hp, 1);
assert(b(s).feedback && !b(s).feedbackResolved);
// Phase-2 healing and Dread remain tied to defending, including Divine Shield.
s = hard(state(999, "paladin"));
b(s).phase = 2;
b(s).bars = [100000, 100000, 100000];
b(s).flesh = 0;
bosses.refresh(s, rng);
e(s).hp = 50000;
s.mana = 10;
const prior = e(s).hp;
action(s, "skill");
assert(e(s).hp < prior);
assert(!s.lastLog.includes("Flesh Feast: hồi"));
s = hard(state(950, "paladin"));
b(s).round = 3;
bosses.refresh(s, rng);
s.mana = 10;
action(s, "skill");
assert.equal(b(s).dread, 1);
groups.push(
  "repeated Plasma Shield protects at 1 HP and class auto-defense handles Flesh Feast/Pentagram consistently",
);

// Time Debt's second counter must not trigger a new, unannounced mechanic.
s = hard(state(150));
b(s).normals = 1;
core.playerAttack(s, "attack", rng);
const firstPlan = bosses.counter(s);
core.enemyTurn(s, rng);
assert.deepEqual(bosses.counter(s), firstPlan);
assert.equal(firstPlan.multiplier, 1);
core.enemyTurn(s, rng);
assert.equal(b(s).normals, 2); // Two regular counters arm the next visible warning.
s = hard(state(666));
e(s).hp = Math.floor(e(s).maxHp / 3) + 1;
core.playerAttack(s, "skill", rng);
assert.equal(b(s).phase, 3);
assert.equal(bosses.counter(s).multiplier, 1.2);
s = hard(state(200));
b(s).feedback = true;
b(s).damageMemory = 400;
core.playerAttack(s, "attack", rng);
const feedbackPlan = bosses.counter(s);
core.enemyTurn(s, rng);
assert.equal(bosses.counter(s).raw, feedbackPlan.raw);
assert.equal(feedbackPlan.raw, 100);
// Reflection respects the target, but not the last Attack/Skill action buff.
const passives = require("../src/hardcore/itemPassives");
const aggregate = passives.aggregate;
const { passiveCounter } = require("../src/hardcore/engine/combatPassives")({
  ...require("../src/hardcore/engine/dependencies")(),
  alive: (s) => s.hp > 0,
});
passives.aggregate = () => ({ thorns: 1, guardReflect: 0, dodgeCounter: 0 });
s = hard(state(650));
b(s).round = 2;
b(s).usedReturnBonus = 0.3;
bosses.refresh(s, rng);
e(s).hp = 1;
passiveCounter(s, rng, 100, false, false);
assert.equal(e(s).hp, 0); // Void amplification cannot overshoot the remaining HP.
s = hard(state(550));
b(s).usedReturnBonus = 0.3;
e(s).damageMin = e(s).damageMax = 100;
passiveCounter(s, rng, 10, false, false);
assert.equal(e(s).hp, 99990);
assert.equal(b(s).hitCount || 0, 0);
passives.aggregate = aggregate;
groups.push(
  "double counters retain telegraphed plans; reflection has no action buff, overkill or Overheat hit",
);

// Test the actual persistent service version guard and rollback, not only engine helpers.
db.prepare(
  "INSERT OR IGNORE INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES(?,?,?,0,0)",
).run("boss-tx", "u", 1000000);
const run = service.startHardcore({
  guildId: "boss-tx",
  userId: "u",
  channelId: "c",
  stake: 10000,
  classKey: "sorceress",
  forcedEncounter: { type: "empty" },
});
const saved = state(999);
saved.fair = run.state.fair;
saved.fairCounter = run.state.fairCounter;
saved.encounter.hp = 1;
saved.mana = 10;
repo.saveState(run.session, saved);
const result = service.playHardcore({
  sessionId: run.session.id,
  userId: "u",
  action: "skill",
  expectedTurn: saved.turn,
});
assert.equal(result.state.encounter.boss.phase, 2);
const checkpoint = repo.getByUser("boss-tx", "u").state_json;
assert.throws(
  () =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "u",
      action: "skill",
      expectedTurn: saved.turn,
    }),
  /STALE_ACTION/,
);
assert.equal(repo.getByUser("boss-tx", "u").state_json, checkpoint);
groups.push(
  "real service phase persistence, stale interaction rejects and saved boss state unchanged",
);
console.log(
  "Boss roster: " +
    groups.length +
    " groups passed\n" +
    groups.map((g) => "  ✓ " + g).join("\n"),
);
db.close();
