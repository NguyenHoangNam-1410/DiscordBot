const { db } = require("../db");

const GAME_LABELS = Object.freeze({
  baucua: "🎲 Bầu cua",
  taixiu: "🎯 Tài xỉu",
  chinchiro: "🎲 Chinchiro",
  blackjack: "🃏 Xì dách",
  poker: "♠️ Poker",
  duangua: "🏇 Đua ngựa",
  mines: "💣 Mines",
  coquay: "🔫 Cò quay Nga",
  hardcore: "⚔️ Sinh tồn",
  vuatiengviet: "🇻🇳 Vua tiếng Việt",
});

function getAllGameStats(guildId, userId) {
  const guild = String(guildId);
  const user = String(userId);
  const outcomes = new Map(
    db
      .prepare(
        "SELECT game,played,wins,losses,draws,coins_earned FROM game_player_stats WHERE guild_id=? AND user_id=?",
      )
      .all(guild, user)
      .map((row) => [row.game, row]),
  );
  const economy = new Map(
    db
      .prepare(
        `SELECT game,COUNT(*) recorded_games,COALESCE(SUM(stake),0) wagered,COALESCE(SUM(payout),0) payout
    FROM game_history WHERE guild_id=? AND user_id=? GROUP BY game`,
      )
      .all(guild, user)
      .map((row) => [row.game, row]),
  );
  return Object.entries(GAME_LABELS).map(([game, label]) => {
    const result = outcomes.get(game) || {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      coins_earned: 0,
    };
    const flow = economy.get(game) || {
      recorded_games: 0,
      wagered: 0,
      payout: 0,
    };
    const decided = result.wins + result.losses;
    return {
      game,
      label,
      played: result.played,
      wins: result.wins,
      losses: result.losses,
      draws: result.draws,
      winRate: decided ? (result.wins / decided) * 100 : 0,
      coinsEarned: result.coins_earned || 0,
      recordedGames: flow.recorded_games,
      wagered: flow.wagered,
      payout: flow.payout,
      net: flow.payout - flow.wagered,
    };
  });
}

function summarizeGameStats(stats) {
  const active = stats.filter((item) => item.played > 0);
  const favorite =
    [...active].sort((a, b) => b.played - a.played || b.wins - a.wins)[0] ||
    null;
  return {
    activeGames: active.length,
    favorite,
    wagered: stats.reduce((sum, item) => sum + item.wagered, 0),
    payout: stats.reduce((sum, item) => sum + item.payout, 0),
    net: stats.reduce((sum, item) => sum + item.net, 0),
  };
}

module.exports = { GAME_LABELS, getAllGameStats, summarizeGameStats };
