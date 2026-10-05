"use strict";
const { db } = require("../db");
function session(id) {
  return (
    db
      .prepare("SELECT * FROM hardcore_tower_sessions WHERE id=?")
      .get(String(id)) || null
  );
}
function byUser(guild, user, challenge) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_sessions WHERE guild_id=? AND user_id=? AND challenge_id=?",
      )
      .get(String(guild), String(user), challenge) || null
  );
}
function result(guild, user, challenge) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_results WHERE guild_id=? AND user_id=? AND challenge_id=?",
      )
      .get(String(guild), String(user), challenge) || {
      attempts: 0,
      best_floor: 0,
      completed_at: null,
      reward_claimed_at: null,
    }
  );
}
function save(row, state, now) {
  db.prepare(
    "UPDATE hardcore_tower_sessions SET state_json=?,updated_at=? WHERE id=?",
  ).run(JSON.stringify(state), now, row.id);
}
function insert(row, state, now) {
  db.prepare(
    "INSERT INTO hardcore_tower_sessions(id,guild_id,user_id,challenge_id,content_version,channel_id,message_id,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?,?)",
  ).run(
    row.id,
    row.guild_id,
    row.user_id,
    row.challenge_id,
    row.content_version,
    row.channel_id,
    JSON.stringify(state),
    now,
    now,
  );
}
function message(id, messageId) {
  db.prepare("UPDATE hardcore_tower_sessions SET message_id=? WHERE id=?").run(
    String(messageId),
    String(id),
  );
}
function attempt(row, now) {
  db.prepare(
    "INSERT INTO hardcore_tower_results(guild_id,user_id,challenge_id,attempts,best_floor,updated_at) VALUES(?,?,?,1,1,?) ON CONFLICT(guild_id,user_id,challenge_id) DO UPDATE SET attempts=attempts+1,updated_at=excluded.updated_at",
  ).run(row.guild_id, row.user_id, row.challenge_id, now);
}
function progress(row, state, now) {
  db.prepare(
    "UPDATE hardcore_tower_results SET best_floor=MAX(best_floor,?),completed_at=COALESCE(completed_at,?),updated_at=? WHERE guild_id=? AND user_id=? AND challenge_id=?",
  ).run(
    state.floor,
    state.status === "completed" ? now : null,
    now,
    row.guild_id,
    row.user_id,
    row.challenge_id,
  );
}
function reward(row, hash, now) {
  return db
    .prepare(
      "UPDATE hardcore_tower_results SET reward_claimed_at=?,solution_hash=? WHERE guild_id=? AND user_id=? AND challenge_id=? AND reward_claimed_at IS NULL",
    )
    .run(now, hash, row.guild_id, row.user_id, row.challenge_id).changes;
}
function top(guild, challenge, limit = 10) {
  return db
    .prepare(
      "SELECT * FROM hardcore_tower_results WHERE guild_id=? AND challenge_id=? ORDER BY (completed_at IS NOT NULL) DESC,attempts ASC,completed_at ASC,user_id ASC LIMIT ?",
    )
    .all(String(guild), challenge, limit);
}
module.exports = {
  session,
  byUser,
  result,
  save,
  insert,
  message,
  attempt,
  progress,
  reward,
  top,
};

function challenge(id) {
  return (
    db
      .prepare("SELECT * FROM hardcore_tower_challenges WHERE challenge_id=?")
      .get(id) || null
  );
}
function challengeByWeek(year, week) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_challenges WHERE iso_year=? AND iso_week=?",
      )
      .get(year, week) || null
  );
}
function rotation() {
  return db.prepare("SELECT * FROM hardcore_tower_rotation WHERE id=1").get();
}
function activeChallenge(now) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_challenges WHERE status='published' AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC LIMIT 1",
      )
      .get(now, now) || null
  );
}
function recentChallenge(now) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_challenges WHERE status IN ('published','archived') AND starts_at<=? ORDER BY starts_at DESC LIMIT 1",
      )
      .get(now) || null
  );
}
function lastPublication() {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_challenges WHERE status IN ('published','archived') ORDER BY starts_at DESC LIMIT 1",
      )
      .get() || null
  );
}
function archiveChallenges(now) {
  db.prepare(
    "UPDATE hardcore_tower_challenges SET status='archived' WHERE status='published' AND ends_at<=?",
  ).run(now);
}
function generationFailure(startsAt) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_tower_generation_failures WHERE starts_at=?",
      )
      .get(startsAt) || null
  );
}
function noteGenerationFailure(startsAt, reason, now) {
  db.prepare(
    "INSERT INTO hardcore_tower_generation_failures VALUES(?,?,?) ON CONFLICT(starts_at) DO UPDATE SET reason=excluded.reason,retry_at=excluded.retry_at",
  ).run(startsAt, reason, now + 300000);
}
function clearGenerationFailure(startsAt) {
  db.prepare(
    "DELETE FROM hardcore_tower_generation_failures WHERE starts_at=?",
  ).run(startsAt);
}
const publishChallenge = db.transaction((payload, audit, index, now) => {
  const existing = challengeByWeek(payload.isoYear, payload.isoWeek);
  if (existing) return existing;
  if (rotation().next_index !== index) throw Error("STALE_TOWER_ROTATION");
  const catalog = require("../hardcore/tower/challengeCatalog"),
    previous = lastPublication(),
    expectedStart = previous
      ? previous.starts_at + catalog.WEEK_MS
      : catalog.ANCHOR;
  if (
    payload.startsAt !== expectedStart ||
    payload.endsAt !== expectedStart + catalog.WEEK_MS
  )
    throw Error("OUT_OF_ORDER_TOWER_PUBLICATION");
  const { CLASS_ROTATION } = require("../hardcore/tower/classProfiles");
  if (payload.classKey !== CLASS_ROTATION[index % 7])
    throw Error("INVALID_TOWER_ROTATION");
  const proof = require("../hardcore/tower/solver").validate(payload);
  if (
    proof.solutionHash !== payload.solutionHash ||
    proof.solutionHash !== audit.solutionHash ||
    proof.difficultyScore !== payload.difficultyScore
  )
    throw Error("INVALID_TOWER_AUDIT");
  const { canonicalSolution, ...report } = proof;
  db.prepare(
    "INSERT INTO hardcore_tower_challenges VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'validated',?,?,?,?)",
  ).run(
    payload.challengeId,
    payload.isoYear,
    payload.isoWeek,
    index,
    payload.classKey,
    payload.generatorVersion,
    payload.contentVersion,
    payload.seedCommitment,
    JSON.stringify(payload),
    payload.stepCount,
    payload.solutionHash,
    payload.difficultyScore,
    JSON.stringify(report),
    payload.startsAt,
    payload.endsAt,
    now,
    null,
  );
  db.prepare(
    "UPDATE hardcore_tower_challenges SET status='published',published_at=? WHERE challenge_id=? AND status='validated'",
  ).run(now, payload.challengeId);
  db.prepare(
    "UPDATE hardcore_tower_rotation SET next_index=next_index+1 WHERE id=1",
  ).run();
  return challenge(payload.challengeId);
});
Object.assign(module.exports, {
  challenge,
  challengeByWeek,
  rotation,
  activeChallenge,
  recentChallenge,
  lastPublication,
  archiveChallenges,
  generationFailure,
  noteGenerationFailure,
  clearGenerationFailure,
  publishChallenge,
});

function beginAttempt(row, now) {
  db.prepare(
    "INSERT OR IGNORE INTO hardcore_tower_results(guild_id,user_id,challenge_id,attempts,best_floor,updated_at) VALUES(?,?,?,0,1,?)",
  ).run(row.guild_id, row.user_id, row.challenge_id, now);
  // The v1 fixture is superseded mid-week: carry its reward claim, preventing
  // an additional weekly payout while leaving the old attempt untouched.
  if (row.challenge_id === "tower:2026:W41:sorceress:g3")
    db.prepare(
      "UPDATE hardcore_tower_results SET reward_claimed_at=(SELECT reward_claimed_at FROM hardcore_tower_results WHERE guild_id=? AND user_id=? AND challenge_id='tower-2026-W41-v1') WHERE guild_id=? AND user_id=? AND challenge_id=? AND reward_claimed_at IS NULL",
    ).run(
      row.guild_id,
      row.user_id,
      row.guild_id,
      row.user_id,
      row.challenge_id,
    );
}
module.exports.beginAttempt = beginAttempt;
