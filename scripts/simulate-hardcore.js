const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebot-hardcore-'));
process.env.DB_PATH = path.join(temporary, 'simulation.sqlite');
const { db } = require('../src/db');
const hardcore = require('../src/services/hardcoreService');
const runs = Math.max(10, Math.min(1000, Number(process.argv[2]) || 100));
const targetFloor = Math.max(11, Math.min(100, Number(process.argv[3]) || 50));

function actionFor(state) {
  if (state.phase === 'upgrade') return state.hp < state.maxHp * 0.6 ? 'upgrade_hp' : 'upgrade_attack';
  if (state.phase === 'summit') return 'retreat';
  const encounter = state.encounter;
  if (encounter.type === 'combat') {
    if (state.potions && state.hp < state.maxHp * 0.52 && encounter.hp > state.damageMax * 2) return 'potion';
    if (state.energy >= 2 && encounter.hp > state.damageMax * 0.8) return 'skill';
    return 'attack';
  }
  if (encounter.type === 'chest') return 'sell';
  if (encounter.type === 'shrine') return 'ignore';
  if (encounter.type === 'rngesus') return 'bribe';
  return 'continue';
}

const report = {};
for (const classKey of Object.keys(hardcore.CLASSES)) {
  const floors = [];
  for (let i = 0; i < runs; i += 1) {
    const userId = `${classKey}-${i}`;
    const started = hardcore.startHardcore({ guildId: 'simulation', userId, channelId: 'c', stake: 10, classKey });
    let state = started.state;
    for (let turn = 0; turn < 2_000 && state.cleared < targetFloor; turn += 1) {
      const played = hardcore.playHardcore({ sessionId: started.session.id, userId, expectedTurn: state.turn, action: actionFor(state) });
      state = played.state;
      if (played.settled) break;
    }
    floors.push(state.cleared);
    if (hardcore.getHardcoreByUser('simulation', userId)) hardcore.playHardcore({ sessionId: started.session.id, userId, expectedTurn: state.turn, action: 'retreat' });
  }
  const sorted = [...floors].sort((a, b) => a - b);
  report[classKey] = { runs, passedFloor10: floors.filter(floor => floor >= 10).length,
    passedFloor15: floors.filter(floor => floor >= 15).length, passedFloor25: floors.filter(floor => floor >= 25).length,
    passedFloor50: floors.filter(floor => floor >= 50).length, maxFloor: sorted.at(-1), medianFloor: sorted[Math.floor(runs / 2)],
    meanFloor: +(floors.reduce((sum, floor) => sum + floor, 0) / runs).toFixed(2) };
}
console.log(JSON.stringify(report, null, 2));
db.close();
