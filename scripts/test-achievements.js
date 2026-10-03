const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const { getAchievements, claimAchievements, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length, "id thành tựu phải duy nhất");
const byMetric = (metric) => ACHIEVEMENTS.filter((item) => item.metric === metric);
for (const metric of ["hardcoreRuns", "hardcoreEscapes", "hardcoreCompletions", "betWins", "betGames", "betStaked", "betBigWin", "gachaPulls", "gachaSR", "gachaSSR", "gachaUR", "gachaSpent"])
  assert(byMetric(metric).length >= 2, `thiếu thành tựu ${metric}`);

const G = "g", U = "u";
const progress = (id) => getAchievements(G, U).find((item) => item.id === id);
assert.equal(progress("bet_wins_10").progress, 0);
assert.equal(progress("hc_runs_5").progress, 0);

const now = Date.now();
db.prepare("INSERT INTO hardcore_records(guild_id,user_id,best_floor,runs,deaths,escapes,completions,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(G, U, 12, 30, 20, 10, 1, now);
const stat = db.prepare("INSERT INTO game_player_stats(guild_id,game,user_id,played,wins,losses,draws,coins_earned,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
for (const [game, played, wins] of [["taixiu", 40, 12], ["blackjack", 20, 5], ["coquay", 3, 1], ["hardcore", 30, 20], ["vuatiengviet", 50, 40]]) stat.run(G, game, U, played, wins, played - wins, 0, 0, now);
const hist = db.prepare("INSERT INTO game_history(guild_id,user_id,game,outcome,stake,payout,created_at) VALUES(?,?,?,?,?,?,?)");
hist.run(G, U, "taixiu", "win", 60_000, 120_000, now);
hist.run(G, U, "blackjack", "loss", 50_000, 0, now);
hist.run(G, U, "vuatiengviet", "win", 999_999_999, 999_999_999, now); // không tính vào game cược

assert(progress("hc_runs_25").complete && !progress("hc_runs_100").complete);
assert(progress("hc_escape_10").complete && !progress("hc_escape_30").complete);
assert(progress("hc_clear_1").complete && !progress("hc_clear_5").complete);
assert.equal(progress("bet_wins_50").progress, 18, "chỉ cộng thắng ở game cược, bỏ Sinh tồn và Vua tiếng Việt");
assert(progress("bet_wins_10").complete && !progress("bet_wins_50").complete);
assert.equal(progress("bet_types_9").progress, 3);
assert(!progress("bet_types_5").complete);
assert.equal(progress("bet_staked_100k").progress, 100_000, "chỉ tính tiền cược game cược");
assert(progress("bet_staked_100k").complete && !progress("bet_staked_1m").complete);
assert(progress("bet_big_50k").complete && !progress("bet_big_500k").complete);

const gh = db.prepare("INSERT INTO gacha_history(guild_id,user_id,pulls,diamond_cost,results_json,created_at,payment_type) VALUES(?,?,?,?,?,?,?)");
const tiers = (list) => JSON.stringify(list.map((tier) => ({ tier })));
gh.run(G, U, 10, 900, tiers(["XU", "R", "R", "R", "R", "R", "R", "SR", "SR", "SSR"]), now, "diamonds");
gh.run(G, U, 1, 0, tiers(["UR"]), now, "gacha_ticket_1");
gh.run("other", U, 5, 500, tiers(["UR", "UR", "UR", "UR", "UR"]), now, "diamonds");
assert.equal(progress("gacha_pulls_10").progress, 10, "11 lượt trong server này, trần theo mục tiêu");
assert(progress("gacha_pulls_10").complete && !progress("gacha_pulls_50").complete);
assert.equal(progress("gacha_sr_100").progress, 4, "SR+ = SR, SSR, UR (2+1+1)");
assert.equal(progress("gacha_ssr_20").progress, 2, "SSR+ = SSR, UR");
assert.equal(progress("gacha_ur_10").progress, 1, "chỉ UR của server này");
assert(progress("gacha_ur_1").complete && !progress("gacha_ur_3").complete);
assert.equal(progress("gacha_spent_1k").progress, 900, "chỉ cộng kim cương đã tiêu, vé không tính");
assert(!progress("gacha_spent_1k").complete);

const claimed = claimAchievements(G, U).map((item) => item.id);
for (const id of ["hc_runs_25", "hc_escape_10", "hc_clear_1", "bet_wins_10", "bet_staked_100k", "bet_big_50k", "gacha_pulls_10", "gacha_ssr_1", "gacha_ur_1"]) assert(claimed.includes(id), `phải nhận được ${id}`);
const again = claimAchievements(G, U).map((item) => item.id);
assert(again.every((id) => !claimed.includes(id)), "không nhận trùng thành tựu đã nhận (xu thưởng có thể mở thêm mốc xu)");

for (const category of ["gachaPulls", "gachaRare", "gachaSpent", "hardcoreFloor", "hardcoreJourney", "betWins", "betGames", "betMoney"]) {
  const embed = achievementPanel(G, U, "all", category, 0).embeds[0].toJSON();
  assert(String(embed.description || JSON.stringify(embed.fields)).length > 10, `bộ lọc ${category} phải có kết quả`);
}
console.log(JSON.stringify({ ok: true, achievements: ACHIEVEMENTS.length }));
process.exit(0);
