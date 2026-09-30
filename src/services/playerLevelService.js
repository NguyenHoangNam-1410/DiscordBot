const { db } = require('../db');
const { getGameConfig } = require('./gameConfigService');
const busyWait = new Int32Array(new SharedArrayBuffer(4));

const ensureStatement = db.prepare(`INSERT OR IGNORE INTO player_currencies
  (guild_id,user_id,diamonds,level,experience,free_gacha_pulls,updated_at) VALUES (?,?,0,1,0,0,?)`);

function getPlayerProgression(guildId, userId, now = Date.now()) {
  const guild = String(guildId); const user = String(userId);
  ensureStatement.run(guild, user, now);
  return db.prepare('SELECT * FROM player_currencies WHERE guild_id=? AND user_id=?').get(guild, user);
}

function xpForNextLevel(level, guildId = null) {
  const base = guildId === null ? 200 : getGameConfig(guildId, 'LEVEL_XP_PER_LEVEL');
  return Math.max(1, Math.floor(Number(level) || 1)) * base;
}

function withBusyRetry(action, attempts = 60) {
  for (let attempt = 0; ; attempt += 1) {
    try { return action(); } catch (error) {
      if (!String(error?.code || '').startsWith('SQLITE_BUSY') || attempt >= attempts - 1) throw error;
      Atomics.wait(busyWait, 0, 0, Math.min(250, 10 + attempt * 10));
    }
  }
}
function normalizeOptions(value) { return typeof value === 'number' ? { now: value } : (value || {}); }
const changeDiamondsTx = db.transaction(({ guildId, userId, amount, reason, operationId, now }) => {
    const guild = String(guildId); const user = String(userId);
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000_000) throw new Error('INVALID_DIAMONDS');
    const normalizedOperation = operationId ? String(operationId).slice(0, 160) : null;
    if (normalizedOperation) {
      const previous = db.prepare('SELECT balance_after FROM diamond_transactions WHERE guild_id=? AND user_id=? AND operation_id=?')
        .get(guild, user, normalizedOperation);
      if (previous) return { ...getPlayerProgression(guild, user, now), diamonds: previous.balance_after, amount: 0, duplicate: true };
    }
    const row = getPlayerProgression(guild, user, now);
    const next = row.diamonds + amount;
    if (next < 0) throw new Error('INSUFFICIENT_DIAMONDS');
    db.prepare('UPDATE player_currencies SET diamonds=?,updated_at=? WHERE guild_id=? AND user_id=?')
      .run(next, now, guild, user);
    db.prepare('INSERT INTO diamond_transactions(guild_id,user_id,amount,balance_after,reason,operation_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(guild, user, amount, next, String(reason || 'adjustment').slice(0, 100), normalizedOperation, now);
    return { ...row, diamonds: next, amount, duplicate: false };
});
function changeDiamonds({ guildId, userId, amount, reason = 'adjustment', operationId = null, now = Date.now() }) {
  return withBusyRetry(() => changeDiamondsTx({ guildId, userId, amount, reason, operationId, now }));
}

function addDiamonds(guildId, userId, amount, options = {}) {
  const value = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVALID_DIAMONDS');
  const config = normalizeOptions(options);
  return changeDiamonds({ guildId, userId, amount: value, reason: config.reason || 'reward', operationId: config.operationId, now: config.now || Date.now() });
}

function spendDiamonds(guildId, userId, amount, options = {}) {
  const value = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVALID_DIAMONDS');
  const config = normalizeOptions(options);
  return changeDiamonds({ guildId, userId, amount: -value, reason: config.reason || 'spend', operationId: config.operationId, now: config.now || Date.now() });
}

function addFreePulls(guildId, userId, amount = 1, now = Date.now()) {
  const value = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVALID_PULLS');
  getPlayerProgression(guildId, userId, now);
  withBusyRetry(() => require('./shopService').addInventory(guildId, userId, 'gacha_ticket_1', value, now));
  return getPlayerProgression(guildId, userId, now);
}

function consumeFreePull(guildId, userId, now = Date.now()) {
  const shop = require('./shopService');
  if (shop.getInventoryQuantity(guildId, userId, 'gacha_ticket_1') < 1) return false;
  shop.consumeInventory(guildId, userId, 'gacha_ticket_1');
  return true;
}

function levelReward(level) {
  if (level % 100 === 0) return { coins: 1_000_000, diamonds: 1_000, freePulls: 1, cosmetic: 'color_century' };
  if (level % 10 === 0) return { coins: level * 10_000, diamonds: 150, freePulls: 1 };
  return { coins: level * 5_000, diamonds: level % 5 === 0 ? 50 : 0, freePulls: 0 };
}

function addExperience(guildId, userId, amount, { now = Date.now(), reason = 'activity' } = {}) {
  const gained = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!gained) return { ...getPlayerProgression(guildId, userId, now), gained: 0, levelUps: [] };
  return db.transaction(() => {
    const current = getPlayerProgression(guildId, userId, now);
    let level = current.level; let experience = current.experience + gained;
    const levelUps = [];
    while (experience >= xpForNextLevel(level, guildId)) {
      experience -= xpForNextLevel(level, guildId); level += 1;
      const reward = levelReward(level); levelUps.push({ level, ...reward });
      if (reward.coins) require('./economyService').creditCoins({ guildId, userId, amount: reward.coins,
        reason: `level:${level}`, operationId: `level:${guildId}:${userId}:${level}` });
      if (reward.diamonds) changeDiamonds({ guildId, userId, amount: reward.diamonds, reason: `level:${level}`,
        operationId: `level-diamonds:${guildId}:${userId}:${level}`, now });
      if (reward.freePulls) addFreePulls(guildId, userId, reward.freePulls, now);
      if (reward.cosmetic) {
        require('./profileCosmeticService').grantCosmetic(guildId, userId, reward.cosmetic, now);
        require('./shopService').addInventory(guildId, userId, reward.cosmetic, 1, now);
      }
    }
    db.prepare('UPDATE player_currencies SET level=?,experience=?,updated_at=? WHERE guild_id=? AND user_id=?')
      .run(level, experience, now, String(guildId), String(userId));
    return { ...getPlayerProgression(guildId, userId, now), gained, reason, levelUps };
  })();
}

function getDiamondHistory(guildId, userId, limit = 20) {
  return db.prepare('SELECT * FROM diamond_transactions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ?')
    .all(String(guildId), String(userId), Math.max(1, Math.min(100, Number(limit) || 20)));
}
function cleanupDiamondTransactions(now = Date.now(), retentionDays = Number(process.env.DIAMOND_LOG_RETENTION_DAYS) || 180) {
  const days = Math.max(7, Math.min(3650, Math.floor(retentionDays)));
  return db.prepare('DELETE FROM diamond_transactions WHERE created_at<?').run(now - days * 86_400_000).changes;
}

function gameExperience(outcome, payout = 0, stake = 0, guildId = null) {
  const base = guildId === null ? 10 : getGameConfig(guildId, 'GAME_EXP_BASE');
  const divisor = guildId === null ? 2_000 : getGameConfig(guildId, 'GAME_EXP_WIN_COIN_DIVISOR');
  const maximum = guildId === null ? 500 : getGameConfig(guildId, 'GAME_EXP_MAX');
  const stakeFactor = Math.min(1, Math.max(0, Number(stake) || 0) / 100_000);
  if (outcome !== 'win') return Math.floor(Math.min(maximum, base) * stakeFactor);
  const wonCoins = Math.max(0, Math.floor(Number(payout) || 0) - Math.max(0, Math.floor(Number(stake) || 0)));
  return Math.floor(Math.min(maximum, base + Math.floor(wonCoins / divisor)) * stakeFactor);
}

module.exports = { getPlayerProgression, xpForNextLevel, changeDiamonds, addDiamonds, spendDiamonds, addFreePulls,
  consumeFreePull, addExperience, gameExperience, levelReward, getDiamondHistory, cleanupDiamondTransactions, withBusyRetry };
