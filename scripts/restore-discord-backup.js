"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");
const { restoreDatabase } = require("./restore-database");

async function restoreDiscordBackup(manifestFile, destinationFile) {
  if (!manifestFile || !destinationFile)
    throw new Error("RESTORE_REQUIRES_MANIFEST_AND_DESTINATION");
  const manifestPath = path.resolve(manifestFile),
    destination = path.resolve(destinationFile);
  if ((await fs.promises.stat(manifestPath)).size > 1024 * 1024)
    throw new Error("INVALID_BACKUP_MANIFEST");
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  const hashValid = (value) =>
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (
    manifest.format !== "discord-sqlite-backup-v1" ||
    !Array.isArray(manifest.parts) ||
    manifest.parts.length < 1 ||
    manifest.parts.length > 100 ||
    !Number.isSafeInteger(manifest.originalBytes) ||
    manifest.originalBytes < 1 ||
    !Number.isSafeInteger(manifest.compressedBytes) ||
    manifest.compressedBytes < 1 ||
    !hashValid(manifest.originalSha256) ||
    !hashValid(manifest.compressedSha256)
  )
    throw new Error("INVALID_BACKUP_MANIFEST");
  const names = new Set();
  for (const part of manifest.parts) {
    if (
      typeof part.name !== "string" ||
      !/^[A-Za-z0-9_-]+\.sqlite\.gz(?:\.part\d{3})?$/.test(part.name) ||
      names.has(part.name) ||
      !Number.isSafeInteger(part.bytes) ||
      part.bytes < 1 ||
      !hashValid(part.sha256)
    )
      throw new Error("INVALID_BACKUP_PART");
    names.add(part.name);
    const partFile = path.join(path.dirname(manifestPath), part.name);
    const stat = await fs.promises.lstat(partFile);
    if (!stat.isFile() || stat.size !== part.bytes)
      throw new Error("BACKUP_PART_MISSING_OR_WRONG_SIZE");
  }
  if (
    manifest.parts.reduce((sum, part) => sum + part.bytes, 0) !==
    manifest.compressedBytes
  )
    throw new Error("BACKUP_COMPRESSED_SIZE_MISMATCH");
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    if (fs.existsSync(destination + suffix))
      throw new Error("RESTORE_DESTINATION_EXISTS");
  const extracted =
    destination + "." + crypto.randomBytes(8).toString("hex") + ".unpacked";
  const compressedHash = crypto.createHash("sha256"),
    originalHash = crypto.createHash("sha256");
  let originalBytes = 0;
  async function* chunks() {
    for (const part of manifest.parts) {
      const partHash = crypto.createHash("sha256");
      for await (const chunk of fs.createReadStream(
        path.join(path.dirname(manifestPath), part.name),
      )) {
        partHash.update(chunk);
        compressedHash.update(chunk);
        yield chunk;
      }
      if (partHash.digest("hex") !== part.sha256)
        throw new Error("BACKUP_PART_HASH_MISMATCH");
    }
  }
  try {
    await pipeline(
      Readable.from(chunks()),
      createGunzip(),
      new Transform({
        transform(chunk, encoding, done) {
          originalBytes += chunk.length;
          if (originalBytes > manifest.originalBytes)
            return done(new Error("BACKUP_ORIGINAL_SIZE_MISMATCH"));
          originalHash.update(chunk);
          done(null, chunk);
        },
      }),
      fs.createWriteStream(extracted, { flags: "wx" }),
    );
    if (
      originalBytes !== manifest.originalBytes ||
      originalHash.digest("hex") !== manifest.originalSha256 ||
      compressedHash.digest("hex") !== manifest.compressedSha256
    )
      throw new Error("BACKUP_HASH_OR_SIZE_MISMATCH");
    return await restoreDatabase(extracted, destination);
  } finally {
    await fs.promises.rm(extracted, { force: true }).catch(() => {});
  }
}
if (require.main === module) {
  const [manifest, destination, ...extra] = process.argv.slice(2);
  if (!manifest || !destination || extra.length) {
    console.error(
      "Dùng: npm run db:restore:discord -- <manifest.json> <database-moi.sqlite>",
    );
    process.exitCode = 1;
  } else
    restoreDiscordBackup(manifest, destination)
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
module.exports = { restoreDiscordBackup };
