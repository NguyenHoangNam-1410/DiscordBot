const { db } = require('../db');
const { getGameConfig } = require('./gameConfigService');

const DAY_MS = 24 * 60 * 60 * 1000;
function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

const STARTING_COINS = integerEnv('ECONOMY_STARTING_COINS', 1000, 0, 1_000_000);
const TRANSACTION_RETENTION_DAYS = integerEnv('ECONOMY_LOG_RETENTION_DAYS', 30, 1, 365);
const SHOP_SPEND_MAX = 100_000_000;
const busyWait = new Int32Array(new SharedArrayBuffer(4));
function withBusyRetry(action, attempts = 60) {
  for (let attempt = 0; ; attempt += 1) {
    try { return action(); }
    catch (error) {
      if (!String(error?.code || '').startsWith('SQLITE_BUSY') || attempt >= attempts - 1) throw error;
      Atomics.wait(busyWait, 0, 0, Math.min(250, 10 + 10 * attempt + (attempt % 7) * 3));
    }
  }
}

const ensureStatement = db.prepare(`
  INSERT OR IGNORE INTO economy_accounts
  (guild_id, user_id, balance, last_daily_at, games_played, wins, losses, draws, created_at, updated_at)
  VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?)
`);
const accountStatement = db.prepare('SELECT * FROM economy_accounts WHERE guild_id = ? AND user_id = ?');
const updateBalanceStatement = db.prepare('UPDATE economy_accounts SET balance = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?');
const updateStatsStatement = db.prepare(`
  UPDATE economy_accounts SET games_played = games_played + 1,
    wins = wins + ?, losses = losses + ?, draws = draws + ?, updated_at = ?
  WHERE guild_id = ? AND user_id = ?
`);
const transactionStatement = db.prepare(`
  INSERT INTO economy_transactions (guild_id, user_id, amount, balance_after, reason, operation_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const operationStatement = db.prepare(`
  SELECT balance_after FROM economy_transactions
  WHERE guild_id = ? AND user_id = ? AND operation_id = ?
`);

function ensureAccount(guildId, userId, now = Date.now()) {
  ensureStatement.run(String(guildId), String(userId), getGameConfig(guildId, 'ECONOMY_STARTING_COINS'), now, now);
  return accountStatement.get(String(guildId), String(userId));
}

function getAccount(guildId, userId) {
  return ensureAccount(guildId, userId);
}

function validAmount(amount, maximum = 100_000) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error('INVALID_AMOUNT');
  return value;
}

const changeBalanceTx = db.transaction(({ guildId, userId, amount, reason, outcome = null, operationId = null }) => {
  const now = Date.now();
  const normalizedGuild = String(guildId);
  const normalizedUser = String(userId);
  const normalizedOperation = operationId ? String(operationId).slice(0, 160) : null;
  if (normalizedOperation) {
    const previous = operationStatement.get(normalizedGuild, normalizedUser, normalizedOperation);
    if (previous) return { ...ensureAccount(normalizedGuild, normalizedUser, now), amount: 0, duplicate: true, originalBalanceAfter: previous.balance_after };
  }
  const account = ensureAccount(guildId, userId, now);
  const nextBalance = account.balance + amount;
  if (nextBalance < 0) {
    const error = new Error('INSUFFICIENT_FUNDS');
    error.code = 'INSUFFICIENT_FUNDS';
    error.balance = account.balance;
    throw error;
  }
  updateBalanceStatement.run(nextBalance, now, String(guildId), String(userId));
  if (outcome) updateStatsStatement.run(outcome === 'win' ? 1 : 0, outcome === 'loss' ? 1 : 0, outcome === 'draw' ? 1 : 0, now, String(guildId), String(userId));
  transactionStatement.run(normalizedGuild, normalizedUser, amount, nextBalance, String(reason).slice(0, 100), normalizedOperation, now);
  return { ...account, balance: nextBalance, amount, duplicate: false };
});

function settleWithProgress(balanceArgs, progressArgs, countGame = true) {
  return withBusyRetry(() => db.transaction(() => {
    const result = changeBalanceTx(balanceArgs);
    const progress = countGame && !result.duplicate ? require('./progressionService').recordGameEvent(progressArgs) : null;
    const current = progress?.bonusDrops?.some(drop => drop.type === 'coins') ? ensureAccount(balanceArgs.guildId, balanceArgs.userId) : result;
    return { ...result, balance: current.balance, unlockedAchievements: progress?.unlocked || [], experienceGained: progress?.experienceGained || 0,
      levelUps: progress?.levelUps || [], bonusDrops: progress?.bonusDrops || [] };
  })());
}

function settleBet({ guildId, userId, stake, payout, game, outcome, operationId = null }) {
  const normalizedStake = Math.floor(Number(stake));
  const normalizedPayout = Math.floor(Number(payout));
  if (!Number.isInteger(normalizedStake) || normalizedStake < 10 || normalizedStake > 100_000) throw new Error('INVALID_BET');
  if (!Number.isInteger(normalizedPayout) || normalizedPayout < 0) throw new Error('INVALID_PAYOUT');
  return settleWithProgress(
    { guildId, userId, amount: normalizedPayout - normalizedStake, reason: `${game}:${outcome}`, outcome, operationId },
    { guildId, userId, game, outcome, amount: normalizedPayout, stake: normalizedStake },
  );
}

function spendCoins({ guildId, userId, amount, reason }) {
  const value = validAmount(amount, SHOP_SPEND_MAX);
  return withBusyRetry(() => changeBalanceTx({ guildId, userId, amount: -value, reason }));
}

const transferCoinsTx = db.transaction(({ guildId, fromUserId, toUserId, amount }) => {
  const value = validAmount(amount);
  if (String(fromUserId) === String(toUserId)) throw new Error('SELF_TRANSFER');
  const now = Date.now();
  const sender = ensureAccount(guildId, fromUserId, now);
  const receiver = ensureAccount(guildId, toUserId, now);
  if (sender.balance < value) {
    const error = new Error('INSUFFICIENT_FUNDS');
    error.code = 'INSUFFICIENT_FUNDS';
    error.balance = sender.balance;
    throw error;
  }
  const senderBalance = sender.balance - value;
  const receiverBalance = receiver.balance + value;
  updateBalanceStatement.run(senderBalance, now, String(guildId), String(fromUserId));
  updateBalanceStatement.run(receiverBalance, now, String(guildId), String(toUserId));
  transactionStatement.run(String(guildId), String(fromUserId), -value, senderBalance, `transfer:to:${toUserId}`.slice(0, 100), null, now);
  transactionStatement.run(String(guildId), String(toUserId), value, receiverBalance, `transfer:from:${fromUserId}`.slice(0, 100), null, now);
  return { amount: value, senderBalance, receiverBalance };
});

function transferCoins({ guildId, fromUserId, toUserId, amount }) {
  return withBusyRetry(() => transferCoinsTx({ guildId: String(guildId), fromUserId: String(fromUserId), toUserId: String(toUserId), amount }));
}

function addCoinsByAdmin({ guildId, userId, amount, adminId, reason = 'manual' }) {
  const admins = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  if (!admins.includes(String(adminId))) throw new Error('NOT_ADMIN');
  const value = validAmount(amount, 10_000_000);
  return withBusyRetry(() => changeBalanceTx({ guildId: String(guildId), userId: String(userId), amount: value, reason: `admin:${adminId}:${reason}` }));
}

function removeCoinsByAdmin({ guildId, userId, amount, adminId, reason = 'violation' }) {
  const admins = String(process.env.ADMIN_USER_ID || '').split(/[,;\n]/).map(id => id.trim()).filter(Boolean);
  if (!admins.includes(String(adminId))) throw new Error('NOT_ADMIN');
  const requested = validAmount(amount, 10_000_000);
  const account = ensureAccount(guildId, userId);
  const deducted = Math.min(requested, account.balance);
  const updated = withBusyRetry(() => changeBalanceTx({ guildId: String(guildId), userId: String(userId), amount: -deducted, reason: `admin-remove:${adminId}:${reason}` }));
  return { ...updated, requested, deducted };
}

function rewardGame({ guildId, userId, amount, game, outcome = 'win' }) {
  const value = Math.floor(Number(amount));
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) throw new Error('INVALID_AMOUNT');
  return settleWithProgress(
    { guildId, userId, amount: value, reason: `${game}:${outcome}`, outcome },
    { guildId, userId, game, outcome, amount: value },
  );
}

function settleReservedGame({ guildId, userId, payout, stake, game, outcome, operationId = null, countGame = true }) {
  const value = Number(payout);
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) throw new Error('INVALID_PAYOUT');
  if (!Number.isSafeInteger(stake) || stake < 0) throw new Error('INVALID_BET');
  return settleWithProgress(
    { guildId, userId, amount: value, reason: `${game}:${outcome}`, outcome: countGame ? outcome : null, operationId },
    { guildId, userId, game, outcome, amount: value, stake }, countGame,
  );
}

function recordGameResult({ guildId, userId, game, outcome }) {
  return settleWithProgress(
    { guildId, userId, amount: 0, reason: `${game}:${outcome}`, outcome },
    { guildId, userId, game, outcome },
  );
}

function creditCoins({ guildId, userId, amount, reason = 'reward', operationId = null }) {
  const value = validAmount(amount, 100_000_000);
  return withBusyRetry(() => changeBalanceTx({ guildId: String(guildId), userId: String(userId), amount: value, reason: String(reason), operationId }));
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT * FROM economy_accounts WHERE guild_id = ? ORDER BY balance DESC, wins DESC LIMIT ?')
    .all(String(guildId), Math.max(1, Math.min(25, Number(limit) || 10)));
}

function getTransactionHistory(guildId, userId, limit = 10) {
  return db.prepare('SELECT * FROM economy_transactions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ?')
    .all(String(guildId), String(userId), Math.max(1, Math.min(25, Number(limit) || 10)));
}

function getRank(guildId, userId) {
  const account = ensureAccount(guildId, userId);
  return db.prepare('SELECT 1 + COUNT(*) AS rank FROM economy_accounts WHERE guild_id = ? AND balance > ?')
    .get(String(guildId), account.balance).rank;
}

function getEconomyStats(guildId, now = Date.now()) {
  const guild = String(guildId); const since = now - DAY_MS;
  const accounts = db.prepare('SELECT COUNT(*) users,COALESCE(SUM(balance),0) supply,COALESCE(AVG(balance),0) average,COALESCE(MAX(balance),0) richest FROM economy_accounts WHERE guild_id=?').get(guild);
  const flow = db.prepare(`SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount ELSE 0 END),0) minted,
    COALESCE(-SUM(CASE WHEN amount<0 THEN amount ELSE 0 END),0) spent,COUNT(*) transactions
    FROM economy_transactions WHERE guild_id=? AND created_at>=?`).get(guild, since);
  return { ...accounts, average: Math.floor(accounts.average || 0), ...flow };
}

function getEconomyDashboard(guildId, now = Date.now()) {
  const guild = String(guildId);
  const since = now - DAY_MS;
  const stats = getEconomyStats(guild, now);
  const activity = db.prepare(`SELECT COUNT(DISTINCT user_id) activeUsers
    FROM economy_transactions WHERE guild_id=? AND created_at>=?`).get(guild, since);
  const categories = db.prepare(`SELECT
      CASE WHEN instr(reason, ':') > 0 THEN substr(reason, 1, instr(reason, ':') - 1) ELSE reason END category,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) incoming,
      COALESCE(-SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) outgoing,
      COUNT(*) transactions
    FROM economy_transactions WHERE guild_id=? AND created_at>=?
    GROUP BY category ORDER BY incoming + outgoing DESC LIMIT 6`).all(guild, since);
  return { ...stats, activeUsers: activity.activeUsers, net: stats.minted - stats.spent, categories };
}

function cleanupEconomyTransactions(now = Date.now()) {
  const cutoff = now - TRANSACTION_RETENTION_DAYS * DAY_MS;
  return db.prepare('DELETE FROM economy_transactions WHERE created_at < ?').run(cutoff).changes;
}

function startEconomyMaintenance(logger = console) {
  const run = () => {
    const deleted = cleanupEconomyTransactions();
    logger.info?.({ deleted, retentionDays: TRANSACTION_RETENTION_DAYS }, 'economy maintenance completed');
  };
  run();
  const timer = setInterval(() => { try { run(); } catch (error) { logger.error?.({ err: error }, 'economy maintenance failed'); } }, DAY_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  DAY_MS,
  SHOP_SPEND_MAX,
  STARTING_COINS,
  ensureAccount,
  getAccount,
  settleBet,
  spendCoins,
  transferCoins,
  addCoinsByAdmin,
  removeCoinsByAdmin,
  rewardGame,
  settleReservedGame,
  recordGameResult,
  creditCoins,
  getLeaderboard,
  getTransactionHistory,
  getRank,
  getEconomyStats,
  getEconomyDashboard,
  cleanupEconomyTransactions,
  startEconomyMaintenance,
  withBusyRetry,
};
