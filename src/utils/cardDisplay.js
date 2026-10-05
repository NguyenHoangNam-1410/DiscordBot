"use strict";
const crypto = require("node:crypto");
const { appEmoji, appEmojiObject } = require("./appEmoji");
const SUIT_CODES = { "♠": "S", "♣": "C", "♦": "D", "♥": "H" };
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const CARD_EMOJI_NAMES = Object.values(SUIT_CODES).flatMap((suit) =>
  RANKS.map((rank) => `${rank}${suit}`),
);
const CARD_BACK_NAMES = ["red", "green", "blue"].flatMap((color) =>
  [1, 2, 3, 4, 5].map((number) => `cardBack_${color}${number}`),
);
function cardEmojiName(card) {
  const match = /^(A|[2-9]|10|J|Q|K)([♠♣♦♥])$/.exec(String(card));
  return match ? `${match[1]}${SUIT_CODES[match[2]]}` : null;
}
function cardFace(card) {
  const name = cardEmojiName(card);
  return name ? appEmoji(name, `**${card}**`) : String(card);
}
function cardsText(cards) {
  return cards.map(cardFace).join("　");
}
function cardButtonEmoji(card) {
  const name = cardEmojiName(card);
  return name
    ? appEmojiObject(name) || { name: String(card).slice(-1) }
    : undefined;
}
// Select once when creating the game, independently of the shuffled deck/fairness RNG.
function createCardBack() {
  const available = CARD_BACK_NAMES.filter((name) => appEmojiObject(name));
  const choices = available.length ? available : CARD_BACK_NAMES;
  return choices[crypto.randomInt(choices.length)];
}
function cardBackName(state, sessionId = "") {
  if (CARD_BACK_NAMES.includes(state.cardBack)) return state.cardBack;
  // Legacy sessions have no stored back: a stable session key prevents rerolls on refresh/restart.
  const seed = String(
    sessionId || state.fair?.serverSeed || "legacy-card-game",
  );
  const index =
    crypto.createHash("sha256").update(seed).digest().readUInt32BE(0) %
    CARD_BACK_NAMES.length;
  return CARD_BACK_NAMES[index];
}
function hiddenCards(state, count = 1, sessionId = "") {
  const back = appEmoji(cardBackName(state, sessionId), "🂠");
  return Array.from({ length: count }, () => back).join("　");
}
function renderCardText(text) {
  return String(text).replace(/\b(?:10|[2-9AJQK])[♠♣♦♥]/g, cardFace);
}
module.exports = {
  CARD_EMOJI_NAMES,
  CARD_BACK_NAMES,
  cardEmojiName,
  cardFace,
  cardsText,
  cardButtonEmoji,
  createCardBack,
  cardBackName,
  hiddenCards,
  renderCardText,
};
