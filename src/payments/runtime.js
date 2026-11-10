"use strict";

const { readConfig } = require("./config");
const { createStore } = require("./store");
const { createHandler, ENDPOINT } = require("./casso");
const ui = require("./discord");

function createRuntime({ db, read = readConfig, now = Date.now }) {
  const store = createStore(db, { now });
  const editors = new Map();
  let config = null,
    timer = null,
    client = null,
    logger = null,
    busy = false,
    stopping = false;
  async function sync() {
    if (!config?.enabled || busy || stopping) return;
    busy = true;
    try {
      store.expire();
      for (const [id, e] of editors) if (e.expires <= now()) editors.delete(id);
      for (const order of store.pendingUI()) {
        if (stopping) break;
        try {
          const editor = editors.get(order.id);
          let edited = false;
          if (editor) {
            try {
              await editor.edit(ui.payload(order));
              edited = true;
            } catch (error) {
              if (![10015, 10062, 50027].includes(error.code)) throw error;
              editors.delete(order.id);
            }
          }
          if (!edited) {
            const channel = await client.channels.fetch(order.channel_id);
            if (stopping) break;
            await channel.messages.edit(order.message_id, ui.payload(order));
          }
          if (stopping) break;
          store.acknowledge(order);
        } catch (error) {
          if (stopping) break;
          if ([10003, 10008].includes(error.code)) store.acknowledge(order);
          else store.retry(order);
          logger?.warn(
            { code: error.code || error.name, orderId: order.id },
            "could not update bank receipt Discord message",
          );
        }
      }
    } finally {
      busy = false;
    }
  }
  function start(discordClient, log, webAvailable) {
    if (timer) return;
    const next = read();
    if (!next.enabled) return;
    if (!webAvailable)
      throw new Error(
        "Nhận chuyển khoản cần bật WEB_ENABLED và WEB_PUBLIC_URL HTTPS.",
      );
    config = next;
    client = discordClient;
    logger = log;
    stopping = false;
    timer = setInterval(
      () =>
        sync().catch((error) =>
          logger?.error(
            { code: error.code || error.name },
            "bank receipt sync failed",
          ),
        ),
      3000,
    );
    timer.unref();
    sync().catch((error) =>
      logger?.error(
        { code: error.code || error.name },
        "bank receipt startup sync failed",
      ),
    );
  }
  return {
    endpoint: ENDPOINT,
    handle: createHandler({
      getConfig: () => (stopping ? null : config),
      getStore: () => store,
      logger: { error: (...args) => logger?.error(...args) },
    }),
    start,
    sync,
    store,
    config: () => config,
    ready: () => Boolean(config?.enabled && !stopping),
    bind(order, interaction, message) {
      store.bindMessage(order.id, message.id);
      editors.set(order.id, {
        expires: (interaction.createdTimestamp || now()) + 14.5 * 60_000,
        edit: (p) => interaction.editReply(p),
      });
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = null;
      // A currently running Discord call completes before the shared database is closed.
      const deadline = Date.now() + 10_000;
      while (busy && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      config = null;
      editors.clear();
    },
  };
}
let instance;
function runtime() {
  instance ||= createRuntime({ db: require("../db").db });
  return instance;
}
module.exports = { createRuntime, runtime };
