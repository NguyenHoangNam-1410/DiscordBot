const crypto = require('node:crypto');
const { db } = require('../db');
const { getCatalogItem } = require('./itemCatalogService');
const { listGachaPool } = require('./gachaPoolService');
const { gachaLuckMultiplier } = require('./gameBuffService');

const COSTS = Object.freeze({ 1: 100, 10: 900 });
function itemResult(tier, itemId, label = null) {
  const item = getCatalogItem(itemId);
  return { kind: 'item', tier, itemId, name: label || item?.name || itemId, quantity: 1 };
}
function rollGacha(value = null, guildId = null, now = Date.now()) {
  const luckMultiplier = guildId ? gachaLuckMultiplier(guildId, now) : 1;
  const pool = listGachaPool(guildId || '__default__', { luckMultiplier }).filter(entry => entry.effectiveWeight > 0);
  const total = pool.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  if (!total) throw new Error('EMPTY_GACHA_POOL');
  let roll = value === null || value === undefined ? crypto.randomInt(total) : Math.max(0, Math.min(total - 1, Math.trunc(value)));
  const selected = pool.find(entry => ((roll -= entry.effectiveWeight) < 0)) || pool.at(-1);
  return selected.kind === 'coins'
    ? { kind: 'coins', tier: selected.tier, coins: selected.amount, name: selected.name }
    : itemResult(selected.tier, selected.itemId, selected.name);
}
function rollGuaranteedHigh(guildId = null, now = Date.now()) {
  const pool = listGachaPool(guildId || '__default__', { luckMultiplier: guildId ? gachaLuckMultiplier(guildId, now) : 1 })
    .filter(entry => ['SR', 'SSR', 'UR'].includes(entry.tier) && entry.kind === 'item' && entry.effectiveWeight > 0);
  if (!pool.length) throw new Error('EMPTY_HIGH_GACHA_POOL');
  const total = pool.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  let roll = crypto.randomInt(total);
  const selected = pool.find(entry => ((roll -= entry.effectiveWeight) < 0)) || pool.at(-1);
  return itemResult(selected.tier, selected.itemId, selected.name);
}
function pullGacha({ guildId, userId, pulls = 1, now = Date.now(), rolls = null, operationId = null }) {
  const count = Number(pulls);
  if (![1, 10].includes(count)) throw new Error('INVALID_PULL_COUNT');
  const levels = require('./playerLevelService');
  return levels.withBusyRetry(() => db.transaction(() => {
    const normalizedOperation = operationId ? String(operationId).slice(0, 160) : null;
    if (normalizedOperation) {
      const previous = db.prepare('SELECT * FROM gacha_history WHERE guild_id=? AND user_id=? AND operation_id=?')
        .get(String(guildId), String(userId), normalizedOperation);
      if (previous) return { pulls: previous.pulls, diamondCost: previous.diamond_cost, usedFreePull: previous.diamond_cost === 0,
        results: JSON.parse(previous.results_json), progression: levels.getPlayerProgression(guildId, userId, now), duplicate: true };
    }
    let diamondCost = COSTS[count]; let usedFreePull = false;
    if (count === 1 && levels.consumeFreePull(guildId, userId, now)) { diamondCost = 0; usedFreePull = true; }
    else levels.spendDiamonds(guildId, userId, diamondCost, { now, reason: `gacha:${count}`,
      operationId: normalizedOperation ? `gacha-spend:${normalizedOperation}` : null });

    const results = [];
    for (let index = 0; index < count; index += 1) results.push(rollGacha(rolls?.[index], guildId, now));
    if (count === 10 && !results.some(result => ['SR', 'SSR', 'UR'].includes(result.tier))) results[9] = rollGuaranteedHigh(guildId, now);

    for (const result of results) {
      if (result.kind === 'coins') require('./economyService').creditCoins({ guildId, userId, amount: result.coins, reason: 'gacha:coins' });
      else require('./shopService').addInventory(guildId, userId, result.itemId, result.quantity, now);
    }
    db.prepare('INSERT INTO gacha_history(guild_id,user_id,pulls,diamond_cost,results_json,created_at,operation_id) VALUES(?,?,?,?,?,?,?)')
      .run(String(guildId), String(userId), count, diamondCost, JSON.stringify(results), now, normalizedOperation);
    return { pulls: count, diamondCost, usedFreePull, results, progression: levels.getPlayerProgression(guildId, userId, now), duplicate: false };
  })());
}
function cleanupGachaHistory(now = Date.now(), retentionDays = Number(process.env.GACHA_HISTORY_RETENTION_DAYS) || 180) {
  const days = Math.max(7, Math.min(3650, Math.floor(retentionDays)));
  return db.prepare('DELETE FROM gacha_history WHERE created_at<?').run(now - days * 86_400_000).changes;
}

module.exports = { COSTS, rollGacha, rollGuaranteedHigh, pullGacha, cleanupGachaHistory };
