const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../db');
const { getAccount, spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { formatCoins } = require('../utils/economy');
const { createDeck, bestHand, describeHand, awardPots } = require('./pokerEngine');
const { createFairness, fairInt } = require('./fairnessService');
const { getGameConfig } = require('./gameConfigService');
const { consumeActiveEffect } = require('./effectStateService');

const MAX_PLAYERS = 2;
const TURN_TTL_MS = 3 * 60_000;
const VARIANTS = Object.freeze({
  texas: { name: 'Texas Hold’em', holes: 2 }, sixplus: { name: 'Poker 6+', holes: 2 },
  pineapple: { name: 'Crazy Pineapple', holes: 3 }, omaha: { name: 'Omaha 5 lá', holes: 5 },
});

function getSession(id) { return db.prepare('SELECT * FROM poker_sessions WHERE id=?').get(String(id)) || null; }
function parseState(session) { return JSON.parse(session.state_json); }
function saveState(session, state, now = Date.now()) {
  db.prepare('UPDATE poker_sessions SET state_json=?,expires_at=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(state), now + TURN_TTL_MS, now, session.id);
}
function hasActiveTable(guildId, userId, exceptSessionId = null) {
  const sessions = db.prepare("SELECT id,state_json FROM poker_sessions WHERE guild_id=? AND id<>COALESCE(?, '')").all(String(guildId), exceptSessionId);
  return sessions.some(session => {
    const state = JSON.parse(session.state_json);
    return state.phase !== 'complete' && state.players?.some(player => player.id === String(userId));
  });
}
function getPokerAnte(guildId) { return Math.min(getGameConfig(guildId, 'POKER_ANTE'), getGameBetLimit(guildId, 'poker')); }
function reserveAnte(guildId, userId, variant, ante) {
  const account = getAccount(guildId, userId);
  if (account.balance < ante) { const error = new Error('INSUFFICIENT_FUNDS'); error.code = 'INSUFFICIENT_FUNDS'; error.balance = account.balance; throw error; }
  const stack = Math.max(0, Math.min(account.balance, getGameBetLimit(guildId, 'poker')) - ante);
  spendCoins({ guildId, userId, amount: ante, reason: `poker:${variant}:ante` });
  return { stack };
}

function createPokerLobby({ guildId, channelId, userId, username, variant }) {
  if (!VARIANTS[variant]) throw new Error('INVALID_VARIANT');
  if (hasActiveTable(guildId, userId) || db.prepare('SELECT 1 FROM poker_sessions WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId))) throw new Error('ACTIVE_SESSION');
  return db.transaction(() => {
    const ante = getPokerAnte(guildId); const player = reserveAnte(guildId, userId, variant, ante); const now = Date.now();
    const id = crypto.randomBytes(6).toString('hex'); const fair = createFairness();
    const state = { mode: 'multiplayer', phase: 'lobby', variant, ante, players: [
      { id: String(userId), name: String(username || 'Người chơi').slice(0, 64), stack: player.stack, committed: 0, streetBet: 0, lobbyAnte: ante, folded: false, allIn: false, hole: [], pokerInsurance: false },
    ], board: [], deck: [], street: 'lobby', currentBet: 0, raises: 0, pending: [], discardPending: [], turnUserId: null, log: [`💰 Tiền vào bàn: ${formatCoins(ante)} xu/người.`, '🪑 Đang chờ thêm một người chơi.'], result: null, fair, fairCounter: 0 };
    const session = { id, guild_id: String(guildId), channel_id: String(channelId), message_id: null, user_id: String(userId), variant, state_json: JSON.stringify(state), expires_at: now + TURN_TTL_MS, created_at: now, updated_at: now };
    db.prepare('INSERT INTO poker_sessions(id,guild_id,channel_id,message_id,user_id,variant,state_json,expires_at,created_at,updated_at) VALUES(@id,@guild_id,@channel_id,@message_id,@user_id,@variant,@state_json,@expires_at,@created_at,@updated_at)').run(session);
    return { session, state };
  })();
}

function joinPokerTable(sessionId, userId, username) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session) throw new Error('TABLE_CLOSED');
    const state = parseState(session);
    if (state.mode !== 'multiplayer' || state.phase !== 'lobby') throw new Error('TABLE_CLOSED');
    if (state.players.some(player => player.id === String(userId))) throw new Error('ALREADY_SEATED');
    if (state.players.length >= MAX_PLAYERS) throw new Error('TABLE_FULL');
    if (hasActiveTable(session.guild_id, userId, sessionId)) throw new Error('ACTIVE_SESSION');
    const ante = state.ante; const player = reserveAnte(session.guild_id, userId, state.variant, ante);
    state.players.push({ id: String(userId), name: String(username || 'Người chơi').slice(0, 64), stack: player.stack, committed: 0, streetBet: 0, lobbyAnte: ante, folded: false, allIn: false, hole: [], pokerInsurance: false });
    state.log.push(`🪑 <@${userId}> đã ngồi vào bàn.`); saveState(session, state);
    return state;
  })();
}

function pay(player, amount) {
  const paid = Math.min(player.stack, Math.max(0, amount));
  player.stack -= paid; player.streetBet += paid; player.committed += paid;
  if (player.stack === 0) player.allIn = true;
  return paid;
}
function activePlayers(state) { return state.players.filter(player => !player.folded); }
function actionablePlayers(state) { return state.players.filter(player => !player.folded && !player.allIn); }
function playerById(state, userId) { return state.players.find(player => player.id === String(userId)); }
function userCanAct(session, state, userId) {
  return session.guild_id && state.players.some(player => player.id === String(userId)) && state.turnUserId === String(userId);
}
function availableBet(state, player, guildId) { return Math.max(0, Math.min(player.stack, getGameBetLimit(guildId, 'poker') - player.committed)); }
function maxRaiseAmount(state, player, guildId) {
  if (state.phase !== 'betting' || !player || player.allIn || player.folded || state.raises >= 2) return 0;
  const call = Math.max(0, state.currentBet - player.streetBet);
  return Math.max(0, availableBet(state, player, guildId) - call);
}
function draw(state) { return state.deck.pop(); }
function resetStreet(state) { state.currentBet = 0; state.raises = 0; state.players.forEach(player => { player.streetBet = 0; }); }
function nextPending(state, afterId = null) {
  const order = state.players.map(player => player.id); const start = afterId ? order.indexOf(afterId) : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const id = order[(start + offset) % order.length];
    if (state.pending.includes(id)) { state.turnUserId = id; return id; }
  }
  state.turnUserId = null; return null;
}
function runout(session, state) {
  while (state.board.length < 5 && activePlayers(state).length > 1) state.board.push(draw(state));
  return settle(session, state);
}
function advance(session, state) {
  if (activePlayers(state).length === 1) return settle(session, state, 'everyone-folded');
  if (state.variant === 'pineapple' && state.street === 'flop' && state.players.some(player => !player.folded && player.hole.length === 3)) {
    state.phase = 'discard'; state.discardPending = state.players.filter(player => !player.folded && player.hole.length === 3).map(player => player.id);
    state.turnUserId = state.discardPending[0]; state.log.push('🍍 Mỗi người còn bài chọn một lá tẩy để bỏ trước Turn.'); saveState(session, state); return state;
  }
  if (state.street === 'river') return settle(session, state);
  state.street = state.street === 'flop' ? 'turn' : 'river'; state.board.push(draw(state)); resetStreet(state);
  state.pending = actionablePlayers(state).map(player => player.id); state.log.push(`🃏 Mở ${state.street === 'turn' ? 'Turn' : 'River'} — vòng cược mới.`);
  if (state.pending.length <= 1) return runout(session, state);
  nextPending(state); saveState(session, state); return state;
}

function startPokerHand(sessionId, actorId, forcedDeck = null) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session) throw new Error('TABLE_CLOSED');
    const state = parseState(session);
    if (session.user_id !== String(actorId)) throw new Error('NOT_HOST');
    if (state.mode !== 'multiplayer' || state.phase !== 'lobby') throw new Error('TABLE_CLOSED');
    if (state.players.length !== MAX_PLAYERS) throw new Error('NEED_OPPONENT');
    const deck = forcedDeck ? [...forcedDeck] : createDeck(state.variant === 'sixplus', state.fair.serverSeed);
    for (const player of state.players) player.pokerInsurance = consumeActiveEffect(session.guild_id, player.id, 'poker_insurance');
    for (let card = 0; card < VARIANTS[state.variant].holes; card += 1) for (const player of state.players) player.hole.push(deck.pop());
    state.deck = deck; state.board = [deck.pop(), deck.pop(), deck.pop()]; state.phase = 'betting'; state.street = 'flop'; state.currentBet = 0; state.raises = 0;
    for (const player of state.players) { player.committed = player.lobbyAnte; player.lobbyAnte = 0; player.allIn = player.stack === 0; }
    state.pending = actionablePlayers(state).map(player => player.id); state.turnUserId = state.pending[0] || null;
    state.log.push(state.turnUserId ? `🃏 Flop đã mở. <@${state.turnUserId}> hành động trước.` : '🃏 Flop đã mở.'); saveState(session, state);
    return state.pending.length <= 1 ? advance(session, state) : state;
  })();
}

function settle(session, state, reason = 'showdown') {
  while (state.board.length < 5 && activePlayers(state).length > 1) state.board.push(draw(state));
  const scores = {}; for (const player of activePlayers(state)) scores[player.id] = bestHand(player.hole, state.board, state.variant);
  const awarded = awardPots(state.players, scores); const results = [];
  for (const player of state.players) {
    let payout = awarded.awards[player.id] || 0; let insurance = 0; let insurancePercent = 0;
    if (player.pokerInsurance && !player.folded && reason === 'showdown' && payout === 0) {
      insurancePercent = state.fair?.serverSeed ? fairInt(state.fair.serverSeed, `poker-insurance:${player.id}`, state.fairCounter++, 26) + 25 : crypto.randomInt(25, 51);
      insurance = Math.max(1, Math.floor(player.committed * insurancePercent / 100)); payout += insurance;
    }
    player.stack += awarded.awards[player.id] || 0;
    const outcome = payout > player.committed ? 'win' : payout === player.committed ? 'draw' : 'loss';
    const account = settleReservedGame({ guildId: session.guild_id, userId: player.id, payout, stake: player.committed, game: 'poker', outcome,
      operationId: `settle:poker:${session.id}:${player.id}` });
    results.push({ userId: player.id, payout, outcome, insurance, insurancePercent, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops });
  }
  state.phase = 'complete'; state.turnUserId = null; state.result = { reason, scores, pots: awarded.pots, refunds: awarded.refunds, players: results };
  db.prepare('DELETE FROM poker_sessions WHERE id=?').run(session.id); return state;
}

function advanceAction(session, state, actor, action, amount = 0) {
  const player = playerById(state, actor);
  if (!player || !userCanAct(session, state, actor)) throw new Error('NOT_YOUR_TURN');
  if (action === 'fold') { player.folded = true; state.pending = state.pending.filter(id => id !== player.id); state.log.push(`🏳️ <@${player.id}> bỏ bài.`); }
  else {
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    if (action === 'call') {
      const paid = pay(player, Math.min(toCall, availableBet(state, player, session.guild_id)));
      if (paid) spendCoins({ guildId: session.guild_id, userId: player.id, amount: paid, reason: `poker:${state.variant}:call` });
      if (paid < toCall || player.committed >= getGameBetLimit(session.guild_id, 'poker')) player.allIn = true;
      state.pending = state.pending.filter(id => id !== player.id);
      state.log.push(player.allIn && toCall ? `🔥 <@${player.id}> All-in để theo.` : toCall ? `✅ <@${player.id}> theo ${formatCoins(paid)} xu.` : `✅ <@${player.id}> check.`);
    } else if (action === 'raise') {
      const raise = Number(amount); if (!Number.isSafeInteger(raise) || raise < 10) throw new Error('INVALID_RAISE');
      const max = maxRaiseAmount(state, player, session.guild_id);
      if (raise > max) { const error = new Error('BET_LIMIT'); error.maxRaise = max; error.maxBet = getGameBetLimit(session.guild_id, 'poker'); throw error; }
      const paid = pay(player, toCall + raise); spendCoins({ guildId: session.guild_id, userId: player.id, amount: paid, reason: `poker:${state.variant}:raise` });
      state.currentBet = Math.max(state.currentBet, player.streetBet); state.raises += 1;
      state.pending = actionablePlayers(state).filter(item => item.id !== player.id).map(item => item.id);
      if (player.committed >= getGameBetLimit(session.guild_id, 'poker')) player.allIn = true;
      state.log.push(`⬆️ <@${player.id}> tố lên ${formatCoins(state.currentBet)} xu.`);
    } else throw new Error('INVALID_ACTION');
  }
  if (activePlayers(state).length === 1) return settle(session, state, 'everyone-folded');
  if (!state.pending.length) return advance(session, state);
  nextPending(state, actor); saveState(session, state); return state;
}

function playerAction(sessionId, userId, action, amount = 0) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session) throw new Error('TABLE_CLOSED');
    const state = parseState(session); if (state.phase !== 'betting') throw new Error('INVALID_PHASE');
    return advanceAction(session, state, String(userId), action, amount);
  })();
}
function discardCard(sessionId, userId, index) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session) throw new Error('TABLE_CLOSED');
    const state = parseState(session); const user = String(userId);
    if (state.phase !== 'discard' || !state.discardPending.includes(user) || ![0, 1, 2].includes(index)) throw new Error('INVALID_PHASE');
    const player = playerById(state, user); if (!player || player.hole.length !== 3) throw new Error('INVALID_PHASE');
    const removed = player.hole.splice(index, 1)[0]; state.discardPending = state.discardPending.filter(id => id !== user);
    state.log.push(`🍍 <@${user}> đã bỏ một lá tẩy.`);
    if (state.discardPending.length) state.turnUserId = state.discardPending[0];
    else {
      state.phase = 'betting'; state.street = 'turn'; state.board.push(draw(state)); resetStreet(state);
      state.pending = actionablePlayers(state).map(item => item.id); state.log.push('🃏 Mở Turn — vòng cược mới.');
      if (state.pending.length <= 1) return runout(session, state);
      nextPending(state);
    }
    void removed; saveState(session, state); return state;
  })();
}

function cardsText(cards) { return cards.map(card => `\`${card}\``).join(' '); }
function privateHandText(state, userId) {
  const player = playerById(state, userId); if (!player) return 'Bạn chưa ngồi vào bàn Poker này.';
  const hand = state.board.length >= 3 ? bestHand(player.hole, state.board, state.variant) : null;
  return `## 🃏 BÀI TẨY CỦA BẠN\n### ${cardsText(player.hole)}\n${player.folded ? 'Bạn đã bỏ bài.' : hand ? `**Bài mạnh nhất hiện tại:** ${hand.name} · ${describeHand(hand)}` : 'Bài chung chưa đủ để đánh giá.'}${state.phase === 'complete' ? `\n**Kết quả:** ${state.result.players.find(row => row.userId === player.id)?.outcome || '—'}` : ''}`;
}
function pokerTableEmbed(state) {
  const complete = state.phase === 'complete'; const pot = state.players.reduce((sum, player) => sum + player.committed, 0);
  const board = state.board.length ? state.board.map(card => `**${card}**`).join('　') : 'Đang chờ bắt đầu ván';
  const embed = new EmbedBuilder().setColor(complete ? 0x2ECC71 : 0x8E44AD).setTitle(`♠️ POKER · ${VARIANTS[state.variant].name.toUpperCase()} · ĐẤU ĐÔI`)
    .setDescription(`## 🃏 BÀI CHUNG\n### ${board}${state.phase === 'betting' || state.phase === 'discard' ? `　${'**??**　'.repeat(5 - state.board.length)}` : ''}\n\n## 💰 POT: ${formatCoins(pot)} XU`)
    .addFields({ name: state.phase === 'lobby' ? '🪑 NGƯỜI CHƠI' : '🎴 STACK VÀ CƯỢC', value: state.players.map(player => `${player.folded ? '🏳️' : player.allIn ? '🔥' : '🎴'} <@${player.id}>\nCòn **${formatCoins(player.stack)} xu** · Đã cược **${formatCoins(player.committed)} xu**`).join('\n\n') });
  if (state.phase === 'lobby') embed.addFields({ name: '📨 BÀN ĐANG CHỜ', value: `Cược vào bàn **${formatCoins(state.ante)} xu/người**. Cần ${MAX_PLAYERS - state.players.length} người nữa. Chủ bàn bấm **Bắt đầu ván** khi đủ người. Hết hạn sau <t:${Math.floor((Date.now() + TURN_TTL_MS) / 1000)}:R>.` });
  else if (state.phase === 'betting' || state.phase === 'discard') embed.addFields(
    { name: state.phase === 'discard' ? '🍍 CHỌN LÁ BỎ' : `🎯 LƯỢT ${state.street.toUpperCase()} · ĐANG TỚI LƯỢT`, value: state.phase === 'discard' ? `Mỗi người chọn một lá bằng nút **Bỏ lá 1/2/3**. Bài tẩy được giữ riêng.` : `<@${state.turnUserId}> · Cần theo **${formatCoins(Math.max(0, state.currentBet - (playerById(state, state.turnUserId)?.streetBet || 0)))} xu**\nBấm **Xem bài riêng** để xem bài tẩy.`, inline: false },
    { name: '📜 DIỄN BIẾN', value: state.log.slice(-5).map(line => `• ${line}`).join('\n') || '—' },
  );
  else if (complete) {
    const pots = state.result.pots.map((item, index) => `**${index ? `Side Pot ${index}` : 'Main Pot'} ${formatCoins(item.amount)}:** ${item.winners.map(id => `<@${id}>`).join(', ')}`).join('\n') || 'Không có pot tranh chấp.';
    const outcomes = state.result.players.map(row => `<@${row.userId}> ${row.outcome === 'win' ? 'thắng' : row.outcome === 'draw' ? 'hòa' : 'thua'} · nhận **${formatCoins(row.payout)} xu** · số dư **${formatCoins(row.balance)} xu**${row.insurance ? ` · bảo hiểm ${row.insurancePercent}%` : ''}`).join('\n');
    if (state.result.reason === 'showdown') {
      const reveals = state.players.map(player => { const score = state.result.scores[player.id]; return player.folded ? `🏳️ <@${player.id}>: Đã bỏ bài (bài tẩy được giữ kín)` : `🃏 <@${player.id}>: ${cardsText(player.hole)}${score ? ` — **${score.name}**` : ''}`; }).join('\n');
      embed.addFields({ name: 'LẬT BÀI', value: reveals });
    } else if (state.result.reason === 'expired') embed.addFields({ name: '⌛ BÀN ĐÃ HẾT HẠN', value: 'Ván bị hủy và tiền đã cược được hoàn lại.' });
    else embed.addFields({ name: '🏳️ VÁN KẾT THÚC', value: 'Tất cả người chơi còn lại đã bỏ bài; bài tẩy được giữ kín.' });
    embed.addFields({ name: 'CHIA POT', value: pots }, { name: 'KẾT QUẢ', value: outcomes });
  }
  return embed.setFooter({ text: `${state.phase === 'lobby' ? 'Tiền cược được trừ khi ngồi vào bàn' : 'Bài tẩy chỉ bạn xem được bằng nút riêng'} · Hết hạn sau 3 phút không thao tác, tiền cược được hoàn` });
}
function pokerTableRows(session, state) {
  if (state.phase === 'complete') return [];
  if (state.phase === 'lobby') return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`poker:${session.id}:join`).setLabel('Tham gia bàn').setEmoji('🪑').setStyle(ButtonStyle.Success).setDisabled(state.players.length >= MAX_PLAYERS),
    new ButtonBuilder().setCustomId(`poker:${session.id}:start`).setLabel('Bắt đầu ván').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(state.players.length < MAX_PLAYERS),
  )];
  if (state.phase === 'discard') return state.players.some(player => player.id === session.user_id)
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`poker:${session.id}:view`).setLabel('Xem bài riêng').setEmoji('👁️').setStyle(ButtonStyle.Secondary), ...[0, 1, 2].map(index => new ButtonBuilder().setCustomId(`poker:${session.id}:discard:${index}`).setLabel(`Bỏ lá ${index + 1}`).setStyle(ButtonStyle.Primary)))]
    : [];
  const player = playerById(state, state.turnUserId); const canRaise = player && maxRaiseAmount(state, player, session.guild_id) >= 10;
  const call = player ? Math.max(0, state.currentBet - player.streetBet) : 0; const available = player ? availableBet(state, player, session.guild_id) : 0;
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`poker:${session.id}:view`).setLabel('Xem bài riêng').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`poker:${session.id}:raise`).setLabel('Tố').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(!canRaise),
    new ButtonBuilder().setCustomId(`poker:${session.id}:call`).setLabel(call > available ? `All-in ${formatCoins(available)}` : call ? `Theo ${formatCoins(call)}` : 'Check').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!player),
    new ButtonBuilder().setCustomId(`poker:${session.id}:fold`).setLabel('Bỏ bài').setEmoji('🏳️').setStyle(ButtonStyle.Danger).setDisabled(!player),
  )];
}
function setPokerMessage(id, messageId) { db.prepare('UPDATE poker_sessions SET message_id=?,updated_at=? WHERE id=?').run(String(messageId), Date.now(), String(id)); }

async function handlePokerButton(interaction) {
  const [, id, action, rawIndex] = interaction.customId.split(':'); const session = getSession(id);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Bàn Poker này không còn tồn tại.', flags: MessageFlags.Ephemeral });
  if (session.expires_at <= Date.now()) {
    const expiredState = await expirePokerTable(session, null, false);
    return interaction.update({ embeds: [pokerTableEmbed(expiredState)], components: [], allowedMentions: { parse: [] } });
  }
  let state = parseState(session);
  if (action === 'view') return interaction.reply({ content: privateHandText(state, interaction.user.id), flags: MessageFlags.Ephemeral });
  try {
    if (action === 'join') state = joinPokerTable(id, interaction.user.id, interaction.user.username);
    else if (action === 'start') state = startPokerHand(id, interaction.user.id);
    else if (action === 'raise') {
      const player = playerById(state, interaction.user.id);
      if (!player || !userCanAct(session, state, interaction.user.id)) throw new Error('NOT_YOUR_TURN');
      const max = maxRaiseAmount(state, player, session.guild_id);
      if (max < 10) throw new Error('CANNOT_RAISE');
      const modal = new ModalBuilder().setCustomId(`poker-modal:${id}:raise`).setTitle('Tố thêm xu').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`Số xu tố thêm (10–${max})`).setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    } else if (action === 'discard') state = discardCard(id, interaction.user.id, Number(rawIndex));
    else state = playerAction(id, interaction.user.id, action);
    const latestSession = getSession(id) || session;
    return interaction.update({ embeds: [pokerTableEmbed(state)], components: latestSession ? pokerTableRows(latestSession, state) : [], allowedMentions: { parse: [] } });
  } catch (error) {
    const messages = { TABLE_CLOSED: 'Bàn đã bắt đầu hoặc đã kết thúc.', ALREADY_SEATED: 'Bạn đã ngồi ở bàn này.', TABLE_FULL: 'Bàn đã đủ người.', ACTIVE_SESSION: 'Bạn đang có một ván Poker chưa kết thúc.', NOT_HOST: 'Chỉ người tạo bàn mới có thể bắt đầu.', NEED_OPPONENT: 'Cần đủ 2 người mới bắt đầu được.', NOT_YOUR_TURN: 'Chưa tới lượt bạn.', CANNOT_RAISE: 'Bạn không thể tố thêm lúc này.', INSUFFICIENT_FUNDS: `Bạn không đủ xu để vào bàn. Số dư: ${formatCoins(error.balance)} xu.`, INVALID_RAISE: 'Mức tố tối thiểu là 10 xu.', INVALID_PHASE: 'Lựa chọn này không còn hợp lệ.' };
    return interaction.reply({ content: messages[error.message] || 'Không thể thực hiện hành động này.', flags: MessageFlags.Ephemeral });
  }
}

async function handlePokerModal(interaction) {
  const [, id] = interaction.customId.split(':'); const text = interaction.fields.getTextInputValue('amount').trim();
  if (!/^\d+$/.test(text)) return interaction.reply({ content: 'Số xu tố không hợp lệ.', flags: MessageFlags.Ephemeral });
  const session = getSession(id);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Bàn Poker này không còn tồn tại.', flags: MessageFlags.Ephemeral });
  if (session.expires_at <= Date.now()) { await expirePokerTable(session, null, false); return interaction.reply({ content: 'Bàn đã hết thời gian. Tiền cược được hoàn lại.', flags: MessageFlags.Ephemeral }); }
  try {
    const state = playerAction(id, interaction.user.id, 'raise', Number(text)); const session = getSession(id);
    return interaction.update({ embeds: [pokerTableEmbed(state)], components: session ? pokerTableRows(session, state) : [], allowedMentions: { parse: [] } });
  } catch (error) {
    return interaction.reply({ content: error.message === 'NOT_YOUR_TURN' ? 'Hết lượt của bạn.' : error.message === 'BET_LIMIT' ? `Bạn chỉ có thể tố thêm tối đa ${formatCoins(error.maxRaise)} xu trong giới hạn ${formatCoins(error.maxBet)} xu/ván.` : error.message === 'INVALID_RAISE' ? 'Mức tố tối thiểu là 10 xu.' : 'Không thể tố lúc này.', flags: MessageFlags.Ephemeral });
  }
}

async function expirePokerTable(session, client, updateMessage = true) {
  const state = parseState(session);
  const results = [];
  for (const player of state.players) {
    const refund = player.committed + (player.lobbyAnte || 0);
    if (refund > 0) {
      const account = creditCoins({ guildId: session.guild_id, userId: player.id, amount: refund, reason: `poker:refund:${session.id}`, operationId: `refund:poker:${session.id}:${player.id}` });
      results.push({ userId: player.id, outcome: 'draw', payout: refund, balance: account.balance });
    } else results.push({ userId: player.id, outcome: 'draw', payout: 0, balance: getAccount(session.guild_id, player.id).balance });
  }
  state.phase = 'complete'; state.turnUserId = null; state.result = { reason: 'expired', players: results, pots: [], scores: {} };
  state.log.push('⌛ Bàn hết thời gian. Tiền đã cược được hoàn lại cho người chơi.');
  db.prepare('DELETE FROM poker_sessions WHERE id=?').run(session.id);
  if (updateMessage && client && session.message_id) {
    const channel = await client.channels.fetch(session.channel_id).catch(() => null); const message = await channel?.messages?.fetch(session.message_id).catch(() => null);
    if (message) await message.edit({ embeds: [pokerTableEmbed(state)], components: [], allowedMentions: { parse: [] } });
  }
}

module.exports = { VARIANTS, createPokerLobby, hasActiveTable, setPokerMessage, pokerTableEmbed, pokerTableRows, handlePokerButton, handlePokerModal, expirePokerTable };
