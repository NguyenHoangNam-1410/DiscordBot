const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const engine = require("../src/xiangqi/engine");
const { position } = require("./generate-xiangqi-puzzles");
const { loadCatalog, loadPuzzle } = require("../src/xiangqi/puzzle");
const { db } = require("../src/db");
const service = require("../src/services/xiangqiService");
const channels = require("../src/services/gameChannelService");
const rewards = require("../src/services/gameRewardService");
const { getAccount } = require("../src/services/economyService");
const { getAchievements } = require("../src/services/achievementService");
const { boardImage, roundPayload } = require("../src/xiangqi/view");
const { pagedOptions, navigationPage } = require("../src/utils/pagedSelect");
const G = "123456789012345678",
  C = "223456789012345678",
  U = "323456789012345678",
  V = "423456789012345678";
function moves(puzzle) {
  return puzzle.solution.filter((_, i) => i % 2 === 0).join(" ");
}
function withBoard(pieces, fn, side = "w") {
  const board = engine.boardFor(position(pieces, side));
  try {
    return fn(board);
  } finally {
    board.delete();
  }
}
async function run() {
  const fish = await engine.initialize();
  const catalog = await loadCatalog();
  assert.equal(catalog.length, 64);
  assert.deepEqual(
    [...new Set(catalog.map((p) => p.mate))].sort(),
    [1, 2, 3, 4],
  );
  assert.ok(catalog.some((p) => p.side === "b"));
  assert.ok(catalog.some((p) => p.side === "r"));
  assert.equal(
    new Set(catalog.map((p) => engine.positionKey(p.fen))).size,
    catalog.length,
  );
  const start = engine.boardFor(fish.startingFen("xiangqi"));
  assert.equal(start.numberLegalMoves(), 44);
  assert.equal(engine.matchMove(start, "Pháo 2 bình 5"), "h3e3");
  assert.equal(engine.matchMove(start, "P2.5"), "h3e3");
  assert.equal(engine.matchMove(start, "C2=5"), "h3e3");
  assert.equal(engine.matchMove(start, "h2e2"), "h3e3");
  start.delete();
  assert.equal(engine.normalizeInput("Mã 2 tiến 3"), "H2+3");
  assert.equal(engine.normalizeInput("Tướng 5 tiến 1"), "K5+1");
  assert.equal(engine.normalizeInput("Tượng 3 thoái 5"), "E3-5");
  assert.equal(engine.normalizeInput("Xe trước bình 5"), "R+=5");
  assert.equal(engine.normalizeInput("X-.5"), "R-=5");
  assert.equal(engine.normalizeInput("tuong 5 tien 1"), "AMBIGUOUS_PIECE");
  for (const iccs of ["a0a9", "i9a0", "e0e1", "h2e2"])
    assert.equal(engine.fromEngine(engine.toEngine(iccs)), iccs);
  assert.throws(() => engine.toEngine("a10a9"));
  assert.throws(() => engine.boardFor("not a fen"));
  assert.throws(
    () => engine.boardFor("3k5/9/9/9/4p4/9/9/9/3R1R3/4K4 w - - 0 1"),
    /INVALID_XIANGQI_FEN/,
    "opponent cannot already be checked before the solving side moves",
  );
  const base = [
    ["K", 4, 0],
    ["k", 3, 9],
    ["p", 4, 5],
  ];
  withBoard(
    [...base, ["N", 1, 0], ["P", 1, 1]],
    (b) => assert.ok(!engine.legal(b).includes(engine.toEngine("b0c2"))),
    "w",
  );
  withBoard(
    [...base, ["N", 1, 0]],
    (b) => assert.ok(engine.legal(b).includes(engine.toEngine("b0c2"))),
    "w",
  );
  withBoard([...base, ["B", 6, 4]], (b) =>
    assert.ok(!engine.legal(b).includes(engine.toEngine("g4i6"))),
  );
  for (const [screens, allowed] of [
    [[], false],
    [[["P", 0, 5]], true],
    [
      [
        ["P", 0, 4],
        ["P", 0, 5],
      ],
      false,
    ],
  ])
    withBoard([...base, ["C", 0, 2], ["r", 0, 7], ...screens], (b) =>
      assert.equal(engine.legal(b).includes(engine.toEngine("a2a7")), allowed),
    );
  withBoard(
    [
      ["K", 4, 0],
      ["k", 4, 9],
      ["N", 4, 4],
    ],
    (b) => assert.ok(!engine.legal(b).includes(engine.toEngine("e4f6"))),
  );
  withBoard([...base, ["P", 1, 4]], (b) =>
    assert.ok(!engine.legal(b).includes(engine.toEngine("b4a4"))),
  );
  withBoard([...base, ["P", 1, 5]], (b) => {
    assert.ok(engine.legal(b).includes(engine.toEngine("b5a5")));
    assert.ok(!engine.legal(b).includes(engine.toEngine("b5b4")));
  });
  withBoard(
    [
      ["K", 3, 0],
      ["k", 4, 9],
      ["R", 3, 8],
      ["R", 5, 8],
    ],
    (b) => {
      assert.equal(b.numberLegalMoves(), 0);
      assert.equal(b.isCheck(), false);
      assert.equal(engine.mate(b), false);
    },
    "b",
  );
  // Re-prove every catalog position, including mirrored/rotated boards. This
  // verifies minimal N and every defense; validation alone only checks tree edges.
  let alternatives = 0;
  for (const puzzle of catalog) {
    assert.ok(engine.checkAnswer(puzzle, moves(puzzle)), puzzle.id);
    assert.ok(engine.checkAnswer(puzzle, `<@${U}>\n${moves(puzzle)}`));
    const proof = engine.prove(
      puzzle.fen,
      puzzle.mate,
      Math.max(300000, puzzle.nodes + 1000),
    );
    assert.equal(proof?.mate, puzzle.mate, puzzle.id);
    const rootMoves = Object.keys(puzzle.tree.choices);
    if (rootMoves.length > 1) {
      const first = rootMoves.at(-1),
        branch = puzzle.tree.choices[first];
      const player = [first];
      let node = branch;
      while (node !== true) {
        const m = Object.keys(node.next.choices)[0];
        player.push(m);
        node = node.next.choices[m];
      }
      assert.ok(engine.checkAnswer(puzzle, player.join(" ")));
      alternatives++;
    }
  }
  assert.ok(alternatives > 0);
  const selected = await loadPuzzle({ seen: () => true, randomInt: () => 0 });
  assert.ok(selected);
  channels.addGameChannel(G, "cotuong", C);
  rewards.setGameReward(G, "cotuong", 100);
  const first = catalog.find((p) => p.mate === 2);
  const begin = (extra = {}) =>
    service.startRound({
      guildId: G,
      channelId: C,
      userId: U,
      puzzleLoader: async () => first,
      ...extra,
    });
  const solve = (user = U, text = moves(first)) =>
    service.solveRound({
      guildId: G,
      channelId: C,
      userId: user,
      messageId: "answer",
      text,
    });
  const round = await begin();
  assert.equal(round.round.reward, 400);
  assert.equal(round.round.expires_at - round.round.created_at, 3600000);
  assert.equal((await begin()).existing.id, round.round.id);
  channels.addGameChannel(G, "covua", C);
  await assert.rejects(
    require("../src/services/chessService").startRound({
      guildId: G,
      channelId: C,
      userId: U,
    }),
    /BOARD_CHANNEL_BUSY/,
  );
  assert.equal(solve(U, "i0i1"), null);
  const before = getAccount(G, U).balance;
  assert.ok(solve());
  assert.equal(getAccount(G, U).balance, before + 400);
  assert.equal(solve(), null);
  assert.equal(service.currentRound(G, C), null);
  assert.ok(
    getAchievements(G, U).find((a) => a.id === "xiangqi_solved_1").complete,
  );
  assert.equal(
    db
      .prepare(
        "SELECT solved FROM xiangqi_records WHERE guild_id=? AND user_id=?",
      )
      .get(G, U).solved,
    1,
  );
  await begin();
  assert.ok(solve().alreadySolved);
  assert.ok(service.currentRound(G, C));
  let reaction;
  assert.equal(
    await service.handleXiangqiMessage({
      guildId: G,
      channelId: C,
      author: { id: U },
      id: "again",
      content: moves(first),
      react: async (x) => {
        reaction = x;
      },
    }),
    true,
  );
  assert.equal(reaction, "♻️");
  assert.equal(getAccount(G, U).balance, before + 400);
  assert.ok(solve(V));
  assert.equal(service.currentRound(G, C), null);
  const active = await begin({
    puzzleLoader: async () => catalog.find((p) => p.mate === 3),
  });
  await assert.rejects(
    begin({
      replace: true,
      puzzleLoader: async () => {
        throw new Error("LOAD_FAILED");
      },
    }),
    /LOAD_FAILED/,
  );
  assert.equal(service.currentRound(G, C).id, active.round.id);
  const replacement = await begin({
    replace: true,
    puzzleLoader: async () => catalog.find((p) => p.mate === 4),
  });
  service.publicationFailed(replacement);
  assert.equal(service.currentRound(G, C).id, active.round.id);
  db.prepare("UPDATE xiangqi_rounds SET expires_at=? WHERE id=?").run(
    Date.now() - 1,
    active.round.id,
  );
  assert.equal(
    service.solveRound({
      guildId: G,
      channelId: C,
      userId: U,
      messageId: "expired",
      text: moves(JSON.parse(active.round.puzzle_json)),
    }),
    null,
  );
  assert.equal(service.currentRound(G, C), null);
  // Rejected wallet writes must roll back the award marker and all statistics.
  const atomic = await begin({
    puzzleLoader: async () => catalog.find((p) => p.mate === 4),
  });
  db.exec(
    "CREATE TRIGGER fail_xq_wallet BEFORE INSERT ON economy_transactions BEGIN SELECT RAISE(ABORT,'wallet failure'); END",
  );
  assert.throws(
    () =>
      service.solveRound({
        guildId: G,
        channelId: C,
        userId: U,
        messageId: "atomic",
        text: moves(JSON.parse(atomic.round.puzzle_json)),
      }),
    /wallet failure/,
  );
  assert.ok(service.currentRound(G, C));
  assert.equal(service.hasSolved(G, U, atomic.round.puzzle_id), false);
  db.exec("DROP TRIGGER fail_xq_wallet");
  assert.ok(service.forceEndXiangqi(atomic.round.id, G));
  assert.equal(service.currentRound(G, C), null);
  const image = boardImage(first);
  assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 544);
  assert.equal(image.readUInt32BE(20), 600);
  assert.ok(boardImage(catalog.find((p) => p.side === "b")).length > 1000);
  assert.equal(roundPayload(round.round).files.length, 1);
  // Paginate arbitrarily long lists within a single menu; navigation never acts as a filter.
  const choices = Array.from({ length: 101 }, (_, i) => ({
    label: `Type ${i}`,
    value: `type${i}`,
  }));
  const reached = [];
  for (let page = 0; page < 5; page++) {
    const menu = pagedOptions(choices, "type100", page);
    assert.ok(menu.options.length <= 25);
    reached.push(
      ...menu.options
        .filter((o) => !o.value.startsWith("__page:"))
        .map((o) => o.value),
    );
    assert.equal(
      menu.options.filter((o) => o.default).length,
      page === 4 ? 1 : 0,
    );
    if (page < 4) assert.equal(menu.options.at(-1).value, `__page:${page + 1}`);
  }
  assert.equal(new Set(reached).size, 101);
  assert.equal(pagedOptions(choices, "type100").page, 4);
  assert.equal(navigationPage("__page:2"), 2);
  assert.equal(navigationPage("type2"), null);
  const checklist = require("../src/commands/kiemtra");
  let panel = checklist.achievementPanel(G, U, "progress", "all", 2, 0);
  assert.equal(panel.components.length, 4);
  const categoryMenu = (p) =>
    p.components
      .flatMap((r) => r.toJSON().components)
      .find((c) => c.custom_id.startsWith("kiemtra-category:"));
  let menu = categoryMenu(panel);
  assert.equal(menu.options.at(-1).label, "Trang sau");
  await checklist.handleAchievementFilter({
    guildId: G,
    user: { id: U },
    customId: menu.custom_id,
    values: ["__page:1"],
    update: async (p) => {
      panel = p;
    },
  });
  menu = categoryMenu(panel);
  assert.ok(menu.options.some((o) => o.value === "cotuong"));
  assert.ok(panel.embeds[0].toJSON().footer.text.includes("Trang 3/"));
  await checklist.handleAchievementFilter({
    guildId: G,
    user: { id: U },
    customId: menu.custom_id,
    values: ["cotuong"],
    update: async (p) => {
      panel = p;
    },
  });
  assert.ok(panel.embeds[0].toJSON().description.includes("cờ tướng"));
  assert.ok(
    categoryMenu(panel).options.find((o) => o.value === "cotuong").default,
  );
  await checklist.handleAchievementFilter({
    guildId: G,
    user: { id: U },
    customId: categoryMenu(panel).custom_id,
    values: ["__page:0"],
    update: async (p) => {
      panel = p;
    },
  });
  assert.ok(categoryMenu(panel).custom_id.includes(":cotuong:"));
  let denied = false;
  await checklist.handleAchievementFilter({
    guildId: G,
    user: { id: V },
    customId: categoryMenu(panel).custom_id,
    values: ["__page:1"],
    reply: async () => {
      denied = true;
    },
    update: async () => assert.fail("unauthorized navigation"),
  });
  assert.ok(denied);
  const registry = require("../src/commandRegistry")
    .loadCommands()
    .map((c) => c.data.toJSON());
  assert.equal(registry.filter((c) => c.name === "cotuong").length, 1);
  assert.deepEqual(
    registry.find((c) => c.name === "cotuong").options.map((o) => o.name),
    ["choi", "boqua", "xem", "huongdan", "cauhinh"],
  );
  const command = require("../src/commands/cotuong");
  let response;
  const mock = {
    guildId: G,
    channelId: C,
    user: { id: U },
    memberPermissions: { has: () => true },
    reply: async (p) => {
      response = p;
      return p;
    },
    options: {
      getSubcommand: () => "cauhinh",
      getChannel: () => null,
      getString: () => null,
      getInteger: () => 200,
    },
  };
  await command.execute(mock);
  assert.equal(rewards.getGameReward(G, "cotuong"), 200);
  assert.ok(
    response.embeds[0].toJSON().description.includes("Cờ vua") === false,
  );
  const originalStart = service.startRound;
  service.startRound = (args) =>
    originalStart({ ...args, puzzleLoader: async () => first });
  try {
    await command.execute({
      ...mock,
      options: { getSubcommand: () => "choi" },
      deferReply: async () => {},
      editReply: async (p) => {
        response = p;
        return { id: "xqBoard" };
      },
    });
    assert.equal(service.currentRound(G, C).message_id, "xqBoard");
    await command.execute({
      ...mock,
      options: { getSubcommand: () => "choi" },
    });
    assert.ok(response.content.includes("/cotuong xem"));
    assert.ok(!response.content.includes("/covua"));
    await command.execute({ ...mock, options: { getSubcommand: () => "xem" } });
    assert.ok(
      response.embeds[0]
        .toJSON()
        .fields.some((f) => f.name === "Thế đã nhận thưởng"),
    );
  } finally {
    service.startRound = originalStart;
  }
  await command.execute({
    ...mock,
    user: { id: V },
    memberPermissions: { has: () => false },
    options: { getSubcommand: () => "boqua" },
  });
  assert.match(response.content, /Chỉ quản trị/);
  const activeNow = service.currentRound(G, C);
  db.prepare("UPDATE xiangqi_rounds SET expires_at=? WHERE id=?").run(
    Date.now() - 1,
    activeNow.id,
  );
  let closed = false;
  const timer = service.startXiangqiMaintenance(
    {
      channels: {
        fetch: async () => ({
          messages: {
            fetch: async () => ({
              edit: async () => {
                closed = true;
              },
            }),
          },
        }),
      },
    },
    { warn() {}, error() {} },
  );
  clearInterval(timer);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(service.currentRound(G, C), null);
  assert.equal(service.latestRound(G, C).status, "expired");
  assert.ok(closed);
  console.log(
    JSON.stringify({
      ok: true,
      xiangqi: true,
      puzzles: catalog.length,
      alternatives,
      filterPagination: true,
    }),
  );
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
