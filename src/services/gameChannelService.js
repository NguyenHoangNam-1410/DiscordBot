const { db } = require("../db");

const GAMES = Object.freeze([
  "baucua",
  "oantuti",
  "taixiu",
  "chinchiro",
  "blackjack",
  "poker",
  "duangua",
  "mines",
  "coquay",
  "hardcore",
  "vuatiengviet",
]);

const GAME_LABELS = Object.freeze({
  baucua: "Bầu cua",
  oantuti: "Oẳn tù tì",
  taixiu: "Tài xỉu",
  chinchiro: "Chinchiro",
  blackjack: "Xì dách",
  poker: "Poker",
  duangua: "Đua ngựa",
  mines: "Dò mìn",
  coquay: "Cò quay Nga",
  hardcore: "Sinh tồn",
  vuatiengviet: "Vua tiếng Việt",
});

function isGameMaintenance(guildId, game) {
  if (!guildId || !GAMES.includes(game)) return false;
  return (
    Number(
      db
        .prepare(
          "SELECT setting_value FROM game_settings WHERE guild_id=? AND setting_key=?",
        )
        .get(String(guildId), `maintenance:${game}`)?.setting_value,
    ) === 1
  );
}

function setGameMaintenance(guildId, game, enabled, adminId) {
  if (!GAMES.includes(game)) throw new Error("INVALID_GAME");
  db.prepare(
    `INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(guild_id,setting_key) DO UPDATE SET
    setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    `maintenance:${game}`,
    enabled ? 1 : 0,
    String(adminId),
    Date.now(),
  );
}

function setGameChannel(guildId, game, channelId) {
  if (!GAMES.includes(game)) throw new Error("INVALID_GAME");
  db.prepare(
    `INSERT INTO game_channels (guild_id, game, channel_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at`,
  ).run(String(guildId), game, String(channelId), Date.now());
  return getGameChannel(guildId, game);
}

function getGameChannel(guildId, game) {
  return (
    db
      .prepare("SELECT * FROM game_channels WHERE guild_id = ? AND game = ?")
      .get(String(guildId), game) || null
  );
}

function listGameChannels(guildId) {
  return db
    .prepare("SELECT * FROM game_channels WHERE guild_id = ? ORDER BY game")
    .all(String(guildId));
}

function getGameByChannel(guildId, channelId) {
  return getGamesByChannel(guildId, channelId)[0] || null;
}

function getGamesByChannel(guildId, channelId) {
  return db
    .prepare(
      "SELECT * FROM game_channels WHERE guild_id = ? AND channel_id = ? ORDER BY game",
    )
    .all(String(guildId), String(channelId));
}

function channelHasGame(guildId, channelId, game) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM game_channels WHERE guild_id = ? AND channel_id = ? AND game = ?",
      )
      .get(String(guildId), String(channelId), game),
  );
}

module.exports = {
  GAMES,
  GAME_LABELS,
  isGameMaintenance,
  setGameMaintenance,
  setGameChannel,
  getGameChannel,
  listGameChannels,
  getGameByChannel,
  getGamesByChannel,
  channelHasGame,
};
