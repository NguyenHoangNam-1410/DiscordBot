const { parentPort, workerData } = require('node:worker_threads');
process.env.DB_PATH = workerData.dbPath;
const economy = require('../src/services/economyService');
const { db } = require('../src/db');
parentPort.postMessage({ ready: true });
parentPort.once('message', () => {
  try {
    const account = economy.creditCoins({ guildId: 'stress', userId: 'lock-user', amount: 77, reason: 'held-lock', operationId: workerData.operationId });
    db.close(); parentPort.postMessage({ ok: true, balance: account.balance });
  } catch (error) { try { db.close(); } catch {} parentPort.postMessage({ ok: false, error: error.stack }); }
});
