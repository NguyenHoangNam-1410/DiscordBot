const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { getAccount, spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createShoe, handScore, isBlackjack, getSessionByUser } = require('./blackjackService');
const { formatCoins } = require('../utils/economy');
const { createFairness } = require('./fairnessService');
const { experienceLines } = require('../utils/progressionView');
const { cardsLine } = require('../utils/cardEmoji');

const INVITE_TTL_MS = 60_000;
const PLAY_TTL_MS = 180_000;

function getBlackjackDuel(id) {
  return db.prepare('SELECT * FROM blackjack_duels WHERE id = ?').get(String(id)) || null;
}
function duelState(duel) { return duel?.state_json ? JSON.parse(duel.state_json) : null; }

function expireBlackjackDuel(id, now = Date.now()) { return expireTx(String(id), now); }

function createBlackjackDuel({ guildId, channelId, challengerId, opponentId, stake, now = Date.now() }) {
  const amount = Number(stake);
  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100_000) throw new Error('INVALID_BET');
  const maxBet = getGameBetLimit(guildId, 'blackjack');
  if (amount > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (String(challengerId) === String(opponentId)) throw new Error('SELF_DUEL');
  const stale = db.prepare(`SELECT id FROM blackjack_duels WHERE guild_id = ? AND status IN ('invited','playing') AND expires_at <= ?
    AND (challenger_id IN (?, ?) OR opponent_id IN (?, ?))`).all(String(guildId), now, String(challengerId), String(opponentId), String(challengerId), String(opponentId));
  for (const row of stale) expireBlackjackDuel(row.id, now);
  const active = db.prepare(`SELECT id FROM blackjack_duels WHERE guild_id = ? AND status IN ('invited','playing')
    AND (challenger_id IN (?, ?) OR opponent_id IN (?, ?)) LIMIT 1`)
    .get(String(guildId), String(challengerId), String(opponentId), String(challengerId), String(opponentId));
  if (active || getSessionByUser(guildId, challengerId) || getSessionByUser(guildId, opponentId)) throw new Error('ACTIVE_SESSION');
  const challenger = getAccount(guildId, challengerId);
  if (challenger.balance < amount) {
    const error = new Error('INSUFFICIENT_FUNDS'); error.code = 'INSUFFICIENT_FUNDS'; error.balance = challenger.balance; throw error;
  }
  const fair = createFairness();
  const duel = {
    id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), channel_id: String(channelId), message_id: null,
    challenger_id: String(challengerId), opponent_id: String(opponentId), stake: amount, state_json: JSON.stringify({ fair }),
    status: 'invited', winner_id: null, expires_at: now + INVITE_TTL_MS, created_at: now, updated_at: now,
  };
  db.prepare(`INSERT INTO blackjack_duels
    (id,guild_id,channel_id,message_id,challenger_id,opponent_id,stake,state_json,status,winner_id,expires_at,created_at,updated_at)
    VALUES (@id,@guild_id,@channel_id,@message_id,@challenger_id,@opponent_id,@stake,@state_json,@status,@winner_id,@expires_at,@created_at,@updated_at)`).run(duel);
  return duel;
}

function setBlackjackDuelMessage(id, messageId) {
  db.prepare('UPDATE blackjack_duels SET message_id = ?, updated_at = ? WHERE id = ?').run(String(messageId), Date.now(), String(id));
}

function draw(state) {
  if (!state.deck.length) state.deck = createShoe();
  return state.deck.pop();
}

function playerResult(player) {
  const score = handScore(player.cards).total;
  if (score > 21) return { value: -1, score, label: 'Quắc' };
  if (isBlackjack(player.cards)) return { value: 22, score, label: 'Xì dách' };
  return { value: score, score, label: `${score} điểm` };
}

function settleDuel(duel, state, now) {
  const challenger = playerResult(state.players[duel.challenger_id]);
  const opponent = playerResult(state.players[duel.opponent_id]);
  const winnerId = challenger.value === opponent.value ? null : challenger.value > opponent.value ? duel.challenger_id : duel.opponent_id;
  const challengerOutcome = !winnerId ? 'draw' : winnerId === duel.challenger_id ? 'win' : 'loss';
  const opponentOutcome = !winnerId ? 'draw' : winnerId === duel.opponent_id ? 'win' : 'loss';
  const challengerAccount = settleReservedGame({ guildId: duel.guild_id, userId: duel.challenger_id, payout: !winnerId ? duel.stake : winnerId === duel.challenger_id ? duel.stake * 2 : 0, stake: duel.stake, game: 'blackjack', outcome: challengerOutcome,
    operationId: `settle:blackjack-duel:${duel.id}:${duel.challenger_id}` });
  const opponentAccount = settleReservedGame({ guildId: duel.guild_id, userId: duel.opponent_id, payout: !winnerId ? duel.stake : winnerId === duel.opponent_id ? duel.stake * 2 : 0, stake: duel.stake, game: 'blackjack', outcome: opponentOutcome,
    operationId: `settle:blackjack-duel:${duel.id}:${duel.opponent_id}` });
  db.prepare("UPDATE blackjack_duels SET state_json = ?, status = 'completed', winner_id = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), winnerId, now, duel.id);
  return { ...getBlackjackDuel(duel.id), progression: [
    { userId: duel.challenger_id, experienceGained: challengerAccount.experienceGained, levelUps: challengerAccount.levelUps, bonusDrops: challengerAccount.bonusDrops },
    { userId: duel.opponent_id, experienceGained: opponentAccount.experienceGained, levelUps: opponentAccount.levelUps, bonusDrops: opponentAccount.bonusDrops },
  ] };
}

const acceptTx = db.transaction((id, actorId, now, forcedDeck) => {
  let duel = getBlackjackDuel(id);
  if (!duel || duel.status !== 'invited') throw new Error('DUEL_CLOSED');
  if (duel.opponent_id !== String(actorId)) throw new Error('NOT_OPPONENT');
  if (duel.expires_at <= now) {
    db.prepare("UPDATE blackjack_duels SET status = 'expired', updated_at = ? WHERE id = ?").run(now, id);
    throw new Error('DUEL_EXPIRED');
  }
  if (getSessionByUser(duel.guild_id, duel.challenger_id) || getSessionByUser(duel.guild_id, duel.opponent_id)) throw new Error('ACTIVE_SESSION');
  spendCoins({ guildId: duel.guild_id, userId: duel.challenger_id, amount: duel.stake, reason: `blackjack-duel:reserve:${duel.id}` });
  spendCoins({ guildId: duel.guild_id, userId: duel.opponent_id, amount: duel.stake, reason: `blackjack-duel:reserve:${duel.id}` });
  const fair = duelState(duel)?.fair || createFairness();
  const state = { deck: forcedDeck ? [...forcedDeck] : createShoe(6, fair.serverSeed), fair, players: {
    [duel.challenger_id]: { cards: [], status: 'playing' }, [duel.opponent_id]: { cards: [], status: 'playing' },
  } };
  for (let index = 0; index < 2; index += 1) {
    state.players[duel.challenger_id].cards.push(draw(state));
    state.players[duel.opponent_id].cards.push(draw(state));
  }
  if (isBlackjack(state.players[duel.challenger_id].cards)) state.players[duel.challenger_id].status = 'stand';
  if (isBlackjack(state.players[duel.opponent_id].cards)) state.players[duel.opponent_id].status = 'stand';
  db.prepare("UPDATE blackjack_duels SET state_json = ?, status = 'playing', expires_at = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), now + PLAY_TTL_MS, now, id);
  duel = getBlackjackDuel(id);
  if (Object.values(state.players).every(player => player.status !== 'playing')) duel = settleDuel(duel, state, now);
  return duel;
});

function acceptBlackjackDuel(id, actorId, now = Date.now(), forcedDeck = null) { return acceptTx(String(id), String(actorId), now, forcedDeck); }

function declineBlackjackDuel(id, actorId, now = Date.now()) {
  const duel = getBlackjackDuel(id);
  if (!duel || duel.status !== 'invited') throw new Error('DUEL_CLOSED');
  if (duel.opponent_id !== String(actorId)) throw new Error('NOT_OPPONENT');
  db.prepare("UPDATE blackjack_duels SET status = 'declined', updated_at = ? WHERE id = ?").run(now, String(id));
  return getBlackjackDuel(id);
}

const playTx = db.transaction((id, actorId, action, now) => {
  let duel = getBlackjackDuel(id);
  if (!duel || duel.status !== 'playing') throw new Error('DUEL_NOT_PLAYING');
  if (duel.expires_at <= now) throw new Error('DUEL_EXPIRED');
  if (![duel.challenger_id, duel.opponent_id].includes(String(actorId))) throw new Error('NOT_DUEL_PLAYER');
  const state = duelState(duel); const player = state.players[String(actorId)];
  if (action === 'view') return { duel, state, settled: false, viewed: true };
  if (player.status !== 'playing') throw new Error('PLAYER_FINISHED');
  if (action === 'hit') {
    player.cards.push(draw(state));
    const score = handScore(player.cards).total;
    if (score >= 21) player.status = score > 21 ? 'bust' : 'stand';
  } else if (action === 'stand') player.status = 'stand';
  else throw new Error('INVALID_ACTION');
  db.prepare('UPDATE blackjack_duels SET state_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), now, duel.id);
  let settled = false;
  if (Object.values(state.players).every(item => item.status !== 'playing')) { duel = settleDuel(duel, state, now); settled = true; }
  else duel = getBlackjackDuel(id);
  return { duel, state, settled, viewed: false };
});

function playBlackjackDuel(id, actorId, action, now = Date.now()) { return playTx(String(id), String(actorId), String(action), now); }

const expireTx = db.transaction((id, now) => {
  const duel = getBlackjackDuel(id);
  if (!duel || !['invited', 'playing'].includes(duel.status) || duel.expires_at > now) return null;
  // Players who still owed an action when time ran out caused the expiry and forfeit; players who had finished are refunded.
  const forfeited = [];
  if (duel.status === 'playing') {
    const players = duelState(duel)?.players || {};
    for (const userId of [duel.challenger_id, duel.opponent_id]) {
      if (players[userId]?.status === 'playing') { forfeited.push(userId); continue; }
      creditCoins({ guildId: duel.guild_id, userId, amount: duel.stake, reason: `blackjack-duel:refund:${duel.id}`,
        operationId: `refund:blackjack-duel:${duel.id}:${userId}` });
    }
  }
  const refunded = duel.status === 'playing' && forfeited.length < 2;
  db.prepare("UPDATE blackjack_duels SET status = 'expired', updated_at = ? WHERE id = ?").run(now, id);
  return { ...duel, status: 'expired', refunded, forfeited };
});

function cardsText(cards) { return cardsLine(cards, 'code'); }
function privateHandText(duel, userId) {
  const player = duelState(duel)?.players?.[String(userId)];
  if (!player) return 'Không tìm thấy tay bài.';
  const result = playerResult(player);
  return `## 🃏 BÀI CỦA BẠN\n### ${cardsText(player.cards)}\n## ${result.label}\n${player.status === 'playing' ? 'Bạn có thể rút thêm hoặc dừng.' : 'Bạn đã chốt tay bài.'}`;
}

function blackjackDuelEmbed(duel) {
  const state = duelState(duel); const done = duel.status === 'completed';
  const color = done ? (duel.winner_id ? 0xF1C40F : 0x95A5A6) : duel.status === 'playing' ? 0x5865F2 : duel.status === 'invited' ? 0xE67E22 : 0x7F8C8D;
  const embed = new EmbedBuilder().setColor(color).setTitle('🃏 XÌ DÁCH · ĐẤU TAY ĐÔI')
    .setDescription(`### <@${duel.challenger_id}>  ⚡  <@${duel.opponent_id}>\n:coin: **${formatCoins(duel.stake)} xu/người** · Tổng thưởng **${formatCoins(duel.stake * 2)} xu**`);
  if (duel.status === 'invited') embed.addFields({ name: '📨 Lời thách đấu', value: `Đang chờ đối thủ phản hồi · <t:${Math.floor(duel.expires_at / 1000)}:R>` });
  if (duel.status === 'playing') {
    const statusText = id => state.players[id].status === 'playing' ? '🎴 Đang chọn' : '✅ Đã dừng';
    embed.addFields(
      { name: '🔵 NGƯỜI THÁCH ĐẤU', value: `<@${duel.challenger_id}>\n${statusText(duel.challenger_id)}`, inline: true },
      { name: '🔴 ĐỐI THỦ', value: `<@${duel.opponent_id}>\n${statusText(duel.opponent_id)}`, inline: true },
      { name: '⏱️ Thời gian', value: `Kết thúc <t:${Math.floor(duel.expires_at / 1000)}:R> · Bài được giữ kín đến cuối ván.` },
    );
  }
  if (done) {
    const handField = (id, icon) => { const player = state.players[id]; const result = playerResult(player); return { name: `${icon} TAY BÀI`, value: `### <@${id}>\n### ${cardsText(player.cards)}\n**${result.label}**`, inline: true }; };
    embed.addFields(handField(duel.challenger_id, '🔵'), handField(duel.opponent_id, '🔴'),
      { name: duel.winner_id ? '🏆 CHIẾN THẮNG' : '🤝 HÒA', value: duel.winner_id ? `<@${duel.winner_id}> nhận **${formatCoins(duel.stake * 2)} xu**` : 'Hai người được hoàn lại toàn bộ tiền cược.' });
    const exp = experienceLines(duel.progression || []);
    if (exp.length) embed.addFields({ name: ':test_tube: EXP NHẬN ĐƯỢC', value: exp.join('\n') });
  }
  if (duel.status === 'declined') embed.addFields({ name: '❌ Đã từ chối', value: 'Đối thủ không nhận lời thách đấu.' });
  if (duel.status === 'expired') embed.addFields({ name: '⌛ Đã hết hạn', value: duel.forfeited?.length ? `${duel.forfeited.map(id => `<@${id}>`).join(', ')} chưa hoàn tất lượt kịp nên **mất tiền cược**${duel.refunded ? '; người còn lại được hoàn tiền' : ''}.` : duel.refunded ? 'Ván chưa hoàn thành, tiền cược đã được hoàn cho cả hai.' : 'Lời thách đấu không được chấp nhận kịp thời.' });
  return embed.setFooter({ text: `Mã trận ${duel.id} · Mục tiêu: gần 21 nhất, Xì dách ưu tiên cao nhất` });
}

function inviteButtons(id) { return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`bjduel:${id}:accept`).setLabel('Nhận kèo').setEmoji('⚔️').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`bjduel:${id}:decline`).setLabel('Từ chối').setEmoji('✖️').setStyle(ButtonStyle.Danger),
)]; }
function playButtons(id) { return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`bjduel:${id}:view`).setLabel('Xem bài').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`bjduel:${id}:hit`).setLabel('Rút bài').setEmoji('➕').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`bjduel:${id}:stand`).setLabel('Dừng').setEmoji('✋').setStyle(ButtonStyle.Success),
)]; }
function replayButtons(duel) { return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`replay:bjduel:${duel.stake}:${duel.challenger_id}:${duel.opponent_id}`).setLabel('Tái đấu').setEmoji('🔁').setStyle(ButtonStyle.Success),
)]; }

async function handleBlackjackDuelButton(interaction) {
  const [, id, action] = interaction.customId.split(':'); let duel = getBlackjackDuel(id);
  if (!duel || duel.guild_id !== interaction.guildId || duel.channel_id !== interaction.channelId) return interaction.reply({ content: 'Ván Xì dách này không còn tồn tại.', flags: MessageFlags.Ephemeral });
  if (duel.expires_at <= Date.now() && ['invited', 'playing'].includes(duel.status)) {
    duel = expireBlackjackDuel(id) || duel;
    return interaction.update({ content: null, embeds: [blackjackDuelEmbed(duel)], components: [] });
  }
  try {
    if (action === 'decline') { duel = declineBlackjackDuel(id, interaction.user.id); return interaction.update({ content: null, embeds: [blackjackDuelEmbed(duel)], components: [] }); }
    if (action === 'accept') {
      duel = acceptBlackjackDuel(id, interaction.user.id);
      return interaction.update({ content: null, embeds: [blackjackDuelEmbed(duel)], components: duel.status === 'completed' ? replayButtons(duel) : playButtons(id), allowedMentions: { parse: [] } });
    }
    const played = playBlackjackDuel(id, interaction.user.id, action);
    await interaction.reply({ content: privateHandText(played.duel, interaction.user.id), flags: MessageFlags.Ephemeral });
    if (!played.viewed) await interaction.message.edit({ content: null, embeds: [blackjackDuelEmbed(played.duel)], components: played.settled ? replayButtons(played.duel) : playButtons(id), allowedMentions: { parse: [] } });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') return interaction.reply({ content: 'Một người chơi không đủ xu để tham gia ván này.', flags: MessageFlags.Ephemeral });
    const messages = { NOT_OPPONENT: 'Chỉ người được thách đấu mới có thể bấm nút này.', DUEL_CLOSED: 'Lời thách đấu đã được xử lý.', ACTIVE_SESSION: 'Một người đang có ván Xì dách khác.', DUEL_NOT_PLAYING: 'Ván chưa bắt đầu hoặc đã kết thúc.', NOT_DUEL_PLAYER: 'Chỉ hai người trong ván được thao tác.', PLAYER_FINISHED: 'Bạn đã chốt tay bài và không thể rút thêm.', DUEL_EXPIRED: 'Ván đã hết hạn.' };
    if (messages[error.message]) return interaction.reply({ content: messages[error.message], flags: MessageFlags.Ephemeral });
    throw error;
  }
}

function forceEndBlackjackDuel(id, guildId, adminId, now = Date.now(), { forfeitUserId = null } = {}) {
  return db.transaction(() => {
    const duel = getBlackjackDuel(id);
    if (!duel || duel.guild_id !== String(guildId) || !['invited', 'playing'].includes(duel.status)) return null;
    const refunded = duel.status === 'playing';
    if (refunded) for (const userId of [duel.challenger_id, duel.opponent_id]) {
      if (userId === String(forfeitUserId)) continue;
      creditCoins({ guildId: duel.guild_id, userId, amount: duel.stake, reason: `blackjack-duel:admin-refund:${adminId}:${duel.id}`,
        operationId: `refund:blackjack-duel:${duel.id}:${userId}` });
    }
    db.prepare("UPDATE blackjack_duels SET status = 'expired', updated_at = ? WHERE id = ?").run(now, duel.id);
    return { session: duel, participants: [duel.challenger_id, duel.opponent_id], refunded, gameName: 'XÌ DÁCH ĐẤU NGƯỜI' };
  })();
}

async function expireDueBlackjackDuels(client, logger = console, now = Date.now()) {
  const due = db.prepare("SELECT id FROM blackjack_duels WHERE status IN ('invited','playing') AND expires_at <= ?").all(now); let expired = 0;
  for (const row of due) {
    const duel = expireBlackjackDuel(row.id, now); if (!duel) continue; expired += 1;
    if (!duel.message_id) continue;
    try { const channel = await client.channels.fetch(duel.channel_id); const message = channel?.isTextBased?.() ? await channel.messages.fetch(duel.message_id) : null; if (message) await message.edit({ content: null, embeds: [blackjackDuelEmbed(duel)], components: [] }); }
    catch (error) { if (error?.code !== 10003 && error?.code !== 10008) logger.warn?.({ err: error, duelId: duel.id }, 'could not update expired blackjack duel'); }
  }
  return expired;
}
function startBlackjackDuelMaintenance(client, logger = console) {
  const run = () => expireDueBlackjackDuels(client, logger).catch(error => logger.error?.({ err: error }, 'blackjack duel maintenance failed'));
  run(); const timer = setInterval(run, 15_000); timer.unref?.(); return timer;
}

module.exports = { INVITE_TTL_MS, PLAY_TTL_MS, forceEndBlackjackDuel, getBlackjackDuel, duelState, createBlackjackDuel, setBlackjackDuelMessage, acceptBlackjackDuel, declineBlackjackDuel, playBlackjackDuel, expireBlackjackDuel, playerResult, privateHandText, blackjackDuelEmbed, inviteButtons, playButtons, replayButtons, handleBlackjackDuelButton, expireDueBlackjackDuels, startBlackjackDuelMaintenance };
