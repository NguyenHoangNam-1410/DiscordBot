"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bot-dm-backup-"));
assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
assert(path.basename(directory).startsWith("bot-dm-backup-"));
process.env.DB_PATH = path.join(directory, "test.sqlite");
process.env.DB_BACKUP_DIR = path.join(directory, "backups");
process.env.DB_BACKUP_DISCORD_USER_ID =
  require("../src/discordBackupConfig.json").recipientId;
const { db } = require("../src/db");
const backup = require("../src/services/databaseBackupService");
const delivery = require("../src/services/discordBackupService");
const { restoreDiscordBackup } = require("./restore-discord-backup");
const configured = require("../src/discordBackupConfig.json").recipientId;
const groups = [];
const blob = crypto.randomBytes(150 * 1024);
db.exec("CREATE TABLE dm_probe(value BLOB)");
db.prepare("INSERT INTO dm_probe VALUES(?)").run(blob);
let number = 0;
const create = () =>
  backup.runDatabaseBackup(new Date(1791280800000 + ++number * 1000));
function transport(fail = null) {
  const calls = [];
  return {
    calls,
    user: { id: "111111111111111111" },
    rest: {
      post: async (route, request) => {
        calls.push({ route, request });
        if (fail) await fail(route, request);
        if (route === "/users/@me/channels") {
          assert.equal(request.body.recipient_id, configured);
          return { id: "987654321012345678" };
        }
        assert(route === "/channels/987654321012345678/messages");
        assert.deepEqual(request.body.allowed_mentions, { parse: [] });
        assert(request.body.enforce_nonce);
        assert(request.body.nonce.length <= 25);
        assert(request.signal instanceof AbortSignal);
        return {
          id: String(900000000000000000n + BigInt(calls.length)),
          channel_id: "987654321012345678",
        };
      },
    },
  };
}
function download(client, folder) {
  fs.mkdirSync(folder);
  let manifestFile;
  for (const call of client.calls)
    for (const file of call.request.files || []) {
      assert(Buffer.isBuffer(file.data));
      assert(file.data.length <= delivery.PART_BYTES);
      fs.writeFileSync(path.join(folder, file.name), file.data);
      if (file.name.endsWith(".manifest.json"))
        manifestFile = path.join(folder, file.name);
    }
  assert(manifestFile, "a completed backup needs a manifest");
  return manifestFile;
}
function assertRestored(destination) {
  const restored = new Database(destination, { readonly: true });
  assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
  assert.deepEqual(
    restored.prepare("SELECT value FROM dm_probe").get().value,
    blob,
  );
  restored.close();
}
function noTemporaryFiles() {
  assert(
    !fs
      .readdirSync(process.env.DB_BACKUP_DIR)
      .some((file) => file.includes(".discord-")),
  );
  assert(!fs.readdirSync(directory).some((file) => file.endsWith(".unpacked")));
}
async function main() {
  assert.equal(configured, "697794640148955206");
  assert(backup.getBackupStatus().offsiteConfigured);
  const first = await create();
  assert.equal(
    (await delivery.sendDiscordBackup(first.destination)).status,
    "waiting",
  );
  noTemporaryFiles();
  groups.push(
    "only explicit configured recipient; waits for Discord without losing local backup",
  );

  const single = transport();
  delivery.setBackupDiscordClient(single);
  const pending = delivery.sendDiscordBackup(first.destination);
  assert.strictEqual(delivery.sendDiscordBackup(first.destination), pending);
  const receipt = await pending;
  assert.equal(receipt.status, "sent");
  assert.equal(receipt.parts, 1);
  assert.equal(single.calls.length, 2);
  assert.equal(single.calls[1].request.files.length, 2);
  const oneManifest = download(single, path.join(directory, "single"));
  const oneRestored = path.join(directory, "one-restored.sqlite");
  await restoreDiscordBackup(oneManifest, oneRestored);
  assertRestored(oneRestored);
  await assert.rejects(
    restoreDiscordBackup(oneManifest, oneRestored),
    /DESTINATION_EXISTS/,
  );
  assert.equal(
    (await delivery.sendDiscordBackup(first.destination)).status,
    "already_sent",
  );
  assert.equal(single.calls.length, 2);
  noTemporaryFiles();
  groups.push(
    "single gzip + manifest restores the complete SQLite snapshot; duplicate delivery skipped",
  );

  const blockedSnapshot = await create();
  const blocked = transport(async () => {
    const e = new Error("blocked");
    e.code = 50007;
    throw e;
  });
  delivery.setBackupDiscordClient(blocked);
  const previousSuccess = delivery.getDiscordBackupStatus().lastSuccessAt;
  await assert.rejects(delivery.sendDiscordBackup(blockedSnapshot.destination));
  assert(delivery.getDiscordBackupStatus().lastError.includes("DM"));
  assert.equal(
    delivery.getDiscordBackupStatus().lastSuccessAt,
    previousSuccess,
  );
  assert(fs.existsSync(blockedSnapshot.destination));
  const retry = transport();
  delivery.setBackupDiscordClient(retry);
  assert.equal(
    (await delivery.sendDiscordBackup(blockedSnapshot.destination)).status,
    "sent",
  );
  assert.equal(delivery.getDiscordBackupStatus().lastError, null);
  noTemporaryFiles();
  groups.push(
    "blocked DM keeps local backup and prior success; failed delivery can retry",
  );

  const largeSnapshot = await create(),
    split = transport();
  delivery.setBackupDiscordClient(split);
  const splitReceipt = await delivery.sendDiscordBackup(
    largeSnapshot.destination,
    { partBytes: 8 * 1024 },
  );
  assert(splitReceipt.parts > 1);
  const splitManifest = download(split, path.join(directory, "split"));
  const manifest = JSON.parse(fs.readFileSync(splitManifest, "utf8"));
  assert.equal(manifest.parts.length, splitReceipt.parts);
  assert(
    manifest.parts.every((part) => part.bytes <= 8 * 1024 && part.messageId),
  );
  const splitRestored = path.join(directory, "split-restored.sqlite");
  await restoreDiscordBackup(splitManifest, splitRestored);
  assertRestored(splitRestored);
  const firstPart = path.join(
    path.dirname(splitManifest),
    manifest.parts[0].name,
  );
  const original = fs.readFileSync(firstPart),
    tampered = Buffer.from(original);
  tampered[0] ^= 1;
  fs.writeFileSync(firstPart, tampered);
  await assert.rejects(
    restoreDiscordBackup(
      splitManifest,
      path.join(directory, "tampered.sqlite"),
    ),
  );
  assert(!fs.existsSync(path.join(directory, "tampered.sqlite")));
  fs.writeFileSync(firstPart, original);
  const missingPart = path.join(
    path.dirname(splitManifest),
    manifest.parts.at(-1).name,
  );
  fs.renameSync(missingPart, missingPart + ".missing");
  await assert.rejects(
    restoreDiscordBackup(splitManifest, path.join(directory, "missing.sqlite")),
  );
  fs.renameSync(missingPart + ".missing", missingPart);
  const invalidManifest = path.join(directory, "unsafe-manifest.json");
  fs.writeFileSync(
    invalidManifest,
    JSON.stringify({
      ...manifest,
      parts: [{ ...manifest.parts[0], name: "../outside.gz" }],
    }),
  );
  await assert.rejects(
    restoreDiscordBackup(
      invalidManifest,
      path.join(directory, "unsafe.sqlite"),
    ),
    /INVALID_BACKUP_PART/,
  );
  noTemporaryFiles();
  groups.push(
    "multipart streaming restore rejects tampered, missing and traversing parts",
  );

  const incomplete = await create(),
    failingFinal = transport(async (route, request) => {
      if (request.files?.[0]?.name.endsWith(".manifest.json"))
        throw new Error("manifest failed");
    });
  delivery.setBackupDiscordClient(failingFinal);
  const lastFilename = delivery.getDiscordBackupStatus().lastFilename;
  await assert.rejects(
    delivery.sendDiscordBackup(incomplete.destination, { partBytes: 8 * 1024 }),
  );
  assert.equal(delivery.getDiscordBackupStatus().lastFilename, lastFilename);
  assert(fs.existsSync(incomplete.destination));
  noTemporaryFiles();
  groups.push(
    "multipart upload is never marked complete before final manifest succeeds",
  );

  const timeoutSnapshot = await create();
  const waiting = transport(
    (route, request) =>
      new Promise((resolve, reject) => {
        const fail = () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        };
        if (request.signal.aborted) fail();
        else request.signal.addEventListener("abort", fail, { once: true });
      }),
  );
  delivery.setBackupDiscordClient(waiting);
  const alive = setInterval(() => {}, 50);
  try {
    await assert.rejects(
      delivery.sendDiscordBackup(timeoutSnapshot.destination, {
        timeoutMs: 30,
      }),
    );
  } finally {
    clearInterval(alive);
  }
  assert(delivery.getDiscordBackupStatus().lastError.includes("thời gian"));
  noTemporaryFiles();
  groups.push("deadline aborts REST/compression and releases temporary files");

  const oversized = await create();
  delivery.setBackupDiscordClient(transport());
  await assert.rejects(
    delivery.sendDiscordBackup(oversized.destination, { partBytes: 1 }),
    /TOO_MANY_PARTS/,
  );
  assert(fs.existsSync(oversized.destination));
  noTemporaryFiles();
  groups.push(
    "oversize safety limit fails explicitly and preserves local snapshot",
  );

  delivery.setBackupDiscordClient(null);
  const events = [],
    logger = {
      info: (data, message) => events.push(message),
      error: (data, message) => events.push(message),
    };
  const manager = backup.startDatabaseBackups(logger),
    readyClient = transport();
  await manager.discordReady(readyClient);
  assert.equal(
    readyClient.calls.filter((call) => call.request.files).length,
    1,
  );
  await manager.stop();
  assert.equal(
    readyClient.calls.filter((call) => call.request.files).length,
    2,
  );
  assert(events.includes("database backup delivered to Discord DM"));
  noTemporaryFiles();
  groups.push(
    "startup ready flush and final snapshot each deliver once without blocking gameplay",
  );

  // Local backup status must remain successful when remote transport fails.
  delivery.setBackupDiscordClient(blocked);
  const failedManager = backup.startDatabaseBackups(logger);
  await failedManager.discordReady(blocked);
  await failedManager.stop({ finalBackup: false });
  const health = backup.getBackupStatus();
  assert(health.lastSuccessAt);
  assert.equal(health.lastError, null);
  assert(health.discord.lastError);
  assert(fs.existsSync(health.lastDestination));
  groups.push("local and DM health statuses remain independent");
  let once = true;
  const transient = transport(async () => {
    if (once) {
      once = false;
      throw new Error("network");
    }
  });
  delivery.setBackupDiscordClient(transient);
  const recoveringManager = backup.startDatabaseBackups(logger, {
    retryDelayMs: 10,
  });
  await recoveringManager.discordReady(transient);
  const retryDeadline = Date.now() + 3000;
  while (
    delivery.getDiscordBackupStatus().lastError &&
    Date.now() < retryDeadline
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  await recoveringManager.stop({ finalBackup: false });
  assert.equal(delivery.getDiscordBackupStatus().lastError, null);
  assert.equal(transient.calls.filter((call) => call.request.files).length, 1);
  noTemporaryFiles();
  groups.push(
    "failed delivery automatically retries the latest local snapshot",
  );
  console.log(JSON.stringify({ ok: true, groups }));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
