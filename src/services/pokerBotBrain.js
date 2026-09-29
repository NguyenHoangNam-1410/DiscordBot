// Bot poker: đọc cách người chơi đặt cược (không nhìn bài của họ) rồi quyết định theo bài của chính bot.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const STREET_ORDER = Object.freeze(['flop', 'turn', 'river']);

// Ghi lại hành động của người chơi trong ván: kiểu hành động và cỡ cược so với pot.
function observeHuman(state, { action, toCall = 0, paid = 0, raise = 0, potBefore = 0 }) {
  state.opp ||= { streets: {} };
  const street = state.street || 'flop';
  const entry = state.opp.streets[street] ||= { action: 'check', frac: 0, raises: 0 };
  const pot = Math.max(1, potBefore);
  if (action === 'raise') {
    entry.action = 'raise'; entry.raises += 1; entry.frac = Math.max(entry.frac, (toCall + raise) / pot);
  } else if (action === 'call') {
    if (toCall > 0 && paid > 0) { entry.action = entry.action === 'raise' ? 'raise' : 'call'; entry.frac = Math.max(entry.frac, toCall / pot); }
    else if (entry.action !== 'raise') entry.action = 'check';
  }
  return entry;
}

// Ước lượng độ mạnh bài người chơi (0..1) chỉ từ hành vi cược. 0.5 = chưa biết gì.
function readOpponent(state) {
  const streets = state.opp?.streets || {};
  const current = streets[state.street];
  let strength = 0.5; let confidence = 0;
  const previous = STREET_ORDER.filter(name => name !== state.street && streets[name]);
  for (const name of previous) {
    const entry = streets[name];
    if (entry.action === 'raise') strength += 0.05 * Math.min(1, entry.frac / 0.5);
    else if (entry.action === 'check') strength -= 0.03;
    confidence += 0.1;
  }
  if (current) {
    const frac = Math.min(1.5, current.frac || 0);
    if (current.action === 'raise') {
      strength = 0.5 + (frac < 0.3 ? 0.02 : 0.10 + frac * 0.2) + (current.raises >= 2 ? 0.08 : 0) + (strength - 0.5);
      const checkedBefore = previous.length && streets[previous.at(-1)]?.action === 'check';
      if (checkedBefore) strength -= 0.08; // check rồi mới tố: dải bài rộng hơn, có thể là bluff/chặn
    } else if (current.action === 'call') strength += 0.03 + Math.min(1, frac) * 0.08;
    else strength -= 0.14;
    confidence += 0.6;
  }
  return { strength: clamp(strength, 0.15, 0.95), confidence: clamp(confidence, 0, 1), aggressive: current?.action === 'raise', weak: current?.action === 'check' };
}

// Cỡ cược theo phần pot: bài càng mạnh cược càng to để ép đối thủ bỏ bài; bluff cược như bài mạnh.
function raiseFraction({ power, bluff, sizeRoll }) {
  if (bluff) return 0.6 + sizeRoll * 0.35;
  return clamp(0.4 + (power - 0.45) * 1.6, 0.35, 1.3) * (0.9 + sizeRoll * 0.2);
}
function bluffChance(profile, read) {
  const base = profile.bluff ?? 0.08;
  if (read.weak) return base * 2;
  if (read.aggressive) return base * 0.15;
  return base;
}

// Quyết định thuần: fold | call | raise (kèm số tiền tố thêm sau khi theo).
function decide({ power, draw, toCall, pot, stack, humanRoom, profile, read, raises, ante, pressure, activeBots, roll, bluffRoll, sizeRoll }) {
  const potOdds = toCall / Math.max(1, pot + toCall);
  const readAdjust = (read.strength - 0.5) * read.confidence * 0.6;
  const continueScore = (power + draw * 0.16 + roll * 0.12) * profile.courage - readAdjust;
  const pricedOut = potOdds > continueScore * 0.72;
  const stackThreatened = pressure > 0.55 && power < 0.55 && read.strength > 0.5;
  const facingStrength = read.confidence > 0.3 && read.strength >= 0.7 && power < 0.5;
  const defendsOpeningRaise = raises === 1 && pressure <= 0.25 && !facingStrength;
  const defendsTable = activeBots === 1 && pressure <= 0.50 && !facingStrength;
  if (toCall > 0 && (pricedOut || stackThreatened) && !defendsOpeningRaise && !defendsTable && roll > 0.10) return { action: 'fold' };
  const room = Math.max(0, Math.min(stack - toCall, humanRoom));
  if (raises >= 2 || room <= 0) return { action: 'call' };
  const valueRaise = clamp(profile.aggression + Math.max(0, power - 0.48) * 0.8 + draw * 0.08 + (read.weak ? 0.12 * read.confidence : 0), 0, 0.95);
  const canBluff = (power < 0.42 || draw >= 0.45) && !(read.aggressive && toCall > 0) && pressure <= 0.35;
  const bluff = canBluff && bluffRoll < bluffChance(profile, read);
  if (!(roll < valueRaise || bluff)) return { action: 'call' };
  const potAfterCall = pot + toCall;
  const fraction = raiseFraction({ power, bluff: bluff && roll >= valueRaise, sizeRoll });
  const amount = clamp(Math.floor(Math.max(potAfterCall, ante * 2) * fraction), Math.min(ante, room), room);
  return { action: 'raise', amount, bluff: bluff && roll >= valueRaise };
}

module.exports = { observeHuman, readOpponent, raiseFraction, bluffChance, decide };
