const { db } = require("../db");
function getRound(id) {
  return (
    db
      .prepare(
        "SELECT * FROM multiplayer_rounds WHERE id = ? AND game = 'duangua'",
      )
      .get(String(id)) || null
  );
}
function parseRoundData(round) {
  try {
    return round?.result_json ? JSON.parse(round.result_json) : {};
  } catch {
    return {};
  }
}
function savePlan(roundId, data) {
  db.prepare(
    "UPDATE multiplayer_rounds SET status='racing', result_json=? WHERE id=? AND status='open'",
  ).run(JSON.stringify(data), String(roundId));
}
function saveSettlement(roundId, data) {
  db.prepare(
    "UPDATE multiplayer_rounds SET status='closed',result_json=? WHERE id=?",
  ).run(JSON.stringify(data), String(roundId));
}
function getOpen(guildId) {
  return (
    db
      .prepare(
        "SELECT * FROM multiplayer_rounds WHERE guild_id=? AND game='duangua' AND status IN ('open','racing') ORDER BY created_at DESC LIMIT 1",
      )
      .get(String(guildId)) || null
  );
}
function stats(roundId) {
  return db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) AS players,COALESCE(SUM(amount),0) AS pool FROM multiplayer_bets WHERE round_id=?",
    )
    .get(String(roundId));
}
function getBets(roundId) {
  return db
    .prepare("SELECT * FROM multiplayer_bets WHERE round_id=?")
    .all(String(roundId));
}
function getUserBets(roundId, userId) {
  return db
    .prepare(
      "SELECT choice,amount FROM multiplayer_bets WHERE round_id=? AND user_id=? ORDER BY amount DESC",
    )
    .all(String(roundId), String(userId));
}
function listActive() {
  return db
    .prepare(
      "SELECT * FROM multiplayer_rounds WHERE game='duangua' AND status IN ('open','racing')",
    )
    .all();
}
function betTotals(roundId, userId, choice) {
  const current =
    db
      .prepare(
        "SELECT amount FROM multiplayer_bets WHERE round_id=? AND user_id=? AND choice=?",
      )
      .get(String(roundId), String(userId), String(choice))?.amount || 0;
  const total = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) amount FROM multiplayer_bets WHERE round_id=? AND user_id=?",
    )
    .get(String(roundId), String(userId)).amount;
  return { current, total };
}
function addBet(roundId, userId, choice, amount, now = Date.now()) {
  db.prepare(
    `INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES(?,?,?,?,?,?)
  ON CONFLICT(round_id,user_id,choice) DO UPDATE SET amount=amount+excluded.amount,updated_at=excluded.updated_at`,
  ).run(String(roundId), String(userId), String(choice), amount, now, now);
}
function createRound(round, result) {
  db.prepare(
    `INSERT INTO multiplayer_rounds (id,guild_id,game,channel_id,message_id,status,closes_at,result_json,created_at)
  VALUES (?,?,'duangua',?,NULL,?,?,?,?)`,
  ).run(
    round.id,
    round.guild_id,
    round.channel_id,
    round.status,
    round.closes_at,
    JSON.stringify(result),
    round.created_at,
  );
}
function setMessageId(id, messageId) {
  db.prepare("UPDATE multiplayer_rounds SET message_id=? WHERE id=?").run(
    String(messageId),
    String(id),
  );
}
module.exports = {
  getRound,
  parseRoundData,
  savePlan,
  saveSettlement,
  getOpen,
  stats,
  getBets,
  getUserBets,
  listActive,
  betTotals,
  addBet,
  createRound,
  setMessageId,
};
