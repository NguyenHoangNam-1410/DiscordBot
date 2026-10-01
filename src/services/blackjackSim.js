const crypto = require("node:crypto");
const {
  handScore,
  handType,
  evaluateHand,
  initialResult,
  createShoe,
  PLAYER_MIN_STAND,
  DEALER_MIN_STAND,
} = require("./blackjackService");

const UNIT_BET = 1000; // engine floors payouts to whole coins, so simulate a realistic stake instead of 1
const rankOf = (card) => card.slice(0, -1);
const cardValue = (card) => Math.min(10, handScore([card]).total);

// Luật engine: chỉ được dừng khi có ít nhất PLAYER_MIN_STAND điểm; chiến thuật đòi dừng sớm phải rút thêm.
function legalAction(cards, action) {
  return action === "stand" && handScore(cards).total < PLAYER_MIN_STAND
    ? "hit"
    : action;
}

// Mirrors blackjackService.actionTx/settleState for a hand without items: hit, stand, double, one split.
function playRound(deck, strategy) {
  const draw = () => deck.pop();
  const hands = [{ cards: [], bet: UNIT_BET, status: "playing" }];
  const dealer = [];
  hands[0].cards.push(draw());
  dealer.push(draw());
  hands[0].cards.push(draw());
  dealer.push(draw());
  const natural = initialResult({ hands, dealer });
  if (natural)
    return { stake: UNIT_BET, payout: natural.payout, hands: 1, natural: true };
  let split = false;
  for (let index = 0; index < hands.length; index += 1) {
    const hand = hands[index];
    while (hand.status === "playing") {
      const action = legalAction(
        hand.cards,
        strategy({
          cards: hand.cards,
          dealerUp: dealer[0],
          canDouble: hand.cards.length === 2,
          canSplit:
            !split &&
            hands.length === 1 &&
            hand.cards.length === 2 &&
            rankOf(hand.cards[0]) === rankOf(hand.cards[1]),
        }),
      );
      if (action === "hit") {
        hand.cards.push(draw());
        const score = handScore(hand.cards).total;
        if (score >= 21) hand.status = score > 21 ? "bust" : "stand";
      } else if (action === "stand") hand.status = "stand";
      else if (action === "double") {
        hand.bet *= 2;
        hand.cards.push(draw());
        hand.status = handScore(hand.cards).total > 21 ? "bust" : "stand";
      } else if (action === "split") {
        const [first, second] = hand.cards;
        split = true;
        hands.splice(
          0,
          1,
          { cards: [first, draw()], bet: hand.bet, status: "playing" },
          { cards: [second, draw()], bet: hand.bet, status: "playing" },
        );
        if (rankOf(first) === "A")
          for (const splitHand of hands) splitHand.status = "stand";
        index = -1;
        break;
      } else throw new Error(`INVALID_STRATEGY_ACTION:${action}`);
      if (hand.status === "playing" && handType(hand.cards) === "ngulinh")
        hand.status = "stand";
    }
  }
  while (
    handScore(dealer).total < DEALER_MIN_STAND &&
    handType(dealer) !== "ngulinh"
  )
    dealer.push(draw());
  const stake = hands.reduce((sum, hand) => sum + hand.bet, 0);
  const payout = hands.reduce(
    (sum, hand) => sum + evaluateHand(hand.cards, hand.bet, dealer).payout,
    0,
  );
  return { stake, payout, hands: hands.length, natural: false };
}

const STRATEGIES = Object.freeze({
  "mimic-dealer": ({ cards }) =>
    handScore(cards).total < PLAYER_MIN_STAND ? "hit" : "stand",
  basic: ({ cards, dealerUp, canDouble, canSplit }) => {
    const { total, soft } = handScore(cards);
    const up = cardValue(dealerUp);
    if (canSplit && ["A", "8"].includes(rankOf(cards[0]))) return "split";
    if (canDouble && !soft && (total === 11 || (total === 10 && up <= 9)))
      return "double";
    if (soft) return total >= 19 || (total === 18 && up <= 8) ? "stand" : "hit";
    if (total >= 17) return "stand";
    if (total >= 13) return up <= 6 ? "stand" : "hit";
    if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
    return "hit";
  },
  // Same as basic, but keeps drawing on four-card hands up to 16 because five cards without busting win outright.
  "chase-five": (context) => {
    const { cards } = context;
    const { total } = handScore(cards);
    if (cards.length === 4 && total <= 16) return "hit";
    return STRATEGIES.basic(context);
  },
});

function freshShoeCards() {
  return createShoe(6);
}
function simulate(
  strategyName,
  rounds,
  random = (max) => crypto.randomInt(max),
) {
  const strategy = STRATEGIES[strategyName];
  const template = freshShoeCards();
  let stake = 0;
  let payout = 0;
  let naturals = 0;
  for (let round = 0; round < rounds; round += 1) {
    const deck = template.slice(); // partial Fisher-Yates: only the cards actually drawn get shuffled into place
    const lazy = new Proxy(deck, {
      get(target, property) {
        if (property === "pop")
          return () => {
            const pick = random(target.length);
            [target[pick], target[target.length - 1]] = [
              target[target.length - 1],
              target[pick],
            ];
            return target.pop();
          };
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = playRound(lazy, strategy);
    stake += result.stake;
    payout += result.payout;
    if (result.natural) naturals += 1;
  }
  return {
    strategy: strategyName,
    rounds,
    rtp: (payout / stake) * 100,
    naturalRate: naturals / rounds,
  };
}

module.exports = { playRound, legalAction, STRATEGIES, simulate };
