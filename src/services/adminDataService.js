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

function clearPlayerData(args) { return clearPlayerDataTx(args); }

module.exports = { clearPlayerData };
