"use strict";
const { db } = require("../../db");
const { deflateRawSync, inflateRawSync } = require("node:zlib");
function ensure(session, state) {
  const exists = db
    .prepare("SELECT 1 FROM hardcore_replays WHERE session_id=?")
    .get(session.id);
  if (exists) return;
  db.prepare(
    "INSERT INTO hardcore_replays(session_id,guild_id,user_id,created_at,partial) VALUES(?,?,?,?,?)",
  ).run(
    session.id,
    session.guild_id,
    session.user_id,
    session.created_at,
    state.turn > 0 ? 1 : 0,
  );
  append(
    session,
    state,
    state.turn > 0 ? "recording_started" : "start",
    state.floor,
  );
}
function append(session, state, action, floor, context = {}) {
  const row = db
    .prepare("SELECT next_seq FROM hardcore_replays WHERE session_id=?")
    .get(session.id);
  if (!row) throw Error("REPLAY_NOT_STARTED");
  db.prepare("INSERT INTO hardcore_replay_frames VALUES(?,?,?,?,?,?,?,?)").run(
    session.id,
    row.next_seq,
    state.turn || 0,
    floor || 1,
    String(action),
    JSON.stringify(context),
    deflateRawSync(
      Buffer.from(
        JSON.stringify({ schema: 1, state, view: publicState(state) }),
      ),
      { level: 1 },
    ),
    Date.now(),
  );
  db.prepare(
    "UPDATE hardcore_replays SET next_seq=next_seq+1 WHERE session_id=?",
  ).run(session.id);
}
function close(session, state, reason, result) {
  ensure(session, state);
  const summary = {
    reason,
    payout: result?.payout || 0,
    diamonds: result?.diamonds || 0,
    cleared: state.cleared || 0,
    turns: state.turn || 0,
    killedBy: state.killedBy || null,
    beta: state.mode === "beta",
  };
  db.prepare(
    "UPDATE hardcore_replays SET ended_at=?,reason=?,result_json=? WHERE session_id=? AND ended_at IS NULL",
  ).run(Date.now(), reason, JSON.stringify(summary), session.id);
}
function get(guildId, code) {
  const id = String(code || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(id)) throw Error("INVALID_REPLAY_CODE");
  // Scope to the invoking guild before revealing whether this code exists.
  const run = db
    .prepare("SELECT * FROM hardcore_replays WHERE session_id=? AND guild_id=?")
    .get(id, String(guildId));
  if (
    db
      .prepare("SELECT 1 FROM hardcore_sessions WHERE id=? AND guild_id=?")
      .get(id, String(guildId)) ||
    (run && !run.ended_at)
  )
    throw Error("REPLAY_RUN_ACTIVE");
  if (!run) {
    const old = db
      .prepare(
        "SELECT session_id,release_version,class_key,cleared,reason,stake,payout,diamonds,turns,created_at,ended_at FROM hardcore_run_archive WHERE session_id=? AND guild_id=?",
      )
      .get(id, String(guildId));
    if (!old) throw Error("REPLAY_NOT_FOUND");
    return {
      schema: 1,
      id,
      partial: true,
      summaryOnly: true,
      createdAt: old.created_at,
      endedAt: old.ended_at,
      result: { ...old, session_id: undefined },
      frames: [],
    };
  }
  const frames = db
    .prepare(
      "SELECT * FROM hardcore_replay_frames WHERE session_id=? ORDER BY seq",
    )
    .all(id)
    .map((r) => {
      const saved = JSON.parse(inflateRawSync(r.state_blob).toString("utf8"));
      const state = saved.view || publicState(saved.state || saved);
      if (!state.presentation)
        state.presentation = {
          ...require("./presentation").capture(saved.state || saved),
          supplemented: true,
        };
      return {
        seq: r.seq,
        turn: r.turn,
        floor: r.floor,
        action: r.action,
        context: JSON.parse(r.context_json),
        at: r.created_at,
        state,
      };
    });
  return {
    schema: 1,
    id,
    partial: !!run.partial,
    summaryOnly: false,
    createdAt: run.created_at,
    endedAt: run.ended_at,
    result: JSON.parse(run.result_json),
    frames,
  };
}
function pick(object, keys) {
  return Object.fromEntries(
    keys.filter((k) => object?.[k] !== undefined).map((k) => [k, object[k]]),
  );
}
function encounter(e) {
  return {
    ...pick(e || {}, [
      "type",
      "name",
      "kind",
      "rank",
      "hp",
      "maxHp",
      "damageMin",
      "damageMax",
      "damageType",
      "defense",
      "resistance",
      "accuracy",
      "evasion",
      "critChance",
      "barrier",
      "barrierHp",
      "shieldHp",
      "shieldMaxHp",
    ]),
    boss: pick(e?.boss, ["id", "name", "phase", "mechanicState"]),
  };
}
function publicState(s) {
  // Export an allowlist. Fairness seeds, account IDs, event rolls and private payloads never leave SQLite.
  return {
    ...pick(s, [
      "classKey",
      "className",
      "playerName",
      "gameplayVersion",
      "releaseVersion",
      "mode",
      "turn",
      "floor",
      "cleared",
      "phase",
      "hp",
      "maxHp",
      "mana",
      "maxMana",
      "energy",
      "maxEnergy",
      "str",
      "dex",
      "vit",
      "ene",
      "damageMin",
      "damageMax",
      "spellMin",
      "spellMax",
      "defense",
      "resistance",
      "accuracy",
      "evasion",
      "critChance",
      "critDamage",
      "luck",
      "potions",
      "potionRate",
      "escapeTokens",
      "barrier",
      "barrierHp",
      "barrierTurns",
      "lastLog",
      "lastStatChanges",
      "killedBy",
      "stake",
    ]),
    barrier:
      Number(s.barrier || 0) +
      Number(
        s.venanceState?.barrier || s.encounter?.venanceCombat?.barrier || 0,
      ) +
      Number(s.encounter?.soulCombat?.guardBarrier || 0) +
      Number(s.encounter?.awakeningCombat?.barrier || 0) +
      (s.classKey === "druid" ? Number(s.classAwakening?.bark || 0) : 0),
    presentation: require("./presentation").capture(s),
    soul: pick(s.characterSoul, ["characterId", "soulLevel"]),
    encounter: encounter(s.encounter),
    items: (s.items || []).map((i) => ({
      name: i.definition?.name || i.name || i.id,
      level: i.level || 1,
      rarity: i.definition?.typeCode || i.typeCode,
      effects: i.effects || i.definition?.effects || {},
      curse: i.curse?.effects || i.definition?.curse?.effects || null,
    })),
    rifts: Object.fromEntries(
      Object.entries(
        s.rift?.stacks || s.rifts || s.riftModifiers || s.modifiers || {},
      ).filter(([, count]) => Number(count) > 0),
    ),
    memories: s.debts || s.towerRemembers || s.towerMemory || [],
    effects: pick(s, [
      "activeParadox",
      "paradox",
      "riftContract",
      "contract",
      "classShrine",
      "awakening",
      "innate",
      "beta",
      "classAwakening",
      "classSoulCombat",
      "venanceCombat",
      "classInnate",
      "venanceState",
      "explorationMarks",
      "adventurerRescue",
      "prophecy",
      "grudge",
    ]),
  };
}
// ---- Dọn replay cũ ---------------------------------------------------------------
// Mỗi lượt lưu một ảnh chụp trạng thái nén nên bảng frame phình rất nhanh (hàng trăm MB, nhân lên ở mọi bản backup).
// Replay đã kết thúc quá hạn bị xóa; hardcore_run_archive vẫn giữ bản tóm tắt nên mã replay cũ vẫn xem được kết quả.
const DAY_MS = 24 * 60 * 60_000;
const REPLAY_RETENTION_DAYS = (() => {
  const value = Number(process.env.HARDCORE_REPLAY_RETENTION_DAYS);
  return Number.isSafeInteger(value) && value >= 1 && value <= 3650
    ? value
    : 14;
})();
// Replay đã kết thúc quá COMPACT_AFTER_DAYS chỉ cần phần hiển thị (view); bỏ state engine để giảm ~60% dung lượng.
const COMPACT_AFTER_DAYS = (() => {
  const value = Number(process.env.HARDCORE_REPLAY_COMPACT_DAYS);
  return Number.isSafeInteger(value) && value >= 1 && value <= 3650 ? value : 3;
})();
const PRUNE_BATCH = 50;
const PRUNE_MAX_BATCHES = 40;

function pruneOldReplays({
  days = REPLAY_RETENTION_DAYS,
  now = Date.now(),
  batches = PRUNE_MAX_BATCHES,
} = {}) {
  const cutoff = now - days * DAY_MS;
  // Replay không bao giờ được đóng (run bị xóa sót) chỉ xóa khi không còn phiên chơi và đã quá 2× hạn.
  const stale = db.prepare(
    `SELECT session_id FROM hardcore_replays r
     WHERE (r.ended_at IS NOT NULL AND r.ended_at < ?)
        OR (r.ended_at IS NULL AND r.created_at < ?
            AND NOT EXISTS (SELECT 1 FROM hardcore_sessions s WHERE s.id=r.session_id))
     LIMIT ?`,
  );
  const removeFrames = db.prepare(
    "DELETE FROM hardcore_replay_frames WHERE session_id=?",
  );
  const removeRun = db.prepare(
    "DELETE FROM hardcore_replays WHERE session_id=?",
  );
  let replays = 0;
  for (let batch = 0; batch < batches; batch += 1) {
    const ids = stale.all(cutoff, now - 2 * days * DAY_MS, PRUNE_BATCH);
    if (!ids.length) break;
    db.transaction(() => {
      for (const { session_id: id } of ids) {
        removeFrames.run(id);
        removeRun.run(id);
      }
    })();
    replays += ids.length;
  }
  return { replays };
}
function compactOldReplays({
  days = COMPACT_AFTER_DAYS,
  now = Date.now(),
  batches = PRUNE_MAX_BATCHES,
} = {}) {
  const cutoff = now - days * DAY_MS;
  const pending = db.prepare(
    `SELECT session_id FROM hardcore_replays
     WHERE ended_at IS NOT NULL AND ended_at < ? AND compacted_at IS NULL LIMIT ?`,
  );
  const frames = db.prepare(
    "SELECT seq,state_blob FROM hardcore_replay_frames WHERE session_id=?",
  );
  const update = db.prepare(
    "UPDATE hardcore_replay_frames SET state_blob=? WHERE session_id=? AND seq=?",
  );
  const mark = db.prepare(
    "UPDATE hardcore_replays SET compacted_at=? WHERE session_id=?",
  );
  let replays = 0;
  for (let batch = 0; batch < batches; batch += 1) {
    const ids = pending.all(cutoff, PRUNE_BATCH);
    if (!ids.length) break;
    db.transaction(() => {
      for (const { session_id: id } of ids) {
        for (const row of frames.all(id)) {
          let saved;
          try {
            saved = JSON.parse(inflateRawSync(row.state_blob).toString("utf8"));
          } catch {
            continue;
          }
          if (!saved.state) continue;
          const view = saved.view || publicState(saved.state);
          update.run(
            deflateRawSync(Buffer.from(JSON.stringify({ schema: 1, view })), {
              level: 6,
            }),
            id,
            row.seq,
          );
        }
        mark.run(now, id);
      }
    })();
    replays += ids.length;
  }
  return { replays };
}
function startReplayMaintenance(logger = console) {
  const run = () => {
    try {
      const compacted = compactOldReplays().replays;
      if (compacted)
        logger.info?.({ replays: compacted }, "compacted survival replays");
      const { replays } = pruneOldReplays();
      if (replays)
        logger.info?.({ replays }, "pruned expired survival replays");
    } catch (error) {
      logger.warn?.({ err: error }, "survival replay pruning failed");
    }
  };
  // Trễ một chút sau khi khởi động để không cạnh tranh với backup và việc nạp bot.
  setTimeout(run, 90_000).unref?.();
  const timer = setInterval(run, 6 * 60 * 60_000);
  timer.unref?.();
  return timer;
}

module.exports = {
  ensure,
  append,
  close,
  get,
  encounter,
  publicState,
  pruneOldReplays,
  compactOldReplays,
  COMPACT_AFTER_DAYS,
  startReplayMaintenance,
  REPLAY_RETENTION_DAYS,
};
