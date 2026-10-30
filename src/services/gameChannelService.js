const { db } = require("../db");

const GAMES = Object.freeze([
  "baucua",
  "taixiu",
  "chinchiro",
  "blackjack",
  "poker",
  "duangua",
  "mines",
  "coquay",
  "hardcore",
  "vuatiengviet",
  "covua",
  "cotuong",
  "2048",
]);

const GAME_LABELS = Object.freeze({
  baucua: "Bầu cua",
  taixiu: "Tài xỉu",
  chinchiro: "Chinchiro",
  blackjack: "Xì dách",
  poker: "Poker",
  duangua: "Đua ngựa",
  mines: "Dò mìn",
  coquay: "Cò quay Nga",
  hardcore: "Sinh tồn",
  vuatiengviet: "Vua tiếng Việt",
  covua: "Cờ vua",
  cotuong: "Cờ tướng",
  2048: "2048",
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

// Vua tiếng Việt có timer và thông báo theo server nên chỉ được đặt ở một kênh.
const SINGLE_CHANNEL_GAMES = Object.freeze(["vuatiengviet"]);

function addGameChannel(guildId, game, channelId) {
  if (!GAMES.includes(game)) throw new Error("INVALID_GAME");
  const guild = String(guildId);
  const tx = db.transaction(() => {
    if (SINGLE_CHANNEL_GAMES.includes(game))
      db.prepare(
        "DELETE FROM game_channels WHERE guild_id = ? AND game = ? AND channel_id <> ?",
      ).run(guild, game, String(channelId));
    db.prepare(
      `INSERT INTO game_channels (guild_id, game, channel_id, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, game, channel_id) DO UPDATE SET updated_at = excluded.updated_at`,
    ).run(guild, game, String(channelId), Date.now());
  });
  tx();
  return getGameChannel(guildId, game);
}

function removeGameChannel(guildId, game, channelId) {
  if (!GAMES.includes(game)) throw new Error("INVALID_GAME");
  return (
    db
      .prepare(
        "DELETE FROM game_channels WHERE guild_id = ? AND game = ? AND channel_id = ?",
      )
      .run(String(guildId), game, String(channelId)).changes > 0
  );
}

// Giữ tên cũ: với game nhiều kênh thì thêm kênh, với game một kênh thì thay kênh.
const setGameChannel = addGameChannel;

function getGameChannels(guildId, game) {
  return db
    .prepare(
      "SELECT * FROM game_channels WHERE guild_id = ? AND game = ? ORDER BY updated_at, channel_id",
    )
    .all(String(guildId), game);
}

// Kênh đầu tiên của game (dùng cho game một kênh như Vua tiếng Việt).
function getGameChannel(guildId, game) {
  return getGameChannels(guildId, game)[0] || null;
}

function listGameChannels(guildId) {
  return db
    .prepare(
      "SELECT * FROM game_channels WHERE guild_id = ? ORDER BY game, updated_at, channel_id",
    )
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
  SINGLE_CHANNEL_GAMES,
  addGameChannel,
  removeGameChannel,
  setGameChannel,
  getGameChannels,
  getGameChannel,
  listGameChannels,
  getGameByChannel,
  getGamesByChannel,
  channelHasGame,
};
