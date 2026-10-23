"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bot-stale-backup-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");
process.env.DB_BACKUP_DIR = path.join(directory, "backups");
const backup = require("../src/services/databaseBackupService");

(async () => {
  fs.mkdirSync(process.env.DB_BACKUP_DIR, { recursive: true });
  const now = Date.now();
  const make = (name, ageMs) => {
    const file = path.join(process.env.DB_BACKUP_DIR, name);
    fs.writeFileSync(file, "x");
    const time = new Date(now - ageMs);
    fs.utimesSync(file, time, time);
    return file;
  };
  const stamp = "2026-10-21T08-15-51-160Z-c9535e7d";
  const old = 2 * 60 * 60_000;
  const stale = [
    make(`game-bot-${stamp}.sqlite.partial`, old),
    make(`game-bot-${stamp}.sqlite.partial-journal`, old),
    make(`game-bot-${stamp}.sqlite.partial-wal`, old),
    make(`game-bot-${stamp}.sqlite.discord-7f2404adb9a80465.gz`, old),
  ];
  const keep = [
    make(
      `game-bot-${stamp}.sqlite.partial`.replace(
        stamp,
        "2026-10-23T11-27-59-727Z-5a1a051d",
      ),
      5 * 60_000,
    ), // đang sao lưu
    make(
      "game-bot-2026-10-23T11-00-00-000Z-aaaaaaaa.sqlite.discord-1234abcd5678ef90.gz",
      60_000,
    ), // đang gửi
    make(`game-bot-${stamp}.sqlite`, old), // bản hoàn chỉnh: do giới hạn số bản xử lý, không bị dọn như file dở
    make("notes.partial", old), // file lạ không đụng
    make("game-bot-evil.sqlite.partial.txt", old),
  ];
  const removed = await backup.cleanupStaleBackupFiles({ now });
  assert.equal(removed, stale.length);
  for (const file of stale) assert(!fs.existsSync(file), file);
  for (const file of keep) assert(fs.existsSync(file), file);
  assert.equal(
    await backup.cleanupStaleBackupFiles({ now }),
    0,
    "chạy lại không xóa thêm",
  );
  // Thư mục chưa tồn tại không gây lỗi
  fs.rmSync(process.env.DB_BACKUP_DIR, { recursive: true, force: true });
  assert.equal(await backup.cleanupStaleBackupFiles({ now }), 0);
  // cleanupBackups cũng dọn file dở
  fs.mkdirSync(process.env.DB_BACKUP_DIR, { recursive: true });
  const leftover = make(`game-bot-${stamp}.sqlite.partial`, old);
  await backup.cleanupBackups();
  assert(!fs.existsSync(leftover), "cleanupBackups dọn luôn file dở");
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, backupStaleFiles: true }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
