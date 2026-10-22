"use strict";
// Đổi link YouTube/Facebook sang dạng Discord hiển thị được khung xem trước.
// YouTube: chuẩn hóa về watch?v=ID (Discord tự nhúng). Facebook: đổi host sang dịch vụ embed (cấu hình được).
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "mbasic.facebook.com",
  "fb.watch",
]);
const DEFAULT_FACEBOOK_EMBED_HOST = "facebed.com";
const VIDEO_ID = /^[\w-]{11}$/;
const TRACKING_PARAMS = new Set([
  "fbclid",
  "mibextid",
  "__cft__[0]",
  "__tn__",
  "ref",
  "sfnsn",
  "rdid",
  "share_url",
]);
const MAX_LENGTH = 2000;

// `env` chỉ để test truyền cấu hình khác; mặc định đọc process.env.FACEBOOK_EMBED_HOST.
function embedHost(env = null) {
  const configured = env
    ? env.FACEBOOK_EMBED_HOST
    : process.env.FACEBOOK_EMBED_HOST;
  const host = String(configured || DEFAULT_FACEBOOK_EMBED_HOST)
    .trim()
    .toLowerCase();
  return /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)
    ? host
    : DEFAULT_FACEBOOK_EMBED_HOST;
}

function parse(input) {
  const text = String(input || "").trim();
  if (!text || text.length > MAX_LENGTH) return null;
  if (/^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function youtubeId(url) {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be") id = parts[0];
  else if (parts[0] === "watch") id = url.searchParams.get("v");
  else if (["shorts", "live", "embed", "v"].includes(parts[0])) id = parts[1];
  return id && VIDEO_ID.test(id) ? id : null;
}

function startSeconds(url) {
  const raw = url.searchParams.get("t") || url.searchParams.get("start");
  if (!raw) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (!match || !match[0]) return null;
  const seconds =
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0);
  return seconds > 0 && seconds < 86_400 ? seconds : null;
}

function convertLink(input, env = null) {
  const url = parse(input);
  if (!url) return { ok: false, error: "INVALID_URL" };
  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url);
    if (!id) return { ok: false, error: "NO_VIDEO" };
    const start = startSeconds(url);
    return {
      ok: true,
      kind: "youtube",
      url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`,
    };
  }
  if (FACEBOOK_HOSTS.has(host)) {
    if (url.pathname.replace(/\//g, "") === "")
      return { ok: false, error: "NO_VIDEO" };
    const target = new URL(`https://${embedHost(env)}`);
    target.pathname = url.pathname;
    for (const [key, value] of url.searchParams)
      if (!TRACKING_PARAMS.has(key) && !key.startsWith("__"))
        target.searchParams.append(key, value);
    return { ok: true, kind: "facebook", url: target.toString() };
  }
  return { ok: false, error: "UNSUPPORTED_HOST" };
}

// ---- Tự nhận diện trong kênh ---------------------------------------------------
// Chỉ xử lý Facebook: Discord đã tự nhúng YouTube nên trả lời thêm sẽ thành tin trùng lặp.
const AUTO_KEY = "embed_auto";
const MAX_AUTO_LINKS = 3;

function isAutoEnabled(guildId) {
  const row = require("../db")
    .db.prepare(
      "SELECT setting_value FROM game_settings WHERE guild_id=? AND setting_key=?",
    )
    .get(String(guildId), AUTO_KEY);
  return row ? Number(row.setting_value) !== 0 : true;
}

function setAutoEnabled(guildId, enabled, adminId) {
  require("../db")
    .db.prepare(
      `INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(guild_id,setting_key) DO UPDATE SET
      setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    )
    .run(
      String(guildId),
      AUTO_KEY,
      enabled ? 1 : 0,
      String(adminId),
      Date.now(),
    );
}

// Link bọc trong <...> là cố ý tắt embed nên bỏ qua.
function extractFacebookLinks(content) {
  const found = [];
  for (const match of String(content || "").matchAll(
    /(?<!<)https?:\/\/[^\s<>]+/gi,
  )) {
    const result = convertLink(match[0].replace(/[).,;!?]+$/, ""));
    if (result.ok && result.kind === "facebook" && !found.includes(result.url))
      found.push(result.url);
    if (found.length >= MAX_AUTO_LINKS) break;
  }
  return found;
}

async function handleEmbedMessage(message) {
  if (!message.guildId || message.author?.bot || message.webhookId)
    return false;
  const links = extractFacebookLinks(message.content);
  if (!links.length || !isAutoEnabled(message.guildId)) return false;
  // Chỉ trả lời ở kênh bot có quyền: xem, gửi (hoặc gửi trong thread), đọc lịch sử để reply, nhúng link.
  const { PermissionFlagsBits: Flags } = require("discord.js");
  const perms = message.channel?.permissionsFor?.(message.guild?.members?.me);
  const send = message.channel?.isThread?.()
    ? Flags.SendMessagesInThreads
    : Flags.SendMessages;
  if (
    !perms?.has([
      Flags.ViewChannel,
      send,
      Flags.ReadMessageHistory,
      Flags.EmbedLinks,
    ])
  )
    return false;
  await message.reply({
    content: links.join("\n"),
    allowedMentions: { parse: [], repliedUser: false },
  });
  return true;
}

module.exports = {
  convertLink,
  embedHost,
  DEFAULT_FACEBOOK_EMBED_HOST,
  isAutoEnabled,
  setAutoEnabled,
  extractFacebookLinks,
  handleEmbedMessage,
};
