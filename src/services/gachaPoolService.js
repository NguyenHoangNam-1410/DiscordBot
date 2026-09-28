const { db } = require('../db');
const { getCatalogItem, listCatalog } = require('./itemCatalogService');

const DEFAULT_ENTRIES = Object.freeze([
  { rewardKey: 'coins_50000', kind: 'coins', itemId: null, name: '50.000 xu', tier: 'XU', amount: 50_000, weight: 2_200 },
  { rewardKey: 'coins_100000', kind: 'coins', itemId: null, name: '100.000 xu', tier: 'XU', amount: 100_000, weight: 1_800 },
  { rewardKey: 'coins_300000', kind: 'coins', itemId: null, name: '300.000 xu', tier: 'XU', amount: 300_000, weight: 1_100 },
  { rewardKey: 'chinchiro_soundproof_bowl', kind: 'item', itemId: 'chinchiro_soundproof_bowl', name: 'Bát Cách Âm', tier: 'R', amount: 1, weight: 500 },
  { rewardKey: 'baucua_magnifier', kind: 'item', itemId: 'baucua_magnifier', name: 'Kính Lúp Bầu Cua', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'taixiu_magnetic_dice', kind: 'item', itemId: 'taixiu_magnetic_dice', name: 'Xúc Xắc Từ Tính', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'blackjack_redraw', kind: 'item', itemId: 'blackjack_redraw', name: 'Thẻ Rút Lại', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'rps_counter_charm', kind: 'item', itemId: 'rps_counter_charm', name: 'Bùa Khắc Chế', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'mines_radar', kind: 'item', itemId: 'mines_radar', name: 'Radar Nhỏ', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'chinchiro_weighted_dice', kind: 'item', itemId: 'chinchiro_weighted_dice', name: 'Xúc Xắc Chì', tier: 'SR', amount: 1, weight: 400 },
  { rewardKey: 'blackjack_swap', kind: 'item', itemId: 'blackjack_swap', name: 'Lệnh Bài Đổi Trắng', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'horse_second_insurance', kind: 'item', itemId: 'horse_second_insurance', name: 'Bảo Hiểm Về Nhì', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'rps_coward_privilege', kind: 'item', itemId: 'rps_coward_privilege', name: 'Đặc Quyền Kẻ Hèn', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'mines_blast_shield', kind: 'item', itemId: 'mines_blast_shield', name: 'Giáp Chống Nổ', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'poker_insurance', kind: 'item', itemId: 'poker_insurance', name: 'Bảo Hiểm Cược Poker', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'chinchiro_otsuki_dice', kind: 'item', itemId: 'chinchiro_otsuki_dice', name: 'Xúc Xắc Của Quản Đốc', tier: 'SSR', amount: 1, weight: 250 },
  { rewardKey: 'divine_eye', kind: 'item', itemId: 'divine_eye', name: 'Mắt Thần', tier: 'UR', amount: 1, weight: 100 },
  { rewardKey: 'blackjack_ace', kind: 'item', itemId: 'blackjack_ace', name: 'Át Chủ Bài', tier: 'UR', amount: 1, weight: 100 },
  { rewardKey: 'horse_jackpot', kind: 'item', itemId: 'horse_jackpot', name: 'Trúng Đậm', tier: 'UR', amount: 1, weight: 100 },
  { rewardKey: 'living_dictionary', kind: 'item', itemId: 'living_dictionary', name: 'Từ Điển Sống', tier: 'UR', amount: 1, weight: 100 },
  { rewardKey: 'chinchiro_karma_charm', kind: 'item', itemId: 'chinchiro_karma_charm', name: 'Bùa Trả Đũa', tier: 'UR', amount: 1, weight: 100 },
]);

function configuredRows(guildId) {
  return db.prepare('SELECT * FROM gacha_pool_entries WHERE guild_id=?').all(String(guildId));
}

function listGachaPool(guildId, { luckMultiplier = 1 } = {}) {
  const overrides = new Map(configuredRows(guildId).map(row => [row.reward_key, row]));
  const defaults = DEFAULT_ENTRIES.map(entry => {
    const row = overrides.get(entry.rewardKey);
    if (!row) return { ...entry, customized: false };
    overrides.delete(entry.rewardKey);
    return { rewardKey: row.reward_key, kind: row.kind, itemId: row.item_id, name: row.display_name,
      tier: row.tier, amount: row.amount, weight: row.weight, customized: true };
  });
  const custom = [...overrides.values()].map(row => ({ rewardKey: row.reward_key, kind: row.kind, itemId: row.item_id,
    name: row.display_name, tier: row.tier, amount: row.amount, weight: row.weight, customized: true }));
  const multiplier = Number.isFinite(Number(luckMultiplier)) ? Math.max(1, Number(luckMultiplier)) : 1;
  const entries = [...defaults, ...custom].map(entry => ({ ...entry,
    effectiveWeight: entry.kind === 'item' ? Math.round(entry.weight * multiplier) : entry.weight }));
  const total = entries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  return entries.map(entry => ({ ...entry, rate: total ? entry.effectiveWeight / total * 100 : 0 }));
}

function desiredWeight(guildId, rewardKey, percent) {
  const rate = Number(percent);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 100) throw new Error('INVALID_GACHA_RATE');
  const others = listGachaPool(guildId).filter(entry => entry.rewardKey !== rewardKey)
    .reduce((sum, entry) => sum + entry.weight, 0);
  return rate === 0 ? 0 : Math.max(1, Math.round((rate / (100 - rate)) * others));
}

function upsertEntry(guildId, entry, updatedBy) {
  db.prepare(`INSERT INTO gacha_pool_entries
    (guild_id,reward_key,kind,item_id,display_name,tier,amount,weight,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,reward_key) DO UPDATE SET
    kind=excluded.kind,item_id=excluded.item_id,display_name=excluded.display_name,tier=excluded.tier,
    amount=excluded.amount,weight=excluded.weight,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .run(String(guildId), entry.rewardKey, entry.kind, entry.itemId, entry.name, entry.tier, entry.amount,
      entry.weight, String(updatedBy), Date.now());
}

function addGachaItem(guildId, itemId, tier, percent, updatedBy) {
  const item = getCatalogItem(itemId);
  if (!item) throw new Error('INVALID_GACHA_ITEM');
  if (!['R', 'SR', 'SSR', 'UR'].includes(tier) || tier !== item.rarity) throw new Error('INVALID_GACHA_TIER');
  const weight = desiredWeight(guildId, item.id, percent);
  upsertEntry(guildId, { rewardKey: item.id, kind: 'item', itemId: item.id, name: item.name, tier, amount: 1, weight }, updatedBy);
  return listGachaPool(guildId).find(entry => entry.rewardKey === item.id);
}

function setGachaRate(guildId, rewardKey, percent, updatedBy) {
  const pool = listGachaPool(guildId);
  const entry = pool.find(item => item.rewardKey === rewardKey);
  if (!entry) throw new Error('INVALID_GACHA_REWARD');
  if (Number(percent) === 0 && !pool.some(item => item.rewardKey !== rewardKey && item.weight > 0)) throw new Error('EMPTY_GACHA_POOL');
  if (Number(percent) === 0 && ['SR', 'SSR', 'UR'].includes(entry.tier)
    && !pool.some(item => item.rewardKey !== rewardKey && ['SR', 'SSR', 'UR'].includes(item.tier) && item.weight > 0)) {
    throw new Error('GACHA_REQUIRES_HIGH_TIER');
  }
  entry.weight = desiredWeight(guildId, rewardKey, percent);
  upsertEntry(guildId, entry, updatedBy);
  return listGachaPool(guildId).find(item => item.rewardKey === rewardKey);
}

function gachaItemChoices() {
  return listCatalog().filter(item => item.type !== 'color').map(item => ({ name: item.name, value: item.id }));
}

module.exports = { DEFAULT_ENTRIES, listGachaPool, addGachaItem, setGachaRate, gachaItemChoices };
