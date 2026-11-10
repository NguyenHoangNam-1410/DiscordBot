"use strict";

const { createWebServer } = require("./http");
const { readConfig } = require("./config");

function createRuntime({ games, legacyGame = null, webhooks = [] }) {
  const registry = new Map(games.map((game) => [game.id, game]));
  function game(id) {
    const module = registry.get(id);
    if (!module) throw new Error(`Unknown web game: ${id}`);
    return module;
  }
  const keyFor = (gameId, roomId) => `${gameId}:${roomId}`;
  // Interaction credentials stay in memory only; they must never enter room JSON or logs.
  const editors = new Map();
  const INTERACTION_EDIT_MS = 14.5 * 60_000;
  let web = null,
    timer = null,
    busy = false,
    startPending = null,
    stopping = false;
  let syncAgain = false,
    onChange = null;

  async function syncMessages(client, logger) {
    if (stopping) return;
    if (busy) {
      syncAgain = true;
      return;
    }
    busy = true;
    try {
      for (const [id, editor] of editors)
        if (editor.expires <= Date.now()) editors.delete(id);
      for (const module of games) {
        const { store, discord } = module;
        store.sweep();
        if (!discord) continue;
        const rows = discord.pending();
        for (const { id } of rows) {
          const room = store.get(id);
          if (!room.messageId) continue;
          let stage = "interaction_edit";
          try {
            const key = keyFor(module.id, id);
            const payload = discord.payload(room, roomUrl(module.id, room.id));
            const editor = editors.get(key);
            let edited = false;
            if (
              editor &&
              editor.messageId === room.messageId &&
              editor.expires > Date.now()
            ) {
              try {
                await editor.edit(payload);
                edited = true;
              } catch (error) {
                // An expired interaction is not a deleted lobby. Try the permanent bot route.
                if (![10015, 10062, 50027].includes(error.code)) throw error;
                editors.delete(key);
              }
            } else editors.delete(key);
            if (stopping) return;
            if (!edited) {
              stage = "channel_fetch";
              const channel = await client.channels.fetch(room.channelId);
              if (stopping) return;
              stage = "message_edit";
              // Editing our own message does not require Read Message History.
              await channel.messages.edit(room.messageId, payload);
            }
            if (stopping) return;
            const acknowledged = discord.acknowledge(room);
            if (acknowledged && !module.isOpen(room)) editors.delete(key);
          } catch (error) {
            if (stopping) return;
            // Deleted messages cannot be recovered; transient failures are retried after restart too.
            if ([10003, 10008].includes(error.code)) discord.discard(id);
            logger?.warn(
              {
                code: error.code || error.name,
                stage,
                game: module.id,
                roomId: id,
                channelId: room.channelId,
                messageId: room.messageId,
                hint: [50001, 50013].includes(error.code)
                  ? "Grant the bot View Channel in this channel and check thread access."
                  : undefined,
              },
              "could not update web game Discord board",
            );
          }
        }
      }
    } finally {
      busy = false;
      if (syncAgain && !stopping) {
        syncAgain = false;
        queueMicrotask(() =>
          syncMessages(client, logger).catch((error) =>
            logger?.warn(
              { code: error.code || error.name },
              "web game message sync failed",
            ),
          ),
        );
      }
    }
  }
  function start(client, logger) {
    if (startPending) return startPending;
    startPending = (async () => {
      const config = readConfig();
      if (!config.enabled) return;
      const candidate = createWebServer({
        games,
        legacyGame,
        config,
        logger,
        webhooks,
      });
      try {
        await new Promise((resolve, reject) => {
          candidate.server.once("error", reject);
          candidate.server.listen(config.port, config.host, resolve);
        });
      } catch (error) {
        await candidate.stop();
        throw error;
      }
      if (stopping) {
        await candidate.stop();
        return;
      }
      web = candidate;
      for (const module of games) module.discord?.restore();
      onChange = () =>
        syncMessages(client, logger).catch((error) =>
          logger?.warn(
            { code: error.code || error.name },
            "web game message sync failed",
          ),
        );
      for (const module of games) module.store.events.on("changed", onChange);
      candidate.server.on("error", (error) =>
        logger?.error({ code: error.code }, "web game server error"),
      );
      logger?.info(
        { host: config.host, port: config.port, publicUrl: config.origin },
        "web games ready",
      );
      timer = setInterval(
        () =>
          syncMessages(client, logger).catch((error) =>
            logger?.error(
              { code: error.code || error.name },
              "web game maintenance failed",
            ),
          ),
        5000,
      );
      timer.unref();
      syncMessages(client, logger).catch((error) =>
        logger?.error(
          { code: error.code || error.name },
          "web game maintenance failed",
        ),
      );
    })();
    return startPending;
  }
  async function stop() {
    stopping = true;
    if (onChange)
      for (const module of games) module.store.events.off("changed", onChange);
    if (timer) clearInterval(timer);
    if (startPending) await startPending.catch(() => {});
    // start may have completed while shutdown was awaiting it.
    if (timer) clearInterval(timer);
    const current = web;
    web = null;
    if (current) await current.stop();
    editors.clear();
  }
  function bindInteraction(gameId, roomId, interaction) {
    const room = game(gameId).store.get(roomId);
    if (!room?.messageId || typeof interaction.editReply !== "function") return;
    editors.set(keyFor(gameId, roomId), {
      messageId: room.messageId,
      expires:
        (interaction.createdTimestamp || Date.now()) + INTERACTION_EDIT_MS,
      edit: (payload) => interaction.editReply(payload),
    });
  }
  function issueTicket(gameId, roomId, userId) {
    if (!web)
      throw Object.assign(
        new Error(
          "Web trò chơi chưa được bật. Chủ bot cần cấu hình WEB_ENABLED và WEB_PUBLIC_URL rồi khởi động lại bot.",
        ),
        { code: "WEB_DISABLED" },
      );
    return web.issueTicket(gameId, roomId, userId);
  }
  function roomUrl(gameId, id) {
    game(gameId);
    return web
      ? web.roomUrl(gameId, id)
      : `${readConfig().origin || "http://127.0.0.1:3000"}/${gameId}/room/${id}`;
  }
  function confirmPairing(gameId, id, userId, code) {
    if (!web)
      throw Object.assign(new Error("Web trò chơi chưa được bật."), {
        code: "WEB_DISABLED",
      });
    return web.confirmPairing(gameId, id, userId, code);
  }

  return {
    game,
    start,
    stop,
    issueTicket,
    roomUrl,
    confirmPairing,
    isAvailable: (gameId) => Boolean(web) && registry.has(gameId),
    syncMessages,
    bindInteraction,
  };
}

module.exports = { createRuntime };
