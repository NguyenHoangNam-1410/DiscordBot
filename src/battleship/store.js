"use strict";

const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const {
  generateFleet,
  placementError,
  randomPlacement,
  shotView,
  sunkCount,
  remainingFleet,
} = require("./engine");
const { PRESETS, normalizeRules, rulesText } = require("./rules");
const {
  initialClock,
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
    "Bạn đang ở một phòng battleship khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng battleship đang mở.",
  INVALID_ROOM_LIMIT: "Số phòng tối đa phải là số nguyên từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ người khác tham gia.",
  ROOM_FULL: "Phòng đã đủ hai người chơi.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng này.",
  NOT_HOST: "Chỉ chủ phòng mới được hủy phòng chờ.",
  NOT_STARTED: "Cần đủ hai người và xác nhận cả hai hạm đội trước khi bắn.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Bàn cờ vừa thay đổi. Hãy kiểm tra bàn mới rồi đánh lại.",
  INVALID_CELL: "Ô cờ không hợp lệ.",
  INVALID_RULES: "Cấu hình bàn cờ không hợp lệ.",
  NOT_SETUP: "Phòng không còn trong thời gian bố trí.",
  ALREADY_READY: "Bạn đã xác nhận hạm đội; không thể đổi vị trí nữa.",
  INVALID_FLEET: "Danh sách thuyền không hợp lệ.",
  INCOMPLETE_FLEET: "Hãy đặt đủ toàn bộ thuyền trước khi xác nhận.",
  SHIP_OUTSIDE: "Thuyền phải nằm gọn trong bàn, theo chiều ngang hoặc dọc.",
  SHIP_OVERLAP: "Các thuyền không được chồng lên nhau.",
  SHIP_ADJACENT: "Các thuyền không được sát cạnh; chỉ được chạm chéo.",
  ALREADY_SHOT: "Ô này đã bị bắn. Hãy chọn ô khác.",
  PLACEMENT_FAILED: "Chưa xếp được hạm đội. Hãy thử lại.",
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
      .prepare("SELECT data_json FROM battleship_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE battleship_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "setup", "playing"].includes(room.status))
      db.prepare("DELETE FROM battleship_seats WHERE room_id=?").run(room.id);
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
    if (room.status === "waiting" && at >= room.createdAt + WAIT_MS)
      finish(room, "expired", null, at);
    else if (room.status === "setup" && at >= room.setupDeadline) {
      const winner =
        room.ready.X !== room.ready.O ? (room.ready.X ? "X" : "O") : null;
      finish(room, winner ? "setup_timeout" : "setup_expired", winner, at);
    } else if (flagged(room, at))
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
        "SELECT id FROM battleship_rooms WHERE status IN ('waiting','setup','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare(
          "SELECT 1 FROM battleship_seats WHERE guild_id=? AND user_id=?",
        )
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO battleship_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM battleship_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO battleship_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM battleship_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM battleship_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng battleship đang mở. Dùng /battleship phong để xem và tham gia phòng hiện có.`,
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
          fleet: generateFleet(rules.mode),
          placements: { X: [], O: [] },
          setupRevision: { X: 0, O: 0 },
          ready: { X: false, O: false },
          shots: { X: [], O: [] },
          setupDeadline: null,
          turn: "X",
          moves: 0,
          version: 0,
          createdAt: now(),
          ...initialClock(rules.timeMinutes),
          winner: null,
          lastAction: null,
        };
        db.prepare(
          "INSERT INTO battleship_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
      if (["setup", "playing"].includes(room.status)) fail("ROOM_FULL");
      if (room.status !== "waiting") fail("ROOM_CLOSED");
      claim(room, String(user.id));
      room.players.O = player(user);
      room.status = "setup";
      room.setupDeadline = now() + PRESETS[room.rules.mode].count * 20_000;
      return save(room);
    });
  }
  function setupAction(id, userId, revision, apply) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status !== "setup") fail("NOT_SETUP");
      if (room.ready[mark]) fail("ALREADY_READY");
      if (revision !== room.setupRevision[mark]) fail("STALE_BOARD");
      apply(room, mark);
      room.setupRevision[mark]++;
      if (room.ready.X && room.ready.O) {
        room.status = "playing";
        startClock(room, now());
      }
      return save(room);
    });
  }
  function place(id, userId, placements, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      const error = placementError(
        placements,
        room.fleet,
        PRESETS[room.rules.mode].size,
      );
      if (error) fail(error);
      room.placements[mark] = placements
        .map(({ id, cell, orientation }) => ({ id, cell, orientation }))
        .sort((a, b) => a.id - b.id);
    });
  }
  function randomize(id, userId, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      room.placements[mark] = randomPlacement(
        room.fleet,
        PRESETS[room.rules.mode].size,
      );
    });
  }
  function ready(id, userId, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      const error = placementError(
        room.placements[mark],
        room.fleet,
        PRESETS[room.rules.mode].size,
        true,
      );
      if (error) fail(error);
      room.ready[mark] = true;
      db.prepare("UPDATE battleship_rooms SET ui_dirty=1 WHERE id=?").run(
        room.id,
      );
    });
  }
  function shoot(id, userId, cell, version) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (["waiting", "setup"].includes(room.status)) fail("NOT_STARTED");
      if (room.status !== "playing") fail("ROOM_CLOSED");
      if (version !== room.version) fail("STALE_BOARD");
      if (room.turn !== mark) fail("NOT_TURN");
      const at = now(),
        size = PRESETS[room.rules.mode].size;
      if (flagged(room, at)) fail("ROOM_CLOSED");
      if (!Number.isInteger(cell) || cell < 0 || cell >= size * size)
        fail("INVALID_CELL");
      if (room.shots[mark].includes(cell)) fail("ALREADY_SHOT");
      stopClock(room, at);
      const other = mark === "X" ? "O" : "X";
      const before = sunkCount(
        room.placements[other],
        room.shots[mark],
        room.fleet,
        size,
      );
      room.shots[mark].push(cell);
      const sunk = sunkCount(
        room.placements[other],
        room.shots[mark],
        room.fleet,
        size,
      );
      room.lastAction = {
        mark,
        ...shotView(cell, room.placements[other], room.fleet, size),
        sunk: sunk > before,
      };
      room.moves++;
      if (sunk === room.fleet.length) return finish(room, "win", mark, at);
      room.turn = other;
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
      if (!["setup", "playing"].includes(room.status)) fail("ROOM_CLOSED");
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
    const size = PRESETS[rules.mode].size;
    return {
      id: room.id,
      size,
      rules,
      rulesLabel: rulesText(rules),
      fleet: [...room.fleet],
      // Only the owner receives their placements. Every public cell was actually fired at.
      placements: mark
        ? room.placements[mark].map((ship) => ({ ...ship }))
        : [],
      setupRevision: mark ? room.setupRevision[mark] : null,
      ready: { ...room.ready },
      setupDeadline: room.setupDeadline,
      boards: Object.fromEntries(
        ["X", "O"].map((target) => {
          const shooter = target === "X" ? "O" : "X";
          return [
            target,
            room.shots[shooter].map((cell) =>
              shotView(cell, room.placements[target], room.fleet, size),
            ),
          ];
        }),
      ),
      sunk: Object.fromEntries(
        ["X", "O"].map((target) => [
          target,
          sunkCount(
            room.placements[target],
            room.shots[target === "X" ? "O" : "X"],
            room.fleet,
            size,
          ),
        ]),
      ),
      remainingFleet: Object.fromEntries(
        ["X", "O"].map((target) => [
          target,
          remainingFleet(
            room.placements[target],
            room.shots[target === "X" ? "O" : "X"],
            room.fleet,
            size,
          ),
        ]),
      ),
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
    place,
    randomize,
    ready,
    shoot,
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
