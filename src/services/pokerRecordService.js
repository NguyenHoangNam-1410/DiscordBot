const { db } = require("../db");

// Hạng bài theo thang chuẩn: bộ bài 36 lá (short deck) đổi chỗ Thùng và Cù lũ trong engine nên chuẩn hóa lại.
function standardRank(score, variant) {
  if (!score) return 0;
  if (variant === "sixplus" && score.category === 5) return 6;
  if (variant === "sixplus" && score.category === 6) return 5;
  return score.category;
}

// Số liệu riêng của Poker cho thành tựu; chỉ ghi khi người chơi thắng thật (nhận nhiều hơn số đã bỏ ra).
function recordPokerRun({ guildId, userId, outcome, reason, score = null, variant = null, allIn = false, pvp = false }) {
  if (outcome !== "win") return;
  const showdown = reason === "showdown";
  const foldWin = reason === "everyone-folded";
  db.prepare(
    `INSERT INTO poker_records(guild_id,user_id,best_win_rank,fold_wins,allin_wins,pvp_wins,updated_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(guild_id,user_id) DO UPDATE SET
       best_win_rank=MAX(best_win_rank,excluded.best_win_rank),
       fold_wins=fold_wins+excluded.fold_wins,
       allin_wins=allin_wins+excluded.allin_wins,
       pvp_wins=pvp_wins+excluded.pvp_wins,
       updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(userId),
    showdown ? standardRank(score, variant) : 0,
    foldWin ? 1 : 0,
    showdown && allIn ? 1 : 0,
    pvp ? 1 : 0,
    Date.now(),
  );
}

module.exports = { recordPokerRun, standardRank };
