"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const catalog = require("../src/hardcore/tower/challengeCatalog");
const repo = require("../src/services/hardcoreTowerRepository");
const service = require("../src/services/hardcoreTowerService");
const engine = require("../src/services/hardcoreTowerEngine");
const view = require("../src/services/hardcoreTowerView");
const economy = require("../src/services/economyService");
const diamonds = require("../src/services/playerLevelService");
const secret = "runtime-test-secret-only",
  quiet = { info() {}, error() {} },
  startTime = catalog.ANCHOR + 1000;
let now = startTime,
  user = 0,
  c = catalog.ensureWeekly(now, { secret, logger: quiet });
function state(row) {
  return JSON.parse(repo.session(row.id).state_json);
}
function start(userId = "u" + ++user, challenge = c) {
  return service.startTx({
    guildId: "tower",
    userId,
    channelId: "channel",
    challenge,
    now,
  });
}
function play(row, action, extra = {}) {
  const s = state(row);
  return service.actionTx({
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    channelId: row.channel_id,
    expectedTurn: s.turn,
    expectedRouteStep: s.routeStep,
    action,
    clock: () => now,
    ...extra,
  });
}
function runTo(row, limit, challenge = c) {
  while (state(row).routeStep < limit) {
    const s = state(row);
    assert.equal(s.status, "playing");
    play(row, challenge.transitions[s.routeStep].expectedAction);
  }
}
function serialize(p) {
  const embeds = p.embeds.map((x) => x.toJSON()),
    components = p.components.map((x) => x.toJSON());
  assert.ok(p.embeds.reduce((sum, e) => sum + e.length, 0) <= 6000);
  for (const e of embeds) {
    assert.ok((e.fields || []).length <= 25);
    for (const f of e.fields || []) {
      assert.ok(f.value.length > 0 && f.value.length <= 1024);
    }
  }
  assert.ok(components.length <= 5);
  for (const row of components) {
    assert.ok(row.components.length <= 5);
    for (const b of row.components) {
      assert.ok(b.label.length <= 80);
      assert.ok(b.custom_id.length <= 100);
      assert.ok(b.emoji);
    }
  }
  const json = JSON.stringify({ embeds, components });
  assert.ok(!json.includes(secret));
  assert.ok(
    !json.includes('"expectedAction"') &&
      !json.includes('"canonicalSolution"') &&
      !json.includes('"seed":'),
  );
  return json;
}

function replayButton(row, challenge, clock = now) {
  const p = view.payload(
    row,
    JSON.parse(row.state_json),
    challenge,
    repo.result(row.guild_id, row.user_id, challenge.challengeId),
    clock,
  );
  serialize(p);
  return p.components
    .flatMap((r) => r.toJSON().components)
    .find((b) => b.custom_id.split(":")[3] === "replay");
}
async function pressReplay(row, challenge, { twice = false } = {}) {
  const button = replayButton(repo.session(row.id), challenge);
  assert.ok(button && !button.disabled, "replay must be enabled");
  let updated = [],
    errors = [];
  const interaction = {
    guildId: row.guild_id,
    channelId: row.channel_id,
    user: { id: row.user_id },
    message: { id: repo.session(row.id).message_id },
    customId: button.custom_id,
    deferUpdate: async () => {},
    editReply: async (p) => updated.push(p),
    followUp: async (p) => errors.push(p),
    reply: async (p) => errors.push(p),
  };
  const clock = Date.now;
  Date.now = () => now;
  try {
    if (twice)
      await Promise.all([
        service.handleTowerButton(interaction, quiet),
        service.handleTowerButton(interaction, quiet),
      ]);
    else await service.handleTowerButton(interaction, quiet);
  } finally {
    Date.now = clock;
  }
  assert.equal(updated.length, 1, JSON.stringify(errors));
  serialize(updated[0]);
  if (twice) assert.ok(errors.some((p) => p.content.includes("đã cũ")));
  return updated[0];
}
function insertLegacy(userId, status) {
  const original = require("../src/hardcore/towerChallenges").get(
    "tower-2026-W41-v1",
  );
  const oldState = engine.createState(original);
  if (status === "completed")
    for (const a of original.canonicalSolution)
      engine.act(oldState, original, a);
  else engine.act(oldState, original, "defend");
  assert.equal(oldState.status, status);
  const row = {
    id: "legacy-" + userId,
    guild_id: "tower",
    user_id: userId,
    challenge_id: original.challengeId,
    content_version: original.contentVersion,
    channel_id: "channel",
  };
  repo.insert(row, oldState, now);
  repo.attempt(row, now);
  repo.progress(row, oldState, now);
  if (status === "completed")
    repo.reward(row, engine.solutionHash(original), now);
  repo.message(row.id, "board-" + row.id);
  return repo.session(row.id);
}
async function verifyReplayRegression(reward) {
  const legacy = catalog.get("tower-2026-W41-v1");
  for (const status of ["completed", "failed"]) {
    const source = insertLegacy("old-" + status, status),
      oldState = JSON.parse(source.state_json);
    const board = replayButton(source, legacy);
    assert.equal(board.label, "Chơi Tháp hiện tại");
    let clocks = 0;
    assert.throws(
      () =>
        service.actionTx({
          id: source.id,
          guildId: "tower",
          userId: source.user_id,
          channelId: "channel",
          messageId: source.message_id,
          expectedTurn: oldState.turn,
          action: "replay",
          clock: () => (++clocks === 1 ? now : c.endsAt),
        }),
      /CHALLENGE_EXPIRED/,
    );
    assert.equal(repo.session(source.id).state_json, source.state_json);
    assert.equal(repo.byUser("tower", source.user_id, c.challengeId), null);
    await pressReplay(source, legacy, { twice: true });
    const current = repo.byUser("tower", source.user_id, c.challengeId),
      fresh = state(current);
    assert.equal(fresh.status, "playing");
    assert.equal(fresh.floor, 1);
    assert.equal(fresh.routeStep, 0);
    assert.equal(fresh.hp, c.character.maxHp);
    assert.equal(fresh.mana, c.initialState.mana);
    assert.equal(current.message_id, source.message_id);
    const kept = state(source);
    for (const key of ["status", "hp", "mana", "actionHistory"])
      assert.deepEqual(kept[key], oldState[key]);
    assert.equal(kept.turn, oldState.turn + 1);
    assert.equal(
      repo.result("tower", source.user_id, legacy.challengeId).attempts,
      1,
    );
    if (status === "completed") {
      const coins = economy.getAccount("tower", source.user_id).balance;
      runTo(current, c.stepCount);
      assert.equal(state(current).rewardGranted, false);
      assert.equal(economy.getAccount("tower", source.user_id).balance, coins);
    }
  }
  const preserve = start("old-preserve");
  play(preserve, c.transitions[0].expectedAction);
  const activeJson = repo.session(preserve.id).state_json;
  const source = insertLegacy("old-preserve", "failed");
  await pressReplay(source, legacy);
  assert.equal(
    repo.session(preserve.id).state_json,
    activeJson,
    "opening from a legacy board must preserve an active chain",
  );
  // Actual Discord IDs from failed/completed v3 boards reset to floor 1.
  const failed = start("button-failed");
  play(
    failed,
    engine
      .actions(state(failed), c)
      .find((x) => !x.disabled && x.action !== c.transitions[0].expectedAction)
      .action,
  );
  repo.message(failed.id, "board-failed");
  await pressReplay(failed, c, { twice: true });
  assert.equal(state(failed).routeStep, 0);
  assert.equal(state(failed).status, "playing");
  assert.equal(
    repo.result("tower", "button-failed", c.challengeId).attempts,
    1,
  );
  repo.message(reward.id, "board-completed");
  await pressReplay(reward, c, { twice: true });
  assert.equal(state(reward).routeStep, 0);
  assert.equal(state(reward).status, "playing");
  assert.equal(repo.result("tower", reward.user_id, c.challengeId).attempts, 2);
  const missing = insertLegacy("no-current", "failed"),
    missingState = state(missing),
    at = c.endsAt + catalog.WEEK_MS;
  assert.equal(replayButton(missing, legacy, at).disabled, true);
  assert.throws(
    () =>
      service.actionTx({
        id: missing.id,
        guildId: "tower",
        userId: missing.user_id,
        channelId: "channel",
        expectedTurn: missingState.turn,
        action: "replay",
        clock: () => at,
      }),
    /NO_ACTIVE_TOWER/,
  );
  assert.equal(repo.session(missing.id).state_json, missing.state_json);
  const expired = start("replay-after-week");
  play(
    expired,
    engine
      .actions(state(expired), c)
      .find((x) => !x.disabled && x.action !== c.transitions[0].expectedAction)
      .action,
  );
  repo.message(expired.id, "board-expired");
}

async function main() {
  const unpublished = { ...c, challengeId: "forged" };
  assert.throws(() => start("forged", unpublished), /CHALLENGE_NOT_PUBLISHED/);
  // Caller-supplied payload cannot replace the immutable published challenge.
  const protectedRow = start("immutable", {
    ...c,
    initialState: { hp: 999, mana: 99 },
  });
  assert.equal(state(protectedRow).hp, c.character.maxHp);
  const row = start("owner");
  assert.equal(repo.result("tower", "owner", c.challengeId).attempts, 0);
  assert.equal(start("owner").state_json, row.state_json);
  repo.message(row.id, "message");
  const currentAction = c.transitions[0].expectedAction;
  const args = {
    id: row.id,
    guildId: "tower",
    userId: "owner",
    channelId: "channel",
    messageId: "message",
    expectedTurn: 0,
    expectedRouteStep: 0,
    action: currentAction,
    clock: () => now,
  };
  for (const [changes, reason] of [
    [{ userId: "other" }, "NOT_TOWER_OWNER"],
    [{ guildId: "other" }, "NOT_TOWER_OWNER"],
    [{ channelId: "other" }, "WRONG_CHANNEL"],
    [{ messageId: "old" }, "STALE_ACTION"],
    [{ expectedTurn: 1 }, "STALE_ACTION"],
    [{ expectedRouteStep: 1 }, "STALE_ACTION"],
    [{ action: "forged_action" }, "INVALID_ACTION"],
  ])
    assert.throws(
      () => service.actionTx({ ...args, ...changes }),
      new RegExp(reason),
    );
  assert.equal(repo.session(row.id).state_json, row.state_json);
  const concurrent = await Promise.allSettled([
    service.withLock(row.id, () => service.actionTx(args)),
    service.withLock(row.id, () => service.actionTx(args)),
  ]);
  assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    concurrent.find((x) => x.status === "rejected").reason.message,
    "STALE_ACTION",
  );
  assert.equal(state(row).routeStep, 1);
  const committed = repo.session(row.id).state_json;
  delete require.cache[require.resolve("../src/services/hardcoreTowerService")];
  const restarted = require("../src/services/hardcoreTowerService");
  assert.equal(
    restarted.getRun("tower", "owner", c.challengeId).session.state_json,
    committed,
  );
  assert.equal(
    restarted.startTx({
      guildId: "tower",
      userId: "owner",
      channelId: "channel",
      challenge: c,
      now,
    }).state_json,
    committed,
  );
  assert.equal(repo.result("tower", "owner", c.challengeId).attempts, 0);
  const failed = start("failed");
  const wrong = engine
    .actions(state(failed), c)
    .find(
      (x) => !x.disabled && x.action !== c.transitions[0].expectedAction,
    ).action;
  const lost = play(failed, wrong);
  assert.equal(lost.state.status, "failed");
  assert.equal(lost.state.routeStep, 0);
  assert.equal(lost.result.attempts, 1);
  assert.throws(
    () => play(failed, wrong, { expectedTurn: 0, expectedRouteStep: 0 }),
    /STALE_ACTION/,
  );
  assert.equal(repo.result("tower", "failed", c.challengeId).attempts, 1);
  const replay = play(failed, "replay");
  const initial = engine.createState(c);
  for (const field of [
    "hp",
    "mana",
    "maxHp",
    "maxMana",
    "routeStep",
    "floor",
    "floorStep",
    "flags",
    "classCharges",
    "paradox",
    "actionHistory",
  ])
    assert.deepEqual(replay.state[field], initial[field]);
  assert.equal(replay.result.attempts, 1);
  assert.ok(replay.state.turn > lost.state.turn);
  assert.throws(() => play(failed, "replay"), /INVALID_ACTION/);
  const reward = start("reward");
  runTo(reward, c.stepCount - 1);
  const pre = repo.session(reward.id).state_json,
    finalAction = c.transitions.at(-1).expectedAction;
  const coins = economy.getAccount("tower", "reward").balance,
    gems = diamonds.getPlayerProgression("tower", "reward").diamonds;
  for (const sql of [
    "CREATE TRIGGER fail_tower_save BEFORE UPDATE ON hardcore_tower_sessions BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END",
    "CREATE TRIGGER fail_tower_gems BEFORE UPDATE ON player_currencies BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END",
  ]) {
    db.exec(sql);
    assert.throws(() => play(reward, finalAction), /TEST_ROLLBACK/);
    assert.equal(repo.session(reward.id).state_json, pre);
    assert.equal(economy.getAccount("tower", "reward").balance, coins);
    assert.equal(
      diamonds.getPlayerProgression("tower", "reward").diamonds,
      gems,
    );
    assert.equal(
      repo.result("tower", "reward", c.challengeId).reward_claimed_at,
      null,
    );
    assert.equal(repo.result("tower", "reward", c.challengeId).attempts, 0);
    db.exec(
      "DROP TRIGGER " +
        (sql.includes("fail_tower_save")
          ? "fail_tower_save"
          : "fail_tower_gems"),
    );
  }
  let clocks = 0;
  assert.throws(
    () =>
      play(reward, finalAction, {
        clock: () => (++clocks === 1 ? c.endsAt - 1 : c.endsAt),
      }),
    /CHALLENGE_EXPIRED/,
  );
  assert.equal(repo.session(reward.id).state_json, pre);
  const won = play(reward, finalAction);
  assert.equal(won.state.status, "completed");
  assert.equal(won.state.routeStep, c.stepCount);
  assert.equal(won.result.attempts, 1);
  assert.equal(won.result.solution_hash, c.solutionHash);
  assert.equal(economy.getAccount("tower", "reward").balance, coins + 500000);
  assert.equal(
    diamonds.getPlayerProgression("tower", "reward").diamonds,
    gems + 250,
  );
  play(reward, "replay");
  runTo(reward, c.stepCount);
  assert.equal(repo.result("tower", "reward", c.challengeId).attempts, 2);
  assert.equal(economy.getAccount("tower", "reward").balance, coins + 500000);
  assert.equal(
    diamonds.getPlayerProgression("tower", "reward").diamonds,
    gems + 250,
  );
  assert.equal(state(reward).rewardGranted, false);
  // A claim on the superseded v1 week does not create a second weekly reward.
  db.prepare(
    "INSERT INTO hardcore_tower_results(guild_id,user_id,challenge_id,attempts,best_floor,reward_claimed_at,updated_at) VALUES('tower','v1claim','tower-2026-W41-v1',1,15,?,?)",
  ).run(now, now);
  const carry = start("v1claim");
  assert.equal(
    repo.result("tower", "v1claim", c.challengeId).reward_claimed_at,
    now,
  );
  runTo(carry, c.stepCount);
  assert.equal(state(carry).rewardGranted, false);
  assert.equal(
    repo.result("tower", "v1claim", c.challengeId).solution_hash,
    c.solutionHash,
  );
  await verifyReplayRegression(reward);
  // Mode isolation: wrong tower actions do not change the simultaneous 999-floor run.
  const survival = require("../src/services/hardcoreService").startHardcore({
    guildId: "tower",
    userId: "isolated",
    channelId: "channel",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const isolated = start("isolated"),
    before999 = db
      .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
      .get(survival.session.id).state_json;
  play(
    isolated,
    engine
      .actions(state(isolated), c)
      .find((x) => !x.disabled && x.action !== c.transitions[0].expectedAction)
      .action,
  );
  assert.equal(
    db
      .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
      .get(survival.session.id).state_json,
    before999,
  );
  // Real UI reopen invalidates the previous board while keeping the snapshot,
  // flags and chain intact. Ephemeral tabs always read the committed state.
  require("../src/services/gameChannelService").setGameChannel(
    "tower",
    "hardcore",
    "channel",
  );
  const originalClock = Date.now;
  Date.now = () => now;
  try {
    let sent,
      oldLocked = false;
    const resume = start("resume");
    repo.message(resume.id, "old-ui");
    const interaction = {
      guildId: "tower",
      channelId: "channel",
      user: { id: "resume" },
      deferReply: async () => {},
      editReply: async (x) => x,
      channel: {
        send: async (p) => {
          sent = p;
          return {
            id: "new-ui",
            url: "https://discord.com/channels/tower/channel/new-ui",
          };
        },
        messages: {
          fetch: async () => ({
            edit: async (p) => {
              oldLocked = p.components.length === 0;
            },
          }),
        },
      },
    };
    await service.openTower(interaction);
    assert.ok(sent);
    assert.ok(oldLocked);
    serialize(sent);
    assert.equal(repo.session(resume.id).state_json, resume.state_json);
    assert.equal(repo.session(resume.id).message_id, "new-ui");
    const followups = [];
    let detail, flags;
    const panel = {
      guildId: "tower",
      channelId: "channel",
      user: { id: "resume" },
      message: { id: "new-ui" },
      deferReply: async (p) => {
        flags = p.flags;
      },
      deferUpdate: async () => {},
      editReply: async (p) => {
        detail = p;
      },
      followUp: async (p) => followups.push(p),
      reply: async (p) => {
        detail = p;
      },
    };
    for (const tab of ["stats", "effects", "encounter", "rules"]) {
      await service.handleTowerButton({
        ...panel,
        customId: "hardcore-tower:" + resume.id + ":0:view_" + tab + ":r0",
      });
      assert.equal(flags, 64);
      serialize(detail);
      assert.ok(
        detail.components[0]
          .toJSON()
          .components.every((x) => x.custom_id.endsWith(":new-ui")),
      );
      assert.equal(repo.session(resume.id).state_json, resume.state_json);
    }
    const actual = c.transitions[0].expectedAction;
    const click = {
      ...panel,
      customId: "hardcore-tower:" + resume.id + ":0:" + actual + ":r0",
    };
    await service.handleTowerButton(
      {
        ...click,
        editReply: async () => {
          throw Error("RESPONSE_TIMEOUT");
        },
      },
      quiet,
    );
    assert.equal(state(resume).routeStep, 1);
    await service.handleTowerButton(click, quiet);
    assert.equal(state(resume).routeStep, 1);
    assert.ok(followups.some((p) => p.content.includes("đã cũ")));
    const current = state(resume);
    const racing = {
      ...panel,
      customId:
        "hardcore-tower:" +
        resume.id +
        ":" +
        current.turn +
        ":" +
        c.transitions[current.routeStep].expectedAction +
        ":r" +
        current.routeStep,
    };
    await Promise.all([
      service.handleTowerButton(racing, quiet),
      service.handleTowerButton(racing, quiet),
    ]);
    assert.equal(state(resume).routeStep, 2);
    const nav = {
      ...panel,
      message: { id: "private" },
      customId: "hardcore-tower:" + resume.id + ":0:view_rules:r0:new-ui",
    };
    await service.handleTowerButton(nav);
    serialize(detail);
    assert.ok(detail.embeds[0].toJSON().footer.text.includes("Lượt 2"));
    const latest = repo.session(resume.id).state_json;
    await service.handleTowerButton({ ...nav, user: { id: "other" } });
    assert.equal(detail.flags, 64);
    await service.handleTowerButton({ ...nav, channelId: "wrong" });
    assert.ok(detail.content.includes("kênh"));
    assert.deepEqual(detail.components, []);
    await service.handleTowerButton({
      ...nav,
      customId: "hardcore-tower:" + resume.id + ":0:view_rules:r0:old-ui",
    });
    assert.ok(detail.content.includes("đã cũ"));
    assert.equal(repo.session(resume.id).state_json, latest);
    const s = state(resume),
      routed = {
        ...panel,
        customId:
          "hardcore-tower:" +
          resume.id +
          ":" +
          s.turn +
          ":" +
          c.transitions[s.routeStep].expectedAction +
          ":r" +
          s.routeStep,
        isButton: () => true,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
      };
    assert.equal(
      await require("../src/componentRouter").routeComponentInteraction(routed),
      true,
    );
    assert.equal(state(resume).routeStep, 3);
  } finally {
    Date.now = originalClock;
  }
  // Every legal branch in every class renders without leaking solution/seed.
  // The correct path's resource deltas match the class engine's previews.
  const random = Math.random;
  Math.random = () => {
    throw Error("TOWER_RUNTIME_RNG");
  };
  try {
    for (let i = 0; i < 7; i++) {
      now = catalog.ANCHOR + i * catalog.WEEK_MS + 1000;
      c = catalog.ensureWeekly(now, { secret, logger: quiet });
      const r = start("all-class-" + i),
        s = engine.createState(c),
        result = { attempts: 0, best_floor: 1, reward_claimed_at: null };
      const shared = start("same-snapshot-" + i);
      assert.equal(
        service.getRun("tower", shared.user_id, c.challengeId).challenge
          .seedCommitment,
        c.seedCommitment,
      );
      for (let step = 0; step < c.stepCount; step++) {
        const before = structuredClone(s),
          t = c.transitions[step];
        const board = serialize(view.payload(r, s, c, result, now));
        assert.ok(board.includes(c.character.name));
        // Commitment belongs to the readonly rules panel after the battle UI cleanup.
        assert.ok(
          serialize(
            view.privatePayload(r, s, c, "1234567890123456789", "rules"),
          ).includes(c.seedCommitment),
        );
        for (const tab of ["stats", "effects", "encounter", "rules"])
          serialize(view.privatePayload(r, s, c, "1234567890123456789", tab));
        for (const option of engine
          .actions(s, c)
          .filter((x) => !x.disabled && x.action !== t.expectedAction)) {
          const wrongState = structuredClone(s);
          engine.act(wrongState, c, option.action);
          assert.equal(wrongState.status, "failed");
          assert.equal(wrongState.routeStep, step);
          assert.equal(wrongState.hp, s.hp);
          assert.equal(wrongState.mana, s.mana);
          serialize(
            view.payload(r, wrongState, c, { ...result, attempts: 1 }, now),
          );
          assert.deepEqual(engine.actions(wrongState, c), []);
        }
        const predictedDamage = engine.damage(s, c, t.expectedAction),
          counter = engine.counter(s, c, t.expectedAction);
        engine.act(s, c, t.expectedAction);
        assert.equal(s.routeStep, step + 1);
        assert.equal(s.hp - before.hp, t.hpDelta);
        assert.equal(s.mana - before.mana, t.manaDelta);
        if (t.type === "combat") {
          assert.equal(predictedDamage, Math.abs(t.enemyHpDelta));
          assert.equal(counter, t.counterDamage);
          assert.equal(s.lastOutcome.actionDamage, predictedDamage);
          assert.equal(s.lastOutcome.counterDamage, counter);
        }
        const afterUi = serialize(view.payload(r, s, c, result, now));
        if (before.hp !== s.hp)
          assert.ok(afterUi.includes(before.hp + " → **" + s.hp + "**"));
        if (before.mana !== s.mana)
          assert.ok(afterUi.includes(before.mana + " → **" + s.mana + "**"));
        assert.ok(s.actionHistory.every((v) => /^[0-9a-f]{64}$/.test(v)));
      }
      assert.equal(s.status, "completed");
      assert.equal(s.hp, c.finalState.hp);
      assert.equal(s.mana, c.finalState.mana);
      runTo(r, c.stepCount, c);
      assert.equal(state(r).status, "completed");
    }
  } finally {
    Math.random = random;
  }

  const oldFailed = repo.byUser(
    "tower",
    "replay-after-week",
    "tower:2026:W41:sorceress:g3",
  );
  await pressReplay(oldFailed, catalog.get(oldFailed.challenge_id), {
    twice: true,
  });
  const weekRun = repo.byUser("tower", "replay-after-week", c.challengeId);
  assert.equal(state(weekRun).routeStep, 0);
  assert.equal(state(weekRun).challengeId, c.challengeId);
  const old = catalog.get("tower:2026:W41:sorceress:g3");
  const oldRow = repo.byUser("tower", "owner", old.challengeId),
    oldJson = oldRow.state_json;
  assert.throws(
    () => play(oldRow, old.transitions[state(oldRow).routeStep].expectedAction),
    /CHALLENGE_EXPIRED/,
  );
  assert.equal(repo.session(oldRow.id).state_json, oldJson);
  const newRow = start("owner");
  assert.notEqual(newRow.id, oldRow.id);
  assert.equal(repo.session(oldRow.id).state_json, oldJson);
  const legacy = catalog.get("tower-2026-W41-v1");
  assert.equal(legacy.publicationStatus, "archived");
  assert.throws(() => start("legacy", legacy), /CHALLENGE_NOT_PUBLISHED/);
  const cmd = require("../src/commands/choi");
  assert.ok(
    cmd.standaloneCommands.sinhton.data
      .toJSON()
      .options.some((x) => x.name === "thap"),
  );
  console.log(
    "Tower v3 runtime: all 7 class UIs and wrong branches, stale/duplicate/forged clicks, retries, persistence, rollback, one-time reward, v1 claim carryover, mode isolation, private tabs and rollover passed.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
