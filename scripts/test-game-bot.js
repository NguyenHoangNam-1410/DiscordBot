const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-game-bot.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;
const expectedCommandFiles = [
  "batdau",
  "trogiup",
  "huongdan",
  "choi",
  "luat",
  "hoso",
  "xu",
  "vatpham",
  "nhiemvu",
  "xephang",
  "anxin",
  "quantri",
  "gacha",
  "vtv",
];
const expectedCommands = expectedCommandFiles.map((file) => file);
assert.deepEqual(
  [...require("../src/commandRegistry").COMMAND_FILES],
  expectedCommandFiles,
);

const countLimit = (options = [], where) => {
  assert(
    options.length <= 25,
    `${where} vượt giới hạn 25 lựa chọn của Discord`,
  );
  options.forEach((option) =>
    countLimit(option.options, `${where} ${option.name}`),
  );
};
for (const file of expectedCommandFiles) {
  const registered =
    file === "vtv"
      ? require("../src/commands/vuatiengviet").playerCommand
      : require(`../src/commands/${file}`);
  countLimit(registered.data.toJSON().options, file);
}
for (const [index, file] of expectedCommandFiles.entries()) {
  const command =
    file === "vtv"
      ? require("../src/commands/vuatiengviet").playerCommand
      : require(`../src/commands/${file}`);
  assert.equal(
    command.data.toJSON().name,
    expectedCommands[index],
    `Sai schema command ${file}`,
  );
}
const profileCommand = require("../src/commands/hoso");
const componentRouter = require("../src/componentRouter");
assert.equal(
  componentRouter.interactionKind({
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
  }),
  "button",
);
assert(componentRouter.ROUTES.length >= 18);
assert.equal(typeof profileCommand.handleSelect, "function");
assert.equal(
  fs.existsSync(path.resolve(__dirname, "../src/commands/noitu.js")),
  false,
);
assert.equal(
  fs.existsSync(path.resolve(__dirname, "../src/commands/addkimcuong.js")),
  false,
);
const prefixAdmin = require("../src/services/prefixCommandService");
assert.deepEqual(prefixAdmin.parseAddGem("!addgem <@123456789> 2500"), {
  userId: "123456789",
  amount: 2500,
});
assert.deepEqual(prefixAdmin.parseAddGem("!ADDGEM 123456789 1"), {
  userId: "123456789",
  amount: 1,
});
assert.equal(prefixAdmin.parseAddGem("!addgem <@123456789>"), null);
assert.deepEqual(prefixAdmin.parseAddGold("!congxu <@123456789> 2500"), {
  userId: "123456789",
  amount: 2500,
  reason: "prefix",
});
assert.deepEqual(prefixAdmin.parseRemoveGold("!truxu 123456789 50 gian-lan"), {
  userId: "123456789",
  amount: 50,
  reason: "gian-lan",
});
assert.deepEqual(
  require("../src/commands/poker")
    .data.toJSON()
    .options.map((option) => option.name),
  ["chedo", "chedochoi"],
);
assert.equal(require("../src/commands/use").data.toJSON().options.length, 0);
assert.deepEqual(
  require("../src/commands/choi")
    .data.toJSON()
    .options.map((option) => option.name),
  [
    "baucua",
    "taixiu",
    "chinchiro",
    "oantuti",
    "xidach",
    "poker",
    "duangua",
    "domin",
    "coquay",
    "sinhton",
    "vtv",
  ],
);
assert.deepEqual(
  require("../src/commands/vatpham")
    .data.toJSON()
    .options.map((option) => option.name),
  ["cuahang", "mua", "tui", "sudung", "tang", "quay", "chitiet"],
);
// 3 lệnh thưởng vai trò được gộp thành một bảng (xemthuongvaitro) và thêm hesothang: 25 − 2 + 1 = 24, còn trống 1 chỗ
assert.equal(
  require("../src/commands/quantri").data.toJSON().options.length,
  24,
);
const adminOptionNames = require("../src/commands/quantri")
  .data.toJSON()
  .options.map((option) => option.name);
assert(
  ["themgacha", "batgacha", "xemgacha", "datbuff", "xemthuongvaitro", "hesothang"].every((name) =>
    adminOptionNames.includes(name),
  ),
);
assert(
  !require("../src/commands/xu")
    .data.toJSON()
    .options.some((option) => option.name === "top"),
);
assert(
  require("../src/commands/nhiemvu")
    .data.toJSON()
    .options.some(
      (option) =>
        option.name === "nhan" &&
        option.options.some((choice) => choice.name === "loai"),
    ),
);
assert(
  require("../src/commands/game")
    .data.toJSON()
    .options.some((option) => option.name === "economy"),
);
assert(
  require("../src/commands/game")
    .data.toJSON()
    .options.some((option) => option.name === "health"),
);
assert(
  require("../src/commands/game")
    .data.toJSON()
    .options.some((option) => option.name === "configs"),
);
assert(
  require("../src/commands/game")
    .data.toJSON()
    .options.some((option) => option.name === "config"),
);
assert(
  require("../src/commands/game")
    .data.toJSON()
    .options.some((option) => option.name === "configreset"),
);
const channelSettings = require("../src/services/gameChannelService");
const { GAMES } = channelSettings;
assert.deepEqual(
  [...GAMES],
  [
    "baucua",
    "oantuti",
    "taixiu",
    "chinchiro",
    "blackjack",
    "poker",
    "duangua",
    "mines",
    "coquay",
    "hardcore",
    "vuatiengviet",
  ],
);
channelSettings.setGameChannel("shared-channel-guild", "baucua", "casino");
channelSettings.setGameChannel("shared-channel-guild", "taixiu", "casino");
assert.deepEqual(
  channelSettings
    .getGamesByChannel("shared-channel-guild", "casino")
    .map((row) => row.game),
  ["baucua", "taixiu"],
);
assert.equal(
  channelSettings.channelHasGame("shared-channel-guild", "casino", "taixiu"),
  true,
);
const { listCatalog } = require("../src/services/itemCatalogService");
const catalog = listCatalog();
assert.equal(catalog.filter((item) => item.type === "consumable").length, 37);
assert.deepEqual(
  [
    ...new Set(
      catalog
        .filter((item) => item.type === "consumable")
        .map((item) => item.rarity),
    ),
  ].sort(),
  ["R", "SR", "SSR", "UR"],
);
assert(catalog.some((item) => item.effect === "mines_blast_shield"));
assert(catalog.some((item) => item.effect === "quiz_living_dictionary"));
const fairness = require("../src/services/fairnessService");
const fair = fairness.createFairness();
assert.equal(fairness.verifyFairness(fair), true);
assert.equal(fairness.commitment(fair.serverSeed), fair.commit);
assert.equal(
  fairness.fairInt(fair.serverSeed, "test", 0, 1000),
  fairness.fairInt(fair.serverSeed, "test", 0, 1000),
);
const fairRoundA = require("../src/services/multiplayerGameService").rollResult(
  "taixiu",
  null,
  fair.serverSeed,
);
const fairRoundB = require("../src/services/multiplayerGameService").rollResult(
  "taixiu",
  null,
  fair.serverSeed,
);
assert.deepEqual(fairRoundA, fairRoundB);
const fairShoeA = require("../src/services/blackjackService").createShoe(
  1,
  fair.serverSeed,
);
const fairShoeB = require("../src/services/blackjackService").createShoe(
  1,
  fair.serverSeed,
);
assert.deepEqual(fairShoeA, fairShoeB);
const fairMinesA = require("../src/services/minesService").createMinePositions(
  5,
  fair.serverSeed,
);
const fairMinesB = require("../src/services/minesService").createMinePositions(
  5,
  fair.serverSeed,
);
assert.deepEqual(fairMinesA, fairMinesB);
assert.deepEqual(
  require("../src/services/pokerEngine").createDeck(false, fair.serverSeed),
  require("../src/services/pokerEngine").createDeck(false, fair.serverSeed),
);
const horse = require("../src/services/horseRaceService");
assert.equal(typeof horse.createHorseRace, "function");
assert.equal(horse.ROUND_MS, 30_000);
assert.equal(horse.RACE_ANIMATION_MS, 18_000);
assert.equal(Object.keys(horse.HORSES).length, 21);
assert.equal(horse.REGULAR_HORSE_KEYS.length, 20);
assert.equal(horse.HORSES[horse.SPECIAL_HORSE_KEY].special, true);
assert(
  Object.keys(horse.HORSES).every(
    (key) => horse.HORSE_CLASSES[horse.HORSE_CLASS_BY_KEY[key]],
  ),
);
assert.equal(horse.weightedWinner(0), "sao_bang");
assert.equal(horse.weightedWinner(99), "set_trang");
const raceMarket = horse.generateRaceMarket(Date.UTC(2026, 8, 25, 12), {
  forceSpecial: false,
});
const specialMarket = horse.generateRaceMarket(Date.UTC(2026, 8, 25, 12), {
  forceSpecial: true,
});
assert.equal(raceMarket.selected.length, horse.HORSES_PER_RACE);
assert.equal(Object.keys(raceMarket.horses).length, horse.HORSES_PER_RACE);
assert(!raceMarket.selected.includes(horse.SPECIAL_HORSE_KEY));
assert.equal(specialMarket.selected.length, horse.HORSES_PER_RACE);
assert(specialMarket.selected.includes(horse.SPECIAL_HORSE_KEY));
const raceWinner = raceMarket.selected[0];
const raceOrder = [raceWinner, ...raceMarket.selected.slice(1)];
assert.equal(raceMarket.debuff, undefined);
const raceDebuff = horse.rollRaceDebuff(raceMarket.selected, "slippery_track");
assert.equal(raceDebuff.id, "slippery_track");
assert.equal(raceDebuff.effects.length, horse.HORSES_PER_RACE);
const debuffedMarket = horse.marketWithDebuff(raceMarket, raceDebuff);
assert(
  raceMarket.selected.some(
    (key) =>
      debuffedMarket.horses[key].weight !== raceMarket.horses[key].weight,
  ),
);
const racePlan = horse.buildRacePlan(raceWinner, raceOrder, raceDebuff);
assert.equal(racePlan.frames.length, horse.RACE_FRAME_COUNT);
assert.equal(racePlan.order.length, horse.HORSES_PER_RACE);
assert.equal(racePlan.frames.at(-1).positions[raceWinner], 100);
assert(Object.values(racePlan.frames.at(-1).positions).every(Number.isFinite));
assert.equal(racePlan.surprises.length, 3);
assert.equal(racePlan.debuff.id, "slippery_track");
assert(
  racePlan.surprises.every(
    (event) => event.horse !== "thiet_giap" && event.penalty > 0,
  ),
);
assert(
  racePlan.frames.every(
    (frame, index) =>
      index === 0 ||
      frame.positions[raceWinner] >=
        racePlan.frames[index - 1].positions[raceWinner],
  ),
);
assert.match(racePlan.reason, new RegExp(horse.HORSES[raceWinner].name));
const marketRound = {
  id: "race-test",
  guild_id: "test-guild",
  closes_at: Date.now() + 30_000,
  result_json: JSON.stringify({ market: raceMarket }),
};
assert.doesNotThrow(() =>
  horse.raceAnimationEmbed(marketRound, racePlan, 0).toJSON(),
);
const horseRows = horse.raceButtons(marketRound);
assert.equal(horseRows.length, 2);
assert(horseRows.every((row) => row.components.length === 3));
assert.doesNotThrow(() => horse.raceEmbed(marketRound).toJSON());
assert(
  !horse.raceEmbed(marketRound).toJSON().description.includes("Mặt đường trơn"),
);
const compactRaceResult = horse
  .resultEmbed({
    round: { id: "race-test" },
    market: raceMarket,
    debuff: raceDebuff,
    winner: raceWinner,
    order: raceOrder,
    plan: racePlan,
    settlements: [],
  })
  .toJSON();
assert(!JSON.stringify(compactRaceResult).includes("THÀNH TỰU"));
assert(!JSON.stringify(compactRaceResult).includes("Server seed"));
assert.equal(horse.resultRows("race-test")[0].components.length, 4);
assert(
  !compactRaceResult.fields.some((field) => /EXP/.test(field.name)),
  "không có ai nhận EXP thì không hiện mục EXP",
);
const expRace = horse
  .resultEmbed({
    round: { id: "race-exp" },
    market: raceMarket,
    debuff: raceDebuff,
    winner: raceWinner,
    order: raceOrder,
    plan: racePlan,
    settlements: [
      {
        userId: "win-user",
        outcome: "win",
        stake: 100,
        payout: 300,
        bets: [{ choice: raceWinner, amount: 100, payout: 300 }],
        experienceGained: 25,
        levelUps: [{ level: 4 }],
        achievements: [{ name: "Tay Đua" }],
      },
      {
        userId: "lose-user",
        outcome: "loss",
        stake: 100,
        payout: 0,
        bets: [{ choice: raceOrder[1], amount: 100, payout: 0 }],
        experienceGained: 10,
      },
    ],
  })
  .toJSON();
const expField = expRace.fields.find((field) => /KẾT QUẢ/.test(field.name));
assert(
  expField,
  "Đua ngựa phải công bố kết quả và EXP ngay trong kết quả chung cuộc",
);
assert.match(
  expField.value,
  /<@win-user>\*\* thắng \(đoán .+\): \*\*\+200 :coin: \+25 :test_tube:\*\* · 🎉 Lên cấp \*\*4\*\*/,
);
assert.match(
  expField.value,
  /<@lose-user>\*\* thua: \*\*-100 :coin: \+10 :test_tube:\*\*/,
);
assert(
  expRace.fields.some(
    (field) =>
      /Thành tựu mới/.test(field.name) &&
      /<@win-user> mở khóa \*\*Tay Đua\*\*/.test(field.value),
  ),
);
assert(
  Math.abs(
    Object.values(raceMarket.horses).reduce(
      (sum, quote) => sum + quote.chance,
      0,
    ) - 1,
  ) < 0.000001,
);
assert(
  Object.values(raceMarket.horses).every(
    (quote) => quote.multiplier >= 1.5 && quote.multiplier <= 30,
  ),
);
const hardcore = require("../src/services/hardcoreService");
assert.equal(typeof hardcore.startHardcore, "function");
assert.equal(hardcore.COMPLETION_FLOOR, 100);
assert.equal(hardcore.MAX_FLOOR, 999);
assert(
  hardcore.defenseReduction(100, 10) > 0 &&
    hardcore.defenseReduction(100, 10) < 0.75,
);
const hardcoreStarted = hardcore.startHardcore({
  guildId: "hardcore-structure",
  userId: "alice",
  channelId: "channel",
  stake: 10,
  classKey: "barbarian",
  forcedEncounter: { type: "empty" },
});
assert.doesNotThrow(() =>
  hardcore.hardcoreEmbed(hardcoreStarted.state, "alice").toJSON(),
);
assert.equal(
  hardcore.hardcoreRows(hardcoreStarted.session.id, hardcoreStarted.state)[0]
    .components.length,
  2,
);
const hardcoreEnded = hardcore.playHardcore({
  sessionId: hardcoreStarted.session.id,
  userId: "alice",
  expectedTurn: 0,
  action: "retreat",
});
assert.equal(hardcoreEnded.settled, true);
const fun = require("../src/services/funGameService");
const vua = fun.startVuaSession("test-guild", { forceHard: false, now: 1 });
assert(vua.question.answer && vua.question.mixed);
fun.endVuaSession("test-guild");
const { db } = require("../src/db");
const levels = require("../src/services/playerLevelService");
assert.equal(levels.xpForNextLevel(7), 1400);
// EXP nhân hệ số theo mức cược (cược từ 100.000 xu trở lên nhận đủ)
assert.equal(levels.gameExperience("loss", 999999, 1), 0);
assert.equal(levels.gameExperience("loss", 0, 100_000), 10);
assert.equal(levels.gameExperience("win", 1_000_000, 0), 0);
assert.equal(levels.gameExperience("win", 2_000_000, 100_000), 500);
levels.addDiamonds("gacha-guild", "alice", 1_000);
const gacha = require("../src/services/gachaService");
// vị trí 0–9999 theo thứ tự bậc với tỷ lệ cố định XU 50% · R 22% · SR 14% · SSR 10% · UR 4%
assert.deepEqual(
  [0, 4999, 5000, 7199, 7200, 8599, 8600, 9599, 9600, 9999].map(
    (roll) => gacha.rollGacha(roll).tier,
  ),
  ["XU", "XU", "R", "R", "SR", "SR", "SSR", "SSR", "UR", "UR"],
);
const singlePull = gacha.pullGacha({
  guildId: "gacha-guild",
  userId: "alice",
  pulls: 1,
  rolls: [0],
  now: 1000,
});
assert.equal(singlePull.results[0].coins, 10_000);
const tenPull = gacha.pullGacha({
  guildId: "gacha-guild",
  userId: "alice",
  pulls: 10,
  rolls: Array(10).fill(0),
  now: 2000,
});
assert(
  tenPull.results.some(
    (result) =>
      result.kind === "item" && ["SR", "SSR", "UR"].includes(result.tier),
  ),
  "10 lượt luôn có ít nhất một SR+",
);
assert.equal(tenPull.progression.diamonds, 0);
require("../src/services/shopService").addInventory(
  "gacha-guild",
  "alice",
  gacha.TICKETS[1],
  1,
  3000,
);
const ticketsBefore = gacha.getTicketBalances("gacha-guild", "alice").single;
const ticketPull = gacha.pullGacha({
  guildId: "gacha-guild",
  userId: "alice",
  pulls: 1,
  rolls: [9000],
  now: 3001,
});
assert.equal(ticketPull.usedFreePull, true);
assert.equal(ticketPull.paymentType, gacha.TICKETS[1]);
assert(["SSR", "UR"].includes(ticketPull.results[0].tier));
assert.equal(
  ticketPull.tickets.single,
  ticketsBefore -
    1 +
    (ticketPull.results[0].itemId === gacha.TICKETS[1] ? 1 : 0),
);
const ledgerFirst = levels.addDiamonds("ledger-guild", "alice", 250, {
  now: 3100,
  reason: "test",
  operationId: "diamond:test:1",
});
const ledgerDuplicate = levels.addDiamonds("ledger-guild", "alice", 250, {
  now: 3101,
  reason: "test",
  operationId: "diamond:test:1",
});
assert.equal(ledgerFirst.diamonds, 250);
assert.equal(ledgerDuplicate.diamonds, 250);
assert.equal(ledgerDuplicate.duplicate, true);
assert.equal(levels.getDiamondHistory("ledger-guild", "alice").length, 1);
levels.addDiamonds("gacha-idempotent", "alice", 100, {
  operationId: "fund:gacha-idempotent",
});
const gachaFirst = gacha.pullGacha({
  guildId: "gacha-idempotent",
  userId: "alice",
  pulls: 1,
  rolls: [0],
  operationId: "interaction:same",
});
const gachaDuplicate = gacha.pullGacha({
  guildId: "gacha-idempotent",
  userId: "alice",
  pulls: 1,
  rolls: [9900],
  operationId: "interaction:same",
});
assert.equal(gachaFirst.duplicate, false);
assert.equal(gachaDuplicate.duplicate, true);
assert.deepEqual(gachaDuplicate.results, gachaFirst.results);
const gachaPool = require("../src/services/gachaPoolService");
assert.equal(
  Math.round(
    gachaPool
      .listGachaPool("custom-gacha")
      .reduce((sum, entry) => sum + entry.rate, 0),
  ),
  100,
);
// Tỷ lệ theo độ hiếm cố định và không phụ thuộc số vật phẩm trong bậc; R phải cao hơn SR
const tierRatesOf = (guild) =>
  Object.fromEntries(
    gachaPool.tierSummary(guild).map((row) => [row.tier, row.rate]),
  );
const baseRates = tierRatesOf("custom-gacha");
assert.deepEqual(
  Object.fromEntries(
    Object.entries(baseRates).map(([tier, rate]) => [
      tier,
      Math.round(rate * 100) / 100,
    ]),
  ),
  { XU: 50, R: 22, SR: 14, SSR: 10, UR: 4 },
);
assert(
  baseRates.R > baseRates.SR &&
    baseRates.SR > baseRates.SSR &&
    baseRates.SSR > baseRates.UR,
);
assert.throws(
  () =>
    gachaPool.addGachaItem("custom-gacha", "living_dictionary", "SSR", "admin"),
  /INVALID_GACHA_TIER/,
);
const urBefore = gachaPool
  .listGachaPool("custom-gacha")
  .filter((entry) => entry.tier === "UR" && entry.weight > 0);
const addedPoolItem = gachaPool.addGachaItem(
  "custom-gacha",
  "living_dictionary",
  "UR",
  "admin",
);
assert.equal(addedPoolItem.weight, 1);
const urAfter = gachaPool
  .listGachaPool("custom-gacha")
  .filter((entry) => entry.tier === "UR" && entry.weight > 0);
assert.equal(
  urAfter.length,
  urBefore.length,
  "living_dictionary đã có sẵn trong pool nên không thêm bản sao",
);
assert(
  Math.abs(tierRatesOf("custom-gacha").UR - 4) < 1e-9,
  "thêm vật phẩm không đổi tỷ lệ bậc",
);
const disabledPoolItem = gachaPool.setGachaEnabled(
  "custom-gacha",
  "living_dictionary",
  false,
  "admin",
);
assert.equal(disabledPoolItem.rate, 0);
assert(
  Math.abs(tierRatesOf("custom-gacha").UR - 4) < 1e-9,
  "tắt một vật phẩm không đổi tỷ lệ bậc",
);
const remainingUr = gachaPool
  .listGachaPool("custom-gacha")
  .filter((entry) => entry.tier === "UR" && entry.weight > 0);
assert(
  remainingUr.every(
    (entry) => Math.abs(entry.rate - 4 / remainingUr.length) < 1e-9,
  ),
  "các vật phẩm còn lại trong bậc chia đều",
);
assert.equal(
  gachaPool.setGachaEnabled("custom-gacha", "living_dictionary", true, "admin")
    .weight,
  1,
);
// Đổi tỷ lệ bậc bằng cấu hình; bậc SR/SSR/UR không được về 0
const rateConfig = require("../src/services/gameConfigService");
rateConfig.setGameConfig("custom-gacha", "GACHA_RATE_R", 60, "admin");
assert(
  Math.abs(tierRatesOf("custom-gacha").R - (60 / 138) * 100) < 1e-9,
  "tỷ lệ bậc được chuẩn hóa về 100%",
);
assert.throws(
  () => rateConfig.setGameConfig("custom-gacha", "GACHA_RATE_UR", 0, "admin"),
  /INVALID_GAME_CONFIG_VALUE/,
);
rateConfig.resetGameConfig("custom-gacha", "GACHA_RATE_R");
// Mô phỏng: 200.000 lượt random thật phải bám tỷ lệ bậc dù mỗi bậc có số vật phẩm rất khác nhau
{
  const counts = { XU: 0, R: 0, SR: 0, SSR: 0, UR: 0 };
  const perItem = new Map();
  const N = 200_000;
  for (let i = 0; i < N; i += 1) {
    const result = gacha.rollGacha(null, "custom-gacha");
    counts[result.tier] += 1;
    if (result.tier === "UR")
      perItem.set(result.itemId, (perItem.get(result.itemId) || 0) + 1);
  }
  for (const [tier, expected] of Object.entries({
    XU: 0.5,
    R: 0.22,
    SR: 0.14,
    SSR: 0.1,
    UR: 0.04,
  }))
    assert(
      Math.abs(counts[tier] / N - expected) < 0.006,
      `bậc ${tier} ra ${((counts[tier] / N) * 100).toFixed(2)}%`,
    );
  assert(counts.R > counts.SR, "R phải nhiều hơn SR");
  const urShare = [...perItem.values()].map((count) => count / counts.UR);
  assert(
    urShare.length === urAfter.length &&
      urShare.every((share) => Math.abs(share - 1 / urAfter.length) < 0.05),
    "vật phẩm UR ra đều nhau",
  );
}
const buffs = require("../src/services/gameBuffService");
const buffNow = Date.now();
const dropConfig = require("../src/services/gameConfigService");
for (const key of [
  "GAME_COIN_DROP_CHANCE",
  "GAME_DIAMOND_DROP_CHANCE",
  "GAME_ITEM_DROP_MULTIPLIER",
])
  dropConfig.setGameConfig("buff-guild", key, 1, "admin");
dropConfig.setGameConfig("buff-guild", "GAME_COIN_DROP_MIN", 250, "admin");
dropConfig.setGameConfig("buff-guild", "GAME_COIN_DROP_MAX", 250, "admin");
dropConfig.setGameConfig("buff-guild", "GAME_DIAMOND_DROP_MAX", 7, "admin");
dropConfig.setGameConfig("buff-guild", "GAME_DIAMOND_DROP_MIN", 7, "admin");
buffs.setBuff({
  guildId: "buff-guild",
  type: "coins",
  percent: 200,
  hours: 2,
  updatedBy: "admin",
  now: buffNow,
});
buffs.setBuff({
  guildId: "buff-guild",
  type: "diamonds",
  percent: 200,
  hours: 2,
  updatedBy: "admin",
  now: buffNow,
});
dropConfig.setGameConfig(
  "buff-guild",
  "GAME_ITEM_DROP_MULTIPLIER",
  10,
  "admin",
);
buffs.setBuff({
  guildId: "buff-guild",
  type: "free_pull",
  percent: 1000,
  hours: 2,
  updatedBy: "admin",
  now: buffNow,
});
buffs.setBuff({
  guildId: "buff-guild",
  type: "gacha_luck",
  percent: 200,
  hours: 2,
  updatedBy: "admin",
  now: buffNow,
});
const buffSettlement =
  require("../src/services/economyService").recordGameResult({
    guildId: "buff-guild",
    userId: "alice",
    game: "mines",
    outcome: "win",
  });
assert.deepEqual(
  buffSettlement.bonusDrops.map((drop) => drop.type),
  ["coins", "diamonds", "item"],
);
const buffItemDrop = buffSettlement.bonusDrops.find(
  (drop) => drop.type === "item",
);
assert(
  require("../src/services/gameItemDropService")
    .dropPool("mines")
    .some((item) => item.id === buffItemDrop.itemId),
  "chỉ rơi vật phẩm của chính game Mines",
);
assert.equal(
  require("../src/services/shopService").getInventoryQuantity(
    "buff-guild",
    "alice",
    buffItemDrop.itemId,
  ),
  1,
);
assert.equal(buffSettlement.balance, 1_500);
assert.equal(levels.getPlayerProgression("buff-guild", "alice").diamonds, 14);
assert.equal(
  gacha.getTicketBalances("buff-guild", "alice").single,
  0,
  "không còn rơi vé Gacha dùng chung",
);
assert.equal(buffs.gachaLuckMultiplier("buff-guild", buffNow), 2);
assert.equal(buffs.listBuffs("buff-guild", buffNow + 3 * 3_600_000).length, 0);
for (const key of [
  "GAME_COIN_DROP_CHANCE",
  "GAME_DIAMOND_DROP_CHANCE",
  "GAME_ITEM_DROP_MULTIPLIER",
])
  dropConfig.setGameConfig("drop-rate-guild", key, 0, "admin");
assert.deepEqual(
  buffs.rollGameDrops({
    guildId: "drop-rate-guild",
    userId: "alice",
    game: "mines",
    randomInt: () => 0,
  }),
  [],
);
dropConfig.setGameConfig(
  "drop-rate-guild",
  "GAME_DIAMOND_DROP_MAX",
  4,
  "admin",
);
dropConfig.setGameConfig(
  "drop-rate-guild",
  "GAME_DIAMOND_DROP_MIN",
  2,
  "admin",
);
dropConfig.setGameConfig(
  "drop-rate-guild",
  "GAME_DIAMOND_DROP_CHANCE",
  1,
  "admin",
);
const rangedDrops = buffs.rollGameDrops({
  guildId: "drop-rate-guild",
  userId: "alice",
  game: "mines",
  randomInt: (minimum, maximum) => (maximum === undefined ? 0 : maximum - 1),
});
assert.deepEqual(
  rangedDrops.map((drop) => [drop.type, drop.amount]),
  [["diamonds", 4]],
);
// Thưởng vật phẩm theo game: mỗi game một tỷ lệ riêng, chỉ rơi vật phẩm của chính game đó, độ hiếm cố định
const itemDrop = require("../src/services/gameItemDropService");
const dropGames = [
  "baucua",
  "taixiu",
  "duangua",
  "oantuti",
  "blackjack",
  "poker",
  "mines",
  "chinchiro",
  "coquay",
  "vuatiengviet",
];
assert(
  new Set(dropGames.map((game) => itemDrop.GAME_ITEM_DROP_CHANCE[game])).size >
    1,
  "mỗi game có tỷ lệ riêng",
);
assert.equal(
  itemDrop.dropChance("hardcore", 1),
  0,
  "Sinh tồn chưa có vật phẩm riêng nên không rơi",
);
assert.equal(itemDrop.dropChance("mines", 100), 1, "tỷ lệ tối đa 100%");
const { itemGames } = require("../src/services/itemGameService");
for (const game of dropGames) {
  const items = itemDrop.dropPool(game);
  assert(items.length > 0, `${game} phải có vật phẩm riêng`);
  assert(
    items.every(
      (item) =>
        itemGames(item).includes(game) &&
        !["gacha_ticket_1", "gacha_ticket_10", "effect_cleanser"].includes(
          item.id,
        ),
    ),
    `${game} không được rơi vật phẩm chung`,
  );
  for (let i = 0; i < 300; i += 1) {
    const picked = itemDrop.pickDropItem(game);
    assert(items.some((item) => item.id === picked.id));
  }
}
{
  // độ hiếm cố định, không phụ thuộc số vật phẩm: Mines có 2 vật phẩm R nhưng R vẫn chỉ chiếm đúng tỷ lệ bậc R
  const N = 100_000;
  const counts = {};
  const rItems = {};
  for (let i = 0; i < N; i += 1) {
    const item = itemDrop.pickDropItem("mines");
    counts[item.rarity] = (counts[item.rarity] || 0) + 1;
    if (item.rarity === "R") rItems[item.id] = (rItems[item.id] || 0) + 1;
  }
  const active = ["R", "SR", "SSR"].reduce(
    (sum, rarity) => sum + itemDrop.DROP_RARITY_RATES[rarity],
    0,
  );
  for (const rarity of ["R", "SR", "SSR"])
    assert(
      Math.abs(
        counts[rarity] / N - itemDrop.DROP_RARITY_RATES[rarity] / active,
      ) < 0.01,
      `Mines ${rarity}`,
    );
  assert(!counts.UR, "Mines không có vật phẩm UR");
  assert(
    Object.values(rItems).every(
      (count) => Math.abs(count / counts.R - 0.5) < 0.02,
    ),
    "hai vật phẩm R ra đều nhau",
  );
  // game khác nhau có tỷ lệ khác nhau
  const rateOf = (game, n = 60_000) => {
    let hits = 0;
    const dropCfg = "rate-guild";
    for (let i = 0; i < n; i += 1)
      if (
        require("crypto").randomInt(10_000) <
        Math.round(itemDrop.dropChance(game, 1) * 10_000)
      )
        hits += 1;
    return hits / n;
  };
  assert(
    Math.abs(rateOf("poker") - 0.06) < 0.01 &&
      Math.abs(rateOf("oantuti") - 0.03) < 0.01,
  );
}
dropConfig.setGameConfig(
  "drop-rate-guild",
  "GAME_ITEM_DROP_MULTIPLIER",
  1,
  "admin",
);
const forcedDrops = buffs.rollGameDrops({
  guildId: "drop-rate-guild",
  userId: "dropper",
  game: "poker",
  randomInt: (minimum, maximum) => (maximum === undefined ? 0 : minimum),
});
const forcedItem = forcedDrops.find((drop) => drop.type === "item");
assert(
  forcedItem &&
    itemGames(
      require("../src/services/itemCatalogService").getCatalogItem(
        forcedItem.itemId,
      ),
    ).includes("poker"),
  "rơi vật phẩm Poker sau ván Poker",
);
assert.match(
  require("../src/utils/rewardText").bonusLine([forcedItem]),
  /BUFF SỰ KIỆN.+\[(R|SR|SSR|UR)\]/,
);
dropConfig.setGameConfig(
  "drop-rate-guild",
  "GAME_ITEM_DROP_MULTIPLIER",
  0,
  "admin",
);
assert.deepEqual(
  buffs
    .rollGameDrops({
      guildId: "drop-rate-guild",
      userId: "dropper",
      game: "poker",
      randomInt: () => 0,
    })
    .filter((drop) => drop.type === "item"),
  [],
  "hệ số 0 tắt rơi vật phẩm",
);
const xpResult = levels.addExperience("level-guild", "alice", 200, {
  now: 4000,
});
assert.equal(xpResult.level, 2);
assert.equal(xpResult.levelUps[0].coins, 10_000);
const progressionPreview = require("../src/services/progressionService");
assert.equal(
  progressionPreview.getDailyMissions(
    "mission-guild",
    "alice",
    Date.UTC(2026, 8, 26),
  ).length,
  3,
);
assert.deepEqual(
  progressionPreview.getDailyMissions(
    "mission-guild",
    "alice",
    Date.UTC(2026, 8, 26),
  ),
  progressionPreview.getDailyMissions(
    "mission-guild",
    "alice",
    Date.UTC(2026, 8, 26),
  ),
);
const missionNow = Date.UTC(2026, 8, 26, 12);
progressionPreview.getProgress("mission-guild", "alice", missionNow);
db.prepare(
  "UPDATE player_progress SET daily_json=? WHERE guild_id='mission-guild' AND user_id='alice'",
).run(
  JSON.stringify({
    games: 999,
    wins: 999,
    quizWins: 999,
    wagered: 999_999_999,
  }),
);
const missionRewards = progressionPreview.claimMissions(
  "mission-guild",
  "alice",
  "daily",
  missionNow,
);
assert.equal(missionRewards.length, 4);
assert(
  missionRewards.some(
    (reward) =>
      reward.id === "__daily_bonus__" && reward.diamonds === 20 && !reward.item,
  ),
);
assert.equal(
  progressionPreview.claimMissions(
    "mission-guild",
    "alice",
    "daily",
    missionNow,
  ).length,
  0,
);
const shopCommand = require("../src/commands/shop");
assert.equal(
  shopCommand.shopSelectRow("alice").toJSON().components[0].options.length,
  12,
);
const effects = require("../src/services/effectStateService");
effects.addEffectCharge("stack-guild", "alice", "blackjack_redraw", {
  charges: 1,
});
effects.addEffectCharge("stack-guild", "alice", "blackjack_redraw", {
  charges: 1,
});
assert.equal(
  effects.getActiveEffect("stack-guild", "alice", "blackjack_redraw").charges,
  1,
);
effects.addEffectCharge("stack-guild", "alice", "blackjack_swap", {
  charges: 1,
});
assert.equal(
  effects.consumeHighestEffect("stack-guild", "alice", [
    "blackjack_swap",
    "blackjack_redraw",
  ]).effect_id,
  "blackjack_swap",
);
assert.equal(
  effects.getActiveEffect("stack-guild", "alice", "blackjack_redraw").charges,
  1,
);
const itemEffects = require("../src/services/itemEffectService");
require("../src/services/shopService").addInventory(
  "stack-use-guild",
  "alice",
  "rps_counter_charm",
  2,
);
itemEffects.useItem({
  guildId: "stack-use-guild",
  userId: "alice",
  channelId: "channel",
  itemId: "rps_counter_charm",
});
assert.throws(
  () =>
    itemEffects.useItem({
      guildId: "stack-use-guild",
      userId: "alice",
      channelId: "channel",
      itemId: "rps_counter_charm",
    }),
  /EFFECT_ALREADY_ACTIVE/,
);
assert.equal(
  require("../src/services/shopService").getInventoryQuantity(
    "stack-use-guild",
    "alice",
    "rps_counter_charm",
  ),
  1,
);
const multiplayer = require("../src/services/multiplayerGameService");
assert.deepEqual(
  multiplayer.rollResult("taixiu", [6, 6, 6], null, { noTriple: true }).dice,
  [6, 6, 1],
);
effects.addEffectCharge("eye-limit-guild", "alice", "dice_divine_eye", {
  metadata: { roundId: "round-eye" },
});
dropConfig.setGameConfig("eye-limit-guild", "DIVINE_EYE_MAX_BET", 4321, "test");
assert.equal(
  multiplayer.effectiveBetLimit(
    { id: "round-eye", guild_id: "eye-limit-guild", game: "taixiu" },
    "alice",
  ),
  4321,
);
for (const effectId of [
  "blackjack_redraw",
  "blackjack_swap",
  "blackjack_first_ace",
])
  effects.addEffectCharge("blackjack-item-guild", "alice", effectId);
const itemBlackjack =
  require("../src/services/blackjackService").startBlackjack({
    guildId: "blackjack-item-guild",
    channelId: "channel",
    userId: "alice",
    stake: 10,
    forcedDeck: ["2♣", "3♣", "4♠", "5♦", "A♥"],
  });
assert.equal(itemBlackjack.state.hands[0].cards[0].startsWith("A"), true);
assert.equal(itemBlackjack.state.itemEffect, null);
assert.equal(
  effects.getActiveEffect("blackjack-item-guild", "alice", "blackjack_swap")
    .charges,
  1,
);
require("../src/services/blackjackService").playAction({
  sessionId: itemBlackjack.session.id,
  userId: "alice",
  action: "forfeit",
});
effects.addEffectCharge("mines-shield-guild", "alice", "mines_blast_shield");
const shieldMines = require("../src/services/minesService").startMines({
  guildId: "mines-shield-guild",
  channelId: "channel",
  userId: "alice",
  stake: 10,
  mineCount: 2,
  forcedMines: [0, 2],
  forcedSpecial: 1,
});
const shieldHit = require("../src/services/minesService").playMines({
  sessionId: shieldMines.session.id,
  userId: "alice",
  action: "open",
  cell: 0,
});
assert.equal(shieldHit.settled, false);
assert.equal(shieldHit.state.shieldUsed, true);
assert.equal(shieldHit.state.mines.includes(0), false);
assert.equal(shieldHit.state.mines.includes(2), true);
const secondMine = require("../src/services/minesService").playMines({
  sessionId: shieldMines.session.id,
  userId: "alice",
  action: "open",
  cell: 2,
});
assert.equal(
  secondMine.settled,
  true,
  "khiên chỉ dùng một lần trên mỗi bản đồ: mìn thứ hai phải phát nổ",
);
assert.equal(secondMine.exploded, 2);
assert.equal(secondMine.result.outcome, "loss");
const chinchiro = require("../src/services/chinchiroService");
assert.equal(chinchiro.evaluateDice([1, 2, 3]).kind, "hifumi");
{
  const appEmoji = require("../src/utils/appEmoji");
  const chinchiroState = {
    stake: 100,
    dealer: null,
    player: {
      attempts: [{ dice: [1, 5, 6], hand: { label: "Điểm" } }],
      hand: { label: "Điểm" },
    },
    result: null,
  };
  const diceText = () =>
    chinchiro
      .chinchiroEmbed(chinchiroState, "u")
      .toJSON()
      .fields.find((field) => field.name.includes("NGƯỜI CHƠI")).value;
  appEmoji.setApplicationEmojisForTest([]);
  assert.match(
    diceText(),
    /:one: :five: :six:/,
    "chưa tải emoji ứng dụng thì dùng emoji dự phòng",
  );
  appEmoji.setApplicationEmojisForTest([
    ["dieWhite1", "111"],
    ["dieWhite5", "555"],
    ["dieWhite6", "666"],
  ]);
  assert.match(
    diceText(),
    /<:dieWhite1:111> <:dieWhite5:555> <:dieWhite6:666>/,
    "dùng emoji của ứng dụng theo tên",
  );
  assert.equal(appEmoji.appEmoji("missing", "x"), "x");
  assert.deepEqual(appEmoji.appEmojiObject("dieWhite5"), {
    id: "555",
    name: "dieWhite5",
    animated: false,
  });
  appEmoji.setApplicationEmojisForTest([["spin", "9", true]]);
  assert.equal(appEmoji.appEmoji("spin"), "<a:spin:9>");
  appEmoji.setApplicationEmojisForTest([]);
}
assert.equal(chinchiro.evaluateDice([6, 4, 5]).kind, "shigoro");
assert.equal(chinchiro.evaluateDice([1, 1, 1]).kind, "pin_zoro");
assert.equal(chinchiro.evaluateDice([4, 4, 4]).kind, "zoro");
assert.deepEqual(chinchiro.evaluateDice([3, 6, 3]), {
  kind: "point",
  point: 6,
  label: "Điểm 6",
});
assert.equal(chinchiro.evaluateDice([1, 4, 6]), null);
assert(
  chinchiro
    .rollTurn({
      seed: "otsuki",
      side: "player",
      effect: "chinchiro_otsuki_dice",
    })
    .attempts.every((attempt) =>
      attempt.dice.every((value) => value >= 4 && value <= 6),
    ),
);
assert(
  chinchiro
    .rollTurn({
      seed: "weighted",
      side: "player",
      effect: "chinchiro_weighted_dice",
    })
    .attempts.every((attempt) => attempt.dice[0] >= 4),
);
let hifumiSeed;
for (let seed = 0; seed < 20_000 && hifumiSeed === undefined; seed += 1) {
  const dealer = chinchiro.rollTurn({ seed: String(seed), side: "dealer" });
  const player = chinchiro.rollTurn({
    seed: String(seed),
    side: "player",
    shonben: true,
  });
  if (
    chinchiro.dealerDecision(dealer.hand) === null &&
    player.hand.kind === "hifumi"
  )
    hifumiSeed = String(seed);
}
assert.notEqual(hifumiSeed, undefined);
for (const key of [
  "GAME_COIN_DROP_CHANCE",
  "GAME_DIAMOND_DROP_CHANCE",
  "GAME_ITEM_DROP_MULTIPLIER",
])
  dropConfig.setGameConfig("chinchiro-karma-guild", key, 0, "test");
effects.addEffectCharge("chinchiro-karma-guild", "alice", "chinchiro_karma");
effects.addEffectCharge(
  "chinchiro-karma-guild",
  "alice",
  "chinchiro_otsuki_dice",
);
effects.addEffectCharge(
  "chinchiro-karma-guild",
  "alice",
  "chinchiro_weighted_dice",
);
effects.addEffectCharge(
  "chinchiro-karma-guild",
  "alice",
  "chinchiro_soundproof_bowl",
);
const karmaGame = chinchiro.startChinchiro({
  guildId: "chinchiro-karma-guild",
  channelId: "channel",
  userId: "alice",
  stake: 100,
  forcedSeed: hifumiSeed,
});
assert.equal(karmaGame.immediate, false);
assert.equal(karmaGame.state.effect, "chinchiro_karma");
const karmaResult = chinchiro.shakeChinchiro(karmaGame.session.id, "alice");
assert.equal(karmaResult.state.player.hand.kind, "hifumi");
assert.equal(karmaResult.result.karmaTriggered, true);
assert.equal(karmaResult.result.payout, 300);
assert.equal(karmaResult.result.balance, 1200);
assert.equal(
  effects.getActiveEffect("chinchiro-karma-guild", "alice", "chinchiro_karma"),
  null,
);
assert.equal(
  effects.getActiveEffect(
    "chinchiro-karma-guild",
    "alice",
    "chinchiro_otsuki_dice",
  ).charges,
  1,
);
for (const key of [
  "GAME_COIN_DROP_CHANCE",
  "GAME_DIAMOND_DROP_CHANCE",
  "GAME_ITEM_DROP_MULTIPLIER",
])
  dropConfig.setGameConfig("chinchiro-hifumi-guild", key, 0, "test");
const hifumiGame = chinchiro.startChinchiro({
  guildId: "chinchiro-hifumi-guild",
  channelId: "channel",
  userId: "alice",
  stake: 100,
  forcedSeed: hifumiSeed,
});
const hifumiResult = chinchiro.shakeChinchiro(hifumiGame.session.id, "alice");
assert.equal(hifumiResult.result.outcome, "loss");
assert.equal(hifumiResult.result.extraPenalty, 100);
assert.equal(hifumiResult.result.balance, 800);
const pokerEngine = require("../src/services/pokerEngine");
assert.equal(
  pokerEngine.evaluateFive(["A♠", "9♥", "8♦", "7♣", "6♠"], true).name,
  "Sảnh",
);
assert.equal(
  pokerEngine.describeHand(
    pokerEngine.evaluateFive(["A♠", "K♥", "9♦", "8♣", "6♠"]),
  ),
  "Lá cao nhất: A",
);
const shortFlush = pokerEngine.evaluateFive(
  ["A♠", "J♠", "9♠", "8♠", "6♠"],
  true,
);
const shortFullHouse = pokerEngine.evaluateFive(
  ["K♠", "K♥", "K♦", "Q♣", "Q♠"],
  true,
);
assert(pokerEngine.compareHands(shortFlush, shortFullHouse) > 0);
const omahaHand = pokerEngine.bestHand(
  ["A♠", "A♦", "2♣", "3♣", "4♣"],
  ["A♥", "K♥", "Q♥", "J♥", "10♥"],
  "omaha",
);
assert.equal(omahaHand.name, "Bộ ba");
const omahaOneHoleQueen = pokerEngine.bestHand(
  ["Q♣", "2♥", "A♦", "6♣", "10♦"],
  ["Q♠", "K♥", "K♣", "Q♥"],
  "omaha",
);
assert.equal(omahaOneHoleQueen.name, "Bộ ba");
const omahaFullHouse = pokerEngine.bestHand(
  ["Q♣", "K♦", "A♦", "6♣", "10♦"],
  ["Q♠", "K♥", "K♣", "Q♥"],
  "omaha",
);
assert.equal(omahaFullHouse.name, "Cù lũ");
assert.deepEqual(omahaFullHouse.kickers, [13, 12]);
const potExample = pokerEngine.buildPots([
  { id: "A", committed: 1000, folded: false },
  { id: "B", committed: 3000, folded: false },
  { id: "C", committed: 5000, folded: false },
]);
assert.deepEqual(
  potExample.pots.map((pot) => ({
    amount: pot.amount,
    eligible: pot.eligible,
  })),
  [
    { amount: 3000, eligible: ["A", "B", "C"] },
    { amount: 4000, eligible: ["B", "C"] },
  ],
);
assert.equal(potExample.refunds.C, 2000);
const profileGames = require("../src/services/playerGameStatsService");
const emptyProfileStats = profileGames.getAllGameStats(
  "profile-test",
  "new-player",
);
assert.equal(emptyProfileStats.length, 11);
assert(
  emptyProfileStats.every(
    (item) => item.played === 0 && item.wagered === 0 && item.net === 0,
  ),
);
assert.equal(profileGames.summarizeGameStats(emptyProfileStats).activeGames, 0);
const profileMenu = profileCommand
  .profileSelectRow("owner", "target", emptyProfileStats)
  .toJSON();
assert.equal(profileMenu.components[0].options.length, 12);
assert.equal(
  profileMenu.components[0].options.filter((option) => option.default).length,
  1,
);
assert(
  !profileMenu.components[0].options
    .find((option) => option.value === "vuatiengviet")
    .description.includes("%"),
);
const rps = require("../src/services/rpsDuelService");
const economy = require("../src/services/economyService");
const gameConfig = require("../src/services/gameConfigService");
assert.equal(
  gameConfig.getGameConfig("config-guild", "ECONOMY_STARTING_COINS"),
  economy.STARTING_COINS,
);
gameConfig.setGameConfig(
  "config-guild",
  "ECONOMY_STARTING_COINS",
  4321,
  "admin",
);
assert.equal(economy.getAccount("config-guild", "new-player").balance, 4321);
assert.equal(gameConfig.listGameConfigs("config-guild").length, 23);
assert.throws(
  () =>
    gameConfig.setGameConfig(
      "config-guild",
      "HARD_QUESTION_CHANCE",
      2,
      "admin",
    ),
  /INVALID_GAME_CONFIG_VALUE/,
);
assert.equal(
  gameConfig.resetGameConfig("config-guild", "ECONOMY_STARTING_COINS")
    .customized,
  false,
);
gameConfig.setGameConfig(
  "hard-config-guild",
  "HARD_QUESTION_CHANCE",
  1,
  "admin",
);
gameConfig.setGameConfig(
  "hard-config-guild",
  "HARD_QUESTION_DURATION_SECONDS",
  45,
  "admin",
);
const configuredHardQuestion = fun.startVuaSession("hard-config-guild", {
  now: 1,
}).question;
assert.equal(configuredHardQuestion.hard, true);
assert.equal(configuredHardQuestion.durationSeconds, 45);
assert.equal(configuredHardQuestion.expiresAt, 45_001);
fun.endVuaSession("hard-config-guild");
gameConfig.setGameConfig(
  "reward-config-guild",
  "VUATIENGVIET_REWARD",
  777,
  "admin",
);
assert.equal(
  require("../src/services/gameRewardService").getGameReward(
    "reward-config-guild",
    "vuatiengviet",
  ),
  777,
);
assert.equal(
  gameConfig.resetGameConfig("reward-config-guild", "VUATIENGVIET_REWARD")
    .customized,
  false,
);
gameConfig.setGameConfig(
  "level-config-guild",
  "LEVEL_XP_PER_LEVEL",
  100,
  "admin",
);
assert.equal(
  require("../src/services/playerLevelService").addExperience(
    "level-config-guild",
    "alice",
    100,
  ).level,
  2,
);
gameConfig.setGameConfig("exp-config-guild", "GAME_EXP_BASE", 20, "admin");
gameConfig.setGameConfig(
  "exp-config-guild",
  "GAME_EXP_WIN_COIN_DIVISOR",
  100,
  "admin",
);
gameConfig.setGameConfig("exp-config-guild", "GAME_EXP_MAX", 30, "admin");
assert.equal(
  require("../src/services/playerLevelService").gameExperience(
    "win",
    5_000,
    1_000,
    "exp-config-guild",
  ),
  30,
);
const transfer = economy.transferCoins({
  guildId: "transfer-guild",
  fromUserId: "alice",
  toUserId: "bob",
  amount: 125,
});
assert.equal(transfer.senderBalance, 875);
assert.equal(transfer.receiverBalance, 1125);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) count FROM economy_transactions WHERE guild_id='transfer-guild'",
    )
    .get().count,
  2,
);
const economyDashboard = economy.getEconomyDashboard("transfer-guild");
assert.equal(economyDashboard.users, 2);
assert.equal(economyDashboard.activeUsers, 2);
assert(
  economyDashboard.categories.some((item) => item.category === "transfer"),
);
const operationalHealth =
  require("../src/services/operationalHealthService").getOperationalHealth();
assert.equal(operationalHealth.database.check, "ok");
assert.equal(operationalHealth.database.migration, 24);
assert(Number.isSafeInteger(operationalHealth.active.total));
const starter = require("../src/services/onboardingService");
const starterFirst = starter.claimStarterPack("starter-guild", "alice", 1000);
const starterSecond = starter.claimStarterPack("starter-guild", "alice", 2000);
assert.equal(starterFirst.claimed, true);
assert.equal(
  starterFirst.balance,
  economy.STARTING_COINS + starter.STARTER_COINS,
);
assert.equal(starterSecond.claimed, false);
const idempotentFirst = economy.settleReservedGame({
  guildId: "idempotent-guild",
  userId: "alice",
  payout: 125,
  stake: 100,
  game: "mines",
  outcome: "win",
  operationId: "settle:mines:test-session",
});
const idempotentSecond = economy.settleReservedGame({
  guildId: "idempotent-guild",
  userId: "alice",
  payout: 125,
  stake: 100,
  game: "mines",
  outcome: "win",
  operationId: "settle:mines:test-session",
});
assert(idempotentFirst.balance >= 1125);
assert.equal(idempotentSecond.balance, idempotentFirst.balance);
assert.equal(idempotentSecond.duplicate, true);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS count FROM economy_transactions WHERE operation_id = ?",
    )
    .get("settle:mines:test-session").count,
  1,
);
assert.equal(
  db
    .prepare(
      "SELECT played FROM game_player_stats WHERE guild_id='idempotent-guild' AND user_id='alice' AND game='mines'",
    )
    .get().played,
  1,
);
assert.equal(
  require("../src/services/progressionService").getGameHistory(
    "idempotent-guild",
    "alice",
    10,
  ).length,
  1,
);
const achievement = require("../src/services/achievementService");
assert.equal(
  achievement
    .getAchievements("idempotent-guild", "alice")
    .find((item) => item.id === "first_game").complete,
  true,
);
assert.equal(
  achievement
    .claimAchievements("idempotent-guild", "alice")
    .some((item) => item.id === "first_game"),
  true,
);
assert.equal(
  achievement.claimAchievements("idempotent-guild", "alice").length,
  0,
);
const vuaProgressBefore =
  require("../src/services/playerLevelService").getPlayerProgression(
    "vua-profile-guild",
    "alice",
  );
economy.rewardGame({
  guildId: "vua-profile-guild",
  userId: "alice",
  amount: 250,
  game: "vuatiengviet",
  outcome: "win",
});
economy.rewardGame({
  guildId: "vua-profile-guild",
  userId: "alice",
  amount: 500,
  game: "vuatiengviet",
  outcome: "win",
});
const vuaProgressAfter =
  require("../src/services/playerLevelService").getPlayerProgression(
    "vua-profile-guild",
    "alice",
  );
assert.equal(vuaProgressAfter.experience, vuaProgressBefore.experience);
const vuaStats = profileGames
  .getAllGameStats("vua-profile-guild", "alice")
  .find((item) => item.game === "vuatiengviet");
assert.equal(vuaStats.coinsEarned, 750);
const vuaProfileJson = profileCommand
  .gameDetailEmbed(
    {
      username: "alice",
      displayAvatarURL: () => "https://example.com/avatar.png",
    },
    economy.getAccount("vua-profile-guild", "alice"),
    1,
    { color: { value: "#5865F2" } },
    vuaStats,
    "Server Hồ Sơ",
  )
  .toJSON();
assert.match(vuaProfileJson.fields[0].value, /750 :coin:/);
assert.match(vuaProfileJson.title, /SERVER HỒ SƠ/);
assert(!JSON.stringify(vuaProfileJson).includes("Tỷ lệ thắng"));
const progression = require("../src/services/progressionService");
const tournamentNow = Date.UTC(2026, 0, 12, 12);
progression.recordGameEvent({
  guildId: "ranking-guild",
  userId: "alice",
  game: "mines",
  outcome: "win",
  now: tournamentNow,
});
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) count FROM weekly_scores WHERE guild_id='ranking-guild'",
    )
    .get().count,
  0,
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) count FROM season_scores WHERE guild_id='ranking-guild'",
    )
    .get().count,
  0,
);
const baseExperience = progression.recordGameEvent({
  guildId: "exp-boost-guild",
  userId: "alice",
  game: "mines",
  outcome: "loss",
  now: tournamentNow,
});
assert.equal(baseExperience.experienceGained, 10);
const limiter = require("../src/services/rateLimitService").createRateLimiter();
assert.equal(limiter.consume("alice", 2, 1000, 1000).allowed, true);
assert.equal(limiter.consume("alice", 2, 1000, 1100).allowed, true);
assert.equal(limiter.consume("alice", 2, 1000, 1200).allowed, false);
assert.equal(limiter.consume("alice", 2, 1000, 2101).allowed, true);
limiter.stop();
const roleRewards = require("../src/services/weeklyRoleRewardService");
const roleConfig = roleRewards.setWeeklyRoleReward({
  guildId: "role-reward-guild",
  roleId: "vip",
  amount: 25_000,
  createdBy: "admin",
  now: Date.UTC(2026, 8, 27, 12),
});
assert.equal(roleRewards.listWeeklyRoleRewards("role-reward-guild").length, 1);
const roleRewardNow = Date.UTC(2026, 8, 27, 12);
const firstRoleGrant = roleRewards.claimWeeklyRoleRewards({
  guildId: "role-reward-guild",
  userId: "alice",
  roleIds: ["vip"],
  now: roleRewardNow,
});
assert.equal(firstRoleGrant.total, 25_000);
assert.equal(economy.getAccount("role-reward-guild", "alice").balance, 26_000);
assert.throws(
  () =>
    roleRewards.claimWeeklyRoleRewards({
      guildId: "role-reward-guild",
      userId: "alice",
      roleIds: ["vip"],
      now: roleRewardNow,
    }),
  /ALREADY_CLAIMED/,
);
assert.throws(
  () =>
    roleRewards.claimWeeklyRoleRewards({
      guildId: "role-reward-guild",
      userId: "bob",
      roleIds: ["member"],
      now: roleRewardNow,
    }),
  /NO_ELIGIBLE_ROLE/,
);
assert.equal(economy.getAccount("role-reward-guild", "alice").balance, 26_000);
assert.equal(
  roleRewards.removeWeeklyRoleReward("role-reward-guild", "vip"),
  true,
);
for (const guildId of [
  "duel-guild",
  "card-guild",
  "both-bust-guild",
  "bust-loss-guild",
  "stand-rule-guild",
  "stand-duel-guild",
  "poker-guild",
  "poker-config-guild",
]) {
  for (const key of [
    "GAME_COIN_DROP_CHANCE",
    "GAME_DIAMOND_DROP_CHANCE",
    "GAME_ITEM_DROP_MULTIPLIER",
  ]) {
    gameConfig.setGameConfig(guildId, key, 0, "test");
  }
}
const duel = rps.createDuel({
  guildId: "duel-guild",
  channelId: "duel-channel",
  challengerId: "alice",
  opponentId: "bob",
  stake: 100,
  now: 1000,
});
assert.equal(duel.status, "invited");
assert.equal(rps.acceptDuel(duel.id, "bob", 2000).status, "playing");
assert.equal(economy.getAccount("duel-guild", "alice").balance, 900);
assert.equal(economy.getAccount("duel-guild", "bob").balance, 900);
assert.equal(rps.chooseHand(duel.id, "alice", "bua", 3000).completed, false);
const duelResult = rps.chooseHand(duel.id, "bob", "keo", 4000);
assert.equal(duelResult.completed, true);
assert.equal(duelResult.challengerAccount.experienceGained, 10);
assert.match(
  JSON.stringify(rps.duelEmbed(duelResult.duel, duelResult).toJSON()),
  /\+10 :test_tube:/,
);
assert.equal(duelResult.duel.winner_id, "alice");
assert.equal(economy.getAccount("duel-guild", "alice").balance, 1100);
assert.equal(economy.getAccount("duel-guild", "bob").balance, 900);
const timeout = rps.createDuel({
  guildId: "timeout-guild",
  channelId: "duel-channel",
  challengerId: "alice",
  opponentId: "bob",
  stake: 250,
  now: 1000,
});
rps.acceptDuel(timeout.id, "bob", 2000);
const expired = rps.expireDuel(timeout.id, 2000 + rps.PLAY_TTL_MS + 1);
assert.equal(
  expired.refunded,
  false,
  "không ai chọn kịp thì không ai được hoàn cược",
);
assert.deepEqual(expired.forfeited.sort(), ["alice", "bob"]);
assert.equal(economy.getAccount("timeout-guild", "alice").balance, 750);
assert.equal(economy.getAccount("timeout-guild", "bob").balance, 750);
const blackjackDuel = require("../src/services/blackjackDuelService");
const cardDuel = blackjackDuel.createBlackjackDuel({
  guildId: "card-guild",
  channelId: "card-channel",
  challengerId: "alice",
  opponentId: "bob",
  stake: 100,
  now: 1000,
});
const acceptedCardDuel = blackjackDuel.acceptBlackjackDuel(
  cardDuel.id,
  "bob",
  2000,
  ["9♣", "8♣", "K♠", "8♦", "A♥"],
);
assert.equal(acceptedCardDuel.status, "playing");
{
  const standDuel = blackjackDuel.createBlackjackDuel({
    guildId: "stand-duel-guild",
    channelId: "c",
    challengerId: "carol",
    opponentId: "dan",
    stake: 100,
    now: 1000,
  });
  blackjackDuel.acceptBlackjackDuel(standDuel.id, "dan", 2000, [
    "9♣",
    "8♣",
    "K♠",
    "7♦",
    "A♥",
  ]);
  assert.throws(
    () => blackjackDuel.playBlackjackDuel(standDuel.id, "dan", "stand", 3000),
    /MUST_HIT/,
    "đấu người cũng phải đủ 16 điểm mới được dừng (8+7=15)",
  );
  blackjackDuel.playBlackjackDuel(standDuel.id, "dan", "hit", 3001);
}
const cardResult = blackjackDuel.playBlackjackDuel(
  cardDuel.id,
  "bob",
  "stand",
  3000,
);
assert.equal(cardResult.settled, true);
assert.equal(cardResult.duel.progression.length, 2);
assert.match(
  JSON.stringify(blackjackDuel.blackjackDuelEmbed(cardResult.duel).toJSON()),
  /\+10 :test_tube:/,
);
assert.equal(cardResult.duel.winner_id, "alice");
assert.equal(economy.getAccount("card-guild", "alice").balance, 1100);
assert.equal(economy.getAccount("card-guild", "bob").balance, 900);
assert.doesNotThrow(() =>
  blackjackDuel.blackjackDuelEmbed(cardResult.duel).toJSON(),
);
assert.doesNotThrow(() => rps.duelEmbed(duelResult.duel).toJSON());
const cardTimeout = blackjackDuel.createBlackjackDuel({
  guildId: "card-timeout",
  channelId: "card-channel",
  challengerId: "alice",
  opponentId: "bob",
  stake: 200,
  now: 1000,
});
blackjackDuel.acceptBlackjackDuel(cardTimeout.id, "bob", 2000, [
  "2♣",
  "3♣",
  "4♠",
  "5♦",
]);
const expiredCardDuel = blackjackDuel.expireBlackjackDuel(
  cardTimeout.id,
  2000 + blackjackDuel.PLAY_TTL_MS + 1,
);
assert.equal(
  expiredCardDuel.refunded,
  false,
  "không ai hoàn tất lượt thì không ai được hoàn cược",
);
assert.deepEqual(expiredCardDuel.forfeited.sort(), ["alice", "bob"]);
assert.equal(economy.getAccount("card-timeout", "alice").balance, 800);
assert.equal(economy.getAccount("card-timeout", "bob").balance, 800);
const blackjack = require("../src/services/blackjackService");
{
  // Chỉ được dừng khi có ít nhất 16 điểm; nhà cái rút đến khi có ít nhất 15
  assert.equal(blackjack.PLAYER_MIN_STAND, 16);
  assert.equal(blackjack.DEALER_MIN_STAND, 15);
  const started = blackjack.startBlackjack({
    guildId: "stand-rule-guild",
    channelId: "c",
    userId: "alice",
    stake: 100,
    forcedDeck: ["5♠", "9♣", "6♦", "9♥", "5♦"],
  });
  const buttons = (state) =>
    blackjack.actionRows(started.session.id, state)[0].toJSON().components;
  const named = (state, name) =>
    buttons(state).find((item) => item.custom_id.endsWith(`:${name}`));
  assert.equal(
    named(started.state, "stand").disabled,
    true,
    "dưới 16 điểm nút Dừng bị khóa",
  );
  assert.match(named(started.state, "stand").label, /cần ≥16/);
  assert.equal(named(started.state, "hit").disabled, false);
  assert.throws(
    () =>
      blackjack.playAction({
        sessionId: started.session.id,
        userId: "alice",
        action: "stand",
      }),
    /MUST_HIT/,
  );
  const hitTo16 = blackjack.playAction({
    sessionId: started.session.id,
    userId: "alice",
    action: "hit",
  });
  assert.equal(hitTo16.settled, false);
  assert.equal(
    named(hitTo16.state, "stand").disabled,
    false,
    "đủ 16 điểm được dừng",
  );
  assert.equal(named(hitTo16.state, "stand").label, "Dừng");
  const stood = blackjack.playAction({
    sessionId: started.session.id,
    userId: "alice",
    action: "stand",
  });
  assert.equal(stood.settled, true);
  assert.equal(stood.state.dealer.length, 2, "nhà cái 18 điểm không rút thêm");
}
// Người chơi quắc mà nhà cái không quắc thì thua (nhà cái 10+6=16 đã đủ 15 nên không rút)
const bustLossStarted = blackjack.startBlackjack({
  guildId: "bust-loss-guild",
  channelId: "blackjack-channel",
  userId: "alice",
  stake: 100,
  forcedDeck: ["10♣", "5♣", "6♥", "9♠", "10♥", "10♠"],
});
const bustLoss = blackjack.playAction({
  sessionId: bustLossStarted.session.id,
  userId: "alice",
  action: "hit",
});
assert.equal(bustLoss.settled, true);
assert.equal(bustLoss.result.outcome, "loss");
assert.equal(bustLoss.result.results[0].label, "Quắc · Thua");
assert.equal(
  bustLoss.state.dealer.length,
  2,
  "nhà cái đủ 16 điểm nên không rút thêm",
);
assert.equal(economy.getAccount("bust-loss-guild", "alice").balance, 900);
// Cả hai cùng quắc → hòa, hoàn cược (nhà cái 10+4=14 phải rút và quắc)
const bothBustStarted = blackjack.startBlackjack({
  guildId: "both-bust-guild",
  channelId: "blackjack-channel",
  userId: "alice",
  stake: 100,
  forcedDeck: ["10♣", "5♣", "4♥", "9♠", "10♥", "10♠"],
});
const bothBustResult = blackjack.playAction({
  sessionId: bothBustStarted.session.id,
  userId: "alice",
  action: "hit",
});
assert.equal(bothBustResult.settled, true);
assert.equal(bothBustResult.result.outcome, "draw");
assert.equal(bothBustResult.result.payout, 100);
assert.equal(bothBustResult.result.experienceGained, 10);
assert.match(
  JSON.stringify(
    blackjack
      .blackjackEmbed(bothBustResult.state, "alice", bothBustResult.result)
      .toJSON(),
  ),
  /\+10 :test_tube:/,
);
assert.match(
  blackjack
    .blackjackEmbed(bothBustResult.state, "alice", bothBustResult.result)
    .toJSON().description,
  /10♠/,
);
assert.equal(
  bothBustResult.result.results[0].label,
  "Quắc · Hòa (cả hai quắc)",
);
assert.equal(
  economy.getAccount("both-bust-guild", "alice").balance,
  1000,
  "cả hai quắc thì hoàn cược",
);
assert.match(
  JSON.stringify(
    blackjack
      .actionRows("x", bothBustResult.state, true)
      .map((row) => row.toJSON()),
  ),
  /replay:blackjack/,
);
assert(
  !/blackjack:x:(hit|stand|double|split)/.test(
    JSON.stringify(
      blackjack
        .actionRows("x", bothBustResult.state, true)
        .map((row) => row.toJSON()),
    ),
  ),
  "quắc/kết thúc thì khóa hết nút thao tác",
);
const poker = require("../src/services/pokerService");
assert.equal(poker.POKER_ANTE, 50);
assert.equal(
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='word_suggestions'",
    )
    .get(),
  undefined,
);
const pokerStarted = poker.startPoker({
  guildId: "poker-guild",
  channelId: "poker-channel",
  userId: "alice",
  variant: "texas",
});
assert.equal(pokerStarted.state.ante, 50);
assert.equal(economy.getAccount("poker-guild", "alice").balance, 950);
gameConfig.setGameConfig("poker-config-guild", "POKER_ANTE", 75, "admin");
const configuredPoker = poker.startPoker({
  guildId: "poker-config-guild",
  channelId: "poker-channel",
  userId: "alice",
  variant: "texas",
});
assert.equal(configuredPoker.state.ante, 75);
assert.equal(economy.getAccount("poker-config-guild", "alice").balance, 925);
poker.playerAction(configuredPoker.session.id, "alice", "fold");
assert.match(poker.playerEval(pokerStarted.state), /·/);
const botRead = poker.botEvaluation(
  pokerStarted.state,
  pokerStarted.state.players[1],
);
assert(botRead.power >= 0 && botRead.power <= 1);
assert.equal(
  poker.choosePineappleDiscard(
    { variant: "pineapple", board: ["Q♠", "J♠", "10♥"] },
    { hole: ["A♠", "K♠", "2♦"], revealedCard: "A♠" },
  ),
  2,
);
assert.equal(pokerStarted.state.board.length, 3);
assert.equal(pokerStarted.state.players[0].hole.length, 2);
assert.equal(
  pokerStarted.state.players[1].revealedCard,
  pokerStarted.state.players[1].hole[0],
);
assert.equal(
  pokerStarted.state.players[2].revealedCard,
  pokerStarted.state.players[2].hole[0],
);
assert.doesNotThrow(() =>
  poker.pokerEmbed(pokerStarted.state, "alice").toJSON(),
);
assert.match(
  poker.pokerEmbed(pokerStarted.state, "alice").toJSON().description,
  /BÀI CỦA BOT/,
);
assert.match(
  poker.pokerEmbed(pokerStarted.state, "alice").toJSON().description,
  /Set mạnh nhất hiện tại:/,
);
const pokerFolded = poker.playerAction(
  pokerStarted.session.id,
  "alice",
  "fold",
);
assert.equal(pokerFolded.phase, "complete");
assert.equal(pokerFolded.result.experienceGained, 10);
assert.match(
  JSON.stringify(poker.pokerEmbed(pokerFolded, "alice").toJSON()),
  /\+10 :test_tube:/,
);
assert.equal(economy.getAccount("poker-guild", "alice").balance, 950);
const raisedPoker = poker.startPoker({
  guildId: "poker-raise-guild",
  channelId: "poker-channel",
  userId: "alice",
  variant: "texas",
});
const afterRaise = poker.playerAction(
  raisedPoker.session.id,
  "alice",
  "raise",
  10,
);
assert(
  afterRaise.players.some(
    (player) => player.id.startsWith("bot_") && !player.folded,
  ),
  "Bot không được đồng loạt bỏ bài chỉ vì người chơi raise",
);
assert.equal(
  afterRaise.opp?.streets?.flop?.action,
  "raise",
  "Bot ghi lại hành vi tố của người chơi để đọc bài",
);
assert(afterRaise.opp.streets.flop.frac > 0);
if (afterRaise.phase !== "complete")
  poker.playerAction(raisedPoker.session.id, "alice", "fold");
const betLimits = require("../src/services/gameBetLimitService");
betLimits.setGameBetLimit("poker-limit-guild", "poker", 100);
const cappedPoker = poker.startPoker({
  guildId: "poker-limit-guild",
  channelId: "poker-channel",
  userId: "alice",
  variant: "texas",
});
assert.equal(poker.maxRaiseAmount(cappedPoker.state, "poker-limit-guild"), 50);
assert.equal(
  poker.pokerRows(cappedPoker.session.id, cappedPoker.state)[0].components[0]
    .data.disabled,
  false,
);
const balanceBeforeInvalidRaise = economy.getAccount(
  "poker-limit-guild",
  "alice",
).balance;
assert.throws(
  () => poker.playerAction(cappedPoker.session.id, "alice", "raise", 51),
  /BET_LIMIT/,
);
assert.equal(
  economy.getAccount("poker-limit-guild", "alice").balance,
  balanceBeforeInvalidRaise,
);
assert.equal(
  JSON.parse(poker.getSession(cappedPoker.session.id).state_json).players[0]
    .committed,
  50,
);
betLimits.setGameBetLimit("poker-limit-guild", "poker", 55);
assert.equal(
  poker.pokerRows(cappedPoker.session.id, cappedPoker.state)[0].components[0]
    .data.disabled,
  true,
);
assert.throws(
  () => poker.playerAction(cappedPoker.session.id, "alice", "raise", 10),
  /BET_LIMIT/,
);
assert.equal(
  economy.getAccount("poker-limit-guild", "alice").balance,
  balanceBeforeInvalidRaise,
);
poker.playerAction(cappedPoker.session.id, "alice", "fold");
betLimits.setGameBetLimit("rps-limit-guild", "oantuti", 100);
assert.throws(
  () =>
    rps.createDuel({
      guildId: "rps-limit-guild",
      channelId: "c",
      challengerId: "alice",
      opponentId: "bob",
      stake: 500,
    }),
  /BET_LIMIT/,
);
assert.throws(
  () =>
    require("../src/services/rpsBotService").createRpsBotRound({
      guildId: "rps-limit-guild",
      channelId: "c",
      userId: "alice",
      stake: 500,
      choice: "bua",
    }),
  /BET_LIMIT/,
);
for (const variant of ["texas", "sixplus", "pineapple", "omaha"]) {
  const started = poker.startPoker({
    guildId: `poker-${variant}`,
    channelId: "poker-channel",
    userId: "runner",
    variant,
  });
  let state = started.state;
  let actions = 0;
  while (state.phase !== "complete" && actions < 20) {
    state =
      state.phase === "discard"
        ? poker.discardCard(started.session.id, "runner", 0)
        : poker.playerAction(started.session.id, "runner", "call");
    actions += 1;
  }
  assert.equal(state.phase, "complete", `${variant} không kết thúc`);
  assert.equal(state.board.length, 5);
  assert.doesNotThrow(() => poker.pokerEmbed(state, "runner").toJSON());
}
const mines = require("../src/services/minesService");
assert.equal(mines.sameSpecialLine(1, 6), true);
assert.equal(mines.sameSpecialLine(7, 6), true);
assert.equal(mines.sameSpecialLine(2, 6), false);
const mineGame = mines.startMines({
  guildId: "mines-special",
  channelId: "mines-channel",
  userId: "hunter",
  stake: 100,
  mineCount: 2,
  forcedMines: [0, 19],
  forcedSpecial: 6,
});
let mineTurn = mines.playMines({
  sessionId: mineGame.session.id,
  userId: "hunter",
  action: "open",
  cell: 1,
});
assert.deepEqual(mineTurn.state.alerts, [1]);
assert.match(mineTurn.state.lastSignal, /Báo động/);
mineTurn = mines.playMines({
  sessionId: mineGame.session.id,
  userId: "hunter",
  action: "open",
  cell: 5,
});
assert.equal(mineTurn.state.alerts.length, 1);
assert.doesNotMatch(mineTurn.state.lastSignal, /Báo động/);
const baseMineMultiplier = mines.currentMultiplier(mineTurn.state);
mineTurn = mines.playMines({
  sessionId: mineGame.session.id,
  userId: "hunter",
  action: "open",
  cell: 6,
});
assert.equal(mineTurn.state.specialFound, true);
assert(mines.currentMultiplier(mineTurn.state) > baseMineMultiplier);
const mineLabels = mines
  .minesRows(mineGame.session.id, mineTurn.state)
  .flatMap((row) => row.components.map((button) => button.data.label));
assert(!mineLabels.includes("🚨"));
assert.equal(mineLabels.filter((label) => label === "💎").length, 2);
assert(mineLabels.includes("🌟"));
const minesUi = mines.minesEmbed(mineTurn.state, "hunter").toJSON();
assert(!JSON.stringify(minesUi).includes("Kiểm chứng công bằng"));
const mineCashout = mines.playMines({
  sessionId: mineGame.session.id,
  userId: "hunter",
  action: "cashout",
});
assert.equal(mineCashout.settled, true);
assert(mineCashout.result.payout > 100);
assert(mineCashout.result.experienceGained >= 10);
assert.match(
  JSON.stringify(
    mines.minesEmbed(mineCashout.state, "hunter", mineCashout.result).toJSON(),
  ),
  /:test_tube:/,
);
const coinRequests = require("../src/services/coinRequestService");
const requestBase = Date.parse("2026-09-25T03:00:00Z");
for (let index = 0; index < coinRequests.DAILY_REQUEST_LIMIT; index += 1) {
  coinRequests.createCoinRequest({
    guildId: "beg-limit",
    channelId: "coins",
    requesterId: "beggar",
    targetId: `target-${index}`,
    amount: 1,
    now: requestBase + index * 61_000,
  });
}
assert.throws(
  () =>
    coinRequests.createCoinRequest({
      guildId: "another-guild",
      channelId: "coins",
      requesterId: "beggar",
      targetId: "target-limit",
      amount: 1,
      now: requestBase + 5 * 61_000,
    }),
  /DAILY_REQUEST_LIMIT/,
);
assert.doesNotThrow(() =>
  coinRequests.createCoinRequest({
    guildId: "beg-limit",
    channelId: "coins",
    requesterId: "beggar",
    targetId: "target-next-day",
    amount: 1,
    now: requestBase + 86_400_000,
  }),
);
db.close();
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
console.log(
  JSON.stringify({
    ok: true,
    commands: expectedCommands.length,
    games: GAMES.length,
    shopItems: catalog.length,
  }),
);
