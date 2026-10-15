"use strict";
const { db } = require("../db");

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_DAILY_LIMIT = 20;
const MAX_INPUT_CHARS = 500;
const MAX_OUTPUT_TOKENS = 400;
const HISTORY_TURNS = 6;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const DISCORD_LIMIT = 2000;
const SYSTEM_PROMPT =
  "Bạn là trợ lý vui vẻ, thân thiện trong một server Discord game của người Việt. " +
  "Luôn trả lời bằng tiếng Việt, ngắn gọn (tối đa vài câu) trừ khi được yêu cầu chi tiết. " +
  "Từ chối nhẹ nhàng nội dung nguy hiểm, bạo lực cực đoan, người lớn hoặc xâm phạm đời tư. " +
  "Bạn không biết và không được hỏi về dữ liệu tài khoản hay số xu của người chơi. " +
  "Không đề cập tới việc bạn là mô hình của hãng nào trừ khi được hỏi trực tiếp.";

const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
// Giới hạn lượt/ngày: admin chỉnh theo server (/chatbot gioihan); chưa chỉnh thì lấy CHATBOT_DAILY_LIMIT hoặc 20.
const defaultLimit = () => {
  const n = Number(process.env.CHATBOT_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
};
const dailyLimit = (guildId) =>
  db.prepare("SELECT daily_limit FROM chatbot_settings WHERE guild_id=?").get(String(guildId))?.daily_limit ||
  defaultLimit();
function setDailyLimit(guildId, limit, adminId, now = Date.now()) {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n < MIN_LIMIT || n > MAX_LIMIT) throw new Error("INVALID_LIMIT");
  db.prepare(
    `INSERT INTO chatbot_settings(guild_id,daily_limit,updated_by,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET daily_limit=excluded.daily_limit,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(String(guildId), n, String(adminId), now);
  return n;
}
// Nhà cung cấp: mặc định OpenAI; CHATBOT_PROVIDER=gemini dùng endpoint tương thích OpenAI của Google (khóa vẫn đặt ở OPENAI_API_KEY).
const PROVIDERS = Object.freeze({
  openai: { baseUrl: "https://api.openai.com/v1", model: DEFAULT_MODEL, moderation: true },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    moderation: false,
  },
  // OpenRouter: chọn model có hậu tố ":free" ở openrouter.ai/models rồi đặt OPENAI_MODEL (tên model free thay đổi thường xuyên).
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "", moderation: false },
});
const provider = () => PROVIDERS[String(process.env.CHATBOT_PROVIDER || "openai").toLowerCase()] || PROVIDERS.openai;
const baseUrl = () => String(process.env.OPENAI_BASE_URL || provider().baseUrl).replace(/\/+$/, "");
// OPENAI_MODEL có thể là danh sách phân tách bằng dấu phẩy: model đầu là chính, các model sau là dự phòng khi bị giới hạn/lỗi.
const models = () =>
  String(process.env.OPENAI_MODEL || provider().model)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
const model = () => models()[0] || "";
const useModeration = () => provider().moderation && !process.env.OPENAI_BASE_URL;
const isConfigured = () => Boolean(process.env.OPENAI_API_KEY) && Boolean(model());

function dayKey(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function setChannel(guildId, channelId, adminId, now = Date.now()) {
  db.prepare(
    `INSERT INTO chatbot_channels(guild_id,channel_id,updated_by,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(String(guildId), String(channelId), String(adminId), now);
}
function clearChannel(guildId) {
  return db.prepare("DELETE FROM chatbot_channels WHERE guild_id=?").run(String(guildId)).changes > 0;
}
function getChannelId(guildId) {
  return (
    db.prepare("SELECT channel_id FROM chatbot_channels WHERE guild_id=?").get(String(guildId))?.channel_id || null
  );
}

function usage(guildId, userId, now = Date.now()) {
  const used =
    db
      .prepare("SELECT used FROM chatbot_usage WHERE guild_id=? AND user_id=? AND day_key=?")
      .get(String(guildId), String(userId), dayKey(now))?.used || 0;
  const limit = dailyLimit(guildId);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// Trừ một lượt nếu còn; trả về false khi đã hết lượt trong ngày (giờ Việt Nam).
const consumeTurn = db.transaction((guildId, userId, now = Date.now()) => {
  const key = dayKey(now);
  db.prepare("INSERT OR IGNORE INTO chatbot_usage(guild_id,user_id,day_key,used) VALUES(?,?,?,0)").run(
    String(guildId),
    String(userId),
    key,
  );
  const changed = db
    .prepare("UPDATE chatbot_usage SET used=used+1 WHERE guild_id=? AND user_id=? AND day_key=? AND used<?")
    .run(String(guildId), String(userId), key, dailyLimit(guildId)).changes;
  return changed > 0;
});
function refundTurn(guildId, userId, now = Date.now()) {
  db.prepare("UPDATE chatbot_usage SET used=MAX(0,used-1) WHERE guild_id=? AND user_id=? AND day_key=?").run(
    String(guildId),
    String(userId),
    dayKey(now),
  );
}

const histories = new Map();
function getHistory(key, now = Date.now()) {
  const entry = histories.get(key);
  if (!entry || now - entry.at > HISTORY_TTL_MS) return [];
  return entry.turns;
}
function remember(key, user, assistant, now = Date.now()) {
  const turns = [...getHistory(key, now), { role: "user", content: user }, { role: "assistant", content: assistant }].slice(
    -HISTORY_TURNS * 2,
  );
  histories.set(key, { at: now, turns });
}

async function openai(path, body, signal = null) {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(`${baseUrl()}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    // Giữ lại thông điệp lỗi của nhà cung cấp (không chứa khóa) để ghi log chẩn đoán.
    const text = await response.text?.().catch(() => "");
    const error = new Error(`API_${response.status}`);
    error.status = response.status;
    error.body = String(text || "").slice(0, 500);
    throw error;
  }
  return response.json();
}

async function flagged(text, signal) {
  if (!useModeration()) return false;
  try {
    const result = await openai("moderations", { model: "omni-moderation-latest", input: text }, signal);
    return Boolean(result.results?.[0]?.flagged);
  } catch (error) {
    if (signal?.aborted) throw error;
    return false; // kiểm duyệt lỗi thì vẫn trả lời; mô hình đã được dặn từ chối nội dung xấu
  }
}

function clipReply(text) {
  const clean = String(text || "").trim();
  return clean.length > DISCORD_LIMIT - 60 ? `${clean.slice(0, DISCORD_LIMIT - 61)}…` : clean;
}

const RETRYABLE = (error) => error.status === 429 || error.status >= 500;
const RETRY_DELAY_MS = () => Number(process.env.CHATBOT_RETRY_DELAY_MS ?? 2000);
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });

// Thử lần lượt từng model; bị giới hạn (429) hoặc lỗi máy chủ thì chuyển model dự phòng, hết danh sách thì thử lại model đầu một lần sau vài giây.
async function completeWithFallback(messages, signal) {
  const list = models();
  let lastError;
  for (let round = 0; round < 2; round += 1) {
    for (const name of list) {
      try {
        return await openai("chat/completions", { model: name, max_tokens: MAX_OUTPUT_TOKENS, messages }, signal);
      } catch (error) {
        if (signal?.aborted || !RETRYABLE(error)) throw error;
        lastError = error;
      }
    }
    if (round === 0) await sleep(RETRY_DELAY_MS(), signal);
  }
  throw lastError;
}

// Trả về { ok, text } hoặc { error } với: DISABLED | TOO_LONG | LIMIT | FLAGGED | API
async function ask({ guildId, userId, channelId, text, now = Date.now(), signal = null }) {
  if (!isConfigured()) return { error: "DISABLED" };
  const input = String(text || "").trim();
  if (!input) return { error: "EMPTY" };
  if (input.length > MAX_INPUT_CHARS) return { error: "TOO_LONG", max: MAX_INPUT_CHARS };
  if (signal?.aborted) return { error: "CANCELLED" };
  if (!consumeTurn(guildId, userId, now)) return { error: "LIMIT", ...usage(guildId, userId, now) };
  const key = `${guildId}:${channelId}:${userId}`;
  try {
    if (await flagged(input, signal)) {
      refundTurn(guildId, userId, now);
      return { error: "FLAGGED" };
    }
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...getHistory(key, now), { role: "user", content: input }];
    const data = await completeWithFallback(messages, signal);
    const reply = clipReply(data.choices?.[0]?.message?.content);
    if (!reply) throw new Error("EMPTY_REPLY");
    remember(key, input, reply, now);
    return { ok: true, text: reply, ...usage(guildId, userId, now) };
  } catch (error) {
    refundTurn(guildId, userId, now);
    if (signal?.aborted) return { error: "CANCELLED" };
    return { error: "API", detail: error.message, status: error.status, body: error.body };
  }
}

module.exports = {
  DEFAULT_MODEL,
  model,
  models,
  baseUrl,
  MAX_INPUT_CHARS,
  setChannel,
  setDailyLimit,
  dailyLimit,
  MIN_LIMIT,
  MAX_LIMIT,
  clearChannel,
  getChannelId,
  usage,
  consumeTurn,
  refundTurn,
  isConfigured,
  ask,
  dayKey,
};
