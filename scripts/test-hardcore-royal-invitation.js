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
const royal = require("../src/hardcore/events/royalInvitation");
const records = require("../src/hardcore/storage/relicRecords");
const reveal = require("../src/hardcore/events/godReveal");
const royalReveal = require("../src/hardcore/events/royalReveal");
const view = require("../src/hardcore/ui");
const profile = require("../src/hardcore/ui/profile");
const service = require("../src/hardcore");
const repo = require("../src/hardcore/storage/sessions");
const achievements = require("../src/services/achievementService");
const KING = "kingslayers_testament",
  ASTRAL = "astral_singularity";
let nextId = 0;
const session = () => ({
  id: "royal-" + ++nextId,
  guild_id: "royal",
  user_id: "u",
  channel_id: "c",
});
const definitions = Object.values(core.ITEMS).flat();
const groups = [];
function state(floor = 11, classKey = "barbarian") {
  const s = stats.createState(classKey, 10000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    lastLog: "",
    phase: "encounter",
    encounter: { type: "empty" },
    godEnabled: false,
  });
  return s;
}
function gear(s, id, level = 1, clean = true) {
  const d = definitions.find((i) => i.id === id);
  assert(d);
  core.receiveItem(s, d, level, clean && d.curse ? level : 0);
  return s.items.find((i) => i.definition.id === id);
}
function set(s, id, level = 1, clean = true) {
  for (const key of royal.SETS[id].ids) gear(s, key, level, clean);
  return s;
}
function invite(s) {
  s.encounter = core.makeSurprise(s, () => 0.5, "royal_invitation");
  return s;
}
function accept(s, id, run = session()) {
  invite(s);
  assert.equal(
    core.act(s, run, "royal_" + id, () => 0.5),
    null,
  );
  assert.equal(s.encounter.type, "royal_blessing");
  return run;
}
function enemy(s, rank = "normal", name = "Test") {
  s.phase = "encounter";
  s.encounter = world.makeEnemy(s, rank, name, () => 0.5);
  Object.assign(s.encounter, {
    hp: 100000,
    maxHp: 100000,
    defense: 0,
    resistance: 0,
    evasion: 0,
    critChance: 0,
    damageMin: 10,
    damageMax: 10,
    nextDamageType: "magic",
    damageType: "magic",
  });
  return s.encounter;
}
function bounds(p) {
  let size = 0;
  for (const x of p.embeds || []) {
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
  assert(size <= 6000, "embed size " + size);
}
const text = (p) =>
  JSON.stringify(p.embeds.map((e) => (e.toJSON ? e.toJSON() : e)));
async function main() {
  assert.equal(Object.keys(royal.SETS).length, 2);
  assert.equal(
    new Set(Object.values(royal.SETS).flatMap((s) => s.ids)).size,
    10,
  );
  for (const id of [KING, ASTRAL]) {
    const s = set(state(), id, 3, false);
    assert.deepEqual(royal.eligible(s), []);
    const ur = s.items.filter((i) => i.definition.curse);
    ur[0].cleansedLevels = 3;
    ur[1].cleansedLevels = 2;
    stats.recompute(s);
    assert.deepEqual(royal.eligible(s), []);
    ur[1].cleansedLevels = 3;
    stats.recompute(s);
    assert.deepEqual(royal.eligible(s), [id]);
    s.items.pop();
    assert.deepEqual(royal.eligible(s), []);
    assert.throws(() => invite(s), /INVALID_ROYAL_INVITATION/);
    const tower = set(state(), id);
    tower.mode = "tower";
    assert.deepEqual(royal.eligible(tower), []);
    tower.mode = "survival";
    tower.towerChallengeId = "t";
    assert.deepEqual(royal.eligible(tower), []);
  }
  groups.push(
    "exactly two disjoint five-item sets, complete UR cleansing at every level, missing members and Tower exclusion",
  );
  // Capture the real eligible weighted pool, including an unrelated cursed item.
  const weighted = set(state(), KING);
  gear(weighted, "glass_cannon", 1, false);
  let captured;
  const deps = require("../src/hardcore/engine/dependencies")({});
  const factory = require("../src/hardcore/engine/encounters")({
    ...deps,
    payout: core.payout,
    pick: (pool) => {
      captured = pool;
      return pool.includes("royal_invitation") ? "royal_invitation" : "healer";
    },
  });
  factory.makeSurprise(weighted, () => 0.5);
  assert.equal(captured.filter((x) => x === "royal_invitation").length, 10);
  assert.equal(captured.filter((x) => x === "purifier").length, 3);
  for (const k of new Set(captured))
    if (!["royal_invitation", "purifier"].includes(k))
      assert.equal(captured.filter((x) => x === k).length, 1);
  weighted.royalInvitation = { status: "declined" };
  factory.makeSurprise(weighted, () => 0.5);
  assert(!captured.includes("royal_invitation"));
  assert.equal(captured.filter((x) => x === "purifier").length, 3);
  const locked = invite(set(set(state(), KING), ASTRAL));
  const snapshot = JSON.stringify(locked.encounter);
  core.normalize(locked);
  for (const tab of ["stats", "items", "effects", "encounter"]) {
    bounds(view.privatePayload(locked, "s", "m", tab));
  }
  assert.equal(JSON.stringify(locked.encounter), snapshot);
  assert.equal(
    core.actions(locked).filter((o) => o.action.startsWith("royal_")).length,
    2,
  );
  groups.push(
    "Royal weight 10, Purifier 3, ordinary events 1; two offers locked across readonly and resume",
  );
  const declined = invite(set(set(state(), KING, 3), ASTRAL, 2));
  const beforeDecline = structuredClone(declined.items);
  core.act(declined, session(), "event_skip", () => 0.5);
  assert.deepEqual(declined.items, beforeDecline);
  assert.equal(declined.cleared, 11);
  assert.equal(declined.royalInvitation.status, "declined");
  const resumed = JSON.parse(JSON.stringify(declined));
  core.normalize(resumed);
  assert.deepEqual(royal.eligible(resumed), []);
  assert.throws(() => invite(resumed), /INVALID_ROYAL_INVITATION/);
  assert.throws(
    () => core.act(state(), session(), "royal_" + KING, () => 0.5),
    /INVALID_ACTION/,
  );
  const changed = invite(set(state(), KING));
  changed.items[0].level++;
  const unchanged = JSON.stringify(changed.items);
  assert.throws(
    () => core.act(changed, session(), "royal_" + KING, () => 0.5),
    /INVALID_ROYAL_INVITATION/,
  );
  assert.equal(JSON.stringify(changed.items), unchanged);
  groups.push(
    "decline keeps every item and permanently disables both routes in the run; forged or changed-level exchanges rejected",
  );
  const both = set(set(state(21), KING, 4), ASTRAL, 2);
  gear(both, "glass_cannon", 2, false);
  const retained = both.items.filter(
    (i) => !royal.SETS[KING].ids.includes(i.definition.id),
  );
  both.hp = 3;
  both.mana = 0;
  both.modifiers = { bloodlust: 8, soul_drain: 3 };
  both.activeParadox = {
    version: 2,
    id: "blood_pact",
    startFloor: 21,
    endFloor: 25,
  };
  both.contract = { kind: "skill", from: 21, until: 23, remaining: 3 };
  const blessingRun = accept(both, KING);
  assert.equal(both.items.length, 6);
  assert(
    both.items.every((i) => !royal.SETS[KING].ids.includes(i.definition.id)),
  );
  assert.equal(
    both.royalInvitation.surrendered.reduce((n, i) => n + i.level, 0),
    20,
  );
  assert.deepEqual(
    both.items.map((i) => i.definition.id),
    retained.map((i) => i.definition.id),
  );
  assert.equal(both.hp, both.maxHp);
  assert.equal(both.mana, both.maxMana);
  assert.deepEqual(both.modifiers, {});
  assert.equal(
    both.items.find((i) => i.definition.id === "glass_cannon").cleansedLevels,
    2,
  );
  assert.equal(both.activeParadox.id, "blood_pact");
  assert(both.contract);
  assert.equal(both.activeRelic, KING);
  assert.equal(both.cleared, 21);
  assert.equal(both.floor, 22);
  assert.deepEqual(royal.eligible(both), []);
  const expected = state();
  expected.items = structuredClone(both.items);
  assert.deepEqual(stats.derive(both), stats.derive(expected));
  assert.equal(records.totals("royal", "u")[KING], 1);
  groups.push(
    "entire chosen set and all 20 levels removed, other set retained, no phantom buffs, full blessing and immediate record",
  );
  const checkpoint = set(state(10), ASTRAL);
  accept(checkpoint, ASTRAL);
  assert.equal(checkpoint.floor, 11);
  assert.equal(checkpoint.cleared, 10);
  assert.deepEqual(checkpoint.modifiers, {});
  assert(checkpoint.pendingMilestones.includes("upgrade"));
  core.act(checkpoint, session(), "royal_continue", () => 0.5);
  assert.equal(checkpoint.phase, "upgrade");
  assert.equal(checkpoint.cleared, 10);
  const inactive = set(state(), ASTRAL);
  inactive.relics = [{ id: "fatebreaker_seal", acquiredFloor: 1 }];
  inactive.activeRelic = "fatebreaker_seal";
  inactive.hp = 1;
  accept(inactive, ASTRAL);
  assert.equal(inactive.activeRelic, "fatebreaker_seal");
  assert(inactive.relics.some((r) => r.id === ASTRAL));
  assert.equal(inactive.hp, inactive.maxHp);
  assert.equal(royal.freeMagic(inactive), false);
  groups.push(
    "checkpoint/Rift queue retained and cleared once; blessing applies with another active LR without switching",
  );
  const physical = set(state(), KING);
  accept(physical, KING);
  const e = enemy(physical);
  physical.critChance = 1;
  const hit = core.attackDamage(physical, e, physical, () => 0, {
    player: true,
    raw: 100,
    critical: true,
  });
  assert.equal(hit.damage, 250);
  assert.equal(royal.critMultiplier(physical), 2.5);
  const magic = core.attackDamage(physical, e, physical, () => 0, {
    player: true,
    magic: true,
    raw: 100,
    critical: true,
  });
  assert.equal(magic.damage, 100);
  assert.equal(magic.crit, false);
  const incoming = core.attackDamage(
    { ...e, accuracy: 9999, critChance: 1 },
    { ...physical, defense: 0 },
    physical,
    () => 0,
    { raw: 100, critical: true },
  );
  assert.equal(incoming.damage, 175);
  for (let n = 0; n < 12; n++) {
    physical.floor = 50;
    const boss = world.makeEnemy(physical, "boss", null, () => 0.5);
    boss.hp = 0;
    assert(royal.recordBoss(physical, boss));
    assert.equal(royal.recordBoss(physical, boss), false);
  }
  assert.equal(royal.critMultiplier(physical), 3.5);
  assert.equal(physical.royalInvitation.bossKills, 10);
  for (const [rank, name, flags, floor] of [
    ["boss", "Premature Rift Boss", {}, 50],
    ["boss", null, { gildedTrial: {} }, 50],
    ["boss", null, { echoId: "x" }, 50],
    ["boss", null, {}, 49],
    ["elite", "Mimic", {}, 50],
  ]) {
    physical.floor = floor;
    const boss = world.makeEnemy(physical, rank, name, () => 0.5);
    Object.assign(boss, flags, { hp: 0 });
    assert.equal(royal.recordBoss(physical, boss), false);
  }
  groups.push(
    "Kingslayer physical Crit starts 2.5 and caps 3.5, scheduled bosses only, once per kill; enemy Crit and magic unchanged",
  );
  const live = set(state(50), KING);
  accept(live, KING);
  live.floor = 50;
  live.cleared = 49;
  const realBoss = world.makeEnemy(live, "boss", null, () => 0.5);
  realBoss.hp = 1;
  live.phase = "encounter";
  live.encounter = realBoss;
  core.act(live, session(), "attack", () => 0);
  assert.equal(live.royalInvitation.bossKills, 1);
  assert.equal(royal.critMultiplier(live), 2.6);
  const mage = set(state(11, "necromancer"), ASTRAL);
  accept(mage, ASTRAL);
  enemy(mage);
  mage.mana = 0;
  assert.equal(core.skillManaCost(mage), 0);
  for (const blocked of [true, false, true]) {
    const acted = core.playerAttack(mage, "skill", () => 0.5);
    assert.equal(acted.dodge, blocked);
    assert.equal(mage.mana, 0);
  }
  core.playerAttack(mage, "defend", () => 0.5);
  assert.equal(core.playerAttack(mage, "skill", () => 0.5).dodge, true);
  mage.activeParadox = {
    version: 2,
    id: "blood_pact",
    startFloor: 11,
    endFloor: 15,
  };
  const hpBefore = mage.hp;
  assert(core.skillHpCost(mage) > 0);
  core.playerAttack(mage, "skill", () => 0.5);
  assert(mage.hp < hpBefore);
  assert.equal(core.skillManaCost(mage), 0);
  gear(mage, "blood_pact", 1, false);
  assert(core.skillHpCost(mage) > 0);
  mage.hp = 1;
  assert.throws(
    () => core.playerAttack(mage, "skill", () => 0.5),
    /INSUFFICIENT_SKILL_HP/,
  );
  const sorc = set(state(11, "sorceress"), ASTRAL);
  accept(sorc, ASTRAL);
  enemy(sorc);
  sorc.mana = 0;
  sorc.classShrine = { classKey: "sorceress", from: 11, until: 13 };
  core.playerAttack(sorc, "skill", () => 0.5);
  assert(!sorc.classShrine.consumed);
  assert.equal(sorc.mana, 0);
  const wrongClass = set(state(), ASTRAL);
  accept(wrongClass, ASTRAL);
  enemy(wrongClass);
  assert.equal(core.skillManaCost(wrongClass), 2);
  const otherCurse = gear(sorc, "hollow_crown", 2, false);
  assert(otherCurse.level > otherCurse.cleansedLevels);
  assert(sorc.skillManaExtra > 0);
  assert.equal(core.skillManaCost(sorc), 0);
  sorc.activeParadox = {
    version: 2,
    id: "unstable_soul",
    milestone: 10,
    startFloor: 11,
    endFloor: 15,
    lockedSkillCost: null,
  };
  core.act(sorc, session(), "skill", () => 0.5);
  assert.equal(sorc.activeParadox.lockedSkillCost, 0);
  assert.equal(core.skillManaCost(sorc), 0);
  groups.push(
    "actual scheduled kill grows Crit; Astral magic Skill costs 0, guard alternates, physical Skills and HP costs preserved",
  );
  const guard = set(state(11, "necromancer"), ASTRAL);
  accept(guard, ASTRAL);
  enemy(guard);
  guard.mana = 0;
  const firstHP = guard.hp;
  core.act(guard, session(), "skill", () => 0.5);
  assert.equal(guard.hp, firstHP);
  core.act(guard, session(), "skill", () => 0.5);
  assert(guard.hp < firstHP);
  const afterCounter = guard.hp;
  core.act(guard, session(), "skill", () => 0.5);
  assert.equal(guard.hp, afterCounter);
  const guardSaved = JSON.parse(JSON.stringify(guard));
  core.normalize(guardSaved);
  assert.equal(guardSaved.encounter.astralGuardLastAction, true);
  groups.push(
    "real combat guard cooldown, normal counter on second Skill and saved cooldown cannot be reset by viewing/resume",
  );
  for (const s of [locked, both, mage, guard, physical])
    for (const tab of ["stats", "items", "effects", "encounter"]) {
      const p = view.privatePayload(s, "s", "m", tab);
      bounds(p);
    }
  const warning = invite(set(state(), KING, 5));
  warning.activeRelic = "gilded_soul";
  assert(
    text(view.privatePayload(warning, "s", "m", "encounter")).includes(
      "toàn bộ 5 món",
    ),
  );
  assert(royal.details(warning).includes("chưa kích hoạt"));
  bounds({ embeds: [view.embed(warning, "u")] });
  assert(
    !JSON.stringify(view.embed(warning, "u").toJSON()).includes("Oathbreaker"),
  );
  for (const id of [KING, ASTRAL]) {
    const a = achievements
      .getAchievements("royal", "u")
      .find((a) => a.id === "hc_" + id + "_1");
    assert(a.complete);
    assert.equal(a.reward, 0);
    assert.equal(a.diamonds, 0);
    assert(core.RELIC_ITEMS[id].runtimeEnabled);
    assert(core.RELIC_ITEMS[id].acquisition.setIds.length === 5);
  }
  assert(
    achievements
      .claimAchievements("royal", "u")
      .some((a) => a.id === "hc_" + KING + "_1"),
  );
  assert(
    !achievements
      .claimAchievements("royal", "u")
      .some((a) => a.id === "hc_" + KING + "_1"),
  );
  const prof = profile.profilePayload(
    "royal",
    "u",
    { id: "u", username: "Test" },
    "events",
    0,
    "Test",
  );
  bounds(prof);
  assert(text(prof).includes("Kingslayer"));
  assert(text(prof).includes("Astral Singularity"));
  groups.push(
    "explicit all-level consumption/inactive-LR warning, concise battle UI, bounded Details and dedicated achievements/history",
  );
  // Actual persistent exchange, rollback and one-time animation.
  const run = service.startHardcore({
    guildId: "tx-royal",
    userId: "tx-u",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const stored = repo.parseState(repo.getSession(run.session.id));
  const tx = invite(set(state(10), KING, 3));
  Object.assign(tx, {
    turn: stored.turn,
    stake: 10,
    fair: stored.fair,
    fairCounter: stored.fairCounter,
  });
  repo.saveState(run.session, tx);
  const play = (turn, action) =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "tx-u",
      expectedTurn: turn,
      action,
    });
  const original = core.act;
  core.act = (...args) => {
    original(...args);
    throw Error("TEST_ROLLBACK");
  };
  const savedBefore = repo.getSession(run.session.id).state_json;
  assert.throws(() => play(tx.turn, "royal_" + KING), /TEST_ROLLBACK/);
  core.act = original;
  assert.equal(repo.getSession(run.session.id).state_json, savedBefore);
  assert.equal(records.totals("tx-royal", "tx-u")[KING], 0);
  const won = play(tx.turn, "royal_" + KING);
  assert.equal(won.state.items.length, 0);
  assert.equal(records.totals("tx-royal", "tx-u")[KING], 1);
  assert.throws(() => play(tx.turn, "royal_" + KING), /STALE_ACTION/);
  assert.equal(
    royalReveal.claimReveal(run.session.id, {
      ...won.state,
      turn: won.state.turn - 1,
    }),
    false,
  );
  const frames = [],
    waits = [];
  assert(
    await reveal.play(
      run.session.id,
      won.state,
      "tx-u",
      async (p) => {
        bounds(p);
        frames.push(p);
      },
      { wait: async (n) => waits.push(n) },
    ),
  );
  assert.equal(frames.length, 2);
  assert.deepEqual(waits, [650, 850]);
  assert(frames.every((p) => p.components.length === 0));
  const reopened = service.getHardcoreRun("tx-royal", "tx-u").state;
  assert.equal(reveal.frame(reopened, "tx-u"), null);
  assert.equal(
    await reveal.play(run.session.id, reopened, "tx-u", () => {
      throw Error("duplicate");
    }),
    false,
  );
  play(reopened.turn, "royal_continue");
  const cp = repo.parseState(repo.getSession(run.session.id));
  assert.equal(cp.phase, "upgrade");
  assert.equal(cp.cleared, 10);
  // Failure of the Discord animation must retain every reward and its record.
  const failure = set(state(21), ASTRAL);
  accept(failure, ASTRAL);
  failure.turn = 123;
  const failSession = {
    ...session(),
    guild_id: "fail",
    user_id: "fail",
    created_at: 1,
    updated_at: 1,
  };
  repo.insertSession(failSession, failure);
  assert(
    await reveal.play(
      failSession.id,
      failure,
      "fail",
      async () => {
        throw Error("Discord offline");
      },
      { wait: async () => {} },
    ),
  );
  const failed = repo.parseState(repo.getSession(failSession.id));
  assert(failed.encounter.revealedAt);
  assert.equal(failed.items.length, 0);
  assert.equal(failed.hp, failed.maxHp);
  groups.push(
    "transaction rollback restores set and record, stale clicks cannot duplicate LR, animation once and Discord failure preserves blessing",
  );
  const die = repo.parseState(repo.getSession(run.session.id));
  die.phase = "encounter";
  die.floor = 27;
  die.cleared = 26;
  die.hp = 1;
  die.reviveTickets = 0;
  delete die.adventurerRescue;
  enemy(die);
  die.encounter.damageMin = die.encounter.damageMax = 10000;
  repo.saveState(run.session, die);
  const lost = play(die.turn, "defend");
  assert(lost.settled);
  assert.equal(records.totals("tx-royal", "tx-u")[KING], 1);
  assert.equal(records.history("tx-royal", "tx-u", KING)[0].floor, 10);
  const skipRun = service.startHardcore({
    guildId: "skip",
    userId: "skip",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const skipStored = repo.parseState(repo.getSession(skipRun.session.id));
  const skipState = invite(set(state(11), ASTRAL));
  Object.assign(skipState, {
    turn: skipStored.turn,
    stake: 10,
    fair: skipStored.fair,
    fairCounter: skipStored.fairCounter,
  });
  repo.saveState(skipRun.session, skipState);
  service.playHardcore({
    sessionId: skipRun.session.id,
    userId: "skip",
    expectedTurn: skipState.turn,
    action: "event_skip",
  });
  const reloaded = service.getHardcoreRun("skip", "skip").state;
  assert.equal(reloaded.royalInvitation.status, "declined");
  assert.deepEqual(royal.eligible(reloaded), []);
  assert.equal(reloaded.items.length, 5);
  groups.push(
    "LR history survives later death and actual declined invitation stays disabled after persisted resume",
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM hardcore_god_rngesus_encounters WHERE guild_id='royal'",
      )
      .get().n,
    0,
  );
  console.log("Hardcore Royal Invitation: " + groups.length + " groups passed");
  for (const g of groups) console.log("  ✓ " + g);
  db.close();
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
