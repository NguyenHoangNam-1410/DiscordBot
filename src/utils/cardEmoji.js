// Hiển thị lá bài bằng emoji của ứng dụng (tên dạng cardHearts10, cardSpadesA...). Thiếu emoji thì dùng chữ như cũ (A♠, 10♥).
const { appEmoji, appEmojiObject } = require('./appEmoji');

const SUIT_NAMES = Object.freeze({ '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs' });
// Lưng bài: mặc định cardBack_blue1; đổi bằng CARD_BACK_EMOJI (ví dụ cardBack_red3). Vẫn nhận tên cardBack nếu bạn tự đặt.
const CARD_BACK_CANDIDATES = () => [process.env.CARD_BACK_EMOJI, 'cardBack', 'cardBack_blue1'].filter(Boolean);

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
function hiddenCard() {
  for (const name of CARD_BACK_CANDIDATES()) { const markup = appEmoji(name, ''); if (markup) return markup; }
  return '**??**';
}
function hiddenCards(count, separator = '　') { return Array.from({ length: Math.max(0, count) }, hiddenCard).join(separator); }
// Gắn lá bài lên nút: có emoji thì dùng emoji + nhãn ngắn, không thì nhãn chữ như cũ.
function styleCardButton(button, card, verb) {
  const emoji = appEmojiObject(cardEmojiName(card));
  return emoji ? button.setLabel(verb).setEmoji(emoji) : button.setLabel(`${verb} ${card}`);
}

module.exports = { SUIT_NAMES, cardEmojiName, cardMarkup, cardsLine, hiddenCard, hiddenCards, styleCardButton };
