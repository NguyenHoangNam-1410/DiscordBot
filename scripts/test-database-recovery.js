"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fork, spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");
if (process.argv[2] === "--crash-worker") {
  const { db } = require("../src/db");
  const service = require("../src/services/hardcoreService");
  const repo = require("../src/services/hardcoreRepository");
  assert.equal(db.pragma("synchronous", { simple: true }), 2);
  db.pragma("wal_autocheckpoint = 0");
  const run = service.startHardcore({
    guildId: "recovery",
    userId: "player",
    channelId: "c",
    classKey: "barbarian",
    stake: 10,
    forcedEncounter: { type: "empty", name: "Trống" },
  });
  const state = repo.parseState(repo.getSession(run.session.id));
  state.floor = 42;
  state.cleared = 41;
  db.transaction(() => {
    db.prepare(
      "UPDATE economy_accounts SET balance=4321 WHERE guild_id='recovery' AND user_id='player'",
    ).run();
    repo.saveState(run.session, state);
  })();
  db.exec("BEGIN");
  db.prepare(
    "UPDATE economy_accounts SET balance=9999 WHERE guild_id='recovery' AND user_id='player'",
  ).run();
  state.floor = 666;
  repo.saveState(run.session, state);
  process.send({ sessionId: run.session.id });
  setInterval(() => {}, 1000);
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bot-recovery-"));
  // Validate the exact recursive cleanup target before creating any test data.
  assert.equal(
    path.dirname(path.resolve(directory)),
    path.resolve(os.tmpdir()),
  );
  assert(path.basename(directory).startsWith("bot-recovery-"));
  const databasePath = path.join(directory, "crash.sqlite");
  const backups = path.join(directory, "backups");
  process.env.DB_PATH = databasePath;
  process.env.DB_BACKUP_DIR = backups;
  process.env.DB_BACKUP_INTERVAL_MINUTES = "15";
  const groups = [];
  let db, child;
  async function main() {
    const message = await new Promise((resolve, reject) => {
      child = fork(__filename, ["--crash-worker"], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      let output = "";
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.once("error", reject);
      child.once("message", resolve);
      child.once("exit", (code) => {
        if (code !== null && code !== 0)
          reject(new Error(output || `child exited ${code}`));
      });
    });
    await new Promise((resolve, reject) => {
      child.once("exit", resolve);
      if (!child.kill("SIGKILL"))
        reject(new Error("Could not kill test worker"));
    });
    child = null;
    ({ db } = require("../src/db"));
    assert.equal(db.pragma("synchronous", { simple: true }), 2);
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    const balance = () =>
      db
        .prepare(
          "SELECT balance FROM economy_accounts WHERE guild_id='recovery' AND user_id='player'",
        )
        .get().balance;
    const runState = JSON.parse(
      db
        .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
        .get(message.sessionId).state_json,
    );
    assert.equal(balance(), 4321);
    assert.equal(runState.floor, 42);
    groups.push(
      "process kill retains committed balance/run and rolls back unfinished transaction",
    );

    const backup = require("../src/services/databaseBackupService");
    assert.equal(backup.BACKUP_INTERVAL_MINUTES, 15);
    assert.equal(backup.getBackupStatus().offsiteConfigured, false);
    const now = new Date("2026-10-06T00:00:00Z");
    assert.notEqual(backup.backupName(now), backup.backupName(now));
    const pending = backup.runDatabaseBackup(now);
    assert.strictEqual(backup.runDatabaseBackup(now), pending);
    const result = await pending;
    assert(result.verified);
    const snapshot = new Database(result.destination, {
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(snapshot.pragma("journal_mode", { simple: true }), "delete");
    assert.equal(snapshot.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(
      snapshot
        .prepare(
          "SELECT balance FROM economy_accounts WHERE guild_id='recovery' AND user_id='player'",
        )
        .get().balance,
      4321,
    );
    snapshot.close();
    assert(!fs.existsSync(result.destination + "-wal"));
    groups.push(
      "consistent standalone integrity-checked snapshot and shared concurrent requests",
    );

    const { restoreDatabase } = require("./restore-database");
    const restoredPath = path.join(directory, "restored.sqlite");
    const restored = await restoreDatabase(result.destination, restoredPath);
    assert(restored.verified);
    const restoredDb = new Database(restoredPath, {
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(
      restoredDb
        .prepare(
          "SELECT balance FROM economy_accounts WHERE guild_id='recovery' AND user_id='player'",
        )
        .get().balance,
      4321,
    );
    assert.equal(
      JSON.parse(
        restoredDb
          .prepare("SELECT state_json FROM hardcore_sessions WHERE id=?")
          .get(message.sessionId).state_json,
      ).floor,
      42,
    );
    restoredDb.close();
    await assert.rejects(
      restoreDatabase(result.destination, restoredPath),
      /DESTINATION_EXISTS/,
    );
    await assert.rejects(
      restoreDatabase(result.destination, result.destination),
      /SOURCE_EQUALS/,
    );
    const corrupt = path.join(directory, "corrupt.sqlite");
    fs.writeFileSync(corrupt, "not a sqlite file");
    await assert.rejects(
      restoreDatabase(corrupt, path.join(directory, "bad.sqlite")),
    );
    assert(!fs.existsSync(path.join(directory, "bad.sqlite")));
    assert(
      !fs.readdirSync(directory).some((name) => name.endsWith(".partial")),
    );
    groups.push(
      "restore preserves balance/run and refuses overwrite/corrupt input",
    );

    for (let n = 1; n < 4; n++)
      await backup.runDatabaseBackup(new Date(now.getTime() + n * 60_000));
    const unrelated = path.join(backups, "game-bot-manual.sqlite");
    const partial = path.join(backups, "keep.partial");
    fs.writeFileSync(unrelated, "unrelated");
    fs.writeFileSync(partial, "unfinished");
    await backup.cleanupBackups(2);
    assert.equal(
      fs.readdirSync(backups).filter((name) => /T.*Z.*\.sqlite$/.test(name))
        .length,
      2,
    );
    assert(fs.existsSync(unrelated));
    assert(fs.existsSync(partial));
    await assert.rejects(backup.cleanupBackups(0), /INVALID_BACKUP_RETENTION/);
    groups.push("retention prunes only generated complete backups");

    const original = db.backup;
    const success = backup.getBackupStatus().lastSuccessAt;
    db.backup = async (file) => {
      fs.writeFileSync(file, "broken");
    };
    try {
      await assert.rejects(backup.runDatabaseBackup());
    } finally {
      db.backup = original;
    }
    assert(backup.getBackupStatus().lastError);
    assert.equal(backup.getBackupStatus().lastSuccessAt, success);
    assert(!backup.getBackupStatus().running);
    assert(
      !fs.readdirSync(backups).some((name) => name.endsWith(".sqlite.partial")),
    );
    groups.push("invalid backup never published and temporary file cleaned");

    const events = [],
      logger = {
        info: (data) => events.push(data),
        error: (data) => {
          throw data.err;
        },
      };
    const manager = backup.startDatabaseBackups(logger);
    while (backup.getBackupStatus().running) await new Promise(setImmediate);
    // Data changed after the startup snapshot must be included in the final one.
    db.prepare(
      "UPDATE economy_accounts SET balance=5678 WHERE guild_id='recovery' AND user_id='player'",
    ).run();
    const stopping = manager.stop();
    assert.strictEqual(manager.stop(), stopping);
    await stopping;
    const final = new Database(backup.getBackupStatus().lastDestination, {
      readonly: true,
      fileMustExist: true,
    });
    assert.equal(
      final
        .prepare(
          "SELECT balance FROM economy_accounts WHERE guild_id='recovery' AND user_id='player'",
        )
        .get().balance,
      5678,
    );
    final.close();
    assert(events.length >= 2);
    groups.push("graceful stop takes a fresh verified snapshot once");

    const minuteProfile = spawnSync(
      process.execPath,
      [
        "-e",
        "const b=require('./src/services/databaseBackupService'); console.log(b.BACKUP_INTERVAL_MINUTES)",
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          DB_BACKUP_INTERVAL_MINUTES: "",
          DB_BACKUP_INTERVAL_HOURS: "2",
        },
        encoding: "utf8",
      },
    );
    assert.equal(minuteProfile.status, 0, minuteProfile.stderr);
    assert.equal(minuteProfile.stdout.trim(), "120");
    groups.push("legacy hourly config still works");
    console.log(JSON.stringify({ ok: true, groups }));
  }
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      child?.kill("SIGKILL");
      db?.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
}
