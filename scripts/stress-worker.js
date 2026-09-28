const { parentPort, workerData } = require('node:worker_threads');
process.env.DB_PATH = workerData.dbPath;
const economy = require('../src/services/economyService');
const levels = require('../src/services/playerLevelService');
const gacha = require('../src/services/gachaService');
const { db } = require('../src/db');
try {
  for (let index = workerData.start; index < workerData.end; index += 1) {
    const user = `user-${index}`;
    const next = `user-${workerData.start + ((index - workerData.start + 1) % (workerData.end - workerData.start))}`;
    economy.withBusyRetry(() => economy.ensureAccount('stress', user)); economy.withBusyRetry(() => economy.ensureAccount('stress', next));
    const operationId = `stress-credit:${index}`;
    economy.creditCoins({ guildId: 'stress', userId: user, amount: 10, reason: 'stress', operationId });
    economy.creditCoins({ guildId: 'stress', userId: user, amount: 10, reason: 'stress-duplicate', operationId });
    const diamondOperation = `stress-diamonds:${index}`;
    levels.addDiamonds('stress', user, 100, { reason: 'stress', operationId: diamondOperation });
    levels.addDiamonds('stress', user, 100, { reason: 'stress-duplicate', operationId: diamondOperation });
    const gachaOperation = `stress-gacha:${index}`;
    gacha.pullGacha({ guildId: 'stress', userId: user, pulls: 1, rolls: [0], operationId: gachaOperation });
    gacha.pullGacha({ guildId: 'stress', userId: user, pulls: 1, rolls: [9900], operationId: gachaOperation });
    economy.transferCoins({ guildId: 'stress', fromUserId: user, toUserId: next, amount: 1 });
  }
  db.close(); parentPort.postMessage({ ok: true });
} catch (error) { try { db.close(); } catch {} parentPort.postMessage({ ok: false, error: error.stack }); }
