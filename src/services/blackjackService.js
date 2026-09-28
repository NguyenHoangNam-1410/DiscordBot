const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { getGameBetLimit } = require('./gameBetLimitService');
const { consumeHighestEffect } = require('./effectStateService');
const { createFairness, fairShuffle } = require('./fairnessService');
const { addExperienceField } = require('../utils/progressionView');

const MIN_BET = 10;
const MAX_BET = 100_000;
const REGULAR_WIN_MULTIPLIER = 1.9;
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
  return { outcome: 'loss', payout: 0, reason: 'Nhà cái có Xì dách' };
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

function dealerPlay(state) {
  while (handScore(state.dealer).total < 17) state.dealer.push(draw(state));
}

function settleState(session, state, reason = null) {
  dealerPlay(state);
  const dealer = handScore(state.dealer).total;
  let payout = 0;
  const results = state.hands.map(hand => {
    const score = handScore(hand.cards).total;
    let handPayout = 0;
    let label;
    if (score > 21 && dealer > 21) { label = 'Cùng Bust · Hòa'; handPayout = hand.bet; }
    else if (score > 21) label = 'Bust';
    else if (dealer > 21 || score > dealer) { label = 'Thắng'; handPayout = Math.floor(hand.bet * REGULAR_WIN_MULTIPLIER); }
    else if (score === dealer) { label = 'Hòa'; handPayout = hand.bet; }
    else label = 'Thua';
    payout += handPayout;
    return { score, payout: handPayout, label };
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

function blackjackEmbed(state, userId, result = null) {
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
  } else embed.setFooter({ text: 'Nhà cái dừng ở soft 17 • Xì dách tự nhiên trả 3:2 • Không thu phí mở ván' });
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
    return interaction.update({ embeds: [blackjackEmbed(played.state, interaction.user.id, played.result)], components: actionRows(sessionId, played.state, played.settled), allowedMentions: { parse: [] } });
  } catch (error) {
    const content = error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để thực hiện thao tác này.'
      : error.message === 'BET_LIMIT' ? `Thao tác này vượt giới hạn cược **${formatCoins(error.maxBet)} xu/người/ván**.`
      : error.message === 'CANNOT_DOUBLE' ? 'Chỉ được gấp đôi khi tay bài có đúng hai lá.'
        : error.message === 'CANNOT_SPLIT' ? 'Chỉ được tách một lần khi hai lá đầu cùng hạng.'
          : error.message === 'ITEM_EFFECT_UNAVAILABLE' ? 'Hiệu ứng vật phẩm không còn khả dụng trong ván này.' : 'Không thể thực hiện thao tác này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  MIN_BET, MAX_BET, REGULAR_WIN_MULTIPLIER, handScore, isBlackjack, createShoe, putAceOnTop, startBlackjack, playAction,
  getSessionByUser, setMessageId, blackjackEmbed, actionRows, handleBlackjackButton,
};
