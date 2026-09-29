// Hiển thị lá bài bằng emoji của ứng dụng (tên dạng cardHearts10, cardSpadesA...). Thiếu emoji thì dùng chữ như cũ (A♠, 10♥).
const { appEmoji, appEmojiObject } = require('./appEmoji');

const SUIT_NAMES = Object.freeze({ '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' });
const CARD_BACK = 'cardBack';

function cardEmojiName(card) {
  const text = String(card);
  const suit = SUIT_NAMES[text.slice(-1)];
  return suit ? `card${suit}${text.slice(0, -1)}` : null;
}
// style: 'code' → `A♠`, 'bold' → **A♠** khi chưa có emoji.
function cardMarkup(card, style = 'bold') {
  const fallback = style === 'code' ? `\`${card}\`` : `**${card}**`;
  const name = cardEmojiName(card);
  return name ? appEmoji(name, fallback) : fallback;
}
function cardsLine(cards, style = 'bold') {
  const hasEmoji = cards.some(card => { const name = cardEmojiName(card); return name && appEmoji(name, '') !== ''; });
  return cards.map(card => cardMarkup(card, style)).join(style === 'code' ? ' ' : hasEmoji ? ' ' : '　');
}
function hiddenCard() { return appEmoji(CARD_BACK, '**??**'); }
function hiddenCards(count, separator = '　') { return Array.from({ length: Math.max(0, count) }, hiddenCard).join(separator); }
// Gắn lá bài lên nút: có emoji thì dùng emoji + nhãn ngắn, không thì nhãn chữ như cũ.
function styleCardButton(button, card, verb) {
  const emoji = appEmojiObject(cardEmojiName(card));
  return emoji ? button.setLabel(verb).setEmoji(emoji) : button.setLabel(`${verb} ${card}`);
}

module.exports = { SUIT_NAMES, cardEmojiName, cardMarkup, cardsLine, hiddenCard, hiddenCards, styleCardButton };
