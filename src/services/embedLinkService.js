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

// ---- Chỉ lấy video ---------------------------------------------------------------
// Muốn khung chỉ có video (không thẻ tiêu đề/số liệu của trang embed), bot đọc thẻ meta của trang embed để lấy
// link video trực tiếp rồi gửi riêng link đó; Discord sẽ hiện trình phát video trần. Không có video thì dùng lại link embed.
const PAGE_TIMEOUT_MS = 6000;
const MAX_PAGE_BYTES = 400_000;
const MAX_REDIRECTS = 3;
const VIDEO_META = [
  "og:video:secure_url",
  "og:video:url",
  "og:video",
  "twitter:player:stream",
];
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

function metaTags(html) {
  const tags = [];
  for (const tag of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const a of tag[0].matchAll(
      /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    ))
      attrs[a[1].toLowerCase()] = (a[2] ?? a[3] ?? "").replace(
        /&(amp|lt|gt|quot|apos|#39);/g,
        (_, name) => ENTITIES[name],
      );
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content) tags.push([key, attrs.content]);
  }
  return tags;
}

function parseVideoUrl(html, pageUrl) {
  const tags = metaTags(html);
  for (const name of VIDEO_META) {
    for (const [key, content] of tags) {
      if (key !== name) continue;
      try {
        const url = new URL(content, pageUrl);
        if (
          url.protocol === "https:" &&
          url.href.length <= 2000 &&
          url.href !== pageUrl
        )
          return url.href;
      } catch {}
    }
  }
  return null;
}

async function readLimited(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return String(await response.text()).slice(0, MAX_PAGE_BYTES);
  const chunks = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8").slice(0, MAX_PAGE_BYTES);
}

// Trả về link video trực tiếp hoặc null (lỗi mạng, trang không có video, bài riêng tư…).
async function resolveVideoUrl(embedUrl, env = null) {
  try {
    const host = embedHost(env);
    let url = new URL(embedUrl);
    if (url.protocol !== "https:" || url.hostname !== host) return null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await globalThis.fetch(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers: {
          // Dịch vụ embed trả thẻ meta cho trình thu thập của Discord.
          "user-agent":
            "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
          accept: "text/html",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get("location") || "", url);
        // Chỉ theo chuyển hướng trong cùng host embed: không để trang trỏ bot sang nơi khác.
        if (next.protocol !== "https:" || next.hostname !== host) return null;
        url = next;
        continue;
      }
      if (!response.ok) return null;
      return parseVideoUrl(await readLimited(response), url.href);
    }
  } catch {}
  return null;
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
  // Gửi riêng link video nếu lấy được (khung chỉ có video); không thì giữ link embed.
  const targets = await Promise.all(
    links.map(async (link) => (await resolveVideoUrl(link)) || link),
  );
  await message.reply({
    content: targets.join("\n"),
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
  parseVideoUrl,
  resolveVideoUrl,
  handleEmbedMessage,
};
