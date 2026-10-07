const { EmbedBuilder } = require("discord.js");
const { db } = require("../db");
const { getGameChannel } = require("./gameChannelService");
const { expireVuaChallenge } = require("./funGameService");

function expireChallenge(guildId, game, now) {
  if (game === "vuatiengviet") return expireVuaChallenge(guildId, now);
  return null;
}

function timeoutMessage(game, result) {
  return "⌛ Câu khó đã hết thời gian và không còn hiệu lực.";
}

async function processExpiredChallenges(
  client,
  logger = console,
  now = Date.now(),
) {
  const rows = db
    .prepare(
      "SELECT guild_id, game FROM game_sessions WHERE game = 'vuatiengviet'",
    )
    .all();
  let expired = 0;
  for (const row of rows) {
    const result = expireChallenge(row.guild_id, row.game, now);
    if (!result) continue;
    expired += 1;
    const setting = getGameChannel(row.guild_id, row.game);
    if (!setting || !client?.channels?.fetch) continue;
    try {
      const channel = await client.channels.fetch(setting.channel_id);
      if (channel?.isTextBased?.()) {
        await channel.send({
          content: timeoutMessage(row.game, result),
          allowedMentions: { parse: [] },
        });
        await require("../commands/vuatiengviet").postNextQuestionMessage(
          row.guild_id,
          channel,
          "expired",
        );
      }
    } catch (error) {
      logger.warn?.(
        { err: error, guildId: row.guild_id, game: row.game },
        "failed to announce expired hard question",
      );
    }
  }
  return expired;
}

// Đổi màu viền câu khó khi sang mốc thời gian mới (xanh lá → vàng → đỏ); chỉ sửa tin nhắn khi đổi mốc.
const renderedBands = new Map();
async function refreshChallengeColors(client, logger = console, now = Date.now()) {
  const { getVuaSession } = require("./funGameService");
  const vua = require("../commands/vuatiengviet");
  const rows = db
    .prepare("SELECT guild_id FROM game_sessions WHERE game = 'vuatiengviet'")
    .all();
  let edited = 0;
  for (const row of rows) {
    const session = getVuaSession(row.guild_id);
    const question = session?.question;
    if (!question?.hard || !session.uiMessageId || !session.uiChannelId) {
      renderedBands.delete(row.guild_id);
      continue;
    }
    const band = vua.countdownBand(question, now);
    const key = `${session.uiMessageId}:${band}:${question.expiresAt}`;
    if (renderedBands.get(row.guild_id) === key) continue;
    renderedBands.set(row.guild_id, key);
    try {
      const channel = await client.channels.fetch(session.uiChannelId);
      const message = await channel?.messages?.fetch(session.uiMessageId);
      const embed = message?.embeds?.[0];
      if (!embed || embed.color === vua.COLORS[band]) continue;
      await message.edit({
        embeds: [EmbedBuilder.from(embed).setColor(vua.COLORS[band])],
        allowedMentions: { parse: [] },
      });
      edited += 1;
    } catch (error) {
      logger.warn?.({ err: error, guildId: row.guild_id }, "failed to refresh challenge color");
    }
  }
  return edited;
}

function startTimedChallengeMaintenance(client, logger = console) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processExpiredChallenges(client, logger);
      await refreshChallengeColors(client, logger);
    } catch (error) {
      logger.error?.({ err: error }, "timed challenge maintenance failed");
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, 1000);
  timer.unref?.();
  return timer;
}

module.exports = {
  processExpiredChallenges,
  refreshChallengeColors,
  startTimedChallengeMaintenance,
  timeoutMessage,
};
