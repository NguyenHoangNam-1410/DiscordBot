const { db } = require('../db');

const GAMES = Object.freeze(['baucua', 'oantuti', 'taixiu', 'chinchiro', 'blackjack', 'poker', 'duangua', 'mines', 'hardcore', 'vuatiengviet']);

function setGameChannel(guildId, game, channelId) {
  if (!GAMES.includes(game)) throw new Error('INVALID_GAME');
  db.prepare(`INSERT INTO game_channels (guild_id, game, channel_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at`)
    .run(String(guildId), game, String(channelId), Date.now());
  return getGameChannel(guildId, game);
}

function getGameChannel(guildId, game) {
  return db.prepare('SELECT * FROM game_channels WHERE guild_id = ? AND game = ?').get(String(guildId), game) || null;
}

function listGameChannels(guildId) {
  return db.prepare('SELECT * FROM game_channels WHERE guild_id = ? ORDER BY game').all(String(guildId));
}

function getGameByChannel(guildId, channelId) {
  return getGamesByChannel(guildId, channelId)[0] || null;
}

function getGamesByChannel(guildId, channelId) {
  return db.prepare('SELECT * FROM game_channels WHERE guild_id = ? AND channel_id = ? ORDER BY game')
    .all(String(guildId), String(channelId));
}

function channelHasGame(guildId, channelId, game) {
  return Boolean(db.prepare('SELECT 1 FROM game_channels WHERE guild_id = ? AND channel_id = ? AND game = ?')
    .get(String(guildId), String(channelId), game));
}

module.exports = { GAMES, setGameChannel, getGameChannel, listGameChannels, getGameByChannel, getGamesByChannel, channelHasGame };
