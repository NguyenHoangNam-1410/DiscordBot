const fs = require("node:fs");
const path = require("node:path");
const { db, dbPath } = require("../db");

const DAY_MS = 24 * 60 * 60 * 1000;

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

const BACKUP_INTERVAL_HOURS = integerEnv(
  "DB_BACKUP_INTERVAL_HOURS",
  24,
  1,
  168,
);
const BACKUP_RETENTION = integerEnv("DB_BACKUP_RETENTION", 14, 2, 90);
const backupDir = path.resolve(
  process.env.DB_BACKUP_DIR || path.join(path.dirname(dbPath), "backups"),
);
const backupStatus = {
  running: false,
  lastStartedAt: null,
  lastSuccessAt: null,
  lastDestination: null,
  lastError: null,
};

function backupName(now = new Date()) {
  return `game-bot-${now.toISOString().replace(/[:.]/g, "-")}.sqlite`;
}

async function cleanupBackups(retention = BACKUP_RETENTION) {
  const files = (await fs.promises.readdir(backupDir, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && /^game-bot-.*\.sqlite$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(
    files
      .slice(retention)
      .map((name) => fs.promises.unlink(path.join(backupDir, name))),
  );
  return Math.max(0, files.length - retention);
}

async function runDatabaseBackup(now = new Date()) {
  await fs.promises.mkdir(backupDir, { recursive: true });
  const destination = path.join(backupDir, backupName(now));
  const temporary = `${destination}.partial`;
  await fs.promises.rm(temporary, { force: true });
  try {
    await db.backup(temporary);
    await fs.promises.rename(temporary, destination);
    const deleted = await cleanupBackups();
    return { destination, deleted };
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function startDatabaseBackups(logger = console) {
  let stopped = false;
  let pending = null;
  const run = () => {
    if (stopped || pending) return pending;
    backupStatus.running = true;
    backupStatus.lastStartedAt = new Date().toISOString();
    pending = runDatabaseBackup()
      .then((result) => {
        backupStatus.lastSuccessAt = new Date().toISOString();
        backupStatus.lastDestination = result.destination;
        backupStatus.lastError = null;
        logger.info?.(result, "database backup completed");
      })
      .catch((error) => {
        backupStatus.lastError = error?.message || String(error);
        logger.error?.({ err: error }, "database backup failed");
      })
      .finally(() => {
        pending = null;
        backupStatus.running = false;
      });
    return pending;
  };
  run();
  const timer = setInterval(run, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref?.();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await pending;
    },
  };
}

function getBackupStatus() {
  return {
    ...backupStatus,
    backupDir,
    retention: BACKUP_RETENTION,
    intervalHours: BACKUP_INTERVAL_HOURS,
  };
}

module.exports = {
  DAY_MS,
  BACKUP_INTERVAL_HOURS,
  BACKUP_RETENTION,
  backupDir,
  backupName,
  cleanupBackups,
  runDatabaseBackup,
  startDatabaseBackups,
  getBackupStatus,
};
