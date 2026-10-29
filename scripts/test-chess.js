const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const { Chess } = require("chess.js");
const { db } = require("../src/db");
const engine = require("../src/chess/engine");
const {
  decodePuzzle,
  loadPuzzle,
  requestPuzzle,
} = require("../src/chess/puzzle");
const service = require("../src/services/chessService");
const channels = require("../src/services/gameChannelService");
const rewards = require("../src/services/gameRewardService");
const { getAccount } = require("../src/services/economyService");
const {
  getAchievements,
  claimAchievements,
} = require("../src/services/achievementService");
const { boardImage, roundPayload } = require("../src/chess/view");
const command = require("../src/commands/covua");

const G = "123456789012345678",
  C = "223456789012345678",
  U = "323456789012345678";
const liveFixture = {
  game: {
    pgn: "d4 d5 c4 Bf5 cxd5 Bxb1 Rxb1 Qxd5 e3 Nf6 Nf3 e6 Qa4+ c6 Bc4 Qd7 Ne5 Qc7 b4 b5 Bxb5 cxb5 Qxb5+ Nbd7 Ba3 Rb8 Qa4 a5 O-O Be7 Rfc1 Qd8 Nc6 Rxb4 Nxd8 Rxa4 Bxe7 Kxe7 Nc6+ Kd6 Ne5 Nxe5 dxe5+ Kxe5 f4+ Ke4 Rc5 Kxe3 Re5+ Kxf4 Rbe1 Rd8 g3+ Kg4 Kg2 Rxa2+ Kh1 Nd7",
  },
  puzzle: {
    id: "atRIv",
    rating: 1541,
    solution: ["e1e4", "g4f3", "e4f4"],
    themes: ["short", "endgame", "mateIn2"],
    initialPly: 57,
  },
};
const mate2 = decodePuzzle(liveFixture, 2);
const mate1 = engine.validatePuzzle({
  id: "one01",
  fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
  solution: ["f7f8"],
  rating: 1000,
});
let serial = 0;
const fixture = (puzzle = mate1) => ({ ...puzzle, id: `test${++serial}` });
const begin = (channelId = C, options = {}) =>
  service.startRound({
    guildId: G,
    channelId,
    userId: U,
    puzzleLoader: async () => fixture(),
    ...options,
  });
const solve = (round, userId = U, text = "Qf8#") =>
  service.solveRound({
    guildId: G,
    channelId: round.channel_id,
    userId,
    messageId: `message${serial}`,
    text,
  });

async function run() {
  // PGN reconstruction includes the triggering opponent move, never the first solving move.
  const full = new Chess();
  full.loadPgn(liveFixture.game.pgn);
  assert.equal(mate2.fen, full.fen());
  assert.equal(mate2.side, "w");
  assert.equal(mate2.mate, 2);
  assert.deepEqual(
    engine.checkAnswer(mate2, "e1e4 e4f4").line,
    liveFixture.puzzle.solution,
  );
  assert.deepEqual(engine.checkAnswer(mate2, "R1e4+ Rf4#").playerMoves, [
    "e1e4",
    "e4f4",
  ]);
  assert.ok(engine.checkAnswer(mate2, "1. R1e4+ 2. Rf4#"));
  assert.ok(engine.checkAnswer(mate2, "`e1e4, Rf4#`"));
  for (const wrong of [
    "e1e4",
    "R1e4# Rf4#",
    "e1e4 g4f3 e4f4",
    "Re3 Rf4#",
    "R1e4+ Rf4# hello",
    "a".repeat(201),
  ])
    assert.equal(engine.checkAnswer(mate2, wrong), null, wrong);
  assert.ok(engine.checkAnswer(mate1, "f7f8"));
  assert.ok(engine.checkAnswer(mate1, "Qg7#"), "another mating move must win");
  assert.equal(
    engine.checkAnswer(mate1, "Qf8+"),
    null,
    "incorrect SAN check marker",
  );
  assert.equal(engine.checkAnswer(mate1, "Qf6"), null);
  assert.throws(() => decodePuzzle(liveFixture, 1));
  assert.throws(() =>
    decodePuzzle(
      { ...liveFixture, puzzle: { ...liveFixture.puzzle, initialPly: 999 } },
      2,
    ),
  );
  assert.throws(
    () => engine.validatePuzzle({ fen: new Chess().fen(), solution: ["e2e4"] }),
    /NOT_MATE/,
  );
  const ambiguous = new Chess("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
  assert.throws(() => engine.playInput(ambiguous, "Nd2"));
  assert.equal(engine.uci(engine.playInput(ambiguous, "Nbd2")), "b1d2");
  const castle = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(engine.uci(engine.playInput(castle, "0-0")), "e1g1");
  const promotion = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  assert.equal(engine.uci(engine.playInput(promotion, "a8=Q+")), "a7a8q");

  channels.addGameChannel(G, "covua", C);
  await assert.rejects(begin("wrongChannel"), /CHANNEL_REQUIRED/);
  channels.setGameMaintenance(G, "covua", true, U);
  await assert.rejects(begin(), /MAINTENANCE/);
  channels.setGameMaintenance(G, "covua", false, U);
  rewards.setGameReward(G, "covua", 100);
  for (const bad of [0, -1, 40_001, 1.5])
    assert.throws(() => rewards.setGameReward(G, "covua", bad));

  const first = await begin();
  assert.equal(first.round.reward, 100);
  assert.equal(first.round.expires_at - first.round.created_at, service.TTL);
  assert.equal((await begin()).existing.id, first.round.id);
  // The DB uniqueness constraint remains the authority even with multiple bot processes.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO chess_rounds SELECT 'duplicate',guild_id,channel_id,created_by,'otherid',puzzle_json,mate,reward,status,message_id,ui_closed,created_at,expires_at,closed_at,winner_id,answer_message_id,answer_uci FROM chess_rounds WHERE id=?`,
        )
        .run(first.round.id),
    /UNIQUE/,
  );
  assert.equal(solve(first.round, U, "Qf6"), null);
  const before = getAccount(G, U).balance;
  const won = solve(first.round);
  assert.equal(won.round.status, "won");
  assert.equal(getAccount(G, U).balance, before + 100);
  assert.equal(solve(first.round), null, "redelivery must not pay again");
  assert.equal(solve(first.round, "otherUser"), null, "only first winner");
  assert.equal(service.currentRound(G, C), null, "do not create next puzzle");
  assert.equal(
    db
      .prepare(
        "SELECT solved FROM chess_records WHERE guild_id=? AND user_id=?",
      )
      .get(G, U).solved,
    1,
  );
  assert.ok(
    getAchievements(G, U).find((item) => item.id === "chess_solved_1").complete,
  );
  assert.ok(
    claimAchievements(G, U).some((item) => item.id === "chess_solved_1"),
  );
  assert.equal(
    claimAchievements(G, U).length,
    0,
    "achievement claims are idempotent",
  );

  const snap = await begin(C, { puzzleLoader: async () => fixture(mate2) });
  assert.equal(snap.round.reward, 400);
  rewards.setGameReward(G, "covua", 200);
  assert.equal(
    service.currentRound(G, C).reward,
    400,
    "existing reward is frozen",
  );
  const before2 = getAccount(G, U).balance;
  assert.ok(solve(snap.round, U, "R1e4+ Rf4#"));
  assert.equal(getAccount(G, U).balance, before2 + 400);

  const old = await begin();
  await assert.rejects(
    begin(C, {
      replace: true,
      puzzleLoader: async () => {
        throw new Error("LICHESS_UNAVAILABLE");
      },
    }),
    /UNAVAILABLE/,
  );
  assert.equal(
    service.currentRound(G, C).id,
    old.round.id,
    "API failure preserves old board",
  );
  const replacement = await begin(C, { replace: true });
  assert.equal(replacement.previous.id, old.round.id);
  assert.equal(
    db.prepare("SELECT status FROM chess_rounds WHERE id=?").get(old.round.id)
      .status,
    "skipped",
  );
  service.publicationFailed(replacement);
  assert.equal(
    service.currentRound(G, C).id,
    old.round.id,
    "upload failure restores old board",
  );
  assert.equal(
    service.latestRound(G, C).id,
    old.round.id,
    "view must show restored open board after upload failure",
  );
  // Skip fetch racing with a valid answer must not silently start another board.
  await assert.rejects(
    begin(C, {
      replace: true,
      puzzleLoader: async () => {
        solve(old.round);
        return fixture();
      },
    }),
    /CHANGED/,
  );
  assert.equal(service.currentRound(G, C), null);

  // A failed wallet/progression operation rolls back the win and achievement counters too.
  const atomic = await begin();
  db.exec(
    "CREATE TRIGGER chess_test_wallet_failure BEFORE INSERT ON economy_transactions BEGIN SELECT RAISE(ABORT,'wallet failure'); END",
  );
  const count = db
    .prepare("SELECT solved FROM chess_records WHERE guild_id=? AND user_id=?")
    .get(G, U).solved;
  assert.throws(() => solve(atomic.round), /wallet failure/);
  assert.equal(service.currentRound(G, C).id, atomic.round.id);
  assert.equal(
    db
      .prepare(
        "SELECT solved FROM chess_records WHERE guild_id=? AND user_id=?",
      )
      .get(G, U).solved,
    count,
  );
  db.exec("DROP TRIGGER chess_test_wallet_failure");
  db.prepare("UPDATE chess_rounds SET expires_at=? WHERE id=?").run(
    Date.now() - 1,
    atomic.round.id,
  );
  assert.equal(solve(atomic.round), null);
  assert.equal(service.latestRound(G, C).status, "expired");
  assert.equal(service.currentRound(G, C), null);

  // One reservation per channel, but other channels can still create a board.
  let release;
  const pending = begin(C, {
    puzzleLoader: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await assert.rejects(begin(), /LOADING/);
  const C2 = "423456789012345678";
  channels.addGameChannel(G, "covua", C2);
  const independent = await begin(C2);
  release(fixture());
  await pending;
  assert.ok(service.currentRound(G, C));
  assert.ok(service.currentRound(G, C2));
  service.forceEndChess(service.currentRound(G, C).id, G);
  assert.equal(service.currentRound(G, C), null);

  // Missing reaction/send permissions do not stop settlement or create another board.
  let reacted = 0,
    replied = 0;
  const beforeDenied = getAccount(G, U).balance;
  const denied = () => {
    const error = new Error("Missing Permissions");
    error.code = 50013;
    throw error;
  };
  assert.equal(
    await service.handleChessMessage(
      {
        guildId: G,
        channelId: C2,
        author: { id: U, bot: false },
        id: "deniedMessage",
        content: "Qg7#",
        client: {},
        react: async () => {
          reacted++;
          denied();
        },
        reply: async () => {
          replied++;
          denied();
        },
      },
      { warn() {} },
    ),
    true,
  );
  assert.equal(reacted, 1);
  assert.equal(replied, 1);
  assert.equal(
    getAccount(G, U).balance,
    beforeDenied + independent.round.reward,
  );
  assert.equal(service.currentRound(G, C2), null);
  assert.equal(
    await service.handleChessMessage({
      guildId: G,
      channelId: C2,
      author: { id: U },
      content: "Qg7#",
    }),
    false,
  );

  const image = boardImage(mate2);
  assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 576);
  const black = engine.validatePuzzle({
    ...mate1,
    fen: "8/8/8/8/8/6k1/5q2/7K b - - 0 1",
    solution: ["f2f1"],
  });
  assert.ok(engine.checkAnswer(black, "Qf1#"));
  assert.ok(boardImage(black).length > 1000);
  const payload = roundPayload(won.round);
  assert.ok(
    payload.embeds[0]
      .toJSON()
      .fields.some((field) => field.value.includes("f7f8")),
  );
  assert.equal(payload.files.length, 1);
  // Adding a 26th achievement filter must stay within Discord's 25-option / 5-row limits.
  const panel = require("../src/commands/kiemtra").achievementPanel(
    G,
    U,
    "all",
    "covua",
    0,
  );
  assert.ok(panel.components.length <= 5);
  const ids = new Set();
  let chessFilter = false;
  for (const row of panel.components)
    for (const component of row.toJSON().components) {
      assert.ok(!ids.has(component.custom_id));
      ids.add(component.custom_id);
      if (component.options) {
        assert.ok(component.options.length <= 25);
        chessFilter ||= component.options.some(
          (option) => option.value === "covua",
        );
      }
    }
  assert.ok(chessFilter);
  assert.ok(panel.embeds[0].toJSON().description.includes("Nước cờ đầu tiên"));
  const schema = command.data.toJSON();
  assert.deepEqual(
    schema.options.map((option) => option.name),
    ["choi", "boqua", "xem", "huongdan", "cauhinh"],
  );
  const registry = require("../src/commandRegistry")
    .loadCommands()
    .map((entry) => entry.data.toJSON());
  assert.equal(registry.filter((entry) => entry.name === "covua").length, 1);
  let deniedPayload;
  await command.execute({
    guildId: G,
    user: { id: "notAdmin" },
    options: { getSubcommand: () => "boqua" },
    reply: async (payload) => {
      deniedPayload = payload;
    },
  });
  assert.match(deniedPayload.content, /Chỉ quản trị/);
  const C3 = "523456789012345678";
  const admin = {
    guildId: G,
    channelId: C3,
    user: { id: U },
    memberPermissions: { has: () => true },
    guild: {
      channels: {
        fetch: async (id) => ({
          id,
          guildId: G,
          type: require("discord.js").ChannelType.GuildText,
        }),
      },
    },
    options: {
      getSubcommand: () => "cauhinh",
      getChannel: () => null,
      getString: () => C3,
      getInteger: () => 300,
    },
    reply: async (value) => value,
  };
  await command.execute(admin);
  assert.ok(channels.channelHasGame(G, C3, "covua"));
  assert.equal(rewards.getGameReward(G, "covua"), 300);
  // Public command -> upload -> persisted message ID, and prefix reuses the same handler.
  const originalStart = service.startRound;
  service.startRound = (args) =>
    originalStart({ ...args, puzzleLoader: async () => fixture() });
  let posted = 0;
  try {
    await command.execute({
      ...admin,
      options: { getSubcommand: () => "choi" },
      deferReply: async () => {},
      editReply: async (payload) => {
        assert.equal(payload.files.length, 1);
        posted++;
        return { id: "boardMessage" };
      },
    });
    assert.equal(service.currentRound(G, C3).message_id, "boardMessage");
    await command.execute({
      ...admin,
      options: { getSubcommand: () => "choi" },
    });
    assert.equal(posted, 1, "second play command must not post another board");
    let prefixResponse;
    const message = {
      id: "prefixMessage",
      guildId: G,
      channelId: C3,
      author: { id: U },
      client: { commands: new Map([["covua", command]]) },
      content: "!covua choi",
      member: { permissions: { has: () => true } },
      reply: async (value) => {
        prefixResponse = value;
        return { id: "prefixReply" };
      },
    };
    assert.equal(
      await require("../src/services/slashPrefixService").handleSlashPrefix(
        message,
      ),
      true,
    );
    assert.match(prefixResponse.content, /đã có bàn/);
  } finally {
    service.startRound = originalStart;
  }
  // The maintenance sweep closes persisted expired boards immediately after restart.
  db.prepare(
    "UPDATE chess_rounds SET expires_at=? WHERE channel_id=? AND status='open'",
  ).run(Date.now() - 1, C3);
  let updated = 0;
  const timer = service.startChessMaintenance(
    {
      channels: {
        fetch: async () => ({
          messages: {
            fetch: async () => ({
              edit: async () => {
                updated++;
              },
            }),
          },
        }),
      },
    },
    { error() {}, warn() {} },
  );
  clearInterval(timer);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(service.currentRound(G, C3), null);
  assert.equal(service.latestRound(G, C3).status, "expired");
  assert.ok(updated > 0);
  // Transport is mocked: no player account or Discord message is touched by this test.
  const loaded = await loadPuzzle({
    randomInt: () => 2,
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => liveFixture,
    }),
  });
  assert.equal(loaded.id, "atRIv");
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  await assert.rejects(
    requestPuzzle(2, async () => ({
      ok: false,
      status: 429,
      headers: { get: () => "1" },
    })),
    /LICHESS_BUSY/,
  );
  let fetched = false;
  await assert.rejects(
    requestPuzzle(2, async () => {
      fetched = true;
    }),
    /LICHESS_BUSY/,
  );
  assert.equal(
    fetched,
    false,
    "429 cooldown must prevent another HTTP request",
  );
  console.log(
    JSON.stringify({
      ok: true,
      chess: true,
      cases:
        "notation, PGN, mate validation, concurrency, atomic rewards, timeout, skip, permissions, achievements, Discord limits, API cooldown",
    }),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
