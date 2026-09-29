const assert = require('node:assert/strict');
const { observeHuman, readOpponent, decide, bluffChance } = require('../src/services/pokerBotBrain');

const LUNA = { aggression: 0.18, courage: 0.92, bluff: 0.07 };
const SOL = { aggression: 0.30, courage: 1.08, bluff: 0.12 };
const stateWith = (street, ...actions) => {
  const state = { street, opp: { streets: {} } };
  for (const [s, action, frac] of actions) {
    state.street = s;
    observeHuman(state, { action, toCall: 0, paid: frac ? 100 : 0, raise: frac ? Math.round(frac * 200) : 0, potBefore: 200 });
    if (action === 'raise') state.opp.streets[s].frac = frac;
  }
  state.street = street; return state;
};

// 1) Đọc bài từ cách cược: tố to > tố nhỏ > check
const bigBet = readOpponent(stateWith('turn', ['turn', 'raise', 1]));
const smallBet = readOpponent(stateWith('turn', ['turn', 'raise', 0.2]));
const check = readOpponent(stateWith('turn', ['turn', 'call', 0]));
assert.ok(bigBet.strength > 0.7, `tố to phải bị đọc là mạnh (${bigBet.strength})`);
assert.ok(smallBet.strength < 0.55 && smallBet.strength > check.strength);
assert.ok(check.weak && check.strength < 0.4);
// tố liên tiếp nhiều vòng mạnh hơn; check rồi mới tố bị nghi bluff
const streak = readOpponent(stateWith('river', ['flop', 'raise', 0.6], ['turn', 'raise', 0.8], ['river', 'raise', 0.8]));
const delayed = readOpponent(stateWith('river', ['flop', 'call', 0], ['turn', 'call', 0], ['river', 'raise', 0.8]));
assert.ok(streak.strength > delayed.strength);
assert.equal(readOpponent({ street: 'flop' }).strength, 0.5, 'chưa có thông tin thì trung lập');

// 2) Mô phỏng nhiều lần cùng một tình huống
function run(profile, power, read, extra = {}, n = 4000) {
  const out = { fold: 0, call: 0, raise: 0, bluff: 0, raiseTotal: 0 };
  for (let i = 0; i < n; i += 1) {
    const d = decide({ power, draw: 0, toCall: 0, pot: 400, stack: 5000, humanRoom: 5000, profile, read, raises: 0, ante: 50, pressure: 0, activeBots: 2,
      roll: Math.random(), bluffRoll: Math.random(), sizeRoll: Math.random(), ...extra });
    out[d.action] += 1; if (d.action === 'raise') { out.raiseTotal += d.amount; if (d.bluff) out.bluff += 1; }
  }
  return { ...out, avgRaise: out.raise ? out.raiseTotal / out.raise : 0, bluffRate: out.bluff / n };
}
const neutral = { strength: 0.5, confidence: 0, aggressive: false, weak: false };
const weakRead = { strength: 0.36, confidence: 0.6, aggressive: false, weak: true };

// bài đẹp cược to hơn bài trung bình
const strong = run(SOL, 0.9, neutral); const medium = run(SOL, 0.55, neutral);
assert.ok(strong.avgRaise > medium.avgRaise * 1.3, `bài mạnh phải cược to hơn (${strong.avgRaise} vs ${medium.avgRaise})`);
assert.ok(strong.avgRaise > 400 * 0.8, 'bài rất mạnh cược xấp xỉ pot để ép bỏ bài');
// bluff có nhưng hiếm, chỉ với bài yếu
const bluffy = run(SOL, 0.12, neutral); const calm = run(LUNA, 0.12, neutral);
assert.ok(bluffy.bluffRate > 0.03 && bluffy.bluffRate < 0.20, `tỉ lệ bluff Sol ${bluffy.bluffRate}`);
assert.ok(calm.bluffRate > 0.015 && calm.bluffRate < 0.12, `tỉ lệ bluff Luna ${calm.bluffRate}`);
assert.equal(run(SOL, 0.9, neutral).bluff, 0, 'bài mạnh không gọi là bluff');
// bot bluff nhiều hơn khi người chơi thể hiện yếu, gần như không bluff khi người chơi đang tố mạnh
const vsWeak = run(SOL, 0.12, weakRead); const vsAggressive = run(SOL, 0.12, { strength: 0.8, confidence: 0.7, aggressive: true, weak: false });
assert.ok(vsWeak.bluffRate > bluffy.bluffRate * 1.4, 'người chơi check → bot bluff nhiều hơn');
assert.ok(vsAggressive.bluffRate < bluffy.bluffRate * 0.4, 'người chơi đang tố mạnh → bot gần như không bluff');
// bluff dùng cỡ cược lớn như bài thật (không lộ)
const bluffSizes = []; for (let i = 0; i < 20000; i += 1) {
  const d = decide({ power: 0.1, draw: 0, toCall: 0, pot: 400, stack: 5000, humanRoom: 5000, profile: SOL, read: weakRead, raises: 0, ante: 50, pressure: 0, activeBots: 2, roll: 0.99, bluffRoll: 0, sizeRoll: Math.random() });
  if (d.bluff) bluffSizes.push(d.amount); }
assert.ok(bluffSizes.length && Math.min(...bluffSizes) >= 400 * 0.55, 'bluff cược đủ lớn');
// bot bỏ bài nhiều hơn khi người chơi tố to và thể hiện mạnh
function foldRate(read, toCall) { let f = 0; for (let i = 0; i < 4000; i += 1) if (decide({ power: 0.42, draw: 0, toCall, pot: 400, stack: 3000, humanRoom: 3000, profile: LUNA, read, raises: 1, ante: 50, pressure: toCall / (3000 + toCall), activeBots: 2, roll: Math.random(), bluffRoll: Math.random(), sizeRoll: Math.random() }).action === 'fold') f += 1; return f / 4000; }
const strongRead = readOpponent(stateWith('turn', ['turn', 'raise', 1])); const weakBetRead = readOpponent(stateWith('turn', ['turn', 'raise', 0.2]));
assert.ok(foldRate(strongRead, 400) > foldRate(weakBetRead, 100) + 0.2, 'đối mặt cược to + read mạnh phải bỏ bài nhiều hơn');
// không tố vượt quá số tiền người chơi có thể theo
for (let i = 0; i < 500; i += 1) {
  const d = decide({ power: 0.95, draw: 0, toCall: 0, pot: 4000, stack: 9000, humanRoom: 120, profile: SOL, read: neutral, raises: 0, ante: 50, pressure: 0, activeBots: 2, roll: 0, bluffRoll: 0, sizeRoll: Math.random() });
  if (d.action === 'raise') assert.ok(d.amount <= 120);
}
assert.ok(bluffChance(SOL, weakRead) > bluffChance(SOL, neutral) && bluffChance(SOL, { aggressive: true }) < bluffChance(SOL, neutral));

// 3) Bot không được nhìn bài người chơi: kết quả decide không phụ thuộc vào hole của human
const src = require('node:fs').readFileSync(require.resolve('../src/services/pokerBotBrain'), 'utf8');
assert.ok(!/hole/.test(src), 'brain không truy cập bài tẩy');
console.log(JSON.stringify({ ok: true, pokerBot: { strongAvgRaise: Math.round(strong.avgRaise), mediumAvgRaise: Math.round(medium.avgRaise), solBluff: +bluffy.bluffRate.toFixed(3), lunaBluff: +calm.bluffRate.toFixed(3), bluffVsCheck: +vsWeak.bluffRate.toFixed(3) } }));
