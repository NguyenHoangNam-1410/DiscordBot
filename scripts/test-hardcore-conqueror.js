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
const covenant = require("../src/hardcore/events/covenant");
const god = require("../src/hardcore/events/godRngesus");
const reveal = require("../src/hardcore/events/godReveal");
const covenantReveal = require("../src/hardcore/events/covenantReveal");
const view = require("../src/hardcore/ui");
const service = require("../src/hardcore");
const repo = require("../src/hardcore/storage/sessions");
const {
  baseMultiplier,
  runDiamondReward,
} = require("../src/hardcore/shared/rewards");
const groups = [];
const session = {
  id: "covenant",
  user_id: "u",
  guild_id: "g",
  channel_id: "c",
};
function state(floor = 11) {
  const s = stats.createState("barbarian", 10000);
  Object.assign(s, {
    floor,
    cleared: floor - 1,
    lastLog: "",
    encounter: { type: "empty" },
  });
  return s;
}
function enemy(s, rank = "normal", name = "Test") {
  s.phase = "encounter";
  const e = world.makeEnemy(s, rank, name, () => 0.5);
  Object.assign(e, {
    hp: 1,
    maxHp: 1,
    defense: 0,
    resistance: 0,
    evasion: 0,
    combatTurn: 1,
    critChance: 0,
    damageMin: 1,
    damageMax: 1,
    damageType: "physical",
    nextDamageType: "physical",
  });
  return e;
}
function portal(s, good = false) {
  s.phase = "encounter";
  s.encounter = {
    type: "trap",
    kind: "portal",
    name: "Wrong Portal",
    good,
    goodChance: 0.5,
    effect: "treasure",
    badEffect: "mana",
    enemy: enemy(s, "elite", "Rift Ambusher"),
  };
  return s;
}
function collect(s) {
  s.covenant = {
    fragments: Object.fromEntries(
      Object.keys(covenant.FRAGMENTS).map((key, i) => [key, i + 1]),
    ),
    kills: 0,
    completed: false,
  };
  return s;
}
function kill(s, action = "attack", rng = () => 0.5) {
  const e = s.encounter;
  assert.equal(core.act(s, session, action, rng), null);
  assert(e.hp <= 0);
  return e;
}
function bounds(payload) {
  let size = 0;
  for (const embed of payload.embeds || []) {
    const e = embed.toJSON ? embed.toJSON() : embed;
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
  assert(size <= 6000, "Discord embed size " + size);
}
function activate(s, kills = 0) {
  s.relics = [
    { id: covenant.RELIC_ID, acquiredFloor: 3, source: "mimic_fragments" },
  ];
  s.activeRelic = covenant.RELIC_ID;
  s.covenant = { fragments: {}, completed: true, kills };
  return s;
}
async function main() {
  // Full first kills with independent equipment rewards; repeats do not add fragments.
  const s = state();
  for (const [key, rank, name] of [
    ["mimic", "mimic", "Mimic"],
    ["ancient_mimic", "ancient_mimic", "Ancient Mimic"],
    ["blood_mimic", "mimic", "Blood Mimic"],
  ]) {
    s.encounter = enemy(s, rank, name);
    const dropsBefore = s.items.reduce((sum, i) => sum + i.level, 0);
    const acquiredFloor = s.floor;
    kill(s);
    assert.equal(s.covenant.fragments[key], acquiredFloor);
    if (key !== "mimic")
      assert.equal(
        s.items.reduce((sum, i) => sum + i.level, 0),
        dropsBefore + 1,
      );
    s.encounter = enemy(s, rank, name);
    kill(s);
    assert.equal(s.covenant.fragments[key], acquiredFloor);
  }
  // A random clone does not qualify. Only the locked mirror-break memory does.
  s.encounter = enemy(s, "elite", "Mirror Clone");
  kill(s);
  assert.equal(covenant.fragmentCount(s), 3);
  const clone = enemy(s, "elite", "Mirror Clone");
  s.encounter = {
    type: "surprise",
    kind: "mirror",
    name: "Mirror of Fate",
    roll: 0.9,
    defenseStat: "str",
    enemy: clone,
  };
  core.act(s, session, "event_mirror_break", () => 0.5);
  assert.equal(s.debts[0].family, "mirror");
  s.floor = s.debts[0].due;
  s.cleared = s.floor - 1;
  s.encounter = core.generateEncounter(s, session, () => 0.5);
  assert.equal(s.encounter.type, "memory");
  core.act(s, session, "next", () => 0.5);
  assert.equal(s.encounter.memoryFamily, "mirror");
  kill(s);
  assert.equal(covenant.fragmentCount(s), 4);
  assert.match(s.lastLog, /4\/4/);
  groups.push(
    "four guaranteed first-kill fragments, old Mimic equipment rewards and real delayed Mirror Clone provenance",
  );

  const living = state();
  const e = enemy(living, "mimic", "Mimic");
  assert.equal(covenant.recordKill(living, e), false);
  e.hp = 0;
  living.hp = 0;
  assert.equal(covenant.recordKill(living, e), false);
  living.hp = living.maxHp;
  assert.equal(covenant.recordKill(living, e), true);
  assert.equal(
    covenant.recordKill(living, JSON.parse(JSON.stringify(e))),
    false,
  );
  assert.equal(covenant.fragmentCount(living), 1);
  for (const mode of ["tower", "tower_v3"]) {
    const t = collect(state());
    t.mode = mode;
    assert.equal(covenant.canEnter(t), false);
    assert.equal(
      covenant.recordKill(t, { ...e, covenantKillRecorded: false }),
      false,
    );
  }
  groups.push(
    "no fragments from live enemies, failed runs, duplicate kills or Tower mode",
  );

  // Guaranteed third option on every eligible portal, without rolling/view mutation.
  const available = portal(JSON.parse(JSON.stringify(s)));
  const snapshot = JSON.stringify(available);
  assert.deepEqual(
    core.actions(available).map((a) => a.action),
    ["next", "skip", "covenant_basement"],
  );
  bounds(view.privatePayload(available, "id", "message", "items"));
  bounds(view.privatePayload(available, "id", "message", "encounter"));
  assert.equal(JSON.stringify(available), snapshot);
  const insufficient = portal(state());
  assert.deepEqual(
    core.actions(insufficient).map((a) => a.action),
    ["next", "skip"],
  );
  assert.throws(
    () => core.act(insufficient, session, "covenant_basement", () => 0.5),
    /INVALID_ACTION/,
  );
  const next = portal(collect(state()), true);
  const skip = portal(collect(state()));
  core.act(next, session, "next", () => 0.5);
  assert.equal(next.bonus, Math.floor(next.stake * 0.5));
  assert.equal(covenant.fragmentCount(next), 4);
  const skipMp = skip.mana;
  core.act(skip, session, "skip", () => 0.5);
  assert.equal(skip.mana, skipMp);
  assert.equal(covenant.fragmentCount(skip), 4);
  portal(skip);
  assert.equal(core.actions(skip).at(-1).action, "covenant_basement");
  groups.push(
    "guaranteed next-portal third choice, saved progress, invalid-choice guard and unchanged enter/skip outcomes",
  );

  const trial = portal(collect(state(49)));
  trial.godRngesusEnabled = true;
  core.act(trial, session, "covenant_basement", () => 0.5);
  const locked = JSON.stringify(trial.encounter);
  assert.equal(trial.encounter.type, "combat");
  assert.equal(trial.encounter.rank, "elite");
  assert.equal(trial.cleared, 48);
  assert.throws(
    () => covenant.grant(trial, trial.encounter),
    /INVALID_COVENANT_TRIAL/,
  );
  assert.match(covenant.bagText(trial), /Đang đánh Covenant Guardian/);
  assert.equal(covenant.fragmentCount(trial), 4);
  assert.equal(
    JSON.stringify(core.normalize(JSON.parse(JSON.stringify(trial))).encounter),
    locked,
  );
  bounds(view.privatePayload(trial, "id", "message", "encounter"));
  trial.hp = 0;
  trial.reviveTickets = 1;
  assert.equal(
    core.reviveAfterDeath(trial, session, () => 0.5, "death"),
    true,
  );
  assert.equal(trial.floor, 49);
  assert.equal(trial.reviveTickets, 0);
  assert.equal(covenant.fragmentCount(trial), 4);
  trial.adventurerRescue = { from: 1, until: 100 };
  trial.reviveTickets = 1;
  trial.hp = 0;
  assert.equal(
    core.reviveAfterDeath(trial, session, () => 0.5, "death"),
    true,
  );
  assert.equal(trial.reviveTickets, 1);
  assert(!trial.adventurerRescue);
  const cursed = core.ITEMS.cursed.find((i) => i.curse);
  core.receiveItem(trial, cursed);
  core.receiveItem(trial, cursed);
  trial.modifiers = { fortified: 3, soul_drain: 2 };
  trial.activeParadox = { id: "hunger", startFloor: 48, endFloor: 53 };
  trial.contract = { kind: "skill", from: 48, until: 51, remaining: 3 };
  const contract = JSON.parse(JSON.stringify(trial.contract));
  trial.hp = 1;
  trial.mana = 0;
  trial.encounter.hp = 1;
  trial.encounter.defense = 0;
  trial.encounter.evasion = 0;
  const beforeFavor = god.favor(session.guild_id, session.user_id);
  kill(trial);
  assert.equal(trial.floor, 50);
  assert.equal(trial.cleared, 49);
  assert.equal(trial.encounter.type, "covenant_blessing");
  assert.equal(covenant.fragmentCount(trial), 0);
  assert.equal(trial.activeRelic, covenant.RELIC_ID);
  assert.equal(trial.relics[0].acquiredFloor, 49);
  assert.equal(trial.covenant.kills, 0); // Final challenge precedes activation.
  assert.equal(trial.hp, trial.maxHp);
  assert.equal(trial.mana, trial.maxMana);
  assert.equal(trial.items[0].rarity, "cursed");
  assert.equal(trial.items[0].cleansedLevels, 2);
  assert.deepEqual(trial.modifiers, {});
  assert.equal(trial.activeParadox.id, "hunger");
  assert.equal(trial.contract.remaining, contract.remaining - 1);
  assert.deepEqual(god.favor(session.guild_id, session.user_id), beforeFavor);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM hardcore_god_rngesus_encounters").get()
      .n,
    0,
  );
  const blessed = JSON.parse(JSON.stringify(trial));
  bounds(view.privatePayload(blessed, "id", "message", "items"));
  bounds(view.privatePayload(blessed, "id", "message", "stats"));
  bounds({ embeds: [view.embed(blessed, "u")] });
  core.act(trial, session, "covenant_continue", () => 0.5);
  assert.equal(trial.floor, 50);
  assert.equal(trial.encounter.rank, "boss");
  assert.throws(
    () => core.act(trial, session, "covenant_continue", () => 0.5),
    /INVALID_ACTION/,
  );
  groups.push(
    "locked final Elite, both revival sources, full UR/Rift blessing, consumed fragments and no skipped scheduled boss",
  );

  const checkpoint = portal(collect(state(10)));
  core.act(checkpoint, session, "covenant_basement", () => 0.5);
  checkpoint.encounter.hp = 1;
  checkpoint.encounter.defense = 0;
  checkpoint.encounter.evasion = 0;
  kill(checkpoint);
  assert.equal(checkpoint.floor, 11);
  assert(checkpoint.pendingMilestones.includes("upgrade"));
  assert.deepEqual(checkpoint.modifiers, {}); // New floor-10 Rift cleared by the blessing.
  core.act(checkpoint, session, "covenant_continue", () => 0.5);
  assert.equal(checkpoint.phase, "upgrade");
  assert.equal(checkpoint.floor, 11);
  core.act(checkpoint, session, "upgrade_str", () => 0.5);
  assert.equal(checkpoint.floor, 11);
  groups.push(
    "checkpoint queue survives blessing, end-floor Rift is removed and continuation does not clear a second floor",
  );

  const occupied = portal(collect(state()));
  occupied.relics = [{ id: "fatebreaker_seal", acquiredFloor: 1 }];
  occupied.activeRelic = "fatebreaker_seal";
  core.act(occupied, session, "covenant_basement", () => 0.5);
  occupied.encounter.hp = 1;
  occupied.encounter.defense = 0;
  occupied.encounter.evasion = 0;
  kill(occupied);
  assert.equal(occupied.activeRelic, "fatebreaker_seal");
  assert.equal(occupied.relics.length, 2);
  assert.equal(covenant.bonus(occupied), 0);
  assert.equal(occupied.hp, occupied.maxHp);
  assert.equal(covenant.canEnter(occupied), false);
  groups.push(
    "one active LR, no switching or repeat quest reward; blessing still applies when Fatebreaker already active",
  );

  const growth = activate(state(), 100);
  const gross = growth.stake * baseMultiplier(growth) + growth.bonus;
  growth.payoutSpent = 123;
  assert.equal(core.payout(growth), Math.floor(gross * 1.2) - 123);
  growth.paradox = { kind: "blood", bloodFactor: 0.25 };
  assert.equal(core.payout(growth), Math.floor(gross * 1.25 * 1.2) - 123);
  growth.covenant.kills = 1000;
  assert.equal(covenant.bonus(growth), 1);
  growth.bonus = 30_000_000;
  assert.equal(core.payout(growth), 10_000_000 - 123);
  const diamonds = runDiamondReward(growth);
  growth.encounter = enemy(growth);
  kill(growth);
  assert.equal(covenant.bonus(growth), 1);
  assert.equal(runDiamondReward(growth), diamonds);
  const newKills = activate(state());
  newKills.encounter = enemy(newKills);
  const defeated = kill(newKills);
  assert.equal(newKills.covenant.kills, 1);
  assert.equal(covenant.bonus(newKills), 0.002);
  assert.equal(covenant.recordKill(newKills, defeated), false);
  assert.equal(newKills.covenant.kills, 1);
  newKills.activeRelic = "fatebreaker_seal";
  assert.equal(covenant.bonus(newKills), 0);
  groups.push(
    "0.2-point kill payout growth, no pre-activation or duplicate kills, one multiplier before cap/costs, unchanged diamonds",
  );

  // Real persisted game transaction, stale actions and rollback.
  const run = service.startHardcore({
    guildId: "tx-g",
    userId: "tx-u",
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const saved = repo.parseState(repo.getSession(run.session.id));
  Object.assign(saved, collect(portal(state(10))), {
    turn: saved.turn,
    stake: 10,
    fair: saved.fair,
    fairCounter: saved.fairCounter,
  });
  repo.saveState(run.session, saved);
  const play = (turn, action) =>
    service.playHardcore({
      sessionId: run.session.id,
      userId: "tx-u",
      expectedTurn: turn,
      action,
    });
  const entered = play(saved.turn, "covenant_basement");
  const entryJson = repo.getSession(run.session.id).state_json;
  assert.throws(() => play(saved.turn, "covenant_basement"), /STALE_ACTION/);
  assert.equal(repo.getSession(run.session.id).state_json, entryJson);
  const prepared = repo.parseState(repo.getSession(run.session.id));
  prepared.encounter.hp = 1;
  prepared.encounter.defense = 0;
  prepared.encounter.evasion = 0;
  prepared.sources.event.str = 10000;
  stats.recompute(prepared);
  repo.saveState(run.session, prepared);
  // Force a failure after applying kill/blessing but before saving; every change must roll back.
  const originalAct = core.act;
  core.act = (...args) => {
    originalAct(...args);
    throw new Error("TEST_ROLLBACK");
  };
  const beforeFailure = repo.getSession(run.session.id).state_json;
  assert.throws(() => play(prepared.turn, "attack"), /TEST_ROLLBACK/);
  assert.equal(repo.getSession(run.session.id).state_json, beforeFailure);
  core.act = originalAct;
  // Attack may miss: retry until the fair, persisted kill happens.
  let result;
  for (let i = 0; i < 20; i++) {
    const current = repo.parseState(repo.getSession(run.session.id));
    result = play(current.turn, "attack");
    if (result.state.encounter.type === "covenant_blessing") break;
  }
  assert.equal(result.state.encounter.type, "covenant_blessing");
  const wonJson = repo.getSession(run.session.id).state_json;
  assert.throws(() => play(result.state.turn - 1, "attack"), /STALE_ACTION/);
  assert.equal(repo.getSession(run.session.id).state_json, wonJson);
  const reopened = service.getHardcoreRun("tx-g", "tx-u").state;
  assert.equal(
    reopened.relics.filter((r) => r.id === covenant.RELIC_ID).length,
    1,
  );
  assert.equal(reopened.covenant.completed, true);
  const frames = [],
    waits = [];
  assert.equal(
    await reveal.play(
      run.session.id,
      reopened,
      "tx-u",
      async (p) => {
        bounds(p);
        frames.push(p);
      },
      { wait: async (ms) => waits.push(ms) },
    ),
    true,
  );
  assert.equal(frames.length, 2);
  assert.deepEqual(waits, [650, 850]);
  assert(frames.every((f) => !f.components.length));
  const afterReveal = service.getHardcoreRun("tx-g", "tx-u").state;
  assert.equal(reveal.frame(afterReveal, "tx-u"), null);
  assert.equal(
    await reveal.play(run.session.id, afterReveal, "tx-u", async () => {
      throw Error("Should not edit");
    }),
    false,
  );
  assert.equal(
    covenantReveal.claimReveal(run.session.id, {
      ...afterReveal,
      turn: afterReveal.turn - 1,
    }),
    false,
  );
  groups.push(
    "transaction rollback, saved run/resume, stale-click rejection, exactly one relic and two animation frames once",
  );

  const failureState = JSON.parse(JSON.stringify(blessed));
  failureState.turn = 123;
  failureState.encounter.revealedAt = null;
  const failureSession = {
    ...session,
    id: "reveal-failure",
    created_at: 1,
    updated_at: 1,
  };
  repo.insertSession(failureSession, failureState);
  assert.equal(
    await reveal.play(
      failureSession.id,
      failureState,
      "u",
      async () => {
        throw Error("Discord offline");
      },
      { wait: async () => {} },
    ),
    true,
  );
  const persistedFailure = repo.parseState(repo.getSession(failureSession.id));
  assert(persistedFailure.encounter.revealedAt);
  assert.equal(persistedFailure.activeRelic, covenant.RELIC_ID);
  assert.equal(persistedFailure.hp, persistedFailure.maxHp);
  assert.equal(reveal.frame(persistedFailure, "u"), null);
  groups.push(
    "Discord animation failure never loses blessing/relic or replays rewards after reopening",
  );

  assert(core.RELIC_ITEMS.conquerors_covenant.runtimeEnabled);
  assert(
    !Object.values(core.ITEM_POOLS)
      .flat()
      .some((i) => i.category === "relic"),
  );
  const bag = JSON.stringify(
    view.privatePayload(available, "id", "m", "items").embeds[0].toJSON(),
  );
  const battle = JSON.stringify(view.embed(available, "u").toJSON());
  assert.match(bag, /Mảnh Nanh Giả/);
  assert(!battle.includes("Mảnh Nanh Giả"));
  assert.match(battle, /cửa tầng hầm/i);
  assert.match(
    JSON.stringify(
      view
        .privatePayload(activate(state(), 25), "id", "m", "stats")
        .embeds[0].toJSON(),
    ),
    /5% thưởng xu/,
  );
  assert.match(JSON.stringify(view.ratesFields("loot")), /Chuỗi bốn mảnh/);
  groups.push(
    "run-only nonrandom LR catalog, inventory progress, concise portal UI and current passive bonus in stats",
  );

  // A counter kill is also a valid fragment source and advances the passive once.
  const counter = state();
  const armor = Object.values(core.ITEMS)
    .flat()
    .find((i) => i.id === "living_armor");
  core.receiveItem(counter, armor);
  counter.encounter = enemy(counter, "mimic", "Mimic");
  Object.assign(counter.encounter, {
    damageMin: 50,
    damageMax: 50,
    accuracy: 100000,
  });
  kill(counter, "defend");
  assert.equal(covenant.fragmentCount(counter), 1);
  const richCounter = activate(state());
  core.receiveItem(richCounter, armor);
  richCounter.encounter = enemy(richCounter);
  Object.assign(richCounter.encounter, {
    damageMin: 50,
    damageMax: 50,
    accuracy: 100000,
  });
  kill(richCounter, "defend");
  assert.equal(richCounter.covenant.kills, 1);
  groups.push(
    "first valid counter kills award fragments and advance the active passive once",
  );

  // God after Covenant still heals/cleanses, keeps the active LR and its earned bonus.
  const laterGod = activate(state(200), 17);
  laterGod.godRngesusEnabled = true;
  const godSession = {
    ...session,
    id: "covenant-then-god",
    guild_id: "later-g",
    user_id: "later-u",
  };
  const godEvent = god.tryEncounter(laterGod, godSession, () => 0);
  assert.equal(godEvent.type, "god_rngesus");
  assert.equal(laterGod.activeRelic, covenant.RELIC_ID);
  assert.equal(laterGod.covenant.kills, 17);
  assert.equal(laterGod.relics.length, 2);
  assert.equal(covenant.bonus(laterGod), 0.034);
  groups.push(
    "God received after Covenant preserves one active LR and its accumulated kill bonus",
  );

  console.log("Hardcore Conqueror: " + groups.length + " groups passed");
  for (const group of groups) console.log("  ✓ " + group);
}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
