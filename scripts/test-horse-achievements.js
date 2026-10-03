const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-horse-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const horse = require("../src/services/horseRaceService");
const horseRepo = require("../src/services/horseRaceRepository");
const { recordHorseRun } = require("../src/services/horseRecordService");
const { createFairness } = require("../src/services/fairnessService");
const { getAchievements, achievementCategory, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

const G = "g";
for (const key of ["GAME_COIN_DROP_CHANCE", "GAME_DIAMOND_DROP_CHANCE", "GAME_ITEM_DROP_MULTIPLIER"]) config.setGameConfig(G, key, 0, "test");
const record = (user) => db.prepare("SELECT * FROM horse_records WHERE guild_id=? AND user_id=?").get(G, user);
const progress = (user, id) => getAchievements(G, user).find((item) => item.id === id);
const logger = { error() {}, warn() {}, info() {} };

// betsFor(market) -> [{ horse, amount }]; chooseWinner(market) -> horse key
async function race(user, { special = false, betsFor, chooseWinner }) {
  const market = horse.generateRaceMarket(Date.now(), { forceSpecial: special });
  const id = crypto.randomBytes(4).toString("hex");
  horseRepo.createRound({ id, guild_id: G, channel_id: "c", status: "open", closes_at: Date.now() - 1, created_at: Date.now() }, { market, fair: createFairness() });
  economy.creditCoins({ guildId: G, userId: user, amount: 5_000_000, reason: "test" });
  for (const bet of betsFor(market)) {
    economy.spendCoins({ guildId: G, userId: user, amount: bet.amount, reason: "test-horse" });
    horseRepo.addBet(id, user, bet.horse, bet.amount);
  }
  const settled = await horse.settleHorseRace(id, null, logger, chooseWinner(market));
  return { settled, row: settled.settlements.find((entry) => entry.userId === user), market };
}
const richest = (market) => [...market.selected].sort((a, b) => market.horses[b].multiplier - market.horses[a].multiplier)[0];

(async () => {
  // 1) Thắng một ngựa cửa dưới: ghi hệ số, chuỗi 1, thắng
  let r = await race("solo", { betsFor: (m) => [{ horse: richest(m), amount: 1000 }], chooseWinner: richest });
  assert.equal(r.row.outcome, "win");
  const mult = r.market.horses[richest(r.market)].multiplier;
  assert.equal(record("solo").best_win_multiplier, mult);
  assert.equal(record("solo").current_streak, 1);
  assert.equal(record("solo").spread_wins, 0, "chỉ cược 1 ngựa nên không tính rải cược");
  assert.equal(progress("solo", "horse_wins_5").progress, 1);
  assert.equal(progress("solo", "horse_mult_10").complete, mult >= 10);
  assert(progress("solo", "horse_pot_20k").progress >= 0);

  // 2) Thua: chuỗi về 0 nhưng chuỗi tốt nhất giữ nguyên; hệ số cao nhất không đổi
  r = await race("solo", { betsFor: (m) => [{ horse: m.selected[0], amount: 1000 }], chooseWinner: (m) => m.selected[1] });
  assert.equal(r.row.outcome, "loss");
  assert.equal(record("solo").current_streak, 0);
  assert.equal(record("solo").best_streak, 1);
  assert.equal(record("solo").best_win_multiplier, mult);
  assert.equal(progress("solo", "horse_played_25").progress, 2);
  assert.equal(progress("solo", "horse_wins_5").progress, 1, "ván thua không tính thắng");

  // 3) Rải cược trên 3 ngựa và thắng (chọn ngựa cửa dưới để tổng vẫn lãi)
  r = await race("spread", {
    betsFor: (m) => { const top = richest(m); return [top, ...m.selected.filter((key) => key !== top).slice(0, 2)].map((key) => ({ horse: key, amount: 100 })); },
    chooseWinner: richest,
  });
  if (r.row.outcome === "win") assert.equal(record("spread").spread_wins, 1);
  else assert.equal(record("spread")?.spread_wins ?? 0, 0, "không lãi thì không tính rải cược thắng");
  // rải cược 2 ngựa không bao giờ tính
  r = await race("spread2", { betsFor: (m) => [richest(m), m.selected.find((key) => key !== richest(m))].map((key) => ({ horse: key, amount: 100 })), chooseWinner: richest });
  assert.equal(record("spread2").spread_wins, 0);

  // 4) Thiên Mã (hệ số của Thiên Mã thay đổi theo từng ván, tối đa x30)
  r = await race("star", { special: true, betsFor: () => [{ horse: horse.SPECIAL_HORSE_KEY, amount: 2000 }], chooseWinner: () => horse.SPECIAL_HORSE_KEY });
  const starMult = r.market.horses[horse.SPECIAL_HORSE_KEY].multiplier;
  assert.equal(r.row.outcome, "win");
  assert.equal(record("star").special_wins, 1);
  assert.equal(record("star").best_win_multiplier, starMult);
  assert(progress("star", "horse_special_1").complete && !progress("star", "horse_special_3").complete);
  assert.equal(progress("star", "horse_mult_30").complete, starMult >= 30);
  assert.equal(progress("star", "horse_mult_18").complete, starMult >= 18);
  assert.equal(progress("star", "horse_pot_20k").complete, Math.floor(2000 * starMult) >= 20000);
  assert.equal(progress("star", "horse_pot_200k").complete, false);

  // 5) Thắng bằng ngựa thường không cộng Thiên Mã
  assert.equal(record("solo").special_wins, 0);

  // 6) Chuỗi thắng nhiều ván liên tiếp, hòa giữ chuỗi
  for (let i = 0; i < 3; i += 1) await race("streak", { betsFor: (m) => [{ horse: richest(m), amount: 1000 }], chooseWinner: richest });
  assert.equal(record("streak").best_streak, 3);
  assert(progress("streak", "horse_streak_3").complete && !progress("streak", "horse_streak_5").complete);
  recordHorseRun({ guildId: G, userId: "streak", outcome: "draw" });
  assert.equal(record("streak").current_streak, 3, "hòa không phá chuỗi");
  recordHorseRun({ guildId: G, userId: "streak", outcome: "loss" });
  assert.equal(record("streak").current_streak, 0);
  assert.equal(record("streak").best_streak, 3);
  assert.equal(progress("nobody", "horse_streak_3").progress, 0, "không lẫn dữ liệu người khác");

  // Bộ lọc /kiemtra
  assert.equal(achievementCategory({ metric: "horseBigPayout" }), "horse");
  const embed = achievementPanel(G, "streak", "all", "horse", 0).embeds[0].toJSON();
  assert(String(embed.description || "").includes("Đua ngựa"), "bộ lọc Đua ngựa phải có kết quả");
  const menu = achievementPanel(G, "streak").components.map((row) => row.toJSON().components[0]).find((component) => component.custom_id?.startsWith("kiemtra-category"));
  assert(menu.options.length <= 25, `${menu.options.length} mục lọc`);
  const values = new Set(menu.options.map((option) => option.value));
  for (const item of ACHIEVEMENTS) assert(values.has(achievementCategory(item)), `${item.id} không có mục lọc`);

  console.log(JSON.stringify({ ok: true, horseAchievements: true, achievements: ACHIEVEMENTS.length, filters: menu.options.length }));
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
