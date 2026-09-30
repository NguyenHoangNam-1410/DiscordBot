const crypto = require('node:crypto');
const { db } = require('../db');

const BUFF_TYPES = Object.freeze(['coins', 'diamonds', 'free_pull', 'gacha_luck']);

function cleanExpired(guildId, now = Date.now()) {
  return db.prepare('DELETE FROM game_reward_buffs WHERE guild_id=? AND ends_at<=?').run(String(guildId), now).changes;
}

function listBuffs(guildId, now = Date.now()) {
  cleanExpired(guildId, now);
  return db.prepare('SELECT * FROM game_reward_buffs WHERE guild_id=? ORDER BY ends_at,buff_type').all(String(guildId));
}

function getBuff(guildId, type, now = Date.now()) {
  if (!BUFF_TYPES.includes(type)) return null;
  cleanExpired(guildId, now);
  return db.prepare('SELECT * FROM game_reward_buffs WHERE guild_id=? AND buff_type=?').get(String(guildId), type) || null;
}

function setBuff({ guildId, type, percent, amount = 1, hours, updatedBy, now = Date.now() }) {
  if (!BUFF_TYPES.includes(type)) throw new Error('INVALID_BUFF_TYPE');
  const value = Number(percent); const duration = Number(hours); const reward = Number(amount);
  const minPercent = 100;
  const maxPercent = 1000;
  if (!Number.isFinite(value) || value < minPercent || value > maxPercent) throw new Error('INVALID_BUFF_RATE');
  if (!Number.isFinite(duration) || duration <= 0 || duration > 720) throw new Error('INVALID_BUFF_DURATION');
  if (!Number.isSafeInteger(reward) || reward < 1 || reward > 10_000_000) throw new Error('INVALID_BUFF_AMOUNT');
  const chanceBps = Math.round(value * 100); const endsAt = now + Math.round(duration * 3_600_000);
  db.prepare(`INSERT INTO game_reward_buffs(guild_id,buff_type,chance_bps,amount,ends_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,buff_type) DO UPDATE SET chance_bps=excluded.chance_bps,
    amount=excluded.amount,ends_at=excluded.ends_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .run(String(guildId), type, chanceBps, reward, endsAt, String(updatedBy), now);
  return getBuff(guildId, type, now);
}

function removeBuff(guildId, type) {
  if (!BUFF_TYPES.includes(type)) throw new Error('INVALID_BUFF_TYPE');
  return db.prepare('DELETE FROM game_reward_buffs WHERE guild_id=? AND buff_type=?').run(String(guildId), type).changes > 0;
}

function gachaLuckMultiplier(guildId, now = Date.now()) {
  const buff = getBuff(guildId, 'gacha_luck', now);
  return buff ? buff.chance_bps / 10_000 : 1;
}

function rollGameDrops({ guildId, userId, game, now = Date.now(), randomInt = crypto.randomInt }) {
  const drops = [];
  const config = require('./gameConfigService');
  const specs = [
    { type: 'coins', prefix: 'GAME_COIN_DROP' },
    { type: 'diamonds', prefix: 'GAME_DIAMOND_DROP' },
  ];
  for (const spec of specs) {
    const chance = config.getGameConfig(guildId, `${spec.prefix}_CHANCE`);
    if (chance <= 0 || randomInt(10_000) >= Math.round(chance * 10_000)) continue;
    const minimum = config.getGameConfig(guildId, `${spec.prefix}_MIN`);
    const maximum = config.getGameConfig(guildId, `${spec.prefix}_MAX`);
    const baseAmount = minimum === maximum ? minimum : randomInt(minimum, maximum + 1);
    const buff = getBuff(guildId, spec.type, now);
    const multiplier = buff ? buff.chance_bps / 10_000 : 1;
    const amount = Math.max(1, Math.floor(baseAmount * multiplier));
    if (spec.type === 'coins') {
      require('./economyService').creditCoins({ guildId, userId, amount, reason: `drop:${game}:coins` });
    } else require('./playerLevelService').addDiamonds(guildId, userId, amount, { reason: `drop:${game}:diamonds`, now });
    drops.push({ type: spec.type, amount, baseAmount, multiplier });
  }
  // Vật phẩm riêng của game: tỷ lệ theo game × hệ số cấu hình × buff sự kiện (loại buff `free_pull` nay nhân tỷ lệ rơi vật phẩm).
  const itemDrops = require('./gameItemDropService');
  const itemBuff = getBuff(guildId, 'free_pull', now);
  const multiplier = config.getGameConfig(guildId, 'GAME_ITEM_DROP_MULTIPLIER') * (itemBuff ? itemBuff.chance_bps / 10_000 : 1);
  const chance = itemDrops.dropChance(game, multiplier);
  if (chance > 0 && randomInt(10_000) < Math.round(chance * 10_000)) {
    const item = itemDrops.pickDropItem(game, randomInt);
    if (item) {
      require('./shopService').addInventory(guildId, userId, item.id, 1, now);
      drops.push({ type: 'item', itemId: item.id, name: item.name, rarity: item.rarity, game, amount: 1 });
    }
  }
  return drops;
}

module.exports = { BUFF_TYPES, listBuffs, getBuff, setBuff, removeBuff, gachaLuckMultiplier, rollGameDrops };
