"use strict";

const { db } = require("../db");
const { createStore } = require("./store");
const { createWebServer } = require("./http");
const { readConfig } = require("./config");
const { roomPayload } = require("./discord");
const store = createStore(db);
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
    store.sweep();
    const rows = db
      .prepare(
        "SELECT id FROM caro_rooms WHERE ui_dirty=1 AND json_extract(data_json,'$.messageId') IS NOT NULL LIMIT 10",
      )
      .all();
    for (const { id } of rows) {
      const room = store.get(id);
      if (!room.messageId) continue;
      try {
        const channel = await client.channels.fetch(room.channelId);
        if (stopping) return;
        // Editing our own message does not require Read Message History.
        await channel.messages.edit(
          room.messageId,
          roomPayload(room, roomUrl(room.id)),
        );
        if (stopping) return;
        db.prepare(
          "UPDATE caro_rooms SET ui_dirty=0 WHERE id=? AND data_json=?",
        ).run(id, JSON.stringify(room));
      } catch (error) {
        if (stopping) return;
        // Deleted messages cannot be recovered; transient failures are retried after restart too.
        if ([10003, 10008].includes(error.code))
          db.prepare("UPDATE caro_rooms SET ui_dirty=0 WHERE id=?").run(id);
        logger?.warn(
          { code: error.code || error.name },
          "could not update caro Discord board",
        );
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
            "caro message sync failed",
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
    const candidate = createWebServer({ store, config, logger });
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
    // Upgrade active lobbies created before direct room links were introduced.
    db.prepare(
      "UPDATE caro_rooms SET ui_dirty=1 WHERE status IN ('waiting','playing') AND json_extract(data_json,'$.messageId') IS NOT NULL",
    ).run();
    onChange = () =>
      syncMessages(client, logger).catch((error) =>
        logger?.warn(
          { code: error.code || error.name },
          "caro message sync failed",
        ),
      );
    store.events.on("changed", onChange);
    candidate.server.on("error", (error) =>
      logger?.error({ code: error.code }, "caro web server error"),
    );
    logger?.info(
      { host: config.host, port: config.port, publicUrl: config.origin },
      "caro web ready",
    );
    timer = setInterval(
      () =>
        syncMessages(client, logger).catch((error) =>
          logger?.error(
            { code: error.code || error.name },
            "caro maintenance failed",
          ),
        ),
      5000,
    );
    timer.unref();
    syncMessages(client, logger).catch((error) =>
      logger?.error(
        { code: error.code || error.name },
        "caro maintenance failed",
      ),
    );
  })();
  return startPending;
}
async function stop() {
  stopping = true;
  if (onChange) store.events.off("changed", onChange);
  if (timer) clearInterval(timer);
  if (startPending) await startPending.catch(() => {});
  // start may have completed while shutdown was awaiting it.
  if (timer) clearInterval(timer);
  const current = web;
  web = null;
  if (current) await current.stop();
}
function issueTicket(roomId, userId) {
  if (!web)
    throw Object.assign(
      new Error(
        "Web caro chưa được bật. Chủ bot cần cấu hình CARO_WEB_ENABLED và CARO_PUBLIC_URL trên VM.",
      ),
      { code: "WEB_DISABLED" },
    );
  return web.issueTicket(roomId, userId);
}
function roomUrl(id) {
  return web
    ? web.roomUrl(id)
    : `${readConfig().origin || "http://127.0.0.1:3000"}/room/${id}`;
}
function confirmPairing(id, userId, code) {
  if (!web)
    throw Object.assign(new Error("Web caro chưa được bật."), {
      code: "WEB_DISABLED",
    });
  return web.confirmPairing(id, userId, code);
}

module.exports = {
  store,
  start,
  stop,
  issueTicket,
  roomUrl,
  confirmPairing,
  isAvailable: () => Boolean(web),
  syncMessages,
};
