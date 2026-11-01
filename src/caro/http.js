"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { MESSAGES } = require("./store");

const ROOM = /^\/room\/([a-f0-9-]{36})$/;
const MAX_BODY = 2048;
const TICKET_MS = 5 * 60_000;
const SESSION_MS = 12 * 60 * 60_000;
const token = () => randomBytes(32).toString("base64url");

function createWebServer({ store, config, logger, now = Date.now }) {
  const tickets = new Map(),
    sessions = new Map(),
    limits = new Map(),
    streams = new Map();
  const assets = new Map(
    [
      ["/", ["index.html", "text/html; charset=utf-8"]],
      ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
      ["/style.css", ["style.css", "text/css; charset=utf-8"]],
    ].map(([url, [file, type]]) => [
      url,
      { type, data: fs.readFileSync(path.join(__dirname, "public", file)) },
    ]),
  );
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
  function issueTicket(roomId, userId) {
    const room = store.get(roomId);
    if (!room || !store.seat(room, userId))
      throw Object.assign(new Error(MESSAGES.NOT_PLAYER), {
        code: "NOT_PLAYER",
      });
    prune(tickets);
    for (const [key, value] of tickets)
      if (value.userId === userId && value.roomId === roomId)
        tickets.delete(key);
    if (tickets.size >= 5000)
      throw new Error("Quá nhiều lượt mở bàn. Hãy thử lại sau.");
    const ticket = token();
    tickets.set(ticket, { roomId, userId, expires: now() + TICKET_MS });
    // Fragment is never sent in HTTP requests, reverse-proxy logs or Referer headers.
    return `${config.origin}/#ticket=${ticket}`;
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
  function authenticate(req) {
    const sid = /(?:^|;\s*)caro_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    const session = sessions.get(sid);
    if (!session || session.expires <= now()) {
      sessions.delete(sid);
      throw Object.assign(
        new Error("Phiên vào bàn đã hết hạn. Hãy mở lại từ nút trong Discord."),
        { httpStatus: 401 },
      );
    }
    return { sid, ...session };
  }
  function roomFor(id, userId) {
    const room =
      typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)
        ? store.get(id)
        : null;
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
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz")
      return json(res, 200, { ok: true });
    if (
      req.method === "GET" &&
      (assets.has(url.pathname) || ROOM.test(url.pathname))
    ) {
      const asset = assets.get(url.pathname) || assets.get("/");
      res.writeHead(200, { "Content-Type": asset.type });
      return res.end(asset.data);
    }
    if (!url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Không tìm thấy trang." });
    if (req.method === "POST" && req.headers.origin !== config.origin)
      return json(res, 403, { error: "Nguồn truy cập không hợp lệ." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return json(res, 403, { error: "Nguồn truy cập không hợp lệ." });
    if (req.method === "POST" && url.pathname === "/api/login") {
      if (!allowed(`login:${req.socket.remoteAddress}`, 120, 60_000))
        return json(res, 429, { error: "Hãy đợi một phút rồi thử lại." });
      const { ticket } = await body(req);
      const access = typeof ticket === "string" ? tickets.get(ticket) : null;
      if (!access || access.expires <= now())
        return json(res, 401, {
          error:
            "Link đã dùng hoặc hết hạn. Bấm Mở bàn cờ trong Discord để lấy link mới.",
        });
      tickets.delete(ticket);
      roomFor(access.roomId, access.userId);
      prune(sessions);
      if (sessions.size >= 5000)
        return json(res, 503, { error: "Máy chủ đang bận. Hãy thử lại sau." });
      const sid = token();
      sessions.set(sid, { userId: access.userId, expires: now() + SESSION_MS });
      res.setHeader(
        "Set-Cookie",
        `caro_session=${sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}${config.secure ? "; Secure" : ""}`,
      );
      return json(res, 200, { roomId: access.roomId });
    }
    const session = authenticate(req);
    if (!allowed(`session:${session.sid}`, 120, 60_000))
      return json(res, 429, {
        error: "Bạn thao tác quá nhanh. Hãy đợi một chút.",
      });
    if (
      req.method === "GET" &&
      ["/api/state", "/api/events"].includes(url.pathname)
    ) {
      const room = roomFor(url.searchParams.get("room"), session.userId);
      if (url.pathname === "/api/state")
        return json(res, 200, store.snapshot(room, session.userId));
      let peers = streams.get(session.sid);
      if (!peers) streams.set(session.sid, (peers = new Set()));
      if (peers.size >= 3)
        return json(res, 429, { error: "Chỉ mở tối đa ba tab bàn cờ." });
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
        if (session.expires <= now()) return res.end();
        if (res.writableLength > 64 * 1024) return res.destroy();
        res.write(": keepalive\n\n");
      }, 15_000);
      res.on("close", () => {
        clearInterval(heartbeat);
        store.events.off(room.id, send);
        peers.delete(res);
        if (!peers.size) streams.delete(session.sid);
      });
      return;
    }
    if (
      req.method === "POST" &&
      ["/api/move", "/api/leave"].includes(url.pathname)
    ) {
      const data = await body(req);
      roomFor(data.roomId, session.userId);
      const updated =
        url.pathname === "/api/move"
          ? store.move(data.roomId, session.userId, data.cell, data.version)
          : store.leave(data.roomId, session.userId);
      return json(res, 200, store.snapshot(updated, session.userId));
    }
    return json(res, 404, { error: "Không tìm thấy chức năng." });
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status = error.httpStatus || (MESSAGES[error.code] ? 409 : 500);
      if (status === 500)
        logger?.error(
          { code: error.code || error.name },
          "caro HTTP request failed",
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
  return { server, issueTicket, stop };
}

module.exports = { createWebServer };
