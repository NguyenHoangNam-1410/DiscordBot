const crypto = require('node:crypto');
const { calculatePayout, BAUCUA, TOTAL_RATIOS } = require('../src/services/multiplayerGameService');
const { payoutFor, combination, CELL_COUNT } = require('../src/services/minesService');
const iterations = Math.max(10_000, Math.min(5_000_000, Number(process.argv[2]) || 1_000_000));
function random(max) { return crypto.randomInt(max); }
const MAX_ACCEPTABLE_RTP = Number(process.env.RTP_MAX_PERCENT || 100.5);
function riskFor(rtp) { return rtp > MAX_ACCEPTABLE_RTP ? 'HIGH' : rtp > 99.5 ? 'NEUTRAL' : 'SINK'; }
function summary(game, returned, wins, notes = '', count = iterations) { const rtp = returned / count * 100; return { game, iterations: count, rtp: +rtp.toFixed(3), houseEdge: +(100 - rtp).toFixed(3), winRate: +(wins / count * 100).toFixed(3), coinsReturnedPerMillionWagered: Math.round(rtp * 10_000), netCoinsBurnedPerMillion: Math.round((100 - rtp) * 10_000), inflationRisk: riskFor(rtp), notes }; }
function baucua() { const keys = Object.keys(BAUCUA); let returned = 0; let wins = 0; for (let i = 0; i < iterations; i += 1) { const result = { symbols: [keys[random(6)], keys[random(6)], keys[random(6)]] }; const payout = calculatePayout('baucua', 'bau', 1, result); returned += payout; if (payout) wins += 1; } return summary('baucua', returned, wins); }
function taixiu(choice) { let returned = 0; let wins = 0; let outcomes = 0; for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) for (let c = 1; c <= 6; c += 1) { const dice = [a, b, c]; const result = { dice, total: a + b + c, triple: a === b && b === c }; const payout = calculatePayout('taixiu', choice, 1, result); returned += payout; if (payout) wins += 1; outcomes += 1; } return summary(`taixiu:${choice}`, returned, wins, `${choice.startsWith('tong:') ? `ratio ${TOTAL_RATIOS[Number(choice.slice(5))]}:1 · ` : ''}exact enumeration`, outcomes); }
const { simulate: simulateBlackjack, STRATEGIES: BLACKJACK_STRATEGIES } = require('../src/services/blackjackSim');
function blackjack() {
  const rounds = Math.min(iterations, 300_000);
  return Object.keys(BLACKJACK_STRATEGIES).map(name => {
    const result = simulateBlackjack(name, rounds);
    return { game: `blackjack:${name}`, iterations: rounds, rtp: +result.rtp.toFixed(3), houseEdge: +(100 - result.rtp).toFixed(3), naturalRate: +(result.naturalRate * 100).toFixed(2),
      notes: 'Real rules: 6-deck shoe without replacement, player bust always loses, five-card Ngũ linh, 1.9x wins, 2.5x natural, single split, double; no items' };
  });
}
function analytic(game, rtp, winRate, notes) { return { game, iterations: 'analytic', rtp, houseEdge: +(100 - rtp).toFixed(3), winRate, coinsReturnedPerMillionWagered: Math.round(rtp * 10_000), netCoinsBurnedPerMillion: Math.round((100 - rtp) * 10_000), inflationRisk: riskFor(rtp), notes }; }
function minesAt(mineCount, opened, stake = 1000) {
  const survival = combination(CELL_COUNT - opened, mineCount) / combination(CELL_COUNT, mineCount);
  const specialChance = opened / (CELL_COUNT - mineCount);
  const state = { stake, mineCount, opened: Array(opened).fill(0), specialFound: false };
  const expectedPayout = (1 - specialChance) * payoutFor(state) + specialChance * payoutFor({ ...state, specialFound: true });
  return survival * expectedPayout / stake * 100;
}
function minesAdaptive(mineCount, stake = 1000) {
  const safeCount = CELL_COUNT - mineCount;
  const values = Array.from({ length: safeCount + 1 }, () => [0, 0]);
  for (let opened = safeCount; opened >= 0; opened -= 1) {
    const remaining = CELL_COUNT - opened;
    for (const found of [0, 1]) {
      const state = { stake, mineCount, opened: Array(opened).fill(0), specialFound: Boolean(found) };
      const cashout = opened ? payoutFor(state) : 0;
      const continueValue = opened === safeCount ? 0 :
        ((safeCount - opened - (found ? 0 : 1)) * values[opened + 1][found] +
          (found ? 0 : values[opened + 1][1])) / remaining;
      values[opened][found] = opened === 0 ? continueValue : Math.max(cashout, continueValue);
    }
  }
  return values[0][0] / stake * 100;
}
function mines(mineCount) {
  const rtpByOpened = Array.from({ length: CELL_COUNT - mineCount }, (_, index) => ({ opened: index + 1, rtp: minesAt(mineCount, index + 1) }));
  const worst = rtpByOpened.reduce((highest, value) => value.rtp > highest.rtp ? value : highest);
  const stakes = [10, 100, 1000, 100000].map(stake => ({ stake, rtp: minesAdaptive(mineCount, stake) }));
  const highest = stakes.reduce((best, item) => item.rtp > best.rtp ? item : best);
  const adaptiveRtp = +highest.rtp.toFixed(3);
  return { ...analytic(`mines:${mineCount}:adaptive-star-cashout`, adaptiveRtp, null, `Exact optimal cash-out after each safe reveal, with star status known; stakes 10, 100, 1000, 100000`),
    oneCellRtp: +rtpByOpened[0].rtp.toFixed(3), worstFixedRtp: +worst.rtp.toFixed(3), worstOpened: worst.opened, worstStake: highest.stake };
}
const report = [baucua(), taixiu('tai'), taixiu('bo_ba'), taixiu('tong:10'), ...blackjack(), ...[2, 3, 4, 5, 6, 7].map(mines), analytic('oantuti', 100, 33.333, 'Uniform fair bot; draw refunds stake'), { game: 'poker', iterations: 'policy-dependent', rtp: null, inflationRisk: 'AUDIT', notes: 'RTP depends on player actions, bot folds, side pots and stack size; use settled-history audit rather than a misleading fixed RTP.' }, { game: 'hardcore', iterations: 'policy-dependent', rtp: null, inflationRisk: 'AUDIT', notes: 'RTP depends on cash-out floor and combat decisions; payout remains capped at 10,000,000.' }, { game: 'duangua', iterations: 'market-dependent', rtp: 82, houseEdge: 18, winRate: null, coinsReturnedPerMillionWagered: 820000, netCoinsBurnedPerMillion: 180000, inflationRisk: 'SINK', notes: 'Market multipliers are generated as floor(0.82 / win probability), so target RTP is at most 82% before rounding.' }];
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), iterations, report }, null, 2));
if (report.some(item => Number.isFinite(item.rtp) && item.rtp > MAX_ACCEPTABLE_RTP)) {
  console.error(`RTP vượt ngưỡng ${MAX_ACCEPTABLE_RTP}%`);
  process.exitCode = 1;
}
