const assert = require("node:assert/strict");
process.env.DB_PATH = ":memory:";
const engine = require("../src/xiangqi/engine");
const { position } = require("./generate-xiangqi-puzzles");
const { loadCatalog, loadPuzzle } = require("../src/xiangqi/puzzle");
const { db } = require("../src/db");
const {
  boardImage,
  PIECE_CHARACTERS,
  drawPieceCharacter,
} = require("../src/xiangqi/view");
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
  const first = catalog.find((p) => p.mate === 2);
  // Chinese pieces must render from packaged outlines with no font/text API.
  assert.deepEqual(PIECE_CHARACTERS, {
    K: "帥",
    k: "將",
    A: "仕",
    a: "士",
    B: "相",
    b: "象",
    N: "馬",
    n: "馬",
    R: "車",
    r: "車",
    C: "炮",
    c: "砲",
    P: "兵",
    p: "卒",
  });
  const outlines = require("../assets/xiangqi/characters.json");
  assert.equal(Object.keys(outlines.characters).length, 12);
  const { Path2D } = require("@napi-rs/canvas");
  for (const piece of Object.keys(PIECE_CHARACTERS)) {
    let drawn = 0,
      saved = 0;
    const context = {
      save() {
        saved++;
      },
      restore() {
        saved--;
      },
      translate(x, y) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
      },
      scale(x, y) {
        assert.ok(x > 0 && y < 0);
      },
      fill(shape) {
        assert.ok(shape instanceof Path2D);
        drawn++;
      },
      // No font, fillText, or installed CJK family is available in this context.
    };
    drawPieceCharacter(context, piece, 100, 100);
    assert.equal(drawn, 1);
    assert.equal(saved, 0);
  }
  const image = boardImage(first);
  assert.equal(image.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 544);
  assert.equal(image.readUInt32BE(20), 600);
  assert.ok(boardImage(catalog.find((p) => p.side === "b")).length > 1000);
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
  assert.deepEqual(
    registry.find((c) => c.name === "cotuong").options.map((o) => o.name),
    ["choi", "phong", "cauhinh"],
  );
  assert(
    !require("../src/services/gameChannelService").GAMES.includes("cotuong"),
  );
  assert(
    !require("../src/services/gameRewardService").REWARD_GAMES.includes(
      "cotuong",
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      xiangqi:
        "legacy engine proofs and glyphs remain valid; Discord puzzle retired",
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
