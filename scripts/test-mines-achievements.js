const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-mines-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const economy = require("../src/services/economyService");
const config = require("../src/services/gameConfigService");
const mines = require("../src/services/minesService");
const { getAchievements, ACHIEVEMENTS } = require("../src/services/achievementService");
const { achievementPanel } = require("../src/commands/kiemtra");

const G = "g", U = "u";
economy.creditCoins({ guildId: G, userId: U, amount: 1_000_000, reason: "test" });
for (const key of ["GAME_COIN_DROP_CHANCE", "GAME_DIAMOND_DROP_CHANCE", "GAME_ITEM_DROP_MULTIPLIER"]) config.setGameConfig(G, key, 0, "test");
const progress = (id) => getAchievements(G, U).find((item) => item.id === id);
const record = () => db.prepare("SELECT * FROM mines_records WHERE guild_id=? AND user_id=?").get(G, U);

for (const metric of ["minesWins", "minesClears", "minesHardWin", "minesBestMultiplier", "minesStars"])
  assert(ACHIEVEMENTS.filter((item) => item.metric === metric).length >= 3, `thiếu thành tựu ${metric}`);
assert.equal(progress("mines_wins_5").progress, 0);

const run = (forcedMines, forcedSpecial, cells, finish) => {
  const started = mines.startMines({ guildId: G, userId: U, channelId: "c", stake: 1000, mineCount: forcedMines.length, forcedMines, forcedSpecial });
  let last = null;
  for (const cell of cells) {
    last = mines.playMines({ sessionId: started.session.id, userId: U, action: "open", cell });
    if (last.settled) return last;
  }
  return finish ? mines.playMines({ sessionId: started.session.id, userId: U, action: "cashout" }) : last;
};

// Ván 1: 2 mìn, mở ô sao rồi chốt lời → thắng, có sao, hệ số > 1
let result = run([0, 1], 5, [5, 6, 7], true);
assert.equal(result.result.outcome, "win");
assert.equal(record().clears, 0);
assert.equal(record().star_finds, 1);
assert.equal(record().max_mines_won, 2);
assert(record().best_multiplier > 1 && record().best_multiplier < 3);
assert.equal(progress("mines_wins_5").progress, 1);
assert.equal(progress("mines_star_1").complete, true);
assert.equal(progress("mines_hard_4").complete, false);

// Ván 2: 7 mìn, mở sạch 13 ô an toàn → quét sạch bãi, thắng với hệ số rất cao
result = run([0, 1, 2, 3, 4, 5, 6], 19, Array.from({ length: 13 }, (_, i) => i + 7), false);
assert.equal(result.result.reason, "cleared");
assert.equal(record().clears, 1);
assert.equal(record().max_mines_won, 7);
assert(progress("mines_clear_1").complete && !progress("mines_clear_5").complete);
assert(progress("mines_hard_7").complete, "thắng ván 7 mìn");
assert(progress("mines_mult_100").complete, `hệ số ${record().best_multiplier} phải đạt x100`);
assert.equal(progress("mines_star_1").progress, 1);
assert.equal(record().star_finds, 2);

// Ván 3: thua (nổ mìn) sau khi tìm thấy sao: tính sao, không tính thắng / hệ số
const before = { ...record() };
result = run([0, 1], 5, [5, 0], false);
assert.equal(result.result.outcome, "loss");
assert.equal(record().star_finds, before.star_finds + 1);
assert.equal(record().best_multiplier, before.best_multiplier, "ván thua không đổi hệ số cao nhất");
assert.equal(record().max_mines_won, 7);
assert.equal(progress("mines_wins_5").progress, 2);

// Ván bỏ cuộc không tính vào số liệu
const started = mines.startMines({ guildId: G, userId: U, channelId: "c", stake: 1000, mineCount: 2, forcedMines: [0, 1], forcedSpecial: 5 });
const stars = record().star_finds;
mines.playMines({ sessionId: started.session.id, userId: U, action: "open", cell: 5 });
mines.playMines({ sessionId: started.session.id, userId: U, action: "forfeit" });
assert.equal(record().star_finds, stars, "bỏ cuộc không cộng số liệu thành tựu");

// Dữ liệu người khác không bị lẫn
assert.equal(getAchievements(G, "other").find((item) => item.id === "mines_star_1").progress, 0);
// Bộ lọc /kiemtra
for (const category of ["minesWins", "minesFeats"]) {
  const embed = achievementPanel(G, U, "all", category, 0).embeds[0].toJSON();
  assert(String(embed.description || "").includes("Dò mìn"), `bộ lọc ${category} phải có kết quả`);
}
assert(achievementPanel(G, U).components[1].toJSON().components[0].options.length <= 25);

console.log(JSON.stringify({ ok: true, minesAchievements: true }));
process.exit(0);
