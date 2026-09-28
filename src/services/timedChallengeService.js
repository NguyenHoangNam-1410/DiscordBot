const { db } = require('../db');
const { getGameChannel } = require('./gameChannelService');
const { expireVuaChallenge, vuaQuestionText } = require('./funGameService');

function expireChallenge(guildId, game, now) {
  if (game === 'vuatiengviet') return expireVuaChallenge(guildId, now);
  return null;
}

function timeoutMessage(game, result) {
  return `⌛ Câu khó đã hết thời gian và không còn hiệu lực.\n\nCâu thường mới:\n${vuaQuestionText(result.nextQuestion)}`;
}

async function processExpiredChallenges(client, logger = console, now = Date.now()) {
  const rows = db.prepare("SELECT guild_id, game FROM game_sessions WHERE game = 'vuatiengviet'").all();
  let expired = 0;
  for (const row of rows) {
    const result = expireChallenge(row.guild_id, row.game, now);
    if (!result) continue;
    expired += 1;
    const setting = getGameChannel(row.guild_id, row.game);
    if (!setting || !client?.channels?.fetch) continue;
    try {
      const channel = await client.channels.fetch(setting.channel_id);
      if (channel?.isTextBased?.()) await channel.send({ content: timeoutMessage(row.game, result) });
    } catch (error) {
      logger.warn?.({ err: error, guildId: row.guild_id, game: row.game }, 'failed to announce expired hard question');
    }
  }
  return expired;
}

function startTimedChallengeMaintenance(client, logger = console) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processExpiredChallenges(client, logger); }
    catch (error) { logger.error?.({ err: error }, 'timed challenge maintenance failed'); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 1000);
  timer.unref?.();
  return timer;
}

module.exports = { processExpiredChallenges, startTimedChallengeMaintenance, timeoutMessage };
