const { db } = require("../db");
function getSession(id) {
  return (
    db
      .prepare("SELECT * FROM hardcore_sessions WHERE id = ?")
      .get(String(id)) || null
  );
}
function getActiveSession(id, guildId) {
  return (
    db
      .prepare("SELECT * FROM hardcore_sessions WHERE id=? AND guild_id=?")
      .get(String(id), String(guildId)) || null
  );
}
function getByUser(guildId, userId) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_sessions WHERE guild_id = ? AND user_id = ?",
      )
      .get(String(guildId), String(userId)) || null
  );
}
function parseState(session) {
  return JSON.parse(session.state_json);
}
function saveState(session, state, now = Date.now()) {
  db.prepare(
    "UPDATE hardcore_sessions SET state_json = ?, updated_at = ? WHERE id = ?",
  ).run(JSON.stringify(state), now, session.id);
}
function setMessageId(id, messageId, now = Date.now()) {
  db.prepare(
    "UPDATE hardcore_sessions SET message_id = ?, updated_at = ? WHERE id = ?",
  ).run(String(messageId), now, String(id));
}
function touchSession(id, now = Date.now()) {
  db.prepare("UPDATE hardcore_sessions SET updated_at=? WHERE id=?").run(
    now,
    String(id),
  );
}
function insertSession(session, state) {
  db.prepare(
    "INSERT INTO hardcore_sessions (id,guild_id,user_id,channel_id,message_id,state_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)",
  ).run(
    session.id,
    session.guild_id,
    session.user_id,
    session.channel_id,
    JSON.stringify(state),
    session.created_at,
    session.updated_at,
  );
}
function deleteSession(id) {
  return db.prepare("DELETE FROM hardcore_sessions WHERE id=?").run(String(id))
    .changes;
}
function listStale(cutoff) {
  return db
    .prepare("SELECT * FROM hardcore_sessions WHERE updated_at<?")
    .all(cutoff);
}
function upsertRecord(guildId, userId, values, now = Date.now()) {
  db.prepare(
    `INSERT INTO hardcore_records (guild_id,user_id,best_floor,runs,deaths,escapes,completions,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET
    best_floor=MAX(best_floor,excluded.best_floor),runs=runs+excluded.runs,deaths=deaths+excluded.deaths,
    escapes=escapes+excluded.escapes,completions=completions+excluded.completions,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(userId),
    values.bestFloor,
    values.runs,
    values.deaths,
    values.escapes,
    values.completions,
    now,
  );
}
function addEventStats(
  guildId,
  userId,
  { events = 0, chains = 0, kinds = [], kills = 0, bossKills = 0, bosses = {} },
  now = Date.now(),
) {
  if (!events && !chains && !kills && !bossKills) return;
  const row = db
    .prepare("SELECT kinds_json FROM hardcore_event_stats WHERE guild_id=? AND user_id=?")
    .get(String(guildId), String(userId));
  const merged = Array.from(new Set([...(row ? JSON.parse(row.kinds_json) : []), ...kinds]));
  db.prepare(
    `INSERT INTO hardcore_event_stats (guild_id,user_id,events,chains,kinds_json,kills,boss_kills,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id,user_id) DO UPDATE SET events=events+excluded.events,chains=chains+excluded.chains,
    kills=kills+excluded.kills,boss_kills=boss_kills+excluded.boss_kills,
    kinds_json=excluded.kinds_json,updated_at=excluded.updated_at`,
  ).run(String(guildId), String(userId), events, chains, JSON.stringify(merged), kills, bossKills, now);
  const bump = db.prepare(
    `INSERT INTO hardcore_boss_kills (guild_id,user_id,boss,count) VALUES (?,?,?,?)
    ON CONFLICT(guild_id,user_id,boss) DO UPDATE SET count=count+excluded.count`,
  );
  for (const [boss, count] of Object.entries(bosses))
    bump.run(String(guildId), String(userId), boss, count);
}
function getRecord(guildId, userId) {
  return (
    db
      .prepare("SELECT * FROM hardcore_records WHERE guild_id=? AND user_id=?")
      .get(String(guildId), String(userId)) || null
  );
}
function getTop(guildId, limit) {
  return db
    .prepare(
      `WITH progress AS (
        SELECT guild_id,user_id,best_floor,runs,deaths,escapes,completions,updated_at FROM hardcore_records WHERE guild_id=?
        UNION ALL
        SELECT guild_id,user_id,
          CASE WHEN json_extract(state_json,'$.cleared')>=999 AND NOT COALESCE(json_extract(state_json,'$.finalBossDefeated'),0)
            THEN 998 ELSE COALESCE(json_extract(state_json,'$.cleared'),0) END,
          1,0,0,CASE WHEN json_extract(state_json,'$.cleared')>=100 THEN 1 ELSE 0 END,updated_at
        FROM hardcore_sessions WHERE guild_id=?
      ) SELECT guild_id,user_id,MAX(best_floor) best_floor,SUM(runs) runs,SUM(deaths) deaths,
        SUM(escapes) escapes,SUM(completions) completions,MAX(updated_at) updated_at
      FROM progress GROUP BY guild_id,user_id
      ORDER BY best_floor DESC,completions DESC,updated_at ASC LIMIT ?`,
    )
    .all(String(guildId), String(guildId), limit);
}
module.exports = {
  addEventStats,
  getSession,
  getActiveSession,
  getByUser,
  parseState,
  saveState,
  setMessageId,
  touchSession,
  insertSession,
  deleteSession,
  listStale,
  upsertRecord,
  getRecord,
  getTop,
};
