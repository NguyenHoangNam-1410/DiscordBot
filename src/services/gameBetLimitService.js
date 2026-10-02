const { db } = require("../db");

const DEFAULT_MAX_BET = 100_000;
const MIN_MAX_BET = 10;
const BET_GAMES = Object.freeze([
  "baucua",
  "taixiu",
  "chinchiro",
  "blackjack",
  "poker",
  "duangua",
  "mines",
  "coquay",
  "hardcore",
]);

function validate(game, maxBet = DEFAULT_MAX_BET) {
  if (!BET_GAMES.includes(game)) throw new Error("INVALID_BET_GAME");
  const value = Number(maxBet);
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_MAX_BET ||
    value > DEFAULT_MAX_BET
  )
    throw new Error("INVALID_MAX_BET");
  return value;
}

function getGameBetLimit(guildId, game) {
  if (!BET_GAMES.includes(game)) throw new Error("INVALID_BET_GAME");
  return (
    db
      .prepare(
        "SELECT max_bet FROM game_bet_limits WHERE guild_id = ? AND game = ?",
      )
      .get(String(guildId), game)?.max_bet || DEFAULT_MAX_BET
  );
}

function setGameBetLimit(guildId, game, maxBet) {
  const value = validate(game, maxBet);
  db.prepare(
    `INSERT INTO game_bet_limits (guild_id, game, max_bet, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game) DO UPDATE SET max_bet = excluded.max_bet, updated_at = excluded.updated_at`,
  ).run(String(guildId), game, value, Date.now());
  return value;
}

function listGameBetLimits(guildId) {
  const configured = new Map(
    db
      .prepare("SELECT game, max_bet FROM game_bet_limits WHERE guild_id = ?")
      .all(String(guildId))
      .map((row) => [row.game, row.max_bet]),
  );
  return BET_GAMES.map((game) => ({
    game,
    maxBet: configured.get(game) || DEFAULT_MAX_BET,
  }));
}

module.exports = {
  DEFAULT_MAX_BET,
  MIN_MAX_BET,
  BET_GAMES,
  getGameBetLimit,
  setGameBetLimit,
  listGameBetLimits,
};
