"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const memory = new Database(":memory:");
// Seed the pre-migration archive so the real startup migration must backfill old deaths.
memory.exec(
  "CREATE TABLE hardcore_run_archive (session_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,gameplay_version INTEGER NOT NULL,release_version TEXT NOT NULL,class_key TEXT NOT NULL,cleared INTEGER NOT NULL,reason TEXT NOT NULL,stake INTEGER NOT NULL,payout INTEGER NOT NULL,diamonds INTEGER NOT NULL,turns INTEGER NOT NULL,created_at INTEGER NOT NULL,ended_at INTEGER NOT NULL)",
);
const legacy = memory.prepare(
  "INSERT INTO hardcore_run_archive VALUES(?, 'old-g', 'old-u',2,'2.0.1','barbarian',5,?,10,0,0,1,1,2)",
);
legacy.run("old-rng-1", "rngesus");
legacy.run("old-rng-2", "rngesus");
legacy.run("old-monster", "death");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return memory;
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const god = require("../src/services/hardcoreGodRngesus");
const reveal = require("../src/services/hardcoreGodReveal");
const rates = require("../src/services/hardcoreRngesus");
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const service = require("../src/services/hardcoreService");
const repo = require("../src/services/hardcoreRepository");
const view = require("../src/services/hardcoreV2View");
const achievements = require("../src/services/achievementService");
const profile = require("../src/services/hardcoreProfile");
const { getAccount } = require("../src/services/economyService");
const groups = [];
let serial = 0;
function session(user = "u", guild = "g") {
  return {
    id: "god-test-" + ++serial,
    user_id: user,
    guild_id: guild,
    channel_id: "c",
  };
}
function state(floor = 1) {
  const s = stats.createState("barbarian", 1000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    godRngesusEnabled: true,
    phase: "encounter",
    encounter: { type: "empty", name: "Trống" },
    lastReceivedItems: [],
  });
  return s;
}
function guarantee(guild, user) {
  db.prepare(
    "INSERT INTO hardcore_rngesus_favor VALUES(?,?,999999,999999,0,1) ON CONFLICT(guild_id,user_id) DO UPDATE SET deaths_since_blessing=999999",
  ).run(guild, user);
}
function safePayload(payload) {
  for (const embed of payload.embeds || []) {
    const data = embed.toJSON ? embed.toJSON() : embed;
    assert.ok(JSON.stringify(data).length);
    assert.ok(!JSON.stringify(data).includes("undefined"));
    assert.ok((data.description?.length || 0) <= 4096);
    assert.ok((data.fields || []).every((f) => f.value.length <= 1024));
    assert.ok((data.fields || []).length <= 25);
  }
}
async function main() {
  assert.equal(rates.godRngesusChance(), 0.000001);
  assert.equal(rates.godRngesusChance(4), 0.000005);
  assert.equal(rates.formatGodChance(rates.godRngesusChance()), "0,0001%");
  assert.equal(rates.formatGodChance(rates.godRngesusChance(4)), "0,0005%");
  assert.equal(rates.godRngesusChance(99999999), 1);
  assert.equal(god.favor("old-g", "old-u").deaths_since_blessing, 2);
  assert.equal(
    god.recordDeath(
      { id: "old-rng-1", guild_id: "old-g", user_id: "old-u" },
      "rngesus",
    ),
    false,
  );
  const d = session();
  for (const reason of ["death", "cashout", "forfeit", "summit"])
    assert.equal(god.recordDeath(d, reason), false);
  assert.equal(god.recordDeath(d, "rngesus"), true);
  assert.equal(god.recordDeath(d, "rngesus"), false);
  assert.equal(god.favor("g", "u").deaths_since_blessing, 1);
  assert.equal(god.favor("other-g", "u").deaths_since_blessing, 0);
  assert.equal(god.favor("g", "other-u").deaths_since_blessing, 0);
  groups.push(
    "exact 0.0001% base/step, archived deaths backfill, deduplication and player isolation",
  );

  const miss = state(),
    missedSession = session("boundary");
  assert.equal(
    god.tryEncounter(miss, missedSession, () => rates.godRngesusChance()),
    null,
  );
  assert.equal(
    god.tryEncounter(miss, missedSession, () => {
      throw Error("rerolled floor");
    }),
    null,
  );
  const hit = state(),
    hitSession = session("boundary-hit");
  const e = god.tryEncounter(hit, hitSession, () => 0.000000999);
  assert.equal(e.type, "god_rngesus");
  assert.equal(
    god.tryEncounter(hit, hitSession, () => {
      throw Error("rerolled blessing");
    }),
    null,
  );
  assert.equal(god.favor(hitSession.guild_id, hitSession.user_id).blessings, 1);
  const dead = state();
  dead.hp = 0;
  assert.equal(
    god.tryEncounter(dead, session(), () => {
      throw Error("dead player rolled");
    }),
    null,
  );
  groups.push("roll boundary, floor 1 and one persisted roll per floor");

  const blessed = state(317),
    blessedSession = session("blessed");
  for (const definition of core.ITEMS.cursed)
    core.receiveItem(blessed, definition, 3, 1);
  blessed.modifiers = {
    bloodlust: 9,
    soul_drain: 5,
    fortified: 4,
    cursed_ground: 3,
  };
  blessed.activeParadox = { id: "blood_pact", startFloor: 316, endFloor: 320 };
  blessed.contract = { kind: "skill", from: 316, until: 318, remaining: 2 };
  stats.recompute(blessed);
  blessed.hp = 3;
  blessed.mana = 0;
  const originals = structuredClone(blessed.items),
    originalSources = structuredClone(blessed.sources);
  const paradox = structuredClone(blessed.activeParadox),
    contract = structuredClone(blessed.contract);
  for (let i = 0; i < 4; i++) god.recordDeath(session("blessed"), "rngesus");
  blessed.encounter = core.generateEncounter(blessed, blessedSession, () => 0);
  assert.equal(blessed.encounter.encounterChance, 0.000005);
  assert.equal(blessed.hp, blessed.maxHp);
  assert.equal(blessed.mana, blessed.maxMana);
  assert.deepEqual(blessed.modifiers, {});
  assert.deepEqual(blessed.activeParadox, paradox);
  assert.deepEqual(blessed.contract, contract);
  assert.deepEqual(blessed.sources, originalSources);
  blessed.items.forEach((item, i) => {
    assert.equal(item.rarity, "cursed");
    assert.equal(item.level, originals[i].level);
    assert.equal(item.cleansedLevels, item.level);
    assert.deepEqual(item.definition, originals[i].definition);
  });
  assert.equal(blessed.relics.length, 1);
  assert.equal(blessed.activeRelic, "fatebreaker_seal");
  assert.equal(god.favor("g", "blessed").deaths_since_blessing, 0);
  assert.equal(god.favor("g", "blessed").rngesus_deaths, 4);
  assert.equal(god.history("g", "blessed")[0].chance, 0.000005);
  assert.equal(blessed.evCount, 1);
  assert.ok(blessed.evKinds.includes("god_rngesus"));
  const saved = JSON.parse(JSON.stringify(blessed));
  core.normalize(saved);
  assert.equal(saved.activeRelic, "fatebreaker_seal");
  for (const floor of [5, 6, 50, 100, 500, 999]) {
    saved.floor = floor;
    assert.equal(rates.rngesusEncounterChance(saved), 0);
    assert.equal(
      core.rollRngesus(saved, () => {
        throw Error("Fatebreaker failed");
      }),
      false,
    );
  }
  const nextRun = state(100);
  nextRun.godRngesusEnabled = false;
  assert.ok(rates.rngesusEncounterChance(nextRun) > 0);
  assert.equal(rates.hasFatebreaker({ ...saved, relics: [] }), false);
  groups.push(
    "full blessing, all UR levels preserved, all Rift stacks cleared, Paradox/Contract retained and run-only Fatebreaker",
  );

  assert.ok(view.encounterText(blessed).includes("0,0005%"));
  safePayload({ embeds: [view.embed(blessed, "blessed")] });
  for (const tab of ["items", "stats", "effects", "encounter"])
    safePayload(view.privatePayload(blessed, "s", "m", tab, 0));
  assert.ok(
    JSON.stringify(view.privatePayload(blessed, "s", "m", "items", 0)).includes(
      "Fatebreaker Seal",
    ),
  );
  assert.ok(
    JSON.stringify(view.privatePayload(blessed, "s", "m", "stats", 0)).includes(
      "Nội tại LR",
    ),
  );
  for (const field of view.ratesFields("rngesus"))
    assert.ok(field.value.length <= 1024);
  const achievement = achievements
    .getAchievements("g", "blessed")
    .find((a) => a.id === "hc_god_rngesus_1");
  assert.equal(achievement.complete, true);
  const beforeAccount = getAccount("g", "blessed").balance;
  assert.ok(
    achievements
      .claimAchievements("g", "blessed")
      .some((a) => a.id === achievement.id),
  );
  assert.equal(getAccount("g", "blessed").balance, beforeAccount);
  const profilePayload = profile.profilePayload(
    "g",
    "blessed",
    { id: "blessed", username: "Blessed" },
    "events",
    0,
    new (require("discord.js").EmbedBuilder)().setDescription("overview"),
  );
  safePayload(profilePayload);
  assert.ok(JSON.stringify(profilePayload).includes("0,0005%"));
  assert.ok(JSON.stringify(profilePayload).includes("0,0001%"));
  groups.push(
    "locked encounter percentage, bag/stats/details placement, achievement and profile persist immediately",
  );

  for (const floor of [50, 999]) {
    const s = state(floor),
      ss = session("boss-" + floor);
    s.encounter = core.generateEncounter(s, ss, () => 0);
    assert.equal(s.encounter.type, "god_rngesus");
    assert.throws(() => core.act(s, ss, "next", () => 0.5), /INVALID_ACTION/);
    core.act(s, ss, "god_continue", () => 0.5);
    assert.equal(s.floor, floor);
    assert.equal(s.cleared, floor - 1);
    assert.equal(s.encounter.type, "combat");
    assert.equal(s.encounter.rank, floor === 999 ? "final_boss" : "boss");
    assert.equal(god.favor("g", "boss-" + floor).blessings, 1);
  }
  groups.push(
    "God does not skip scheduled bosses, final boss or award a cleared floor",
  );

  const realDeath = service.startHardcore({
    guildId: "real",
    userId: "death",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "rngesus", name: "RNGesus" },
  });
  const ended = service.playHardcore({
    sessionId: realDeath.session.id,
    userId: "death",
    expectedTurn: 0,
    action: "fight",
  });
  assert.equal(ended.result.reason, "rngesus");
  assert.equal(god.favor("real", "death").deaths_since_blessing, 1);
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: realDeath.session.id,
        userId: "death",
        expectedTurn: 0,
        action: "fight",
      }),
    /INVALID_SESSION/,
  );
  assert.equal(god.favor("real", "death").deaths_since_blessing, 1);

  for (const protection of ["ticket", "adventurer"]) {
    const run = service.startHardcore({
      guildId: "real",
      userId: protection,
      channelId: "c",
      stake: 10,
      classKey: "barbarian",
      forcedEncounter: { type: "rngesus", name: "RNGesus" },
    });
    const s = repo.parseState(repo.getSession(run.session.id));
    if (protection === "ticket") s.reviveTickets = 1;
    else s.adventurerRescue = { region: 0, fromFloor: 1 };
    repo.saveState(run.session, s);
    const result = service.playHardcore({
      sessionId: run.session.id,
      userId: protection,
      expectedTurn: 0,
      action: "fight",
    });
    assert.equal(result.settled, false);
    assert.equal(god.favor("real", protection).deaths_since_blessing, 0);
  }
  groups.push(
    "actual settled RNGesus deaths count once; revival ticket and Lost Adventurer saves do not count",
  );

  guarantee("real", "first-floor");
  const first = service.startHardcore({
    guildId: "real",
    userId: "first-floor",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
  });
  assert.equal(first.state.encounter.type, "god_rngesus");
  assert.equal(first.state.floor, 1);
  const persisted = service.getHardcoreRun("real", "first-floor");
  assert.equal(persisted.state.activeRelic, "fatebreaker_seal");
  assert.equal(persisted.state.encounter.encounterChance, 1);
  const played = service.playHardcore({
    sessionId: first.session.id,
    userId: "first-floor",
    expectedTurn: 0,
    action: "god_continue",
  });
  assert.equal(played.state.floor, 1);
  assert.equal(played.state.cleared, 0);
  assert.notEqual(played.state.encounter.type, "rngesus");
  assert.throws(
    () =>
      service.playHardcore({
        sessionId: first.session.id,
        userId: "first-floor",
        expectedTurn: 0,
        action: "god_continue",
      }),
    /STALE_ACTION/,
  );
  assert.equal(god.favor("real", "first-floor").blessings, 1);
  assert.equal(god.favor("real", "first-floor").deaths_since_blessing, 0);

  const rescued = state(6),
    rescuedSession = session("rescued");
  rescued.encounter = { type: "rngesus", name: "RNGesus" };
  rescued.reviveTickets = 1;
  guarantee("g", "rescued");
  assert.equal(
    core.act(rescued, rescuedSession, "fight", () => 0),
    "rngesus",
  );
  assert.equal(
    core.reviveAfterDeath(rescued, rescuedSession, () => 0, "rngesus"),
    true,
  );
  assert.equal(rescued.encounter.type, "god_rngesus");
  assert.equal(rescued.hp, rescued.maxHp);
  groups.push(
    "real start/resume/stale transaction lifecycle and God full heal survives resurrection transition",
  );

  const frames = [],
    waits = [];
  assert.equal(
    await reveal.play(
      blessedSession.id,
      blessed,
      "blessed",
      async (p) => frames.push(p),
      { wait: async (ms) => waits.push(ms) },
    ),
    true,
  );
  assert.equal(frames.length, 2);
  frames.forEach((p) => {
    safePayload(p);
    assert.equal(p.components.length, 0);
  });
  assert.deepEqual(waits, [650, 850]);
  assert.equal(
    await reveal.play(
      blessedSession.id,
      blessed,
      "blessed",
      () => {
        throw Error("replayed");
      },
      { wait: async () => {} },
    ),
    false,
  );
  const failure = state(),
    failureSession = session("animation-failure");
  failure.encounter = core.generateEncounter(failure, failureSession, () => 0);
  assert.equal(
    await reveal.play(
      failureSession.id,
      failure,
      "u",
      async () => {
        throw Error("Discord down");
      },
      { wait: async () => {} },
    ),
    true,
  );
  assert.equal(failure.activeRelic, "fatebreaker_seal");
  assert.equal(god.favor("g", "animation-failure").blessings, 1);
  groups.push(
    "two short reveal frames, disabled buttons, one reveal and Discord failure cannot undo blessing",
  );
  console.log(JSON.stringify({ ok: true, groups }));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
