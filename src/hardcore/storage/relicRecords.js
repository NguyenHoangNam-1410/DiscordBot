"use strict";
const { db } = require("../../db");
const IDS = Object.freeze(["conquerors_covenant", "gilded_soul"]);
function record(session, state, relicId, floor, now = Date.now()) {
  if (
    !IDS.includes(relicId) ||
    !session?.id ||
    !session.guild_id ||
    !session.user_id ||
    state.gameplayVersion !== 2 ||
    state.mode?.startsWith("tower") ||
    state.towerChallengeId ||
    !Number.isSafeInteger(floor) ||
    floor < 1 ||
    floor > 999
  )
    throw new Error("INVALID_RELIC_RECORD");
  return Boolean(
    db
      .prepare(
        "INSERT OR IGNORE INTO hardcore_relic_acquisitions(session_id,relic_id,guild_id,user_id,class_key,floor,acquired_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        String(session.id),
        relicId,
        String(session.guild_id),
        String(session.user_id),
        state.classKey,
        floor,
        now,
      ).changes,
  );
}
function totals(guildId, userId) {
  const result = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (const row of db
    .prepare(
      "SELECT relic_id,COUNT(*) count FROM hardcore_relic_acquisitions WHERE guild_id=? AND user_id=? GROUP BY relic_id",
    )
    .all(String(guildId), String(userId)))
    result[row.relic_id] = row.count;
  return result;
}
function history(guildId, userId, relicId) {
  return db
    .prepare(
      "SELECT class_key,floor,acquired_at FROM hardcore_relic_acquisitions WHERE guild_id=? AND user_id=? AND relic_id=? ORDER BY acquired_at DESC,rowid DESC LIMIT 3",
    )
    .all(String(guildId), String(userId), relicId);
}
module.exports = { IDS, record, totals, history };
