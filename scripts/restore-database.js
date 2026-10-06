"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

// Do not import src/db: restoring must never auto-create or migrate the live database.
async function restoreDatabase(sourceFile, destinationFile) {
  if (!sourceFile || !destinationFile)
    throw new Error("RESTORE_REQUIRES_SOURCE_AND_DESTINATION");
  const source = path.resolve(sourceFile),
    destination = path.resolve(destinationFile);
  if (source === destination)
    throw new Error("RESTORE_SOURCE_EQUALS_DESTINATION");
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    if (fs.existsSync(destination + suffix))
      throw new Error("RESTORE_DESTINATION_EXISTS");
  const temporary = `${destination}.${crypto.randomBytes(8).toString("hex")}.partial`;
  let input;
  try {
    input = new Database(source, { readonly: true, fileMustExist: true });
    if (input.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("RESTORE_SOURCE_INTEGRITY_FAILED");
    if (
      !input
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
        )
        .get()
    )
      throw new Error("RESTORE_NOT_BOT_DATABASE");
    await input.backup(temporary);
    const snapshot = new Database(temporary, { fileMustExist: true });
    try {
      if (snapshot.pragma("integrity_check", { simple: true }) !== "ok")
        throw new Error("RESTORE_INTEGRITY_FAILED");
      if (
        snapshot.pragma("journal_mode = DELETE", { simple: true }) !== "delete"
      )
        throw new Error("RESTORE_JOURNAL_FINALIZATION_FAILED");
    } finally {
      snapshot.close();
    }
    const handle = await fs.promises.open(temporary, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (const suffix of ["-wal", "-shm", "-journal"])
      if (fs.existsSync(destination + suffix))
        throw new Error("RESTORE_DESTINATION_EXISTS");
    // Same-directory hard link publishes the complete file atomically and refuses overwrite.
    await fs.promises.link(temporary, destination);
    if (process.platform !== "win32") {
      const directory = await fs.promises.open(path.dirname(destination), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
    return { source, destination, verified: true };
  } finally {
    input?.close();
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      await fs.promises.rm(temporary + suffix, { force: true }).catch(() => {});
  }
}
if (require.main === module) {
  const [source, destination, ...extra] = process.argv.slice(2);
  if (!source || !destination || extra.length) {
    console.error(
      "Dùng: npm run db:restore -- <backup.sqlite> <database-moi.sqlite>",
    );
    process.exitCode = 1;
  } else
    restoreDatabase(source, destination)
      .then((result) => {
        console.log(JSON.stringify(result));
        console.log(
          "Đã kiểm tra và phục hồi. Giữ bot dừng, đặt DB_PATH tới database mới rồi khởi động bot.",
        );
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
module.exports = { restoreDatabase };
