"use strict";
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { PermissionFlagsBits: Flags } = require("discord.js");
const MAX_BYTES = 8 * 1024 * 1024;
const MESSAGES = {
  FILE_TOO_LARGE:
    "Sticker hoặc file xuất vượt giới hạn tải lên. Hãy thử sticker nhỏ hơn.",
  ANIMATION_LIMIT:
    "Sticker động quá lớn hoặc quá dài để xuất. Hãy thử sticker khác.",
  EXTERNAL_ASSET:
    "Sticker này dùng tài nguyên ngoài nên chưa thể chuyển thành GIF.",
  UNSUPPORTED_STICKER: "Bot chưa hỗ trợ định dạng sticker này.",
  DOWNLOAD_FAILED: "Không tải được sticker từ Discord. Hãy thử lại sau.",
  CONVERSION_FAILED: "Không chuyển được sticker này. Hãy thử sticker khác.",
  INVALID_STICKER: "Dữ liệu sticker không hợp lệ hoặc bị hỏng.",
  CONVERSION_TIMEOUT:
    "Chuyển sticker mất quá lâu. Hãy thử lại hoặc chọn sticker nhỏ hơn.",
};
function stickerSource(sticker) {
  if (!/^\d{17,20}$/.test(String(sticker.id))) throw Error("INVALID_STICKER");
  const format = sticker.format;
  if (![1, 2, 3, 4].includes(format)) throw Error("UNSUPPORTED_STICKER");
  return {
    format,
    url:
      (format === 4
        ? "https://media.discordapp.net"
        : "https://cdn.discordapp.com") +
      "/stickers/" +
      sticker.id +
      (format === 3 ? ".json" : format === 4 ? ".gif" : ".png"),
    extension: format === 1 ? "png" : "gif",
  };
}
async function download(url, fetcher = globalThis.fetch, maxBytes = MAX_BYTES) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw Error("DOWNLOAD_FAILED");
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body.cancel();
      throw Error("FILE_TOO_LARGE");
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > maxBytes) throw Error("FILE_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    if (!length) throw Error("INVALID_STICKER");
    return Buffer.concat(chunks, length);
  } catch (error) {
    if (!MESSAGES[error.message]) throw Error("DOWNLOAD_FAILED");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function convertSticker(data, format, maxBytes = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "stickerExportWorker.js"), {
      workerData: { data, format, maxBytes },
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(Error("CONVERSION_TIMEOUT")), 15_000);
    worker.once("message", (result) =>
      finish(
        result.error ? Error(result.error) : null,
        result.data ? Buffer.from(result.data) : null,
      ),
    );
    worker.once("error", () => finish(Error("CONVERSION_FAILED")));
    worker.once("exit", () => {
      if (!settled) finish(Error("CONVERSION_FAILED"));
    });
  });
}
function createStickerHandler({
  fetcher = globalThis.fetch,
  convert = convertSticker,
  now = Date.now,
} = {}) {
  const cooldowns = new Map(),
    busy = new Set();
  let active = 0;
  return async function handleStickerMessage(message, logger = console) {
    if (!message.guildId || message.author?.bot || message.webhookId)
      return false;
    const prefix = process.env.COMMAND_PREFIX || "!",
      content = String(message.content || "").trim();
    if (!content.startsWith(prefix)) return false;
    const [command, ...args] = content.slice(prefix.length).trim().split(/\s+/);
    if (command.toLowerCase() !== "steal") return false;
    const mentions = { parse: [], repliedUser: false };
    const reply = (content) =>
      message.reply({ content, allowedMentions: mentions });
    const perms = message.channel?.permissionsFor?.(message.guild?.members?.me);
    const send = message.channel?.isThread?.()
      ? Flags.SendMessagesInThreads
      : Flags.SendMessages;
    if (!perms?.has([Flags.ViewChannel, send])) return true;
    if (!perms.has(Flags.ReadMessageHistory)) {
      await message.channel.send({
        content:
          "Bot cần quyền Đọc lịch sử tin nhắn để lấy sticker từ tin được reply.",
        allowedMentions: mentions,
      });
      return true;
    }
    if (
      args.length ||
      !message.reference?.messageId ||
      message.reference.type === 1 ||
      (message.reference.channelId &&
        message.reference.channelId !== message.channelId)
    ) {
      await reply(
        "Hãy reply tin nhắn chứa sticker rồi nhập `" + prefix + "steal`.",
      );
      return true;
    }
    if (!perms.has(Flags.AttachFiles)) {
      await reply("Bot cần quyền Đính kèm tệp để gửi PNG/GIF.");
      return true;
    }
    const key = message.guildId + ":" + message.author.id,
      at = now();
    for (const [id, until] of cooldowns) if (until <= at) cooldowns.delete(id);
    if (busy.has(key) || (cooldowns.get(key) || 0) > at) {
      await reply("Bạn vừa dùng lệnh này. Hãy đợi vài giây rồi thử lại.");
      return true;
    }
    if (active >= 2 || cooldowns.size >= 5000) {
      await reply(
        "Bot đang xuất sticker cho người khác. Hãy thử lại sau ít giây.",
      );
      return true;
    }
    busy.add(key);
    active++;
    cooldowns.set(key, at + 5000);
    try {
      let reference;
      try {
        reference = await message.fetchReference();
      } catch {
        await reply(
          "Không đọc được tin nhắn gốc: tin có thể đã bị xóa hoặc bot không có quyền truy cập.",
        );
        return true;
      }
      const stickers = [...(reference.stickers?.values() || [])].slice(0, 3);
      if (!stickers.length) {
        await reply("Tin nhắn được reply không chứa sticker Discord.");
        return true;
      }
      const maxBytes = Math.min(
          MAX_BYTES,
          message.guild.maximumFileSize || MAX_BYTES,
        ),
        files = [];
      for (const sticker of stickers) {
        const source = stickerSource(sticker),
          data = await download(source.url, fetcher, maxBytes);
        const attachment = await convert(data, source.format, maxBytes);
        const name =
          String(sticker.name || "sticker")
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}_-]+/gu, "-")
            .slice(0, 60)
            .replace(/^-+|-+$/g, "") || "sticker";
        files.push({
          attachment,
          name: name + "-" + sticker.id + "." + source.extension,
        });
      }
      // Keep conversion failures separate from Discord delivery: never upload twice.
      try {
        await message.reply({ files, allowedMentions: mentions });
      } catch (error) {
        logger.warn?.(
          { code: error.code || error.name },
          "sticker export delivery failed",
        );
        await reply(
          "Không gửi được file sticker. Hãy kiểm tra quyền Đính kèm tệp và thử lại.",
        ).catch(() => {});
      }
      return true;
    } catch (error) {
      await reply(MESSAGES[error.message] || MESSAGES.CONVERSION_FAILED);
      return true;
    } finally {
      busy.delete(key);
      active--;
    }
  };
}
const handleStickerMessage = createStickerHandler();
module.exports = {
  handleStickerMessage,
  createStickerHandler,
  stickerSource,
  download,
  convertSticker,
};
