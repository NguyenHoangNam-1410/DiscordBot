const { db } = require('../db');

const retentionValue = Number(process.env.GAME_RECORD_RETENTION_DAYS);
const GAME_RECORD_RETENTION_DAYS = Number.isSafeInteger(retentionValue) && retentionValue >= 1 && retentionValue <= 365 ? retentionValue : 7;

// Finished duels and tables keep their decks, hands and results in JSON; drop them once the retention window has passed.
function cleanupFinishedGameRecords(now = Date.now(), retentionDays = GAME_RECORD_RETENTION_DAYS) {
  const cutoff = now - retentionDays * 86_400_000;
  return db.transaction(() => {
    const duels = db.prepare("DELETE FROM rps_duels WHERE status IN ('completed','declined','expired') AND updated_at<?").run(cutoff).changes;
    const blackjackDuels = db.prepare("DELETE FROM blackjack_duels WHERE status IN ('completed','declined','expired') AND updated_at<?").run(cutoff).changes;
    const oldTables = db.prepare("SELECT id FROM blackjack_tables WHERE status IN ('completed','expired') AND updated_at<?").all(cutoff).map(row => row.id);
    const deleteLocks = db.prepare('DELETE FROM blackjack_table_locks WHERE table_id=?'); const deleteTable = db.prepare('DELETE FROM blackjack_tables WHERE id=?');
    for (const id of oldTables) { deleteLocks.run(id); deleteTable.run(id); }
    return { rpsDuels: duels, blackjackDuels, blackjackTables: oldTables.length };
  })();
}

module.exports = { GAME_RECORD_RETENTION_DAYS, cleanupFinishedGameRecords };
