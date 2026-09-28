const { db } = require('../db');
const { ensureAccount, creditCoins } = require('./economyService');
const { grantCosmetic } = require('./profileCosmeticService');

const STARTER_COINS = 500;

function claimStarterPack(guildId, userId, now = Date.now()) {
  const guild = String(guildId); const user = String(userId);
  return db.transaction(() => {
    ensureAccount(guild, user, now);
    if (db.prepare('SELECT 1 FROM onboarding_claims WHERE guild_id=? AND user_id=?').get(guild, user)) return { claimed: false };
    db.prepare('INSERT INTO onboarding_claims(guild_id,user_id,claimed_at) VALUES(?,?,?)').run(guild, user, now);
    const account = creditCoins({ guildId: guild, userId: user, amount: STARTER_COINS, reason: 'onboarding:starter', operationId: `onboarding:${guild}:${user}` });
    grantCosmetic(guild, user, 'color_blue', now);
    return { claimed: true, coins: STARTER_COINS, balance: account.balance, cosmetic: 'Xanh Băng' };
  })();
}

module.exports = { STARTER_COINS, claimStarterPack };
