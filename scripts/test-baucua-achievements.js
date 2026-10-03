const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-baucua-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const channels = require("../src/services/gameChannelService");
const multiplayer = require("../src/services/multiplayerGameService");
const { recordBauCuaRun } = require("../src/services/baucuaRecordService");
const { getAchievements, achievementCategory, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

const G = "g";
for (const key of ["GAME_COIN_DROP_CHANCE", "GAME_DIAMOND_DROP_CHANCE", "GAME_ITEM_DROP_MULTIPLIER"]) config.setGameConfig(G, key, 0, "test");
channels.setGameChannel(G, "baucua", "bc-channel");
const record = (user) => db.prepare("SELECT * FROM baucua_records WHERE guild_id=? AND user_id=?").get(G, user);
const progress = (user, id) => getAchievements(G, user).find((item) => item.id === id);
const interaction = { guildId: G, channelId: "bc-channel", client: null, reply: async () => ({ resource: { message: { id: "m" } } }) };

// Mở một ván thật, đặt cược trực tiếp vào DB (đã trừ xu), rồi chốt với biểu tượng ép sẵn
async function round(user, bets, symbols) {
  const opened = await multiplayer.createRound(interaction, "baucua");
  economy.creditCoins({ guildId: G, userId: user, amount: 5_000_000, reason: "test" });
  for (const [choice, amount] of bets) {
    economy.spendCoins({ guildId: G, userId: user, amount, reason: "test-bet" });
    db.prepare("INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(opened.id, user, choice, amount, Date.now(), Date.now());
  }
  const settled = await multiplayer.settleRound(opened.id, null, console, symbols);
  return settled.settlements.find((row) => row.userId === user);
}

(async () => {
  // Trúng đôi: bầu xuất hiện 2 lần → thắng (x3), đếm "trúng đôi", chưa tính ba con trùng
  let row = await round("a", [["bau", 1000]], ["bau", "bau", "ca"]);
  assert.equal(row.outcome, "win");
  assert.equal(record("a").double_hits, 1);
  assert.equal(record("a").triple_hits, 0);
  assert.equal(record("a").current_streak, 1);
  assert.equal(progress("a", "baucua_wins_5").progress, 1);
  assert.equal(progress("a", "baucua_double_5").progress, 1);

  // Ba con trùng (x4)
  row = await round("a", [["cua", 1000]], ["cua", "cua", "cua"]);
  assert.equal(row.payout, 4000);
  assert.equal(record("a").triple_hits, 1);
  assert.equal(record("a").best_streak, 2);
  assert(progress("a", "baucua_triple_1").complete && !progress("a", "baucua_triple_3").complete);

  // Thua: chuỗi về 0, chuỗi tốt nhất và số trúng giữ nguyên
  row = await round("a", [["tom", 1000]], ["bau", "ca", "ga"]);
  assert.equal(row.outcome, "loss");
  assert.equal(record("a").current_streak, 0);
  assert.equal(record("a").best_streak, 2);
  assert.equal(progress("a", "baucua_wins_5").progress, 2);
  assert.equal(progress("a", "baucua_played_25").progress, 3);

  // Cược nhiều cửa: trúng một cửa x2 mà thua tổng thì không tính; phủ 4 cửa vẫn lãi thì tính
  const four = [["bau", 2000], ["cua", 1000], ["tom", 1000], ["ca", 1000]];
  row = await round("spread", four, ["bau", "bau", "bau"]);
  assert.equal(row.outcome, "win", "Bầu ra ba lần trả 8.000 cho 5.000 đã cược: lãi");
  assert.equal(record("spread").spread_wins, 1);
  assert.equal(record("spread").triple_hits, 1);
  row = await round("spread", four, ["bau", "ga", "nai"]);
  assert.equal(row.outcome, "loss", "trả 4.000 cho 5.000 đã cược: thua");
  assert.equal(record("spread").spread_wins, 1, "thua tổng thì không tính phủ cửa");
  // Chỉ 3 cửa thì không đủ điều kiện phủ cửa dù thắng
  row = await round("three", [["bau", 2000], ["cua", 1000], ["tom", 1000]], ["bau", "bau", "bau"]);
  assert.equal(row.outcome, "win");
  assert.equal(record("three").spread_wins, 0);

  // Hòa giữ chuỗi (đơn vị)
  await round("draw", [["bau", 1000]], ["bau", "ca", "ga"]); // x2 → thắng, chuỗi 1
  recordBauCuaRun({ guildId: G, userId: "draw", outcome: "draw", bets: [{ choice: "bau", amount: 1, payout: 1 }], symbols: ["ca", "ga", "nai"] });
  assert.equal(record("draw").current_streak, 1, "hòa không phá chuỗi");
  assert.equal(record("draw").double_hits, 0);

  // Chuỗi thắng và pot lớn nhất
  for (let i = 0; i < 3; i += 1) await round("hot", [["nai", 10_000]], ["nai", "nai", "nai"]);
  assert.equal(record("hot").best_streak, 3);
  assert(progress("hot", "baucua_streak_3").complete && !progress("hot", "baucua_streak_5").complete);
  assert.equal(progress("hot", "baucua_pot_20k").complete, true, "40.000 xu trong một ván");
  assert.equal(progress("hot", "baucua_pot_200k").complete, false);
  assert.equal(progress("hot", "baucua_triple_3").complete, true);
  assert.equal(progress("nobody", "baucua_streak_3").progress, 0, "không lẫn dữ liệu người khác");

  // Tài xỉu dùng chung chốt ván nhưng không ghi số liệu Bầu cua
  const before = db.prepare("SELECT COUNT(*) c FROM baucua_records").get().c;
  channels.setGameChannel(G, "taixiu", "tx-channel");
  const tx = await multiplayer.createRound({ ...interaction, channelId: "tx-channel" }, "taixiu");
  economy.creditCoins({ guildId: G, userId: "txer", amount: 100_000, reason: "test" });
  economy.spendCoins({ guildId: G, userId: "txer", amount: 1000, reason: "test-bet" });
  db.prepare("INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(tx.id, "txer", "tai", 1000, Date.now(), Date.now());
  await multiplayer.settleRound(tx.id, null, console, [6, 5, 4]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM baucua_records").get().c, before, "Tài xỉu không ghi số liệu Bầu cua");

  // Bộ lọc /kiemtra
  assert.equal(achievementCategory({ metric: "baucuaTripleHits" }), "baucua");
  assert.equal(achievementCategory({ metric: "betStaked" }), "betMoney");
  assert.equal(achievementCategory({ metric: "betBigWin" }), "betMoney");
  for (const category of ["baucua", "betMoney"]) {
    const embed = achievementPanel(G, "hot", "all", category, 0).embeds[0].toJSON();
    assert(String(embed.description || "").length > 10, `bộ lọc ${category} phải có kết quả`);
  }
  const menu = achievementPanel(G, "hot").components.map((row) => row.toJSON().components[0]).find((component) => component.custom_id?.startsWith("kiemtra-category"));
  assert(menu.options.length <= 25, `${menu.options.length} mục lọc`);
  const values = new Set(menu.options.map((option) => option.value));
  for (const item of ACHIEVEMENTS) assert(values.has(achievementCategory(item)), `${item.id} không có mục lọc`);

  console.log(JSON.stringify({ ok: true, baucuaAchievements: true, achievements: ACHIEVEMENTS.length, filters: menu.options.length }));
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
