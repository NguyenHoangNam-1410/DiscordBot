const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-chinchiro-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const chinchiro = require("../src/services/chinchiroService");
const { getAchievements, achievementCategory, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

const G = "g";
const record = (user) => db.prepare("SELECT * FROM chinchiro_records WHERE guild_id=? AND user_id=?").get(G, user);
const progress = (user, id) => getAchievements(G, user).find((item) => item.id === id);

// Chuỗi thắng: thắng +1, thua về 0, hòa giữ nguyên; tay đặc biệt chỉ tính khi thắng; Hifumi tính khi lắc ra
const R = chinchiro.recordChinchiroRun;
for (const outcome of ["win", "win", "draw", "win"]) R(G, "unit", "point", outcome);
assert.equal(record("unit").current_streak, 3, "hòa không phá chuỗi");
R(G, "unit", "shigoro", "win");
R(G, "unit", "zoro", "win");
R(G, "unit", "pin_zoro", "win");
assert.deepEqual([record("unit").shigoro_wins, record("unit").zoro_wins, record("unit").pin_zoro_wins], [1, 1, 1]);
R(G, "unit", "hifumi", "loss");
assert.equal(record("unit").current_streak, 0);
assert.equal(record("unit").best_streak, 6);
assert.equal(record("unit").hifumi, 1);
R(G, "unit", "shigoro", "loss");
R(G, "unit", "zoro", "draw");
assert.deepEqual([record("unit").shigoro_wins, record("unit").zoro_wins], [1, 1], "thua / hòa không cộng tay đặc biệt");
R(G, "unit", "hifumi", "win"); // Hifumi được Karma cứu: vẫn là Hifumi, thắng nhưng không tính thắng tay đặc biệt
assert.equal(record("unit").hifumi, 2);
assert.equal(record("unit").shigoro_wins, 1);

// Thành tựu theo số liệu
assert.equal(progress("unit", "chin_streak_5").complete, true);
assert.equal(progress("unit", "chin_streak_10").complete, false);
assert.equal(progress("unit", "chin_zoro_1").progress, 1);
assert.equal(progress("unit", "chin_zoro_3").progress, 2, "Bão gồm cả Pin-Zoro (1 Bão + 1 Pin-Zoro)");
assert.equal(progress("unit", "chin_pin_1").complete, true);
assert.equal(progress("unit", "chin_shigoro_1").complete, true);
assert.equal(progress("unit", "chin_hifumi_1").complete, true);
assert.equal(progress("unit", "chin_hifumi_10").progress, 2);
assert.equal(progress("nobody", "chin_streak_3").progress, 0, "không lẫn dữ liệu người khác");

// Chơi thật: số liệu trong DB khớp với kết quả từng ván
config.setGameConfig(G, "GAME_COIN_DROP_CHANCE", 0, "test");
economy.creditCoins({ guildId: G, userId: "real", amount: 50_000_000, reason: "test" });
const tally = { shigoro: 0, zoro: 0, pin: 0, hifumi: 0, streak: 0, best: 0, wins: 0 };
const apply = (kind, outcome) => {
  if (outcome === "win") { tally.wins += 1; tally.streak += 1; tally.best = Math.max(tally.best, tally.streak); }
  else if (outcome === "loss") tally.streak = 0;
  if (outcome === "win" && kind === "shigoro") tally.shigoro += 1;
  if (outcome === "win" && kind === "zoro") tally.zoro += 1;
  if (outcome === "win" && kind === "pin_zoro") tally.pin += 1;
  if (kind === "hifumi") tally.hifumi += 1;
};
const seen = new Set();
for (let game = 0; game < 400; game += 1) {
  db.prepare("DELETE FROM chinchiro_cooldowns").run(); // bỏ thời gian chờ 30 giây giữa các ván
  const started = chinchiro.startChinchiro({ guildId: G, channelId: "c", userId: "real", stake: 1000 });
  if (started.immediate) { apply(null, started.result.outcome); continue; }
  let step;
  do step = chinchiro.shakeChinchiro(started.session.id, "real"); while (!step.complete);
  const kind = step.state.player.hand.kind;
  seen.add(kind);
  apply(kind, step.result.outcome);
}
const real = record("real");
assert.equal(real.shigoro_wins, tally.shigoro);
assert.equal(real.zoro_wins, tally.zoro);
assert.equal(real.pin_zoro_wins, tally.pin);
assert.equal(real.hifumi, tally.hifumi);
assert.equal(real.best_streak, tally.best);
assert.equal(real.current_streak, tally.streak);
assert.equal(progress("real", "chin_wins_100").progress, Math.min(100, tally.wins), "số ván thắng lấy từ thống kê game");
assert(seen.size >= 3, `đã gặp ${[...seen]}`);

// Bộ lọc /kiemtra: nhóm chỉ số, không vượt 25 mục
assert.equal(achievementCategory({ metric: "chinchiroPinZoro" }), "chinchiroHands");
assert.equal(achievementCategory({ metric: "gachaUR" }), "gachaRare");
assert.equal(achievementCategory({ metric: "hardcoreEscapes" }), "hardcoreJourney");
assert.equal(achievementCategory({ metric: "minesStars" }), "minesFeats");
assert.equal(achievementCategory({ metric: "games" }), "games");
for (const category of ["chinchiroWins", "chinchiroHands", "chinchiroStreak", "minesFeats", "gachaRare", "hardcoreJourney"]) {
  const embed = achievementPanel(G, "real", "all", category, 0).embeds[0].toJSON();
  assert(String(embed.description || "").length > 10, `bộ lọc ${category} phải có kết quả`);
}
const menu = achievementPanel(G, "real").components.map((row) => row.toJSON().components[0]).find((component) => component.custom_id?.startsWith("kiemtra-category"));
assert(menu.options.length <= 25 && menu.options.length >= 15, `${menu.options.length} mục lọc`);
// Mọi thành tựu đều thuộc một mục lọc có trong menu
const values = new Set(menu.options.map((option) => option.value));
for (const item of ACHIEVEMENTS) assert(values.has(achievementCategory(item)), `${item.id} (${achievementCategory(item)}) không có mục lọc`);

console.log(JSON.stringify({ ok: true, chinchiroAchievements: true, achievements: ACHIEVEMENTS.length }));
process.exit(0);
