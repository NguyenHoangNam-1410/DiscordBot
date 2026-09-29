const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../db');
const { getAccount, spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { formatCoins } = require('../utils/economy');
const { createDeck, cardRank, bestHand, describeHand, awardPots } = require('./pokerEngine');
const { createFairness, fairInt } = require('./fairnessService');
const { getGameConfig } = require('./gameConfigService');
const { addExperienceField } = require('../utils/progressionView');
const { consumeActiveEffect, getActiveEffect } = require('./effectStateService');
const pokerMultiplayerService = require('./pokerMultiplayerService');

const configuredAnte = Number(process.env.POKER_ANTE);
const POKER_ANTE = Number.isSafeInteger(configuredAnte) && configuredAnte >= 10 && configuredAnte <= 100_000 ? configuredAnte : 50;
const SESSION_TTL_MS = 10 * 60_000;
const VARIANTS = Object.freeze({
  texas: { name: 'Texas Hold’em', holes: 2, description: '2 lá tẩy · bộ bài 52 lá' },
  sixplus: { name: 'Poker 6+', holes: 2, description: '36 lá từ 6–A · Thùng mạnh hơn Cù lũ' },
  pineapple: { name: 'Crazy Pineapple', holes: 3, description: '3 lá tẩy · bỏ 1 lá sau vòng cược Flop' },
  omaha: { name: 'Omaha 5 lá', holes: 5, description: 'Bắt buộc dùng đúng 2 lá tẩy + 3 lá chung' },
});
const BOT_NAMES = Object.freeze([
  'Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Quang Huy', 'Phạm Ngọc Hà',
  'Hoàng Đức Minh', 'Huỳnh Gia Hân', 'Phan Thanh Tùng', 'Vũ Thảo Linh',
  'Võ Nhật Nam', 'Đặng Thu Trang', 'Bùi Hải Đăng', 'Đỗ Khánh Vy',
  'Hồ Tuấn Kiệt', 'Ngô Phương Anh', 'Dương Việt Hoàng', 'Lý Bảo Ngọc',
  'Nguyễn Thành Đạt', 'Trần Minh Châu', 'Lê Anh Khoa', 'Phạm Mai Phương',
  'Hoàng Nhật Huy', 'Huỳnh Thùy Dương', 'Phan Đức Long', 'Vũ Ngọc Mai',
  'Võ Gia Bảo', 'Đặng Minh Thư', 'Bùi Quốc Khánh', 'Đỗ Thanh Hằng',
  'Hồ Minh Quân', 'Ngô Diệu Linh', 'Dương Hoài Nam', 'Lý Khánh An',
]);
function pickBotNames() {
  const first = crypto.randomInt(BOT_NAMES.length);
  const second = crypto.randomInt(BOT_NAMES.length - 1);
  return [BOT_NAMES[first], BOT_NAMES[second >= first ? second + 1 : second]];
}

function getSession(id) { return db.prepare('SELECT * FROM poker_sessions WHERE id = ?').get(String(id)) || null; }
function getActiveSession(id, guildId) { return db.prepare('SELECT * FROM poker_sessions WHERE id=? AND guild_id=?').get(String(id), String(guildId)) || null; }
function getUserSession(guildId, userId) { return db.prepare('SELECT * FROM poker_sessions WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId)) || null; }
function parseState(session) {
  const state = JSON.parse(session.state_json);
  if (state.mode !== 'multiplayer') for (const bot of state.players?.slice(1) || []) bot.revealedCard ||= bot.hole?.[0];
  return state;
}
function saveState(session, state) { const now = Date.now(); db.prepare('UPDATE poker_sessions SET state_json=?,expires_at=?,updated_at=? WHERE id=?').run(JSON.stringify(state), now + SESSION_TTL_MS, now, session.id); }
function setPokerMessage(id, messageId) { db.prepare('UPDATE poker_sessions SET message_id=?,updated_at=? WHERE id=?').run(String(messageId), Date.now(), String(id)); }
function draw(state) { return state.deck.pop(); }
function pay(player, amount) { const paid = Math.min(player.stack, Math.max(0, amount)); player.stack -= paid; player.streetBet += paid; player.committed += paid; if (player.stack === 0) player.allIn = true; return paid; }
function activePlayers(state) { return state.players.filter(player => !player.folded); }
function resetStreet(state) { state.currentBet = 0; state.raises = 0; for (const player of state.players) player.streetBet = 0; }
function availableBet(state, guildId) {
  const human = state.players[0];
  const maxBet = guildId ? getGameBetLimit(guildId, 'poker') : state.startingStack;
  return Math.max(0, Math.min(human.stack, maxBet - human.committed));
}
function maxRaiseAmount(state, guildId) {
  const human = state.players[0];
  if (state.phase !== 'betting' || human.allIn || human.folded) return 0;
  const toCall = Math.max(0, state.currentBet - human.streetBet);
  return Math.max(0, availableBet(state, guildId) - toCall);
}

function startPoker({ guildId, channelId, userId, variant, forcedDeck = null }) {
  if (!VARIANTS[variant]) throw new Error('INVALID_VARIANT');
  if (getUserSession(guildId, userId) || pokerMultiplayerService.hasActiveTable(guildId, userId)) throw new Error('ACTIVE_SESSION');
  return db.transaction(() => {
    const maxBet = getGameBetLimit(guildId, 'poker');
    const ante = Math.min(getGameConfig(guildId, 'POKER_ANTE'), maxBet);
    const account = getAccount(guildId, userId);
    if (account.balance < ante) {
      const error = new Error('INSUFFICIENT_FUNDS'); error.code = 'INSUFFICIENT_FUNDS'; error.balance = account.balance; throw error;
    }
    const tableStack = Math.min(account.balance, maxBet);
    spendCoins({ guildId, userId, amount: ante, reason: `poker:${variant}:ante` });
    const fair = createFairness();
    const deck = forcedDeck ? [...forcedDeck] : createDeck(variant === 'sixplus', fair.serverSeed);
    const [firstBotName, secondBotName] = pickBotNames();
    const players = [
      { id: String(userId), name: 'Bạn', stack: tableStack, committed: 0, streetBet: 0, folded: false, allIn: false, hole: [] },
      { id: 'bot_luna', name: firstBotName, stack: Math.max(ante, Math.round(tableStack * 0.75)), committed: 0, streetBet: 0, folded: false, allIn: false, hole: [] },
      { id: 'bot_sol', name: secondBotName, stack: Math.max(ante, Math.round(tableStack * 1.25)), committed: 0, streetBet: 0, folded: false, allIn: false, hole: [] },
    ];
    for (let card = 0; card < VARIANTS[variant].holes; card += 1) for (const player of players) player.hole.push(deck.pop());
    for (const bot of players.slice(1)) bot.revealedCard = bot.hole[0];
    for (const player of players) pay(player, ante);
    const state = { variant, ante, startingStack: tableStack, deck, board: [deck.pop(), deck.pop(), deck.pop()], players, street: 'flop', phase: 'betting', currentBet: 0, raises: 0, log: [`💰 Ante ${formatCoins(ante)} xu/người`, '🃏 Flop đã mở — vòng cược đầu tiên bắt đầu.'], result: null, fair, fairCounter: 0,
      pokerInsurance: consumeActiveEffect(guildId, userId, 'poker_insurance'), foldCoupon: Boolean(getActiveEffect(guildId, userId, 'poker_fold_coupon')) };
    for (const player of players) player.streetBet = 0;
    const now = Date.now(); const session = { id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), channel_id: String(channelId), message_id: null, user_id: String(userId), variant, state_json: JSON.stringify(state), expires_at: now + SESSION_TTL_MS, created_at: now, updated_at: now };
    db.prepare('INSERT INTO poker_sessions(id,guild_id,channel_id,message_id,user_id,variant,state_json,expires_at,created_at,updated_at) VALUES(@id,@guild_id,@channel_id,@message_id,@user_id,@variant,@state_json,@expires_at,@created_at,@updated_at)').run(session);
    return { session, state: noFurtherBetting(state) ? showdownWithoutBetting(session, state) : state };
  })();
}

const BOT_PROFILES = Object.freeze({
  bot_luna: { aggression: 0.18, courage: 0.92 },
  bot_sol: { aggression: 0.30, courage: 1.08 },
});
const RANK_VALUE = Object.freeze({ 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 });
function drawPotential(state, player) {
  const cards = [...player.hole, ...state.board];
  const suitCounts = cards.reduce((counts, card) => { const suit = card.slice(-1); counts[suit] = (counts[suit] || 0) + 1; return counts; }, {});
  const flushDraw = Object.values(suitCounts).some(count => count >= 4);
  const values = new Set(cards.map(card => RANK_VALUE[cardRank(card)]));
  const windows = state.variant === 'sixplus'
    ? [[14, 9, 8, 7, 6], [6, 7, 8, 9, 10], [7, 8, 9, 10, 11], [8, 9, 10, 11, 12], [9, 10, 11, 12, 13], [10, 11, 12, 13, 14]]
    : [[14, 2, 3, 4, 5], ...Array.from({ length: 9 }, (_, index) => Array.from({ length: 5 }, (__, offset) => index + offset + 2))];
  const straightDraw = windows.some(window => window.filter(value => values.has(value)).length >= 4);
  return (flushDraw ? 0.55 : 0) + (straightDraw ? 0.45 : 0);
}
function botEvaluation(state, player) {
  const score = bestHand(player.hole, state.board, state.variant);
  const categoryPower = [0.12, 0.30, 0.48, 0.64, 0.74, 0.78, 0.88, 0.96, 1][score?.category || 0];
  const kicker = (score?.kickers?.[0] || 2) / 14;
  const streetConfidence = state.board.length === 3 ? 0.82 : state.board.length === 4 ? 0.92 : 1;
  return { score, draw: drawPotential(state, player), power: Math.min(1, (categoryPower + kicker * 0.08) * streetConfidence) };
}
function choosePineappleDiscard(state, player) {
  let bestIndex = 0; let bestValue = -Infinity;
  for (let index = 0; index < player.hole.length; index += 1) {
    if (player.hole[index] === player.revealedCard) continue;
    const candidate = { ...player, hole: player.hole.filter((_, cardIndex) => cardIndex !== index) };
    const evaluation = botEvaluation(state, candidate);
    const kickerValue = (evaluation.score?.kickers || []).reduce((sum, value, kickerIndex) => sum + value / (15 ** kickerIndex), 0);
    const value = (evaluation.score?.category || 0) * 100 + kickerValue + evaluation.draw * 12;
    if (value > bestValue) { bestValue = value; bestIndex = index; }
  }
  return bestIndex;
}
function actBots(state) {
  let raised = false;
  for (const bot of state.players.filter(player => player.id.startsWith('bot_') && !player.folded && !player.allIn)) {
    const toCall = Math.max(0, state.currentBet - bot.streetBet);
    const pot = state.players.reduce((sum, player) => sum + player.committed, 0);
    const potOdds = toCall / Math.max(1, pot + toCall);
    const pressure = toCall / Math.max(1, bot.stack + toCall);
    const profile = BOT_PROFILES[bot.id];
    const evaluation = botEvaluation(state, bot);
    const roll = state.fair?.serverSeed ? fairInt(state.fair.serverSeed, 'poker-bot', state.fairCounter++, 10_000) / 10_000 : crypto.randomInt(10_000) / 10_000;
    const continueScore = (evaluation.power + evaluation.draw * 0.16 + roll * 0.12) * profile.courage;
    const pricedOut = potOdds > continueScore * 0.72;
    const stackThreatened = pressure > 0.55 && evaluation.power < 0.55;
    const activeBots = activePlayers(state).filter(player => player.id.startsWith('bot_')).length;
    const defendsOpeningRaise = state.raises === 1 && pressure <= 0.25;
    const defendsTable = activeBots === 1 && pressure <= 0.50;
    if (toCall > 0 && (pricedOut || stackThreatened) && !defendsOpeningRaise && !defendsTable && roll > 0.10) {
      bot.folded = true; state.log.push(`🏳️ ${bot.name} bỏ bài trước mức cược ${formatCoins(toCall)} xu.`); continue;
    }
    const called = pay(bot, toCall);
    const raiseChance = profile.aggression + Math.max(0, evaluation.power - 0.48) * 0.8 + evaluation.draw * 0.08;
    const mayBluff = evaluation.power < 0.42 && roll < profile.aggression * 0.18;
    if (!raised && state.raises < 2 && bot.stack > 0 && (roll < raiseChance || mayBluff)) {
      const target = Math.max(state.ante, Math.floor(Math.max(pot, state.ante * 2) * (0.35 + profile.aggression)));
      const raise = Math.min(bot.stack, target); pay(bot, raise); state.currentBet = bot.streetBet; state.raises += 1; raised = true;
      state.log.push(`⬆️ ${bot.name} ${bot.allIn ? 'All-in' : `tố lên ${formatCoins(state.currentBet)} xu`}.`);
    } else state.log.push(`${bot.allIn ? '🔥' : '✅'} ${bot.name} ${bot.allIn ? 'All-in' : called ? `theo ${formatCoins(called)} xu` : 'check'}.`);
  }
  if (raised) for (const bot of state.players.filter(player => player.id.startsWith('bot_') && !player.folded && !player.allIn && player.streetBet < state.currentBet)) {
    const matched = pay(bot, state.currentBet - bot.streetBet); state.log.push(`✅ ${bot.name} theo thêm ${formatCoins(matched)} xu.`);
  }
  return raised;
}
function allMatched(state) { return activePlayers(state).every(player => player.allIn || player.streetBet === state.currentBet); }
function noFurtherBetting(state) { return state.players[0].allIn || activePlayers(state).filter(player => !player.allIn).length <= 1; }
function showdownWithoutBetting(session, state) {
  if (state.variant === 'pineapple' && state.street === 'flop') {
    for (const player of activePlayers(state)) {
      if (player.hole.length === 3) player.hole.splice(choosePineappleDiscard(state, player), 1);
    }
    state.log.push('🍍 Bài bỏ được chọn tự động trước Showdown.');
  }
  state.log.push('🔥 Không còn lượt cược — mở bài và Showdown.');
  return settle(session, state);
}

function settle(session, state, reason = 'showdown') {
  while (state.board.length < 5 && activePlayers(state).length > 1) state.board.push(draw(state));
  const scores = {}; for (const player of activePlayers(state)) scores[player.id] = bestHand(player.hole, state.board, state.variant);
  const awarded = awardPots(state.players, scores); for (const player of state.players) player.stack += awarded.awards[player.id] || 0;
  const human = state.players[0]; let payout = awarded.awards[human.id] || 0;
  let insurance = 0; let insurancePercent = 0;
  if (state.pokerInsurance && reason === 'showdown' && payout === 0) {
    insurancePercent = state.fair?.serverSeed ? fairInt(state.fair.serverSeed, 'poker-insurance', 0, 26) + 25 : crypto.randomInt(25, 51);
    insurance = Math.max(1, Math.floor(human.committed * insurancePercent / 100)); payout += insurance;
  }
  let foldRefund = 0;
  if (reason === 'fold' && state.foldCoupon && state.street === 'flop' && human.committed === state.ante && payout === 0
    && consumeActiveEffect(session.guild_id, session.user_id, 'poker_fold_coupon')) {
    foldRefund = Math.floor(state.ante * 0.5); payout += foldRefund;
  }
  const outcome = payout > human.committed ? 'win' : payout === human.committed ? 'draw' : 'loss';
  const account = settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout, stake: human.committed, game: 'poker', outcome,
    operationId: `settle:poker:${session.id}` });
  state.phase = 'complete'; state.result = { reason, scores, pots: awarded.pots, refunds: awarded.refunds, payout, outcome, insurance, insurancePercent, foldRefund, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
  db.prepare('DELETE FROM poker_sessions WHERE id=?').run(session.id); return state;
}
function forceEndPokerSession(id, guildId, adminId, { forfeit = false, forfeitUserId = null } = {}) {
  return db.transaction(() => {
    const current = getActiveSession(id, guildId); if (!current) return null;
    const state = parseState(current);
    if (state.mode === 'multiplayer') return pokerMultiplayerService.forceEndPokerTable(current, adminId, { forfeitUserId });
    const human = state.players[0];
    // human.stack is table chips: only what was committed (ante, calls, raises) was actually deducted from the wallet.
    const refund = human.committed;
    if (!forfeit) creditCoins({ guildId: current.guild_id, userId: human.id, amount: refund,
      reason: `poker:admin-refund:${adminId}:${current.id}`, operationId: `refund:poker-admin:${current.id}:${human.id}` });
    state.phase = 'complete'; state.turnUserId = null;
    state.result = { reason: 'admin-ended', scores: {}, pots: [], refunds: {}, payout: refund, outcome: 'draw', insurance: 0, insurancePercent: 0 };
    state.log.push(`🛑 Quản trị viên kết thúc ván ${current.id}; tiền đã khóa được hoàn lại.`);
    db.prepare('DELETE FROM poker_sessions WHERE id=?').run(current.id);
    return { session: current, state, participants: [human.id] };
  })();
}
function advance(session, state) {
  if (activePlayers(state).length === 1) return settle(session, state, 'everyone-folded');
  if (noFurtherBetting(state)) return showdownWithoutBetting(session, state);
  if (state.variant === 'pineapple' && state.street === 'flop' && state.players[0].hole.length === 3) { state.phase = 'discard'; state.log.push('🍍 Chọn 1 trong 3 lá tẩy để bỏ trước Turn.'); saveState(session, state); return state; }
  if (state.street === 'river') return settle(session, state);
  state.street = state.street === 'flop' ? 'turn' : 'river'; state.board.push(draw(state)); resetStreet(state); state.log.push(`🃏 Mở ${state.street === 'turn' ? 'Turn' : 'River'} — vòng cược mới.`);
  saveState(session, state); return state;
}
function playerAction(sessionId, userId, action, amount = 0) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
    const state = parseState(session); if (state.phase !== 'betting') throw new Error('INVALID_PHASE'); const human = state.players[0];
    if (action === 'fold') { human.folded = true; state.log.push('🏳️ Bạn bỏ bài.'); return settle(session, state, 'fold'); }
    const toCall = Math.max(0, state.currentBet - human.streetBet);
    if (action === 'call') { const paid = pay(human, Math.min(toCall, availableBet(state, session.guild_id))); if (paid < toCall || human.committed >= getGameBetLimit(session.guild_id, 'poker')) human.allIn = true; if (paid) spendCoins({ guildId: session.guild_id, userId, amount: paid, reason: `poker:${state.variant}:call` }); state.log.push(`${human.allIn && toCall ? '🔥 Bạn All-in để theo.' : toCall ? `✅ Bạn theo ${formatCoins(paid)} xu.` : '✅ Bạn check.'}`); }
    else if (action === 'raise') {
      const raise = Number(amount); if (!Number.isSafeInteger(raise) || raise < 10) throw new Error('INVALID_RAISE');
      const maxRaise = maxRaiseAmount(state, session.guild_id);
      if (raise > maxRaise) { const error = new Error('BET_LIMIT'); error.maxRaise = maxRaise; error.maxBet = getGameBetLimit(session.guild_id, 'poker'); throw error; }
      const paid = pay(human, toCall + raise);
      spendCoins({ guildId: session.guild_id, userId, amount: paid, reason: `poker:${state.variant}:raise` }); state.currentBet = Math.max(state.currentBet, human.streetBet); state.raises += 1; state.log.push(`⬆️ Bạn tố lên ${formatCoins(state.currentBet)} xu.`);
      if (human.committed >= getGameBetLimit(session.guild_id, 'poker')) human.allIn = true;
    } else throw new Error('INVALID_ACTION');
    const botRaised = actBots(state);
    if (allMatched(state) && (!botRaised || noFurtherBetting(state))) return advance(session, state);
    saveState(session, state); return state;
  })();
}
function discardCard(sessionId, userId, index) {
  return db.transaction(() => {
    const session = getSession(sessionId); if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION'); const state = parseState(session);
    if (state.phase !== 'discard' || ![0, 1, 2].includes(index)) throw new Error('INVALID_PHASE');
    const removed = state.players[0].hole.splice(index, 1)[0];
    for (const bot of state.players.slice(1)) if (!bot.folded && bot.hole.length === 3) bot.hole.splice(choosePineappleDiscard(state, bot), 1);
    if (noFurtherBetting(state)) { state.log.push(`🍍 Bạn bỏ ${removed}.`); return showdownWithoutBetting(session, state); }
    state.phase = 'betting'; state.street = 'turn'; state.board.push(draw(state)); resetStreet(state); state.log.push(`🍍 Bạn bỏ ${removed}.`, '🃏 Mở Turn — vòng cược mới.'); saveState(session, state); return state;
  })();
}
function cardText(cards) { return cards.map(card => `\`${card}\``).join(' '); }
function largeCardText(cards) { return cards.map(card => `**${card}**`).join('　'); }
function playerEval(state) {
  const human = state.players[0];
  if (human.folded) return 'Đã bỏ bài';
  const score = bestHand(human.hole, state.board, state.variant);
  return `${score?.name || 'Chưa xác định'} · ${describeHand(score)}`;
}
function pokerEmbed(state, userId, sessionId = null) {
  const pot = state.players.reduce((sum, player) => sum + player.committed, 0); const human = state.players[0]; const complete = state.phase === 'complete';
  const exposedBots = state.players.slice(1).map(bot => {
    const hidden = Math.max(0, bot.hole.length - 1);
    return `### 🤖 ${bot.name}: **${bot.revealedCard || bot.hole[0]}**${hidden ? `　${'**??**　'.repeat(hidden)}` : ''}`;
  }).join('\n');
  const embed = new EmbedBuilder().setColor(complete ? (state.result.outcome === 'win' ? 0x2ECC71 : state.result.outcome === 'draw' ? 0xF1C40F : 0xE74C3C) : 0x8E44AD)
    .setTitle(`♠️ POKER · ${VARIANTS[state.variant].name.toUpperCase()}`)
    .setDescription(`## 🃏 BÀI CHUNG\n### ${largeCardText(state.board)}${state.board.length < 5 ? `　${'**??**　'.repeat(5 - state.board.length)}` : ''}\n\n## 👤 BÀI CỦA <@${userId}>\n### ${largeCardText(human.hole)}\n**Set mạnh nhất hiện tại:** ${playerEval(state)}\n\n## 🤖 BÀI CỦA BOT\n${exposedBots}\n\n## 💰 POT: ${formatCoins(pot)} XU`)
    .addFields({ name: '🎴 STACK VÀ TIỀN ĐÃ CƯỢC', value: state.players.map(player => `${player.folded ? '🏳️' : player.allIn ? '🔥' : '🎴'} **${player.name}**\nCòn **${formatCoins(player.stack)}** · Đã cược **${formatCoins(player.committed)} xu**`).join('\n\n') });
  if (!complete) embed.addFields({ name: `🎯 LƯỢT ${state.street.toUpperCase()} · CẦN THEO ${formatCoins(Math.max(0, state.currentBet - human.streetBet))} XU`, value: state.log.slice(-4).map(line => `• ${line}`).join('\n') });
  else {
    const reveals = state.players.map(player => { const score = state.result.scores[player.id]; return `${player.folded ? '🏳️' : '🃏'} **${player.name}:** ${cardText(player.hole)}${score ? ` — **${score.name}**` : ' — Đã bỏ bài'}`; }).join('\n');
    const pots = state.result.pots.map((potItem, index) => `**${index === 0 ? 'Main Pot' : `Side Pot ${index}`} ${formatCoins(potItem.amount)}:** ${potItem.winners.map(id => state.players.find(player => player.id === id)?.name).join(', ')}`).join('\n') || 'Không có pot tranh chấp.';
    embed.addFields({ name: 'Showdown', value: reveals }, { name: 'Chia Pot', value: pots }, { name: state.result.outcome === 'win' ? '🏆 Bạn thắng!' : state.result.outcome === 'draw' ? '🤝 Hòa vốn' : '💥 Bạn thua', value: `Nhận lại **${formatCoins(state.result.payout)} xu**${state.result.insurance ? `\n🛡️ Bảo hiểm Poker hoàn **${state.result.insurancePercent}% = ${formatCoins(state.result.insurance)} xu**` : ''}${state.result.foldRefund ? `\n🏳️ Phiếu Bỏ Bài hoàn **50% Ante = ${formatCoins(state.result.foldRefund)} xu**` : ''}` });
    addExperienceField(embed, state.result);
    if (state.result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: state.result.achievements.map(item => `**${item.name}**`).join('\n') });
  }
  return embed.setFooter({ text: `${sessionId && !complete ? `Mã ván: ${sessionId} • ` : ''}${VARIANTS[state.variant].description} • Main Pot và Side Pot tự động` });
}
function pokerRows(sessionId, state) {
  if (state.phase === 'complete') return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:poker:${state.variant}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  if (state.phase === 'discard') return [new ActionRowBuilder().addComponents(...state.players[0].hole.map((card, index) => new ButtonBuilder().setCustomId(`poker:${sessionId}:discard:${index}`).setLabel(`Bỏ ${card}`).setStyle(ButtonStyle.Secondary)))];
  const human = state.players[0]; const call = Math.max(0, state.currentBet - human.streetBet);
  const guildId = getSession(sessionId)?.guild_id;
  const remaining = availableBet(state, guildId);
  const canRaise = maxRaiseAmount(state, guildId) >= 10;
  const callLabel = call > remaining ? `All-in ${formatCoins(remaining)}` : call ? `Theo ${formatCoins(call)}` : 'Check';
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`poker:${sessionId}:raise`).setLabel('Tố').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(!canRaise),
    new ButtonBuilder().setCustomId(`poker:${sessionId}:call`).setLabel(callLabel).setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(human.allIn),
    new ButtonBuilder().setCustomId(`poker:${sessionId}:fold`).setLabel('Bỏ bài').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
  )];
}
async function handlePokerButton(interaction) {
  const [, sessionId] = interaction.customId.split(':'); const existingSession = getSession(sessionId);
  if (existingSession && JSON.parse(existingSession.state_json).mode === 'multiplayer') return pokerMultiplayerService.handlePokerButton(interaction);
  const [, id, action, rawIndex] = interaction.customId.split(':'); const session = getSession(id);
  if (!session || session.user_id !== interaction.user.id) return interaction.reply({ content: 'Ván Poker không tồn tại hoặc không phải của bạn.', flags: MessageFlags.Ephemeral });
  if (action === 'raise') {
    const state = parseState(session); const max = maxRaiseAmount(state, session.guild_id);
    if (max < 10) {
      await interaction.update({ embeds: [pokerEmbed(state, interaction.user.id, id)], components: pokerRows(id, state), allowedMentions: { parse: [] } });
      return interaction.followUp({ content: 'Bạn không thể tố thêm vì đã đạt giới hạn cược của server hoặc không đủ stack.', flags: MessageFlags.Ephemeral });
    }
    const modal = new ModalBuilder().setCustomId(`poker-modal:${id}:raise`).setTitle('Tố thêm xu').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`Số xu tố thêm (10–${max})`).setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }
  try { const state = action === 'discard' ? discardCard(id, interaction.user.id, Number(rawIndex)) : playerAction(id, interaction.user.id, action); return interaction.update({ embeds: [pokerEmbed(state, interaction.user.id, id)], components: pokerRows(id, state), allowedMentions: { parse: [] } }); }
  catch (error) { return interaction.reply({ content: 'Không thể thực hiện hành động này ở thời điểm hiện tại.', flags: MessageFlags.Ephemeral }); }
}
async function handlePokerModal(interaction) {
  const [, sessionId] = interaction.customId.split(':'); const existingSession = getSession(sessionId);
  if (existingSession && JSON.parse(existingSession.state_json).mode === 'multiplayer') return pokerMultiplayerService.handlePokerModal(interaction);
  const [, id] = interaction.customId.split(':'); const text = interaction.fields.getTextInputValue('amount').trim(); const amount = Number(text);
  async function reject(content) {
    const session = getSession(id);
    if (!session) {
      await interaction.update({ components: [] });
      return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
    const state = parseState(session);
    await interaction.update({ embeds: [pokerEmbed(state, interaction.user.id, id)], components: pokerRows(id, state), allowedMentions: { parse: [] } });
    return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  }
  if (!/^\d+$/.test(text)) return reject('Số xu tố không hợp lệ.');
  let state;
  try { state = playerAction(id, interaction.user.id, 'raise', amount); }
  catch (error) { return reject(error.message === 'BET_LIMIT' ? `Bạn chỉ có thể tố thêm tối đa **${formatCoins(error.maxRaise)} xu** trong giới hạn **${formatCoins(error.maxBet)} xu/ván**.` : error.message === 'INVALID_RAISE' ? 'Mức tố tối thiểu là 10 xu.' : 'Không thể tố lúc này.'); }
  return interaction.update({ embeds: [pokerEmbed(state, interaction.user.id, id)], components: pokerRows(id, state), allowedMentions: { parse: [] } });
}
async function handlePokerPrivateButton(interaction) {
  return pokerMultiplayerService.handlePokerPrivateButton(interaction);
}
async function expirePokerSessions(client, logger = console, now = Date.now()) {
  const stalled = db.prepare('SELECT id FROM poker_sessions').all();
  for (const { id } of stalled) {
    try {
      const resolved = db.transaction(() => {
        const session = getSession(id);
        if (!session) return null;
        const state = parseState(session);
        if (state.mode === 'multiplayer' || !['betting', 'discard'].includes(state.phase) || !noFurtherBetting(state)) return null;
        if (state.phase === 'betting' && !allMatched(state)) actBots(state);
        if (state.phase === 'betting' && !allMatched(state)) return null;
        return { session, state: showdownWithoutBetting(session, state) };
      })();
      if (resolved?.session.message_id) {
        const channel = await client.channels.fetch(resolved.session.channel_id).catch(() => null);
        const message = await channel?.messages?.fetch(resolved.session.message_id).catch(() => null);
        if (message) await message.edit({ embeds: [pokerEmbed(resolved.state, resolved.session.user_id, resolved.session.id)], components: pokerRows(resolved.session.id, resolved.state) });
      }
    } catch (error) { logger.error?.({ err: error, pokerSessionId: id }, 'poker all-in recovery failed'); }
  }
  const sessions = db.prepare('SELECT * FROM poker_sessions WHERE expires_at <= ?').all(now); let expired = 0;
  for (const session of sessions) {
    try {
      if (JSON.parse(session.state_json).mode === 'multiplayer') { await pokerMultiplayerService.expirePokerTable(session, client); expired += 1; continue; }
      const state = parseState(session); state.players[0].folded = true; state.log.push('⌛ Hết thời gian — tự động bỏ bài.'); settle(session, state, 'timeout'); expired += 1;
      if (session.message_id) { const channel = await client.channels.fetch(session.channel_id).catch(() => null); const message = await channel?.messages?.fetch(session.message_id).catch(() => null); if (message) await message.edit({ embeds: [pokerEmbed(state, session.user_id, session.id)], components: [] }); }
    } catch (error) { logger.error?.({ err: error, pokerSessionId: session.id }, 'poker expiry failed'); }
  }
  return expired;
}
function startPokerMaintenance(client, logger = console) { const run = () => expirePokerSessions(client, logger).catch(error => logger.error?.({ err: error }, 'poker maintenance failed')); run(); const timer = setInterval(run, 30_000); timer.unref?.(); return timer; }
module.exports = { POKER_ANTE, VARIANTS, startPoker, getSession, setPokerMessage, playerAction, discardCard, playerEval, botEvaluation, choosePineappleDiscard, maxRaiseAmount, pokerEmbed, pokerRows, handlePokerButton, handlePokerPrivateButton, handlePokerModal, expirePokerSessions, startPokerMaintenance, forceEndPokerSession };
