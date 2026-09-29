const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.resolve(__dirname, '../data/test-blackjack-sim.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const economy = require('../src/services/economyService');
const blackjack = require('../src/services/blackjackService');
const { playRound, STRATEGIES } = require('../src/services/blackjackSim');

const guildId = 'sim-guild'; const userId = 'sim-player'; const STAKE = 100;
for (let index = 0; index < 5; index += 1) economy.creditCoins({ guildId, userId, amount: 1_000_000, reason: `sim-fund-${index}` });

function playWithEngine(deckDrawOrder, strategy) {
  const started = blackjack.startBlackjack({ guildId, channelId: 'c', userId, stake: STAKE, forcedDeck: [...deckDrawOrder].reverse() });
  if (started.immediate) return { stake: STAKE, payout: started.result.payout };
  let state = started.state; let result = null;
  for (let guard = 0; guard < 50 && !result; guard += 1) {
    const hand = state.hands[state.active];
    const action = strategy({ cards: hand.cards, dealerUp: state.dealer[0], canDouble: hand.cards.length === 2,
      canSplit: !state.split && state.hands.length === 1 && hand.cards.length === 2 && hand.cards[0].slice(0, -1) === hand.cards[1].slice(0, -1) });
    const step = blackjack.playAction({ sessionId: started.session.id, userId, action });
    state = step.state; if (step.settled) result = step.result;
  }
  assert(result, 'ván không kết thúc');
  return { stake: result.stake, payout: result.payout };
}

let compared = 0; let sawSplit = false; let sawDouble = false; let sawFiveCard = false; let sawBust = false;
for (const [name, strategy] of Object.entries(STRATEGIES)) {
  for (let round = 0; round < 250; round += 1) {
    const shoe = blackjack.createShoe(6);
    const drawOrder = shoe.slice(-40).reverse(); // draw order: first element is drawn first
    const sim = playRound([...drawOrder].reverse(), strategy);
    const engine = playWithEngine(drawOrder, strategy);
    assert.equal(engine.stake * (1000 / STAKE), sim.stake, `${name} #${round}: tiền cược lệch`);
    assert.equal(engine.payout * (1000 / STAKE), sim.payout, `${name} #${round}: tiền trả lệch (${drawOrder.slice(0, 8).join(' ')})`);
    if (sim.hands > 1) sawSplit = true;
    if (sim.stake > 1000 * sim.hands) sawDouble = true;
    compared += 1;
  }
}
// Rule checks the old simulation got wrong
const bothBust = playRound(['10♠', '4♦', '2♠', '6♥', 'K♦', '5♣', '10♣'], () => 'hit');
assert.equal(bothBust.payout, 0, 'người chơi quắc phải thua ngay cả khi nhà cái cũng quắc');
assert(sawSplit && sawDouble, 'mô phỏng không bao phủ split/double');
void sawFiveCard; void sawBust;

const { simulate } = require('../src/services/blackjackSim');
const rtp = simulate('basic', 20_000).rtp;
assert(rtp > 85 && rtp < 100.5, `RTP Xì dách bất thường: ${rtp}`);
console.log(JSON.stringify({ ok: true, blackjackSim: compared, basicRtp: +rtp.toFixed(1) }));
