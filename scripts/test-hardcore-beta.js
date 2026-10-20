"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const svc = require("../src/hardcore"),
  core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  repo = require("../src/hardcore/storage/sessions"),
  beta = require("../src/hardcore/beta"),
  kit = require("../src/hardcore/characters/rhakor"),
  god = require("../src/hardcore/events/godRngesus"),
  echoes = require("../src/hardcore/storage/echoes"),
  relicRecords = require("../src/hardcore/storage/relicRecords"),
  command = require("../src/hardcore/command");
const { setGameChannel } = require("../src/services/gameChannelService");
const rng = () => 0.5;
let groups = 0;
async function test(name, fn) {
  await fn();
  groups++;
  console.log("PASS " + name);
}
function start(user = "tester", extra = {}) {
  return svc.startHardcore({
    guildId: "beta-g",
    userId: user,
    channelId: "c",
    beta: true,
    forcedEncounter: { type: "empty", name: "Fixture" },
    ...extra,
  });
}
function current(run) {
  return svc.getHardcoreRun(run.session.guild_id, run.session.user_id);
}
function play(run, action, extra = {}) {
  return svc.playHardcore({
    sessionId: run.session.id,
    userId: run.session.user_id,
    expectedTurn: current(run).state.turn,
    action,
    ...extra,
  });
}
function persist(run, s) {
  repo.saveState(run.session, s);
  return s;
}
// Replay/session history is operational data; every economy, achievement and reward table remains checked.
function ledger() {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('hardcore_sessions','hardcore_replays','hardcore_replay_frames') ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        db
          .prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          .all()
          .map((r) => JSON.stringify(r))
          .sort(),
      ]),
  );
}
function fight(run) {
  const s = current(run).state;
  Object.assign(s, { floor: 6, cleared: 5, phase: "encounter" });
  s.encounter = {
    type: "combat",
    name: "Lethal fixture",
    rank: "normal",
    hp: 100000,
    maxHp: 100000,
    damageMin: 1000000,
    damageMax: 1000000,
    defense: 0,
    resistance: 0,
    evasion: 0,
    accuracy: 100000,
    critChance: 0,
    damageType: "magic",
    nextDamageType: "magic",
    combatTurn: 1,
  };
  s.hp = s.maxHp;
  s.mana = s.maxMana;
  core.prepareItemCombat(s, rng);
  return persist(run, s);
}
function controls(run, state = current(run).state, done = false) {
  return svc
    .hardcoreRows(run.session.id, state, done)
    .flatMap((r) => r.toJSON().components);
}
function bounds(p) {
  for (const embed of p.embeds || []) {
    const e = embed.toJSON();
    assert(embed.length <= 6000);
    assert((e.fields || []).length <= 25);
    assert((e.fields || []).every((f) => f.value.length <= 1024));
  }
  assert((p.components || []).length <= 5);
  assert(!/undefined|NaN/.test(JSON.stringify(p)));
}
async function main() {
  await test("Beta forces Rha-Kor SSR S0 and 100k without account, ownership, inventory or wager debit", () => {
    const before = ledger(),
      run = start("fresh", {
        classKey: "barbarian",
        stake: 10,
        loadout: { itemIds: ["cracked_wand"], ticketIds: ["survival_revive"] },
      });
    assert.equal(run.state.classKey, "rha_kor");
    assert.equal(run.state.stake, 100000);
    assert.equal(run.state.characterSoul.soulLevel, 0);
    assert.equal(run.account, null);
    assert(beta.is(run.state));
    assert.equal(run.state.items.length, 0);
    assert.equal(run.state.reviveTickets, 0);
    assert.deepEqual(ledger(), before);
    assert.equal(
      require("../src/hardcore/characters").ownedCharacters("fresh").rha_kor,
      undefined,
    );
    const p = {
      embeds: [svc.hardcoreEmbed(run.state, "fresh")],
      components: svc.hardcoreRows(run.session.id, run.state),
    };
    bounds(p);
    assert(p.embeds[0].data.title.includes("BETA"));
    assert(!JSON.stringify(p).includes('"retreat"'));
    assert(controls(run).some((c) => c.custom_id.endsWith(":beta_end")));
    repo.deleteSession(run.session.id);
  });
  await test("Beta cho chọn tinh hồn khởi điểm S0–S6 mà không cần sở hữu nhân vật", () => {
    for (const level of [0, 3, 6]) {
      const run = start("soul" + level, { soulLevel: level });
      assert.equal(run.state.characterSoul.soulLevel, level);
      assert.equal(run.state.characterSoul.characterId, "rha_kor");
      assert.equal(
        require("../src/hardcore/characters/rhakor").config(run.state).phan,
        level >= 3 ? 2.8 : 2.5,
      );
      assert.equal(run.state.characterSoul.bossMultiplier, level === 6 ? 1 : 1);
      repo.deleteSession(run.session.id);
    }
    for (const bad of [-1, 7, 1.5, "3"])
      assert.throws(() => start("soulbad", { soulLevel: bad }), /INVALID_CHARACTER_SOUL/);
    assert.equal(svc.getHardcoreRun("beta-g", "soulbad"), null);
  });
  await test("Combat death stays saved, gates other actions, revives 100% HP without MP/timer reset or second counter", () => {
    const before = ledger(),
      run = start();
    fight(run);
    const played = play(run, "skill");
    assert(!played.settled);
    assert.equal(played.state.hp, 0);
    assert(played.state.beta.awaitingRevive);
    assert.equal(kit.peek(played.state).law.window, 1);
    const dead = current(run).state,
      mana = dead.mana,
      turn = dead.encounter.combatTurn,
      enemyHP = dead.encounter.hp;
    assert(controls(run).some((c) => c.custom_id.endsWith(":beta_revive")));
    const frozen = repo.getSession(run.session.id).state_json;
    assert.throws(() => play(run, "attack"), /INVALID_ACTION/);
    assert.equal(repo.getSession(run.session.id).state_json, frozen);
    const revived = play(run, "beta_revive").state;
    assert.equal(revived.hp, revived.maxHp);
    assert.equal(revived.mana, mana);
    assert.equal(kit.peek(revived).law.window, 1);
    assert.equal(revived.encounter.combatTurn, turn);
    assert.equal(revived.encounter.hp, enemyHP);
    assert.equal(revived.beta.revivals, 1);
    assert.equal(revived.beta.deaths, 1);
    assert(!revived.beta.awaitingRevive);
    assert.deepEqual(ledger(), before);
    const after = repo.getSession(run.session.id).state_json;
    assert.throws(
      () => play(run, "beta_revive", { expectedTurn: dead.turn }),
      /STALE/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, after);
    assert.throws(() => play(run, "beta_revive"), /INVALID_ACTION/);
    assert.throws(
      () => play(run, "beta_end", { userId: "stranger" }),
      /INVALID_SESSION/,
    );
    play(run, "beta_end");
    assert.deepEqual(ledger(), before);
  });
  await test("RNGesus death offers manual full revive, moves past the lethal event and changes no favor records", () => {
    const before = ledger(),
      run = start("rng");
    const s = current(run).state;
    s.encounter = {
      type: "rngesus",
      name: "RNGesus",
      fleeChance: 1,
      fleeSuccess: true,
      prayerChance: 0.3,
    };
    persist(run, s);
    const dead = play(run, "fight");
    assert(!dead.settled);
    assert.equal(dead.state.hp, 0);
    assert.equal(dead.state.beta.rngesusDeaths, 1);
    const revive = play(run, "beta_revive");
    assert.equal(revive.state.hp, revive.state.maxHp);
    assert.equal(revive.state.floor, 2);
    assert.deepEqual(ledger(), before);
    play(run, "beta_end");
  });
  await test("Diamond Merchant spends only run gems, including rollback and insufficient-wallet controls", () => {
    const before = ledger(),
      run = start("shop");
    const s = current(run).state;
    Object.assign(s, { floor: 101, cleared: 100 });
    s.encounter = core.makeSurprise(s, rng, "diamond_shop");
    s.encounter.offers[0].price = 40;
    s.encounter.offers[1].price = 200;
    persist(run, s);
    assert.equal(beta.diamonds(s), 100);
    assert(core.actions(s).find((a) => a.action === "buy_1").disabled);
    const saved = repo.getSession(run.session.id).state_json;
    assert.throws(
      () => play(run, "buy_1"),
      /INVALID_ACTION|INSUFFICIENT_DIAMONDS/,
    );
    assert.equal(repo.getSession(run.session.id).state_json, saved);
    const bought = play(run, "buy_0").state;
    assert.equal(bought.beta.spentDiamonds, 40);
    assert.equal(beta.diamonds(bought), 60);
    assert(bought.items.length);
    assert.deepEqual(ledger(), before);
    play(run, "beta_end");
    assert.deepEqual(ledger(), before);
  });
  await test("Relics/God blessings are simulated; no shared grave lease, death archive or event achievements", () => {
    const before = ledger(),
      run = start("blessing"),
      s = current(run).state;
    s.floor = 151;
    s.cleared = 150;
    assert.equal(
      relicRecords.record(run.session, s, "gilded_soul", 151),
      false,
    );
    assert.equal(echoes.claim(run.session, s), null);
    echoes.onDeath(run.session, s);
    echoes.archive(run.session, s, "summit", 9999999, 99999);
    const encounter = god.tryEncounter(s, run.session, () => 0);
    assert.equal(encounter.type, "god_rngesus");
    assert(s.relics.some((r) => r.id === "fatebreaker_seal"));
    s.encounter = encounter;
    persist(run, s);
    assert(god.claimReveal(run.session.id, s.floor, Date.now(), s));
    assert(!god.claimReveal(run.session.id, s.floor, Date.now(), s));
    assert.deepEqual(ledger(), before);
    play(run, "beta_end");
    assert.deepEqual(ledger(), before);
  });
  await test("Progress, summit, simulated cashout, admin refund and timeout grant no coins/gems/XP/frames/achievements", () => {
    const before = ledger();
    for (const reason of ["summit", "cashout", "end", "refund", "timeout"]) {
      const run = start("exit-" + reason),
        s = current(run).state;
      Object.assign(s, {
        floor: 999,
        cleared: 999,
        completed: true,
        finalBossDefeated: true,
        bonus: 5000000,
      });
      s.encounter = { type: "empty", name: "Fixture" };
      if (reason === "summit") s.phase = "summit";
      persist(run, s);
      const record = svc.getHardcoreRecord("beta-g", run.session.user_id);
      assert.equal(record.best_floor, 0);
      assert.equal(record.runs, 0);
      if (reason === "refund")
        assert.equal(
          svc.forceEndHardcoreSession(run.session.id, "beta-g", "admin")
            .forfeited,
          0,
        );
      else if (reason === "timeout") {
        db.prepare("UPDATE hardcore_sessions SET updated_at=0 WHERE id=?").run(
          run.session.id,
        );
        svc.cleanupStaleHardcoreSessions(Date.now());
      } else {
        const result = play(run, reason === "end" ? "beta_end" : "retreat");
        assert(result.settled);
        assert.equal(result.result.payout, 0);
        assert.equal(result.result.diamonds, 0);
        assert.deepEqual(result.result.achievements, []);
        assert.equal(result.result.experienceGained, 0);
        assert.equal(controls(run, result.state, true).length, 0);
        bounds({
          embeds: [
            svc.hardcoreEmbed(result.state, run.session.user_id, result.result),
          ],
          components: [],
        });
      }
      assert(!repo.getSession(run.session.id));
      assert.deepEqual(ledger(), before);
    }
  });
  await test("Normal runs cannot forge beta revive/end, and corrupt beta markers reject before mutations", () => {
    const s = stats.createState("amazon", 10000);
    s.encounter = { type: "empty" };
    assert.throws(
      () => core.act(s, { id: "normal" }, "beta_revive", rng),
      /INVALID_ACTION/,
    );
    assert.throws(
      () => core.act(s, { id: "normal" }, "beta_end", rng),
      /INVALID_ACTION/,
    );
    const run = start("corrupt"),
      bad = current(run).state;
    bad.beta.version = 99;
    persist(run, bad);
    assert.throws(
      () => svc.getHardcoreRun("beta-g", "corrupt"),
      /INVALID_BETA_STATE/,
    );
    repo.deleteSession(run.session.id);
  });
  await test("Real /sinhton beta command resumes one session and real button routes enforce owner/message/stale guards", async () => {
    setGameChannel("beta-g", "hardcore", "c");
    const before = ledger();
    let counter = 0;
    const sent = [],
      edited = [];
    const channel = {
      send: async (p) => {
        bounds(p);
        sent.push(p);
        return { id: "public-" + ++counter, edit: async (p) => edited.push(p) };
      },
      messages: { fetch: async () => ({ edit: async (p) => edited.push(p) }) },
    };
    const i = {
      guildId: "beta-g",
      channelId: "c",
      user: { id: "command", username: "Tester" },
      options: { getSubcommand: () => "beta" },
      channel,
      deferReply: async () => {},
      editReply: async (p) => edited.push(p),
      reply: async (p) => edited.push(p),
    };
    await command.execute(i);
    let run = svc.getHardcoreRun("beta-g", "command");
    assert(beta.is(run.state));
    const id = run.session.id;
    await command.execute(i);
    run = svc.getHardcoreRun("beta-g", "command");
    assert.equal(run.session.id, id);
    assert.equal(sent.length, 2);
    assert.equal(run.session.message_id, "public-2");
    assert.deepEqual(ledger(), before);
    fight(run);
    const dead = play(run, "skill").state;
    let updates = 0,
      replies = [];
    const click = {
      customId: "hardcore:" + id + ":" + dead.turn + ":beta_revive",
      guildId: "beta-g",
      channelId: "c",
      user: { id: "command" },
      message: { id: "public-2" },
      isButton: () => true,
      isStringSelectMenu: () => false,
      deferUpdate: async () => {},
      editReply: async (p) => {
        bounds(p);
        updates++;
      },
      followUp: async (p) => replies.push(p),
    };
    const route = require("../src/componentRouter").routeComponentInteraction;
    const logger = { error: () => {}, warn: () => {}, debug: () => {} };
    await route({ ...click, user: { id: "stranger" } }, logger);
    assert(current(run).state.beta.awaitingRevive);
    await route({ ...click, message: { id: "public-1" } }, logger);
    assert(current(run).state.beta.awaitingRevive);
    await route(click, logger);
    assert.equal(current(run).state.hp, current(run).state.maxHp);
    assert.equal(updates, 1);
    const persisted = repo.getSession(id).state_json;
    await route(click, logger);
    assert.equal(repo.getSession(id).state_json, persisted);
    assert.deepEqual(ledger(), before);
    play(run, "beta_end");
    assert.deepEqual(ledger(), before);
    const slash = require("../src/commandRegistry")
      .loadCommands("./commands")
      .find((c) => c.data.toJSON().name === "sinhton")
      .data.toJSON();
    assert(slash.options.some((o) => o.name === "beta"));
  });

  await test("Failed first publication cannot refund fake stake; existing real runs are protected", async () => {
    const before = ledger();
    const i = {
      guildId: "beta-g",
      channelId: "c",
      user: { id: "publish-fail" },
      options: { getSubcommand: () => "beta" },
      deferReply: async () => {},
      editReply: async () => {},
      channel: {
        send: async () => {
          throw Error("SEND_FAILED");
        },
      },
    };
    await assert.rejects(() => command.execute(i), /SEND_FAILED/);
    assert(!svc.getHardcoreRun("beta-g", "publish-fail"));
    assert.deepEqual(ledger(), before);
    db.prepare(
      "INSERT INTO economy_accounts(guild_id,user_id,balance,created_at,updated_at) VALUES('beta-g','real-run',1000000,0,0)",
    ).run();
    const real = svc.startHardcore({
        guildId: "beta-g",
        userId: "real-run",
        channelId: "c",
        classKey: "amazon",
        stake: 10000,
        forcedEncounter: { type: "empty" },
      }),
      expected = repo.getSession(real.session.id).state_json,
      ledgerBefore = ledger();
    let reply = "";
    await command.execute({
      ...i,
      user: { id: "real-run" },
      editReply: async (p) => {
        reply = p.content;
      },
    });
    assert(reply.includes("run Sinh tồn thật"));
    assert.equal(repo.getSession(real.session.id).state_json, expected);
    assert.deepEqual(ledger(), ledgerBefore);
    repo.deleteSession(real.session.id);
  });
  await test("All boss beta panels fit Discord; revive can recover a failed Inarius objective", () => {
    const before = ledger(),
      run = start("boss-ui"),
      catalog = require("../src/hardcore/bosses/catalogV2").CATALOG,
      world = require("../src/hardcore/engine/world");
    for (const [id, definition] of Object.entries(catalog)) {
      const s = current(run).state;
      s.floor = id === "deimoss" ? 999 : id === "kabraxis" ? 666 : 150;
      s.cleared = s.floor - 1;
      s.encounter = world.makeEnemy(s, "boss", null, rng, definition);
      core.prepareItemCombat(s, rng);
      bounds({
        embeds: [svc.hardcoreEmbed(s, "boss-ui")],
        components: svc.hardcoreRows(run.session.id, s),
      });
    }
    const s = current(run).state;
    s.floor = 150;
    s.cleared = 149;
    s.encounter = world.makeEnemy(s, "boss", null, rng, catalog.inarius);
    s.encounter.boss.mechanicState.lilithHp = 0;
    beta.markDeath(s, "death");
    persist(run, s);
    const revived = play(run, "beta_revive").state;
    assert.equal(revived.hp, revived.maxHp);
    assert.equal(revived.encounter.boss.mechanicState.lilithHp, 50);
    assert.deepEqual(ledger(), before);
    play(run, "beta_end");
  });
  console.log(
    groups +
      " beta groups passed; real account tables unchanged; no simulation.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
