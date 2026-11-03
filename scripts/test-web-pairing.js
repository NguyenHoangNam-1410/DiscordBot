"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const hub = require("../src/webGames");
const { createWebServer } = require("../src/webGames/http");
const modules = ["caro", "walls", "dots", "blokus", "mecung"].map((game) =>
  hub.game(game),
);
const alice = { id: "alice", username: "Alice" },
  bob = { id: "bob", username: "Bob" };
let serial = 0,
  web,
  clock = Date.now();

function fixture(game) {
  const store = hub.game(game).store;
  return store.create({
    guildId: `pair-${++serial}`,
    channelId: "channel",
    user: alice,
  });
}
function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    value: "h",
    open: false,
    style: { setProperty() {} },
    dataset: {},
    classList: { toggle() {} },
    events: {},
    children: [],
    replaceChildren(...children) {
      this.children = children;
    },
    append(child) {
      this.children.push(child);
    },
    setAttribute() {},
    addEventListener(name, handler) {
      this.events[name] = handler;
    },
    close() {
      this.open = false;
    },
    showModal() {
      this.open = true;
    },
    click() {
      return this.events.click?.();
    },
  };
}

async function main() {
  const config = { origin: "", secure: false };
  web = createWebServer({
    games: modules,
    legacyGame: "caro",
    config,
    now: () => clock,
  });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = `http://127.0.0.1:${web.server.address().port}`;
  async function request(game, route, data, cookie) {
    const response = await fetch(
      `${config.origin}/api/games/${game}/${route}`,
      {
        method: data ? "POST" : "GET",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data
            ? { Origin: config.origin, "Content-Type": "application/json" }
            : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(5000),
      },
    );
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  function browser(game, room, jar = new Map(), storage = new Map()) {
    const elements = new Map(),
      timers = new Map(),
      streams = [];
    let timerId = 0,
      clientClock = Date.now();
    const client = {
      failState: false,
      dropStatus: false,
      jar,
      elements,
      timers,
      streams,
      storage,
    };
    class ClientDate extends Date {
      static now() {
        return clientClock;
      }
    }
    class Stream {
      constructor(url) {
        this.url = url;
        this.closed = false;
        streams.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    const sandbox = {
      document: {
        getElementById(id) {
          if (!elements.has(id)) {
            const node = element();
            if (id === "inventory-side") node.value = "X";
            elements.set(id, node);
          }
          return elements.get(id);
        },
        createElement: element,
        addEventListener() {},
      },
      window: { addEventListener() {} },
      matchMedia: () => ({ matches: true, addEventListener() {} }),
      location: { hash: "", pathname: "/" },
      history: { replaceState() {} },
      Date: ClientDate,
      URLSearchParams,
      AbortSignal,
      EventSource: Stream,
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      setInterval() {},
      setTimeout(fn, ms) {
        const id = ++timerId;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
      fetch: async (url, options = {}) => {
        if (
          client.failState &&
          url.includes("/state?") &&
          jar.has("web_game_session")
        ) {
          client.failState = false;
          throw Error("Mất phản hồi tải trạng thái thử nghiệm");
        }
        const response = await fetch(config.origin + url, {
          ...options,
          headers: {
            ...options.headers,
            Origin: config.origin,
            Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          },
        });
        if (client.dropStatus && url.endsWith("/pair/status")) {
          client.dropStatus = false;
          await response.arrayBuffer();
          throw Error("Mất phản hồi xác nhận thử nghiệm");
        }
        const cookie = response.headers.get("set-cookie")?.split(";")[0];
        if (cookie) {
          const split = cookie.indexOf("=");
          jar.set(cookie.slice(0, split), cookie.slice(split + 1));
        }
        return response;
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, `../src/${game}/public/app.js`),
        "utf8",
      ),
      sandbox,
    );
    sandbox.next = hub.game(game).store.snapshot(room, null);
    vm.runInContext(
      `roomId=${JSON.stringify(room.id)}; accept(next); subscribe(); connection(true)`,
      sandbox,
    );
    client.sandbox = sandbox;
    client.start = () => elements.get("connect-player").events.click();
    client.poll = () => vm.runInContext("pollPairing()", sandbox);
    client.read = (expression) => vm.runInContext(expression, sandbox);
    client.expire = () => {
      clientClock += 5 * 60_000 + 1;
    };
    return client;
  }
  async function confirmThroughDiscord(game, room, code) {
    const command = require(`../src/commands/${game}`),
      runtime = require(`../src/${game}/runtime`);
    const available = runtime.isAvailable,
      confirm = runtime.confirmPairing,
      replies = [];
    runtime.isAvailable = () => true;
    runtime.confirmPairing = (id, user, input) =>
      web.confirmPairing(game, id, user, input);
    try {
      const routed =
        await require("../src/componentRouter").routeComponentInteraction({
          customId: `${game}:confirm:${room.id}`,
          guildId: room.guildId,
          channelId: room.channelId,
          user: alice,
          fields: { getTextInputValue: () => code },
          isButton: () => false,
          isStringSelectMenu: () => false,
          isModalSubmit: () => true,
          deferReply: async () => {},
          editReply: async (payload) => replies.push(payload),
        });
      assert.equal(routed, true);
      assert.match(replies[0].content, /Đã xác nhận mã/);
    } finally {
      runtime.isAvailable = available;
      runtime.confirmPairing = confirm;
    }
  }

  for (const game of ["caro", "walls", "dots", "blokus", "mecung"]) {
    // Reproduce "Discord success, web waiting": private state request fails after claim succeeds.
    const room = fixture(game),
      client = browser(game, room, new Map([["caro_session", "x".repeat(43)]]));
    await client.start();
    await confirmThroughDiscord(
      game,
      room,
      client.elements.get("pair-code").textContent,
    );
    const anonymous = client.streams[0];
    client.failState = true;
    await client.poll();
    assert.equal(
      client.read("pairing"),
      true,
      "a transient failure must keep retrying",
    );
    assert.match(client.elements.get("pair-status").textContent, /tự thử lại/);
    assert.equal(anonymous.closed, true);
    await client.poll();
    assert.equal(client.read("state.me"), "X");
    assert.equal(client.read("pairing"), false);
    assert.equal(client.read("pairingToken"), null);
    assert.equal(client.elements.get("pair-panel").hidden, true);
    anonymous.onmessage({
      data: JSON.stringify({
        ...hub.game(game).store.snapshot(room, null),
        version: 999,
      }),
    });
    assert.equal(
      client.read("state.me"),
      "X",
      "late anonymous events cannot downgrade the player",
    );
    const latest = client.streams.at(-1);
    latest.onopen();
    assert.equal(client.read("connected"), true);

    // Even losing the first successful HTTP response/cookie does not consume the challenge.
    const droppedRoom = fixture(game),
      dropped = browser(game, droppedRoom);
    await dropped.start();
    const code = dropped.elements.get("pair-code").textContent;
    await confirmThroughDiscord(game, droppedRoom, code);
    await confirmThroughDiscord(game, droppedRoom, code); // Same player can retry a lost Discord acknowledgement.
    dropped.dropStatus = true;
    await dropped.poll();
    assert.equal(dropped.read("pairing"), true);
    await dropped.poll();
    assert.equal(dropped.read("state.me"), "X");

    const expiring = browser(game, fixture(game));
    await expiring.start();
    expiring.expire();
    await expiring.poll();
    assert.equal(expiring.read("pairing"), false);
    assert.equal(expiring.read("pairVisible"), true);
    assert.match(expiring.elements.get("pair-status").textContent, /hết hạn/);
    clock += 60_001; // Respect the real per-user confirmation budget across independent scenarios.

    const reloadRoom = fixture(game),
      original = browser(game, reloadRoom);
    await original.start();
    await confirmThroughDiscord(
      game,
      reloadRoom,
      original.elements.get("pair-code").textContent,
    );
    const reloaded = browser(game, reloadRoom, original.jar, original.storage);
    reloaded.sandbox.location.pathname = `/${game}/room/${reloadRoom.id}`;
    await reloaded.read("init()");
    assert.equal(reloaded.read("pairing"), true);
    await reloaded.poll();
    assert.equal(reloaded.read("state.me"), "X");
    assert.equal(
      original.storage.size,
      0,
      "completed challenge is removed from the tab storage",
    );
    clock += 60_001;
  }

  // Two same-browser tabs, including different games, retain their own codes despite a shared cookie jar.
  const jar = new Map(),
    tabA = browser("caro", fixture("caro"), jar),
    tabB = browser("walls", fixture("walls"), jar);
  await tabA.start();
  const tokenA = tabA.read("pairingToken"),
    codeA = tabA.elements.get("pair-code").textContent;
  await tabB.start();
  const codeB = tabB.elements.get("pair-code").textContent;
  const roomA = hub.game("caro").store.get(tabA.read("roomId")),
    roomB = hub.game("walls").store.get(tabB.read("roomId"));
  await confirmThroughDiscord("caro", roomA, codeA);
  await confirmThroughDiscord("walls", roomB, codeB);
  await tabA.poll();
  await tabB.poll();
  assert.equal(tabA.read("state.me"), "X");
  assert.equal(tabB.read("state.me"), "X");
  const reused = await request("caro", "pair/status", {
    pairingToken: tokenA,
    roomId: roomA.id,
  });
  assert.equal(reused.status, 200);
  assert.equal(reused.data.connected, true);
  const oldCookieFirst = `caro_session=${"x".repeat(43)}; ${reused.cookie}`;
  assert.equal(
    (await request("caro", `state?room=${roomA.id}`, undefined, oldCookieFirst))
      .data.me,
    "X",
    "an expired legacy cookie must not mask the current session",
  );
  assert.equal(
    (
      await request(
        "caro",
        `state?room=${roomA.id}`,
        undefined,
        reused.cookie.replace("web_game_session=", "caro_session="),
      )
    ).data.me,
    "X",
    "valid legacy-only sessions still work",
  );
  const reusedAgain = await request("caro", "pair/status", {
    pairingToken: tokenA,
    roomId: roomA.id,
  });
  assert.equal(
    reusedAgain.cookie,
    reused.cookie,
    "retries reuse the same session",
  );
  assert.equal(
    (
      await request("walls", "pair/status", {
        pairingToken: tokenA,
        roomId: roomA.id,
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await request("caro", "pair/status", {
        pairingToken: tokenA,
        roomId: roomB.id,
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await request("caro", "pair/status", {
        pairingToken: codeA,
        roomId: roomA.id,
      })
    ).status,
    410,
    "the visible code alone cannot claim a browser session",
  );
  hub.game("caro").store.join(roomA.id, bob);
  assert.throws(
    () => web.confirmPairing("caro", roomA.id, bob.id, codeA),
    (error) => error.code === "PAIR_INVALID",
  );

  // Per-challenge polling avoids one shared reverse-proxy IP starving other players.
  const pending = [];
  for (let i = 0; i < 4; i++) {
    const room = fixture("walls");
    const pair = await request("walls", "pair", { roomId: room.id });
    assert.equal(pair.status, 200);
    pending.push({ room, token: pair.data.pairingToken });
  }
  for (const item of pending)
    for (let i = 0; i < 80; i++) {
      const polled = await request("walls", "pair/status", {
        pairingToken: item.token,
        roomId: item.room.id,
      });
      assert.equal(polled.status, 200);
      assert.equal(polled.data.connected, false);
    }
  console.log(
    JSON.stringify({
      ok: true,
      webPairing:
        "Discord-to-browser, transient/lost replies, per-tab proof, safe retries, expiry, proxy polling, stale streams",
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (web) await web.stop();
    if (db.open) db.close();
  });
