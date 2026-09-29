const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const Database = require('better-sqlite3');
const users = Math.max(100, Math.min(5000, Number(process.argv[2]) || 500));
const workers = Math.max(2, Math.min(16, Number(process.argv[3]) || 8));
const dbPath = path.resolve(__dirname, '../data/stress-economy.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
process.env.DB_PATH = dbPath;
const { STARTING_COINS } = require('../src/services/economyService');
const { DEFAULT_ENTRIES } = require('../src/services/gachaPoolService');
require('../src/db').db.close();
// The worker rolls 0, which always lands on the first weighted pool entry; derive its prize instead of hard-coding it.
const firstPrize = DEFAULT_ENTRIES.find(entry => entry.weight > 0);
assert.equal(firstPrize.kind, 'coins', 'lượt roll 0 phải trúng phần thưởng xu đầu pool');
const CREDIT_PER_USER = 10; const LOCK_USER_CREDIT = 77;
const expectedSupply = users * (STARTING_COINS + CREDIT_PER_USER + firstPrize.amount) + STARTING_COINS + LOCK_USER_CREDIT;
function runWorker(start, end) { return new Promise((resolve, reject) => { const worker = new Worker(path.resolve(__dirname, 'stress-worker.js'), { workerData: { dbPath, start, end } }); worker.once('message', result => result.ok ? resolve() : reject(new Error(result.error))); worker.once('error', reject); }); }
function runDuringHeldLock(lockDb, operationId) { return new Promise((resolve, reject) => {
  const worker = new Worker(path.resolve(__dirname, 'stress-lock-worker.js'), { workerData: { dbPath, operationId } });
  worker.once('error', reject);
  worker.on('message', result => {
    if (result.ready) {
      lockDb.exec('BEGIN IMMEDIATE'); worker.postMessage('go');
      setTimeout(() => lockDb.exec('COMMIT'), 250);
    } else if (result.ok) resolve(result); else reject(new Error(result.error));
  });
}); }
(async () => {
  const size = Math.ceil(users / workers); const started = Date.now();
  await Promise.all(Array.from({ length: workers }, (_, index) => { const start = index * size; return start >= users ? Promise.resolve() : runWorker(start, Math.min(users, start + size)); }));
  const lockDb = new Database(dbPath); lockDb.pragma('busy_timeout = 5000');
  await runDuringHeldLock(lockDb, 'restart-safe-operation');
  // A fresh process retries the exact same operation, modelling restart after commit but before acknowledgement.
  await runDuringHeldLock(lockDb, 'restart-safe-operation');
  lockDb.close();
  const db = new Database(dbPath); const summary = db.prepare("SELECT COUNT(*) accounts,COALESCE(SUM(balance),0) supply FROM economy_accounts WHERE guild_id='stress'").get();
  const operations = db.prepare("SELECT COUNT(*) count FROM economy_transactions WHERE guild_id='stress' AND operation_id LIKE 'stress-credit:%'").get().count;
  const diamondOperations = db.prepare("SELECT COUNT(*) count FROM diamond_transactions WHERE guild_id='stress'").get().count;
  const gachaOperations = db.prepare("SELECT COUNT(*) count FROM gacha_history WHERE guild_id='stress'").get().count;
  const diamondSupply = db.prepare("SELECT COALESCE(SUM(diamonds),0) supply FROM player_currencies WHERE guild_id='stress'").get().supply;
  const restartOps = db.prepare("SELECT COUNT(*) count FROM economy_transactions WHERE operation_id='restart-safe-operation'").get().count;
  assert.equal(summary.accounts, users + 1); assert.equal(summary.supply, expectedSupply); assert.equal(operations, users);
  assert.equal(diamondOperations, users * 2); assert.equal(gachaOperations, users); assert.equal(diamondSupply, 0);
  assert.equal(restartOps, 1); assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  console.log(JSON.stringify({ ok: true, users, workers, operations, diamondOperations, gachaOperations, elapsedMs: Date.now() - started,
    duplicateCreditsPrevented: users + 1, duplicateDiamondGrantsPrevented: users, duplicateGachaPullsPrevented: users, heldLockRecovered: true, restartIdempotent: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
