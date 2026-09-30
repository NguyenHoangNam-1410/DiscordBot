const crypto = require('node:crypto');
const { db } = require('../db');
const { getCatalogItem } = require('./itemCatalogService');
const { listGachaPool } = require('./gachaPoolService');
const { gachaLuckMultiplier } = require('./gameBuffService');

const COSTS = Object.freeze({ 1: 100, 10: 900 });
const TICKETS = Object.freeze({ 1: 'gacha_ticket_1', 10: 'gacha_ticket_10' });
const TIER_ORDER = Object.freeze({ XU: 0, R: 1, SR: 2, SSR: 3, UR: 4 });
function itemResult(tier, itemId, label = null) {
  const item = getCatalogItem(itemId);
  return { kind: 'item', tier, itemId, name: label || item?.name || itemId, quantity: 1 };
}
// `value` là vị trí 0–9999 (điểm cơ bản trên tổng 100%) theo thứ tự bậc XU → R → SR → SSR → UR; bỏ trống thì random thật.
function pickEntry(entries, value = null) {
  const total = entries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  if (!total) return null;
  const unit = value === null || value === undefined ? crypto.randomInt(2 ** 32) / 2 ** 32 : Math.max(0, Math.min(9999, Math.trunc(value))) / 10_000;
  // +1e-9 để vị trí đúng ranh giới (ví dụ 3000 trên 10000) không bị lùi về bậc trước vì làm tròn số thực.
  let roll = Math.min(unit * total + 1e-9, total - 1e-9);
  return entries.find(entry => ((roll -= entry.effectiveWeight) < 0)) || entries.at(-1);
}
function rollGacha(value = null, guildId = null, now = Date.now(), tierMultipliers = {}) {
  const luckMultiplier = guildId ? gachaLuckMultiplier(guildId, now) : 1;
  const pool = listGachaPool(guildId || '__default__', { luckMultiplier, tierMultipliers }).filter(entry => entry.effectiveWeight > 0);
  const selected = pickEntry(pool, value);
  if (!selected) throw new Error('EMPTY_GACHA_POOL');
  return selected.kind === 'coins'
    ? { kind: 'coins', tier: selected.tier, coins: selected.amount, name: selected.name }
    : itemResult(selected.tier, selected.itemId, selected.name);
}
function rollGuaranteedHigh(guildId = null, now = Date.now(), minimumTier = 'SR', tierMultipliers = {}) {
  const pool = listGachaPool(guildId || '__default__', { luckMultiplier: guildId ? gachaLuckMultiplier(guildId, now) : 1, tierMultipliers })
    .filter(entry => TIER_ORDER[entry.tier] >= TIER_ORDER[minimumTier] && entry.kind === 'item' && entry.effectiveWeight > 0);
  const selected = pickEntry(pool);
  if (!selected) throw new Error('EMPTY_HIGH_GACHA_POOL');
  return itemResult(selected.tier, selected.itemId, selected.name);
}
function getTicketBalances(guildId, userId) {
  const shop = require('./shopService');
  return { single: shop.getInventoryQuantity(guildId, userId, TICKETS[1]), ten: shop.getInventoryQuantity(guildId, userId, TICKETS[10]) };
}
function getGachaPity(guildId, userId) {
  return db.prepare('SELECT since_sr,since_ssr,since_ur FROM gacha_pity WHERE guild_id=? AND user_id=?')
    .get(String(guildId), String(userId)) || { since_sr: 0, since_ssr: 0, since_ur: 0 };
}
function advancePity(pity, result) {
  pity.since_sr = TIER_ORDER[result.tier] >= TIER_ORDER.SR ? 0 : pity.since_sr + 1;
  pity.since_ssr = TIER_ORDER[result.tier] >= TIER_ORDER.SSR ? 0 : pity.since_ssr + 1;
  pity.since_ur = TIER_ORDER[result.tier] >= TIER_ORDER.UR ? 0 : pity.since_ur + 1;
}
function getGachaHistory(guildId, userId, page = 1, pageSize = 5) {
  const size = Math.max(1, Math.min(10, Math.trunc(pageSize) || 5));
  const total = db.prepare('SELECT COUNT(*) AS count FROM gacha_history WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId)).count;
  const pages = Math.max(1, Math.ceil(total / size)); const current = Math.max(1, Math.min(pages, Math.trunc(page) || 1));
  const rows = db.prepare('SELECT id,pulls,diamond_cost,payment_type,results_json,created_at FROM gacha_history WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(String(guildId), String(userId), size, (current - 1) * size)
    .map(row => ({ ...row, results: JSON.parse(row.results_json) }));
  return { rows, page: current, pages, total };
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
      if (previous) return { pulls: previous.pulls, diamondCost: previous.diamond_cost, paymentType: previous.payment_type, usedFreePull: previous.payment_type === TICKETS[1],
        results: JSON.parse(previous.results_json), progression: levels.getPlayerProgression(guildId, userId, now), tickets: getTicketBalances(guildId, userId), pity: getGachaPity(guildId, userId), duplicate: true };
    }
    const shop = require('./shopService');
    let diamondCost = COSTS[count]; let paymentType = 'diamonds';
    if (shop.getInventoryQuantity(guildId, userId, TICKETS[count]) > 0) {
      shop.consumeInventory(guildId, userId, TICKETS[count]); diamondCost = 0; paymentType = TICKETS[count];
    } else levels.spendDiamonds(guildId, userId, diamondCost, { now, reason: `gacha:${count}`,
      operationId: normalizedOperation ? `gacha-spend:${normalizedOperation}` : null });

    const pity = getGachaPity(guildId, userId); const results = [];
    const tierBoost = paymentType === TICKETS[10] ? { UR: 2 } : {};
    for (let index = 0; index < count; index += 1) {
      const normal = rollGacha(rolls?.[index], guildId, now, tierBoost);
      let minimum = null;
      if (pity.since_ur >= 49) minimum = 'UR';
      else if (pity.since_ssr >= 24) minimum = 'SSR';
      else if (pity.since_sr >= 9) minimum = 'SR';
      if (index === count - 1 && paymentType === TICKETS[10] && !results.some(result => result.kind === 'item' && TIER_ORDER[result.tier] >= TIER_ORDER.SSR) && (TIER_ORDER[minimum] || 0) < TIER_ORDER.SSR) minimum = 'SSR';
      else if (index === count - 1 && paymentType === TICKETS[1] && (TIER_ORDER[minimum] || 0) < TIER_ORDER.SSR) minimum = 'SSR';
      else if (index === count - 1 && count === 10 && !results.some(result => result.kind === 'item' && TIER_ORDER[result.tier] >= TIER_ORDER.SR) && (TIER_ORDER[minimum] || 0) < TIER_ORDER.SR) minimum = 'SR';
      const result = minimum && (normal.kind !== 'item' || TIER_ORDER[normal.tier] < TIER_ORDER[minimum])
        ? rollGuaranteedHigh(guildId, now, minimum, tierBoost) : normal;
      results.push(result); advancePity(pity, result);
    }
    db.prepare(`INSERT INTO gacha_pity(guild_id,user_id,since_sr,since_ssr,since_ur) VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id,user_id) DO UPDATE SET since_sr=excluded.since_sr,since_ssr=excluded.since_ssr,since_ur=excluded.since_ur`)
      .run(String(guildId), String(userId), pity.since_sr, pity.since_ssr, pity.since_ur);

    for (const result of results) {
      if (result.kind === 'coins') require('./economyService').creditCoins({ guildId, userId, amount: result.coins, reason: 'gacha:coins' });
      else require('./shopService').addInventory(guildId, userId, result.itemId, result.quantity, now);
    }
    db.prepare('INSERT INTO gacha_history(guild_id,user_id,pulls,diamond_cost,results_json,created_at,operation_id,payment_type) VALUES(?,?,?,?,?,?,?,?)')
      .run(String(guildId), String(userId), count, diamondCost, JSON.stringify(results), now, normalizedOperation, paymentType);
    return { pulls: count, diamondCost, paymentType, usedFreePull: paymentType === TICKETS[1], results, progression: levels.getPlayerProgression(guildId, userId, now), tickets: getTicketBalances(guildId, userId), pity, duplicate: false };
  })());
}
function cleanupGachaHistory(now = Date.now(), retentionDays = Number(process.env.GACHA_HISTORY_RETENTION_DAYS) || 180) {
  const days = Math.max(7, Math.min(3650, Math.floor(retentionDays)));
  return db.prepare('DELETE FROM gacha_history WHERE created_at<?').run(now - days * 86_400_000).changes;
}

module.exports = { COSTS, TICKETS, rollGacha, rollGuaranteedHigh, pullGacha, getTicketBalances, getGachaPity, getGachaHistory, cleanupGachaHistory };
