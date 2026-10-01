const crypto = require("node:crypto");
const { db } = require("../db");

const BUFF_TYPES = Object.freeze(["coins", "gacha_luck"]);

function cleanExpired(guildId, now = Date.now()) {
  return db
    .prepare("DELETE FROM game_reward_buffs WHERE guild_id=? AND ends_at<=?")
    .run(String(guildId), now).changes;
}

function listBuffs(guildId, now = Date.now()) {
  cleanExpired(guildId, now);
  return db
    .prepare(
      "SELECT * FROM game_reward_buffs WHERE guild_id=? AND buff_type IN ('coins','gacha_luck') ORDER BY ends_at,buff_type",
    )
    .all(String(guildId));
}

function getBuff(guildId, type, now = Date.now()) {
  if (!BUFF_TYPES.includes(type)) return null;
  cleanExpired(guildId, now);
  return (
    db
      .prepare(
        "SELECT * FROM game_reward_buffs WHERE guild_id=? AND buff_type=?",
      )
      .get(String(guildId), type) || null
  );
}

function setBuff({
  guildId,
  type,
  percent,
  amount = 1,
  hours,
  updatedBy,
  now = Date.now(),
}) {
  if (!BUFF_TYPES.includes(type)) throw new Error("INVALID_BUFF_TYPE");
  const value = Number(percent);
  const duration = Number(hours);
  const reward = Number(amount);
  const minPercent = 100;
  const maxPercent = 1000;
  if (!Number.isFinite(value) || value < minPercent || value > maxPercent)
    throw new Error("INVALID_BUFF_RATE");
  if (!Number.isFinite(duration) || duration <= 0 || duration > 720)
    throw new Error("INVALID_BUFF_DURATION");
  if (!Number.isSafeInteger(reward) || reward < 1 || reward > 10_000_000)
    throw new Error("INVALID_BUFF_AMOUNT");
  const chanceBps = Math.round(value * 100);
  const endsAt = now + Math.round(duration * 3_600_000);
  db.prepare(
    `INSERT INTO game_reward_buffs(guild_id,buff_type,chance_bps,amount,ends_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,buff_type) DO UPDATE SET chance_bps=excluded.chance_bps,
    amount=excluded.amount,ends_at=excluded.ends_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    type,
    chanceBps,
    reward,
    endsAt,
    String(updatedBy),
    now,
  );
  return getBuff(guildId, type, now);
}

function removeBuff(guildId, type) {
  if (!BUFF_TYPES.includes(type)) throw new Error("INVALID_BUFF_TYPE");
  return (
    db
      .prepare("DELETE FROM game_reward_buffs WHERE guild_id=? AND buff_type=?")
      .run(String(guildId), type).changes > 0
  );
}

function gachaLuckMultiplier(guildId, now = Date.now()) {
  const buff = getBuff(guildId, "gacha_luck", now);
  return buff ? buff.chance_bps / 10_000 : 1;
}

function rollGameDrops({
  guildId,
  userId,
  game,
  stake = 0,
  now = Date.now(),
  randomInt = crypto.randomInt,
}) {
  const cap = Math.floor(Math.max(0, Number(stake) || 0) * 0.01);
  if (cap < 1) return [];
  const config = require("./gameConfigService");
  const chance = config.getGameConfig(guildId, "GAME_COIN_DROP_CHANCE");
  if (chance <= 0 || randomInt(10_000) >= Math.round(chance * 10_000))
    return [];
  const minimum = config.getGameConfig(guildId, "GAME_COIN_DROP_MIN");
  const maximum = config.getGameConfig(guildId, "GAME_COIN_DROP_MAX");
  const baseAmount =
    minimum === maximum ? minimum : randomInt(minimum, maximum + 1);
  const buff = getBuff(guildId, "coins", now);
  const multiplier = buff ? buff.chance_bps / 10_000 : 1;
  const amount = Math.min(
    cap,
    Math.max(1, Math.floor(baseAmount * multiplier)),
  );
  require("./economyService").creditCoins({
    guildId,
    userId,
    amount,
    reason: `drop:${game}:coins`,
  });
  return [{ type: "coins", amount, baseAmount, multiplier }];
}

module.exports = {
  BUFF_TYPES,
  listBuffs,
  getBuff,
  setBuff,
  removeBuff,
  gachaLuckMultiplier,
  rollGameDrops,
};
