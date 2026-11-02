"use strict";

const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { legalMoves, wallError } = require("./engine");
const { SIZE, normalizeRules, rulesText } = require("./rules");
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
    "Bạn đang ở một phòng walls khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng walls đang mở.",
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
  INVALID_WALL: "Vị trí hoặc hướng tường không hợp lệ.",
  WALL_OVERLAP: "Tường bị chồng lên tường đã đặt.",
  WALL_CROSSING: "Tường không được cắt nhau.",
  NO_PATH: "Không thể đặt tường làm một người hết đường tới đích.",
  NO_WALLS: "Bạn đã dùng hết tường.",
  ILLEGAL_MOVE:
    "Nước đi không hợp lệ. Chọn ô được đánh dấu; chỉ được nhảy theo luật Quoridor.",
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
      .prepare("SELECT data_json FROM walls_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE walls_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "playing"].includes(room.status))
      db.prepare("DELETE FROM walls_seats WHERE room_id=?").run(room.id);
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
      db.prepare("UPDATE walls_rooms SET ui_dirty=1 WHERE id=?").run(room.id);
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
        "SELECT id FROM walls_rooms WHERE status IN ('waiting','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM walls_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO walls_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM walls_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO walls_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM walls_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM walls_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng walls đang mở. Dùng /walls phong để xem và tham gia phòng hiện có.`,
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
          positions: {
            X: (SIZE - 1) * SIZE + Math.floor(SIZE / 2),
            O: Math.floor(SIZE / 2),
          },
          walls: [],
          wallsLeft: { X: rules.wallLimit, O: rules.wallLimit },
          turn: "X",
          moves: 0,
          version: 0,
          createdAt: now(),
          ...initialClock(rules.timeMinutes),
          winner: null,
          lastAction: null,
        };
        db.prepare(
          "INSERT INTO walls_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
  function takeTurn(id, userId, version, apply) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status === "waiting") fail("NOT_STARTED");
      if (room.status !== "playing") fail("ROOM_CLOSED");
      if (room.version !== version) fail("STALE_BOARD");
      if (room.turn !== mark) fail("NOT_TURN");
      const at = now();
      if (flagged(room, at)) fail("ROOM_CLOSED");
      apply(room, mark);
      stopClock(room, at);
      room.moves++;
      if (
        Math.floor(room.positions[mark] / SIZE) ===
        (mark === "X" ? 0 : SIZE - 1)
      )
        return finish(room, "win", mark, at);
      room.turn = mark === "X" ? "O" : "X";
      startClock(room, at);
      return save(room);
    });
  }
  function move(id, userId, cell, version) {
    return takeTurn(id, userId, version, (room, mark) => {
      if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE)
        fail("INVALID_CELL");
      if (
        !legalMoves(
          room.positions,
          mark,
          room.walls,
          room.rules.wallLength,
        ).includes(cell)
      )
        fail("ILLEGAL_MOVE");
      room.positions[mark] = cell;
      room.lastAction = { type: "move", mark, cell };
    });
  }
  function wall(id, userId, data, version) {
    return takeTurn(id, userId, version, (room, mark) => {
      if (room.wallsLeft[mark] <= 0) fail("NO_WALLS");
      const candidate = {
        row: data.row,
        col: data.col,
        orientation: data.orientation,
        owner: mark,
      };
      const error = wallError(
        room.walls,
        candidate,
        room.rules.wallLength,
        room.positions,
      );
      if (error) fail(error);
      room.walls.push(candidate);
      room.wallsLeft[mark]--;
      room.lastAction = { type: "wall", mark, ...candidate };
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
    const at = now();
    return {
      id: room.id,
      size: SIZE,
      rules,
      rulesLabel: rulesText(rules),
      positions: room.positions,
      walls: room.walls,
      wallsLeft: room.wallsLeft,
      legalMoves:
        room.status === "playing" && mark === room.turn
          ? legalMoves(room.positions, mark, room.walls, rules.wallLength)
          : [],
      status: room.status,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
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
    wall,
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
  DEFAULT_ROOM_LIMIT,
  MAX_ROOM_LIMIT,
};
