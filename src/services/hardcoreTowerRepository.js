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
