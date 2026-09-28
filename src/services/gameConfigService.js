const { db } = require('../db');

const GAME_CONFIG_SPECS = Object.freeze({
  ECONOMY_STARTING_COINS: Object.freeze({
    label: 'Xu khởi đầu', type: 'integer', min: 0, max: 1_000_000, fallback: 1_000,
    note: 'Chỉ áp dụng cho tài khoản economy được tạo sau khi thay đổi.', clampEnv: true,
  }),
  VUATIENGVIET_REWARD: Object.freeze({
    label: 'Thưởng Vua Tiếng Việt', type: 'integer', min: 0, max: 100_000, fallback: 25,
    note: 'Số xu cho mỗi đáp án đúng.', storage: 'game_reward', game: 'vuatiengviet',
  }),
  HARD_QUESTION_CHANCE: Object.freeze({
    label: 'Tỷ lệ câu khó', type: 'number', min: 0, max: 1, fallback: 0.1,
    note: 'Nhập từ 0 đến 1; ví dụ 0.15 tương ứng 15%.', clampEnv: true,
  }),
  HARD_QUESTION_DURATION_SECONDS: Object.freeze({
    label: 'Thời gian câu hỏi khó', type: 'integer', min: 5, max: 3_600, fallback: 30,
    note: 'Số giây trả lời cho mỗi câu khó mới.', clampEnv: true,
  }),
  POKER_ANTE: Object.freeze({
    label: 'Ante Poker', type: 'integer', min: 10, max: 100_000, fallback: 50,
    note: 'Áp dụng cho bàn Poker mở mới.',
  }),
  LEVEL_XP_PER_LEVEL: Object.freeze({
    label: 'EXP cơ sở mỗi cấp', type: 'integer', min: 10, max: 100_000, fallback: 200,
    note: 'EXP cần lên cấp = cấp hiện tại × giá trị này.',
  }),
  GAME_EXP_BASE: Object.freeze({
    label: 'EXP cơ bản mỗi ván', type: 'integer', min: 0, max: 10_000, fallback: 10,
    note: 'EXP tối thiểu nhận được sau mỗi ván có kết quả.',
  }),
  GAME_EXP_WIN_COIN_DIVISOR: Object.freeze({
    label: 'Mốc xu đổi EXP thắng', type: 'integer', min: 1, max: 1_000_000, fallback: 2_000,
    note: 'Mỗi lượng xu thắng ròng này cộng thêm 1 EXP.',
  }),
  GAME_EXP_MAX: Object.freeze({
    label: 'EXP tối đa mỗi ván', type: 'integer', min: 1, max: 100_000, fallback: 500,
    note: 'Giới hạn tổng EXP có thể nhận từ một ván.',
  }),
  GAME_COIN_DROP_CHANCE: Object.freeze({
    label: 'Tỷ lệ drop xu sau ván', type: 'number', min: 0, max: 1, fallback: 0.1,
    note: 'Nhập từ 0 đến 1; ví dụ 0.1 tương ứng 10%.', clampEnv: true,
  }),
  GAME_COIN_DROP_MIN: Object.freeze({
    label: 'Xu drop tối thiểu', type: 'integer', min: 1, max: 10_000_000, fallback: 100,
    note: 'Số xu thấp nhất khi roll trúng drop.',
  }),
  GAME_COIN_DROP_MAX: Object.freeze({
    label: 'Xu drop tối đa', type: 'integer', min: 1, max: 10_000_000, fallback: 500,
    note: 'Số xu cao nhất khi roll trúng drop.',
  }),
  GAME_DIAMOND_DROP_CHANCE: Object.freeze({
    label: 'Tỷ lệ drop gem sau ván', type: 'number', min: 0, max: 1, fallback: 0.05,
    note: 'Nhập từ 0 đến 1; ví dụ 0.05 tương ứng 5%.', clampEnv: true,
  }),
  GAME_DIAMOND_DROP_MIN: Object.freeze({
    label: 'Gem drop tối thiểu', type: 'integer', min: 1, max: 1_000_000, fallback: 1,
    note: 'Số gem thấp nhất khi roll trúng drop.',
  }),
  GAME_DIAMOND_DROP_MAX: Object.freeze({
    label: 'Gem drop tối đa', type: 'integer', min: 1, max: 1_000_000, fallback: 3,
    note: 'Số gem cao nhất khi roll trúng drop.',
  }),
  GAME_GACHA_DROP_CHANCE: Object.freeze({
    label: 'Tỷ lệ drop lượt Gacha', type: 'number', min: 0, max: 1, fallback: 0.01,
    note: 'Nhập từ 0 đến 1; ví dụ 0.01 tương ứng 1%.', clampEnv: true,
  }),
  GAME_GACHA_DROP_MIN: Object.freeze({
    label: 'Lượt Gacha drop tối thiểu', type: 'integer', min: 1, max: 1000, fallback: 1,
    note: 'Số lượt miễn phí thấp nhất khi roll trúng drop.',
  }),
  GAME_GACHA_DROP_MAX: Object.freeze({
    label: 'Lượt Gacha drop tối đa', type: 'integer', min: 1, max: 1000, fallback: 1,
    note: 'Số lượt miễn phí cao nhất khi roll trúng drop.',
  }),
  DIVINE_EYE_MAX_BET: Object.freeze({
    label: 'Giới hạn cược khi dùng Mắt Thần', type: 'integer', min: 10, max: 100_000, fallback: 10_000,
    note: 'Tổng cược tối đa của người chơi trong ván đã dùng Mắt Thần.',
  }),
});

const GAME_CONFIG_KEYS = Object.freeze(Object.keys(GAME_CONFIG_SPECS));

function getSpec(key) {
  const spec = GAME_CONFIG_SPECS[String(key)];
  if (!spec) throw new Error('INVALID_GAME_CONFIG');
  return spec;
}

function normalizeValue(key, input) {
  const spec = getSpec(key);
  const value = Number(input);
  if (!Number.isFinite(value) || value < spec.min || value > spec.max || (spec.type === 'integer' && !Number.isSafeInteger(value))) {
    const error = new Error('INVALID_GAME_CONFIG_VALUE');
    error.key = key;
    error.spec = spec;
    throw error;
  }
  return value;
}

function defaultValue(key) {
  const spec = getSpec(key);
  const configured = Number(process.env[key]);
  if (!Number.isFinite(configured)) return spec.fallback;
  if (spec.clampEnv) {
    const value = spec.type === 'integer' ? Math.floor(configured) : configured;
    return Math.max(spec.min, Math.min(spec.max, value));
  }
  try { return normalizeValue(key, configured); }
  catch { return spec.fallback; }
}

function storedRow(guildId, key) {
  const spec = getSpec(key);
  if (spec.storage === 'game_reward') {
    const row = db.prepare('SELECT reward AS setting_value, updated_at FROM game_rewards WHERE guild_id=? AND game=?')
      .get(String(guildId), spec.game);
    return row ? { ...row, updated_by: null } : null;
  }
  return db.prepare('SELECT setting_value,updated_by,updated_at FROM game_settings WHERE guild_id=? AND setting_key=?')
    .get(String(guildId), String(key)) || null;
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

function listGameConfigs(guildId) {
  return GAME_CONFIG_KEYS.map(key => getGameConfigDetail(guildId, key));
}

function setGameConfig(guildId, key, input, updatedBy = 'unknown') {
  const spec = getSpec(key);
  const value = normalizeValue(key, input);
  const rangeMatch = String(key).match(/^(GAME_(?:COIN|DIAMOND|GACHA)_DROP)_(MIN|MAX)$/);
  if (rangeMatch) {
    const otherKey = `${rangeMatch[1]}_${rangeMatch[2] === 'MIN' ? 'MAX' : 'MIN'}`;
    const otherValue = getGameConfig(guildId, otherKey);
    if ((rangeMatch[2] === 'MIN' && value > otherValue) || (rangeMatch[2] === 'MAX' && value < otherValue)) {
      const error = new Error('INVALID_DROP_RANGE'); error.key = key; error.otherKey = otherKey; throw error;
    }
  }
  const now = Date.now();
  if (spec.storage === 'game_reward') {
    db.prepare(`INSERT INTO game_rewards(guild_id,game,reward,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(guild_id,game) DO UPDATE SET reward=excluded.reward,updated_at=excluded.updated_at`)
      .run(String(guildId), spec.game, value, now);
  } else {
    db.prepare(`INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,
        updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .run(String(guildId), String(key), String(value), String(updatedBy), now);
  }
  return getGameConfigDetail(guildId, key);
}

function resetGameConfig(guildId, key) {
  const spec = getSpec(key);
  if (spec.storage === 'game_reward') db.prepare('DELETE FROM game_rewards WHERE guild_id=? AND game=?').run(String(guildId), spec.game);
  else db.prepare('DELETE FROM game_settings WHERE guild_id=? AND setting_key=?').run(String(guildId), String(key));
  return getGameConfigDetail(guildId, key);
}

module.exports = {
  GAME_CONFIG_KEYS,
  GAME_CONFIG_SPECS,
  getGameConfig,
  getGameConfigDetail,
  listGameConfigs,
  setGameConfig,
  resetGameConfig,
  normalizeValue,
};
