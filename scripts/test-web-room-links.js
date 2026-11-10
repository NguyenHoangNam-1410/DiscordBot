"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
const { createWebServer } = require("../src/webGames/http");
const { createRuntime } = require("../src/webGames/runtime");
const { createRoomIdentity } = require("../src/webGames/roomLinks");
const ids = [
  "caro",
  "walls",
  "battleship",
  "dots",
  "blokus",
  "mecung",
  "coquay",
  "santorini",
  "cothu",
  "oanquan",
  "cotuong",
];
const fixtures = new Map();
let web;
async function main() {
  await require("../src/cotuong/engine").initialize();
  const games = ids.map((id) => {
    const store = require("../src/" + id + "/store").createStore(db);
    const host = { id: id + "-host", username: "Chủ phòng" };
    const old = store.create({
      guildId: id + "-old",
      channelId: "c",
      user: host,
    });
    delete old.roomCode;
    db.prepare("UPDATE " + id + "_rooms SET data_json=? WHERE id=?").run(
      JSON.stringify(old),
      old.id,
    );
    const room = store.create({
      guildId: id + "-new",
      channelId: "c",
      user: host,
    });
    fixtures.set(id, { store, host, old, room });
    return require("../src/" + id + "/webGame").createGame({ store, db });
  });
  // The visible code is collision-checked against both new and historical UUID prefixes.
  const old = fixtures.get("caro").old;
  const available = randomUUID();
  let attempts = 0;
  const collision = old.id.slice(0, 8) + randomUUID().slice(8);
  const identity = createRoomIdentity(db, "caro", () =>
    ++attempts === 1 ? collision : available,
  );
  assert.equal(attempts, 2);
  assert.equal(identity.id, available);
  assert.throws(
    () => createRoomIdentity(db, "caro", () => collision),
    /Không thể tạo mã phòng/,
  );
  const config = { origin: "", secure: false };
  web = createWebServer({ games, config, legacyGame: "caro" });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  const runtime = createRuntime({ games });
  async function request(route, data, cookie) {
    const response = await fetch(config.origin + route, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data
          ? { Origin: config.origin, "Content-Type": "application/json" }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  for (const [id, { store, host, old, room }] of fixtures) {
    assert.match(room.id, /^[a-f0-9-]{36}$/);
    assert.match(room.roomCode, /^[A-F0-9]{8}$/);
    assert.equal(room.roomCode, room.id.slice(0, 8).toUpperCase());
    assert.equal(store.snapshot(room, null).roomCode, room.roomCode);
    assert.equal(store.resolveId(room.roomCode.toLowerCase()), room.id);
    assert.equal(store.resolveId(old.id.slice(0, 8)), null);
    assert.equal(store.resolveId("not-a-code"), null);
    const short = "/" + id + "/room/" + room.roomCode;
    assert.equal(web.roomUrl(id, room.id), config.origin + short);
    assert(runtime.roomUrl(id, room.id).endsWith(short));
    assert(web.roomUrl(id, old.id).endsWith("/room/" + old.id));
    assert(runtime.roomUrl(id, old.id).endsWith("/room/" + old.id));
    for (const ref of [
      room.roomCode,
      room.roomCode.toLowerCase(),
      room.id,
      old.id,
    ]) {
      const page = await fetch(config.origin + "/" + id + "/room/" + ref);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type"), /text\/html/);
      assert.equal(page.headers.get("set-cookie"), null);
      await page.text();
    }
    const oldCode = await fetch(
      config.origin + "/" + id + "/room/" + old.id.slice(0, 8),
    );
    assert.equal(oldCode.status, 404);
    await oldCode.text();
    const api = "/api/games/" + id;
    let view = await request(api + "/state?room=" + room.roomCode);
    assert.equal(view.status, 200);
    assert.equal(view.data.id, room.id);
    assert.equal(view.data.me, null);
    assert.equal(
      (await request(api + "/state?room=" + old.id.slice(0, 8))).status,
      404,
    );
    assert.equal(
      (await request(api + "/state?room=%27%20OR%201=1")).status,
      404,
    );
    const pair = await request(api + "/pair", { roomId: room.roomCode });
    assert.equal(pair.status, 200);
    assert.throws(
      () => web.confirmPairing(id, room.roomCode, "stranger", pair.data.code),
      (e) => e.httpStatus === 403,
    );
    web.confirmPairing(id, room.roomCode, host.id, pair.data.code);
    const paired = await request(api + "/pair/status", {
      roomId: room.roomCode.toLowerCase(),
      pairingToken: pair.data.pairingToken,
    });
    assert.equal(paired.status, 200);
    assert.equal(paired.data.roomId, room.id);
    view = await request(
      api + "/state?room=" + room.roomCode,
      undefined,
      paired.cookie,
    );
    assert.equal(view.data.me, "X");
    const ticket = new URL(
      web.issueTicket(id, room.roomCode, host.id),
    ).hash.slice("#ticket=".length);
    const logged = await request(api + "/login", { ticket });
    assert.equal(logged.data.roomId, room.id);
    assert.equal(
      (await request(api + "/leave", { roomId: room.roomCode })).status,
      401,
    );
    const controller = new AbortController();
    const stream = await fetch(
      config.origin + api + "/events?room=" + room.roomCode,
      { headers: { Cookie: logged.cookie }, signal: controller.signal },
    );
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    const event = new TextDecoder().decode((await reader.read()).value);
    assert(event.includes(room.id));
    const ended = await request(
      api + "/leave",
      { roomId: room.roomCode },
      logged.cookie,
    );
    assert.equal(ended.status, 200);
    assert.equal(ended.data.id, room.id);
    const changed = new TextDecoder().decode((await reader.read()).value);
    assert(changed.includes('"reason":"cancelled"'));
    controller.abort();
    assert.equal(store.get(room.id).roomCode, room.roomCode);
    assert.equal(store.get(old.id).roomCode, undefined);
  }
  const legacy = await fetch(
    config.origin + "/room/" + fixtures.get("caro").old.id,
    { redirect: "manual" },
  );
  assert.equal(legacy.status, 302);
  assert(legacy.headers.get("location").endsWith(fixtures.get("caro").old.id));
  await legacy.text();
  const foreignCode = fixtures.get("caro").room.roomCode;
  assert.equal(
    (await request("/api/games/walls/state?room=" + foreignCode)).status,
    404,
  );
  await web.stop();
  // Reconstruct all stores and the HTTP server from persisted JSON, without alias backfill.
  const restored = ids.map((id) =>
    require("../src/" + id + "/webGame").createGame({
      store: require("../src/" + id + "/store").createStore(db),
      db,
    }),
  );
  web = createWebServer({ games: restored, config });
  await new Promise((resolve) => web.server.listen(0, "127.0.0.1", resolve));
  config.origin = "http://127.0.0.1:" + web.server.address().port;
  for (const [id, { room, old }] of fixtures) {
    const view = await request(
      "/api/games/" + id + "/state?room=" + room.roomCode,
    );
    assert.equal(view.status, 200);
    assert.equal(view.data.id, room.id);
    assert.equal(view.data.roomCode, room.roomCode);
    assert(web.roomUrl(id, old.id).endsWith(old.id));
  }
  console.log(
    JSON.stringify({
      ok: true,
      roomLinks:
        "11 games: new-room codes, unchanged legacy URLs, indexed collision retry, lowercase lookup, runtime/Discord links, login, pairing, authorization, SSE updates, actions, restart persistence",
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await web?.stop();
    db.close();
  });
