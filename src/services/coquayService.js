const { db } = require("../db");
function forceEndCoquaySession(id, guildId) {
  return db
    .prepare("DELETE FROM coquay_sessions WHERE id=? AND guild_id=?")
    .run(id, guildId).changes
    ? { id, guild_id: guildId, refunded: 0 }
    : null;
}
function retired() {
  throw new Error("Cò quay Nga đã chuyển sang web. Dùng /coquay choi.");
}
module.exports = {
  forceEndCoquaySession,
  startCoquay: retired,
  playCoquay: retired,
  getCoquayByUser: () => null,
};
