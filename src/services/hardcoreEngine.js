const MAX_PAYOUT = 10_000_000;
const COMPLETION_FLOOR = 100;
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function hitChance(accuracy, evasion) { return clamp(0.75 + (accuracy - evasion) * 0.005, 0.2, 0.95); }
function defenseReduction(defense, level) { return clamp(defense / (defense + 50 + level * 8), 0, 0.75); }
function physicalAfterDefense(rawDamage, defense, level) { return Math.max(1, Math.floor(rawDamage * (1 - defenseReduction(defense, level)))); }
function magicAfterResistance(rawDamage, resistance) { return Math.max(1, Math.floor(rawDamage * (1 - clamp(resistance, -50, 75) / 100))); }
function enemyScale(floor) { const extra = Math.max(0, floor - 50); return { hp: (1 + Math.min(floor, 50) * 0.08) * (extra ? 1.025 ** extra : 1), damage: (1 + Math.min(floor, 50) * 0.05) * (extra ? 1.018 ** extra : 1) }; }
function baseMultiplier(state) { const floor = Math.min(state.cleared, COMPLETION_FLOOR); const bosses = Math.min(state.bosses, 20); return 1 + Math.min(floor, 50) * 0.06 + Math.max(0, floor - 50) * 0.1 + bosses * 0.15; }
function potentialPayout(state) { if (state.cleared <= 0) return 0; return Math.min(MAX_PAYOUT, Math.max(0, Math.floor((state.stake * baseMultiplier(state) + state.bonus) * state.payoutFactor))); }
module.exports = { clamp, hitChance, defenseReduction, physicalAfterDefense, magicAfterResistance, enemyScale, baseMultiplier, potentialPayout };
