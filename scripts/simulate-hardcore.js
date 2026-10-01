const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebot-hardcore-'));
process.env.DB_PATH = path.join(temporary, 'simulation.sqlite');
const { db } = require('../src/db');
const hardcore = require('../src/services/hardcoreService');
const repository = require('../src/services/hardcoreRepository');
const { createFairness } = require('../src/services/fairnessService');
const runs = Math.max(10, Math.min(1000, Number(process.argv[2]) || 100));
const targetFloor = Math.max(1, Math.min(999, Number(process.argv[3]) || 999));
const maxTurns = Math.max(100, Math.min(100_000, Number(process.argv[4]) || 40_000));
const selectedClass = process.argv[5] || 'all';
const rematches = Math.max(0, Math.min(1000, Number(process.argv[6]) || 0));
if (selectedClass !== 'all' && !Object.hasOwn(hardcore.CLASSES, selectedClass)) throw new Error('INVALID_CLASS');

function actionFor(state) {
  if (state.phase === 'upgrade') return state.cleared % 20 === 0 ? 'upgrade_hp' : 'upgrade_attack';
  if (state.phase === 'summit') return 'retreat';
  const encounter = state.encounter;
  if (encounter.type === 'combat') {
    if (state.potions && state.hp < state.maxHp * 0.6 && encounter.hp > state.damageMax * 0.8) return 'potion';
    if (state.energy >= 2 && encounter.hp > state.damageMax * 0.8) return 'skill';
    return 'attack';
  }
  if (encounter.type === 'chest') return encounter.revealed ? 'leave' : encounter.inspected ? 'open' : 'inspect';
  if (encounter.type === 'shrine') return 'ignore';
  if (encounter.type === 'rngesus') return state.escapeTokens > 0 ? 'flee' : 'bribe';
  if (encounter.type === 'surprise') return state.hp > state.maxHp * 0.6 ? 'explore' : 'ignore';
  if (encounter.type === 'blacksmith' || encounter.type === 'cleanse') {
    const target = encounter.type === 'blacksmith' ? hardcore.forgeTarget(state) : hardcore.curseTarget(state);
    return target && hardcore.potentialPayout(state) >= hardcore.serviceCost(state, encounter.type)
      ? encounter.type === 'blacksmith' ? 'forge' : 'cleanse' : 'ignore';
  }
  return 'continue';
}

const report = {};
for (const classKey of selectedClass === 'all' ? Object.keys(hardcore.CLASSES) : [selectedClass]) {
  const floors = [];
  const finalStates = []; let timeouts = 0;
  for (let i = 0; i < runs; i += 1) {
    const userId = `${classKey}-${i}`;
    const started = hardcore.startHardcore({ guildId: 'simulation', userId, channelId: 'c', stake: 10, classKey });
    let state = started.state;
    let captured = false;
    for (let turn = 0; turn < maxTurns && state.cleared < targetFloor; turn += 1) {
      if (!captured && state.floor === 999 && state.encounter.rank === 'final_boss') {
        finalStates.push(structuredClone(state)); captured = true;
      }
      const played = hardcore.playHardcore({ sessionId: started.session.id, userId, expectedTurn: state.turn, action: actionFor(state) });
      state = played.state;
      if (played.settled) break;
    }
    floors.push(state.cleared);
    if (hardcore.getHardcoreByUser('simulation', userId)) {
      if (state.cleared < targetFloor) timeouts += 1;
      hardcore.forceEndHardcoreSession(started.session.id, 'simulation', 'simulation', { forfeit: true });
    }
  }
  let finalAttempts = 0; let finalWins = 0;
  for (const snapshot of finalStates) {
    for (let attempt = 0; attempt < rematches; attempt += 1) {
      const userId = `${classKey}-final-${finalAttempts++}`;
      const { session } = hardcore.startHardcore({ guildId: 'simulation', userId, channelId: 'c', stake: 10, classKey });
      let state = { ...structuredClone(snapshot), fair: createFairness(), fairCounter: 0, turn: 0 };
      repository.saveState(session, state);
      for (let turn = 0; turn < maxTurns && state.cleared < 999; turn += 1) {
        const played = hardcore.playHardcore({ sessionId: session.id, userId, expectedTurn: state.turn, action: actionFor(state) });
        state = played.state;
        if (played.settled) break;
      }
      if (state.finalBossDefeated) finalWins += 1;
      if (hardcore.getHardcoreByUser('simulation', userId)) hardcore.forceEndHardcoreSession(session.id, 'simulation', 'simulation', { forfeit: true });
    }
  }
  const sorted = [...floors].sort((a, b) => a - b);
  report[classKey] = { runs, targetFloor, maxTurns, timeouts, equipmentSource: Object.values(hardcore.ITEMS).some(items => items.some(item => item.id != null)) ? 'Median XL' : 'fallback',
    passedFloor10: floors.filter(floor => floor >= 10).length, passedFloor50: floors.filter(floor => floor >= 50).length,
    passedFloor100: floors.filter(floor => floor >= 100).length, reachedFinalBoss: finalStates.length,
    completed999: floors.filter(floor => floor >= 999).length, finalAttempts, finalWins,
    finalStateMeans: finalStates.length ? Object.fromEntries(['maxHp', 'damageMax', 'defense', 'potions', 'resistance'].map(key => [key,
      Math.round(finalStates.reduce((total, state) => total + state[key], 0) / finalStates.length)])) : null,
    finalBossMeans: finalStates.length ? Object.fromEntries(['maxHp', 'damageMax', 'defense'].map(key => [key,
      Math.round(finalStates.reduce((total, state) => total + state.encounter[key], 0) / finalStates.length)])) : null,
    estimatedCompletionPercent: finalAttempts ? +(100 * finalStates.length / runs * finalWins / finalAttempts).toFixed(4) : null,
    maxFloor: sorted.at(-1), medianFloor: sorted[Math.floor(runs / 2)], meanFloor: +(floors.reduce((sum, floor) => sum + floor, 0) / runs).toFixed(2) };
  console.error(`${classKey}: ${runs} runs completed, ${finalStates.length} reached Deimoss`);
}
console.log(JSON.stringify(report, null, 2));
db.close();
if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('gamebot-hardcore-')) fs.rmSync(temporary, { recursive: true, force: true });
