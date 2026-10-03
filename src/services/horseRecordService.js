const { db } = require("../db");

// Số liệu riêng của Đua ngựa cho thành tựu. Hòa không phá chuỗi thắng; thua về 0.
function recordHorseRun({ guildId, userId, outcome, winnerMultiplier = 0, winnerSpecial = false, distinctHorses = 1 }) {
  const win = outcome === "win";
  db.prepare(
    `INSERT INTO horse_records(guild_id,user_id,best_win_multiplier,special_wins,spread_wins,current_streak,best_streak,updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(guild_id,user_id) DO UPDATE SET
       best_win_multiplier=MAX(best_win_multiplier,excluded.best_win_multiplier),
       special_wins=special_wins+excluded.special_wins,
       spread_wins=spread_wins+excluded.spread_wins,
       current_streak=CASE WHEN ? = 'win' THEN current_streak+1 WHEN ? = 'loss' THEN 0 ELSE current_streak END,
       best_streak=MAX(best_streak, CASE WHEN ? = 'win' THEN current_streak+1 ELSE current_streak END),
       updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(userId),
    win ? winnerMultiplier : 0,
    win && winnerSpecial ? 1 : 0,
    win && distinctHorses >= 3 ? 1 : 0,
    win ? 1 : 0,
    win ? 1 : 0,
    Date.now(),
    outcome,
    outcome,
    outcome,
  );
}

module.exports = { recordHorseRun };
