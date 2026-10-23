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

// Mỗi nền tảng: các host nhận diện, host dịch vụ embed mặc định (null = bắt buộc tự cấu hình) và cách giữ tham số.
// Instagram/TikTok bỏ toàn bộ query (mã video nằm trong đường dẫn); Douyin chỉ giữ modal_id; Facebook bỏ tham số theo dõi.
const PROVIDERS = Object.freeze({
  facebook: {
    hosts: FACEBOOK_HOSTS,
    fallback: DEFAULT_FACEBOOK_EMBED_HOST,
    keep: (key) => !TRACKING_PARAMS.has(key) && !key.startsWith("__"),
  },
  instagram: {
    hosts: new Set(["instagram.com", "www.instagram.com", "instagr.am"]),
    fallback: "www.kkinstagram.com",
    keep: () => false,
  },
  tiktok: {
    hosts: new Set([
      "tiktok.com",
      "www.tiktok.com",
      "m.tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
    ]),
    fallback: "vxtiktok.com",
    keep: () => false,
    // Link rút gọn giữ tiền tố: vm.tiktok.com → vm.<host embed>
    subdomains: new Set(["vm", "vt"]),
  },
  douyin: {
    hosts: new Set([
      "douyin.com",
      "www.douyin.com",
      "v.douyin.com",
      "iesdouyin.com",
      "www.iesdouyin.com",
    ]),
    fallback: null,
    keep: (key) => key === "modal_id",
    subdomains: new Set(["v"]),
  },
});
const HOST_PATTERN = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

// Cấu hình host dịch vụ embed từng nền tảng (đọc process.env, hoặc `env` do test truyền vào).
const CONFIGURED_HOST = Object.freeze({
  facebook: (env) =>
    env ? env.FACEBOOK_EMBED_HOST : process.env.FACEBOOK_EMBED_HOST,
  instagram: (env) =>
    env ? env.INSTAGRAM_EMBED_HOST : process.env.INSTAGRAM_EMBED_HOST,
  tiktok: (env) =>
    env ? env.TIKTOK_EMBED_HOST : process.env.TIKTOK_EMBED_HOST,
  douyin: (env) =>
    env ? env.DOUYIN_EMBED_HOST : process.env.DOUYIN_EMBED_HOST,
});
function embedHost(env = null, kind = "facebook") {
  const host = String(CONFIGURED_HOST[kind]?.(env) || "")
    .trim()
    .toLowerCase();
  if (HOST_PATTERN.test(host)) return host;
  return PROVIDERS[kind]?.fallback ?? null;
}

// Host nào là host dịch vụ embed (kể cả tiền tố vm./vt./v. của link rút gọn): chỉ những host này bot mới mở để lấy video.
function isEmbedHost(hostname, env = null) {
  const name = String(hostname || "").toLowerCase();
  for (const [kind, provider] of Object.entries(PROVIDERS)) {
    const base = embedHost(env, kind);
    if (!base) continue;
    if (name === base) return true;
    const [sub, ...rest] = name.split(".");
    if (provider.subdomains?.has(sub) && rest.join(".") === base) return true;
  }
  return false;
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
  for (const [kind, provider] of Object.entries(PROVIDERS)) {
    if (!provider.hosts.has(host)) continue;
    const modalId = kind === "douyin" && url.searchParams.get("modal_id");
    if (url.pathname.replace(/\//g, "") === "" && !modalId)
      return { ok: false, error: "NO_VIDEO" };
    const base = embedHost(env, kind);
    if (!base) return { ok: false, error: "NO_EMBED_SERVICE", kind };
    const sub = host.split(".")[0];
    const targetHost =
      provider.subdomains?.has(sub) && host !== `${sub}.${base}`
        ? `${sub}.${base}`
        : base;
    const target = new URL(`https://${targetHost}`);
    target.pathname = url.pathname;
    for (const [key, value] of url.searchParams)
      if (provider.keep(key)) target.searchParams.append(key, value);
    return { ok: true, kind, url: target.toString() };
  }
  return { ok: false, error: "UNSUPPORTED_HOST" };
}

// ---- Tự nhận diện trong kênh ---------------------------------------------------
// Xử lý Facebook, Instagram, TikTok, Douyin; bỏ YouTube vì Discord đã tự nhúng nên trả lời thêm sẽ thành tin trùng lặp.
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

function firstMetaUrl(html, pageUrl, names, maxLength = 2000) {
  const tags = metaTags(html);
  for (const name of names) {
    for (const [key, content] of tags) {
      if (key !== name) continue;
      try {
        const url = new URL(content, pageUrl);
        if (
          url.protocol === "https:" &&
          url.href.length <= maxLength &&
          url.href !== pageUrl
        )
          return url.href;
      } catch {}
    }
  }
  return null;
}
// Link video có thể dài hơn giới hạn tin nhắn (khi đó dùng link embed ngắn thay vì link ẩn), nên nới giới hạn đọc.
const parseVideoUrl = (html, pageUrl) =>
  firstMetaUrl(html, pageUrl, VIDEO_META, 8000);
const parseImageUrl = (html, pageUrl) =>
  firstMetaUrl(html, pageUrl, [
    "og:image:secure_url",
    "og:image",
    "twitter:image",
  ]);

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

// Lấy link video trực tiếp từ trang của dịch vụ embed. Trả về { video, reason }: reason cho biết vì sao không lấy được (để ghi log).
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;
async function resolveVideoDetails(embedUrl, env = null) {
  try {
    let url = new URL(embedUrl);
    if (url.protocol !== "https:" || !isEmbedHost(url.hostname, env))
      return { video: null, reason: "host_not_allowed" };
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
        if (next.protocol !== "https:")
          return { video: null, reason: "redirect_insecure" };
        // Chuyển hướng trong các host embed thì theo tiếp; chuyển thẳng tới file video (.mp4…) thì dùng luôn làm link video.
        if (isEmbedHost(next.hostname, env)) {
          url = next;
          continue;
        }
        if (VIDEO_FILE.test(next.pathname) && next.href.length <= 2000)
          return { video: next.href, reason: null };
        return { video: null, reason: "redirect_blocked" };
      }
      if (!response.ok)
        return { video: null, reason: `status_${response.status}` };
      const html = await readLimited(response);
      const video = parseVideoUrl(html, url.href);
      return video
        ? { video, reason: null }
        : {
            video: null,
            image: parseImageUrl(html, url.href),
            reason: "no_video_meta",
          };
    }
    return { video: null, reason: "too_many_redirects" };
  } catch (error) {
    return { video: null, reason: `error_${error?.name || "unknown"}` };
  }
}
async function resolveVideoUrl(embedUrl, env = null) {
  return (await resolveVideoDetails(embedUrl, env)).video;
}

// Link video trực tiếp của Facebook rất dài (nhiều trăm ký tự). Gói thành link ẩn `[🎬](url)` để tin nhắn chỉ hiện biểu tượng
// nhỏ và trình phát video, không in nguyên đường dẫn. Dài quá giới hạn tin nhắn thì trả null để dùng link embed ngắn.
const MESSAGE_LIMIT = 2000;
function videoMessage(videoUrl) {
  const safe = String(videoUrl).replace(/\(/g, "%28").replace(/\)/g, "%29");
  const text = `[🎬](${safe})`;
  return text.length <= MESSAGE_LIMIT ? text : null;
}

// Nội dung tin nhắn cho một link embed: link video ẩn nếu lấy được; không thì link embed cũng ẩn sau biểu tượng (Discord vẫn dựng khung xem trước).
const FAILURE_REASONS = {
  status_401: "dịch vụ embed từ chối truy cập",
  status_403: "dịch vụ embed từ chối truy cập",
  status_404: "dịch vụ embed không tìm thấy bài này",
  status_429: "dịch vụ embed đang giới hạn lượt truy cập, thử lại sau",
  no_video_meta:
    "bài không có video hoặc ảnh công khai (có thể là bài riêng tư)",
  error_TimeoutError: "dịch vụ embed phản hồi quá chậm",
  too_many_redirects: "dịch vụ embed chuyển hướng quá nhiều lần",
};
function failureText(reason, originalUrl) {
  const why =
    FAILURE_REASONS[reason] ||
    (String(reason).startsWith("status_5")
      ? "dịch vụ embed đang lỗi"
      : "dịch vụ embed không phản hồi đúng");
  return `❌ Không đổi được link này: ${why}.${originalUrl ? ` Link gốc: <${originalUrl}>` : ""}`;
}

// Kết quả đổi một link embed: { ok, content } hoặc { ok:false, reason, content: thông báo thất bại }.
//  - có video: link video ẩn `[🎬](url)`;
//  - chỉ có ảnh (bài ảnh): link embed để Discord hiện ảnh;
//  - không có gì: báo thất bại thay vì gửi một tin nhắn trống để người dùng chờ vô ích.
async function renderEmbedLink(embedUrl, env = null, originalUrl = null) {
  const { video, image, reason } = await resolveVideoDetails(embedUrl, env);
  if (video) return { ok: true, content: videoMessage(video) || embedUrl };
  if (image) return { ok: true, content: embedUrl, image: true };
  if (reason && reason !== "host_not_allowed") {
    // Log chẩn đoán: giúp biết dịch vụ embed đang trả gì khi không có video.
    console.warn(
      JSON.stringify({
        level: 40,
        msg: "embed video not resolved",
        host: new URL(embedUrl).hostname,
        reason,
      }),
    );
  }
  return {
    ok: false,
    reason: reason || "unknown",
    content: failureText(reason || "unknown", originalUrl),
  };
}

// Link bọc trong <...> là cố ý tắt embed nên bỏ qua.
function extractEmbedLinks(content) {
  const found = [];
  for (const match of String(content || "").matchAll(
    /(?<!<)https?:\/\/[^\s<>]+/gi,
  )) {
    const result = convertLink(match[0].replace(/[).,;!?]+$/, ""));
    if (result.ok && result.kind !== "youtube" && !found.includes(result.url))
      found.push(result.url);
    if (found.length >= MAX_AUTO_LINKS) break;
  }
  return found;
}

async function handleEmbedMessage(message) {
  if (!message.guildId || message.author?.bot || message.webhookId)
    return false;
  const links = extractEmbedLinks(message.content);
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
  // Gửi riêng link video nếu lấy được (khung chỉ có video); bài ảnh thì link embed; không lấy được gì thì không trả lời tin,
  // chỉ thả ❌ lên tin gốc để người dùng biết không đổi được thay vì chờ vô ích.
  const results = await Promise.all(links.map((link) => renderEmbedLink(link)));
  const good = results.filter((result) => result.ok);
  if (!good.length) {
    await Promise.resolve(message.react?.("❌")).catch(() => {});
    return true;
  }
  await message.reply({
    content: good.map((result) => result.content).join("\n"),
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
  extractEmbedLinks,
  extractFacebookLinks: extractEmbedLinks,
  isEmbedHost,
  parseVideoUrl,
  parseImageUrl,
  resolveVideoUrl,
  resolveVideoDetails,
  renderEmbedLink,
  failureText,
  videoMessage,
  handleEmbedMessage,
};
