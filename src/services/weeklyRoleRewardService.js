const { db } = require("../db");
const { creditCoins } = require("./economyService");
const { weekKey } = require("./progressionService");

const MAX_WEEKLY_ROLE_REWARD = 100_000_000;

function listWeeklyRoleRewards(guildId) {
  return db
    .prepare(
      "SELECT * FROM weekly_role_rewards WHERE guild_id=? ORDER BY amount DESC,role_id ASC",
    )
    .all(String(guildId));
}

function setWeeklyRoleReward({
  guildId,
  roleId,
  amount,
  createdBy,
  now = Date.now(),
}) {
  const coins = Number(amount);
  if (
    !Number.isSafeInteger(coins) ||
    coins < 1 ||
    coins > MAX_WEEKLY_ROLE_REWARD
  )
    throw new Error("INVALID_ROLE_REWARD");
  const startsWeekKey = weekKey(now);
  db.prepare(
    `INSERT INTO weekly_role_rewards
    (guild_id,role_id,amount,starts_week_key,last_granted_week,created_by,created_at,updated_at)
    VALUES (?,?,?,?,NULL,?,?,?)
    ON CONFLICT(guild_id,role_id) DO UPDATE SET amount=excluded.amount,starts_week_key=excluded.starts_week_key,
      created_by=excluded.created_by,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(roleId),
    coins,
    startsWeekKey,
    String(createdBy),
    now,
    now,
  );
  return db
    .prepare("SELECT * FROM weekly_role_rewards WHERE guild_id=? AND role_id=?")
    .get(String(guildId), String(roleId));
}

function removeWeeklyRoleReward(guildId, roleId) {
  return (
    db
      .prepare("DELETE FROM weekly_role_rewards WHERE guild_id=? AND role_id=?")
      .run(String(guildId), String(roleId)).changes > 0
  );
}

const grantMemberTx = db.transaction((config, userId, week, now) => {
  const previous = db
    .prepare(
      "SELECT 1 FROM weekly_role_reward_grants WHERE guild_id=? AND role_id=? AND week_key=? AND user_id=?",
    )
    .get(config.guild_id, config.role_id, week, String(userId));
  if (previous) return false;
  creditCoins({
    guildId: config.guild_id,
    userId,
    amount: config.amount,
    reason: `role-weekly:${config.role_id}:${week}`,
    operationId: `role-weekly:${config.guild_id}:${config.role_id}:${week}:${userId}`,
  });
  db.prepare(
    `INSERT INTO weekly_role_reward_grants(guild_id,role_id,week_key,user_id,amount,granted_at)
    VALUES(?,?,?,?,?,?)`,
  ).run(
    config.guild_id,
    config.role_id,
    week,
    String(userId),
    config.amount,
    now,
  );
  return true;
});

function claimWeeklyRoleRewards({
  guildId,
  userId,
  roleIds,
  now = Date.now(),
}) {
  const guild = String(guildId);
  const user = String(userId);
  const week = weekKey(now);
  const ownedRoles = new Set([...roleIds].map(String));
  const eligible = listWeeklyRoleRewards(guild).filter(
    (config) =>
      config.starts_week_key <= week && ownedRoles.has(config.role_id),
  );
  if (!eligible.length) throw new Error("NO_ELIGIBLE_ROLE");
  const claimed = eligible.filter((config) =>
    grantMemberTx(config, user, week, now),
  );
  if (!claimed.length) throw new Error("ALREADY_CLAIMED");
  return {
    week,
    claimed,
    total: claimed.reduce((sum, config) => sum + config.amount, 0),
  };
}

module.exports = {
  MAX_WEEKLY_ROLE_REWARD,
  listWeeklyRoleRewards,
  setWeeklyRoleReward,
  removeWeeklyRoleReward,
  claimWeeklyRoleRewards,
};
