"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGzip } = require("node:zlib");
const { Routes } = require("discord.js");

const defaults = require("../discordBackupConfig.json");
// An explicitly empty env value disables DM delivery; never infer recipients from admin lists.
const recipient = String(
  process.env.DB_BACKUP_DISCORD_USER_ID ?? defaults.recipientId ?? "",
).trim();
const validRecipient =
  /^\d{17,20}$/.test(recipient) && BigInt(recipient) <= (1n << 64n) - 1n;
const configuredSeconds = Number(
  process.env.DB_BACKUP_DISCORD_TIMEOUT_SECONDS || 60,
);
const timeoutMs =
  (Number.isSafeInteger(configuredSeconds)
    ? Math.max(5, Math.min(600, configuredSeconds))
    : 60) * 1000;
const PART_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = 100;
let client = null,
  tail = Promise.resolve();
const pendingFiles = new Map();
const status = {
  running: false,
  lastSuccessAt: null,
  lastFilename: null,
  lastMessageId: null,
  lastChannelId: null,
  lastError: null,
};
function setBackupDiscordClient(value) {
  client = value;
}
function getDiscordBackupStatus() {
  return {
    ...status,
    configured: Boolean(recipient),
    waitingForDiscord: Boolean(recipient && !client),
    lastError:
      recipient && !validRecipient
        ? "DB_BACKUP_DISCORD_USER_ID không hợp lệ."
        : status.lastError,
  };
}
function errorText(error) {
  if (error.code === 50007 || error.code === 50003)
    return "Không gửi được DM: hãy bật tin nhắn riêng và bỏ chặn bot.";
  if (error.code === 40005 || error.status === 413)
    return "Discord từ chối vì giới hạn dung lượng file.";
  if (error.name === "AbortError")
    return "Gửi backup Discord quá thời gian chờ.";
  return "Gửi backup Discord thất bại; kiểm tra kết nối và log mã lỗi.";
}
function digestStream(hash) {
  return new Transform({
    transform(chunk, encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
}
async function performDelivery(destination, options = {}) {
  if (!validRecipient) throw new Error("INVALID_DISCORD_BACKUP_RECIPIENT");
  if (client.user?.id === recipient)
    throw new Error("DISCORD_BACKUP_RECIPIENT_IS_BOT");
  const partBytes = options.partBytes ?? PART_BYTES;
  if (
    !Number.isSafeInteger(partBytes) ||
    partBytes < 1 ||
    partBytes > PART_BYTES
  )
    throw new Error("INVALID_DISCORD_BACKUP_PART_SIZE");
  const filename = path.basename(destination);
  const compressed =
    destination + ".discord-" + crypto.randomBytes(8).toString("hex") + ".gz";
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs || timeoutMs,
  );
  timer.unref?.();
  const sourceHash = crypto.createHash("sha256"),
    archiveHash = crypto.createHash("sha256");
  status.running = true;
  try {
    const sourceStat = await fs.promises.stat(destination);
    await pipeline(
      fs.createReadStream(destination),
      digestStream(sourceHash),
      createGzip(),
      digestStream(archiveHash),
      fs.createWriteStream(compressed, { flags: "wx" }),
      { signal: controller.signal },
    );
    const compressedBytes = (await fs.promises.stat(compressed)).size;
    const total = Math.ceil(compressedBytes / partBytes);
    if (total > MAX_PARTS) throw new Error("DISCORD_BACKUP_TOO_MANY_PARTS");
    const dm = await client.rest.post(Routes.userChannels(), {
      body: { recipient_id: recipient },
      signal: controller.signal,
    });
    const manifest = {
      format: "discord-sqlite-backup-v1",
      createdAt: new Date().toISOString(),
      sourceName: filename,
      originalBytes: sourceStat.size,
      originalSha256: sourceHash.digest("hex"),
      compressedBytes,
      compressedSha256: archiveHash.digest("hex"),
      parts: [],
    };
    const file = await fs.promises.open(compressed, "r");
    let receipt;
    try {
      for (let i = 0; i < total; i++) {
        const size = Math.min(partBytes, compressedBytes - i * partBytes);
        const buffer = Buffer.alloc(size);
        let read = 0;
        while (read < size) {
          const { bytesRead } = await file.read(
            buffer,
            read,
            size - read,
            i * partBytes + read,
          );
          if (!bytesRead) throw new Error("DISCORD_BACKUP_TRUNCATED");
          read += bytesRead;
        }
        const name =
          filename +
          ".gz" +
          (total > 1 ? ".part" + String(i + 1).padStart(3, "0") : "");
        const part = {
          name,
          bytes: size,
          sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        };
        manifest.parts.push(part);
        const files = [
          { data: buffer, name, contentType: "application/octet-stream" },
        ];
        if (total === 1)
          files.push({
            data: Buffer.from(JSON.stringify(manifest, null, 2)),
            name: filename + ".manifest.json",
            contentType: "application/json",
          });
        receipt = await client.rest.post(Routes.channelMessages(dm.id), {
          body: {
            content:
              total === 1
                ? `✅ Backup database: **${filename}**\nSnapshot đã kiểm tra toàn vẹn. Tải file .gz và manifest để phục hồi; giữ tin nhắn này.`
                : `📦 Backup **${filename}** · phần ${i + 1}/${total}. Chỉ hoàn tất khi nhận thông báo cuối kèm manifest.`,
            allowed_mentions: { parse: [] },
            nonce: crypto
              .createHash("sha256")
              .update(recipient + ":" + filename + ":" + i)
              .digest("hex")
              .slice(0, 24),
            enforce_nonce: true,
          },
          files,
          signal: controller.signal,
        });
        if (!receipt?.id) throw new Error("DISCORD_BACKUP_MISSING_RECEIPT");
        if (total > 1) part.messageId = receipt.id;
      }
    } finally {
      await file.close();
    }
    if (total > 1) {
      receipt = await client.rest.post(Routes.channelMessages(dm.id), {
        body: {
          content: `✅ Đã gửi đủ **${total} phần** của **${filename}**. Tải toàn bộ file và manifest, đặt cùng thư mục để phục hồi. Giữ các tin nhắn này.`,
          allowed_mentions: { parse: [] },
          nonce: crypto
            .createHash("sha256")
            .update(recipient + ":" + filename + ":manifest")
            .digest("hex")
            .slice(0, 24),
          enforce_nonce: true,
        },
        files: [
          {
            data: Buffer.from(JSON.stringify(manifest, null, 2)),
            name: filename + ".manifest.json",
            contentType: "application/json",
          },
        ],
        signal: controller.signal,
      });
      if (!receipt?.id) throw new Error("DISCORD_BACKUP_MISSING_RECEIPT");
    }
    status.lastSuccessAt = new Date().toISOString();
    status.lastFilename = filename;
    status.lastMessageId = receipt.id;
    status.lastChannelId = dm.id;
    status.lastError = null;
    return {
      status: "sent",
      messageId: receipt.id,
      channelId: dm.id,
      parts: total,
    };
  } catch (error) {
    status.lastError =
      error.message === "DISCORD_BACKUP_TOO_MANY_PARTS"
        ? "Backup vượt 100 phần; cần nơi lưu khác cho database quá lớn."
        : errorText(error);
    throw error;
  } finally {
    clearTimeout(timer);
    status.running = false;
    await fs.promises.rm(compressed, { force: true }).catch(() => {});
  }
}
function sendDiscordBackup(destination, options = {}) {
  if (!recipient) return Promise.resolve({ status: "disabled" });
  if (!validRecipient)
    return Promise.reject(new Error("INVALID_DISCORD_BACKUP_RECIPIENT"));
  if (!client) return Promise.resolve({ status: "waiting" });
  if (status.lastFilename === path.basename(destination))
    return Promise.resolve({ status: "already_sent" });
  if (pendingFiles.has(destination)) return pendingFiles.get(destination);
  const next = tail
    .catch(() => {})
    .then(() => performDelivery(destination, options))
    .catch((error) => {
      if (error.message === "DISCORD_BACKUP_RECIPIENT_IS_BOT")
        status.lastError = "ID nhận backup đang trỏ tới chính bot.";
      throw error;
    });
  tail = next;
  const tracked = next.finally(() => pendingFiles.delete(destination));
  pendingFiles.set(destination, tracked);
  return tracked;
}
module.exports = {
  waitForDiscordBackups: () => tail.catch(() => {}),
  PART_BYTES,
  setBackupDiscordClient,
  getDiscordBackupStatus,
  sendDiscordBackup,
};
