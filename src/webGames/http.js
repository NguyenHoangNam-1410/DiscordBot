"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createPublicPages } = require("./publicPages");
const { roomReference } = require("./roomLinks");

const ROOM = /^\/room\/([a-f0-9-]{36}|[a-fA-F0-9]{8})$/;
const MAX_BODY = 2048;
const TICKET_MS = 5 * 60_000;
const SESSION_MS = 12 * 60 * 60_000;
const token = () => randomBytes(32).toString("base64url");

function createWebServer({
  games,
  legacyGame = null,
  config,
  logger,
  now = Date.now,
  webhooks = [],
}) {
  const webhookRoutes = new Map(
    webhooks.map((hook) => [hook.path, hook.handle]),
  );
  if (
    webhookRoutes.size !== webhooks.length ||
    webhooks.some(
      (hook) =>
        !/^\/api\/bank\/[a-z]+$/.test(hook.path) ||
        typeof hook.handle !== "function",
    )
  )
    throw new Error("Invalid bank webhook route");
  const registry = new Map();
  for (const game of games) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(game.id) || registry.has(game.id))
      throw new Error("Invalid or duplicate web game ID");
    registry.set(game.id, game);
  }
  if (legacyGame && !registry.has(legacyGame))
    throw new Error("Unknown legacy web game");
  function getGame(id) {
    const game = registry.get(id);
    if (!game)
      throw Object.assign(new Error("Không tìm thấy trò chơi."), {
        httpStatus: 404,
      });
    return game;
  }
  const tickets = new Map(),
    pairings = new Map(),
    sessions = new Map(),
    limits = new Map(),
    streams = new Map();
  const bgmRoot = path.resolve(__dirname, "../../assets/bgm");
  const bgmTypes = {
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
  };
  const bgm = new Map();
  if (fs.existsSync(bgmRoot))
    for (const file of fs.readdirSync(bgmRoot, { withFileTypes: true })) {
      const type = bgmTypes[path.extname(file.name).toLowerCase()];
      if (file.isFile() && type)
        bgm.set("/assets/bgm/" + encodeURIComponent(file.name), {
          file: path.join(bgmRoot, file.name),
          type,
        });
    }
  const assets = new Map();
  for (const [file, type] of [
    ["mobile-ui.js", "text/javascript; charset=utf-8"],
    ["mobile-ui.css", "text/css; charset=utf-8"],
    ["feedback.js", "text/javascript; charset=utf-8"],
    ["bgm.js", "text/javascript; charset=utf-8"],
    ["feedback.css", "text/css; charset=utf-8"],
    ["pairing-ui.js", "text/javascript; charset=utf-8"],
    ["pairing-ui.css", "text/css; charset=utf-8"],
    ["game-catalog.js", "text/javascript; charset=utf-8"],
    ["rules-ui.js", "text/javascript; charset=utf-8"],
    ["rules-ui.css", "text/css; charset=utf-8"],
  ]) {
    assets.set("/" + file, {
      type,
      data: fs.readFileSync(path.join(__dirname, "public", file)),
    });
  }
  assets.set("/players.js", {
    type: "text/javascript; charset=utf-8",
    data: fs.readFileSync(path.join(__dirname, "public/players.js")),
  });
  assets.set("/players.css", {
    type: "text/css; charset=utf-8",
    data: fs.readFileSync(path.join(__dirname, "public/players.css")),
  });
  assets.set("/board-ui.js", {
    type: "text/javascript; charset=utf-8",
    data: fs.readFileSync(path.join(__dirname, "public/board-ui.js")),
  });
  assets.set("/board-ui.css", {
    type: "text/css; charset=utf-8",
    data: fs.readFileSync(path.join(__dirname, "public/board-ui.css")),
  });
  for (const game of games) {
    for (const [url, [file, type]] of [
      ["/", ["index.html", "text/html; charset=utf-8"]],
      ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
      ["/style.css", ["style.css", "text/css; charset=utf-8"]],
    ]) {
      const asset = {
        type,
        data:
          url === "/"
            ? Buffer.from(
                fs
                  .readFileSync(path.join(game.publicDir, file), "utf8")
                  .replace(
                    "</head>",
                    '<script src="/bgm.js" defer></script></head>',
                  ),
              )
            : fs.readFileSync(path.join(game.publicDir, file)),
      };
      assets.set(`/${game.id}${url}`, asset);
      if (url === "/") assets.set(`/${game.id}`, asset);
      if (game.id === legacyGame && url !== "/") assets.set(url, asset);
    }
  }
  const publicPages = createPublicPages(games);
  function prune(map) {
    for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
  }
  function allowed(key, count, ms) {
    const old = limits.get(key);
    const limit =
      old && old.expires > now() ? old : { count: 0, expires: now() + ms };
    limit.count++;
    limits.set(key, limit);
    return limit.count <= count;
  }
  function issueTicket(gameId, roomId, userId) {
    const { store, errors } = getGame(gameId);
    const room = findRoom(getGame(gameId), roomId);
    if (!room || !store.seat(room, userId))
      throw Object.assign(
        new Error(
          errors.NOT_PLAYER || "Bạn không phải người chơi của phòng này.",
        ),
        {
          code: "NOT_PLAYER",
        },
      );
    roomId = room.id;
    prune(tickets);
    for (const [key, value] of tickets)
      if (
        value.gameId === gameId &&
        value.userId === userId &&
        value.roomId === roomId
      )
        tickets.delete(key);
    if (tickets.size >= 5000)
      throw new Error("Quá nhiều lượt mở bàn. Hãy thử lại sau.");
    const ticket = token();
    tickets.set(ticket, { gameId, roomId, userId, expires: now() + TICKET_MS });
    // Fragment is never sent in HTTP requests, reverse-proxy logs or Referer headers.
    return `${config.origin}/${gameId}/#ticket=${ticket}`;
  }
  function json(res, status, data) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      throw Object.assign(new Error("Yêu cầu JSON không hợp lệ."), {
        httpStatus: 415,
      });
    let text = "",
      length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > MAX_BODY)
        throw Object.assign(new Error("Yêu cầu quá lớn."), { httpStatus: 413 });
      text += chunk.toString("utf8");
    }
    try {
      const result = JSON.parse(text);
      if (!result || Array.isArray(result) || typeof result !== "object")
        throw Error();
      return result;
    } catch {
      throw Object.assign(new Error("Dữ liệu JSON không hợp lệ."), {
        httpStatus: 400,
      });
    }
  }
  function authenticate(req, optional = false) {
    // Browser cookie order is not an authentication preference. Old caro cookies may precede ours.
    for (const name of ["web_game_session", "caro_session"]) {
      const sid = cookieValue(req, name);
      const session = sessions.get(sid);
      if (session && session.expires > now()) return { sid, ...session };
      sessions.delete(sid);
    }
    if (optional) return { sid: null, userId: null };
    throw Object.assign(
      new Error("Phiên vào bàn đã hết hạn. Hãy mở lại từ nút trong Discord."),
      { httpStatus: 401 },
    );
  }
  function findRoom(game, reference) {
    const id =
      typeof reference === "string" && /^[a-f0-9-]{36}$/.test(reference)
        ? reference
        : game.store.resolveId?.(reference);
    return id ? game.store.get(id) : null;
  }
  function roomFor(game, id, userId) {
    const { store } = game;
    const room = findRoom(game, id);
    if (!room || !store.seat(room, userId))
      throw Object.assign(new Error("Bạn không có quyền vào phòng này."), {
        httpStatus: 403,
      });
    return room;
  }
  async function handle(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self'; img-src 'self' https://cdn.discordapp.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    const url = new URL(req.url, "http://localhost");
    if (["GET", "HEAD"].includes(req.method) && url.pathname === "/api/bgm") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({ tracks: [...bgm.keys()] }),
      );
    }
    if (["GET", "HEAD"].includes(req.method) && bgm.has(url.pathname)) {
      const track = bgm.get(url.pathname),
        size = fs.statSync(track.file).size;
      let start = 0,
        end = size - 1;
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) {
          res.writeHead(416, { "Content-Range": "bytes */" + size });
          return res.end();
        }
        if (range[1]) {
          start = Number(range[1]);
          end = range[2] ? Math.min(Number(range[2]), end) : end;
        } else start = Math.max(0, size - Number(range[2]));
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        ) {
          res.writeHead(416, { "Content-Range": "bytes */" + size });
          return res.end();
        }
      }
      const headers = {
        "Content-Type": track.type,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      };
      if (req.headers.range)
        headers["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
      res.writeHead(req.headers.range ? 206 : 200, headers);
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(track.file, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      return stream.pipe(res);
    }
    // Provider callbacks authenticate their signed payload; browser origin checks stay intact.
    if (webhookRoutes.has(url.pathname)) {
      if (!allowed(`bank:${req.socket.remoteAddress}`, 300, 60_000))
        return json(res, 429, { success: false });
      return webhookRoutes.get(url.pathname)(req, res);
    }
    if (req.method === "GET" && url.pathname === "/healthz")
      return json(res, 200, { ok: true });
    if (["GET", "HEAD"].includes(req.method)) {
      if (["/terms/", "/privacy/"].includes(url.pathname)) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) });
        return res.end();
      }
      const page = publicPages.get(url.pathname);
      if (page) {
        res.writeHead(200, {
          "Content-Type": page.type,
          "Content-Length": page.data.length,
        });
        return res.end(req.method === "HEAD" ? undefined : page.data);
      }
    }
    if (req.method === "GET" && url.pathname === "/portal.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      return res.end(
        legacyGame
          ? `if(new URLSearchParams(location.hash.slice(1)).has("ticket"))location.replace(${JSON.stringify(`/${legacyGame}/`)}+location.hash);`
          : "",
      );
    }
    const legacyRoom = ROOM.exec(url.pathname);
    if (req.method === "GET" && legacyRoom && legacyGame) {
      res.writeHead(302, { Location: `/${legacyGame}/room/${legacyRoom[1]}` });
      return res.end();
    }
    const gameRoom =
      /^\/([a-z][a-z0-9-]{0,31})\/room\/([a-f0-9-]{36}|[a-fA-F0-9]{8})$/.exec(
        url.pathname,
      );
    const roomAsset =
      gameRoom &&
      registry.has(gameRoom[1]) &&
      (gameRoom[2].length === 36 || findRoom(getGame(gameRoom[1]), gameRoom[2]))
        ? assets.get(`/${gameRoom[1]}/`)
        : null;
    if (req.method === "GET" && (assets.has(url.pathname) || roomAsset)) {
      const asset = assets.get(url.pathname) || roomAsset;
      res.writeHead(200, { "Content-Type": asset.type });
      return res.end(asset.data);
    }
    if (!url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Không tìm thấy trang." });
    if (req.method === "POST" && req.headers.origin !== config.origin)
      return json(res, 403, { error: "Nguồn truy cập không hợp lệ." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return json(res, 403, { error: "Nguồn truy cập không hợp lệ." });
    const scoped = /^\/api\/games\/([a-z][a-z0-9-]{0,31})(\/.*)$/.exec(
      url.pathname,
    );
    const game = getGame(
      scoped
        ? scoped[1]
        : url.pathname.startsWith("/api/games/")
          ? null
          : legacyGame,
    );
    const { store } = game;
    const route = scoped ? `/api${scoped[2]}` : url.pathname;
    if (req.method === "POST" && route === "/api/pair") {
      if (!allowed(`pair:${req.socket.remoteAddress}`, 20, 60_000))
        return json(res, 429, { error: "Hãy đợi một phút rồi thử lại." });
      const data = await body(req);
      const room = findRoom(game, data.roomId);
      const roomId = room?.id;
      if (!room || !game.isOpen(room))
        return json(res, 409, { error: "Phòng đã đóng hoặc không tồn tại." });
      prune(pairings);
      if (pairings.size >= 5000)
        return json(res, 503, { error: "Máy chủ đang bận." });
      const secret = token();
      let code;
      do {
        code = randomBytes(4).toString("hex").toUpperCase();
      } while ([...pairings.values()].some((p) => p.code === code));
      pairings.set(secret, {
        gameId: game.id,
        roomId,
        code,
        expires: now() + TICKET_MS,
      });
      res.setHeader(
        "Set-Cookie",
        `web_game_pair=${secret}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${TICKET_MS / 1000}${config.secure ? "; Secure" : ""}`,
      );
      // Each tab keeps its own challenge proof. The cookie only supports older clients.
      return json(res, 200, {
        code,
        pairingToken: secret,
        expires: now() + TICKET_MS,
        expiresInMs: TICKET_MS,
      });
    }
    if (req.method === "POST" && route === "/api/pair/status") {
      const data = await body(req);
      const secret = Object.hasOwn(data, "pairingToken")
        ? data.pairingToken
        : pairCookie(req);
      const pairing =
        typeof secret === "string" && /^[A-Za-z0-9_-]{43}$/.test(secret)
          ? pairings.get(secret)
          : null;
      // Funnel/reverse-proxy clients can share an IP; valid challenges have independent budgets.
      if (
        !allowed(
          pairing
            ? `poll:${secret}`
            : `poll-invalid:${req.socket.remoteAddress}`,
          120,
          60_000,
        )
      )
        return json(res, 429, { error: "Hãy đợi một phút rồi thử lại." });
      if (!pairing || pairing.expires <= now()) {
        pairings.delete(secret);
        return json(res, 410, {
          error: "Mã kết nối đã hết hạn. Hãy lấy mã mới.",
        });
      }
      if (
        pairing.gameId !== game.id ||
        (data.roomId !== undefined &&
          findRoom(game, data.roomId)?.id !== pairing.roomId)
      )
        return json(res, 410, {
          error: "Mã kết nối không thuộc phòng hoặc trò chơi này.",
        });
      if (!pairing.userId) return json(res, 200, { connected: false });
      roomFor(game, pairing.roomId, pairing.userId);
      const sid = openSession(res, pairing.userId, pairing.sid);
      if (!sid) return;
      pairing.sid = sid;
      // Retain until challenge expiry so a dropped HTTP response can safely be retried.
      return json(res, 200, { connected: true, roomId: pairing.roomId });
    }
    if (req.method === "POST" && route === "/api/login") {
      if (!allowed(`login:${req.socket.remoteAddress}`, 120, 60_000))
        return json(res, 429, { error: "Hãy đợi một phút rồi thử lại." });
      const { ticket } = await body(req);
      const access = typeof ticket === "string" ? tickets.get(ticket) : null;
      if (!access || access.expires <= now() || access.gameId !== game.id)
        return json(res, 401, {
          error:
            "Link đã dùng hoặc hết hạn. Bấm Mở bàn cờ trong Discord để lấy link mới.",
        });
      tickets.delete(ticket);
      roomFor(game, access.roomId, access.userId);
      if (!openSession(res, access.userId)) return;
      return json(res, 200, { roomId: access.roomId });
    }
    const readOnly =
      req.method === "GET" && ["/api/state", "/api/events"].includes(route);
    const session = authenticate(req, readOnly);
    const streamKey = session.sid || `viewer:${req.socket.remoteAddress}`;
    // Continuous-movement games can opt into a bounded higher action budget.
    const requestLimit = Number.isInteger(game.requestsPerMinute)
      ? Math.max(120, Math.min(600, game.requestsPerMinute))
      : 120;
    if (!allowed(`session:${streamKey}`, requestLimit, 60_000))
      return json(res, 429, {
        error: "Bạn thao tác quá nhanh. Hãy đợi một chút.",
      });
    if (req.method === "GET" && ["/api/state", "/api/events"].includes(route)) {
      const id = url.searchParams.get("room");
      const room = findRoom(game, id);
      if (!room) return json(res, 404, { error: "Không tìm thấy phòng." });
      if (route === "/api/state")
        return json(res, 200, store.snapshot(room, session.userId));
      let peers = streams.get(streamKey);
      if (!peers) streams.set(streamKey, (peers = new Set()));
      if (peers.size >= (session.sid ? 3 : 20))
        return json(res, 429, { error: "Đã mở quá nhiều tab bàn cờ." });
      if (
        [...streams.values()].reduce((sum, group) => sum + group.size, 0) >=
        1000
      )
        return json(res, 503, { error: "Máy chủ đang bận." });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      const send = (updated) => {
        if (res.writableEnded || res.destroyed) return;
        if (res.writableLength > 64 * 1024) return res.destroy();
        res.write(
          `data: ${JSON.stringify(store.snapshot(updated, session.userId))}\n\n`,
        );
      };
      peers.add(res);
      store.events.on(room.id, send);
      send(room);
      const heartbeat = setInterval(() => {
        if (session.expires && session.expires <= now()) return res.end();
        if (res.writableLength > 64 * 1024) return res.destroy();
        res.write(": keepalive\n\n");
      }, 15_000);
      res.on("close", () => {
        clearInterval(heartbeat);
        store.events.off(room.id, send);
        peers.delete(res);
        if (!peers.size) streams.delete(streamKey);
      });
      return;
    }
    if (
      req.method === "POST" &&
      Object.hasOwn(game.actions, route.slice("/api/".length))
    ) {
      const data = await body(req);
      const room = roomFor(game, data.roomId, session.userId);
      const updated = await game.actions[route.slice("/api/".length)](
        room.id,
        session.userId,
        { ...data, roomId: room.id },
      );
      return json(res, 200, store.snapshot(updated, session.userId));
    }
    return json(res, 404, { error: "Không tìm thấy chức năng." });
  }
  function pairCookie(req) {
    return cookieValue(req, "web_game_pair") || cookieValue(req, "caro_pair");
  }
  function cookieValue(req, name) {
    const part = (req.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`));
    const value = part?.slice(name.length + 1);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  function openSession(res, userId, previousSid) {
    prune(sessions);
    const previous = sessions.get(previousSid);
    const reusable = previous && previous.userId === userId;
    if (!reusable && sessions.size >= 5000) {
      json(res, 503, { error: "Máy chủ đang bận. Hãy thử lại sau." });
      return false;
    }
    const sid = reusable ? previousSid : token();
    if (!reusable) sessions.set(sid, { userId, expires: now() + SESSION_MS });
    const maxAge = Math.max(
      1,
      Math.floor((sessions.get(sid).expires - now()) / 1000),
    );
    res.setHeader(
      "Set-Cookie",
      `web_game_session=${sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${config.secure ? "; Secure" : ""}`,
    );
    return sid;
  }
  function confirmPairing(gameId, roomId, userId, input) {
    const room = roomFor(getGame(gameId), roomId, userId);
    roomId = room.id;
    if (!allowed(`confirm:${userId}`, 5, 60_000))
      throw Object.assign(
        new Error("Bạn nhập quá nhiều lần. Hãy đợi một phút."),
        { code: "PAIR_LIMIT" },
      );
    const code = String(input || "")
      .trim()
      .toUpperCase();
    const pairing = [...pairings.values()].find(
      (p) =>
        p.gameId === gameId &&
        p.roomId === roomId &&
        p.code === code &&
        p.expires > now() &&
        (!p.userId || p.userId === userId),
    );
    if (!pairing)
      throw Object.assign(
        new Error(
          "Mã không đúng, đã dùng hoặc hết hạn. Hãy lấy mã trên bàn cờ của bạn.",
        ),
        { code: "PAIR_INVALID" },
      );
    pairing.userId = userId;
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status =
        error.httpStatus ||
        (games.some((game) => Object.hasOwn(game.errors, error.code))
          ? 409
          : 500);
      if (status === 500)
        logger?.error(
          { code: error.code || error.name },
          "web game HTTP request failed",
        );
      if (!res.headersSent && !res.destroyed)
        json(res, status, {
          error:
            status === 500 ? "Có lỗi máy chủ. Hãy thử lại." : error.message,
        });
      else res.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  const cleanup = setInterval(() => {
    prune(tickets);
    prune(pairings);
    prune(sessions);
    prune(limits);
  }, 60_000);
  cleanup.unref();
  server.once("close", () => clearInterval(cleanup));
  async function stop() {
    clearInterval(cleanup);
    for (const peers of streams.values()) for (const res of peers) res.end();
    if (!server.listening) return;
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  return {
    server,
    issueTicket,
    confirmPairing,
    roomUrl: (gameId, id) => {
      const room = findRoom(getGame(gameId), id);
      return `${config.origin}/${gameId}/room/${roomReference(room, id)}`;
    },
    stop,
  };
}

module.exports = { createWebServer };
