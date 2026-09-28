const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { transferCoins } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { DAY_MS, dayKey } = require('./progressionService');

const REQUEST_TTL_MS = 30_000;
const REQUEST_COOLDOWN_MS = 60_000;
const DAILY_REQUEST_LIMIT = 5;

function getCoinRequest(id) {
  return db.prepare('SELECT * FROM coin_requests WHERE id = ?').get(String(id)) || null;
}

function expireRequests(now = Date.now()) {
  return db.prepare("UPDATE coin_requests SET status = 'expired', updated_at = ? WHERE status = 'open' AND expires_at <= ?").run(now, now).changes;
}

const createCoinRequestTx = db.transaction(({ guildId, channelId, requesterId, targetId, amount, reason = '', now = Date.now() }) => {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) throw new Error('INVALID_AMOUNT');
  if (String(requesterId) === String(targetId)) throw new Error('SELF_REQUEST');
  expireRequests(now);
  const today = dayKey(now);
  const usedToday = db.prepare('SELECT created_at FROM coin_requests WHERE requester_id=? AND created_at>=?')
    .all(String(requesterId), now - DAY_MS * 2).filter(row => dayKey(row.created_at) === today).length;
  if (usedToday >= DAILY_REQUEST_LIMIT) {
    const error = new Error('DAILY_REQUEST_LIMIT'); error.used = usedToday; error.limit = DAILY_REQUEST_LIMIT; error.dayKey = today; throw error;
  }
  const active = db.prepare("SELECT * FROM coin_requests WHERE guild_id = ? AND requester_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .get(String(guildId), String(requesterId));
  if (active) { const error = new Error('ACTIVE_REQUEST'); error.request = active; throw error; }
  const recent = db.prepare('SELECT created_at FROM coin_requests WHERE guild_id = ? AND requester_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(String(guildId), String(requesterId));
  if (recent && recent.created_at + REQUEST_COOLDOWN_MS > now) {
    const error = new Error('REQUEST_COOLDOWN');
    error.remaining = recent.created_at + REQUEST_COOLDOWN_MS - now;
    throw error;
  }
  const request = {
    id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), channel_id: String(channelId), message_id: null,
    requester_id: String(requesterId), target_id: String(targetId), amount: value,
    reason: String(reason || '').trim().slice(0, 200) || null, status: 'open',
    expires_at: now + REQUEST_TTL_MS, created_at: now, updated_at: now,
  };
  db.prepare(`INSERT INTO coin_requests
    (id,guild_id,channel_id,message_id,requester_id,target_id,amount,reason,status,expires_at,created_at,updated_at)
    VALUES (@id,@guild_id,@channel_id,@message_id,@requester_id,@target_id,@amount,@reason,@status,@expires_at,@created_at,@updated_at)`).run(request);
  return request;
});
function createCoinRequest(args) { return createCoinRequestTx(args); }

function setRequestMessage(id, messageId) {
  db.prepare('UPDATE coin_requests SET message_id = ?, updated_at = ? WHERE id = ?').run(String(messageId), Date.now(), String(id));
}

const acceptTx = db.transaction((id, actorId, now) => {
  const request = getCoinRequest(id);
  if (!request || request.status !== 'open') throw new Error('REQUEST_CLOSED');
  if (request.target_id !== String(actorId)) throw new Error('NOT_REQUEST_TARGET');
  if (request.expires_at <= now) {
    db.prepare("UPDATE coin_requests SET status = 'expired', updated_at = ? WHERE id = ?").run(now, id);
    throw new Error('REQUEST_EXPIRED');
  }
  const transfer = transferCoins({ guildId: request.guild_id, fromUserId: request.target_id, toUserId: request.requester_id, amount: request.amount });
  db.prepare("UPDATE coin_requests SET status = 'accepted', updated_at = ? WHERE id = ? AND status = 'open'").run(now, id);
  return { request, transfer };
});

function acceptCoinRequest(id, actorId, now = Date.now()) { return acceptTx(String(id), String(actorId), now); }

function declineCoinRequest(id, actorId, now = Date.now()) {
  const request = getCoinRequest(id);
  if (!request || request.status !== 'open') throw new Error('REQUEST_CLOSED');
  if (request.target_id !== String(actorId)) throw new Error('NOT_REQUEST_TARGET');
  db.prepare("UPDATE coin_requests SET status = 'declined', updated_at = ? WHERE id = ? AND status = 'open'").run(now, String(id));
  return request;
}

function requestEmbed(request, status = request.status) {
  const color = status === 'accepted' ? 0x2ECC71 : status === 'declined' ? 0xE74C3C : status === 'expired' ? 0x7F8C8D : 0xF1C40F;
  const state = { open: 'Đang chờ phản hồi', accepted: 'Đã chấp nhận', declined: 'Đã từ chối', expired: 'Đã hết hạn' }[status] || status;
  return new EmbedBuilder().setColor(color).setTitle('🪙 YÊU CẦU XIN XU')
    .setDescription(`<@${request.requester_id}> đang xin <@${request.target_id}> **${formatCoins(request.amount)} xu**.`)
    .addFields(
      { name: 'Trạng thái', value: state, inline: true },
      { name: 'Hết hạn', value: status === 'open' ? `<t:${Math.floor(request.expires_at / 1000)}:R>` : '—', inline: true },
      ...(request.reason ? [{ name: 'Lý do', value: request.reason }] : []),
    ).setFooter({ text: 'Chỉ người được xin mới có thể quyết định' });
}

function requestButtons(requestId, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`anxin:${requestId}:accept`).setLabel('Cho xu').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`anxin:${requestId}:decline`).setLabel('Từ chối').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  )];
}

async function handleCoinRequestButton(interaction) {
  const [, id, action] = interaction.customId.split(':');
  const request = getCoinRequest(id);
  if (!request || request.guild_id !== interaction.guildId || request.channel_id !== interaction.channelId) {
    return interaction.reply({ content: 'Yêu cầu này không còn tồn tại.', flags: MessageFlags.Ephemeral });
  }
  if (request.target_id !== interaction.user.id) return interaction.reply({ content: 'Chỉ người được xin xu mới có thể bấm nút này.', flags: MessageFlags.Ephemeral });
  try {
    if (action === 'decline') {
      declineCoinRequest(id, interaction.user.id);
      return interaction.update({ embeds: [requestEmbed(request, 'declined')], components: [] });
    }
    const result = acceptCoinRequest(id, interaction.user.id);
    return interaction.update({
      content: `✅ <@${request.target_id}> đã cho <@${request.requester_id}> **${formatCoins(request.amount)} xu**.`,
      embeds: [requestEmbed(request, 'accepted')], components: [], allowedMentions: { users: [request.target_id, request.requester_id] },
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') return interaction.reply({ content: `Bạn không đủ xu để chấp nhận. Số dư hiện tại: **${formatCoins(error.balance)} xu**.`, flags: MessageFlags.Ephemeral });
    if (error.message === 'REQUEST_EXPIRED') return interaction.update({ embeds: [requestEmbed(request, 'expired')], components: [] });
    if (error.message === 'REQUEST_CLOSED') return interaction.reply({ content: 'Yêu cầu này đã được xử lý.', flags: MessageFlags.Ephemeral });
    throw error;
  }
}

function cleanupCoinRequests(now = Date.now(), retentionDays = 1) {
  expireRequests(now);
  return db.prepare("DELETE FROM coin_requests WHERE status <> 'open' AND updated_at < ?").run(now - retentionDays * 86_400_000).changes;
}

async function cleanupClosedCoinRequestMessages(client, logger = console, now = Date.now(), retentionDays = 1) {
  expireRequests(now);
  const requests = db.prepare("SELECT * FROM coin_requests WHERE status <> 'open' AND updated_at < ?")
    .all(now - retentionDays * 86_400_000);
  let messages = 0;
  for (const request of requests) {
    if (request.channel_id && request.message_id) {
      try {
        const channel = await client.channels.fetch(request.channel_id);
        const message = channel?.isTextBased?.() ? await channel.messages.fetch(request.message_id) : null;
        if (message) { await message.delete(); messages += 1; }
      } catch (error) {
        if (error?.code !== 10003 && error?.code !== 10008) {
          logger.warn?.({ err: error, requestId: request.id }, 'could not delete closed coin request message');
        }
      }
    }
    db.prepare('DELETE FROM coin_requests WHERE id = ?').run(request.id);
  }
  return { records: requests.length, messages };
}

module.exports = {
  REQUEST_TTL_MS, REQUEST_COOLDOWN_MS, DAILY_REQUEST_LIMIT, createCoinRequest, getCoinRequest, setRequestMessage,
  acceptCoinRequest, declineCoinRequest, requestEmbed, requestButtons, handleCoinRequestButton,
  expireRequests, cleanupCoinRequests, cleanupClosedCoinRequestMessages,
};
