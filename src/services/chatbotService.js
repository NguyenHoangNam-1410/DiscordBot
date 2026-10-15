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

const dailyLimit = () => {
  const n = Number(process.env.CHATBOT_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
};
const model = () => process.env.OPENAI_MODEL || DEFAULT_MODEL;
const isConfigured = () => Boolean(process.env.OPENAI_API_KEY);

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
  const limit = dailyLimit();
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
    .run(String(guildId), String(userId), key, dailyLimit()).changes;
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

async function openai(path, body) {
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  return response.json();
}

async function flagged(text) {
  try {
    const result = await openai("moderations", { model: "omni-moderation-latest", input: text });
    return Boolean(result.results?.[0]?.flagged);
  } catch {
    return false; // kiểm duyệt lỗi thì vẫn trả lời; mô hình đã được dặn từ chối nội dung xấu
  }
}

function clipReply(text) {
  const clean = String(text || "").trim();
  return clean.length > DISCORD_LIMIT - 60 ? `${clean.slice(0, DISCORD_LIMIT - 61)}…` : clean;
}

// Trả về { ok, text } hoặc { error } với: DISABLED | TOO_LONG | LIMIT | FLAGGED | API
async function ask({ guildId, userId, channelId, text, now = Date.now() }) {
  if (!isConfigured()) return { error: "DISABLED" };
  const input = String(text || "").trim();
  if (!input) return { error: "EMPTY" };
  if (input.length > MAX_INPUT_CHARS) return { error: "TOO_LONG", max: MAX_INPUT_CHARS };
  if (!consumeTurn(guildId, userId, now)) return { error: "LIMIT", ...usage(guildId, userId, now) };
  const key = `${guildId}:${channelId}:${userId}`;
  try {
    if (await flagged(input)) {
      refundTurn(guildId, userId, now);
      return { error: "FLAGGED" };
    }
    const data = await openai("chat/completions", {
      model: model(),
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...getHistory(key, now), { role: "user", content: input }],
    });
    const reply = clipReply(data.choices?.[0]?.message?.content);
    if (!reply) throw new Error("EMPTY_REPLY");
    remember(key, input, reply, now);
    return { ok: true, text: reply, ...usage(guildId, userId, now) };
  } catch (error) {
    refundTurn(guildId, userId, now);
    return { error: "API", detail: error.message };
  }
}

module.exports = {
  DEFAULT_MODEL,
  MAX_INPUT_CHARS,
  setChannel,
  clearChannel,
  getChannelId,
  usage,
  consumeTurn,
  refundTurn,
  isConfigured,
  ask,
  dayKey,
};
