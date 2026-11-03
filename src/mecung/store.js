"use strict";

const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const {
  makePlayer: player,
  playerIdentityView,
} = require("../webGames/playerIdentity");
const {
  designError,
  randomDesign,
  destination,
  wallBetween,
} = require("./engine");
const { PRESETS, SETUP_MS, normalizeRules, rulesText } = require("./rules");
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
    "Bạn đang ở một phòng mecung khác. Hãy kết thúc phòng đó trước.",
  CHANNEL_FULL: "Kênh này đã đủ số phòng mecung đang mở.",
  INVALID_ROOM_LIMIT: "Số phòng tối đa phải là số nguyên từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ người khác tham gia.",
  ROOM_FULL: "Phòng đã đủ hai người chơi.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng này.",
  NOT_HOST: "Chỉ chủ phòng mới được hủy phòng chờ.",
  NOT_STARTED: "Cần đủ hai người và xác nhận cả hai mê cung trước khi đi.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Bàn cờ vừa thay đổi. Hãy kiểm tra bàn mới rồi đánh lại.",
  INVALID_CELL: "Ô cờ không hợp lệ.",
  INVALID_RULES: "Cấu hình bàn cờ không hợp lệ.",
  NOT_SETUP: "Phòng không còn trong thời gian bố trí.",
  ALREADY_READY: "Bạn đã khóa mê cung; không thể sửa nữa.",
  INVALID_POINTS: "Chọn hai ô đầu và đích khác nhau trong bàn.",
  INVALID_WALLS: "Danh sách tường không hợp lệ hoặc quá giới hạn.",
  NO_PATH: "Tường phải giữ ít nhất một đường từ đầu đến đích.",
  INVALID_DIRECTION: "Chỉ đi một ô lên, xuống, trái hoặc phải.",
  OUTSIDE: "Không thể đi ra ngoài mép bàn.",
};
function fail(code) {
  throw Object.assign(new Error(MESSAGES[code]), { code });
}

function createStore(db, now = Date.now) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const raw = (id) => {
    const row = db
      .prepare("SELECT data_json FROM mecung_rooms WHERE id=?")
      .get(id);
    return row ? JSON.parse(row.data_json) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE mecung_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "setup", "playing"].includes(room.status))
      db.prepare("DELETE FROM mecung_seats WHERE room_id=?").run(room.id);
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
        "SELECT id FROM mecung_rooms WHERE status IN ('waiting','setup','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM mecung_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO mecung_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM mecung_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO mecung_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM mecung_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM mecung_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng mecung đang mở. Dùng /mecung phong để xem và tham gia phòng hiện có.`,
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
          designs: Object.fromEntries(
            ["X", "O"].map((mark) => [
              mark,
              { start: 0, goal: PRESETS[rules.mode] ** 2 - 1, walls: [] },
            ]),
          ),
          positions: { X: null, O: null },
          visited: { X: [], O: [] },
          revealed: { X: [], O: [] },
          knownOpen: { X: [], O: [] },
          turns: { X: 0, O: 0 },
          steps: { X: 0, O: 0 },
          finishedTurns: { X: null, O: null },
          startedAt: null,
          setupRevision: { X: 0, O: 0 },
          ready: { X: false, O: false },
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
          "INSERT INTO mecung_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
      room.setupDeadline = now() + SETUP_MS;
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
        room.startedAt = now();
        for (const runner of ["X", "O"]) {
          room.positions[runner] =
            room.designs[runner === "X" ? "O" : "X"].start;
          room.visited[runner] = [room.positions[runner]];
        }
        room.turns.X = 1;
        startClock(room, room.startedAt);
      }
      return save(room);
    });
  }
  function design(id, userId, data, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      const error = designError(
        PRESETS[room.rules.mode],
        data,
        room.rules.wallLimit,
      );
      if (error) fail(error);
      room.designs[mark] = {
        start: data.start,
        goal: data.goal,
        walls: [...data.walls].sort((a, b) => a - b),
      };
    });
  }
  function randomize(id, userId, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      const current = room.designs[mark];
      room.designs[mark] = randomDesign(
        PRESETS[room.rules.mode],
        current.start,
        current.goal,
        room.rules.wallLimit,
      );
    });
  }
  function ready(id, userId, revision) {
    return setupAction(id, userId, revision, (room, mark) => {
      const error = designError(
        PRESETS[room.rules.mode],
        room.designs[mark],
        room.rules.wallLimit,
      );
      if (error) fail(error);
      room.ready[mark] = true;
      db.prepare("UPDATE mecung_rooms SET ui_dirty=1 WHERE id=?").run(room.id);
    });
  }
  function move(id, userId, direction, version) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (["waiting", "setup"].includes(room.status)) fail("NOT_STARTED");
      if (room.status !== "playing") fail("ROOM_CLOSED");
      if (room.version !== version) fail("STALE_BOARD");
      if (room.turn !== mark) fail("NOT_TURN");
      const at = now(),
        size = PRESETS[room.rules.mode],
        other = mark === "X" ? "O" : "X";
      if (flagged(room, at)) fail("ROOM_CLOSED");
      if (!["up", "down", "left", "right"].includes(direction))
        fail("INVALID_DIRECTION");
      const from = room.positions[mark],
        to = destination(size, from, direction);
      if (to === null) fail("OUTSIDE");
      const edge = wallBetween(size, from, to),
        hit = room.designs[other].walls.includes(edge);
      stopClock(room, at);
      room.moves++;
      room.lastAction = {
        mark,
        from,
        to: hit ? from : to,
        wall: hit ? edge : null,
        hit,
        goal: false,
      };
      if (hit) {
        if (!room.revealed[mark].includes(edge)) room.revealed[mark].push(edge);
        db.prepare("UPDATE mecung_rooms SET ui_dirty=1 WHERE id=?").run(
          room.id,
        );
        // The solver failed their last chance to match the opponent's completed turn.
        if (room.finishedTurns[other] !== null)
          return finish(room, "win", other, at);
        room.turn = other;
        room.turns[other]++;
      } else {
        room.positions[mark] = to;
        room.steps[mark]++;
        if (!room.visited[mark].includes(to)) room.visited[mark].push(to);
        if (!room.knownOpen[mark].includes(edge))
          room.knownOpen[mark].push(edge);
        if (to === room.designs[other].goal) {
          room.lastAction.goal = true;
          room.finishedTurns[mark] = room.turns[mark];
          if (room.rules.winCondition === "race")
            return finish(room, "win", mark, at);
          if (room.finishedTurns[other] !== null) {
            const mine = room.finishedTurns[mark],
              theirs = room.finishedTurns[other];
            return finish(
              room,
              mine === theirs ? "draw" : "win",
              mine === theirs ? null : mine < theirs ? mark : other,
              at,
            );
          }
          if (room.turns[other] >= room.finishedTurns[mark])
            return finish(room, "win", mark, at);
          room.turn = other;
          room.turns[other]++;
          db.prepare("UPDATE mecung_rooms SET ui_dirty=1 WHERE id=?").run(
            room.id,
          );
        }
      }
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
    const size = PRESETS[rules.mode];
    return {
      id: room.id,
      size,
      rules,
      rulesLabel: rulesText(rules),
      // Private designs never enter an opponent/spectator projection, even after the match.
      design: mark ? structuredClone(room.designs[mark]) : null,
      setupRevision: mark ? room.setupRevision[mark] : null,
      ready: { ...room.ready },
      setupDeadline: room.setupDeadline,
      boards: Object.fromEntries(
        ["X", "O"].map((runner) => {
          const target = room.designs[runner === "X" ? "O" : "X"];
          return [
            runner,
            {
              start: room.startedAt === null ? null : target.start,
              goal: room.startedAt === null ? null : target.goal,
              position: room.positions[runner],
              visited: [...room.visited[runner]],
              revealedWalls: [...room.revealed[runner]],
              knownOpen: [...room.knownOpen[runner]],
              turns: room.turns[runner],
              steps: room.steps[runner],
              finishedTurn: room.finishedTurns[runner],
            },
          ];
        }),
      ),
      status: room.status,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
      ...playerIdentityView(room, "mecung"),
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
    design,
    randomize,
    ready,
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
