const { db } = require("../db");

// Only these reviewed settings may be edited through Discord. Secrets and API URLs
// deliberately have no spec. Legacy env values remain startup defaults during migration.
const { BET_GAMES } = require("./gameBetLimitService");
const { GAMES } = require("./gameChannelService");
const { WIN_MULTIPLIER_GAMES } = require("./winMultiplierService");
const numeric = (label, fallback, min, max, scope, extra = {}) =>
  Object.freeze({
    label,
    fallback,
    min,
    max,
    scope,
    type: "integer",
    note: "Áp dụng cho server này.",
    ...extra,
  });
const text = (label, fallback, scope, extra = {}) =>
  Object.freeze({
    label,
    fallback,
    scope,
    type: "string",
    maxLength: 300,
    note: "Áp dụng cho yêu cầu hoặc ván mới trong server này.",
    ...extra,
  });
const GAME_CONFIG_SPECS = Object.freeze({
  ECONOMY_STARTING_COINS: Object.freeze({
    label: "Xu khởi đầu",
    type: "integer",
    min: 0,
    max: 1_000_000,
    fallback: 1_000,
    note: "Chỉ áp dụng cho tài khoản economy được tạo sau khi thay đổi.",
    clampEnv: true,
  }),
  VUATIENGVIET_REWARD: Object.freeze({
    label: "Thưởng Vua Tiếng Việt",
    type: "integer",
    min: 0,
    max: 100_000,
    fallback: 25,
    note: "Số xu cho mỗi đáp án đúng.",
    storage: "game_reward",
    game: "vuatiengviet",
  }),
  HARD_QUESTION_CHANCE: Object.freeze({
    label: "Tỷ lệ câu khó",
    type: "number",
    min: 0,
    max: 1,
    fallback: 0.1,
    note: "Nhập từ 0 đến 1; ví dụ 0.15 tương ứng 15%.",
    clampEnv: true,
  }),
  HARD_QUESTION_DURATION_SECONDS: Object.freeze({
    label: "Thời gian câu hỏi khó",
    type: "integer",
    min: 5,
    max: 3_600,
    fallback: 60,
    note: "Số giây trả lời cho mỗi câu khó mới.",
    clampEnv: true,
  }),
  VTV_DAILY_SKIP_LIMIT: Object.freeze({
    label: "Lượt bỏ qua Vua tiếng Việt mỗi ngày",
    type: "integer",
    min: 0,
    max: 5,
    fallback: 5,
    note: "Số câu mỗi người chơi được bỏ qua mỗi ngày (giờ Việt Nam); mỗi lượt có hồi chiêu 5 phút.",
  }),
  POKER_ANTE: Object.freeze({
    label: "Ante Poker",
    type: "integer",
    min: 10,
    max: 100_000,
    fallback: 50,
    note: "Áp dụng cho bàn Poker mở mới.",
  }),
  LEVEL_XP_PER_LEVEL: Object.freeze({
    label: "EXP cơ sở mỗi cấp",
    type: "integer",
    min: 10,
    max: 100_000,
    fallback: 200,
    note: "EXP cần lên cấp = cấp hiện tại × giá trị này.",
  }),
  GAME_EXP_BASE: Object.freeze({
    label: "EXP cơ bản mỗi ván",
    type: "integer",
    min: 0,
    max: 10_000,
    fallback: 10,
    note: "Áp dụng đủ khi cược từ 100.000 xu; cược nhỏ hơn nhận EXP theo tỷ lệ. Dưới 1.000 xu không cộng tiến độ.",
  }),
  GAME_EXP_WIN_COIN_DIVISOR: Object.freeze({
    label: "Mốc xu đổi EXP thắng",
    type: "integer",
    min: 1,
    max: 1_000_000,
    fallback: 2_000,
    note: "Mỗi lượng xu thắng ròng này cộng thêm 1 EXP.",
  }),
  GAME_EXP_MAX: Object.freeze({
    label: "EXP tối đa mỗi ván",
    type: "integer",
    min: 1,
    max: 100_000,
    fallback: 500,
    note: "Giới hạn tổng EXP có thể nhận từ một ván.",
  }),
  GAME_COIN_DROP_CHANCE: Object.freeze({
    label: "Tỷ lệ drop xu sau ván",
    type: "number",
    min: 0,
    max: 1,
    fallback: 0.1,
    note: "Nhập từ 0 đến 1; ví dụ 0.1 tương ứng 10%.",
    clampEnv: true,
  }),
  GAME_COIN_DROP_MIN: Object.freeze({
    label: "Xu drop tối thiểu",
    type: "integer",
    min: 1,
    max: 10_000_000,
    fallback: 100,
    note: "Số xu thấp nhất khi roll trúng drop.",
  }),
  GAME_COIN_DROP_MAX: Object.freeze({
    label: "Xu drop tối đa",
    type: "integer",
    min: 1,
    max: 10_000_000,
    fallback: 500,
    note: "Số xu cao nhất khi roll trúng drop.",
  }),
  GAME_DIAMOND_DROP_CHANCE: Object.freeze({
    label: "Tỷ lệ drop gem sau ván",
    type: "number",
    min: 0,
    max: 1,
    fallback: 0.05,
    note: "Đã ngừng: sau ván chỉ còn drop xu.",
    clampEnv: true,
    retired: true,
  }),
  GAME_DIAMOND_DROP_MIN: Object.freeze({
    label: "Gem drop tối thiểu",
    type: "integer",
    min: 1,
    max: 1_000_000,
    fallback: 1,
    note: "Đã ngừng: sau ván chỉ còn drop xu.",
    retired: true,
  }),
  GAME_DIAMOND_DROP_MAX: Object.freeze({
    label: "Gem drop tối đa",
    type: "integer",
    min: 1,
    max: 1_000_000,
    fallback: 3,
    note: "Đã ngừng: sau ván chỉ còn drop xu.",
    retired: true,
  }),
  GAME_ITEM_DROP_MULTIPLIER: Object.freeze({
    label: "Hệ số tỷ lệ rơi vật phẩm game",
    type: "number",
    min: 0,
    max: 10,
    fallback: 1,
    note: "Đã ngừng: sau ván chỉ còn drop xu.",
    clampEnv: true,
    retired: true,
  }),
  GACHA_RATE_XU: Object.freeze({
    label: "Tỷ lệ Gacha · bậc XU (xu)",
    type: "number",
    min: 0,
    max: 100,
    fallback: 50,
    note: "Trọng số bậc, tự chuẩn hóa về 100% cùng các bậc khác. Vật phẩm trong bậc được chọn ngẫu nhiên đều.",
  }),
  GACHA_RATE_R: Object.freeze({
    label: "Tỷ lệ Gacha · bậc R",
    type: "number",
    min: 0,
    max: 100,
    fallback: 22,
    note: "Trọng số bậc, tự chuẩn hóa về 100% cùng các bậc khác. Số vật phẩm trong bậc không ảnh hưởng tỷ lệ bậc.",
  }),
  GACHA_RATE_SR: Object.freeze({
    label: "Tỷ lệ Gacha · bậc SR",
    type: "number",
    min: 0.1,
    max: 100,
    fallback: 14,
    note: "Trọng số bậc, tự chuẩn hóa về 100%. Tối thiểu 0.1 để bảo hiểm SR luôn hoạt động.",
  }),
  GACHA_RATE_SSR: Object.freeze({
    label: "Tỷ lệ Gacha · bậc SSR",
    type: "number",
    min: 0.1,
    max: 100,
    fallback: 10,
    note: "Trọng số bậc, tự chuẩn hóa về 100%. Tối thiểu 0.1 để bảo hiểm SSR luôn hoạt động.",
  }),
  GACHA_RATE_UR: Object.freeze({
    label: "Tỷ lệ Gacha · bậc UR",
    type: "number",
    min: 0.1,
    max: 100,
    fallback: 4,
    note: "Trọng số bậc, tự chuẩn hóa về 100%. Tối thiểu 0.1 để bảo hiểm UR luôn hoạt động.",
  }),
  DIVINE_EYE_MAX_BET: Object.freeze({
    label: "Giới hạn cược khi dùng Mắt Thần",
    type: "integer",
    min: 10,
    max: 100_000,
    fallback: 10_000,
    note: "Đã ngừng: vật phẩm không áp dụng cho ván nhiều người.",
    retired: true,
  }),
  ...Object.fromEntries(
    BET_GAMES.map((game) => [
      `MAX_BET_${game}`,
      numeric("Giới hạn cược", 100000, 10, 100000, game, {
        storage: "bet",
        game,
      }),
    ]),
  ),
  ...Object.fromEntries(
    WIN_MULTIPLIER_GAMES.map((item) => [
      `WIN_MULT_${item.game.toUpperCase()}`,
      numeric("Hệ số thắng", item.fallback, 1.1, 3, item.game, {
        type: "number",
        note: item.note,
      }),
    ]),
  ),
  ...Object.fromEntries(
    GAMES.map((game) => [
      `MAINTENANCE_${game}`,
      numeric("Bảo trì", 0, 0, 1, game, {
        storageKey: `maintenance:${game}`,
        note: "0 = mở game; 1 = bảo trì.",
      }),
    ]),
  ),
  ...Object.fromEntries(
    GAMES.map((game) => [
      `CHANNELS_${game}`,
      text("Kênh trò chơi", "", game, {
        storage: "channels",
        game,
        maxLength: 2000,
        note:
          game === "vuatiengviet"
            ? "Nhập một ID kênh văn bản; trống = gỡ kênh."
            : "Các ID kênh văn bản cách nhau bằng dấu phẩy; trống = gỡ hết.",
      }),
    ]),
  ),
  CHATBOT_PROVIDER: text("Nhà cung cấp AI", "openai", "chatbot", {
    choices: ["openai", "gemini", "openrouter"],
  }),
  OPENAI_MODEL: text("Model chính và dự phòng", "", "chatbot", {
    pattern: /^[a-zA-Z0-9._:/, -]*$/,
    note: "Tên model cách nhau bằng dấu phẩy; trống = mặc định nhà cung cấp. OpenRouter cần model cụ thể.",
  }),
  CHATBOT_DAILY_LIMIT: numeric("Lượt chat mỗi ngày", 20, 1, 500, "chatbot", {
    storage: "chatbot_limit",
  }),
  CHATBOT_MAX_TOKENS: numeric(
    "Token tối đa mỗi câu trả lời",
    1500,
    100,
    8000,
    "chatbot",
  ),
  CHATBOT_RETRY_DELAY_MS: numeric(
    "Chờ thử lại (ms)",
    2000,
    0,
    30000,
    "chatbot",
  ),
  CHATBOT_GOOGLE_SEARCH: numeric("Google Search", 0, 0, 1, "chatbot", {
    note: "0 = tắt; 1 = bật. Chỉ dùng Gemini, có thể phát sinh phí tìm kiếm.",
  }),
  CHATBOT_CHANNEL: text("Kênh chatbot", "", "chatbot", {
    storage: "chatbot_channel",
    note: "Một ID kênh văn bản; trống = cho phép mọi kênh.",
  }),
  HARDCORE_BOSS_ROSTER_VERSION: numeric("Danh sách boss", 0, 0, 2, "hardcore", {
    note: "0 = tự động theo engine; 1/2 = ép danh sách boss. Chỉ áp dụng run mới.",
  }),
});
const CONFIG_SCOPES = Object.freeze({
  VUATIENGVIET_REWARD: "vuatiengviet",
  HARD_QUESTION_CHANCE: "vuatiengviet",
  HARD_QUESTION_DURATION_SECONDS: "vuatiengviet",
  VTV_DAILY_SKIP_LIMIT: "vuatiengviet",
  POKER_ANTE: "poker",
  ...Object.fromEntries(
    ["XU", "R", "SR", "SSR", "UR"].map((tier) => [
      `GACHA_RATE_${tier}`,
      "gacha",
    ]),
  ),
});
const configScope = (key) =>
  GAME_CONFIG_SPECS[key]?.scope || CONFIG_SCOPES[key] || "system";
const configKeysForScope = (scope) =>
  GAME_CONFIG_KEYS.filter((key) => configScope(key) === scope);
const GAME_CONFIG_KEYS = Object.freeze(
  Object.keys(GAME_CONFIG_SPECS).filter(
    (key) => !GAME_CONFIG_SPECS[key].retired,
  ),
);

function getSpec(key) {
  const spec =
    Object.hasOwn(GAME_CONFIG_SPECS, String(key)) &&
    GAME_CONFIG_SPECS[String(key)];
  if (!spec) throw new Error("INVALID_GAME_CONFIG");
  return spec;
}

function normalizeValue(key, input) {
  const spec = getSpec(key);
  const raw = String(input ?? "").trim();
  if (spec.type === "string") {
    if (
      raw.length > spec.maxLength ||
      (spec.choices && !spec.choices.includes(raw)) ||
      (spec.pattern && !spec.pattern.test(raw)) ||
      (spec.storage === "chatbot_channel" && raw && !/^\d{17,20}$/.test(raw)) ||
      (spec.storage === "channels" &&
        raw &&
        (!/^\d{17,20}(?:\s*,\s*\d{17,20})*$/.test(raw) ||
          (spec.game === "vuatiengviet" && raw.includes(","))))
    ) {
      const error = new Error("INVALID_GAME_CONFIG_VALUE");
      error.spec = spec;
      throw error;
    }
    return raw;
  }
  const value = raw === "" ? NaN : Number(raw);
  if (
    !Number.isFinite(value) ||
    value < spec.min ||
    value > spec.max ||
    (spec.type === "integer" && !Number.isSafeInteger(value))
  ) {
    const error = new Error("INVALID_GAME_CONFIG_VALUE");
    error.key = key;
    error.spec = spec;
    throw error;
  }
  return value;
}

function defaultValue(key) {
  const spec = getSpec(key);
  let raw = process.env[key];
  if (key === "CHATBOT_GOOGLE_SEARCH" && raw != null)
    raw = /^(1|true|on|yes)$/i.test(raw.trim()) ? "1" : "0";
  if (key === "CHATBOT_PROVIDER" && raw) raw = raw.toLowerCase();
  if (raw == null || raw.trim() === "") return spec.fallback;
  if (spec.type === "string") {
    try {
      return normalizeValue(key, raw);
    } catch {
      return spec.fallback;
    }
  }
  const configured = Number(raw);
  if (!Number.isFinite(configured)) return spec.fallback;
  if (spec.clampEnv) {
    const value = spec.type === "integer" ? Math.floor(configured) : configured;
    return Math.max(spec.min, Math.min(spec.max, value));
  }
  try {
    return normalizeValue(key, configured);
  } catch {
    return spec.fallback;
  }
}

function storedRow(guildId, key) {
  const spec = getSpec(key);
  if (spec.storage === "bet")
    return (
      db
        .prepare(
          "SELECT max_bet AS setting_value FROM game_bet_limits WHERE guild_id=? AND game=?",
        )
        .get(String(guildId), spec.game) || null
    );
  if (spec.storage === "channels") {
    const rows = db
      .prepare(
        "SELECT channel_id FROM game_channels WHERE guild_id=? AND game=? ORDER BY channel_id",
      )
      .all(String(guildId), spec.game);
    return rows.length
      ? { setting_value: rows.map((row) => row.channel_id).join(",") }
      : null;
  }
  if (spec.storage === "chatbot_limit")
    return (
      db
        .prepare(
          "SELECT daily_limit AS setting_value FROM chatbot_settings WHERE guild_id=?",
        )
        .get(String(guildId)) || null
    );
  if (spec.storage === "chatbot_channel")
    return (
      db
        .prepare(
          "SELECT channel_id AS setting_value FROM chatbot_channels WHERE guild_id=?",
        )
        .get(String(guildId)) || null
    );
  if (spec.storage === "game_reward") {
    const row = db
      .prepare(
        "SELECT reward AS setting_value, updated_at FROM game_rewards WHERE guild_id=? AND game=?",
      )
      .get(String(guildId), spec.game);
    return row ? { ...row, updated_by: null } : null;
  }
  return (
    db
      .prepare(
        "SELECT setting_value,updated_by,updated_at FROM game_settings WHERE guild_id=? AND setting_key=?",
      )
      .get(String(guildId), spec.storageKey || String(key)) || null
  );
}

function getGameConfig(guildId, key) {
  const row = storedRow(guildId, key);
  return row ? normalizeValue(key, row.setting_value) : defaultValue(key);
}

function getGameConfigDetail(guildId, key) {
  const spec = getSpec(key);
  const row = storedRow(guildId, key);
  return {
    key,
    ...spec,
    value: row ? normalizeValue(key, row.setting_value) : defaultValue(key),
    customized: Boolean(row),
    updatedBy: row?.updated_by || null,
    updatedAt: row?.updated_at || null,
  };
}

function listGameConfigs(guildId, scope = null) {
  return (scope == null ? GAME_CONFIG_KEYS : configKeysForScope(scope)).map(
    (key) => getGameConfigDetail(guildId, key),
  );
}

function setGameConfig(guildId, key, input, updatedBy = "unknown") {
  const spec = getSpec(key);
  const value = normalizeValue(key, input);
  const rangeMatch = String(key).match(
    /^(GAME_(?:COIN|DIAMOND)_DROP)_(MIN|MAX)$/,
  );
  if (rangeMatch) {
    const otherKey = `${rangeMatch[1]}_${rangeMatch[2] === "MIN" ? "MAX" : "MIN"}`;
    const otherValue = getGameConfig(guildId, otherKey);
    if (
      (rangeMatch[2] === "MIN" && value > otherValue) ||
      (rangeMatch[2] === "MAX" && value < otherValue)
    ) {
      const error = new Error("INVALID_DROP_RANGE");
      error.key = key;
      error.otherKey = otherKey;
      throw error;
    }
  }
  const now = Date.now();
  if (spec.storage === "bet") {
    require("./gameBetLimitService").setGameBetLimit(guildId, spec.game, value);
  } else if (spec.storage === "channels") {
    db.transaction(() => {
      db.prepare("DELETE FROM game_channels WHERE guild_id=? AND game=?").run(
        String(guildId),
        spec.game,
      );
      for (const id of new Set(value ? value.split(/\s*,\s*/) : []))
        require("./gameChannelService").addGameChannel(guildId, spec.game, id);
    })();
  } else if (spec.storage === "chatbot_limit") {
    require("./chatbotService").setDailyLimit(guildId, value, updatedBy);
  } else if (spec.storage === "chatbot_channel") {
    const chatbot = require("./chatbotService");
    if (value) chatbot.setChannel(guildId, value, updatedBy);
    else chatbot.clearChannel(guildId);
  } else if (spec.storage === "game_reward") {
    db.prepare(
      `INSERT INTO game_rewards(guild_id,game,reward,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(guild_id,game) DO UPDATE SET reward=excluded.reward,updated_at=excluded.updated_at`,
    ).run(String(guildId), spec.game, value, now);
  } else {
    db.prepare(
      `INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,
        updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    ).run(
      String(guildId),
      spec.storageKey || String(key),
      String(value),
      String(updatedBy),
      now,
    );
  }
  return getGameConfigDetail(guildId, key);
}

function resetGameConfig(guildId, key) {
  const spec = getSpec(key);
  if (/^GAME_(?:COIN|DIAMOND)_DROP_(?:MIN|MAX)$/.test(key)) {
    db.transaction(() => {
      setGameConfig(guildId, key, defaultValue(key));
    })();
  }
  if (spec.storage === "bet")
    db.prepare("DELETE FROM game_bet_limits WHERE guild_id=? AND game=?").run(
      String(guildId),
      spec.game,
    );
  else if (spec.storage === "channels")
    db.prepare("DELETE FROM game_channels WHERE guild_id=? AND game=?").run(
      String(guildId),
      spec.game,
    );
  else if (spec.storage === "chatbot_limit")
    db.prepare("DELETE FROM chatbot_settings WHERE guild_id=?").run(
      String(guildId),
    );
  else if (spec.storage === "chatbot_channel")
    db.prepare("DELETE FROM chatbot_channels WHERE guild_id=?").run(
      String(guildId),
    );
  else if (spec.storage === "game_reward")
    db.prepare("DELETE FROM game_rewards WHERE guild_id=? AND game=?").run(
      String(guildId),
      spec.game,
    );
  else
    db.prepare(
      "DELETE FROM game_settings WHERE guild_id=? AND setting_key=?",
    ).run(String(guildId), spec.storageKey || String(key));
  return getGameConfigDetail(guildId, key);
}

module.exports = {
  configScope,
  configKeysForScope,
  GAME_CONFIG_KEYS,
  GAME_CONFIG_SPECS,
  getGameConfig,
  getGameConfigDetail,
  listGameConfigs,
  setGameConfig,
  resetGameConfig,
  normalizeValue,
};
