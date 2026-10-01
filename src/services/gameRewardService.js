const { db } = require("../db");

const REWARD_GAMES = Object.freeze(["vuatiengviet"]);

function envReward(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 && value <= 100_000
    ? value
    : fallback;
}

const DEFAULT_REWARDS = Object.freeze({
  vuatiengviet: envReward("VUATIENGVIET_REWARD", 25),
});

function getGameReward(guildId, game) {
  if (!REWARD_GAMES.includes(game)) throw new Error("INVALID_REWARD_GAME");
  const row = db
    .prepare("SELECT reward FROM game_rewards WHERE guild_id = ? AND game = ?")
    .get(String(guildId), game);
  return row ? row.reward : DEFAULT_REWARDS[game];
}

function setGameReward(guildId, game, reward) {
  if (!REWARD_GAMES.includes(game)) throw new Error("INVALID_REWARD_GAME");
  const value = Number(reward);
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000)
    throw new Error("INVALID_REWARD");
  db.prepare(
    `INSERT INTO game_rewards (guild_id, game, reward, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game) DO UPDATE SET reward = excluded.reward, updated_at = excluded.updated_at`,
  ).run(String(guildId), game, value, Date.now());
  return value;
}

function listGameRewards(guildId) {
  return REWARD_GAMES.map((game) => ({
    game,
    reward: getGameReward(guildId, game),
  }));
}

module.exports = {
  REWARD_GAMES,
  DEFAULT_REWARDS,
  getGameReward,
  setGameReward,
  listGameRewards,
};
