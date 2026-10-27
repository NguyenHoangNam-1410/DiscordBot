"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID, createHash } = require("node:crypto");
const { db } = require("../db");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");

const context = new AsyncLocalStorage();
const integer = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const money = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const text = (value) => (typeof value === "string" ? value.slice(0, 200) : "");
const safe = (value) =>
  String(value)
    .replace(/[`*_~|<>\r\n]/g, " ")
    .slice(0, 200);
const usd = (value) =>
  value == null
    ? "chưa xác định"
    : "$" +
      Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      });
const number = (value) => Number(value || 0).toLocaleString("vi-VN");
const PAGE_SIZE = 5;
const PERIODS = [1, 7, 30];

function endpointKey(endpoint) {
  const url = new URL(endpoint);
  return createHash("sha256")
    .update(url.origin + url.pathname.replace(/\/+$/, ""))
    .digest("hex");
}
function withContext({ guildId, userId }, callback) {
  return context.run(
    { guildId: String(guildId), userId: String(userId), turnId: randomUUID() },
    callback,
  );
}

// Cache/reasoning are subsets for OpenAI-compatible usage. Gemini reports
// candidates, thoughts and tool prompts separately: include each exactly once.
function normalizeUsage(
  data = {},
  { nativeGemini = false, searchEnabled = false } = {},
) {
  data = data && typeof data === "object" ? data : {};
  const u = nativeGemini ? data.usageMetadata || {} : data.usage || {};
  let input, output, cached, reasoning, toolInput;
  if (nativeGemini) {
    const prompt = integer(u.promptTokenCount),
      candidates = integer(u.candidatesTokenCount);
    reasoning = integer(u.thoughtsTokenCount);
    toolInput = integer(u.toolUsePromptTokenCount);
    input = prompt == null ? null : prompt + (toolInput || 0);
    output = candidates == null ? null : candidates + (reasoning || 0);
    cached = integer(u.cachedContentTokenCount);
  } else {
    input = integer(u.prompt_tokens ?? u.input_tokens);
    output = integer(u.completion_tokens ?? u.output_tokens);
    cached = integer(
      u.prompt_tokens_details?.cached_tokens ??
        u.input_tokens_details?.cached_tokens,
    );
    reasoning = integer(
      u.completion_tokens_details?.reasoning_tokens ??
        u.output_tokens_details?.reasoning_tokens,
    );
    toolInput = null;
  }
  const total =
    integer(nativeGemini ? u.totalTokenCount : u.total_tokens) ??
    (input != null && output != null ? input + output : null);
  if (input != null && cached != null && cached > input) cached = null;
  if (output != null && reasoning != null && reasoning > output)
    reasoning = null;
  let searchQueries = searchEnabled ? null : 0;
  if (searchEnabled && nativeGemini) {
    const metadata = (Array.isArray(data.candidates) ? data.candidates : [])
      .map((candidate) => candidate.groundingMetadata)
      .filter(Boolean);
    if (
      metadata.length &&
      metadata.every((meta) => Array.isArray(meta.webSearchQueries))
    )
      searchQueries = metadata.reduce(
        (sum, meta) => sum + meta.webSearchQueries.length,
        0,
      );
  }
  return {
    input,
    output,
    total,
    cached,
    reasoning,
    toolInput,
    searchQueries,
    reportedCost: money(u.cost),
  };
}

function price(guildId, key, model) {
  return (
    db
      .prepare(
        "SELECT * FROM chatbot_model_prices WHERE guild_id=? AND endpoint_key=? AND model=?",
      )
      .get(String(guildId), key, model) || null
  );
}
function setPrice({
  guildId,
  endpoint,
  model,
  input,
  output,
  cached = input,
  search = null,
  adminId,
}) {
  if (
    !/^[a-zA-Z0-9._:/+\-]{1,200}$/.test(model) ||
    [input, output, cached].some(
      (value) => money(value) == null || value > 1_000_000,
    ) ||
    (search != null && (money(search) == null || search > 1_000_000))
  )
    throw Error("INVALID_CHATBOT_PRICE");
  const key = endpointKey(endpoint);
  db.prepare(
    `INSERT INTO chatbot_model_prices VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id,endpoint_key,model) DO UPDATE SET
      input_per_million=excluded.input_per_million,output_per_million=excluded.output_per_million,
      cached_per_million=excluded.cached_per_million,search_per_thousand=excluded.search_per_thousand,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    key,
    model,
    input,
    output,
    cached,
    search,
    String(adminId),
    Date.now(),
  );
  return price(guildId, key, model);
}

function estimate(usage, rates, searchEnabled) {
  let token = null,
    search = searchEnabled ? null : 0;
  if (
    rates &&
    usage.input != null &&
    usage.output != null &&
    (usage.cached != null ||
      rates.cached_per_million === rates.input_per_million)
  ) {
    const cached = usage.cached || 0;
    token =
      ((usage.input - cached) * rates.input_per_million +
        cached * rates.cached_per_million +
        usage.output * rates.output_per_million) /
      1_000_000;
  }
  if (searchEnabled && usage.searchQueries === 0) search = 0;
  else if (
    searchEnabled &&
    rates?.search_per_thousand != null &&
    usage.searchQueries != null
  )
    search = (usage.searchQueries * rates.search_per_thousand) / 1000;
  return {
    token,
    search,
    total: token != null && search != null ? token + search : null,
  };
}

// A pending row survives crashes/timeouts. Only numeric accounting metadata is
// persisted; prompts, replies, API keys, request headers and URLs are excluded.
function beginRequest(info) {
  const caller = context.getStore();
  if (!caller) return null;
  const record = {
    ...caller,
    id: randomUUID(),
    provider: info.provider,
    key: endpointKey(info.endpoint),
    requestedModel: text(info.model),
    kind: info.kind,
    fallback: Boolean(info.fallback),
    searchEnabled: Boolean(info.searchEnabled),
    nativeGemini: Boolean(info.nativeGemini),
    startedAt: Date.now(),
  };
  const rows = db
    .prepare(
      "SELECT * FROM chatbot_model_prices WHERE guild_id=? AND endpoint_key=?",
    )
    .all(record.guildId, record.key);
  record.prices = new Map(rows.map((row) => [row.model, row]));
  db.prepare(
    `INSERT INTO chatbot_requests
    (id,guild_id,user_id,turn_id,provider,endpoint_key,kind,requested_model,model,is_fallback,started_at,search_enabled)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    record.id,
    record.guildId,
    record.userId,
    record.turnId,
    record.provider,
    record.key,
    record.kind,
    record.requestedModel,
    record.requestedModel,
    record.fallback ? 1 : 0,
    record.startedAt,
    record.searchEnabled ? 1 : 0,
  );
  return record;
}
function finishRequest(
  record,
  data = {},
  { status = "success", httpStatus = 200 } = {},
) {
  if (!record) return;
  data = data && typeof data === "object" ? data : {};
  const actual = text(data.modelVersion || data.model),
    model = actual || record.requestedModel;
  const usage = normalizeUsage(data, record);
  const rates =
    record.prices.get(model) ||
    record.prices.get(record.requestedModel) ||
    null;
  const cost = estimate(usage, rates, record.searchEnabled);
  db.prepare(
    `UPDATE chatbot_requests SET status=?,http_status=?,completed_at=?,model=?,model_source=?,
    input_tokens=?,output_tokens=?,total_tokens=?,cached_tokens=?,reasoning_tokens=?,tool_input_tokens=?,
    search_queries=?,reported_cost_usd=?,estimated_cost_usd=?,token_cost_usd=?,search_cost_usd=?,pricing_json=?
    WHERE id=? AND status='pending'`,
  ).run(
    status,
    httpStatus,
    Date.now(),
    model,
    actual ? "reported" : "requested",
    usage.input,
    usage.output,
    usage.total,
    usage.cached,
    usage.reasoning,
    usage.toolInput,
    usage.searchQueries,
    usage.reportedCost,
    cost.total,
    cost.token,
    cost.search,
    rates
      ? JSON.stringify({
          model: rates.model,
          input: rates.input_per_million,
          output: rates.output_per_million,
          cached: rates.cached_per_million,
          search: rates.search_per_thousand,
          updatedAt: rates.updated_at,
        })
      : null,
    record.id,
  );
}
// Accounting failure must not trigger another paid request or lose a delivered reply.
function safely(method, ...args) {
  try {
    return method(...args);
  } catch (error) {
    console.warn(
      JSON.stringify({
        msg: "chatbot accounting unavailable",
        code: String(error.code || "ACCOUNTING_ERROR"),
      }),
    );
    return null;
  }
}

function periodStart(days, now = Date.now()) {
  if (!PERIODS.includes(days)) throw Error("INVALID_STATS_PERIOD");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Date.parse(date + "T00:00:00+07:00") - (days - 1) * 86_400_000;
}
const aggregate = `COUNT(*) calls,COUNT(DISTINCT turn_id) turns,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successful,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,
  SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
  SUM(CASE WHEN kind='moderation' THEN 1 ELSE 0 END) moderation,
  SUM(is_fallback) fallbacks,
  SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(total_tokens) total_tokens,
  SUM(cached_tokens) cached_tokens,SUM(reasoning_tokens) reasoning_tokens,
  SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) missing_usage,
  SUM(CASE WHEN cached_tokens IS NULL THEN 1 ELSE 0 END) missing_cache,
  SUM(CASE WHEN reasoning_tokens IS NULL THEN 1 ELSE 0 END) missing_reasoning,
  SUM(reported_cost_usd) reported_cost,
  SUM(CASE WHEN reported_cost_usd IS NULL THEN estimated_cost_usd ELSE NULL END) estimated_cost,
  SUM(CASE WHEN reported_cost_usd IS NULL AND estimated_cost_usd IS NULL THEN 1 ELSE 0 END) missing_cost,
  SUM(CASE WHEN reported_cost_usd IS NULL THEN token_cost_usd ELSE NULL END) token_cost,
  SUM(CASE WHEN reported_cost_usd IS NULL THEN search_cost_usd ELSE NULL END) search_cost,
  SUM(search_enabled) search_calls,SUM(search_queries) search_queries,
  SUM(CASE WHEN search_enabled=1 AND search_queries IS NULL THEN 1 ELSE 0 END) missing_search,
  SUM(CASE WHEN model_source='requested' THEN 1 ELSE 0 END) unconfirmed_model`;

function report(
  guildId,
  { days = 1, userId = null, page = 0, now = Date.now() } = {},
) {
  const start = periodStart(days, now),
    args = [String(guildId), start, now];
  const where =
    "guild_id=? AND started_at>=? AND started_at<=?" +
    (userId ? " AND user_id=?" : "");
  if (userId) args.push(String(userId));
  const total = db
    .prepare(`SELECT ${aggregate} FROM chatbot_requests WHERE ${where}`)
    .get(...args);
  const modelCount = db
    .prepare(
      `SELECT COUNT(*) n FROM (SELECT 1 FROM chatbot_requests WHERE ${where} GROUP BY provider,model,kind,model_source)`,
    )
    .get(...args).n;
  const pages = Math.max(1, Math.ceil(modelCount / PAGE_SIZE));
  page = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
  const models = db
    .prepare(
      `SELECT provider,model,kind,model_source,${aggregate} FROM chatbot_requests
    WHERE ${where} GROUP BY provider,model,kind,model_source ORDER BY calls DESC,provider,model,kind,model_source LIMIT ? OFFSET ?`,
    )
    .all(...args, PAGE_SIZE, page * PAGE_SIZE);
  const users = db
    .prepare(
      `SELECT user_id,COUNT(DISTINCT turn_id) turns,COUNT(*) calls,
    SUM(total_tokens) tokens,SUM(reported_cost_usd) reported_cost,
    SUM(CASE WHEN reported_cost_usd IS NULL THEN estimated_cost_usd ELSE NULL END) estimated_cost
    FROM chatbot_requests WHERE ${where} GROUP BY user_id ORDER BY calls DESC,user_id LIMIT 5`,
    )
    .all(...args);
  const trackedSince = db
    .prepare("SELECT MIN(started_at) at FROM chatbot_requests WHERE guild_id=?")
    .get(String(guildId)).at;
  return {
    total,
    models,
    users,
    days,
    page,
    pages,
    modelCount,
    start,
    now,
    trackedSince,
  };
}
function costText(row) {
  return `API báo: **${usd(row.reported_cost)}** · Ước tính: **${usd(row.estimated_cost)}**`;
}
function panel(guildId, ownerId, { days = 1, userId = null, page = 0 } = {}) {
  const r = report(guildId, { days, userId, page }),
    t = r.total;
  const date = (ms) =>
    new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📊 CHATBOT · USAGE / MODEL / COST")
    .setDescription(
      `${days === 1 ? "Hôm nay" : days + " ngày lịch gần nhất"} · giờ Việt Nam\n${date(r.start)} → ${date(r.now)}\n${userId ? `Người chơi: <@${userId}>` : "Toàn server"}`,
    )
    .addFields(
      {
        name: "Lượt và API",
        value: `${number(t.turns)} câu hỏi · ${number(t.calls)} lần gọi API\n${number(t.successful)} thành công · ${number(t.failed)} lỗi · ${number(t.pending)} chưa có kết quả\n${number(t.moderation)} kiểm duyệt · ${number(t.fallbacks)} gọi model dự phòng`,
      },
      {
        name: "Token API đã báo",
        value: `Input **${number(t.input_tokens)}** · Output **${number(t.output_tokens)}**\nTổng **${number(t.total_tokens)}** · Cache **${number(t.cached_tokens)}** · Suy nghĩ **${number(t.reasoning_tokens)}**\nCache thuộc input; suy nghĩ thuộc output, không cộng hai lần.\nThiếu input/output: ${number(t.missing_usage)} lần; thiếu chi tiết cache/suy nghĩ: ${number(t.missing_cache)}/${number(t.missing_reasoning)}.`,
      },
      {
        name: "Chi phí USD",
        value: `${costText(t)}\nToken theo đơn giá: ${usd(t.token_cost)} · Tìm kiếm theo đơn giá: ${usd(t.search_cost)}\n**${number(t.missing_cost)} lần chưa xác định đủ chi phí**. Các phần token/tìm kiếm có thể chỉ là subtotal.\nAPI báo và ước tính là hai nhóm riêng; không phải hóa đơn đầy đủ.`,
      },
      {
        name: "Tìm kiếm",
        value: `${number(t.search_calls)} lần bật Google Search · ${number(t.search_queries)} truy vấn nguồn được trả về\n${number(t.missing_search)} lần thiếu số truy vấn. Phí tìm kiếm chỉ ước tính khi có đơn giá và metadata; số truy vấn nguồn có thể khác đơn vị tính phí.`,
      },
    );
  for (const row of r.models)
    embed.addFields({
      name: `${safe(row.provider)} · ${safe(row.model)}${row.kind === "moderation" ? " · kiểm duyệt" : ""}`.slice(
        0,
        256,
      ),
      value: `${number(row.calls)} API · ${number(row.failed)} lỗi · ${number(row.fallbacks)} fallback\nInput ${number(row.input_tokens)} / Output ${number(row.output_tokens)} · Tổng ${number(row.total_tokens)}\n${costText(row)} · ${number(row.missing_cost)} lần thiếu giá/usage${row.model_source === "requested" ? "\nModel theo yêu cầu; API không xác nhận tên thực tế." : ""}`,
    });
  if (r.users.length && !userId)
    embed.addFields({
      name: "Top 5 người dùng theo lượt API",
      value: r.users
        .map(
          (row) =>
            `<@${row.user_id}> · ${number(row.turns)} câu / ${number(row.calls)} API · ${number(row.tokens)} token`,
        )
        .join("\n"),
    });
  embed.setFooter({
    text: `Trang ${r.page + 1}/${r.pages} · ${r.modelCount} nhóm model · ${r.trackedSince ? "Ghi nhận từ " + date(r.trackedSince) : "Chưa có dữ liệu kể từ khi bật ghi nhận"} · Dữ liệu cũ không được suy đoán`,
  });
  const id = (p) => `chatbot-stats:${ownerId}:${days}:${userId || "all"}:${p}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id(Math.max(0, r.page - 1)) + ":prev")
      .setLabel("Trước")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r.page === 0),
    new ButtonBuilder()
      .setCustomId(id(r.page) + ":refresh")
      .setLabel("Làm mới")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id(Math.min(r.pages - 1, r.page + 1)) + ":next")
      .setLabel("Sau")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r.page >= r.pages - 1),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}
function isAdmin(interaction) {
  const ids = String(process.env.ADMIN_USER_ID || "")
    .split(/[,;\n]/)
    .map((x) => x.trim());
  return (
    ids.includes(interaction.user.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}
async function handleButton(interaction) {
  const [prefix, owner, days, user, page, action] =
    interaction.customId.split(":");
  if (
    !interaction.guildId ||
    !isAdmin(interaction) ||
    owner !== interaction.user.id
  )
    return interaction.reply({
      content: "Chỉ admin đã mở báo cáo mới được dùng bảng này.",
      flags: MessageFlags.Ephemeral,
    });
  if (
    prefix !== "chatbot-stats" ||
    !PERIODS.includes(Number(days)) ||
    !/^\d{1,6}$/.test(page) ||
    (user !== "all" && !/^\d{5,25}$/.test(user)) ||
    !["prev", "next", "refresh"].includes(action)
  )
    return interaction.reply({
      content: "Bảng thống kê không hợp lệ. Mở lại /chatbot thongke.",
      flags: MessageFlags.Ephemeral,
    });
  return interaction.update(
    panel(interaction.guildId, owner, {
      days: Number(days),
      userId: user === "all" ? null : user,
      page: Number(page),
    }),
  );
}

module.exports = {
  withContext,
  beginRequest,
  finishRequest,
  safely,
  normalizeUsage,
  estimate,
  endpointKey,
  setPrice,
  report,
  panel,
  handleButton,
  isAdmin,
  usd,
};
