"use strict";

const { createRoomIdentity, resolveRoomId } = require("../webGames/roomLinks");
const { EventEmitter } = require("node:events");
const engine = require("./engine");
const { randomInt } = require("node:crypto");
const { WIDTH, HEIGHT, RULES_ID, NAMES, PIECE_CHARACTERS } = require("./rules");
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
    "Bạn đang ở một phòng cotuong khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng cotuong đang mở.",
  INVALID_ROOM_LIMIT: "Số phòng tối đa phải là số nguyên từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ người khác tham gia.",
  ROOM_FULL: "Phòng đã đủ hai người chơi.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng này.",
  NOT_HOST: "Chỉ chủ phòng mới được hủy phòng chờ.",
  NOT_STARTED: "Đang chờ đối thủ tham gia.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Bàn cờ vừa thay đổi. Hãy kiểm tra bàn mới rồi đánh lại.",
  INVALID_COORDINATE: "Chọn một giao điểm hợp lệ trên bàn 9×10.",
  NOT_OWN_PIECE: "Chọn quân của bạn.",
  INVALID_MOVE: "Nước đi không hợp lệ hoặc để Tướng của bạn bị chiếu.",
  XIANGQI_ENGINE_UNAVAILABLE:
    "Chưa nạp được bộ luật Cờ tướng. Hãy thử lại; bàn cũ được giữ nguyên.",
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
      .prepare("SELECT data_json FROM cotuong_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE cotuong_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "playing"].includes(room.status))
      db.prepare("DELETE FROM cotuong_seats WHERE room_id=?").run(room.id);
    return room;
  }
  function finish(room, reason, winner = null, at = now()) {
    if (flagged(room, at)) {
      reason = "timeout";
      winner = room.turn === "X" ? "O" : "X";
    }
    stopClock(room, at);
    room.status = ["cancelled", "expired"].includes(reason)
      ? reason
      : "finished";
    room.endReason = reason;
    room.reason = [
      "repetition",
      "no_capture_limit",
      "insufficient_material",
    ].includes(reason)
      ? "draw"
      : reason;
    room.winner = winner;
    room.closedAt = at;
    room.endedAt = at;
    return save(room);
  }
  function expire(room) {
    if (!room) return room;
    const at = now();
    if (ensureClock(room, normalizeRules(room.rules).timeMinutes, at)) {
      save(room);
      db.prepare("UPDATE cotuong_rooms SET ui_dirty=1 WHERE id=?").run(room.id);
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
        "SELECT id FROM cotuong_rooms WHERE status IN ('waiting','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM cotuong_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO cotuong_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM cotuong_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO cotuong_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM cotuong_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM cotuong_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng cotuong đang mở. Dùng /cotuong phong để xem và tham gia phòng hiện có.`,
            ),
            { code: "CHANNEL_FULL" },
          );
        const first =
          rules.first === "random"
            ? randomInt(2)
              ? "X"
              : "O"
            : rules.first === "guest"
              ? "O"
              : "X";
        const seed = engine.createState();
        const room = {
          schemaVersion: 1,
          rulesId: RULES_ID,
          ...createRoomIdentity(db, "cotuong"),
          guildId: options.guildId,
          channelId: options.channelId,
          messageId: null,
          players: { X: player(options.user), O: null },
          status: "waiting",
          rules,
          ...seed,
          history: [],
          lastMove: null,
          first,
          firstPlayer: first,
          sideBySeat:
            first === "X" ? { X: "red", O: "black" } : { X: "black", O: "red" },
          turn: first,
          moves: 0,
          version: 0,
          createdAt: now(),
          ...initialClock(rules.timeMinutes),
          winner: null,
          lastAction: null,
        };
        db.prepare(
          "INSERT INTO cotuong_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
    const room = db.transaction(() => fn(raw(id))).immediate();
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
  function engineState(room) {
    const {
      initialFen,
      engineLine,
      fen,
      legal,
      check,
      sideToMove,
      halfmoveClock,
      pieces,
      ply,
    } = room;
    return {
      initialFen,
      engineLine,
      fen,
      legal,
      check,
      sideToMove,
      halfmoveClock,
      pieces,
      ply,
    };
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
      if (flagged(room, at))
        return finish(room, "timeout", mark === "X" ? "O" : "X", at);
      const error = engine.moveError(
        engineState(room),
        room.sideBySeat[mark],
        data.from,
        data.to,
      );
      if (error) fail(error);
      const result = engine.applyMove(engineState(room), data);
      stopClock(room, at);
      Object.assign(room, result.state);
      room.moves = room.ply;
      room.lastMove = {
        ...result.move,
        ply: room.ply,
        mark,
        at,
        clocksAfter: { ...room.clocks },
      };
      room.lastAction = room.lastMove;
      room.history.push(room.lastMove);
      db.prepare("UPDATE cotuong_rooms SET ui_dirty=1 WHERE id=?").run(room.id);
      room.turn = mark === "X" ? "O" : "X";
      if (result.reason)
        return finish(
          room,
          result.reason,
          result.winner
            ? ["X", "O"].find((seat) => room.sideBySeat[seat] === result.winner)
            : null,
          at,
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
      ...(room.roomCode ? { roomCode: room.roomCode } : {}),
      size: WIDTH,
      width: WIDTH,
      height: HEIGHT,
      rules,
      rulesId: room.rulesId,
      rulesLabel: rulesText(rules),
      pieceNames: NAMES,
      pieceCharacters: PIECE_CHARACTERS,
      pieces: room.pieces.map((p) => ({ ...p })),
      fen: room.fen,
      check: room.check,
      first: room.first,
      sideBySeat: { ...room.sideBySeat },
      legalMoves:
        mark && mark === room.turn && room.status === "playing"
          ? engine.legalMoves(engineState(room))
          : [],
      ply: room.ply,
      halfmoveClock: room.halfmoveClock,
      history: room.history.map((m) => ({
        ...m,
        clocksAfter: { ...m.clocksAfter },
      })),
      lastMove: room.lastMove,
      endReason: room.endReason || null,
      endedAt: room.endedAt || null,
      status: room.status,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
      ...playerIdentityView(room, "cotuong"),
      playerLabels: Object.fromEntries(
        ["X", "O"].map((seat) => [
          seat,
          room.sideBySeat[seat] === "red" ? "Đỏ ●" : "Đen ◆",
        ]),
      ),
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
    resolveId: (reference) => resolveRoomId(db, "cotuong", reference),
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
