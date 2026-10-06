const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const { db, dbPath } = require("../db");
const discordBackup = require("./discordBackupService");

const DAY_MS = 24 * 60 * 60 * 1000;
function integerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
const configuredHours = integerEnv("DB_BACKUP_INTERVAL_HOURS", 24, 1, 168);
const BACKUP_INTERVAL_MINUTES = integerEnv(
  "DB_BACKUP_INTERVAL_MINUTES",
  configuredHours * 60,
  1,
  168 * 60,
);
const BACKUP_INTERVAL_HOURS = BACKUP_INTERVAL_MINUTES / 60;
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
let activeBackup = null;
function backupName(now = new Date()) {
  return `game-bot-${now.toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}.sqlite`;
}
const BACKUP_FILE =
  /^game-bot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-[a-f0-9]{8})?\.sqlite$/;
async function cleanupBackups(retention = BACKUP_RETENTION) {
  if (!Number.isSafeInteger(retention) || retention < 1)
    throw new Error("INVALID_BACKUP_RETENTION");
  const files = (await fs.promises.readdir(backupDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && BACKUP_FILE.test(entry.name))
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
async function syncDirectory(directory) {
  // Node cannot open directory handles for fsync on Windows.
  if (process.platform === "win32") return;
  const handle = await fs.promises.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function performBackup(now) {
  backupStatus.running = true;
  backupStatus.lastStartedAt = new Date().toISOString();
  let temporary;
  try {
    await fs.promises.mkdir(backupDir, { recursive: true });
    const destination = path.join(backupDir, backupName(now));
    temporary = `${destination}.partial`;
    await db.backup(temporary);
    // Finish a standalone file: restore must not depend on backup WAL sidecars.
    const snapshot = new Database(temporary, { fileMustExist: true });
    try {
      if (snapshot.pragma("integrity_check", { simple: true }) !== "ok")
        throw new Error("BACKUP_INTEGRITY_FAILED");
      if (
        snapshot.pragma("journal_mode = DELETE", { simple: true }) !== "delete"
      )
        throw new Error("BACKUP_JOURNAL_FINALIZATION_FAILED");
    } finally {
      snapshot.close();
    }
    const handle = await fs.promises.open(temporary, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(temporary, destination);
    temporary = null;
    await syncDirectory(backupDir);
    const deleted = await cleanupBackups();
    backupStatus.lastSuccessAt = new Date().toISOString();
    backupStatus.lastDestination = destination;
    backupStatus.lastError = null;
    return { destination, deleted, verified: true };
  } catch (error) {
    backupStatus.lastError = error?.message || String(error);
    if (temporary) {
      for (const suffix of ["", "-wal", "-shm", "-journal"])
        await fs.promises
          .rm(temporary + suffix, { force: true })
          .catch(() => {});
    }
    throw error;
  } finally {
    backupStatus.running = false;
  }
}
function runDatabaseBackup(now = new Date()) {
  // Manual/scheduled requests share one snapshot, avoiding pruning unfinished files.
  if (activeBackup) return activeBackup;
  activeBackup = performBackup(now).finally(() => {
    activeBackup = null;
  });
  return activeBackup;
}
function startDatabaseBackups(
  logger = console,
  { retryDelayMs = 5 * 60_000 } = {},
) {
  let stopped = false,
    pending = null,
    stopPromise = null,
    retryTimer = null;
  const deliver = async (destination) => {
    clearTimeout(retryTimer);
    retryTimer = null;
    try {
      const result = await discordBackup.sendDiscordBackup(destination);
      if (result.status === "sent")
        logger.info?.(result, "database backup delivered to Discord DM");
    } catch (error) {
      logger.error?.(
        { code: error.code || error.name },
        "database backup Discord delivery failed",
      );
      if (!stopped) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (!stopped && backupStatus.lastDestination)
            void deliver(backupStatus.lastDestination);
        }, retryDelayMs);
        retryTimer.unref?.();
      }
    }
  };
  const report = (promise) =>
    promise
      .then(async (result) => {
        logger.info?.(result, "database backup completed");
        await deliver(result.destination);
        return result;
      })
      .catch((error) => {
        logger.error?.({ err: error }, "database backup failed");
      });
  const run = () => {
    if (stopped || pending) return pending;
    pending = report(runDatabaseBackup()).finally(() => {
      pending = null;
    });
    return pending;
  };
  run();
  const timer = setInterval(run, BACKUP_INTERVAL_MINUTES * 60 * 1000);
  timer.unref?.();
  return {
    discordReady: async (client) => {
      discordBackup.setBackupDiscordClient(client);
      if (pending) await pending;
      else if (backupStatus.lastDestination)
        await deliver(backupStatus.lastDestination);
    },
    stop: ({ finalBackup = true } = {}) => {
      if (stopPromise) return stopPromise;
      stopped = true;
      clearInterval(timer);
      clearTimeout(retryTimer);
      stopPromise = (async () => {
        await pending;
        await discordBackup.waitForDiscordBackups();
        if (finalBackup) return report(runDatabaseBackup());
      })();
      return stopPromise;
    },
  };
}
function getBackupStatus() {
  return {
    ...backupStatus,
    backupDir,
    retention: BACKUP_RETENTION,
    intervalHours: BACKUP_INTERVAL_HOURS,
    intervalMinutes: BACKUP_INTERVAL_MINUTES,
    offsiteConfigured: discordBackup.getDiscordBackupStatus().configured,
    discord: discordBackup.getDiscordBackupStatus(),
  };
}
module.exports = {
  DAY_MS,
  BACKUP_INTERVAL_HOURS,
  BACKUP_INTERVAL_MINUTES,
  BACKUP_RETENTION,
  backupDir,
  backupName,
  cleanupBackups,
  runDatabaseBackup,
  startDatabaseBackups,
  getBackupStatus,
};
