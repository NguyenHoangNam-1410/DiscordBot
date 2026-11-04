"use strict";

const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const engine = require("./engine");
const { randomInt } = require("node:crypto");
const { SIZE } = require("./rules");
const {
  makePlayer: player,
  playerIdentityView,
} = require("../webGames/playerIdentity");
const { normalizeRules, rulesText } = require("./rules");
const {
  initialClock,
  ensureClock,
  flagged,
  stopClock,
  startClock,
  clockView,
} = require("../webGames/clock");

const WAIT_MS = 10 * 60_000;
const DEFAULT_ROOM_LIMIT = 5;
const MAX_ROOM_LIMIT = 20;
const MESSAGES = {
  ROOM_MISSING: "Không tìm thấy phòng.",
  ROOM_CLOSED: "Phòng đã kết thúc hoặc hết hạn.",
  ALREADY_PLAYING:
    "Bạn đang ở một phòng santorini khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng santorini đang mở.",
  INVALID_ROOM_LIMIT: "Số phòng tối đa phải là số nguyên từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ người khác tham gia.",
  ROOM_FULL: "Phòng đã đủ hai người chơi.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng này.",
  NOT_HOST: "Chỉ chủ phòng mới được hủy phòng chờ.",
  NOT_STARTED: "Đang chờ đối thủ tham gia.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Bàn cờ vừa thay đổi. Hãy kiểm tra bàn mới rồi đánh lại.",
  INVALID_PLACEMENT: "Chọn đúng hai ô trống khác nhau để đặt thợ.",
  ALREADY_PLACED: "Bạn đã đặt đủ hai thợ.",
  INVALID_ACTION: "Thao tác không hợp lệ trong giai đoạn này.",
  INVALID_WORKER: "Chọn một thợ của bạn.",
  INVALID_MOVE:
    "Thợ phải đi tới ô trống bên cạnh, tối đa lên một tầng và không vào mái vòm.",
  INVALID_BUILD: "Xây tại một ô trống cạnh thợ vừa đi; không xây lên mái vòm.",
  INVALID_RULES: "Cấu hình bàn cờ không hợp lệ.",
};
function fail(code) {
  throw Object.assign(new Error(MESSAGES[code]), { code });
}
function createStore(db, now = Date.now) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const raw = (id) => {
    const row = db
      .prepare("SELECT data_json FROM santorini_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE santorini_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "playing"].includes(room.status))
      db.prepare("DELETE FROM santorini_seats WHERE room_id=?").run(room.id);
    return room;
  }
  function finish(room, reason, winner = null, at = now()) {
    if (flagged(room, at)) {
      reason = "timeout";
      winner = room.turn === "X" ? "O" : "X";
    }
    stopClock(room, at);
    room.status = "finished";
    room.reason = reason;
    room.winner = winner;
    room.closedAt = at;
    return save(room);
  }
  function expire(room) {
    if (!room) return room;
    const at = now();
    if (ensureClock(room, normalizeRules(room.rules).timeMinutes, at)) {
      save(room);
      db.prepare("UPDATE santorini_rooms SET ui_dirty=1 WHERE id=?").run(
        room.id,
      );
    }
    if (room.status === "waiting" && at >= room.createdAt + WAIT_MS)
      finish(room, "expired", null, at);
    else if (flagged(room, at))
      finish(room, "timeout", room.turn === "X" ? "O" : "X", at);
    return room;
  }
  function get(id) {
    const before = raw(id);
    const room = db.transaction(() => expire(raw(id)))();
    if (room && before.version !== room.version) {
      events.emit(id, room);
      events.emit("changed", room);
    }
    return room;
  }
  function sweep() {
    const rows = db
      .prepare(
        "SELECT id FROM santorini_rooms WHERE status IN ('waiting','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM santorini_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO santorini_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM santorini_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO santorini_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM santorini_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
      )
      .all(guildId, channelId)
      .map((row) => JSON.parse(row.data_json));
  }
  const create = (options) => {
    const rules = normalizeRules(options.rules);
    sweep();
    return db
      .transaction(() => {
        const limit = getChannelLimit(options.guildId, options.channelId);
        const { count } = db
          .prepare(
            "SELECT count(*) AS count FROM santorini_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng santorini đang mở. Dùng /santorini phong để xem và tham gia phòng hiện có.`,
            ),
            { code: "CHANNEL_FULL" },
          );
        const room = {
          id: randomUUID(),
          guildId: options.guildId,
          channelId: options.channelId,
          messageId: null,
          players: { X: player(options.user), O: null },
          status: "waiting",
          rules,
          board: Array(SIZE * SIZE).fill(0),
          workers: { X: [null, null], O: [null, null] },
          phase: "placement",
          first:
            rules.first === "random"
              ? randomInt(2)
                ? "X"
                : "O"
              : rules.first === "guest"
                ? "O"
                : "X",
          turn: null,
          moves: 0,
          version: 0,
          createdAt: now(),
          ...initialClock(rules.timeMinutes),
          winner: null,
          lastAction: null,
        };
        room.turn = room.first;
        db.prepare(
          "INSERT INTO santorini_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
        ).run(
          room.id,
          room.guildId,
          room.channelId,
          room.status,
          JSON.stringify(room),
        );
        claim(room, room.players.X.id);
        return room;
      })
      .immediate();
  };
  function change(id, fn) {
    const current = get(id); // Commit any expiry even when the requested action is rejected.
    if (!current) fail("ROOM_MISSING");
    const room = db.transaction(() => fn(raw(id)))();
    events.emit(id, room);
    events.emit("changed", room);
    return room;
  }
  function seat(room, userId) {
    return ["X", "O"].find((mark) => room.players[mark]?.id === userId) || null;
  }
  function join(id, user) {
    sweep();
    return change(id, (room) => {
      if (room.players.X.id === String(user.id)) fail("SELF_JOIN");
      if (room.status === "playing") fail("ROOM_FULL");
      if (room.status !== "waiting") fail("ROOM_CLOSED");
      claim(room, String(user.id));
      room.players.O = player(user);
      room.status = "playing";
      startClock(room, now());
      return save(room);
    });
  }
  function move(id, userId, data, version) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status === "waiting") fail("NOT_STARTED");
      if (room.status !== "playing") fail("ROOM_CLOSED");
      if (room.version !== version) fail("STALE_BOARD");
      if (room.turn !== mark) fail("NOT_TURN");
      const at = now();
      if (flagged(room, at)) fail("ROOM_CLOSED");
      let action;
      if (room.phase === "placement") {
        if (data.type !== "place") fail("INVALID_ACTION");
        const error = engine.placementError(room, mark, data.cells);
        if (error) fail(error);
        stopClock(room, at);
        room.workers[mark] = [...data.cells];
        const other = mark === "X" ? "O" : "X";
        action = { type: "place", mark, cells: [...data.cells] };
        room.turn = other;
        if (room.workers[other].every(Number.isInteger)) {
          room.phase = "turn";
          room.turn = room.first;
        }
      } else {
        if (data.type !== "turn") fail("INVALID_ACTION");
        const result = engine.turnResult(room, mark, data);
        if (result.error) fail(result.error);
        action = {
          type: "turn",
          mark,
          worker: data.worker,
          from: result.from,
          to: data.to,
          build: result.win ? null : data.build,
          level: result.win ? 3 : room.board[data.build] + 1,
        };
        room.workers[mark][data.worker] = data.to;
        if (!result.win) room.board[data.build]++;
        // Debit the actor before changing the active seat.
        stopClock(room, at);
        room.moves++;
        room.lastAction = action;
        db.prepare("UPDATE santorini_rooms SET ui_dirty=1 WHERE id=?").run(
          room.id,
        );
        if (result.win) return finish(room, "level3", mark, at);
        room.turn = mark === "X" ? "O" : "X";
        if (!engine.legalTurns(room, room.turn).length)
          return finish(room, "blocked", mark, at);
        startClock(room, at);
        return save(room);
      }
      // Placement is sequential and uses the same per-player clock bank.
      room.lastAction = action;
      db.prepare("UPDATE santorini_rooms SET ui_dirty=1 WHERE id=?").run(
        room.id,
      );
      startClock(room, at);
      return save(room);
    });
  }
  function leave(id, userId) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status === "waiting") {
        if (mark !== "X") fail("NOT_HOST");
        return finish(room, "cancelled");
      }
      if (room.status !== "playing") fail("ROOM_CLOSED");
      return finish(room, "resign", mark === "X" ? "O" : "X");
    });
  }
  function updatePlayer(id, user) {
    const current = get(id);
    if (!current) fail("ROOM_MISSING");
    const mark = seat(current, String(user.id));
    if (!mark) fail("NOT_PLAYER");
    const next = player(user);
    if (JSON.stringify(current.players[mark]) === JSON.stringify(next))
      return current;
    return change(id, (room) => {
      room.players[mark] = next;
      return save(room);
    });
  }
  function attachMessage(id, messageId) {
    return change(id, (room) => {
      room.messageId = messageId;
      return save(room);
    });
  }
  function snapshot(room, userId) {
    const mark = seat(room, userId);
    const rules = normalizeRules(room.rules);
    const at = now();
    return {
      id: room.id,
      size: SIZE,
      rules,
      rulesLabel: rulesText(rules),
      board: room.board,
      workers: room.workers,
      phase: room.phase,
      first: room.first,
      legalTurns:
        mark &&
        mark === room.turn &&
        room.status === "playing" &&
        room.phase === "turn"
          ? engine.legalTurns(room, mark)
          : [],
      status: room.status,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
      ...playerIdentityView(room, "santorini"),
      me: mark,
      turn: room.turn,
      version: room.version,
      moves: room.moves,
      winner: room.winner,
      reason: room.reason || null,
      lastAction: room.lastAction,
      ...clockView(room, rules.timeMinutes, at),
      waitingDeadline: room.createdAt + WAIT_MS,
      serverNow: at,
    };
  }
  return {
    create,
    get,
    join,
    move,
    leave,
    sweep,
    seat,
    snapshot,
    attachMessage,
    updatePlayer,
    events,
    getChannelLimit,
    setChannelLimit,
    listOpen,
  };
}

module.exports = {
  createStore,
  MESSAGES,
  WAIT_MS,
  DEFAULT_ROOM_LIMIT,
  MAX_ROOM_LIMIT,
};
