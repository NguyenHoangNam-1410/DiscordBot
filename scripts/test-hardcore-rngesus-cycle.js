"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const databaseModule = require.cache[require.resolve("better-sqlite3")];
databaseModule.exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
databaseModule.exports = Database;
delete process.env.HARDCORE_GAMEPLAY_VERSION;
const service = require("../src/services/hardcoreService");
const core = require("../src/services/hardcoreV2");
const repo = require("../src/services/hardcoreRepository");
const policy = require("../src/services/hardcoreRngesus");
const { ratesFields } = require("../src/services/hardcoreV2View");
const { ratesEmbed } = require("../src/commands/hardcore");

assert.deepEqual(
  [1, 4, 5, 9, 10, 19, 20, 999].map(policy.rngesusChance),
  [0, 0, 0.003, 0.003, 0.006, 0.006, 0.01, 0.01],
);
assert.deepEqual(
  [1, 4, 5, 9, 10, 19, 20, 999].map((floor) =>
    policy.rngesusEncounterChance({ floor }),
  ),
  [0, 0, 0.003, 0.003, 0.006, 0.006, 0.01, 0.01],
  "old saves without the new field retain the initial curve until they survive RNGesus",
);
for (const anchor of [6, 77, 197, 900]) {
  const state = {
    floor: anchor,
    rngesusDry: 200,
    lastChaosChance: 0.12,
    lastChaosSpike: true,
    rngesusFleeCount: 5,
    prayerBoost: true,
  };
  policy.resetRngesusEncounter(state);
  assert.equal(state.rngesusDry, 0);
  assert.equal(state.lastChaosChance, 0);
  assert.equal(state.lastChaosSpike, false);
  assert.equal(
    state.rngesusFleeCount,
    5,
    "encounter reset must not restore flee success",
  );
  assert.equal(
    state.prayerBoost,
    true,
    "encounter reset must not remove the run's prayer boost",
  );
  for (const [distance, base] of [
    [1, 0],
    [2, 0.003],
    [6, 0.003],
    [7, 0.006],
    [16, 0.006],
    [17, 0.01],
  ]) {
    state.floor = anchor + distance;
    assert.equal(
      policy.rngesusEncounterChance(state),
      base,
      "post-encounter progression at +" + distance,
    );
  }
}
assert.equal(
  policy.rngesusEncounterChance({ floor: 3, rngesusResetFloor: 1 }),
  0,
  "minimum initial floor remains five",
);

// Both engines bypass ALL randomness on the adjacent floor, even with extreme heat/spike rolls.
for (const version of ["v1", "v2"]) {
  const roll = (state, values = [0.5, 0.5, 0.999]) => {
    if (version === "v1")
      return service.rollRngesus(state, {
        volatilityRoll: values[0],
        spikeRoll: values[1],
        severityRoll: 0.999,
        encounterRoll: values[2],
      });
    return core.rollRngesus(state, () => values.shift() ?? 0.999);
  };
  const safe = {
    floor: 78,
    rngesusResetFloor: 77,
    rngesusDry: 1000,
    lastChaosChance: 0.12,
    lastChaosSpike: true,
  };
  if (version === "v2") {
    let draws = 0;
    assert.equal(
      core.rollRngesus(safe, () => {
        draws++;
        return 0;
      }),
      false,
    );
    assert.equal(draws, 0, "cooldown must not sample a spike");
  } else assert.equal(roll(safe, [0, 0, 0]), false);
  assert.equal(safe.lastChaosChance, 0);
  assert.equal(safe.lastChaosSpike, false);
  assert.equal(safe.rngesusDry, 1000, "suppressed floor does not add heat");
  const growing = { floor: 79, rngesusResetFloor: 77, rngesusDry: 0 };
  roll(growing);
  assert(Math.abs(growing.lastChaosChance - 0.003 * 1.625) < 1e-12);
  assert.equal(growing.rngesusDry, 1);
  growing.floor++;
  roll(growing);
  assert(
    Math.abs(growing.lastChaosChance - (0.003 * 1.625 + 0.0005)) < 1e-12,
    "dry heat grows at the original 0.05 percentage points",
  );
  const hit = { floor: 79, rngesusResetFloor: 77, rngesusDry: 2 };
  assert(roll(hit, [0.5, 0.5, 0]));
  assert.equal(hit.rngesusDry, 0);
  assert.equal(
    hit.rngesusResetFloor,
    77,
    "rolling an encounter must not start its next cycle before resolution",
  );
}

// Show the exact encounter roll (including volatility, dry streak and spikes), not the base curve.
{
  const stats = require("../src/services/hardcoreStats");
  const view = require("../src/services/hardcoreV2View");
  for (const [draws, expected, label] of [
    [[0.5, 0.5, 0], 0.003 * 1.625 + 0.001, "RNGesus (0,59%)"],
    [[0.5, 0, 0.5, 0], 0.003 * 1.625 + 0.001 + 0.07, "RNGesus (7,59%)"],
  ]) {
    const state = stats.createState("barbarian", 10);
    Object.assign(state, { floor: 6, cleared: 5, rngesusDry: 2 });
    const rolls = [...draws];
    state.encounter = core.generateEncounter(
      state,
      { guild_id: "ui", user_id: "ui" },
      () => rolls.shift() ?? 0.5,
    );
    assert.equal(state.encounter.type, "rngesus");
    assert.ok(Math.abs(state.encounter.encounterChance - expected) < 1e-12);
    const restored = JSON.parse(JSON.stringify(state));
    // Changing future policy counters or its last-roll field must not alter the locked label.
    restored.lastChaosChance = 0;
    restored.rngesusDry = 100;
    core.normalize(restored);
    assert.equal(
      restored.encounter.encounterChance,
      state.encounter.encounterChance,
    );
    const main = view.embed(restored, "ui").toJSON();
    assert.ok(!main.fields.some((field) => field.name.includes("Tiến trình")));
    const situation = main.fields.find((field) =>
      field.name.includes("Tình huống"),
    );
    assert.ok(situation.value.includes(label), situation.value);
    const detail = view
      .privatePayload(restored, "ui", "message", "encounter")
      .embeds[0].toJSON();
    assert.ok(detail.description.includes(label));
    assert.ok(main.fields.every((field) => field.value.length <= 1024));
  }
  const old = stats.createState("barbarian", 10);
  Object.assign(old, {
    floor: 6,
    cleared: 5,
    lastChaosChance: 0.12,
    encounter: { type: "rngesus", name: "RNGesus" },
  });
  core.normalize(old);
  assert.equal(old.encounter.encounterChance, 0.12);
  assert.ok(
    view
      .embed(old, "ui")
      .toJSON()
      .fields.some((field) => field.value.includes("RNGesus (12%)")),
  );
  old.encounter = { type: "empty", name: "Phòng trống" };
  assert.ok(
    !view
      .embed(old, "ui")
      .toJSON()
      .fields.some((field) => field.name.includes("Tiến trình")),
  );
}

let n = 0;
const guildId = "rngesus-cycle";
function startCase(action, extra = {}, eventExtra = {}, floor = 197) {
  const run = service.startHardcore({
    guildId,
    userId: "u" + ++n,
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty", name: "Trống" },
  });
  const state = repo.parseState(repo.getSession(run.session.id));
  Object.assign(
    state,
    {
      floor,
      cleared: floor - 1,
      bonus: 10000,
      rngesusDry: 200,
      lastChaosChance: 0.12,
      lastChaosSpike: true,
      rngesusFleeCount: 2,
      prayerBoost: true,
    },
    extra,
  );
  state.encounter = {
    type: "rngesus",
    name: "RNGesus",
    fleeChance: 0.9,
    fleeSuccess: true,
    prayerChance: 0.6,
    prayerSuccess: true,
    prayerItem: structuredClone(core.ITEMS.cursed[0]),
    ...eventExtra,
  };
  repo.saveState(run.session, state);
  const result = service.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: state.turn,
    action,
  });
  return { run, result };
}
for (const test of [
  { action: "flee" },
  { action: "flee", extra: { escapeTokens: 1 }, event: { fleeSuccess: false } },
  { action: "bribe" },
  { action: "pray" },
  {
    action: "pray",
    extra: { reviveTickets: 1 },
    event: { prayerSuccess: false },
  },
  {
    action: "fight",
    extra: { adventurerRescue: { from: 101, until: 199 }, reviveTickets: 1 },
  },
  { action: "flee", floor: 195 }, // checkpoint delays generating the next encounter
]) {
  const floor = test.floor ?? 197;
  const { run, result } = startCase(test.action, test.extra, test.event, floor);
  assert.equal(result.settled, false, test.action + " must survive");
  const state = result.state;
  assert.equal(state.rngesusResetFloor, floor);
  assert.equal(state.rngesusDry, 0);
  assert.equal(state.lastChaosChance, 0);
  assert.equal(state.lastChaosSpike, false);
  assert.equal(state.floor, floor + 1);
  assert.notEqual(state.encounter.type, "rngesus");
  assert.equal(state.prayerBoost, true);
  assert.equal(state.rngesusFleeCount, test.action === "flee" ? 3 : 2);
  if (test.extra?.adventurerRescue) {
    assert.equal(state.reviveTickets, 1);
    assert(!state.adventurerRescue);
  }
  const saved = repo.parseState(repo.getSession(run.session.id));
  assert.equal(
    saved.rngesusResetFloor,
    floor,
    "reset boundary persists in the saved run",
  );
  const restored = JSON.parse(JSON.stringify(saved));
  core.normalize(restored);
  restored.floor = floor + 1;
  restored.phase = "encounter";
  assert.notEqual(
    core.generateEncounter(restored, run.session, () => 0).type,
    "rngesus",
    "even a guaranteed hit roll cannot produce adjacent encounters after resume",
  );
  restored.floor = floor + 2;
  assert.equal(
    core.generateEncounter(restored, run.session, () => 0).type,
    "rngesus",
    "the next eligible floor can still roll RNGesus",
  );
  if (saved.phase === "upgrade") {
    const resumed = service.playHardcore({
      sessionId: run.session.id,
      userId: run.session.user_id,
      expectedTurn: saved.turn,
      action: "upgrade_str",
    });
    assert.equal(resumed.state.floor, floor + 1);
    assert.notEqual(resumed.state.encounter.type, "rngesus");
    assert.equal(resumed.state.rngesusResetFloor, floor);
  }
}
for (const action of ["fight", "pray", "flee"]) {
  const { result } = startCase(
    action,
    { reviveTickets: 0, escapeTokens: 0 },
    { fleeSuccess: false, prayerSuccess: false },
  );
  assert.equal(result.settled, true);
  assert.equal(result.result.reason, "rngesus");
  assert.equal(
    result.state.rngesusResetFloor,
    0,
    "a terminal death does not count as passing RNGesus",
  );
}

// Saved v1 runs also reset through their actual resolution path.
process.env.HARDCORE_GAMEPLAY_VERSION = "legacy";
const { run, result } = startCase(
  "flee",
  {},
  { fleeRoll: 0.1, fleeChance: 0.75 },
  197,
);
assert.equal(result.settled, false);
assert.notEqual(
  result.state.gameplayVersion,
  2,
  "legacy run must use the v1 engine",
);
assert.equal(result.state.rngesusResetFloor, 197);
assert.equal(result.state.floor, 198);
assert.notEqual(result.state.encounter.type, "rngesus");
assert.equal(result.state.lastChaosChance, 0);
assert.equal(
  repo.parseState(repo.getSession(run.session.id)).rngesusResetFloor,
  197,
);

const cycleField = ratesFields("rngesus").find((field) =>
  field.name.includes("Chu kỳ"),
);
assert(cycleField.value.includes("0,3% trong 5 tầng"));
assert(cycleField.value.includes("Tầng ngay sau đó: **0%**"));
for (const version of ["legacy", "2"]) {
  process.env.HARDCORE_GAMEPLAY_VERSION = version;
  const embed = ratesEmbed("rngesus").toJSON();
  for (const field of embed.fields)
    assert(
      field.value.length <= 1024,
      "Discord field length must remain valid",
    );
  assert(
    embed.fields.reduce(
      (sum, field) => sum + field.name.length + field.value.length,
      0,
    ) < 5500,
  );
}
db.close();
console.log(
  "RNGesus cycle passed: initial odds, slow restart, no adjacent encounters, all survival/revival paths, checkpoint resume, persistence and legacy runs.",
);
