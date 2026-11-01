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

async function syncMessages(client, logger) {
  if (busy || stopping) return;
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
        const message = await channel.messages.fetch(room.messageId);
        if (stopping) return;
        await message.edit(roomPayload(room));
        if (stopping) return;
        db.prepare(
          "UPDATE caro_rooms SET ui_dirty=0 WHERE id=? AND status=?",
        ).run(id, room.status);
      } catch (error) {
        if (stopping) return;
        // Deleted messages cannot be recovered; transient failures are retried after restart too.
        if ([10003, 10008, 50001, 50013].includes(error.code))
          db.prepare("UPDATE caro_rooms SET ui_dirty=0 WHERE id=?").run(id);
        logger?.warn(
          { code: error.code || error.name },
          "could not update caro Discord board",
        );
      }
    }
  } finally {
    busy = false;
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

module.exports = {
  store,
  start,
  stop,
  issueTicket,
  isAvailable: () => Boolean(web),
  syncMessages,
};
