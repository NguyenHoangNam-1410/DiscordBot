const { db } = require("../db");

// Số liệu riêng của Bầu cua cho thành tựu. Hòa không phá chuỗi thắng; thua về 0.
// `bets`: các cược của người chơi trong ván [{ choice, amount, payout }]; `symbols`: ba biểu tượng ra.
function recordBauCuaRun({ guildId, userId, outcome, bets, symbols }) {
  const matchesOf = (choice) => symbols.filter((symbol) => symbol === choice).length;
  const paying = bets.filter((bet) => bet.payout > 0);
  const triple = paying.filter((bet) => matchesOf(bet.choice) === 3).length;
  const double = paying.filter((bet) => matchesOf(bet.choice) === 2).length;
  const win = outcome === "win";
  db.prepare(
    `INSERT INTO baucua_records(guild_id,user_id,triple_hits,double_hits,spread_wins,current_streak,best_streak,updated_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(guild_id,user_id) DO UPDATE SET
       triple_hits=triple_hits+excluded.triple_hits,
       double_hits=double_hits+excluded.double_hits,
       spread_wins=spread_wins+excluded.spread_wins,
       current_streak=CASE WHEN ? = 'win' THEN current_streak+1 WHEN ? = 'loss' THEN 0 ELSE current_streak END,
       best_streak=MAX(best_streak, CASE WHEN ? = 'win' THEN current_streak+1 ELSE current_streak END),
       updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(userId),
    triple,
    double,
    win && new Set(bets.map((bet) => bet.choice)).size >= 4 ? 1 : 0,
    win ? 1 : 0,
    win ? 1 : 0,
    Date.now(),
    outcome,
    outcome,
    outcome,
  );
}

module.exports = { recordBauCuaRun };
