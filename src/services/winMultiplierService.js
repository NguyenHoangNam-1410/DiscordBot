const { db } = require("../db");

// Hệ số thắng = tổng tiền nhận về / tiền cược khi thắng (2 = cược 1 ăn 1: lãi bằng tiền cược).
// Chỉ áp dụng cho các game đấu 1-1 với nhà cái; các tay/cửa đặc biệt (Xì dách tự nhiên, Shigoro, Bộ ba...) có tỷ lệ riêng.
const MIN_WIN_MULTIPLIER = 1.1;
const MAX_WIN_MULTIPLIER = 3;

const WIN_MULTIPLIER_GAMES = Object.freeze([
  { game: "blackjack", emoji: "🃏", label: "Xì dách (với bot)", fallback: 2,
    note: "Thắng thường và Ngũ linh; Xì dách tự nhiên = hệ số + 0,5" },
  { game: "chinchiro", emoji: "🎲", label: "Chinchiro", fallback: 1.8,
    note: "Thắng khi điểm cao hơn nhà cái; Shigoro, Bão, Pin-Zoro giữ nguyên" },
  { game: "coquay", emoji: "🔫", label: "Cò quay Nga", fallback: 2,
    note: "Hạ Bot về 0 máu" },
  { game: "taixiu", emoji: "🎯", label: "Tài xỉu · Tài/Xỉu/Chẵn/Lẻ", fallback: 2,
    note: "Ra bộ ba vẫn thua; Bộ ba và Tổng cụ thể giữ nguyên" },
]);
const GAME_KEYS = WIN_MULTIPLIER_GAMES.map((item) => item.game);
const settingKey = (game) => `WIN_MULT_${String(game).toUpperCase()}`;

function getSpec(game) {
  const spec = WIN_MULTIPLIER_GAMES.find((item) => item.game === game);
  if (!spec) throw new Error("INVALID_WIN_MULTIPLIER_GAME");
  return spec;
}
// Làm tròn 2 chữ số để tránh số lẻ khó đọc và sai số khi tính tiền.
const normalize = (value) => Math.round(Number(value) * 100) / 100;

function parseMultiplier(input) {
  const text = String(input ?? "").trim().replace(",", ".").replace(/^x/i, "");
  const value = Number(text);
  if (!text || !Number.isFinite(value) || value < MIN_WIN_MULTIPLIER || value > MAX_WIN_MULTIPLIER) {
    const error = new Error("INVALID_WIN_MULTIPLIER");
    error.min = MIN_WIN_MULTIPLIER;
    error.max = MAX_WIN_MULTIPLIER;
    throw error;
  }
  return normalize(value);
}

function storedValue(guildId, game) {
  const row = db
    .prepare("SELECT setting_value FROM game_settings WHERE guild_id=? AND setting_key=?")
    .get(String(guildId), settingKey(game));
  if (!row) return null;
  try { return parseMultiplier(row.setting_value); } catch { return null; }
}

function getWinMultiplier(guildId, game) {
  const spec = getSpec(game);
  return (guildId && storedValue(guildId, game)) || spec.fallback;
}
function setWinMultiplier(guildId, game, input, updatedBy = "unknown") {
  getSpec(game);
  const value = parseMultiplier(input);
  db.prepare(
    `INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at) VALUES(?,?,?,?,?)
     ON CONFLICT(guild_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(String(guildId), settingKey(game), String(value), String(updatedBy), Date.now());
  return describeWinMultiplier(guildId, game);
}
function resetWinMultiplier(guildId, game) {
  getSpec(game);
  db.prepare("DELETE FROM game_settings WHERE guild_id=? AND setting_key=?").run(String(guildId), settingKey(game));
  return describeWinMultiplier(guildId, game);
}
function resetAllWinMultipliers(guildId) {
  for (const game of GAME_KEYS) resetWinMultiplier(guildId, game);
  return listWinMultipliers(guildId);
}

// Ước tính RTP (%) khi người chơi chơi tối ưu, không dùng vật phẩm. Các công thức được test đối chiếu với mô phỏng/liệt kê thật.
const TAIXIU_EVEN_WIN_PROBABILITY = 105 / 216; // Tài/Xỉu/Chẵn/Lẻ thua khi ra bộ ba
const COQUAY_OPTIMAL_WIN_PROBABILITY = 0.5552; // người chơi đi trước, đánh tối ưu
// Xì dách: RTP tuyến tính theo hệ số (mô phỏng 3.000.000 ván, chiến thuật cơ bản, không gấp đôi; Xì dách tự nhiên = hệ số + 0,5).
const BLACKJACK_RTP_MODEL = Object.freeze({ intercept: 14.0, slope: 47.1 });

// Chinchiro: tính chính xác từ xác suất xúc xắc. Mỗi lần lắc 216 kết quả: Hifumi 6, Shigoro 6, Pin-Zoro 1, Bão 5, mỗi điểm 15, vô tướng 108;
// tối đa 3 lần lắc nên P(tay) = P(lần lắc) × 1,75 và Menashi = 1/8. Người chơi có thêm 1% Shonben (thua) ở lượt lắc đầu.
function chinchiroRtp(multiplier) {
  const turn = 1.75 / 216;
  const point = 15 * turn; const hifumi = 6 * turn; const shigoro = 6 * turn; const pin = 1 * turn; const zoro = 5 * turn;
  const menashi = 0.125;
  const dealerPlayerWins = hifumi + menashi + point; // Hifumi, Menashi, điểm 1 của nhà cái → người chơi thắng ngay
  const dealerWins = shigoro + pin + zoro + point; // Shigoro, Bão, Pin-Zoro, điểm 6 của nhà cái → thua ngay
  let payout = dealerPlayerWins * multiplier;
  let penalty = 0;
  for (const dealerPoint of [2, 3, 4, 5]) {
    const weight = point; // xác suất nhà cái ra đúng điểm này
    const alive = 0.99; // không bị Shonben
    const winPoints = Math.max(0, 6 - dealerPoint); // điểm người chơi cao hơn nhà cái
    const returnPlayer = alive * (shigoro * 2 + pin * 4 + zoro * 3 + winPoints * point * multiplier + point * 1);
    payout += weight * returnPlayer;
    penalty += weight * alive * hifumi * 1; // Hifumi: mất thêm một lần tiền cược
  }
  return (payout - penalty) * 100;
}
function estimateRtp(game, multiplier) {
  if (game === "taixiu") return TAIXIU_EVEN_WIN_PROBABILITY * multiplier * 100;
  if (game === "coquay") return COQUAY_OPTIMAL_WIN_PROBABILITY * multiplier * 100;
  if (game === "blackjack") return BLACKJACK_RTP_MODEL.intercept + BLACKJACK_RTP_MODEL.slope * multiplier;
  if (game === "chinchiro") return chinchiroRtp(multiplier);
  return null;
}

function describeWinMultiplier(guildId, game) {
  const spec = getSpec(game);
  const value = getWinMultiplier(guildId, game);
  return { ...spec, value, customized: storedValue(guildId, game) !== null, rtp: estimateRtp(game, value) };
}
function listWinMultipliers(guildId) {
  return GAME_KEYS.map((game) => describeWinMultiplier(guildId, game));
}
// Hiển thị: 2 → "x2", 1.8 → "x1,8".
const formatMultiplier = (value) => `x${String(normalize(value)).replace(".", ",")}`;

module.exports = {
  MIN_WIN_MULTIPLIER, MAX_WIN_MULTIPLIER, WIN_MULTIPLIER_GAMES, TAIXIU_EVEN_WIN_PROBABILITY, COQUAY_OPTIMAL_WIN_PROBABILITY,
  getWinMultiplier, setWinMultiplier, resetWinMultiplier, resetAllWinMultipliers, listWinMultipliers, describeWinMultiplier,
  parseMultiplier, estimateRtp, chinchiroRtp, BLACKJACK_RTP_MODEL, formatMultiplier,
};
