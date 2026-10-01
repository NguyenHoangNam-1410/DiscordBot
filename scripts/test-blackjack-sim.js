const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-blackjack-sim.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const economy = require("../src/services/economyService");
const blackjack = require("../src/services/blackjackService");
const {
  playRound,
  legalAction,
  STRATEGIES,
} = require("../src/services/blackjackSim");

const guildId = "sim-guild";
const userId = "sim-player";
const STAKE = 100;
for (let index = 0; index < 5; index += 1)
  economy.creditCoins({
    guildId,
    userId,
    amount: 1_000_000,
    reason: `sim-fund-${index}`,
  });

function playWithEngine(deckDrawOrder, strategy) {
  const started = blackjack.startBlackjack({
    guildId,
    channelId: "c",
    userId,
    stake: STAKE,
    forcedDeck: [...deckDrawOrder].reverse(),
  });
  if (started.immediate) return { stake: STAKE, payout: started.result.payout };
  let state = started.state;
  let result = null;
  for (let guard = 0; guard < 50 && !result; guard += 1) {
    const hand = state.hands[state.active];
    const action = legalAction(
      hand.cards,
      strategy({
        cards: hand.cards,
        dealerUp: state.dealer[0],
        canDouble: hand.cards.length === 2,
        canSplit:
          !state.split &&
          state.hands.length === 1 &&
          hand.cards.length === 2 &&
          hand.cards[0].slice(0, -1) === hand.cards[1].slice(0, -1),
      }),
    );
    const step = blackjack.playAction({
      sessionId: started.session.id,
      userId,
      action,
    });
    state = step.state;
    if (step.settled) result = step.result;
  }
  assert(result, "ván không kết thúc");
  return { stake: result.stake, payout: result.payout };
}

let compared = 0;
let sawSplit = false;
let sawDouble = false;
let sawFiveCard = false;
let sawBust = false;
for (const [name, strategy] of Object.entries(STRATEGIES)) {
  for (let round = 0; round < 250; round += 1) {
    const shoe = blackjack.createShoe(6);
    const drawOrder = shoe.slice(-40).reverse(); // draw order: first element is drawn first
    const sim = playRound([...drawOrder].reverse(), strategy);
    const engine = playWithEngine(drawOrder, strategy);
    assert.equal(
      engine.stake * (1000 / STAKE),
      sim.stake,
      `${name} #${round}: tiền cược lệch`,
    );
    assert.equal(
      engine.payout * (1000 / STAKE),
      sim.payout,
      `${name} #${round}: tiền trả lệch (${drawOrder.slice(0, 8).join(" ")})`,
    );
    if (sim.hands > 1) sawSplit = true;
    if (sim.stake > 1000 * sim.hands) sawDouble = true;
    compared += 1;
  }
}
// Rule checks the old simulation got wrong
// người chơi 10+K rút 5 quắc 25; nhà cái 6+8=14 phải rút (dưới 15) và quắc → hòa, hoàn cược
const bothBust = playRound(["K♠", "5♠", "8♥", "K♦", "6♣", "10♣"], () => "hit");
assert.equal(
  bothBust.payout,
  bothBust.stake,
  "cả hai cùng quắc phải hòa và hoàn cược",
);
// người chơi 10+9 rút 5 quắc 24; nhà cái 10+6=16 đã đủ 15 nên không rút → người chơi thua
const bustDealerOk = playRound(["5♠", "6♥", "9♦", "10♦", "10♣"], () => "hit");
assert.equal(
  bustDealerOk.payout,
  0,
  "người chơi quắc, nhà cái không quắc → thua",
);
// nhà cái đứng ở 15: nếu rút nhầm thêm 4♠ sẽ có 19 và thắng người chơi 18
const dealerStands15 = playRound(
  ["4♠", "6♥", "8♦", "9♣", "10♣"],
  () => "stand",
);
assert.equal(
  dealerStands15.payout,
  Math.floor(1000 * blackjack.REGULAR_WIN_MULTIPLIER),
  "nhà cái 15 điểm phải dừng; người chơi 18 thắng",
);
// nhà cái 14 phải rút thêm: 4♠ → 18, hòa người chơi 18
const dealerDraws14 = playRound(["4♠", "5♥", "8♦", "9♣", "10♣"], () => "stand");
assert.equal(
  dealerDraws14.payout,
  dealerDraws14.stake,
  "nhà cái 14 điểm phải rút; 18-18 hòa",
);
// chiến thuật đòi dừng dưới 16 điểm bị chuyển thành rút
const { legalAction: legal } = require("../src/services/blackjackSim");
assert.equal(legal(["5♣", "6♣"], "stand"), "hit");
assert.equal(legal(["9♣", "7♣"], "stand"), "stand");
assert.equal(legal(["9♣", "7♣"], "hit"), "hit");
assert(sawSplit && sawDouble, "mô phỏng không bao phủ split/double");
void sawFiveCard;
void sawBust;

const { simulate } = require("../src/services/blackjackSim");
const rtp = simulate("basic", 150_000).rtp;
// Chủ server chọn thắng thường x2: với luật 16/15 và cùng quắc = hòa, người chơi chiến thuật cơ bản có RTP ~107% (>100%).
// Chặn trên chỉ để bắt lỗi luật; nếu muốn nhà cái có lợi thế, hạ REGULAR_WIN_MULTIPLIER (1,8 ≈ 99%).
assert(rtp > 100 && rtp < 115, `RTP Xì dách bất thường: ${rtp}`);
console.log(
  JSON.stringify({
    ok: true,
    blackjackSim: compared,
    basicRtp: +rtp.toFixed(1),
  }),
);
