const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.resolve(__dirname, '../data/test-card-emoji.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { ButtonBuilder, ButtonStyle } = require('discord.js');
const appEmoji = require('../src/utils/appEmoji');
const cards = require('../src/utils/cardEmoji');
const blackjack = require('../src/services/blackjackService');
const poker = require('../src/services/pokerService');

const names = [];
for (const suit of ['Spades', 'Hearts', 'Diamonds', 'Clubs']) for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) names.push(`card${suit}${rank}`);
const registry = names.map((name, index) => [name, String(1000 + index)]);
const id = name => String(1000 + names.indexOf(name));

// tên emoji theo đúng quy ước trong Developer Portal
assert.equal(cards.cardEmojiName('10♥'), 'cardHearts10'); assert.equal(cards.cardEmojiName('A♠'), 'cardSpadesA');
assert.equal(cards.cardEmojiName('Q♦'), 'cardDiamondsQ'); assert.equal(cards.cardEmojiName('7♣'), 'cardClubs7'); assert.equal(cards.cardEmojiName('??'), null);

// chưa có emoji ứng dụng: giữ nguyên giao diện chữ cũ
appEmoji.setApplicationEmojisForTest([]);
assert.equal(cards.cardMarkup('A♠'), '**A♠**'); assert.equal(cards.cardMarkup('A♠', 'code'), '`A♠`');
assert.equal(cards.cardsLine(['A♠', '10♥']), '**A♠**　**10♥**'); assert.equal(cards.cardsLine(['A♠', '10♥'], 'code'), '`A♠` `10♥`');
assert.equal(cards.hiddenCards(2), '**??**　**??**');
const plainButton = cards.styleCardButton(new ButtonBuilder().setCustomId('x').setStyle(ButtonStyle.Secondary), 'K♥', 'Bỏ').toJSON();
assert.equal(plainButton.label, 'Bỏ K♥'); assert.equal(plainButton.emoji, undefined);

// có emoji ứng dụng
appEmoji.setApplicationEmojisForTest(registry);
assert.equal(cards.cardMarkup('10♥'), `<:cardHearts10:${id('cardHearts10')}>`);
assert.equal(cards.cardsLine(['A♠', 'K♦']), `<:cardSpadesA:${id('cardSpadesA')}> <:cardDiamondsK:${id('cardDiamondsK')}>`);
assert.equal(cards.hiddenCards(1), '**??**', 'chưa có emoji lưng bài thì dùng ??');
appEmoji.setApplicationEmojisForTest([...registry, ['cardBack_red3', '777'], ['cardBack_blue1', '888']]);
assert.equal(cards.hiddenCards(2, ' '), '<:cardBack_blue1:888> <:cardBack_blue1:888>', 'mặc định dùng cardBack_blue1');
process.env.CARD_BACK_EMOJI = 'cardBack_red3'; assert.equal(cards.hiddenCard(), '<:cardBack_red3:777>', 'đổi lưng bài bằng CARD_BACK_EMOJI');
process.env.CARD_BACK_EMOJI = 'khong_ton_tai'; assert.equal(cards.hiddenCard(), '<:cardBack_blue1:888>', 'tên sai thì quay về mặc định'); delete process.env.CARD_BACK_EMOJI;
appEmoji.setApplicationEmojisForTest([...registry, ['cardBack', '999']]);
assert.equal(cards.hiddenCard(), '<:cardBack:999>', 'vẫn nhận tên cardBack');
appEmoji.setApplicationEmojisForTest([...registry, ['cardBack_blue1', '999']]);
const emojiButton = cards.styleCardButton(new ButtonBuilder().setCustomId('x').setStyle(ButtonStyle.Secondary), 'K♥', 'Bỏ').toJSON();
assert.equal(emojiButton.label, 'Bỏ'); assert.deepEqual(emojiButton.emoji, { id: id('cardHeartsK'), name: 'cardHeartsK', animated: false });

// embed Xì dách với bot: bài người chơi và nhà cái (lá úp dùng cardBack)
const bjState = { stake: 100, hands: [{ cards: ['A♠', '10♥'], bet: 100, status: 'playing' }], active: 0, dealer: ['9♦', '5♣'], status: 'playing', fair: { commit: 'c' } };
const bjText = JSON.stringify(blackjack.blackjackEmbed(bjState, 'u', null, 'sid').toJSON());
assert(bjText.includes(`<:cardSpadesA:${id('cardSpadesA')}>`) && bjText.includes(`<:cardHearts10:${id('cardHearts10')}>`), 'bài người chơi dùng emoji');
assert(bjText.includes(`<:cardDiamonds9:${id('cardDiamonds9')}>`) && bjText.includes('<:cardBack_blue1:999>') && !bjText.includes('5♣'), 'nhà cái chỉ lộ 1 lá, lá còn lại là lưng bài và không lộ bài');

// embed Poker: bài chung, bài người chơi, bot chỉ lộ 1 lá, lá chưa mở là cardBack
const pkState = { variant: 'texas', mode: 'solo', phase: 'betting', street: 'flop', board: ['2♠', '3♥', '4♦'], pot: 100, currentBet: 0, raises: 0, ante: 50, startingStack: 1000, log: [], fair: { commit: 'c' },
  players: [
    { id: 'u', name: 'u', stack: 900, committed: 100, streetBet: 0, folded: false, allIn: false, hole: ['A♠', 'K♠'] },
    { id: 'bot_luna', name: 'Luna', stack: 900, committed: 100, streetBet: 0, folded: false, allIn: false, hole: ['Q♣', 'J♣'], revealedCard: 'Q♣' },
    { id: 'bot_sol', name: 'Sol', stack: 900, committed: 100, streetBet: 0, folded: false, allIn: false, hole: ['7♦', '8♦'], revealedCard: '7♦' },
  ] };
const pkText = JSON.stringify(poker.pokerEmbed(pkState, 'u', 'sid').toJSON());
for (const name of ['cardSpades2', 'cardHearts3', 'cardDiamonds4', 'cardSpadesA', 'cardSpadesK', 'cardClubsQ', 'cardDiamonds7']) assert(pkText.includes(`<:${name}:${id(name)}>`), `thiếu ${name}`);
assert(pkText.includes('<:cardBack_blue1:999>'), 'lá chưa mở dùng lưng bài');
assert(!pkText.includes('J♣') && !pkText.includes('cardClubsJ') && !pkText.includes('cardDiamonds8'), 'lá tẩy của bot không bị lộ');
// dòng bài dạng tiêu đề cấp 1 để emoji hiển thị lớn; chưa có emoji thì giữ tiêu đề cũ
const pkDescription = poker.pokerEmbed(pkState, 'u', 'sid').toJSON().description;
assert(/^# <:cardSpades2:/m.test(pkDescription) && /^# <:cardSpadesA:/m.test(pkDescription), 'bài chung và bài của bạn dùng tiêu đề lớn');
assert(/^### 🤖 Luna$/m.test(pkDescription) && /^# <:cardClubsQ:/m.test(pkDescription), 'bot: tên một dòng, lá bài tiêu đề lớn ở dòng dưới');
const bjDescription = blackjack.blackjackEmbed(bjState, 'u', null, 'sid').toJSON().description;
assert(/^# <:cardDiamonds9:/m.test(bjDescription) && /^# <:cardSpadesA:/m.test(bjDescription) && /\*\*21 điểm\*\*/.test(bjDescription));
appEmoji.setApplicationEmojisForTest([]);
const plainPoker = poker.pokerEmbed(pkState, 'u', 'sid').toJSON().description;
assert(/^### \*\*2♠\*\*/m.test(plainPoker) && !/^# /m.test(plainPoker), 'không có emoji thì giữ cỡ chữ cũ');
appEmoji.setApplicationEmojisForTest([...registry, ['cardBack_blue1', '999']]);
// nút chọn lá bỏ (Pineapple)
const discardRows = poker.pokerRows('sid', { ...pkState, phase: 'discard', players: [{ ...pkState.players[0], hole: ['A♠', 'K♠', '2♦'] }, ...pkState.players.slice(1)] }).map(row => row.toJSON());
assert.equal(discardRows[0].components.length, 3); assert(discardRows[0].components.every(button => button.label === 'Bỏ' && button.emoji?.id));

appEmoji.setApplicationEmojisForTest([]);
require('../src/db').db.close();
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
console.log(JSON.stringify({ ok: true, cardEmoji: true }));
