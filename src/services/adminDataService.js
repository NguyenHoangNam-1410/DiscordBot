const { db } = require('../db');

const clearPlayerDataTx = db.transaction(({ guildId, userId, scope, adminId, now = Date.now() }) => {
  if (!['coins', 'diamonds', 'xp', 'all'].includes(scope)) throw new Error('INVALID_CLEAR_SCOPE');
  const guild = String(guildId); const user = String(userId); const admin = String(adminId);
  const cleared = { coins: 0, diamonds: 0, level: 1, experience: 0 };

  if (scope === 'coins' || scope === 'all') {
    const account = db.prepare('SELECT balance FROM economy_accounts WHERE guild_id=? AND user_id=?').get(guild, user);
    if (account?.balance > 0) {
      cleared.coins = account.balance;
      db.prepare('UPDATE economy_accounts SET balance=0,updated_at=? WHERE guild_id=? AND user_id=?').run(now, guild, user);
      db.prepare(`INSERT INTO economy_transactions(guild_id,user_id,amount,balance_after,reason,operation_id,created_at)
        VALUES(?,?,?,0,?,?,?)`).run(guild, user, -account.balance, `admin-clear:${admin}`, null, now);
    }
  }

  if (scope === 'diamonds' || scope === 'all') {
    const currency = db.prepare('SELECT diamonds FROM player_currencies WHERE guild_id=? AND user_id=?').get(guild, user);
    if (currency?.diamonds > 0) {
      cleared.diamonds = currency.diamonds;
      db.prepare('UPDATE player_currencies SET diamonds=0,updated_at=? WHERE guild_id=? AND user_id=?').run(now, guild, user);
      db.prepare(`INSERT INTO diamond_transactions(guild_id,user_id,amount,balance_after,reason,operation_id,created_at)
        VALUES(?,?,?,0,?,?,?)`).run(guild, user, -currency.diamonds, `admin-clear:${admin}`, null, now);
    }
  }

  if (scope === 'xp' || scope === 'all') {
    const progression = db.prepare('SELECT level,experience FROM player_currencies WHERE guild_id=? AND user_id=?').get(guild, user);
    if (progression) {
      cleared.level = progression.level;
      cleared.experience = progression.experience;
      db.prepare('UPDATE player_currencies SET level=1,experience=0,updated_at=? WHERE guild_id=? AND user_id=?').run(now, guild, user);
    }
  }
  return { scope, ...cleared };
});

const RESET_PLAYER_TABLES = Object.freeze([
  'achievement_claims', 'achievement_notifications', 'blackjack_duels', 'blackjack_sessions', 'blackjack_table_locks', 'blackjack_tables',
  'chinchiro_sessions', 'coin_requests', 'diamond_transactions', 'economy_accounts', 'economy_transactions', 'gacha_history', 'gacha_pity',
  'game_history', 'game_player_stats', 'hardcore_records', 'hardcore_sessions', 'mines_sessions', 'newbie_bonus_claims', 'onboarding_claims',
  'player_currencies', 'player_progress', 'poker_sessions', 'profile_cosmetics', 'profile_loadouts', 'rps_bot_rounds', 'rps_duels',
  'season_claims', 'season_scores', 'server_event_contributions', 'server_events', 'shop_purchases', 'user_inventory', 'user_item_effects',
  'vua_daily_skips', 'weekly_claims', 'weekly_role_reward_grants', 'weekly_scores', 'game_sessions',
]);

const resetServerPlayerDataTx = db.transaction(({ guildId, now = Date.now() }) => {
  const guild = String(guildId);
  const players = countPlayersForClear(guild, 'all');
  db.prepare('DELETE FROM multiplayer_bets WHERE round_id IN (SELECT id FROM multiplayer_rounds WHERE guild_id=?)').run(guild);
  db.prepare('DELETE FROM multiplayer_rounds WHERE guild_id=?').run(guild);
  let rows = 0;
  for (const table of RESET_PLAYER_TABLES) rows += db.prepare(`DELETE FROM ${table} WHERE guild_id=?`).run(guild).changes;
  db.prepare('UPDATE shop_items SET sold_count=0,updated_at=? WHERE guild_id=?').run(now, guild);
  return { players, rows };
});

function resetServerPlayerData(args) {
  const result = resetServerPlayerDataTx(args);
  require('./funGameService').endVuaSession(args.guildId); // also drops the in-memory Vua tiếng Việt session cache
  return result;
}

function clearPlayerData(args) { return clearPlayerDataTx(args); }

function countPlayersForClear(guildId, scope) {
  if (!['coins', 'diamonds', 'xp', 'all', 'server'].includes(scope)) throw new Error('INVALID_CLEAR_SCOPE');
  if (scope === 'server') scope = 'all';
  const guild = String(guildId);
  let query;
  if (scope === 'coins') query = 'SELECT COUNT(*) AS count FROM economy_accounts WHERE guild_id=?';
  else if (scope === 'diamonds' || scope === 'xp') query = 'SELECT COUNT(*) AS count FROM player_currencies WHERE guild_id=?';
  else query = `SELECT COUNT(*) AS count FROM (
    SELECT user_id FROM economy_accounts WHERE guild_id=?
    UNION SELECT user_id FROM player_currencies WHERE guild_id=?
  )`;
  const row = scope === 'all' ? db.prepare(query).get(guild, guild) : db.prepare(query).get(guild);
  return row?.count || 0;
}

const clearAllPlayerDataTx = db.transaction(({ guildId, scope, adminId, now = Date.now() }) => {
  if (!['coins', 'diamonds', 'xp', 'all'].includes(scope)) throw new Error('INVALID_CLEAR_SCOPE');
  const guild = String(guildId);
  const rows = scope === 'coins'
    ? db.prepare('SELECT user_id FROM economy_accounts WHERE guild_id=?').all(guild)
    : scope === 'diamonds' || scope === 'xp'
      ? db.prepare('SELECT user_id FROM player_currencies WHERE guild_id=?').all(guild)
      : db.prepare(`SELECT user_id FROM economy_accounts WHERE guild_id=?
          UNION SELECT user_id FROM player_currencies WHERE guild_id=?`).all(guild, guild);
  const totals = { players: rows.length, coins: 0, diamonds: 0, experience: 0 };
  for (const row of rows) {
    const result = clearPlayerDataTx({ guildId: guild, userId: row.user_id, scope, adminId, now });
    totals.coins += result.coins;
    totals.diamonds += result.diamonds;
    totals.experience += result.experience;
  }
  return totals;
});

function clearAllPlayerData(args) { return clearAllPlayerDataTx(args); }

module.exports = { RESET_PLAYER_TABLES, clearPlayerData, countPlayersForClear, clearAllPlayerData, resetServerPlayerData };
