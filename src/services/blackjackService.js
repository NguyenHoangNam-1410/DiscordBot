const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { getAccount, spendCoins, settleReservedGame, creditCoins } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { getGameBetLimit } = require('./gameBetLimitService');
const { consumeHighestEffect, consumeActiveEffect } = require('./effectStateService');
const { createFairness, fairShuffle } = require('./fairnessService');
const { addExperienceField } = require('../utils/progressionView');

const TABLE_LOBBY_MS = 30_000;
const TABLE_PLAY_MS = 3 * 60_000;
const TABLE_GUESTS = 3;

const MIN_BET = 10;
const MAX_BET = 100_000;
const REGULAR_WIN_MULTIPLIER = 2;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

function rank(card) { return card.slice(0, -1); }

function handScore(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const value = rank(card);
    if (value === 'A') { total += 11; aces += 1; }
    else total += ['J', 'Q', 'K'].includes(value) ? 10 : Number(value);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards) { return cards.length === 2 && handScore(cards).total === 21; }
function handType(cards) {
  const score = handScore(cards).total;
  if (score > 21) return 'bust';
  if (cards.length === 5) return 'ngulinh';
  if (isBlackjack(cards)) return 'blackjack';
  return 'normal';
}

function createShoe(decks = 6, serverSeed = null) {
  const cards = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) for (const value of RANKS) cards.push(`${value}${suit}`);
  }
  if (serverSeed) return fairShuffle(cards, serverSeed, 'blackjack-shoe');
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}

function draw(state) {
  if (!state.deck.length) state.deck = createShoe();
  return state.deck.pop();
}

function totalBet(state) { return state.hands.reduce((sum, hand) => sum + hand.bet, 0); }
function getSessionByUser(guildId, userId) {
  return db.prepare('SELECT * FROM blackjack_sessions WHERE guild_id = ? AND user_id = ?').get(String(guildId), String(userId)) || null;
}
function getSession(id) { return db.prepare('SELECT * FROM blackjack_sessions WHERE id = ?').get(String(id)) || null; }
function getActiveSession(id, guildId) { return db.prepare('SELECT * FROM blackjack_sessions WHERE id=? AND guild_id=?').get(String(id), String(guildId)) || null; }
function parseState(session) { return JSON.parse(session.state_json); }

function saveState(session, state) {
  db.prepare('UPDATE blackjack_sessions SET state_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), Date.now(), session.id);
}

function setMessageId(id, messageId) {
  db.prepare('UPDATE blackjack_sessions SET message_id = ?, updated_at = ? WHERE id = ?').run(String(messageId), Date.now(), String(id));
}

function initialResult(state) {
  const playerBlackjack = isBlackjack(state.hands[0].cards);
  const dealerBlackjack = isBlackjack(state.dealer);
  if (!playerBlackjack && !dealerBlackjack) return null;
  if (playerBlackjack && dealerBlackjack) return { outcome: 'draw', payout: state.hands[0].bet, reason: 'Cả hai cùng Xì dách' };
  if (playerBlackjack) return { outcome: 'win', payout: Math.floor(state.hands[0].bet * 2.5), reason: 'Xì dách tự nhiên trả 3:2' };
  // Ngũ linh ranks above Xì dách, so a dealer natural cannot end the hand
  // before the player has had a chance to reach five cards.
  return null;
}

function putAceOnTop(deck) {
  const index = deck.findIndex(card => rank(card) === 'A');
  if (index < 0) return false;
  const [ace] = deck.splice(index, 1); deck.push(ace); return true;
}

const startTx = db.transaction(({ guildId, userId, channelId, stake, forcedDeck = null }) => {
  const maxBet = getGameBetLimit(guildId, 'blackjack');
  if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error('INVALID_BET');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (getSessionByUser(guildId, userId)) throw new Error('ACTIVE_SESSION');
  const activeDuel = db.prepare("SELECT 1 FROM blackjack_duels WHERE guild_id = ? AND status IN ('invited','playing') AND (challenger_id = ? OR opponent_id = ?) LIMIT 1")
    .get(String(guildId), String(userId), String(userId));
  if (activeDuel) throw new Error('ACTIVE_SESSION');
  const account = spendCoins({ guildId, userId, amount: stake, reason: 'blackjack:reserve' });
  const fair = createFairness();
  const handEffect = consumeHighestEffect(guildId, userId, ['blackjack_first_ace', 'blackjack_swap', 'blackjack_redraw']);
  const firstAce = handEffect?.effect_id === 'blackjack_first_ace';
  const state = { deck: forcedDeck ? [...forcedDeck] : createShoe(6, fair.serverSeed), dealer: [], hands: [{ cards: [], bet: stake, status: 'playing' }], active: 0, split: false, maxBet, fair,
    itemEffect: firstAce ? null : handEffect?.effect_id || null, itemEffectUsed: false, firstAce };
  if (firstAce) putAceOnTop(state.deck);
  state.hands[0].cards.push(draw(state)); state.dealer.push(draw(state));
  state.hands[0].cards.push(draw(state)); state.dealer.push(draw(state));
  const natural = initialResult(state);
  if (natural) {
    const settled = settleReservedGame({ guildId, userId, payout: natural.payout, stake, game: 'blackjack', outcome: natural.outcome });
    return { immediate: true, state, result: { ...natural, balance: settled.balance, stake, totalStake: stake, achievements: settled.unlockedAchievements, experienceGained: settled.experienceGained, levelUps: settled.levelUps, bonusDrops: settled.bonusDrops } };
  }
  const now = Date.now();
  const session = { id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), user_id: String(userId), channel_id: String(channelId), message_id: null, created_at: now, updated_at: now };
  db.prepare('INSERT INTO blackjack_sessions (id, guild_id, user_id, channel_id, message_id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)')
    .run(session.id, session.guild_id, session.user_id, session.channel_id, JSON.stringify(state), now, now);
  return { immediate: false, session, state, account };
});

function startBlackjack(args) { return startTx(args); }

function evaluateHand(cards, bet, dealerCards) {
  const score = handScore(cards).total; const dealer = handScore(dealerCards).total;
  const playerType = handType(cards); const dealerType = handType(dealerCards);
  const win = () => ({ label: 'Thắng', payout: Math.floor(bet * REGULAR_WIN_MULTIPLIER) });
  let result;
  if (playerType === 'bust') result = { label: 'Quắc · Thua', payout: 0 };
  else if (playerType === 'ngulinh' && dealerType !== 'ngulinh') result = { label: 'Ngũ linh · Thắng', payout: Math.floor(bet * REGULAR_WIN_MULTIPLIER) };
  else if (dealerType === 'ngulinh' && playerType !== 'ngulinh') result = { label: 'Thua · Nhà cái Ngũ linh', payout: 0 };
  else if (playerType === 'ngulinh' && dealerType === 'ngulinh') {
    if (score < dealer) result = { label: 'Ngũ linh · Thắng', payout: Math.floor(bet * REGULAR_WIN_MULTIPLIER) };
    else if (score === dealer) result = { label: 'Ngũ linh · Hòa', payout: bet };
    else result = { label: 'Thua · Nhà cái Ngũ linh', payout: 0 };
  }
  else if (dealerType === 'blackjack' && playerType !== 'blackjack') result = { label: 'Thua · Nhà cái Xì dách', payout: 0 };
  else if (playerType === 'blackjack' && dealerType === 'blackjack') result = { label: 'Hòa · Cùng Xì dách', payout: bet };
  else if (dealer > 21 || score > dealer) result = win();
  else if (score === dealer) result = { label: 'Hòa', payout: bet };
  else result = { label: 'Thua', payout: 0 };
  return { ...result, score, type: playerType };
}

function dealerPlay(state) {
  while (handScore(state.dealer).total < 17 && handType(state.dealer) !== 'ngulinh') state.dealer.push(draw(state));
}

function settleState(session, state, reason = null) {
  dealerPlay(state);
  const dealer = handScore(state.dealer).total;
  let payout = 0;
  const results = state.hands.map(hand => {
    const evaluated = evaluateHand(hand.cards, hand.bet, state.dealer);
    let { label, payout: handPayout } = evaluated;
    if (evaluated.type === 'bust' && evaluated.score === 22 && !state.bustGuardUsed && consumeActiveEffect(session.guild_id, session.user_id, 'blackjack_bust_guard')) {
      state.bustGuardUsed = true; handPayout = Math.floor(hand.bet * 0.25); label = 'Quắc 22 · Hoàn 25% cược';
    }
    payout += handPayout;
    return { score: evaluated.score, payout: handPayout, label };
  });
  const stake = totalBet(state);
  if (reason === 'forfeit') payout = 0;
  const outcome = payout > stake ? 'win' : payout === stake ? 'draw' : 'loss';
  const account = settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout, stake, game: 'blackjack', outcome,
    operationId: `settle:blackjack:${session.id}`, countGame: reason !== 'forfeit' });
  db.prepare('DELETE FROM blackjack_sessions WHERE id = ?').run(session.id);
  return { outcome, payout, stake, balance: account.balance, dealer, results, reason, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
}

function advanceOrSettle(session, state) {
  const next = state.hands.findIndex((hand, index) => index > state.active && hand.status === 'playing');
  if (next >= 0) { state.active = next; saveState(session, state); return { settled: false, state }; }
  return { settled: true, state, result: settleState(session, state) };
}

const actionTx = db.transaction(({ sessionId, userId, action, cardIndex = null }) => {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
  const state = parseState(session);
  const hand = state.hands[state.active];
  if (!hand || (hand.status !== 'playing' && action !== 'forfeit' && !(action === 'redraw' && hand.status === 'redraw'))) throw new Error('INVALID_ACTION');
  if (action === 'forfeit') return { settled: true, state, result: settleState(session, state, 'forfeit') };
  if (action === 'redraw') {
    if (state.itemEffect !== 'blackjack_redraw' || state.itemEffectUsed || hand.status !== 'redraw') throw new Error('ITEM_EFFECT_UNAVAILABLE');
    hand.cards.pop(); hand.cards.push(draw(state)); state.itemEffectUsed = true;
    const score = handScore(hand.cards).total; hand.status = score > 21 ? 'bust' : score === 21 ? 'stand' : 'playing';
  } else if (action === 'swap') {
    const index = Number(cardIndex);
    if (state.itemEffect !== 'blackjack_swap' || state.itemEffectUsed || hand.status !== 'playing'
      || !Number.isInteger(index) || index < 0 || index >= hand.cards.length) throw new Error('ITEM_EFFECT_UNAVAILABLE');
    hand.cards.splice(index, 1, draw(state)); state.itemEffectUsed = true;
    const score = handScore(hand.cards).total; if (score >= 21) hand.status = score > 21 ? 'bust' : 'stand';
  }
  else if (action === 'hit') {
    hand.cards.push(draw(state));
    const score = handScore(hand.cards).total;
    if (score > 21 && state.itemEffect === 'blackjack_redraw' && !state.itemEffectUsed) hand.status = 'redraw';
    else if (score >= 21) hand.status = score > 21 ? 'bust' : 'stand';
  } else if (action === 'stand') hand.status = 'stand';
  else if (action === 'double') {
    if (hand.cards.length !== 2) throw new Error('CANNOT_DOUBLE');
    if (totalBet(state) + hand.bet > (state.maxBet || MAX_BET)) { const error = new Error('BET_LIMIT'); error.maxBet = state.maxBet || MAX_BET; throw error; }
    spendCoins({ guildId: session.guild_id, userId, amount: hand.bet, reason: `blackjack:double:${session.id}` });
    hand.bet *= 2;
    hand.cards.push(draw(state));
    hand.status = handScore(hand.cards).total > 21 ? 'bust' : 'stand';
  } else if (action === 'split') {
    if (state.split || state.hands.length !== 1 || hand.cards.length !== 2 || rank(hand.cards[0]) !== rank(hand.cards[1])) throw new Error('CANNOT_SPLIT');
    if (totalBet(state) + hand.bet > (state.maxBet || MAX_BET)) { const error = new Error('BET_LIMIT'); error.maxBet = state.maxBet || MAX_BET; throw error; }
    spendCoins({ guildId: session.guild_id, userId, amount: hand.bet, reason: `blackjack:split:${session.id}` });
    const [first, second] = hand.cards;
    state.hands = [
      { cards: [first, draw(state)], bet: hand.bet, status: 'playing' },
      { cards: [second, draw(state)], bet: hand.bet, status: 'playing' },
    ];
    state.active = 0;
    state.split = true;
    if (rank(first) === 'A') for (const splitHand of state.hands) splitHand.status = 'stand';
  } else throw new Error('INVALID_ACTION');
  if (hand.status === 'playing' && handType(hand.cards) === 'ngulinh') hand.status = 'stand';
  if (['playing', 'redraw'].includes(state.hands[state.active]?.status)) { saveState(session, state); return { settled: false, state }; }
  return advanceOrSettle(session, state);
});

function playAction(args) { return actionTx(args); }

function cardText(cards) { return cards.map(card => `\`${card}\``).join(' '); }
function largeCards(cards) { return cards.map(card => `**${card}**`).join('　'); }
function handText(hand, index, active, result = null) {
  const score = handScore(hand.cards).total;
  const marker = active === index && !result ? '👉 ' : '';
  const outcome = result ? ` • **${result.label}**` : hand.status === 'bust' ? ' • **BUST**' : '';
  return `${marker}**Tay ${index + 1}:** ${cardText(hand.cards)} — **${score} điểm** • Cược ${formatCoins(hand.bet)} xu${outcome}`;
}

function blackjackEmbed(state, userId, result = null, sessionId = null) {
  const dealerCards = result ? largeCards(state.dealer) : `${largeCards([state.dealer[0]])}　**??**`;
  const dealerScore = result ? ` · **${handScore(state.dealer).total} điểm**` : '';
  const hands = state.hands.map((hand, index) => handText(hand, index, state.active, result?.results?.[index])).join('\n');
  const embed = new EmbedBuilder().setColor(result ? (result.outcome === 'win' ? 0x2ECC71 : result.outcome === 'draw' ? 0xF1C40F : 0xE74C3C) : 0x34495E)
    .setTitle('🃏 XÌ DÁCH · NHÀ CÁI')
    .setDescription(`## 🏦 BÀI NHÀ CÁI\n### ${dealerCards}${dealerScore}\n\n## 👤 BÀI CỦA <@${userId}>\n### ${hands}`);
  if (result) {
    const summary = result.reason === 'forfeit' ? 'Bạn đã bỏ ván và mất toàn bộ tiền cược.'
      : result.outcome === 'win' ? `🎉 Thắng! Nhận lại **${formatCoins(result.payout)} xu**.`
        : result.outcome === 'draw' ? `🤝 Hòa! Nhận lại **${formatCoins(result.payout)} xu**.`
          : '💥 Nhà cái thắng.';
    embed.addFields({ name: '🏆 KẾT QUẢ', value: `### ${summary}\n**Tổng cược:** ${formatCoins(result.stake)} xu` });
    addExperienceField(embed, result);
    if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  }
  if (sessionId && !result) embed.setFooter({ text: `Mã ván: ${sessionId} • Nhà cái dừng ở soft 17 • Xì dách tự nhiên trả 3:2 • Không thu phí mở ván` });
  return embed;
}

function actionRows(sessionId, state, disabled = false) {
  if (disabled) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:blackjack:${totalBet(state)}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  const hand = state.hands[state.active];
  const playing = hand?.status === 'playing';
  const withinLimit = hand ? totalBet(state) + hand.bet <= (state.maxBet || MAX_BET) : false;
  const canDouble = !disabled && hand?.status === 'playing' && hand.cards.length === 2 && withinLimit;
  const canSplit = canDouble && !state.split && state.hands.length === 1 && rank(hand.cards[0]) === rank(hand.cards[1]);
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:hit`).setLabel('Rút bài').setEmoji('➕').setStyle(ButtonStyle.Primary).setDisabled(disabled || !playing),
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:stand`).setLabel('Dừng').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(disabled || !playing),
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:double`).setLabel('Gấp đôi').setEmoji('⏫').setStyle(ButtonStyle.Secondary).setDisabled(!canDouble),
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:split`).setLabel('Tách bài').setEmoji('✂️').setStyle(ButtonStyle.Secondary).setDisabled(!canSplit),
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:forfeit`).setLabel('Bỏ ván').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  )];
  if (!disabled && hand?.status === 'redraw') rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackjack:${sessionId}:redraw`).setLabel('Bỏ lá vừa rút và rút lại').setEmoji('🔄').setStyle(ButtonStyle.Success)));
  if (!disabled && hand?.status === 'playing' && state.itemEffect === 'blackjack_swap' && !state.itemEffectUsed) {
    for (let start = 0; start < hand.cards.length; start += 5) rows.push(new ActionRowBuilder().addComponents(...hand.cards.slice(start, start + 5).map((card, offset) =>
      new ButtonBuilder().setCustomId(`blackjack:${sessionId}:swap:${start + offset}`).setLabel(`Đổi ${card}`).setStyle(ButtonStyle.Secondary))));
  }
  return rows;
}

async function handleBlackjackButton(interaction) {
  const [, sessionId, action, rawIndex] = interaction.customId.split(':');
  const session = getSession(sessionId);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Ván Xì dách đã kết thúc hoặc nút không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  if (session.user_id !== interaction.user.id) return interaction.reply({ content: 'Đây là ván Xì dách của người chơi khác.', flags: MessageFlags.Ephemeral });
  try {
    const played = playAction({ sessionId, userId: interaction.user.id, action, cardIndex: rawIndex === undefined ? null : Number(rawIndex) });
    return interaction.update({ embeds: [blackjackEmbed(played.state, interaction.user.id, played.result, played.settled ? null : sessionId)], components: actionRows(sessionId, played.state, played.settled), allowedMentions: { parse: [] } });
  } catch (error) {
    const content = error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để thực hiện thao tác này.'
      : error.message === 'BET_LIMIT' ? `Thao tác này vượt giới hạn cược **${formatCoins(error.maxBet)} xu/người/ván**.`
      : error.message === 'CANNOT_DOUBLE' ? 'Chỉ được gấp đôi khi tay bài có đúng hai lá.'
        : error.message === 'CANNOT_SPLIT' ? 'Chỉ được tách một lần khi hai lá đầu cùng hạng.'
          : error.message === 'ITEM_EFFECT_UNAVAILABLE' ? 'Hiệu ứng vật phẩm không còn khả dụng trong ván này.' : 'Không thể thực hiện thao tác này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

function getBlackjackTable(id) { return db.prepare('SELECT * FROM blackjack_tables WHERE id=?').get(String(id)) || null; }
function getActiveBlackjackTable(id, guildId) { return db.prepare("SELECT * FROM blackjack_tables WHERE id=? AND guild_id=? AND status IN ('lobby','playing')").get(String(id), String(guildId)) || null; }
function getBlackjackTableLock(guildId, userId) { return db.prepare('SELECT table_id,role FROM blackjack_table_locks WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId)) || null; }
function tableState(table) { return JSON.parse(table.state_json); }
function saveTable(table, state, status = table.status, expiresAt = table.expires_at, now = Date.now()) {
  db.prepare('UPDATE blackjack_tables SET state_json=?,status=?,expires_at=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(state), status, expiresAt, now, table.id);
}
function tableDraw(state) { return state.deck.pop(); }
function tableStatusResult(player, dealer, dealerNatural) {
  const score = handScore(player.cards).total; const natural = isBlackjack(player.cards);
  const playerType = handType(player.cards); const dealerType = handType(dealer);
  let outcome = 'loss';
  const dealerScore = handScore(dealer).total;
  if (playerType === 'bust') outcome = 'loss';
  else if (playerType === 'ngulinh' && dealerType !== 'ngulinh') outcome = 'win';
  else if (dealerType === 'ngulinh' && playerType !== 'ngulinh') outcome = 'loss';
  else if (playerType === 'ngulinh' && dealerType === 'ngulinh') outcome = score < dealerScore ? 'win' : score === dealerScore ? 'draw' : 'loss';
  else if (dealerNatural) outcome = natural ? 'draw' : 'loss';
  else if (natural || dealerScore > 21 || score > dealerScore) outcome = 'win';
  else if (score === dealerScore) outcome = 'draw';
  const label = playerType === 'ngulinh' ? `Ngũ linh ${outcome === 'win' ? 'thắng' : outcome === 'draw' ? 'hòa' : 'thua'}`
    : natural ? `Xì dách ${outcome === 'win' ? 'thắng' : outcome === 'draw' ? 'hòa' : 'thua'}`
      : playerType === 'bust' ? 'Quắc · thua' : outcome === 'win' ? 'Thắng' : outcome === 'draw' ? 'Hòa' : 'Thua';
  return { userId: player.id, score, natural, handType: playerType, outcome, label,
    payout: outcome === 'win' ? player.stake * 2 : outcome === 'draw' ? player.stake : 0 };
}
function hasOtherWagerSession(guildId, userId) {
  const guild = String(guildId); const user = String(userId);
  const checks = [
    ['blackjack_sessions', 'user_id'], ['chinchiro_sessions', 'user_id'], ['mines_sessions', 'user_id'],
    ['hardcore_sessions', 'user_id'], ['poker_sessions', 'user_id'],
  ];
  if (checks.some(([table, column]) => db.prepare(`SELECT 1 FROM ${table} WHERE guild_id=? AND ${column}=? LIMIT 1`).get(guild, user))) return true;
  if (db.prepare(`SELECT 1 FROM blackjack_duels WHERE guild_id=? AND status IN ('invited','playing')
    AND (challenger_id=? OR opponent_id=?) LIMIT 1`).get(guild, user, user)) return true;
  if (db.prepare(`SELECT 1 FROM rps_duels WHERE guild_id=? AND status IN ('invited','playing')
    AND (challenger_id=? OR opponent_id=?) LIMIT 1`).get(guild, user, user)) return true;
  const pokerSessions = db.prepare('SELECT state_json FROM poker_sessions WHERE guild_id=?').all(guild);
  if (pokerSessions.some(row => { try { return JSON.parse(row.state_json).players?.some(player => player.id === user); } catch { return false; } })) return true;
  return Boolean(db.prepare(`SELECT 1 FROM multiplayer_bets b JOIN multiplayer_rounds r ON r.id=b.round_id
    WHERE r.guild_id=? AND r.status IN ('open','racing') AND b.user_id=? LIMIT 1`).get(guild, user));
}
function settleTableTx(table, state, now = Date.now()) {
  const dealerNatural = isBlackjack(state.dealer);
  if (!dealerNatural) while (handScore(state.dealer).total < 17 && handType(state.dealer) !== 'ngulinh') state.dealer.push(tableDraw(state));
  const results = state.players.map(player => tableStatusResult(player, state.dealer, dealerNatural));
  let dealerNet = 0;
  for (const result of results) {
    const player = state.players.find(item => item.id === result.userId);
    dealerNet += player.stake - result.payout;
    const outcome = result.outcome;
    settleReservedGame({ guildId: table.guild_id, userId: result.userId, payout: result.payout,
      stake: player.stake, game: 'blackjack', outcome,
      operationId: `settle:blackjack-table:${table.id}:${result.userId}` });
  }
  const dealerReserve = table.ante * TABLE_GUESTS;
  const dealerPayout = dealerReserve + dealerNet;
  const dealerOutcome = dealerPayout > dealerReserve ? 'win' : dealerPayout < dealerReserve ? 'loss' : 'draw';
  settleReservedGame({ guildId: table.guild_id, userId: table.dealer_id, payout: dealerPayout,
    stake: dealerReserve, game: 'blackjack', outcome: dealerOutcome, operationId: `settle:blackjack-table:${table.id}:dealer` });
  state.results = results; state.phase = 'complete';
  saveTable(table, state, 'completed', now, now);
  db.prepare('DELETE FROM blackjack_table_locks WHERE table_id=?').run(table.id);
  return state;
}
function beginBlackjackTableTx(table, now = Date.now()) {
  const state = tableState(table);
  if (table.status !== 'lobby' || table.expires_at > now || !state.players.length) return null;
  const fair = createFairness(); state.fair = fair; state.deck = createShoe(6, fair.serverSeed);
  state.dealer = []; state.players.forEach(player => { player.cards = []; player.status = 'playing'; });
  for (let i = 0; i < 2; i += 1) {
    for (const player of state.players) player.cards.push(tableDraw(state));
    state.dealer.push(tableDraw(state));
  }
  for (const player of state.players) if (isBlackjack(player.cards)) player.status = 'stand';
  state.phase = 'playing'; state.turn = state.players.findIndex(player => player.status === 'playing');
  saveTable(table, state, 'playing', now + TABLE_PLAY_MS, now);
  if (state.players.every(player => player.status !== 'playing')) return settleTableTx(getBlackjackTable(table.id), state, now);
  return state;
}
function createBlackjackTable({ guildId, channelId, dealerId, ante, now = Date.now() }) {
  return db.transaction(() => {
    const account = getAccount(guildId, dealerId); const cap = Math.floor(account.balance * 0.25);
    const maxBet = getGameBetLimit(guildId, 'blackjack');
    if (!Number.isSafeInteger(ante) || ante < MIN_BET || ante > Math.min(MAX_BET, maxBet, cap)) {
      const error = new Error('DEALER_ANTE_LIMIT'); error.cap = Math.min(MAX_BET, maxBet, cap); throw error;
    }
    const lock = db.prepare('SELECT 1 FROM blackjack_table_locks WHERE guild_id=? AND user_id=?').get(String(guildId), String(dealerId));
    if (lock || hasOtherWagerSession(guildId, dealerId)) throw new Error('ACTIVE_SESSION');
    const id = crypto.randomBytes(6).toString('hex'); const reserve = ante * TABLE_GUESTS;
    db.prepare('INSERT INTO blackjack_table_locks(guild_id,user_id,table_id,role,created_at) VALUES(?,?,? ,\'dealer\',?)')
      .run(String(guildId), String(dealerId), id, now);
    spendCoins({ guildId, userId: dealerId, amount: reserve, reason: `blackjack-table:reserve:${id}`, tableId: id });
    const state = { phase: 'lobby', players: [], dealer: [], deck: [], turn: 0, results: null };
    const table = { id, guild_id: String(guildId), channel_id: String(channelId), message_id: null, dealer_id: String(dealerId), ante,
      status: 'lobby', expires_at: now + TABLE_LOBBY_MS, created_at: now, updated_at: now };
    db.prepare(`INSERT INTO blackjack_tables(id,guild_id,channel_id,message_id,dealer_id,ante,state_json,status,expires_at,created_at,updated_at)
      VALUES(?,?,?,NULL,?,?,?,'lobby',?,?,?)`).run(id, table.guild_id, table.channel_id, table.dealer_id, ante, JSON.stringify(state), table.expires_at, now, now);
    return { table: getBlackjackTable(id), state, dealerBalance: account.balance, cap };
  })();
}
function setBlackjackTableMessage(id, messageId) { db.prepare('UPDATE blackjack_tables SET message_id=?,updated_at=? WHERE id=?').run(String(messageId), Date.now(), String(id)); }
function joinBlackjackTable(id, userId, username, now = Date.now()) {
  return db.transaction(() => {
    const table = getBlackjackTable(id); if (!table || table.status !== 'lobby' || table.expires_at <= now) throw new Error('TABLE_CLOSED');
    if (table.dealer_id === String(userId)) throw new Error('DEALER_CANNOT_JOIN');
    const state = tableState(table);
    if (state.players.some(player => player.id === String(userId))) throw new Error('ALREADY_SEATED');
    if (state.players.length >= TABLE_GUESTS) throw new Error('TABLE_FULL');
    if (db.prepare('SELECT 1 FROM blackjack_table_locks WHERE guild_id=? AND user_id=?').get(table.guild_id, String(userId))) throw new Error('ACTIVE_BLACKJACK_TABLE');
    if (hasOtherWagerSession(table.guild_id, userId)) throw new Error('ACTIVE_SESSION');
    spendCoins({ guildId: table.guild_id, userId, amount: table.ante, reason: `blackjack-table:ante:${table.id}`, tableId: table.id });
    db.prepare('INSERT INTO blackjack_table_locks(guild_id,user_id,table_id,role,created_at) VALUES(?,?,?,\'player\',?)')
      .run(table.guild_id, String(userId), table.id, now);
    state.players.push({ id: String(userId), name: String(username || 'Người chơi').slice(0, 64), cards: [], status: 'waiting', stake: table.ante });
    saveTable(table, state, 'lobby', table.expires_at, now); return state;
  })();
}
function playBlackjackTable(id, userId, action, now = Date.now()) {
  return db.transaction(() => {
    const table = getBlackjackTable(id); if (!table || table.status !== 'playing' || table.expires_at <= now) throw new Error('TABLE_CLOSED');
    const state = tableState(table); const player = state.players[state.turn];
    if (!player || player.id !== String(userId) || player.status !== 'playing') throw new Error('NOT_YOUR_TURN');
    if (action === 'hit') { player.cards.push(tableDraw(state)); const score = handScore(player.cards).total; if (score >= 21 || handType(player.cards) === 'ngulinh') player.status = score > 21 ? 'bust' : 'stand'; }
    else if (action === 'stand') player.status = 'stand'; else throw new Error('INVALID_ACTION');
    const next = state.players.findIndex((candidate, index) => index > state.turn && candidate.status === 'playing');
    state.turn = next;
    if (next < 0) return { state: settleTableTx(table, state, now), settled: true };
    saveTable(table, state, 'playing', now + TABLE_PLAY_MS, now); return { state, settled: false };
  })();
}
function blackjackTableEmbed(table, state = tableState(table)) {
  const lobby = table.status === 'lobby'; const complete = table.status === 'completed';
  const embed = new EmbedBuilder().setColor(complete ? 0x2ECC71 : 0x34495E).setTitle('🃏 XÌ DÁCH · NHÀ CÁI NGƯỜI CHƠI')
    .setDescription(`🏦 Nhà cái: <@${table.dealer_id}> · Ante: **${formatCoins(table.ante)} xu**\n${lobby ? `⏳ Đang nhận người chơi đến <t:${Math.floor(table.expires_at / 1000)}:R> · Tối đa ${TABLE_GUESTS} người.` : ''}`);
  if (lobby) embed.addFields({ name: '🪑 Ghế', value: state.players.length ? state.players.map((player, index) => `${index + 1}. <@${player.id}>`).join('\n') : 'Chưa có người chơi. Bấm **Vào bàn** trong 30 giây.' });
  else {
    const dealerCards = complete ? state.dealer.map(card => `**${card}**`).join('　') : `**${state.dealer[0]}**　**??**`;
    embed.addFields({ name: '🏦 Bài nhà cái', value: `${dealerCards}${complete ? ` · ${handScore(state.dealer).total} điểm` : ''}` },
      { name: '👥 Người chơi', value: state.players.map(player => {
        if (!complete) {
          const turn = state.players[state.turn]?.id === player.id && table.status === 'playing';
          const status = turn ? '👉 Đến lượt' : player.status === 'playing' ? '⏳ Chờ lượt' : '✅ Đã xong lượt';
          return `<@${player.id}> · ${status} · 🂠 ×${player.cards.length}`;
        }
        const score = handScore(player.cards).total; const result = state.results?.find(item => item.userId === player.id);
        return `<@${player.id}>${state.players[state.turn]?.id === player.id && !complete ? ' · 👉 Đến lượt' : ''}\n${player.cards.map(card => `**${card}**`).join('　')} · ${score} điểm${handType(player.cards) === 'ngulinh' ? ' · **NGŨ LINH**' : ''}${result ? ` · **${result.label}** · nhận ${formatCoins(result.payout)} xu` : ''}`;
      }).join('\n\n') });
    if (complete) embed.addFields({ name: 'Kết quả', value: `Ván đã kết thúc. Ante **${formatCoins(table.ante)} xu/người**.` });
    else if (table.status === 'expired') embed.addFields({ name: '⌛ Bàn đã hết hạn', value: state.staller ? `<@${state.staller}> không thao tác kịp nên **mất tiền cược**; nhà cái và người chơi còn lại được hoàn tiền.` : 'Bàn hết hạn; tiền cược đã được hoàn lại.' });
  }
  return embed.setFooter({ text: `Mã ván: ${table.id}` });
}
function forceEndBlackjackSession(id, guildId, adminId, { label = 'admin-refund', forfeit = false } = {}) {
  return db.transaction(() => {
    const session = getActiveSession(id, guildId); if (!session) return null;
    const state = parseState(session); const refund = totalBet(state);
    if (!forfeit) creditCoins({ guildId: session.guild_id, userId: session.user_id, amount: refund,
      reason: `blackjack:${label}:${adminId}:${session.id}`, operationId: `refund:blackjack-admin:${session.id}:${session.user_id}` });
    db.prepare('DELETE FROM blackjack_sessions WHERE id=?').run(session.id);
    return { session, state, participants: [session.user_id], refund: forfeit ? 0 : refund, forfeited: forfeit ? refund : 0 };
  })();
}
function blackjackTableRows(table, state = tableState(table)) {
  if (table.status === 'lobby') return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`blackjack-table:${table.id}:join`).setLabel('Vào bàn').setEmoji('🪑').setStyle(ButtonStyle.Success).setDisabled(state.players.length >= TABLE_GUESTS))];
  if (table.status !== 'playing') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackjack-table:${table.id}:view`).setLabel('Xem bài của tôi').setEmoji('👁️').setStyle(ButtonStyle.Secondary))];
}
function tablePrivateText(table, state, userId) {
  const player = state.players.find(item => item.id === String(userId));
  if (!player) return table.dealer_id === String(userId) ? '🏦 Bạn là nhà cái của bàn này; bài nhà cái được chia tự động và giữ kín cho đến khi kết thúc.' : 'Bạn không ngồi ở bàn này.';
  const score = handScore(player.cards).total;
  const hand = `🃏 **Bài của bạn:** ${largeCards(player.cards)} — **${score} điểm**${handType(player.cards) === 'ngulinh' ? ' · **NGŨ LINH**' : ''}\n🏦 Nhà cái đang lộ: **${state.dealer[0]}**　**??**`;
  const result = state.results?.find(item => item.userId === player.id);
  if (result) return `${hand}\n\n🏆 **${result.label}** · nhận **${formatCoins(result.payout)} xu**`;
  if (table.status === 'expired') return `${hand}\n\n⌛ Bàn đã hết hạn.`;
  if (state.players[state.turn]?.id === player.id && player.status === 'playing') return `${hand}\n\n👉 Đến lượt bạn: chọn **Rút bài** hoặc **Dừng**.`;
  if (player.status === 'playing') return `${hand}\n\n⏳ Chưa đến lượt bạn; hãy chờ người trước hoàn tất.`;
  return `${hand}\n\n✅ Bạn đã xong lượt${player.status === 'bust' ? ' (quắc)' : ''}. Chờ những người còn lại.`;
}
function tablePrivateRows(table, state, userId) {
  const turn = table.status === 'playing' && state.players[state.turn]?.id === String(userId) && state.players[state.turn].status === 'playing';
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackjack-table-private:${table.id}:view`).setLabel('Làm mới').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blackjack-table-private:${table.id}:hit`).setLabel('Rút bài').setEmoji('➕').setStyle(ButtonStyle.Primary).setDisabled(!turn),
    new ButtonBuilder().setCustomId(`blackjack-table-private:${table.id}:stand`).setLabel('Dừng').setEmoji('✋').setStyle(ButtonStyle.Success).setDisabled(!turn))];
}
async function editPublicTable(client, table, state) {
  if (!table.message_id || !client?.channels?.fetch) return;
  const channel = await client.channels.fetch(table.channel_id).catch(() => null);
  const message = channel?.messages ? await channel.messages.fetch(table.message_id).catch(() => null) : null;
  if (message) await message.edit({ embeds: [blackjackTableEmbed(table, state)], components: blackjackTableRows(table, state), allowedMentions: { parse: [] } }).catch(() => {});
}
async function pingTableTurn(client, table, state) {
  const next = table.status === 'playing' ? state.players[state.turn] : null;
  if (!next || !client?.channels?.fetch) return;
  const channel = await client.channels.fetch(table.channel_id).catch(() => null);
  await channel?.send?.({ content: `👉 <@${next.id}>, đến lượt bạn ở bàn Xì dách \`${table.id}\` — bấm **Xem bài của tôi**.`, allowedMentions: { users: [next.id] } }).catch(() => {});
}
async function handleBlackjackTablePrivateButton(interaction) {
  const [, id, action] = interaction.customId.split(':');
  const table = getBlackjackTable(id);
  if (!table || table.guild_id !== interaction.guildId) return interaction.update({ content: 'Bàn Xì dách này không còn tồn tại.', components: [] });
  try {
    let state = tableState(table);
    if (!state.players.some(player => player.id === interaction.user.id)) return interaction.reply({ content: 'Bạn không ngồi ở bàn này.', flags: MessageFlags.Ephemeral });
    if (['hit', 'stand'].includes(action)) {
      const played = playBlackjackTable(id, interaction.user.id, action);
      state = played.state;
      const fresh = getBlackjackTable(id);
      await interaction.update({ content: tablePrivateText(fresh, state, interaction.user.id), components: tablePrivateRows(fresh, state, interaction.user.id) });
      await editPublicTable(interaction.client, fresh, state);
      if (!played.settled) await pingTableTurn(interaction.client, fresh, state);
      return null;
    }
    return interaction.update({ content: tablePrivateText(table, state, interaction.user.id), components: tablePrivateRows(table, state, interaction.user.id) });
  } catch (error) {
    const content = error.message === 'NOT_YOUR_TURN' ? 'Chưa đến lượt của bạn.' : error.message === 'TABLE_CLOSED' ? 'Bàn Xì dách đã đóng hoặc hết hạn.' : 'Không thể thực hiện thao tác này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
async function handleBlackjackTableButton(interaction) {
  const [, id, action] = interaction.customId.split(':');
  try {
    let table = getBlackjackTable(id); if (!table || table.guild_id !== interaction.guildId || table.channel_id !== interaction.channelId) throw new Error('TABLE_CLOSED');
    let state;
    if (action === 'view') {
      state = tableState(table);
      return interaction.reply({ content: tablePrivateText(table, state, interaction.user.id), components: state.players.some(player => player.id === interaction.user.id) ? tablePrivateRows(table, state, interaction.user.id) : [], flags: MessageFlags.Ephemeral });
    }
    if (action !== 'join') return interaction.reply({ content: 'Hãy bấm **Xem bài của tôi** để xem bài và thực hiện lượt trong bảng riêng.', flags: MessageFlags.Ephemeral });
    state = joinBlackjackTable(id, interaction.user.id, interaction.user.username);
    table = getBlackjackTable(id);
    return interaction.update({ embeds: [blackjackTableEmbed(table, state)], components: blackjackTableRows(table, state), allowedMentions: { parse: [] } });
  } catch (error) {
    const content = error.message === 'ACTIVE_BLACKJACK_TABLE' ? 'Bạn đang ở một bàn Xì dách khác; hãy chờ ván đó kết thúc.'
      : error.message === 'ACTIVE_SESSION' ? 'Bạn đang có một ván cược khác chưa kết thúc.'
      : error.message === 'NOT_YOUR_TURN' ? 'Đợi đến lượt của bạn.'
        : error.message === 'TABLE_FULL' ? 'Bàn đã đủ 3 người chơi.'
          : error.message === 'DEALER_CANNOT_JOIN' ? 'Nhà cái không thể ngồi vào bàn làm người chơi.'
            : error.message === 'ALREADY_SEATED' ? 'Bạn đã vào bàn này rồi.'
              : error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để vào bàn.' : 'Bàn Xì dách đã đóng hoặc thao tác không hợp lệ.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}
function expireBlackjackTableTx(table, now = Date.now()) {
  if (!table || !['lobby', 'playing'].includes(table.status) || table.expires_at > now) return null;
  const state = tableState(table);
  if (table.status === 'lobby' && state.players.length) return beginBlackjackTableTx(table, now);
  if (table.status === 'lobby') creditCoins({ guildId: table.guild_id, userId: table.dealer_id, amount: table.ante * TABLE_GUESTS, reason: `blackjack-table:refund:${table.id}`, operationId: `refund:blackjack-table:${table.id}:dealer` });
  else {
    // The guest whose turn it was when time ran out caused the expiry and forfeits the stake; everyone else is refunded.
    const staller = state.phase === 'playing' ? state.players[state.turn]?.id || null : null;
    state.staller = staller;
    for (const player of state.players) if (player.id !== staller) creditCoins({ guildId: table.guild_id, userId: player.id, amount: player.stake, reason: `blackjack-table:refund:${table.id}`, operationId: `refund:blackjack-table:${table.id}:${player.id}` });
    creditCoins({ guildId: table.guild_id, userId: table.dealer_id, amount: table.ante * TABLE_GUESTS, reason: `blackjack-table:refund:${table.id}`, operationId: `refund:blackjack-table:${table.id}:dealer` });
  }
  state.phase = 'expired'; saveTable(table, state, 'expired', now, now); db.prepare('DELETE FROM blackjack_table_locks WHERE table_id=?').run(table.id); return state;
}
function forceEndBlackjackTable(id, guildId, adminId, { forfeitUserId = null } = {}) {
  return db.transaction(() => {
    const table = getActiveBlackjackTable(id, guildId); if (!table) return null;
    const state = tableState(table);
    const participantIds = [...new Set([table.dealer_id, ...state.players.map(player => player.id)])];
    const dealerRefund = table.ante * TABLE_GUESTS;
    if (table.dealer_id !== String(forfeitUserId)) creditCoins({ guildId: table.guild_id, userId: table.dealer_id, amount: dealerRefund,
      reason: `blackjack-table:admin-refund:${adminId}:${table.id}`, operationId: `refund:blackjack-table-admin:${table.id}:${table.dealer_id}` });
    for (const player of state.players) if (player.id !== String(forfeitUserId)) creditCoins({ guildId: table.guild_id, userId: player.id, amount: player.stake,
      reason: `blackjack-table:admin-refund:${adminId}:${table.id}`, operationId: `refund:blackjack-table-admin:${table.id}:${player.id}` });
    state.phase = 'expired'; state.results = null;
    saveTable(table, state, 'expired', Date.now());
    db.prepare('DELETE FROM blackjack_table_locks WHERE table_id=?').run(table.id);
    const savedTable = getBlackjackTable(id);
    return { table: savedTable, state, participants: participantIds };
  })();
}
async function maintainBlackjackTables(client) {
  const due = db.prepare("SELECT * FROM blackjack_tables WHERE status IN ('lobby','playing') AND expires_at<=?").all(Date.now());
  for (const oldTable of due) {
    const state = db.transaction(() => expireBlackjackTableTx(getBlackjackTable(oldTable.id)))();
    if (!state || !oldTable.message_id) continue;
    const table = getBlackjackTable(oldTable.id);
    const channel = await client.channels.fetch(table.channel_id).catch(() => null);
    const message = await channel?.messages?.fetch(table.message_id).catch(() => null);
    if (message) await message.edit({ embeds: [blackjackTableEmbed(table, state)], components: blackjackTableRows(table, state) }).catch(() => {});
    await pingTableTurn(client, table, state);
  }
}
function startBlackjackTableMaintenance(client) { const run = () => maintainBlackjackTables(client).catch(() => {}); run(); const timer = setInterval(run, 5_000); timer.unref?.(); return timer; }

module.exports = {
  MIN_BET, MAX_BET, REGULAR_WIN_MULTIPLIER, expireBlackjackTableTx, getBlackjackTable, handScore, isBlackjack, handType, evaluateHand, initialResult, createShoe, putAceOnTop, startBlackjack, playAction, forceEndBlackjackSession,
  getSessionByUser, setMessageId, blackjackEmbed, actionRows, handleBlackjackButton,
  createBlackjackTable, setBlackjackTableMessage, blackjackTableEmbed, blackjackTableRows, handleBlackjackTableButton, handleBlackjackTablePrivateButton, tablePrivateText, tablePrivateRows, joinBlackjackTable, playBlackjackTable, beginBlackjackTableTx, startBlackjackTableMaintenance, forceEndBlackjackTable,
  getBlackjackTableLock,
};
