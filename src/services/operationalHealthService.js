const fs = require("node:fs");
const { db, dbPath } = require("../db");
const monitoring = require("./monitoringService");
const { getBackupStatus } = require("./databaseBackupService");

function scalar(sql) {
  return db.prepare(sql).get().count;
}

function getOperationalHealth() {
  const sessions = scalar(`SELECT
    (SELECT COUNT(*) FROM blackjack_sessions) +
    (SELECT COUNT(*) FROM poker_sessions) +
    (SELECT COUNT(*) FROM mines_sessions) +
    (SELECT COUNT(*) FROM coquay_sessions) +
    (SELECT COUNT(*) FROM chinchiro_sessions) +
    (SELECT COUNT(*) FROM hardcore_sessions) AS count`);
  const multiplayer = scalar(
    "SELECT COUNT(*) count FROM multiplayer_rounds WHERE status IN ('open','racing')",
  );
  const duels = scalar(
    "SELECT (SELECT COUNT(*) FROM blackjack_duels WHERE status IN ('invited','playing')) count",
  );
  const migration = db
    .prepare("SELECT COALESCE(MAX(version),0) version FROM schema_migrations")
    .get().version;
  let databaseBytes = 0;
  try {
    databaseBytes = fs.statSync(dbPath).size;
  } catch {}
  return {
    database: {
      check: db.pragma("quick_check", { simple: true }),
      bytes: databaseBytes,
      migration,
    },
    active: {
      sessions,
      multiplayer,
      duels,
      total: sessions + multiplayer + duels,
    },
    backup: getBackupStatus(),
    runtime: monitoring.getRuntimeStatus(),
  };
}

module.exports = { getOperationalHealth };
