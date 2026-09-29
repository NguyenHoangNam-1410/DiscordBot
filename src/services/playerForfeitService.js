const { db } = require('../db');

// Stakes of games in progress are held outside the wallet and come back when a game ends. Clearing a player's coins therefore has to
// close their games without a refund, otherwise the cleared coins return (or grow into winnings) when the game finishes.
function forfeitActiveGames({ guildId, userId, adminId }) {
  const guild = String(guildId); const user = String(userId); const admin = String(adminId);
  const blackjack = require('./blackjackService');
  const mines = require('./minesService');
  const chinchiro = require('./chinchiroService');
  const hardcore = require('./hardcoreService');
  const poker = require('./pokerService');
  const rps = require('./rpsDuelService');
  const blackjackDuel = require('./blackjackDuelService');
  const options = { label: 'admin-clear', forfeit: true, forfeitUserId: user };
  return db.transaction(() => {
    let games = 0; let amount = 0;
    const solo = [
      ['blackjack_sessions', blackjack.forceEndBlackjackSession], ['mines_sessions', mines.forceEndMinesSession],
      ['chinchiro_sessions', chinchiro.forceEndChinchiroSession], ['hardcore_sessions', hardcore.forceEndHardcoreSession],
    ];
    for (const [table, forceEnd] of solo) {
      for (const row of db.prepare(`SELECT id FROM ${table} WHERE guild_id=? AND user_id=?`).all(guild, user)) {
        const result = forceEnd(row.id, guild, admin, options);
        if (result) { games += 1; amount += result.forfeited || 0; }
      }
    }
    for (const row of db.prepare('SELECT id, state_json FROM poker_sessions WHERE guild_id=?').all(guild)) {
      let state; try { state = JSON.parse(row.state_json); } catch { continue; }
      const seated = state.mode === 'multiplayer' ? state.players?.some(player => String(player.id) === user) : state.players?.[0]?.id === user;
      if (!seated) continue;
      const own = state.players.find(player => String(player.id) === user);
      if (poker.forceEndPokerSession(row.id, guild, admin, options)) { games += 1; amount += (own?.committed || 0) + (own?.lobbyAnte || 0); }
    }
    for (const row of db.prepare("SELECT id, stake FROM rps_duels WHERE guild_id=? AND status='playing' AND (challenger_id=? OR opponent_id=?)").all(guild, user, user)) {
      if (rps.forceEndRpsDuel(row.id, guild, admin, Date.now(), options)) { games += 1; amount += row.stake; }
    }
    for (const row of db.prepare("SELECT id, stake FROM blackjack_duels WHERE guild_id=? AND status='playing' AND (challenger_id=? OR opponent_id=?)").all(guild, user, user)) {
      if (blackjackDuel.forceEndBlackjackDuel(row.id, guild, admin, Date.now(), options)) { games += 1; amount += row.stake; }
    }
    for (const row of db.prepare("SELECT id, dealer_id, ante, state_json FROM blackjack_tables WHERE guild_id=? AND status IN ('lobby','playing')").all(guild)) {
      let state; try { state = JSON.parse(row.state_json); } catch { continue; }
      const guest = state.players?.find(player => String(player.id) === user);
      if (row.dealer_id !== user && !guest) continue;
      if (blackjack.forceEndBlackjackTable(row.id, guild, admin, options)) { games += 1; amount += row.dealer_id === user ? row.ante * 3 : guest.stake; }
    }
    const openRounds = "SELECT id FROM multiplayer_rounds WHERE guild_id=? AND status IN ('open','racing')";
    const bets = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM multiplayer_bets WHERE user_id=? AND round_id IN (${openRounds})`).get(user, guild);
    if (bets.count) {
      db.prepare(`DELETE FROM multiplayer_bets WHERE user_id=? AND round_id IN (${openRounds})`).run(user, guild);
      games += 1; amount += bets.amount;
    }
    return { games, amount };
  })();
}

module.exports = { forfeitActiveGames };
