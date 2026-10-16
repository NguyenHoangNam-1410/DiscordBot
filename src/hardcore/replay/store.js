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
    .map((r) => ({
      seq: r.seq,
      turn: r.turn,
      floor: r.floor,
      action: r.action,
      context: JSON.parse(r.context_json),
      at: r.created_at,
      state: JSON.parse(inflateRawSync(r.state_blob).toString("utf8")).view,
    }));
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
module.exports = { ensure, append, close, get, encounter, publicState };
