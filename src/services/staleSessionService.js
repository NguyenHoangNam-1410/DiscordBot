const { EmbedBuilder } = require('discord.js');
const { db } = require('../db');
const { forceEndBlackjackSession } = require('./blackjackService');
const { forceEndMinesSession } = require('./minesService');
const { forceEndCoquaySession } = require('./coquayService');
const { forceEndChinchiroSession } = require('./chinchiroService');
const { forceEndHardcoreSession } = require('./hardcoreService');

const ttlValue = Number(process.env.SOLO_SESSION_TTL_MINUTES);
const SOLO_SESSION_TTL_MS = (Number.isFinite(ttlValue) && ttlValue >= 1 && ttlValue <= 1440 ? ttlValue : 10) * 60_000;
const NO_MESSAGE_TTL_MS = 2 * 60_000;
const SOLO_GAMES = Object.freeze([
  { table: 'blackjack_sessions', name: 'XÌ DÁCH', forceEnd: forceEndBlackjackSession },
  { table: 'mines_sessions', name: 'DÒ MÌN', forceEnd: forceEndMinesSession },
  { table: 'coquay_sessions', name: 'CÒ QUAY NGA', forceEnd: forceEndCoquaySession },
  { table: 'chinchiro_sessions', name: 'CHINCHIRO', forceEnd: forceEndChinchiroSession },
  { table: 'hardcore_sessions', name: 'SINH TỒN', forceEnd: forceEndHardcoreSession, ttl: 7 * 24 * 60 * 60_000 },
]);

function expireStaleSoloSessionsSync(now = Date.now()) {
  const expired = [];
  for (const game of SOLO_GAMES) {
    const rows = db.prepare(`SELECT id,guild_id,user_id,channel_id,message_id FROM ${game.table}
      WHERE updated_at < ? OR (message_id IS NULL AND updated_at < ?)`).all(now - (game.ttl || SOLO_SESSION_TTL_MS), now - NO_MESSAGE_TTL_MS);
    for (const row of rows) {
      // The player let the game sit idle after the message was posted, so the stake is forfeited. If the message was never posted the
      // player had no way to play (Discord or bot failure), so that stake is refunded.
      const forfeit = Boolean(row.message_id);
      const result = game.forceEnd(row.id, row.guild_id, 'system', { label: forfeit ? 'timeout-forfeit' : 'timeout-refund', forfeit });
      if (result) expired.push({ game, row, forfeit });
    }
  }
  return expired;
}

async function expireStaleSoloSessions(client, logger = console, now = Date.now()) {
  const expired = expireStaleSoloSessionsSync(now);
  for (const { game, row, forfeit } of expired) {
    if (!row.message_id || !client?.channels?.fetch) continue;
    try {
      const channel = await client.channels.fetch(row.channel_id);
      const message = channel?.isTextBased?.() ? await channel.messages.fetch(row.message_id) : null;
      if (message) await message.edit({ embeds: [new EmbedBuilder().setColor(0x7F8C8D).setTitle(`⌛ ${game.name} ĐÃ HẾT THỜI GIAN`)
        .setDescription(`Ván \`${row.id}\` không hoạt động quá lâu nên đã đóng. ${forfeit ? `<@${row.user_id}> không thao tác kịp nên **mất tiền cược**.` : `Tiền cược đã được hoàn lại cho <@${row.user_id}>.`}`)], components: [], allowedMentions: { parse: [] } });
    } catch (error) {
      if (error?.code !== 10003 && error?.code !== 10008) logger.warn?.({ err: error, sessionId: row.id }, 'could not update expired solo session');
    }
  }
  return expired.length;
}

function startStaleSessionMaintenance(client, logger = console) {
  const run = () => expireStaleSoloSessions(client, logger).catch(error => logger.error?.({ err: error }, 'stale session maintenance failed'));
  run();
  const timer = setInterval(run, 30_000); timer.unref?.(); return timer;
}

module.exports = { SOLO_SESSION_TTL_MS, NO_MESSAGE_TTL_MS, expireStaleSoloSessionsSync, expireStaleSoloSessions, startStaleSessionMaintenance };
