const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const testDb = path.resolve(__dirname, "../data/test-operations.sqlite");
const backupDir = path.resolve(__dirname, "../data/test-backups");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
fs.rmSync(backupDir, { recursive: true, force: true });

// Simulate a database created before operation_id existed so the migration is
// exercised instead of only testing a brand-new schema.
const legacy = new Database(testDb);
legacy.exec(`CREATE TABLE economy_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE game_channels (
  guild_id TEXT NOT NULL,
  game TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, game),
  UNIQUE (guild_id, channel_id)
);
INSERT INTO game_channels(guild_id,game,channel_id,updated_at)
  VALUES('legacy-guild','baucua','shared-casino',1)`);
legacy.close();

process.env.DB_PATH = testDb;
process.env.DB_BACKUP_DIR = backupDir;
const { db } = require("../src/db");
const backup = require("../src/services/databaseBackupService");

async function main() {
  assert(
    db
      .prepare("PRAGMA table_info(economy_transactions)")
      .all()
      .some((column) => column.name === "operation_id"),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_economy_transactions_operation'",
      )
      .get(),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='diamond_transactions'",
      )
      .get(),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_settings'",
      )
      .get(),
  );
  assert(
    db
      .prepare("PRAGMA table_info(game_player_stats)")
      .all()
      .some((column) => column.name === "coins_earned"),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='weekly_role_rewards'",
      )
      .get(),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='weekly_role_reward_grants'",
      )
      .get(),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='gacha_pool_entries'",
      )
      .get(),
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_reward_buffs'",
      )
      .get(),
  );
  assert(
    db
      .prepare("PRAGMA table_info(gacha_history)")
      .all()
      .some((column) => column.name === "operation_id"),
  );
  assert.deepEqual(
    db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version),
    [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
    ],
  );
  db.prepare(
    "INSERT INTO game_channels(guild_id,game,channel_id,updated_at) VALUES(?,?,?,?)",
  ).run("legacy-guild", "taixiu", "shared-casino", 2);
  assert.deepEqual(
    db
      .prepare(
        "SELECT game FROM game_channels WHERE guild_id='legacy-guild' ORDER BY game",
      )
      .all()
      .map((row) => row.game),
    ["baucua", "taixiu"],
  );
  assert(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='chinchiro_sessions'",
      )
      .get(),
  );
  assert.equal(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_preferences'",
      )
      .get(),
    undefined,
  );
  db.prepare(
    "INSERT INTO economy_accounts(guild_id,user_id,balance,last_daily_at,games_played,wins,losses,draws,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run("backup-guild", "alice", 4321, 0, 0, 0, 0, 0, 1, 1);

  const result = await backup.runDatabaseBackup(
    new Date("2026-09-26T00:00:00.000Z"),
  );
  assert.equal(fs.existsSync(result.destination), true);
  const restored = new Database(result.destination, { readonly: true });
  assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
  assert.equal(
    restored
      .prepare(
        "SELECT balance FROM economy_accounts WHERE guild_id='backup-guild' AND user_id='alice'",
      )
      .get().balance,
    4321,
  );
  restored.close();
  db.close();
  fs.rmSync(backupDir, { recursive: true, force: true });
  for (const suffix of ["", "-wal", "-shm"])
    fs.rmSync(`${testDb}${suffix}`, { force: true });
  console.log(
    JSON.stringify({ ok: true, migration: true, backupRestore: true }),
  );
}

main().catch((error) => {
  try {
    db.close();
  } catch {}
  console.error(error);
  process.exitCode = 1;
});
