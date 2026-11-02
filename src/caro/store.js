"use strict";

const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { winningLine } = require("./engine");
const { normalizeRules, rulesText } = require("./rules");

const WAIT_MS = 10 * 60_000;
const TURN_MS = 90_000;
const MATCH_MS = 30 * 60_000;
const DEFAULT_ROOM_LIMIT = 5;
const MAX_ROOM_LIMIT = 20;
const MESSAGES = {
  ROOM_MISSING: "Không tìm thấy phòng.",
  ROOM_CLOSED: "Phòng đã kết thúc hoặc hết hạn.",
  ALREADY_PLAYING:
    "Bạn đang ở một phòng caro khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng caro đang mở.",
  INVALID_ROOM_LIMIT: "Số phòng tối đa phải là số nguyên từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ người khác tham gia.",
  ROOM_FULL: "Phòng đã đủ hai người chơi.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng này.",
  NOT_HOST: "Chỉ chủ phòng mới được hủy phòng chờ.",
  NOT_STARTED: "Đang chờ đối thủ tham gia.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Bàn cờ vừa thay đổi. Hãy kiểm tra bàn mới rồi đánh lại.",
  INVALID_CELL: "Ô cờ không hợp lệ.",
  OCCUPIED: "Ô này đã có quân.",
  INVALID_RULES: "Cấu hình bàn cờ không hợp lệ.",
};
function fail(code) {
  throw Object.assign(new Error(MESSAGES[code]), { code });
}
const player = (user) => ({
  id: String(user.id),
  name: String(
    user.globalName || user.displayName || user.username || "Người chơi",
  ).slice(0, 80),
});

function createStore(db, now = Date.now) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const raw = (id) => {
    const row = db
      .prepare("SELECT data_json FROM caro_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE caro_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "playing"].includes(room.status))
      db.prepare("DELETE FROM caro_seats WHERE room_id=?").run(room.id);
    return room;
  }
  function finish(room, reason, winner = null) {
    room.status = "finished";
    room.reason = reason;
    room.winner = winner;
    room.closedAt = now();
    return save(room);
  }
  function expire(room) {
    if (!room) return room;
    if (room.status === "waiting" && now() >= room.createdAt + WAIT_MS)
      finish(room, "expired");
    else if (room.status === "playing") {
      if (now() >= Math.min(room.turnDeadline, room.matchDeadline)) {
        if (room.matchDeadline <= room.turnDeadline) finish(room, "duration");
        else finish(room, "timeout", room.turn === "X" ? "O" : "X");
      }
    }
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
        "SELECT id FROM caro_rooms WHERE status IN ('waiting','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM caro_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO caro_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM caro_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO caro_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM caro_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM caro_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng caro đang mở. Dùng /caro phong để xem và tham gia phòng hiện có.`,
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
          board: Array(rules.size * rules.size).fill(null),
          turn: "X",
          moves: 0,
          version: 0,
          createdAt: now(),
          turnDeadline: null,
          matchDeadline: null,
          winner: null,
          winningCells: [],
          lastCell: null,
        };
        db.prepare(
          "INSERT INTO caro_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
      room.turnDeadline = now() + TURN_MS;
      room.matchDeadline = now() + MATCH_MS;
      return save(room);
    });
  }
  function move(id, userId, cell, version) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status === "waiting") fail("NOT_STARTED");
      if (room.status !== "playing") fail("ROOM_CLOSED");
      if (room.version !== version) fail("STALE_BOARD");
      if (room.turn !== mark) fail("NOT_TURN");
      const rules = normalizeRules(room.rules);
      if (
        !Number.isInteger(cell) ||
        cell < 0 ||
        cell >= rules.size * rules.size
      )
        fail("INVALID_CELL");
      if (room.board[cell]) fail("OCCUPIED");
      room.board[cell] = mark;
      room.lastCell = cell;
      room.moves++;
      room.winningCells = winningLine(room.board, cell, mark, rules);
      if (room.winningCells.length) return finish(room, "win", mark);
      if (room.moves === rules.size * rules.size) return finish(room, "draw");
      room.turn = mark === "X" ? "O" : "X";
      room.turnDeadline = now() + TURN_MS;
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
  function attachMessage(id, messageId) {
    return change(id, (room) => {
      room.messageId = messageId;
      return save(room);
    });
  }
  function snapshot(room, userId) {
    const mark = seat(room, userId);
    const rules = normalizeRules(room.rules);
    return {
      id: room.id,
      size: rules.size,
      rules,
      rulesLabel: rulesText(rules),
      board: room.board,
      status: room.status,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
      me: mark,
      turn: room.turn,
      version: room.version,
      moves: room.moves,
      winner: room.winner,
      reason: room.reason || null,
      winningCells: room.winningCells,
      lastCell: room.lastCell,
      turnDeadline: room.turnDeadline,
      matchDeadline: room.matchDeadline,
      waitingDeadline: room.createdAt + WAIT_MS,
      serverNow: now(),
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
  TURN_MS,
  MATCH_MS,
  DEFAULT_ROOM_LIMIT,
  MAX_ROOM_LIMIT,
};
