"use strict";
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { PermissionFlagsBits: Flags } = require("discord.js");
const MAX_BYTES = 8 * 1024 * 1024;
// Guild expression limits (Discord): emoji per category (static / animated)
// and stickers by boost tier; upload size caps.
const EMOJI_SLOTS = [50, 100, 150, 250],
  STICKER_SLOTS = [5, 15, 30, 60],
  EMOJI_BYTES = 256 * 1024,
  STICKER_BYTES = 512 * 1024,
  DEFAULT_STICKER_TAG = "🙂";
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
  EMOJI_TOO_LARGE:
    "Ảnh động vượt 256 KB nên không làm emoji được. Hãy thử sticker/emoji khác.",
  STICKER_TOO_LARGE: "File vượt 512 KB nên không làm sticker được.",
};
const IMPORT_USAGE = (prefix) =>
  "Hãy reply tin nhắn chứa sticker rồi nhập `" +
  prefix +
  "steal` để lấy file. Admin có thể reply tin có đúng 1 emoji tùy chỉnh hoặc 1 sticker rồi nhập `" +
  prefix +
  "steal emo TÊN` hoặc `" +
  prefix +
  "steal sticker TÊN [emoji]` để thêm thẳng vào server.";
// `steal emo NAME` / `steal sticker NAME [emoji]`; null means "not an import".
function parseImport(args) {
  const kind = String(args[0] || "").toLowerCase();
  if (["emo", "emoji"].includes(kind)) {
    if (args.length !== 2) return { error: "USAGE" };
    if (!/^[A-Za-z0-9_]{2,32}$/.test(args[1])) return { error: "EMOJI_NAME" };
    return { target: "emoji", name: args[1] };
  }
  if (kind === "sticker") {
    if (args.length < 2 || args.length > 3) return { error: "USAGE" };
    const name = args[1];
    if (name.length < 2 || name.length > 30) return { error: "STICKER_NAME" };
    let tag = DEFAULT_STICKER_TAG;
    if (args[2]) {
      tag = args[2].replace(/^:|:$/g, "");
      if (
        !/^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|[A-Za-z0-9_]{2,32})$/u.test(
          tag,
        )
      )
        return { error: "STICKER_TAG" };
    }
    return { target: "sticker", name, tag };
  }
  return null;
}
const CUSTOM_EMOJI = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>/g;
// Exactly one stealable thing: a custom emoji in the text or a sticker.
function importSource(reference) {
  const emojis = [...String(reference.content || "").matchAll(CUSTOM_EMOJI)],
    stickers = [...(reference.stickers?.values() || [])];
  if (emojis.length + stickers.length !== 1) return null;
  if (stickers.length) return { type: "sticker", sticker: stickers[0] };
  const [, animated, name, id] = emojis[0];
  return {
    type: "emoji",
    id,
    name,
    animated: !!animated,
    url:
      "https://cdn.discordapp.com/emojis/" + id + (animated ? ".gif" : ".png"),
  };
}
const isGif = (data) => /^GIF8[79]a$/.test(data.toString("ascii", 0, 6));
// Static images are fitted (centered, transparent padding) to a square.
async function fitPng(data, size) {
  const { createCanvas, loadImage } = require("@napi-rs/canvas");
  const image = await loadImage(data),
    canvas = createCanvas(size, size),
    scale = Math.min(size / image.width, size / image.height),
    w = Math.round(image.width * scale),
    h = Math.round(image.height * scale);
  canvas
    .getContext("2d")
    .drawImage(image, (size - w) >> 1, (size - h) >> 1, w, h);
  return canvas.encode("png");
}
// Turns the source into an uploadable file for the target kind.
async function importAsset(source, target, { fetcher, convert }) {
  const limit = target === "emoji" ? EMOJI_BYTES : STICKER_BYTES,
    tooLarge = target === "emoji" ? "EMOJI_TOO_LARGE" : "STICKER_TOO_LARGE";
  let data;
  if (source.type === "emoji") {
    data = await download(source.url, fetcher, STICKER_BYTES * 2);
    if (target === "sticker" && !source.animated)
      data = await fitPng(data, 320);
  } else {
    const info = stickerSource(source.sticker),
      raw = await download(info.url, fetcher, MAX_BYTES);
    // Emoji cannot be APNG and nobody but Discord can upload Lottie stickers:
    // both become GIF. PNG, APNG (sticker) and GIF upload as they are.
    data =
      info.format === 3 || (info.format === 2 && target === "emoji")
        ? await convert(raw, info.format, MAX_BYTES)
        : raw;
  }
  if (data.length > limit && !isGif(data))
    data = await fitPng(data, target === "emoji" ? 128 : 320);
  if (data.length > limit) throw Error(tooLarge);
  return { data, animated: isGif(data) };
}
const API_ERRORS = {
  30008: "Server đã hết slot emoji cho loại này.",
  30039: "Server đã hết slot sticker.",
  50013: "Bot thiếu quyền Quản lý biểu cảm (Manage Expressions) trong server.",
  50045: "File vượt giới hạn dung lượng của Discord.",
  50046:
    "Discord từ chối file này (định dạng hoặc kích thước không hợp lệ; sticker cần ảnh 320×320).",
  50035: "Tên hoặc dữ liệu không hợp lệ theo Discord.",
};
function isImportAdmin(message) {
  const ids = String(process.env.ADMIN_USER_ID || "")
    .split(/[,;\n]/)
    .map((id) => id.trim())
    .filter(Boolean);
  const perms = message.member?.permissions;
  return (
    ids.includes(message.author.id) ||
    !!perms?.has?.(Flags.Administrator) ||
    !!perms?.has?.(Flags.ManageGuildExpressions)
  );
}
function botCanUpload(guild) {
  const perms = guild?.members?.me?.permissions;
  return (
    !!perms?.has?.(Flags.ManageGuildExpressions) ||
    !!perms?.has?.(Flags.CreateGuildExpressions)
  );
}
async function importExpression(message, reference, request, deps) {
  const source = importSource(reference);
  if (!source)
    return "Tin được reply phải có **đúng 1** emoji tùy chỉnh hoặc 1 sticker (emoji Unicode mặc định không lấy được).";
  const guild = message.guild,
    tier = Math.max(0, Math.min(3, Number(guild.premiumTier) || 0));
  const asset = await importAsset(source, request.target, deps),
    reason = "!steal bởi " + message.author.id;
  if (request.target === "emoji") {
    const all = await guild.emojis.fetch(),
      used = [...all.values()].filter(
        (e) => !!e.animated === asset.animated,
      ).length,
      slots = EMOJI_SLOTS[tier];
    if (used >= slots)
      return `Server đã dùng hết ${slots}/${slots} slot emoji ${asset.animated ? "động" : "tĩnh"}.`;
    const emoji = await guild.emojis.create({
      attachment: asset.data,
      name: request.name,
      reason,
    });
    return `Đã thêm emoji ${emoji} \`:${request.name}:\` vào mục **emoji ${asset.animated ? "động" : "tĩnh"}** (${used + 1}/${slots}).`;
  }
  const all = await guild.stickers.fetch(),
    used = all.size,
    slots = STICKER_SLOTS[tier];
  if (used >= slots)
    return `Server đã dùng hết ${slots}/${slots} slot sticker.`;
  await guild.stickers.create({
    file: {
      attachment: asset.data,
      name: "sticker." + (isGif(asset.data) ? "gif" : "png"),
    },
    name: request.name,
    tags: request.tag,
    description: "",
    reason,
  });
  return `Đã thêm sticker **${request.name}** (emoji mô tả ${request.tag}) vào server (${used + 1}/${slots}).`;
}
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
    const request = args.length ? parseImport(args) : null;
    if (
      (args.length && (!request || request.error === "USAGE")) ||
      !message.reference?.messageId ||
      message.reference.type === 1 ||
      (message.reference.channelId &&
        message.reference.channelId !== message.channelId)
    ) {
      await reply(IMPORT_USAGE(prefix));
      return true;
    }
    if (request?.error) {
      await reply(
        {
          EMOJI_NAME:
            "Tên emoji phải dài 2–32 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới.",
          STICKER_NAME: "Tên sticker phải dài 2–30 ký tự.",
          STICKER_TAG:
            "Emoji mô tả sticker phải là một emoji (ví dụ 😀) hoặc tên emoji như smile.",
        }[request.error],
      );
      return true;
    }
    if (request && !isImportAdmin(message)) {
      await reply(
        "Chỉ admin (quyền Quản trị hoặc Quản lý biểu cảm) mới thêm emoji/sticker vào server được.",
      );
      return true;
    }
    if (request && !botCanUpload(message.guild)) {
      await reply(
        "Bot cần quyền **Quản lý biểu cảm** (Manage Expressions) hoặc **Tạo biểu cảm** (Create Expressions) để thêm emoji/sticker.",
      );
      return true;
    }
    if (!request && !perms.has(Flags.AttachFiles)) {
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
      if (request) {
        try {
          await reply(
            await importExpression(message, reference, request, {
              fetcher,
              convert,
            }),
          );
        } catch (error) {
          if (MESSAGES[error.message]) throw error;
          logger.warn?.(
            { code: error.code || error.name },
            "expression import failed",
          );
          await reply(
            API_ERRORS[error.code] ||
              "Discord từ chối thêm biểu cảm này. Hãy thử lại sau.",
          ).catch(() => {});
        }
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
  parseImport,
  importSource,
  importAsset,
  EMOJI_SLOTS,
  STICKER_SLOTS,
  createStickerHandler,
  stickerSource,
  download,
  convertSticker,
};
