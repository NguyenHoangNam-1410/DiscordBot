const { db } = require('../db');
const { getAccount, creditCoins } = require('./economyService');

const ACHIEVEMENTS = Object.freeze([
  { id: 'first_game', name: 'Bước chân đầu tiên', description: 'Chơi ván đầu tiên', target: 1, reward: 5_000, metric: 'games' },
  { id: 'games_10', name: 'Người chơi quen mặt', description: 'Chơi 10 ván', target: 10, reward: 15_000, metric: 'games' },
  { id: 'games_100', name: 'Cựu binh Game Hub', description: 'Chơi 100 ván', target: 100, reward: 100_000, metric: 'games' },
  { id: 'wins_5', name: 'Chuỗi chiến thắng', description: 'Thắng 5 ván', target: 5, reward: 20_000, metric: 'wins' },
  { id: 'wins_50', name: 'Nhà vô địch', description: 'Thắng 50 ván', target: 50, reward: 150_000, metric: 'wins' },
  { id: 'games_3_types', name: 'Kẻ khám phá', description: 'Thử ít nhất 3 trò chơi', target: 3, reward: 25_000, metric: 'gameTypes' },
  { id: 'balance_100k', name: 'Túi xu nặng trĩu', description: 'Sở hữu 100.000 xu', target: 100_000, reward: 30_000, metric: 'balance' },
  { id: 'hardcore_10', name: 'Sống sót trong bóng tối', description: 'Đạt tầng 10 Sinh tồn', target: 10, reward: 50_000, metric: 'hardcoreFloor' },
]);

function metrics(guildId, userId) {
  const guild = String(guildId); const user = String(userId); const account = getAccount(guild, user);
  const gameTypes = db.prepare('SELECT COUNT(*) count FROM game_player_stats WHERE guild_id=? AND user_id=? AND played>0').get(guild, user).count;
  const hardcoreFloor = db.prepare('SELECT COALESCE(best_floor,0) value FROM hardcore_records WHERE guild_id=? AND user_id=?').get(guild, user)?.value || 0;
  return { games: account.games_played, wins: account.wins, balance: account.balance, gameTypes, hardcoreFloor };
}

function getAchievements(guildId, userId) {
  const values = metrics(guildId, userId);
  const claimed = new Set(db.prepare('SELECT achievement_id FROM achievement_claims WHERE guild_id=? AND user_id=?').all(String(guildId), String(userId)).map(row => row.achievement_id));
  return ACHIEVEMENTS.map(item => ({ ...item, progress: Math.min(item.target, values[item.metric] || 0), complete: (values[item.metric] || 0) >= item.target, claimed: claimed.has(item.id) }));
}

function claimAchievements(guildId, userId, now = Date.now()) {
  return db.transaction(() => {
    const available = getAchievements(guildId, userId).filter(item => item.complete && !item.claimed);
    for (const item of available) {
      db.prepare('INSERT INTO achievement_claims(guild_id,user_id,achievement_id,claimed_at) VALUES(?,?,?,?)')
        .run(String(guildId), String(userId), item.id, now);
      creditCoins({ guildId, userId, amount: item.reward, reason: `achievement:${item.id}`,
        operationId: `achievement:${guildId}:${userId}:${item.id}` });
    }
    return available;
  })();
}
function detectAchievementUnlocks(guildId, userId, now = Date.now()) {
  const unlocked = [];
  const insert = db.prepare('INSERT OR IGNORE INTO achievement_notifications(guild_id,user_id,achievement_id,unlocked_at) VALUES(?,?,?,?)');
  for (const item of getAchievements(guildId, userId)) {
    if (item.complete && insert.run(String(guildId), String(userId), item.id, now).changes) unlocked.push(item);
  }
  return unlocked;
}

module.exports = { ACHIEVEMENTS, getAchievements, claimAchievements, detectAchievementUnlocks };
