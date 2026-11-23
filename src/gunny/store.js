"use strict";

const { createRoomIdentity, resolveRoomId } = require("../webGames/roomLinks");
const { EventEmitter } = require("node:events");
const engine = require("./engine");
const { randomInt } = require("node:crypto");
const {
  CHARACTERS,
  WEAPONS,
  ITEMS,
  STAMINA,
  POW_MAX,
  WALK_COST,
  HP,
} = require("./rules");
const {
  makePlayer: player,
  playerIdentityView,
} = require("../webGames/playerIdentity");
const { normalizeRules, rulesText } = require("./rules");
const {
  initialClock,
  stopClock,
  startClock,
  clockView,
} = require("../webGames/clock");

const WAIT_MS = 10 * 60_000;
const DEFAULT_ROOM_LIMIT = 5;
const MAX_ROOM_LIMIT = 20;
const SETUP_MS = 180000,
  IDLE_MS = 300000;
const MESSAGES = {
  ROOM_MISSING: "Không tìm thấy phòng.",
  ROOM_CLOSED: "Phòng đã kết thúc.",
  ALREADY_PLAYING: "Bạn đang ở phòng Gunny khác trong server.",
  CHANNEL_FULL: "Kênh đã đủ phòng Gunny đang mở.",
  INVALID_ROOM_LIMIT: "Chọn số phòng từ 1 đến 20.",
  SELF_JOIN: "Bạn là chủ phòng. Hãy chờ đối thủ.",
  ROOM_FULL: "Phòng đã đủ hai người.",
  NOT_PLAYER: "Bạn không phải người chơi của phòng.",
  NOT_HOST: "Chỉ chủ phòng được hủy phòng chờ.",
  NOT_STARTED: "Đang chờ đối thủ.",
  NOT_TURN: "Chưa đến lượt của bạn.",
  STALE_BOARD: "Ván vừa thay đổi. Hãy thử lại trên trạng thái mới.",
  INVALID_ACTION: "Thao tác không hợp lệ trong giai đoạn này.",
  INVALID_CHARACTER: "Chọn Gấu, Mèo hoặc Robot.",
  ALREADY_READY: "Bạn đã sẵn sàng.",
  INVALID_MOVE: "Mỗi bước đi phải từ 1 đến 10 và còn thể lực.",
  NO_STAMINA: "Không đủ thể lực cho thao tác này.",
  FROZEN:
    "Bạn đang bị đóng băng: lượt này không di chuyển hoặc dùng đạo cụ được.",
  INVALID_ITEM: "Đạo cụ không hợp lệ.",
  ITEM_USED: "Mỗi đạo cụ chỉ dùng một lần mỗi lượt.",
  ITEM_LIMIT: "Đạo cụ này đã hết lượt dùng trong trận.",
  ITEM_CONFLICT: "Bay không dùng chung với đạo cụ đạn hoặc tuyệt kỹ.",
  FULL_HP: "Máu đã đầy.",
  FLY_COOLDOWN: "Bay đang hồi, chờ thêm lượt.",
  POW_NOT_READY: "Nộ chưa đầy 100.",
  BLOCKED_MOVE: "Không thể đi thêm theo hướng này.",
  INVALID_SHOT:
    "Góc bắn phải nằm trong vùng xanh của vũ khí theo độ nghiêng hiện tại; kiểm tra lại lực và hướng.",
  NO_AMMO: "Vũ khí này đã hết đạn.",
  INVALID_RULES: "Cấu hình phòng không hợp lệ.",
};

function fail(code) {
  throw Object.assign(new Error(MESSAGES[code]), { code });
}
function createStore(db, now = Date.now, options = {}) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  // With the real clock, wake each open room at its next deadline (shot end,
  // turn limit, clock flag, idle) so every viewer gets the new turn at once
  // instead of waiting for someone to poll.
  const wakeups = options.wakeups ?? now === Date.now,
    timers = new Map();
  function nextWake(room) {
    if (room.status === "waiting") return room.createdAt + WAIT_MS;
    if (room.status === "setup") return room.setupDeadline;
    if (room.status !== "playing") return null;
    if (room.phase === "firing") return room.shot?.endsAt ?? null;
    const r = normalizeRules(room.rules);
    return Math.min(
      room.clockStartedAt + room.clocks[room.turn],
      room.turnStartedAt + r.turnSeconds * 1000,
      room.lastInputAt + IDLE_MS,
    );
  }
  function schedule(room) {
    if (!wakeups) return;
    clearTimeout(timers.get(room.id));
    timers.delete(room.id);
    const at = nextWake(room);
    if (!Number.isFinite(at)) return;
    const timer = setTimeout(
      () => {
        timers.delete(room.id);
        try {
          get(room.id);
        } catch {
          // A later request or sweep retries.
        }
      },
      Math.min(2 ** 31 - 1, Math.max(0, at - now()) + 25),
    );
    timer.unref?.();
    timers.set(room.id, timer);
  }
  const raw = (id) => {
    const row = db
      .prepare("SELECT data_json FROM gunny_rooms WHERE id=?")
      .get(id);
    return row ? engine.upgradeState(JSON.parse(row.data_json)) : null;
  };
  function save(room) {
    room.version++;
    db.prepare(
      "UPDATE gunny_rooms SET ui_dirty=CASE WHEN status<>? THEN 1 ELSE ui_dirty END,status=?,data_json=? WHERE id=?",
    ).run(room.status, room.status, JSON.stringify(room), room.id);
    if (!["waiting", "setup", "playing"].includes(room.status))
      db.prepare("DELETE FROM gunny_seats WHERE room_id=?").run(room.id);
    schedule(room);
    return room;
  }
  function dirty(room) {
    db.prepare("UPDATE gunny_rooms SET ui_dirty=1 WHERE id=?").run(room.id);
  }
  function finish(room, reason, winner = null, at = now()) {
    stopClock(room, at);
    room.phase = "done";
    room.status = "finished";
    room.reason = reason;
    room.winner = winner;
    room.closedAt = at;
    dirty(room);
    return save(room);
  }
  // The fighter with the lowest delay acts next; poison can end the match
  // at the start of a turn.
  function nextTurn(room, at) {
    const last = room.turn;
    room.turn = engine.chooseNext(room, last) || (last === "X" ? "O" : "X");
    room.turnNo++;
    const report = engine.startTurn(room, room.turn);
    room.turnReport = report;
    room.phase = "aim";
    room.turnStartedAt = at;
    engine.wind(room);
    if (room.fighters[room.turn].hp <= 0) {
      room.lastAction = {
        type: "poison",
        mark: room.turn,
        damage: report.poison,
      };
      return finish(room, "poison", room.turn === "X" ? "O" : "X", at);
    }
    startClock(room, at);
    dirty(room);
    return save(room);
  }
  function expire(room) {
    if (!room) return room;
    const at = now();
    if (room.status === "waiting" && at >= room.createdAt + WAIT_MS)
      return finish(room, "expired", null, room.createdAt + WAIT_MS);
    if (room.status === "setup" && at >= room.setupDeadline) {
      const ready = ["X", "O"].filter((m) => room.ready[m]);
      return finish(
        room,
        "setup_timeout",
        ready.length === 1 ? ready[0] : null,
        room.setupDeadline,
      );
    }
    const r = normalizeRules(room.rules),
      idleAt = room.lastInputAt + IDLE_MS;
    for (let i = 0; i < 64 && room.status === "playing"; i++) {
      if (room.phase === "firing") {
        if (at < room.shot.endsAt) break;
        if (room.pendingOutcome)
          return finish(
            room,
            room.pendingOutcome.reason,
            room.pendingOutcome.winner,
            room.shot.endsAt,
          );
        nextTurn(room, room.shot.endsAt);
        continue;
      }
      const bank = room.clockStartedAt + room.clocks[room.turn],
        deadline = Math.min(bank, room.turnStartedAt + r.turnSeconds * 1000);
      if (at >= idleAt && idleAt <= deadline)
        return finish(room, "idle", null, idleAt);
      if (at < deadline) break;
      if (bank <= deadline)
        return finish(room, "timeout", room.turn === "X" ? "O" : "X", bank);
      stopClock(room, deadline);
      engine.addDelay(room, room.turn, "timeout");
      room.lastAction = {
        type: "skip",
        mark: room.turn,
        reason: "turn_timeout",
      };
      nextTurn(room, deadline);
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
        "SELECT id FROM gunny_rooms WHERE status IN ('waiting','setup','playing')",
      )
      .all();
    for (const { id } of rows) {
      get(id);
    }
  }
  function claim(room, userId) {
    if (
      db
        .prepare("SELECT 1 FROM gunny_seats WHERE guild_id=? AND user_id=?")
        .get(room.guildId, userId)
    )
      fail("ALREADY_PLAYING");
    db.prepare(
      "INSERT INTO gunny_seats(guild_id,user_id,room_id) VALUES(?,?,?)",
    ).run(room.guildId, userId, room.id);
  }
  function getChannelLimit(guildId, channelId) {
    return (
      db
        .prepare(
          "SELECT max_rooms FROM gunny_channel_settings WHERE guild_id=? AND channel_id=?",
        )
        .get(guildId, channelId)?.max_rooms ?? DEFAULT_ROOM_LIMIT
    );
  }
  function setChannelLimit(guildId, channelId, limit, actorId) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROOM_LIMIT)
      fail("INVALID_ROOM_LIMIT");
    db.prepare(
      "INSERT INTO gunny_channel_settings(guild_id,channel_id,max_rooms,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,channel_id) DO UPDATE SET max_rooms=excluded.max_rooms,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    ).run(guildId, channelId, limit, actorId, now());
    return limit;
  }
  function listOpen(guildId, channelId) {
    sweep();
    return db
      .prepare(
        "SELECT data_json FROM gunny_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing') ORDER BY json_extract(data_json,'$.createdAt'),id",
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
            "SELECT count(*) AS count FROM gunny_rooms WHERE guild_id=? AND channel_id=? AND status IN ('waiting','setup','playing')",
          )
          .get(options.guildId, options.channelId);
        if (count >= limit)
          throw Object.assign(
            new Error(
              `Kênh đã đủ ${limit} phòng gunny đang mở. Dùng /gunny phong để xem và tham gia phòng hiện có.`,
            ),
            { code: "CHANNEL_FULL" },
          );
        const room = {
          ...createRoomIdentity(db, "gunny"),
          guildId: options.guildId,
          channelId: options.channelId,
          messageId: null,
          players: { X: player(options.user), O: null },
          status: "waiting",
          rules,
          ...engine.createState(options.seed ?? randomInt(0x7fffffff)),
          ready: { X: false, O: false },
          phase: "setup",
          turnNo: 0,
          shot: null,
          pendingOutcome: null,
          history: [],
          lastInputAt: now(),
          setupDeadline: null,
          turnStartedAt: null,
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
        // The second player starts one point behind so the first move is fixed.
        room.fighters[room.first === "X" ? "O" : "X"].delay = 1;
        db.prepare(
          "INSERT INTO gunny_rooms(id,guild_id,channel_id,status,data_json) VALUES(?,?,?,?,?)",
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
      room.lastInputAt = now();
      dirty(room);
      return save(room);
    });
  }
  function move(id, userId, data, version) {
    return change(id, (room) => {
      const mark = seat(room, userId);
      if (!mark) fail("NOT_PLAYER");
      if (room.status === "waiting") fail("NOT_STARTED");
      if (!["setup", "playing"].includes(room.status)) fail("ROOM_CLOSED");
      if (room.version !== version) fail("STALE_BOARD");
      const at = now();
      if (room.status === "setup") {
        if (data.type !== "ready") fail("INVALID_ACTION");
        if (room.ready[mark]) fail("ALREADY_READY");
        if (!CHARACTERS.includes(data.character)) fail("INVALID_CHARACTER");
        room.fighters[mark].character = data.character;
        room.ready[mark] = true;
        room.lastInputAt = at;
        room.lastAction = { type: "ready", mark };
        if (room.ready.X && room.ready.O) {
          room.status = "playing";
          room.phase = "aim";
          room.turnNo = 1;
          room.turnStartedAt = at;
          room.turnReport = engine.startTurn(room, room.turn);
          startClock(room, at);
        }
        dirty(room);
        return save(room);
      }
      if (room.phase !== "aim") fail("INVALID_ACTION");
      if (room.turn !== mark) fail("NOT_TURN");
      if (data.type === "walk") {
        const error = engine.walk(room, mark, data.dx);
        if (error) fail(error);
        room.lastInputAt = at;
        return save(room);
      }
      if (data.type === "item" || data.type === "pow") {
        const error =
          data.type === "pow"
            ? engine.usePow(room, mark)
            : engine.useItem(room, mark, data.item);
        if (error) fail(error);
        room.lastInputAt = at;
        room.lastAction = { type: data.type, mark, item: data.item || "pow" };
        dirty(room);
        return save(room);
      }
      if (data.type === "pass") {
        stopClock(room, at);
        engine.addDelay(room, mark, "pass");
        room.lastInputAt = at;
        room.lastAction = { type: "pass", mark };
        return nextTurn(room, at);
      }
      if (data.type !== "fire") fail("INVALID_ACTION");
      const result = engine.fire(room, mark, data);
      if (result.error) fail(result.error);
      engine.addDelay(room, mark, "fire", {
        weapon: data.weapon,
        aimMs: at - room.turnStartedAt,
        turnSeconds: normalizeRules(room.rules).turnSeconds,
      });
      stopClock(room, at);
      room.phase = "firing";
      room.moves++;
      room.lastInputAt = at;
      room.shot = {
        ...result.shot,
        id: room.moves,
        startedAt: at,
        endsAt: at + result.shot.flightMs + 900,
      };
      room.pendingOutcome = result.outcome;
      room.lastAction = {
        type: "fire",
        mark,
        weapon: data.weapon,
        damage: result.shot.damage,
      };
      room.history.push({
        turn: room.turnNo,
        mark,
        weapon: data.weapon,
        items: result.shot.items,
        pow: result.shot.pow,
        fly: result.shot.fly,
        damage: result.shot.damage,
      });
      room.history = room.history.slice(-12);
      dirty(room);
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
  // The terrain (~16 KB) is only sent when the receiver does not already
  // have this revision, so walking and item updates stay a few KB.
  function snapshot(room, userId, context = {}) {
    const rev = room.terrainRev || 0,
      known = context.stream?.terrainRev ?? context.request?.terrainRev,
      firing = room.phase === "firing",
      sendTerrain = !firing && known !== rev;
    if (sendTerrain && context.stream) context.stream.terrainRev = rev;
    const at = now(),
      rules = normalizeRules(room.rules),
      me = seat(room, userId);
    return {
      id: room.id,
      roomCode: room.roomCode,
      rules,
      rulesLabel: rulesText(rules),
      status: room.status,
      phase: room.phase,
      first: room.first,
      turn: room.turn,
      turnNo: room.turnNo,
      moves: room.moves,
      version: room.version,
      players: { X: room.players.X.name, O: room.players.O?.name || null },
      ...playerIdentityView(room, "gunny"),
      me,
      ready: room.ready,
      fighters: room.fighters,
      // null while a shot replays (clients rebuild it from shot.before and the
      // craters) or when the receiver already has this terrainRev.
      terrain: sendTerrain ? room.terrain : null,
      terrainRev: rev,
      wind: room.wind,
      weapons: WEAPONS,
      items: ITEMS,
      limits: { hp: HP, stamina: STAMINA, pow: POW_MAX, walkCost: WALK_COST },
      turnReport: room.turnReport || null,
      shot: room.shot,
      history: room.history,
      lastAction: room.lastAction,
      winner: room.winner,
      reason: room.reason || null,
      ...clockView(room, rules.timeMinutes, at),
      clockStartedAt:
        room.status === "playing" && room.phase === "aim" ? at : null,
      turnDeadline:
        room.status === "playing" && room.phase === "aim"
          ? Math.min(
              room.turnDeadline,
              room.turnStartedAt + rules.turnSeconds * 1000,
            )
          : null,
      setupDeadline: room.setupDeadline,
      waitingDeadline: room.createdAt + WAIT_MS,
      serverNow: at,
    };
  }
  return {
    resolveId: (reference) => resolveRoomId(db, "gunny", reference),
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
  SETUP_MS,
  IDLE_MS,
};
