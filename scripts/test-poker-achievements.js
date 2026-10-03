const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-poker-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const poker = require("../src/services/pokerService");
const { recordPokerRun, standardRank } = require("../src/services/pokerRecordService");
const { getAchievements, achievementCategory, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

const G = "g";
const record = (user) => db.prepare("SELECT * FROM poker_records WHERE guild_id=? AND user_id=?").get(G, user);
const progress = (user, id) => getAchievements(G, user).find((item) => item.id === id);

// Quy đổi hạng bài: bộ 36 lá (sixplus) đảo Thùng và Cù lũ so với thang chuẩn
assert.equal(standardRank({ category: 5 }, "texas"), 5);
assert.equal(standardRank({ category: 5 }, "sixplus"), 6, "Cù lũ ở sixplus là category 5");
assert.equal(standardRank({ category: 6 }, "sixplus"), 5, "Thùng ở sixplus là category 6");
assert.equal(standardRank({ category: 8 }, "sixplus"), 8);
assert.equal(standardRank(null, "texas"), 0);

// Chỉ ván thắng mới ghi; hạng bài chỉ tính khi thắng ở Showdown
const win = (user, extra) => recordPokerRun({ guildId: G, userId: user, outcome: "win", ...extra });
win("unit", { reason: "showdown", score: { category: 7 }, variant: "texas", allIn: true });
win("unit", { reason: "everyone-folded", score: { category: 8 }, variant: "texas", allIn: true });
win("unit", { reason: "showdown", score: { category: 1 }, variant: "texas", pvp: true });
recordPokerRun({ guildId: G, userId: "unit", outcome: "loss", reason: "showdown", score: { category: 8 }, variant: "texas", allIn: true });
recordPokerRun({ guildId: G, userId: "unit", outcome: "draw", reason: "showdown", score: { category: 8 }, variant: "texas" });
assert.deepEqual({ ...record("unit") }, { ...record("unit"), best_win_rank: 7, fold_wins: 1, allin_wins: 1, pvp_wins: 1 }, "thua / hòa / thắng do bỏ bài không cộng hạng bài hay All-in");
assert.equal(progress("unit", "poker_hand_quads").complete, true);
assert.equal(progress("unit", "poker_hand_sf").complete, false);
assert.equal(progress("unit", "poker_hand_flush").complete, true, "Tứ quý đã bao gồm mốc Thùng");
assert.equal(progress("unit", "poker_fold_1").complete, true);
assert.equal(progress("unit", "poker_allin_1").complete, true);
assert.equal(progress("unit", "poker_pvp_1").complete, true);
assert.equal(progress("nobody", "poker_fold_1").progress, 0);

// Chơi thật: số liệu trong DB khớp với kết quả từng ván
config.setGameConfig(G, "GAME_COIN_DROP_CHANCE", 0, "test");
economy.creditCoins({ guildId: G, userId: "real", amount: 50_000_000, reason: "test" });
const tally = { wins: 0, fold: 0, allin: 0, best: 0, maxPot: 0 };
const reasons = new Set();
for (let game = 0; game < 240; game += 1) {
  const variant = ["texas", "sixplus", "pineapple", "omaha"][game % 4];
  const started = poker.startPoker({ guildId: G, channelId: "c", userId: "real", variant });
  let state = started.state;
  for (let guard = 0; guard < 40 && state.phase !== "complete"; guard += 1) {
    const action = game % 5 === 0 && guard === 0 ? "fold" : game % 3 === 0 && guard < 2 ? "raise" : "call";
    state = state.phase === "discard" ? poker.discardCard(started.session.id, "real", 0) : poker.playerAction(started.session.id, "real", action, action === "raise" ? 500 : 0);
  }
  assert.equal(state.phase, "complete", `ván ${variant} không kết thúc`);
  const result = state.result;
  reasons.add(result.reason);
  if (result.outcome !== "win") continue;
  tally.wins += 1;
  tally.maxPot = Math.max(tally.maxPot, result.payout);
  if (result.reason === "everyone-folded") tally.fold += 1;
  if (result.reason === "showdown") {
    if (state.players[0].allIn) tally.allin += 1;
    tally.best = Math.max(tally.best, standardRank(result.scores[state.players[0].id], state.variant));
  }
}
const real = record("real") || { best_win_rank: 0, fold_wins: 0, allin_wins: 0 };
assert.equal(real.best_win_rank, tally.best);
assert.equal(real.fold_wins, tally.fold);
assert.equal(real.allin_wins, tally.allin);
assert.equal(progress("real", "poker_pot_1m").progress, Math.min(1_000_000, tally.maxPot), "Pot lớn nhất lấy từ lịch sử ván");
assert(tally.wins > 5, `quá ít ván thắng (${tally.wins}) để so sánh`);

// Bộ lọc /kiemtra
assert.equal(achievementCategory({ metric: "pokerBigPot" }), "pokerFeats");
assert.equal(achievementCategory({ metric: "pokerHandRank" }), "pokerHands");
assert.equal(achievementCategory({ metric: "pokerWins" }), "pokerWins");
for (const category of ["pokerWins", "pokerHands", "pokerFeats"]) {
  const embed = achievementPanel(G, "real", "all", category, 0).embeds[0].toJSON();
  assert(String(embed.description || "").length > 10, `bộ lọc ${category} phải có kết quả`);
}
const menu = achievementPanel(G, "real").components.map((row) => row.toJSON().components[0]).find((component) => component.custom_id?.startsWith("kiemtra-category"));
assert(menu.options.length <= 25, `${menu.options.length} mục lọc`);
const values = new Set(menu.options.map((option) => option.value));
for (const item of ACHIEVEMENTS) assert(values.has(achievementCategory(item)), `${item.id} không có mục lọc`);

console.log(JSON.stringify({ ok: true, pokerAchievements: true, wins: tally.wins, reasons: [...reasons], achievements: ACHIEVEMENTS.length }));
process.exit(0);
