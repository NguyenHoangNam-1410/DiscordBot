const crypto = require('node:crypto');
const { fairShuffle } = require('./fairnessService');

const SUITS = ['♠', '♥', '♦', '♣'];
const STANDARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SHORT_RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUES = Object.fromEntries(STANDARD_RANKS.map((rank, index) => [rank, index + 2]));
const HAND_NAMES = ['Mậu thầu', 'Một đôi', 'Hai đôi', 'Bộ ba', 'Sảnh', 'Thùng', 'Cù lũ', 'Tứ quý', 'Thùng phá sảnh'];

function createDeck(shortDeck = false, serverSeed = null) {
  const cards = [];
  for (const suit of SUITS) for (const rank of shortDeck ? SHORT_RANKS : STANDARD_RANKS) cards.push(`${rank}${suit}`);
  if (serverSeed) return fairShuffle(cards, serverSeed, shortDeck ? 'poker-sixplus' : 'poker-deck');
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1); [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}
function cardRank(card) { return card.slice(0, -1); }
function combinations(items, count) {
  const result = [];
  const walk = (start, picked) => {
    if (picked.length === count) { result.push(picked); return; }
    for (let index = start; index <= items.length - (count - picked.length); index += 1) walk(index + 1, [...picked, items[index]]);
  };
  walk(0, []); return result;
}
function straightHigh(values, shortDeck = false) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.length !== 5) return 0;
  if (unique[0] - unique[4] === 4) return unique[0];
  if (!shortDeck && unique.join(',') === '14,5,4,3,2') return 5;
  if (shortDeck && unique.join(',') === '14,9,8,7,6') return 9;
  return 0;
}
function evaluateFive(cards, shortDeck = false) {
  const values = cards.map(card => VALUES[cardRank(card)]).sort((a, b) => b - a);
  const counts = new Map(); for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = new Set(cards.map(card => card.slice(-1))).size === 1;
  const straight = straightHigh(values, shortDeck);
  let category; let kickers;
  if (flush && straight) { category = 8; kickers = [straight]; }
  else if (groups[0][1] === 4) { category = 7; kickers = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) { category = shortDeck ? 5 : 6; kickers = [groups[0][0], groups[1][0]]; }
  else if (flush) { category = shortDeck ? 6 : 5; kickers = values; }
  else if (straight) { category = 4; kickers = [straight]; }
  else if (groups[0][1] === 3) { category = 3; kickers = [groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)]; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { category = 2; kickers = [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]]; }
  else if (groups[0][1] === 2) { category = 1; kickers = [groups[0][0], ...groups.slice(1).map(group => group[0]).sort((a, b) => b - a)]; }
  else { category = 0; kickers = values; }
  const name = shortDeck && category === 5 ? 'Cù lũ' : shortDeck && category === 6 ? 'Thùng' : HAND_NAMES[category];
  return { category, kickers, name, cards };
}
function compareHands(first, second) {
  if (first.category !== second.category) return first.category - second.category;
  const length = Math.max(first.kickers.length, second.kickers.length);
  for (let index = 0; index < length; index += 1) if ((first.kickers[index] || 0) !== (second.kickers[index] || 0)) return (first.kickers[index] || 0) - (second.kickers[index] || 0);
  return 0;
}
function rankLabel(value) {
  return ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' })[value] || String(value || '?');
}
function describeHand(score) {
  if (!score) return 'Chưa đủ bài để đánh giá';
  const [first, second] = score.kickers;
  if (score.name === 'Mậu thầu') return `Lá cao nhất: ${rankLabel(first)}`;
  if (score.name === 'Một đôi') return `Một đôi: ${rankLabel(first)}`;
  if (score.name === 'Hai đôi') return `Hai đôi: ${rankLabel(first)} và ${rankLabel(second)}`;
  if (score.name === 'Bộ ba') return `Bộ ba: ${rankLabel(first)}`;
  if (score.name === 'Sảnh') return `Sảnh cao đến ${rankLabel(first)}`;
  if (score.name === 'Thùng') return `Thùng, lá cao nhất ${rankLabel(first)}`;
  if (score.name === 'Cù lũ') return `Cù lũ: ${rankLabel(first)} ăn ${rankLabel(second)}`;
  if (score.name === 'Tứ quý') return `Tứ quý: ${rankLabel(first)}`;
  return `Thùng phá sảnh cao đến ${rankLabel(first)}`;
}
function bestHand(hole, board, variant = 'texas') {
  const shortDeck = variant === 'sixplus';
  const candidates = variant === 'omaha'
    ? combinations(hole, 2).flatMap(two => combinations(board, 3).map(three => [...two, ...three]))
    : combinations([...hole, ...board], 5);
  if (!candidates.length) return null;
  return candidates.map(cards => evaluateFive(cards, shortDeck)).sort((a, b) => compareHands(b, a))[0];
}
function buildPots(players) {
  const contributions = players.filter(player => player.committed > 0);
  const levels = [...new Set(contributions.map(player => player.committed))].sort((a, b) => a - b);
  const pots = []; const refunds = {};
  let previous = 0;
  for (const level of levels) {
    const contributors = contributions.filter(player => player.committed >= level);
    const amount = (level - previous) * contributors.length;
    if (contributors.length === 1) refunds[contributors[0].id] = (refunds[contributors[0].id] || 0) + amount;
    else pots.push({ amount, cap: level, eligible: contributors.filter(player => !player.folded).map(player => player.id) });
    previous = level;
  }
  return { pots, refunds };
}
function awardPots(players, scores) {
  const { pots, refunds } = buildPots(players); const awards = { ...refunds }; const details = [];
  for (const pot of pots) {
    const contenders = pot.eligible.filter(id => scores[id]);
    if (!contenders.length) continue;
    let winners = [contenders[0]];
    for (const id of contenders.slice(1)) {
      const comparison = compareHands(scores[id], scores[winners[0]]);
      if (comparison > 0) winners = [id]; else if (comparison === 0) winners.push(id);
    }
    const share = Math.floor(pot.amount / winners.length); let remainder = pot.amount % winners.length;
    for (const id of winners) { awards[id] = (awards[id] || 0) + share + (remainder-- > 0 ? 1 : 0); }
    details.push({ ...pot, winners });
  }
  return { awards, pots: details, refunds };
}
module.exports = { SUITS, STANDARD_RANKS, SHORT_RANKS, HAND_NAMES, createDeck, cardRank, combinations, straightHigh, evaluateFive, compareHands, describeHand, bestHand, buildPots, awardPots };
