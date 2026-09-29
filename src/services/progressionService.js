const crypto = require('node:crypto');
const { db } = require('../db');

const DAY_MS = 86_400_000;
const TIME_ZONE = process.env.ECONOMY_TIME_ZONE || 'Asia/Bangkok';

const DAILY_MISSIONS = Object.freeze([
  { id: 'play2', label: 'Chơi 2 ván', field: 'games', target: 2, coins: 20_000, experience: 50 },
  { id: 'play3', label: 'Chơi 3 ván', field: 'games', target: 3, coins: 20_000, experience: 50 },
  { id: 'play5', label: 'Chơi 5 ván', field: 'games', target: 5, coins: 20_000, experience: 50 },
  { id: 'win1', label: 'Thắng 1 ván', field: 'wins', target: 1, coins: 20_000, experience: 50 },
  { id: 'win2', label: 'Thắng 2 ván', field: 'wins', target: 2, coins: 20_000, experience: 50 },
  { id: 'win3', label: 'Thắng 3 ván', field: 'wins', target: 3, coins: 20_000, experience: 50 },
  { id: 'quiz1', label: 'Trả lời đúng 1 câu đố', field: 'quizWins', target: 1, coins: 20_000, experience: 50 },
  { id: 'quiz2', label: 'Trả lời đúng 2 câu đố', field: 'quizWins', target: 2, coins: 20_000, experience: 50 },
  { id: 'wager25k', label: 'Cược tổng cộng 25.000 xu', field: 'wagered', target: 25_000, coins: 20_000, experience: 50 },
  { id: 'wager100k', label: 'Cược tổng cộng 100.000 xu', field: 'wagered', target: 100_000, coins: 20_000, experience: 50 },
]);
const WEEKLY_MISSIONS = Object.freeze([
  { id: 'play20', label: 'Chơi 20 ván', field: 'games', target: 20, coins: 150_000 },
  { id: 'win10', label: 'Thắng 10 ván', field: 'wins', target: 10, coins: 250_000 },
  { id: 'quiz10', label: 'Trả lời đúng 10 câu đố', field: 'quizWins', target: 10, item: 'rps_counter_charm', quantity: 1 },
]);

function localParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(now));
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}
function dayKey(now = Date.now()) {
  const p = localParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}
function weekKey(now = Date.now()) {
  const p = localParts(now);
  const date = new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}
function json(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function emptyCounters() { return { games: 0, wins: 0, quizWins: 0, wagered: 0 }; }
function getDailyMissions(guildId, userId, now = Date.now()) {
  const seed = `${dayKey(now)}:${guildId}:${userId}`;
  const sorted = [...DAILY_MISSIONS].sort((a, b) => crypto.createHash('sha256').update(`${seed}:${a.id}`).digest('hex')
    .localeCompare(crypto.createHash('sha256').update(`${seed}:${b.id}`).digest('hex')));
  const selected = []; const usedFields = new Set();
  for (const mission of sorted) {
    if (usedFields.has(mission.field)) continue;
    selected.push(mission); usedFields.add(mission.field);
    if (selected.length === 3) break;
  }
  return selected;
}

function ensureProgress(guildId, userId, now = Date.now()) {
  const guild = String(guildId); const user = String(userId); const daily = dayKey(now); const weekly = weekKey(now);
  db.prepare(`INSERT OR IGNORE INTO player_progress
    (guild_id,user_id,daily_key,daily_json,daily_claimed_json,weekly_key,weekly_json,weekly_claimed_json,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(guild, user, daily, JSON.stringify(emptyCounters()), '[]', weekly, JSON.stringify(emptyCounters()), '[]', now);
  let row = db.prepare('SELECT * FROM player_progress WHERE guild_id=? AND user_id=?').get(guild, user);
  if (row.daily_key !== daily) {
    db.prepare("UPDATE player_progress SET daily_key=?,daily_json='{}',daily_claimed_json='[]',updated_at=? WHERE guild_id=? AND user_id=?")
      .run(daily, now, guild, user);
  }
  if (row.weekly_key !== weekly) {
    db.prepare("UPDATE player_progress SET weekly_key=?,weekly_json='{}',weekly_claimed_json='[]',updated_at=? WHERE guild_id=? AND user_id=?")
      .run(weekly, now, guild, user);
  }
  row = db.prepare('SELECT * FROM player_progress WHERE guild_id=? AND user_id=?').get(guild, user);
  return { ...row, daily: { ...emptyCounters(), ...json(row.daily_json, {}) }, weekly: { ...emptyCounters(), ...json(row.weekly_json, {}) },
    dailyClaimed: json(row.daily_claimed_json, []), weeklyClaimed: json(row.weekly_claimed_json, []) };
}

function recordGameEvent({ guildId, userId, game, outcome, amount = 0, stake = 0, now = Date.now() }) {
  if (!guildId || !userId || !['win', 'loss', 'draw'].includes(outcome)) return null;
  const progress = ensureProgress(guildId, userId, now);
  const quizWin = outcome === 'win' && String(game) === 'vuatiengviet';
  for (const counters of [progress.daily, progress.weekly]) {
    counters.games += 1;
    if (outcome === 'win') counters.wins += 1;
    if (quizWin) counters.quizWins += 1;
    counters.wagered += Math.max(0, Math.floor(Number(stake) || 0));
  }
  db.prepare('UPDATE player_progress SET daily_json=?,weekly_json=?,updated_at=? WHERE guild_id=? AND user_id=?')
    .run(JSON.stringify(progress.daily), JSON.stringify(progress.weekly), now, String(guildId), String(userId));

  db.prepare('INSERT INTO game_history(guild_id,user_id,game,outcome,stake,payout,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(String(guildId), String(userId), String(game), outcome, Math.max(0, Math.floor(Number(stake) || 0)), Math.max(0, Math.floor(Number(amount) || 0)), now);

  db.prepare(`INSERT INTO game_player_stats(guild_id,game,user_id,played,wins,losses,draws,coins_earned,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,game,user_id) DO UPDATE SET
    played=played+1,wins=wins+excluded.wins,losses=losses+excluded.losses,draws=draws+excluded.draws,
    coins_earned=coins_earned+excluded.coins_earned,updated_at=excluded.updated_at`)
    .run(String(guildId), String(game), String(userId), 1, outcome === 'win' ? 1 : 0,
      outcome === 'loss' ? 1 : 0, outcome === 'draw' ? 1 : 0, Math.max(0, Math.floor(Number(amount) || 0)), now);

  let experience = String(game) === 'vuatiengviet' ? 0 : require('./playerLevelService').gameExperience(outcome, amount, stake, guildId);
  if (experience) {
    const maximum = require('./gameConfigService').getGameConfig(guildId, 'GAME_EXP_MAX');
    experience = Math.min(maximum, experience);
  }
  const levelProgress = require('./playerLevelService').addExperience(guildId, userId, experience, { now, reason: `game:${game}:${outcome}` });
  const updatedProgress = getProgress(guildId, userId, now);
  const unlocked = require('./achievementService').detectAchievementUnlocks(guildId, userId, now);
  const bonusDrops = require('./gameBuffService').rollGameDrops({ guildId, userId, game, now });
  return { ...updatedProgress, unlocked, experienceGained: experience, levelUps: levelProgress.levelUps, bonusDrops };
}

function missionRows(missions, counters, claimed) {
  return missions.map(mission => ({ ...mission, progress: Math.min(mission.target, counters[mission.field] || 0),
    complete: (counters[mission.field] || 0) >= mission.target, claimed: claimed.includes(mission.id) }));
}
function getProgress(guildId, userId, now = Date.now()) {
  const row = ensureProgress(guildId, userId, now);
  return { streak: row.streak, lastCheckinKey: row.last_checkin_key, dailyKey: row.daily_key, weeklyKey: row.weekly_key,
    daily: missionRows(getDailyMissions(guildId, userId, now), row.daily, row.dailyClaimed), weekly: missionRows(WEEKLY_MISSIONS, row.weekly, row.weeklyClaimed) };
}

function grantReward(guildId, userId, mission, reason) {
  if (mission.coins) require('./economyService').creditCoins({ guildId, userId, amount: mission.coins, reason });
  if (mission.item) require('./shopService').addInventory(guildId, userId, mission.item, mission.quantity || 1);
  if (mission.experience) require('./playerLevelService').addExperience(guildId, userId, mission.experience, { reason });
  if (mission.diamonds) require('./playerLevelService').addDiamonds(guildId, userId, mission.diamonds,
    { reason, operationId: `diamonds:${reason}:${guildId}:${userId}` });
}
function claimMissions(guildId, userId, scope = 'all', now = Date.now()) {
  return db.transaction(() => {
    const row = ensureProgress(guildId, userId, now); const rewards = [];
    const claimScope = (missions, counters, claimed, column, label) => {
      for (const mission of missions) {
        if ((counters[mission.field] || 0) < mission.target || claimed.includes(mission.id)) continue;
        grantReward(guildId, userId, mission, `mission:${label}:${mission.id}`); claimed.push(mission.id); rewards.push({ ...mission, scope: label });
      }
      db.prepare(`UPDATE player_progress SET ${column}=?,updated_at=? WHERE guild_id=? AND user_id=?`)
        .run(JSON.stringify(claimed), now, String(guildId), String(userId));
    };
    if (scope === 'all' || scope === 'daily') {
      const missions = getDailyMissions(guildId, userId, now);
      claimScope(missions, row.daily, row.dailyClaimed, 'daily_claimed_json', 'daily');
      if (missions.every(mission => row.dailyClaimed.includes(mission.id)) && !row.dailyClaimed.includes('__daily_bonus__')) {
        const bonus = { id: '__daily_bonus__', label: 'Hoàn thành cả 3 nhiệm vụ ngày', diamonds: 20 };
        grantReward(guildId, userId, bonus, `mission:daily:bonus:${row.daily_key}`);
        row.dailyClaimed.push(bonus.id); rewards.push({ ...bonus, scope: 'daily' });
        db.prepare('UPDATE player_progress SET daily_claimed_json=?,updated_at=? WHERE guild_id=? AND user_id=?')
          .run(JSON.stringify(row.dailyClaimed), now, String(guildId), String(userId));
      }
    }
    if (scope === 'all' || scope === 'weekly') claimScope(WEEKLY_MISSIONS, row.weekly, row.weeklyClaimed, 'weekly_claimed_json', 'weekly');
    return rewards;
  })();
}

function checkIn(guildId, userId, now = Date.now()) {
  return db.transaction(() => {
    const row = ensureProgress(guildId, userId, now); const today = dayKey(now);
    const dateParts = localParts(now);
    const date = `${dateParts.day}/${dateParts.month}`;
    if (row.last_checkin_key === today) return { ok: false, streak: row.streak === 0 ? 7 : row.streak, date };
    const yesterday = dayKey(now - DAY_MS);
    const continued = row.last_checkin_key === yesterday;
    const streak = continued ? (row.streak >= 7 ? 1 : row.streak + 1) : 1;
    const coins = streak * 5_000;
    require('./economyService').creditCoins({ guildId, userId, amount: coins, reason: `checkin:${today}` });
    const diamonds = streak === 7
      ? require('./playerLevelService').addDiamonds(guildId, userId, 100, {
        reason: `checkin:${today}`, operationId: `checkin-diamonds:${guildId}:${userId}:${today}`, now,
      }).amount
      : 0;
    db.prepare('UPDATE player_progress SET streak=?,last_checkin_key=?,updated_at=? WHERE guild_id=? AND user_id=?')
      .run(streak === 7 ? 0 : streak, today, now, String(guildId), String(userId));
    return { ok: true, streak, coins, diamonds, date, reset: streak === 7, guarded: false };
  })();
}

function getGameLeaderboard(guildId, game, limit = 10) {
  return db.prepare(`SELECT * FROM game_player_stats WHERE guild_id=? AND game=?
    ORDER BY wins DESC,CASE WHEN played>0 THEN wins*1.0/played ELSE 0 END DESC,played ASC,updated_at ASC LIMIT ?`)
    .all(String(guildId), String(game), Math.max(1, Math.min(25, Number(limit) || 10)));
}
function getGameHistory(guildId, userId, limit = 10) {
  return db.prepare('SELECT * FROM game_history WHERE guild_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT ?')
    .all(String(guildId), String(userId), Math.max(1, Math.min(25, Number(limit) || 10)));
}
function cleanupProgressionData(now = Date.now()) {
  const seasonCutoff = now - 400 * DAY_MS; const eventCutoff = now - 90 * DAY_MS; const inactiveCutoff = now - 365 * DAY_MS;
  return db.transaction(() => ({
    seasonScores: db.prepare('DELETE FROM season_scores WHERE updated_at<?').run(seasonCutoff).changes,
    seasonClaims: db.prepare('DELETE FROM season_claims WHERE claimed_at<?').run(seasonCutoff).changes,
    weeklyScores: db.prepare('DELETE FROM weekly_scores WHERE updated_at<?').run(seasonCutoff).changes,
    weeklyClaims: db.prepare('DELETE FROM weekly_claims WHERE claimed_at<?').run(seasonCutoff).changes,
    gameHistory: db.prepare('DELETE FROM game_history WHERE created_at<?').run(eventCutoff).changes,
    contributions: db.prepare('DELETE FROM server_event_contributions WHERE updated_at<?').run(eventCutoff).changes,
    events: db.prepare('DELETE FROM server_events WHERE updated_at<?').run(eventCutoff).changes,
    inactiveProgress: db.prepare('DELETE FROM player_progress WHERE updated_at<?').run(inactiveCutoff).changes,
  }))();
}

module.exports = { DAY_MS, DAILY_MISSIONS, WEEKLY_MISSIONS, dayKey, weekKey, getDailyMissions, getProgress, recordGameEvent,
  claimMissions, checkIn, getGameLeaderboard, getGameHistory, cleanupProgressionData };
