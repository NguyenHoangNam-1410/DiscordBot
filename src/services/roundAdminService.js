const { db } = require("../db");
const { creditCoins } = require("./economyService");

const GAME_NAMES = Object.freeze({
  baucua: "BẦU CUA",
  taixiu: "TÀI XỈU",
  duangua: "ĐUA NGỰA",
});

function forceEndSharedRound(id, guildId, adminId) {
  return db.transaction(() => {
    const round = db
      .prepare(
        "SELECT * FROM multiplayer_rounds WHERE id=? AND guild_id=? AND status IN ('open','racing')",
      )
      .get(String(id), String(guildId));
    if (!round) return null;
    const stakes = db
      .prepare(
        "SELECT user_id, SUM(amount) AS amount FROM multiplayer_bets WHERE round_id=? GROUP BY user_id",
      )
      .all(round.id);
    for (const row of stakes) {
      creditCoins({
        guildId: round.guild_id,
        userId: row.user_id,
        amount: row.amount,
        reason: `${round.game}:admin-refund:${adminId}:${round.id}`,
        operationId: `refund:round-admin:${round.id}:${row.user_id}`,
      });
    }
    db.prepare(
      "UPDATE multiplayer_rounds SET status='cancelled' WHERE id=?",
    ).run(round.id);
    return {
      session: round,
      participants: stakes.map((row) => row.user_id),
      gameName: GAME_NAMES[round.game] || "GAME",
    };
  })();
}

module.exports = { forceEndSharedRound };
