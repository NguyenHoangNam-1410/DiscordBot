"use strict";
const assert = require("node:assert/strict"),
  path = require("node:path");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
process.env.DB_PATH = path.join(__dirname, "../data/tower-memory.sqlite");
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const engine = require("../src/services/hardcoreTowerEngine"),
  catalog = require("../src/hardcore/towerChallenges"),
  repo = require("../src/services/hardcoreTowerRepository"),
  service = require("../src/services/hardcoreTowerService"),
  view = require("../src/services/hardcoreTowerView"),
  economy = require("../src/services/economyService"),
  diamonds = require("../src/services/playerLevelService");
const c = catalog.get("tower-2026-W41-v1"),
  now = Date.parse(c.startsAt) + 1000,
  end = Date.parse(c.endsAt);
let user = 0;
function start(userId = "u" + ++user) {
  return service.startTx({
    guildId: "t",
    userId,
    channelId: "c",
    challenge: c,
    now,
  });
}
function play(row, action, extra = {}) {
  const s = JSON.parse(repo.session(row.id).state_json);
  return service.actionTx({
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    channelId: row.channel_id,
    expectedTurn: s.turn,
    action,
    clock: () => now,
    ...extra,
  });
}
function runTo(row, n) {
  for (let i = 0; i < n; i++) play(row, c.canonicalSolution[i]);
}
function serialize(payload) {
  const embeds = payload.embeds.map((e) => e.toJSON()),
    components = payload.components.map((x) => x.toJSON());
  assert(
    embeds.reduce(
      (sum, e) =>
        sum +
        (e.title?.length || 0) +
        (e.description?.length || 0) +
        (e.footer?.text.length || 0) +
        (e.fields || []).reduce(
          (n, f) => n + f.name.length + f.value.length,
          0,
        ),
      0,
    ) < 6000,
  );
  for (const embed of embeds) {
    assert((embed.fields || []).length <= 25);
    for (const field of embed.fields || [])
      assert(field.value.length > 0 && field.value.length <= 1024);
  }
  assert(components.length <= 5);
  for (const row of components) {
    assert(row.components.length <= 5);
    for (const button of row.components) {
      assert(button.label.length <= 80);
      assert(button.custom_id.length <= 100);
      assert(button.emoji);
    }
  }
  return JSON.stringify({ embeds, components });
}
async function main() {
  const random = Math.random;
  Math.random = () => {
    throw Error("TOWER_RNG_USED");
  };
  try {
    const proof = engine.verify(c);
    assert.equal(proof.winningPaths.length, 1);
    assert.deepEqual(proof.winningPaths[0].actions, c.canonicalSolution);
    assert.deepEqual(
      [
        proof.winningPaths[0].state.floor,
        proof.winningPaths[0].state.hp,
        proof.winningPaths[0].state.mana,
        proof.winningPaths[0].state.cleared,
      ],
      [15, 14, 0, 15],
    );
    // Every reachable state, including failed branches, must render without changing the run.
    function verifyUi(state) {
      const before = JSON.stringify(state);
      const row = { id: "a".repeat(32), user_id: "1234567890123456789" };
      const result = {
        attempts: 1,
        best_floor: state.cleared,
        reward_claimed_at: null,
      };
      serialize(view.payload(row, state, c, result, now));
      for (const tab of ["stats", "effects", "encounter", "rules"])
        serialize(
          view.privatePayload(row, state, c, "1234567890123456789", tab),
        );
      assert.equal(JSON.stringify(state), before);
      if (state.status === "playing")
        for (const action of engine
          .actions(state, c)
          .filter((x) => !x.disabled)) {
          const next = structuredClone(state);
          engine.act(next, c, action.action);
          verifyUi(next);
        }
    }
    verifyUi(engine.createState(c));
    const expected = [
      [2, 100, 3],
      [3, 100, 1],
      [4, 100, 4],
      [5, 100, 2],
      [5, 80, 0],
      [6, 80, 3],
      [7, 100, 3],
      [8, 100, 5],
      [9, 100, 3],
      [9, 85, 4],
      [10, 85, 2],
      [11, 85, 2],
      [11, 70, 1],
      [12, 70, 0],
      [13, 70, 0],
      [14, 70, 4],
      [14, 50, 3],
      [15, 50, 2],
      [15, 40, 2],
      [15, 30, 3],
      [15, 22, 2],
      [15, 14, 1],
      [15, 14, 0],
    ];
    const state = engine.createState(c);
    for (let i = 0; i < c.canonicalSolution.length; i++) {
      const correct = c.canonicalSolution[i];
      for (const option of engine
        .actions(state, c)
        .filter((x) => !x.disabled && x.action !== correct)) {
        const wrong = structuredClone(state);
        engine.act(wrong, c, option.action); // Independently search every legal continuation of each wrong choice.
        let wins = 0;
        function visit(s) {
          if (s.status === "completed") {
            wins++;
            return;
          }
          if (s.status !== "playing") return;
          for (const a of engine.actions(s, c).filter((x) => !x.disabled)) {
            const n = structuredClone(s);
            engine.act(n, c, a.action);
            visit(n);
          }
        }
        visit(wrong);
        assert.equal(wins, 0, "wrong action " + i + ":" + option.action);
      }
      const cost = engine.costs(state, c),
        damage = engine.damage(state, c, correct),
        counter = engine.current(state, c).phase
          ? engine.counter(state, c, correct)
          : 0;
      const before = structuredClone(state);
      const ui = serialize(
        view.payload(
          { id: "test" },
          state,
          c,
          { attempts: 1, best_floor: state.floor, reward_claimed_at: null },
          now,
        ),
      );
      if (engine.current(state, c).encounter.type === "combat") {
        assert(
          ui.includes(
            "Arcane Burst: " + engine.damage(state, c, "skill") + " damage",
          ),
        );
        assert(
          ui.includes(
            "Tấn công: " + engine.damage(state, c, "attack") + " damage",
          ),
        );
      }
      engine.act(state, c, correct);
      assert.deepEqual([state.floor, state.hp, state.mana], expected[i]);
      if (engine.current(before, c).encounter.type === "combat") {
        assert.equal(state.lastOutcome.actionDamage, damage);
        assert.equal(
          state.lastOutcome.counterDamage,
          state.floor === before.floor && state.status !== "completed"
            ? counter
            : 0,
        );
        if (correct === "skill")
          assert.equal(before.mana - state.mana, cost.mana);
      }
      const afterUi = view
        .payload(
          { id: "test" },
          state,
          c,
          { attempts: 1, best_floor: state.cleared, reward_claimed_at: null },
          now,
        )
        .embeds[0].toJSON();
      const log = afterUi.fields.find(
        (x) => x.name === "📜 Lượt vừa rồi",
      ).value;
      if (before.hp !== state.hp)
        assert(log.includes(before.hp + " → **" + state.hp + "**"));
      if (before.mana !== state.mana)
        assert(log.includes(before.mana + " → **" + state.mana + "**"));
      if (i === 0) {
        assert(log.includes("**HP quái**: 12 → **0**"));
        assert(!log.includes("12 → **30**")); // The next enemy's HP is not the old enemy's result.
      }
      if (state.status === "completed") assert.equal(afterUi.color, 0x2ecc71);
      else if (state.hp <= state.maxHp * 0.3)
        assert.equal(afterUi.color, 0xe74c3c);
      else
        assert.equal(
          afterUi.color,
          engine.current(state, c).encounter.type === "combat"
            ? 0xe67e22
            : 0x3498db,
        );
      assert.equal(state.actionHistory.length, i + 1);
      assert(state.actionHistory.every((x) => /^[0-9a-f]{64}$/.test(x)));
    }
  } finally {
    Math.random = random;
  }
  assert.equal(catalog.active(Date.parse("2026-10-04T16:59:59.999Z")), null);
  assert.equal(catalog.active(Date.parse("2026-10-04T17:00:00Z")), c);
  assert.equal(catalog.active(end - 1), c);
  assert.equal(catalog.active(end), null);
  assert(catalog.readable(c, end + 86400000 - 1));
  assert(!catalog.readable(c, end + 86400000));
  const twoWeeks = { ...c, endsAt: "2026-10-19T00:00:00+07:00" };
  assert(catalog.playable(twoWeeks, end + 86400000));
  const row = start();
  const json = row.state_json;
  assert.equal(start(row.user_id).state_json, json);
  assert.equal(repo.result("t", row.user_id, c.challengeId).attempts, 1);
  repo.message(row.id, "m1");
  assert.throws(
    () => play(row, "attack", { userId: "other" }),
    /NOT_TOWER_OWNER/,
  );
  assert.throws(
    () => play(row, "attack", { guildId: "other" }),
    /NOT_TOWER_OWNER/,
  );
  assert.throws(
    () => play(row, "attack", { channelId: "other" }),
    /WRONG_CHANNEL/,
  );
  assert.throws(
    () => play(row, "attack", { messageId: "old" }),
    /STALE_ACTION/,
  );
  const args = {
    id: row.id,
    guildId: "t",
    userId: row.user_id,
    channelId: "c",
    messageId: "m1",
    expectedTurn: 0,
    action: "attack",
    clock: () => now,
  };
  const concurrent = await Promise.allSettled([
    service.withLock(row.id, () => service.actionTx(args)),
    service.withLock(row.id, () => service.actionTx(args)),
  ]);
  assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    concurrent.find((x) => x.status === "rejected").reason.message,
    "STALE_ACTION",
  );
  // Restart/reconnect reads exactly the committed state; no additional attempt or roll.
  const before = repo.session(row.id).state_json;
  delete require.cache[require.resolve("../src/services/hardcoreTowerService")];
  const restarted = require("../src/services/hardcoreTowerService");
  assert.equal(
    restarted.getRun("t", row.user_id, c.challengeId).session.state_json,
    before,
  );
  assert.deepEqual(
    restarted.getRun("t", row.user_id, c.challengeId).state,
    JSON.parse(before),
  );
  assert.equal(
    restarted.startTx({
      guildId: "t",
      userId: row.user_id,
      channelId: "c",
      challenge: c,
      now,
    }).state_json,
    before,
  );
  repo.message(row.id, "m2");
  assert.throws(
    () => service.actionTx({ ...args, expectedTurn: 1, action: "skill" }),
    /STALE_ACTION/,
  );
  assert.equal(repo.session(row.id).state_json, before);
  // A fault in either currency or final save rolls back the entire winning action.
  const reward = start();
  runTo(reward, c.canonicalSolution.length - 1);
  const pre = repo.session(reward.id).state_json;
  const coinsBefore = economy.getAccount("t", reward.user_id).balance;
  const gemsBefore = diamonds.getPlayerProgression(
    "t",
    reward.user_id,
  ).diamonds;
  for (const sql of [
    "CREATE TRIGGER fail_tower_save BEFORE UPDATE ON hardcore_tower_sessions BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END",
    "CREATE TRIGGER fail_tower_gems BEFORE UPDATE ON player_currencies BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END",
  ]) {
    db.exec(sql);
    assert.throws(() => play(reward, "skill"), /TEST_ROLLBACK/);
    assert.equal(repo.session(reward.id).state_json, pre);
    assert.equal(economy.getAccount("t", reward.user_id).balance, coinsBefore);
    assert.equal(
      diamonds.getPlayerProgression("t", reward.user_id).diamonds,
      gemsBefore,
    );
    assert.equal(
      repo.result("t", reward.user_id, c.challengeId).reward_claimed_at,
      null,
    );
    db.exec(
      "DROP TRIGGER " +
        (sql.includes("fail_tower_save")
          ? "fail_tower_save"
          : "fail_tower_gems"),
    );
  }
  // Expiry is checked again before settlement, even if the final action started earlier.
  let clockCalls = 0;
  assert.throws(
    () =>
      play(reward, "skill", {
        clock: () => (++clockCalls === 1 ? end - 1 : end),
      }),
    /CHALLENGE_EXPIRED/,
  );
  assert.equal(repo.session(reward.id).state_json, pre);
  const won = play(reward, "skill");
  assert.equal(won.state.status, "completed");
  assert.equal(
    economy.getAccount("t", reward.user_id).balance,
    coinsBefore + c.reward.coins,
  );
  assert.equal(
    diamonds.getPlayerProgression("t", reward.user_id).diamonds,
    gemsBefore + c.reward.diamonds,
  );
  assert.equal(won.result.solution_hash, engine.solutionHash(c));
  assert(
    !repo
      .session(reward.id)
      .state_json.includes(JSON.stringify(c.canonicalSolution)),
  );
  assert.throws(
    () => play(reward, "skill", { expectedTurn: JSON.parse(pre).turn }),
    /STALE_ACTION/,
  );
  play(reward, "replay");
  runTo(reward, c.canonicalSolution.length);
  assert.equal(repo.result("t", reward.user_id, c.challengeId).attempts, 2);
  assert.equal(
    economy.getAccount("t", reward.user_id).balance,
    coinsBefore + c.reward.coins,
  );
  assert.equal(
    diamonds.getPlayerProgression("t", reward.user_id).diamonds,
    gemsBefore + c.reward.diamonds,
  );
  assert.equal(
    JSON.parse(repo.session(reward.id).state_json).rewardGranted,
    false,
  );
  const expired = start();
  const expiredJson = expired.state_json;
  assert.throws(
    () => play(expired, "attack", { clock: () => end }),
    /CHALLENGE_EXPIRED/,
  );
  assert.equal(repo.session(expired.id).state_json, expiredJson);
  const locked = view.payload(
    expired,
    JSON.parse(expiredJson),
    c,
    repo.result("t", expired.user_id, c.challengeId),
    end,
  );
  assert(
    locked.components[0]
      .toJSON()
      .components.filter((x) => !x.custom_id.endsWith(":top"))
      .every((x) => x.disabled),
  );
  // Another week's session never overwrites the old one; no weekly content is invented.
  const future = {
    ...c,
    challengeId: "tower-test-next-week",
    startsAt: c.endsAt,
    endsAt: "2026-10-19T00:00:00+07:00",
  };
  const futureRow = service.startTx({
    guildId: "t",
    userId: expired.user_id,
    channelId: "c",
    challenge: future,
    now: end + 1,
  });
  assert.notEqual(futureRow.id, expired.id);
  assert.equal(repo.session(expired.id).state_json, expiredJson);
  delete process.env.HARDCORE_GAMEPLAY_VERSION;
  const survival = require("../src/services/hardcoreService").startHardcore({
    guildId: "t",
    userId: expired.user_id,
    channelId: "c",
    stake: 10,
    classKey: "barbarian",
    forcedEncounter: { type: "empty" },
  });
  const original999 = db
    .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
    .get(survival.session.id).state_json;
  assert(repo.session(expired.id));
  play(expired, "attack");
  assert.equal(
    db
      .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
      .get(survival.session.id).state_json,
    original999,
  );
  // Opening the command relocates the real message, preserves history and invalidates the old UI.
  const { setGameChannel } = require("../src/services/gameChannelService");
  setGameChannel("t", "hardcore", "c");
  const originalClock = Date.now;
  Date.now = () => now;
  let sent,
    oldLocked = false;
  const commandRow = start("resume");
  repo.message(commandRow.id, "old-ui");
  const mock = {
    guildId: "t",
    channelId: "c",
    user: { id: "resume" },
    deferReply: async () => {},
    editReply: async (x) => x,
    channel: {
      send: async (p) => {
        sent = p;
        return { id: "new-ui", url: "https://discord.com/channels/t/c/new-ui" };
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
  try {
    await service.openTower(mock);
    assert(sent);
    assert(oldLocked);
    assert.equal(repo.session(commandRow.id).message_id, "new-ui");
    assert.equal(repo.session(commandRow.id).state_json, commandRow.state_json);
    // Opening and navigating ephemeral details cannot consume a turn, attempt, currency or reward.
    let detailReply,
      detailFlags,
      detailUpdates = 0;
    const panel = {
      guildId: "t",
      channelId: "c",
      user: { id: "resume" },
      message: { id: "new-ui" },
      deferReply: async (p) => {
        detailFlags = p.flags;
      },
      deferUpdate: async () => {
        detailUpdates++;
      },
      editReply: async (p) => {
        detailReply = p;
        return p;
      },
      followUp: async () => {
        throw Error("DETAIL_MUST_BE_PRIVATE");
      },
      reply: async (p) => {
        detailReply = p;
      },
    };
    const originalResult = JSON.stringify(
      repo.result("t", "resume", c.challengeId),
    );
    const originalCoins = economy.getAccount("t", "resume").balance;
    for (const tab of ["stats", "effects", "encounter", "rules"]) {
      await service.handleTowerButton({
        ...panel,
        customId: "hardcore-tower:" + commandRow.id + ":0:view_" + tab,
      });
      assert.equal(detailFlags, 64);
      serialize(detailReply);
      assert(
        detailReply.components[0]
          .toJSON()
          .components.every((x) => x.custom_id.endsWith(":new-ui")),
      );
      assert.equal(
        repo.session(commandRow.id).state_json,
        commandRow.state_json,
      );
      assert.equal(
        JSON.stringify(repo.result("t", "resume", c.challengeId)),
        originalResult,
      );
      assert.equal(economy.getAccount("t", "resume").balance, originalCoins);
    }
    const navigate = {
      ...panel,
      message: { id: "private-ui" },
      customId: "hardcore-tower:" + commandRow.id + ":0:view_rules:new-ui",
    };
    await service.handleTowerButton(navigate);
    assert.equal(detailUpdates, 1);
    assert(serialize(detailReply).includes("Luật chơi"));
    await service.handleTowerButton({ ...navigate, user: { id: "other" } });
    assert.equal(detailReply.flags, 64);
    assert(detailReply.content.includes("người chơi khác"));
    await service.handleTowerButton({ ...navigate, channelId: "wrong" });
    assert(detailReply.content.includes("kênh"));
    assert.deepEqual(detailReply.components, []);
    await service.handleTowerButton({
      ...navigate,
      customId: "hardcore-tower:" + commandRow.id + ":0:view_stats:old-ui",
    });
    assert(detailReply.content.includes("đã cũ"));
    assert.equal(repo.session(commandRow.id).state_json, commandRow.state_json);
    const followups = [];
    const button = {
      guildId: "t",
      channelId: "c",
      user: { id: "resume" },
      customId: "hardcore-tower:" + commandRow.id + ":0:attack",
      message: { id: "new-ui" },
      deferUpdate: async () => {},
      editReply: async () => {
        throw Error("SIMULATED_RESPONSE_TIMEOUT");
      },
      followUp: async (p) => followups.push(p),
    };
    await service.handleTowerButton(button, { error: () => {} });
    assert.equal(JSON.parse(repo.session(commandRow.id).state_json).turn, 1);
    await service.handleTowerButton(button, { error: () => {} });
    assert.equal(JSON.parse(repo.session(commandRow.id).state_json).turn, 1);
    assert(followups.some((x) => x.content.includes("đã cũ")));
    const racing = {
      ...button,
      customId: "hardcore-tower:" + commandRow.id + ":1:skill",
      editReply: async () => {},
    };
    await Promise.all([
      service.handleTowerButton(racing),
      service.handleTowerButton(racing),
    ]);
    assert.equal(JSON.parse(repo.session(commandRow.id).state_json).turn, 2);
    assert.equal(JSON.parse(repo.session(commandRow.id).state_json).mana, 1);
    const routed = {
      ...racing,
      customId: "hardcore-tower:" + commandRow.id + ":2:attack",
      isButton: () => true,
      isStringSelectMenu: () => false,
      isModalSubmit: () => false,
    };
    assert.equal(
      await require("../src/componentRouter").routeComponentInteraction(routed),
      true,
    );
    assert.equal(JSON.parse(repo.session(commandRow.id).state_json).turn, 3);
    // Like V2, old private tabs read the latest committed turn while their source board is still current.
    const currentJson = repo.session(commandRow.id).state_json;
    await service.handleTowerButton(navigate);
    assert(detailReply.embeds[0].toJSON().footer.text.includes("Lượt 3"));
    assert.equal(repo.session(commandRow.id).state_json, currentJson);
    Date.now = () => end;
    await service.handleTowerButton(navigate);
    serialize(detailReply);
    assert.equal(repo.session(commandRow.id).state_json, currentJson);
    Date.now = () => end + 86400000;
    await service.handleTowerButton(navigate);
    assert(detailReply.content.includes("hết hạn"));
    assert.deepEqual(detailReply.components, []);
    assert.equal(repo.session(commandRow.id).state_json, currentJson);
    Date.now = () => now;
    repo.message(commandRow.id, "relocated-ui");
    await service.handleTowerButton(navigate);
    assert(detailReply.content.includes("đã cũ"));
    assert.equal(repo.session(commandRow.id).state_json, currentJson);
  } finally {
    Date.now = originalClock;
  }
  const cmd = require("../src/commands/choi");
  assert(
    cmd.data
      .toJSON()
      .options.find((x) => x.name === "sinhton")
      .options.some((x) => x.name === "thap"),
  );
  assert(
    cmd.standaloneCommands.sinhton.data
      .toJSON()
      .options.some((x) => x.name === "thap"),
  );
  // Stable ranking is based on attempts/completion, independent of network duration.
  for (const id of ["rank-b", "rank-a", "rank-early"]) {
    const ranked = start(id);
    runTo(ranked, c.canonicalSolution.length - 1);
    play(ranked, "skill", {
      clock: () => (id === "rank-early" ? now - 1 : now),
    });
  }
  assert.deepEqual(
    repo
      .top("t", c.challengeId)
      .slice(0, 3)
      .map((x) => x.user_id),
    ["rank-early", "rank-a", "rank-b"],
  );
  const top = repo.top("t", c.challengeId);
  assert(top[0].completed_at != null);
  assert(top.find((x) => x.user_id === reward.user_id).completed_at != null);
  console.log(
    "Tower week 1: unique solution (201 states), wrong branches, V2 UI conventions, private read-only tabs, exact UI damage, persistence, concurrent clicks, rollback, one-time reward, expiry, relocation and mode isolation passed.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
