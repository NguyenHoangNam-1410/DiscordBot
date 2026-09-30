const crypto = require('node:crypto');
const { MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createFairness, fairInt, fairShuffle } = require('./fairnessService');
const horseRaceRepository = require('./horseRaceRepository');
const horseRaceView = require('./horseRaceView');
const { applyDebuff, selectWeighted } = require('./horseRaceEngine');

const ROUND_MS = 30_000;
const RACE_ANIMATION_MS = 18_000;
const RACE_FRAME_COUNT = 9;
const RACE_FRAME_MS = RACE_ANIMATION_MS / RACE_FRAME_COUNT;
const MIN_BET = 10;
const MAX_BET_PER_HORSE = 100_000;
const MAX_BET_PER_ROUND = 500_000;
const timers = new Map();
const activeRaces = new Map();

// Weight controls win chance. Multiplier includes the returned stake and is
// intentionally a little below the fair inverse probability.
const HORSES = Object.freeze({
  sao_bang: { emoji: '🐎', name: 'Sao Băng', weight: 32, multiplier: 3.3, ability: 'Nhịp Chạy Hoàn Hảo', style: 'Ổn định từ đầu đến cuối', favored: ['morning'], curve: [10, 21, 33, 45, 57, 69, 80, 90, 100] },
  bao_den: { emoji: '🏇', name: 'Bão Đen', weight: 25, multiplier: 4.2, ability: 'Vua Khúc Cua', style: 'Tăng tốc mạnh ở giữa đường đua', favored: ['evening'], curve: [9, 20, 32, 46, 60, 73, 84, 93, 100] },
  lua_do: { emoji: '🐴', name: 'Lửa Đỏ', weight: 19, multiplier: 5.4, ability: 'Hỏa Tốc', style: 'Nước rút cực mạnh cuối đường', favored: ['noon'], curve: [7, 15, 24, 34, 46, 60, 75, 90, 100] },
  nguyet_anh: { emoji: '🦄', name: 'Nguyệt Ảnh', weight: 14, multiplier: 7.2, ability: 'Ánh Trăng Hồi Sức', style: 'Càng chạy lâu càng bền bỉ', favored: ['night'], curve: [6, 14, 23, 34, 47, 62, 77, 90, 100] },
  set_trang: { emoji: '⚡', name: 'Sét Trắng', weight: 10, multiplier: 9.8, ability: 'Lôi Đình Xuất Phát', style: 'Bùng nổ đầu trận, dễ hụt hơi', favored: ['morning', 'noon'], curve: [17, 31, 44, 55, 65, 74, 82, 90, 100] },
  bong_ma: { emoji: '👻', name: 'Bóng Ma', weight: 8, multiplier: 12.0, ability: 'Núp Gió', style: 'Ẩn mình rồi bất ngờ vượt mặt', favored: ['night'], curve: [7, 16, 27, 40, 55, 70, 84, 94, 100] },
  thiet_giap: { emoji: '🛡️', name: 'Thiết Giáp', weight: 7, multiplier: 13.5, ability: 'Bất Khuất', style: 'Miễn nhiễm sự cố, tiến đều chắc chắn', favored: ['noon'], curve: [9, 19, 30, 41, 53, 65, 77, 89, 100] },
  phuong_hoang: { emoji: '🔥', name: 'Phượng Hoàng', weight: 5, multiplier: 18.0, ability: 'Tái Sinh', style: 'Lội ngược dòng ở những chặng cuối', favored: ['evening'], curve: [5, 11, 18, 28, 41, 57, 75, 92, 100] },
  hong_van: { emoji: '🌸', name: 'Hồng Vân', weight: 18, multiplier: 5.8, ability: 'Vân Bộ', style: 'Lướt nhẹ và ít mất sức', favored: ['morning'], curve: [9, 19, 30, 42, 54, 67, 79, 90, 100] },
  lam_phong: { emoji: '🌊', name: 'Lam Phong', weight: 16, multiplier: 6.4, ability: 'Thuận Gió', style: 'Tăng tốc khi đường đua thông thoáng', favored: ['evening'], curve: [8, 18, 29, 41, 54, 68, 81, 92, 100] },
  kim_tien: { emoji: '🏹', name: 'Kim Tiễn', weight: 15, multiplier: 6.9, ability: 'Xuyên Phong', style: 'Bứt tốc theo đường thẳng', favored: ['noon'], curve: [8, 17, 27, 39, 52, 66, 80, 92, 100] },
  hac_nhat: { emoji: '🌑', name: 'Hắc Nhật', weight: 13, multiplier: 7.8, ability: 'Bóng Tối Bao Phủ', style: 'Mạnh hơn khi trời tối', favored: ['night'], curve: [7, 16, 26, 38, 51, 65, 79, 91, 100] },
  tuyet_vu: { emoji: '❄️', name: 'Tuyết Vũ', weight: 12, multiplier: 8.3, ability: 'Băng Tâm', style: 'Giữ bình tĩnh khi đoàn đua hỗn loạn', favored: ['night', 'morning'], curve: [8, 17, 28, 40, 53, 66, 79, 90, 100] },
  sa_mac: { emoji: '🏜️', name: 'Sa Mạc', weight: 11, multiplier: 9.0, ability: 'Bền Bỉ', style: 'Thể lực vượt trội ở đường dài', favored: ['noon'], curve: [6, 14, 23, 34, 47, 61, 76, 90, 100] },
  dai_duong: { emoji: '🔱', name: 'Đại Dương', weight: 10, multiplier: 9.8, ability: 'Sóng Trào', style: 'Tăng tốc theo từng đợt', favored: ['evening'], curve: [7, 15, 25, 37, 50, 64, 78, 91, 100] },
  moc_linh: { emoji: '🍀', name: 'Mộc Linh', weight: 9, multiplier: 10.8, ability: 'May Mắn', style: 'Dễ né được biến cố bất ngờ', favored: ['morning'], curve: [8, 17, 27, 39, 51, 64, 77, 89, 100] },
  tu_dien: { emoji: '🟣', name: 'Tử Điện', weight: 8, multiplier: 12.0, ability: 'Điện Quang', style: 'Tăng tốc chớp nhoáng giữa trận', favored: ['night'], curve: [7, 16, 28, 43, 58, 71, 82, 92, 100] },
  hoang_kim: { emoji: '👑', name: 'Hoàng Kim', weight: 7, multiplier: 13.5, ability: 'Khí Chất Đế Vương', style: 'Càng bị bám đuổi càng chạy nhanh', favored: ['noon', 'evening'], curve: [7, 15, 25, 37, 50, 64, 79, 92, 100] },
  bac_cuc: { emoji: '🌨️', name: 'Bắc Cực', weight: 6, multiplier: 15.0, ability: 'Hàn Khí', style: 'Giữ sức để bùng nổ cuối trận', favored: ['night'], curve: [5, 12, 20, 30, 43, 58, 74, 91, 100] },
  cuong_phong: { emoji: '🌪️', name: 'Cuồng Phong', weight: 5, multiplier: 18.0, ability: 'Bão Tố', style: 'Tốc độ cao nhưng cực kỳ thất thường', favored: ['evening'], curve: [12, 24, 34, 44, 54, 65, 77, 90, 100] },
  thien_ma: { emoji: '🌟', name: 'Thiên Mã', weight: 2, multiplier: 30.0, ability: 'Thiên Mệnh', style: 'Thần mã hiếm có thể đảo ngược định mệnh', favored: ['morning', 'noon', 'evening', 'night'], special: true, curve: [6, 13, 22, 33, 46, 61, 78, 94, 100] },
});

const REGULAR_HORSE_KEYS = Object.keys(HORSES).filter(key => !HORSES[key].special);
const SPECIAL_HORSE_KEY = Object.keys(HORSES).find(key => HORSES[key].special);
const HORSES_PER_RACE = 6;
const SPECIAL_APPEARANCE_PERCENT = 7;

const HORSE_CLASSES = Object.freeze({
  can_bang: { emoji: '⚖️', name: 'Cân bằng', description: 'Ít điểm yếu, thích nghi nhiều địa hình' },
  toc_do: { emoji: '💨', name: 'Tốc độ', description: 'Bứt tốc mạnh nhưng nhạy cảm với thời tiết' },
  ben_bi: { emoji: '🫀', name: 'Bền bỉ', description: 'Mạnh ở đường dài và điều kiện khắc nghiệt' },
  ky_thuat: { emoji: '🎯', name: 'Kỹ thuật', description: 'Giỏi ôm cua và xử lý mặt đường khó' },
  bi_an: { emoji: '🔮', name: 'Bí ẩn', description: 'Phát huy sức mạnh trong điều kiện lạ' },
  phong_thu: { emoji: '🛡️', name: 'Phòng thủ', description: 'Chống chịu biến cố và địa hình xấu' },
  dot_bien: { emoji: '🎲', name: 'Đột biến', description: 'Phong độ thất thường, có thể bùng nổ' },
  than_thoai: { emoji: '🌟', name: 'Thần thoại', description: 'Hệ độc quyền của Thiên Mã' },
});

const HORSE_CLASS_BY_KEY = Object.freeze({
  sao_bang: 'can_bang', bao_den: 'ky_thuat', lua_do: 'toc_do', nguyet_anh: 'bi_an', set_trang: 'toc_do',
  bong_ma: 'bi_an', thiet_giap: 'phong_thu', phuong_hoang: 'dot_bien', hong_van: 'can_bang', lam_phong: 'ky_thuat',
  kim_tien: 'toc_do', hac_nhat: 'bi_an', tuyet_vu: 'phong_thu', sa_mac: 'ben_bi', dai_duong: 'ben_bi',
  moc_linh: 'phong_thu', tu_dien: 'toc_do', hoang_kim: 'ky_thuat', bac_cuc: 'ben_bi', cuong_phong: 'dot_bien', thien_ma: 'than_thoai',
});

const RACE_DEBUFFS = Object.freeze([
  { id: 'heavy_rain', emoji: '🌧️', name: 'Mưa lớn', description: 'Mưa xối xả làm đường trơn và hạn chế khả năng tăng tốc.', modifiers: { can_bang: 0.96, toc_do: 0.72, ben_bi: 1.15, ky_thuat: 1.06, bi_an: 1, phong_thu: 1.12, dot_bien: 0.9, than_thoai: 1.05 } },
  { id: 'deep_mud', emoji: '🟫', name: 'Bùn lầy', description: 'Bùn sâu kéo chân những ngựa nhẹ, ưu tiên khả năng chống chịu.', modifiers: { can_bang: 0.94, toc_do: 0.74, ben_bi: 1.08, ky_thuat: 1.08, bi_an: 0.96, phong_thu: 1.2, dot_bien: 0.84, than_thoai: 1.04 } },
  { id: 'headwind', emoji: '🌬️', name: 'Gió ngược', description: 'Gió mạnh thổi trực diện, nước rút tốc độ cao bị kìm hãm.', modifiers: { can_bang: 0.98, toc_do: 0.76, ben_bi: 1.16, ky_thuat: 1.04, bi_an: 0.95, phong_thu: 1.08, dot_bien: 0.9, than_thoai: 1.03 } },
  { id: 'sharp_turns', emoji: '↩️', name: 'Cua gắt liên hoàn', description: 'Đường đua đổi hướng liên tục, kỹ thuật quan trọng hơn tốc độ thuần túy.', modifiers: { can_bang: 1, toc_do: 0.79, ben_bi: 0.96, ky_thuat: 1.24, bi_an: 1, phong_thu: 1.04, dot_bien: 0.88, than_thoai: 1.05 } },
  { id: 'heat_wave', emoji: '☀️', name: 'Nắng nóng', description: 'Nhiệt độ cao bào mòn thể lực và thử thách khả năng đường dài.', modifiers: { can_bang: 0.96, toc_do: 0.88, ben_bi: 1.2, ky_thuat: 0.96, bi_an: 0.9, phong_thu: 1.08, dot_bien: 0.86, than_thoai: 1.02 } },
  { id: 'dense_fog', emoji: '🌫️', name: 'Sương mù', description: 'Tầm nhìn giảm mạnh; bản năng và năng lực bí ẩn trở thành lợi thế.', modifiers: { can_bang: 0.94, toc_do: 0.8, ben_bi: 1, ky_thuat: 0.92, bi_an: 1.25, phong_thu: 1.05, dot_bien: 1.08, than_thoai: 1.08 } },
  { id: 'slippery_track', emoji: '🧊', name: 'Mặt đường trơn', description: 'Mỗi bước chân đều có thể trượt; kỹ thuật và phòng thủ lên ngôi.', modifiers: { can_bang: 0.94, toc_do: 0.7, ben_bi: 0.96, ky_thuat: 1.2, bi_an: 1, phong_thu: 1.18, dot_bien: 0.82, than_thoai: 1.06 } },
  { id: 'wild_crowd', emoji: '📣', name: 'Khán đài náo loạn', description: 'Tiếng hò reo làm ngựa mất tập trung, nhưng hệ Đột biến lại càng hưng phấn.', modifiers: { can_bang: 0.96, toc_do: 0.92, ben_bi: 1, ky_thuat: 0.94, bi_an: 0.9, phong_thu: 1.08, dot_bien: 1.25, than_thoai: 1.05 } },
]);

function horseClass(key) { return HORSE_CLASSES[HORSE_CLASS_BY_KEY[key]]; }

function rollRaceDebuff(participants, forcedId = null, randomIndex = null) {
  const base = (forcedId && RACE_DEBUFFS.find(item => item.id === forcedId)) || RACE_DEBUFFS[randomIndex === null ? crypto.randomInt(RACE_DEBUFFS.length) : Math.max(0, Math.min(RACE_DEBUFFS.length - 1, randomIndex))];
  const effects = participants.map(key => {
    const classKey = HORSE_CLASS_BY_KEY[key];
    return { horse: key, classKey, modifier: base.modifiers[classKey] || 1 };
  });
  return { ...base, effects };
}

function marketWithDebuff(market, debuff) {
  return applyDebuff(market, debuff);
}

function horseLabel(key, market = null) {
  const horse = HORSES[key];
  const multiplier = market?.horses?.[key]?.multiplier ?? horse?.multiplier;
  return horse ? `${horse.emoji} ${horse.name} · x${multiplier}` : key;
}

function localRaceTime(now = Date.now()) {
  const timeZone = process.env.ECONOMY_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  const period = hour < 6 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'noon' : hour < 22 ? 'evening' : 'night';
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour, period, timeZone };
}

const PERIOD_LABELS = { morning: 'Buổi sáng', noon: 'Buổi trưa', evening: 'Buổi tối', night: 'Đêm khuya' };

function generateRaceMarket(now = Date.now(), options = {}) {
  const local = localRaceTime(now);
  const candidates = [...REGULAR_HORSE_KEYS];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1); [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
  }
  const specialAppears = options.forceSpecial === true || (options.forceSpecial !== false && crypto.randomInt(100) < SPECIAL_APPEARANCE_PERCENT);
  const selected = candidates.slice(0, HORSES_PER_RACE);
  if (specialAppears) selected[HORSES_PER_RACE - 1] = SPECIAL_HORSE_KEY;
  const raw = {};
  for (const key of selected) {
    const horse = HORSES[key];
    const dailyByte = crypto.createHash('sha256').update(`${local.dateKey}:${key}`).digest()[0];
    const dailyFactor = 0.85 + (dailyByte / 255) * 0.3;
    const timeFactor = horse.favored.includes(local.period) ? 1.12 : 0.96;
    const raceFactor = crypto.randomInt(82, 119) / 100;
    raw[key] = { adjusted: horse.weight * dailyFactor * timeFactor * raceFactor, dailyFactor, timeFactor, raceFactor };
  }
  const total = Object.values(raw).reduce((sum, item) => sum + item.adjusted, 0);
  const horses = {};
  for (const [key, values] of Object.entries(raw)) {
    const chance = values.adjusted / total;
    const formRatio = values.adjusted / HORSES[key].weight;
    const form = formRatio >= 1.14 ? '🔥 Thăng hoa' : formRatio >= 1.02 ? '💪 Sung sức' : formRatio >= 0.9 ? '🙂 Ổn định' : '😴 Xuống phong độ';
    horses[key] = {
      weight: Math.max(1, Math.round(values.adjusted * 100)), chance,
      multiplier: Math.max(1.5, Math.min(30, Math.floor((0.82 / chance) * 10) / 10)), form,
    };
  }
  return { dateKey: local.dateKey, period: local.period, periodLabel: PERIOD_LABELS[local.period], generatedAt: now, specialAppears, selected, horses };
}

const parseRoundData = horseRaceRepository.parseRoundData;

function marketForRound(round) {
  const saved = parseRoundData(round).market;
  if (saved?.horses) return saved;
  const selected = REGULAR_HORSE_KEYS.slice(0, HORSES_PER_RACE);
  const total = selected.reduce((sum, key) => sum + HORSES[key].weight, 0);
  return { dateKey: 'mặc định', period: 'normal', periodLabel: 'Điều kiện tiêu chuẩn', specialAppears: false, selected, horses: Object.fromEntries(selected.map(key => [key, { weight: HORSES[key].weight, chance: HORSES[key].weight / total, multiplier: HORSES[key].multiplier, form: '🙂 Ổn định' }])) };
}

const getRound = horseRaceRepository.getRound;

function getOpenHorseRace(guildId) {
  return horseRaceRepository.getOpen(guildId);
}

function raceStats(roundId) {
  return horseRaceRepository.stats(roundId);
}

function raceButtons(round, disabled = false) {
  const market = marketForRound(round);
  return horseRaceView.raceButtons(round, market, HORSES, disabled);
}

function raceEmbed(round) {
  const stats = raceStats(round.id);
  const market = marketForRound(round);
  const maxBet = getGameBetLimit(round.guild_id, 'duangua');
  return horseRaceView.raceEmbed(round, { stats, market, maxBet, horses: HORSES, minBet: MIN_BET, horseCount: HORSES_PER_RACE });
}

async function fetchRaceMessage(round, client) {
  if (!round.message_id || !client) return null;
  const channel = await client.channels.fetch(round.channel_id).catch(() => null);
  return channel?.messages?.fetch(round.message_id).catch(() => null);
}

async function refreshRace(round, client) {
  const message = await fetchRaceMessage(round, client);
  if (message) await message.edit({ embeds: [raceEmbed(round)], components: raceButtons(round) }).catch(() => {});
}

const placeHorseBetTx = db.transaction(({ roundId, userId, horse, amount }) => {
  const round = getRound(roundId);
  if (!round || round.status !== 'open' || round.closes_at <= Date.now()) throw new Error('ROUND_CLOSED');
  if (!HORSES[horse] || !marketForRound(round).horses[horse]) throw new Error('INVALID_HORSE');
  if (!Number.isSafeInteger(amount) || amount < MIN_BET || amount > MAX_BET_PER_HORSE) throw new Error('INVALID_BET');
  const maxBet = getGameBetLimit(round.guild_id, 'duangua');
  const { current, total } = horseRaceRepository.betTotals(roundId, userId, horse);
  if (current + amount > maxBet || total + amount > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  const account = spendCoins({ guildId: round.guild_id, userId, amount, reason: `duangua:reserve:${roundId}` });
  const now = Date.now();
  horseRaceRepository.addBet(roundId, userId, horse, amount, now);
  return { round, account, horseAmount: current + amount, totalAmount: total + amount };
});

function weightedWinner(randomValue = null, market = null) {
  const keys = market?.selected || Object.keys(HORSES);
  const weights = market ? Object.fromEntries(keys.map(key => [key, market.horses[key].weight])) : Object.fromEntries(keys.map(key => [key, HORSES[key].weight]));
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return selectWeighted(randomValue === null ? crypto.randomInt(total) : randomValue, keys, weights);
}

function finishOrder(winner, participants = Object.keys(HORSES), serverSeed = null) {
  const rest = serverSeed ? fairShuffle(participants.filter(key => key !== winner), serverSeed, 'horse-order') : participants.filter(key => key !== winner);
  if (serverSeed) return [winner, ...rest];
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const target = crypto.randomInt(i + 1);
    [rest[i], rest[target]] = [rest[target], rest[i]];
  }
  return [winner, ...rest];
}

const VICTORY_STYLES = Object.freeze({
  sao_bang: ['giữ tốc độ cực kỳ ổn định', 'tăng tốc đúng lúc ở 200 m cuối'],
  bao_den: ['ôm cua gọn và không mất đà', 'ép sát đường trong để rút ngắn quãng chạy'],
  lua_do: ['duy trì nhịp chân mạnh mẽ', 'tung cú nước rút dữ dội ở đoạn thẳng cuối'],
  nguyet_anh: ['giữ sức rất tốt ở nửa đầu', 'vượt lên khi các đối thủ bắt đầu hụt hơi'],
  set_trang: ['bình tĩnh bám nhóm dẫn đầu', 'bùng nổ bằng cú nước rút bất ngờ sát đích'],
  bong_ma: ['núp gió sau nhóm dẫn đầu để tiết kiệm sức', 'bất ngờ đổi làn và vượt lên như một bóng ma'],
  thiet_giap: ['giữ nhịp chắc chắn bất chấp va chạm', 'lì lợm tiến lên khi các đối thủ lần lượt xuống sức'],
  phuong_hoang: ['không hoảng loạn dù bị bỏ xa ở đầu trận', 'tái sinh ngoạn mục bằng màn lội ngược dòng sát đích'],
});

function victoryStyleFor(key) {
  return VICTORY_STYLES[key] || [HORSES[key].style.toLowerCase(), `phát huy ${HORSES[key].ability} đúng thời điểm để vượt lên sát đích`];
}

const TROLL_EVENTS = Object.freeze([
  { emoji: '🤢', penalty: 9, text: name => `**${name}** bất ngờ đau bụng, vừa chạy vừa tìm nhà vệ sinh!` },
  { emoji: '💥', penalty: 8, text: name => `**${name}** vấp chân, suýt đo đường ngay giữa sân!` },
  { emoji: '🌿', penalty: 10, text: name => `**${name}** dừng lại gặm cỏ như thể không có cuộc đua nào đang diễn ra!` },
  { emoji: '📸', penalty: 6, text: name => `**${name}** mải nhìn camera tạo dáng và bị đoàn sau áp sát!` },
  { emoji: '🦋', penalty: 7, text: name => `**${name}** đuổi theo một con bướm rồi chạy nhầm làn!` },
  { emoji: '🤧', penalty: 6, text: name => `**${name}** hắt hơi liên tục, mất sạch nhịp phi nước đại!` },
  { emoji: '🎩', penalty: 5, text: name => `Nài ngựa của **${name}** rơi mũ và ngoái lại nhìn, làm chậm cả đội!` },
]);

function buildRacePlan(winner, order = finishOrder(winner), debuff = null) {
  order = [...new Set([winner, ...order.filter(key => HORSES[key])])];
  const targets = order.map((_, index) => Math.max(70, 100 - index * 4));
  const incidentHorses = order.filter(key => !['thiet_giap', 'moc_linh', 'thien_ma'].includes(key));
  const fallbackIncidentHorses = order.filter(key => key !== 'thiet_giap');
  while (incidentHorses.length < 3) incidentHorses.push(fallbackIncidentHorses[incidentHorses.length % fallbackIncidentHorses.length]);
  for (let index = incidentHorses.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1); [incidentHorses[index], incidentHorses[target]] = [incidentHorses[target], incidentHorses[index]];
  }
  if (crypto.randomInt(4) === 0 && !['thiet_giap', 'moc_linh', 'thien_ma'].includes(winner)) {
    const winnerIndex = incidentHorses.indexOf(winner);
    if (winnerIndex > 0) [incidentHorses[0], incidentHorses[winnerIndex]] = [incidentHorses[winnerIndex], incidentHorses[0]];
  }
  const eventFrames = [2, 4, 6];
  const surprises = eventFrames.map((frame, index) => {
    const event = TROLL_EVENTS[crypto.randomInt(TROLL_EVENTS.length)];
    const horse = incidentHorses[index];
    return { frame, horse, penalty: horse === winner ? Math.max(3, event.penalty - 3) : event.penalty, text: `${event.emoji} ${event.text(HORSES[horse].name)}` };
  });
  const previous = Object.fromEntries(order.map(key => [key, 0]));
  const frames = Array.from({ length: RACE_FRAME_COUNT }, (_, frameIndex) => {
    const positions = {};
    for (const key of order) {
      const finish = targets[order.indexOf(key)];
      const horse = HORSES[key];
      const finalFrame = frameIndex === RACE_FRAME_COUNT - 1;
      const jitter = finalFrame || key === 'thiet_giap' ? 0 : crypto.randomInt(-4, 5);
      const ceiling = Math.min(97, finish - 2);
      const directIncident = surprises.find(item => item.horse === key && item.frame === frameIndex);
      const lingeringIncident = surprises.find(item => item.horse === key && item.frame === frameIndex - 1);
      const penalty = (directIncident?.penalty || 0) + Math.round((lingeringIncident?.penalty || 0) * 0.45);
      const classModifier = debuff?.effects?.find(effect => effect.horse === key)?.modifier || 1;
      const terrainAdjustment = finalFrame ? 0 : Math.round((classModifier - 1) * 16);
      const proposed = Math.round(finish * horse.curve[frameIndex] / 100) + jitter + terrainAdjustment - penalty;
      const position = finalFrame ? finish : Math.min(ceiling, Math.max(previous[key] + 3, proposed));
      positions[key] = position;
      previous[key] = position;
    }
    const leader = Object.keys(positions).sort((a, b) => positions[b] - positions[a])[0];
    return { positions, leader, commentary: '' };
  });
  const troubled = [...surprises].sort((a, b) => b.penalty - a.penalty)[0].horse;
  const abilityMoment = (key, prefix = '✨') => `${prefix} **${HORSES[key].name}** kích hoạt **${HORSES[key].ability}** — ${HORSES[key].style.toLowerCase()}!`;
  frames[0].commentary = `🚦 Xuất phát! **${HORSES[frames[0].leader].name}** phản ứng nhanh nhất khi cổng mở.`;
  frames[1].commentary = abilityMoment(frames[1].leader, '⚡');
  frames[2].commentary = surprises.find(item => item.frame === 2).text;
  frames[3].commentary = abilityMoment(frames[3].leader, '💨');
  frames[4].commentary = `${surprises.find(item => item.frame === 4).text}${order.includes('thiet_giap') ? '\n🛡️ **Thiết Giáp** dùng **Bất Khuất**, tỉnh bơ chạy xuyên hỗn loạn.' : ''}`;
  frames[5].commentary = abilityMoment(frames[5].leader, '🌙');
  frames[6].commentary = `${surprises.find(item => item.frame === 6).text}\n${abilityMoment(order.at(-1), '🔥')}`;
  frames[7].commentary = `💥 **${HORSES[winner].name}** kích hoạt **${HORSES[winner].ability}**, bắt đầu cú bứt phá quyết định!`;
  const winnerStyle = victoryStyleFor(winner);
  frames[8].commentary = `🏁 **${HORSES[winner].name}** ${winnerStyle[1]}, cán đích đầu tiên!`;
  return {
    winner, order, frames, troubled, surprises, debuff,
    reason: `✨ **Kỹ năng:** ${HORSES[winner].name} phát huy **${HORSES[winner].ability}**.\n🎯 **Chiến thuật:** ${winnerStyle[0]}.\n⚡ **Khoảnh khắc quyết định:** ${winnerStyle[1]}.${surprises.some(item => item.horse === winner) ? '\n💪 **Bản lĩnh:** Dính sự cố nhưng vẫn lấy lại nhịp kịp lúc.' : ''}\n💥 **Bước ngoặt:** ${HORSES[troubled].name} chịu sự cố nặng nhất và rơi khỏi cuộc cạnh tranh.`,
  };
}

function progressBar(percent, size = 14) {
  const filled = Math.max(0, Math.min(size, Math.round((percent / 100) * size)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

function debuffImpactText(debuff) {
  if (!debuff?.effects) return 'Điều kiện đường đua bình thường.';
  return debuff.effects.map(effect => {
    const horse = HORSES[effect.horse]; const category = HORSE_CLASSES[effect.classKey];
    const delta = Math.round((effect.modifier - 1) * 100);
    const marker = delta > 0 ? `🔺 +${delta}%` : delta < 0 ? `🔻 ${delta}%` : '➖ 0%';
    return `${horse.emoji} **${horse.name}** · ${category.name}: ${marker}`;
  }).join('\n');
}

function raceAnimationEmbed(round, plan, frameIndex) {
  return horseRaceView.raceAnimationEmbed(round, plan, frameIndex, { horses: HORSES, frameCount: RACE_FRAME_COUNT, animationMs: RACE_ANIMATION_MS, progressBar });
}

const beginHorseTx = db.transaction((roundId, forcedWinner = null) => {
  const round = getRound(roundId);
  if (!round || !['open', 'racing'].includes(round.status)) return null;
  const existing = parseRoundData(round);
  const market = existing.market || marketForRound(round);
  if (round.status === 'racing') {
    const saved = existing;
    if (saved.plan) return { round, winner: saved.winner, order: saved.order, plan: saved.plan };
  }
  const seed = existing.fair?.serverSeed;
  const debuff = existing.debuff || rollRaceDebuff(market.selected, null, seed ? fairInt(seed, 'horse-debuff', 0, RACE_DEBUFFS.length) : null);
  const effectiveMarket = marketWithDebuff(market, debuff);
  const totalWeight = effectiveMarket.selected.reduce((sum, key) => sum + effectiveMarket.horses[key].weight, 0);
  const winner = forcedWinner && market.horses[forcedWinner] ? forcedWinner : weightedWinner(seed ? fairInt(seed, 'horse-winner', 0, totalWeight) : null, effectiveMarket);
  const order = finishOrder(winner, market.selected, seed);
  const plan = buildRacePlan(winner, order, debuff);
  horseRaceRepository.savePlan(roundId, { market, fair: existing.fair, debuff, winner, order, plan });
  return { round: { ...round, status: 'racing' }, winner, order, plan };
});

const settleHorseTx = db.transaction((roundId, forcedWinner = null) => {
  const round = getRound(roundId);
  if (!round || !['open', 'racing'].includes(round.status)) return null;
  const planned = round.result_json ? JSON.parse(round.result_json) : {};
  const market = planned.market || marketForRound(round);
  const seed = planned.fair?.serverSeed;
  const debuff = planned.debuff || planned.plan?.debuff || rollRaceDebuff(market.selected, null, seed ? fairInt(seed, 'horse-debuff', 0, RACE_DEBUFFS.length) : null);
  const effectiveMarket = marketWithDebuff(market, debuff);
  const totalWeight = effectiveMarket.selected.reduce((sum, key) => sum + effectiveMarket.horses[key].weight, 0);
  const winner = forcedWinner && market.horses[forcedWinner] ? forcedWinner : planned.winner && market.horses[planned.winner] ? planned.winner : weightedWinner(seed ? fairInt(seed, 'horse-winner', 0, totalWeight) : null, effectiveMarket);
  const order = planned.order || finishOrder(winner, market.selected, seed);
  const plan = planned.plan || buildRacePlan(winner, order, debuff);
  const bets = horseRaceRepository.getBets(roundId);
  const users = new Map();
  for (const bet of bets) {
    const summary = users.get(bet.user_id) || { stake: 0, payout: 0, bets: [] };
    summary.stake += bet.amount;
    const betPayout = bet.choice === winner ? Math.floor(bet.amount * market.horses[winner].multiplier) : 0;
    summary.payout += betPayout; summary.bets.push({ choice: bet.choice, amount: bet.amount, payout: betPayout });
    users.set(bet.user_id, summary);
  }
  const settlements = [];
  for (const [userId, summary] of users) {
    const insurance = 0; const jackpot = 0; const consolation = 0;
    const outcome = summary.payout > summary.stake ? 'win' : summary.payout === summary.stake ? 'draw' : 'loss';
    const account = settleReservedGame({ guildId: round.guild_id, userId, payout: summary.payout, stake: summary.stake, game: 'duangua', outcome,
      operationId: `settle:duangua:${round.id}:${userId}` });
    settlements.push({ userId, ...summary, insurance, consolation, jackpot, itemEffect: null, outcome, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops });
  }
  horseRaceRepository.saveSettlement(roundId, { market, fair: planned.fair, debuff, winner, order, plan, settlements });
  return { round: { ...round, status: 'closed' }, market, fair: planned.fair, debuff, winner, order, plan, settlements };
});

function resultEmbed(settled) {
  return horseRaceView.resultEmbed(settled, HORSES);
}

function resultRows(roundId) { return horseRaceView.resultRows(roundId); }

async function runHorseRace(roundId, client, logger = console, forcedWinner = null) {
  clearTimeout(timers.get(roundId)); timers.delete(roundId);
  let started;
  try { started = beginHorseTx(roundId, forcedWinner); }
  catch (error) { logger.error?.({ err: error, roundId }, 'horse race start failed'); throw error; }
  if (!started) return null;
  const message = await fetchRaceMessage(started.round, client);
  if (message) {
    const cancelled = () => getRound(roundId)?.status === 'cancelled';
    for (let index = 0; index < RACE_FRAME_COUNT; index += 1) {
      if (cancelled()) return null;
      await message.edit({ content: null, embeds: [raceAnimationEmbed(started.round, started.plan, index)], components: [] }).catch(() => {});
      if (cancelled()) return null;
      await new Promise(resolve => setTimeout(resolve, RACE_FRAME_MS));
    }
    if (cancelled()) return null;
  }
  let settled;
  try { settled = settleHorseTx(roundId, forcedWinner); }
  catch (error) { logger.error?.({ err: error, roundId }, 'horse race settlement failed'); throw error; }
  if (!settled) return null;
  if (message) await message.edit({ embeds: [resultEmbed(settled)], components: resultRows(settled.round.id), allowedMentions: { parse: [] } }).catch(() => {});
  return settled;
}

function settleHorseRace(roundId, client, logger = console, forcedWinner = null) {
  if (activeRaces.has(roundId)) return activeRaces.get(roundId);
  const running = runHorseRace(roundId, client, logger, forcedWinner).finally(() => activeRaces.delete(roundId));
  activeRaces.set(roundId, running);
  return running;
}

function scheduleRace(round, client, logger = console) {
  clearTimeout(timers.get(round.id));
  const timer = setTimeout(() => settleHorseRace(round.id, client, logger).catch(() => {}), Math.max(0, round.closes_at - Date.now()));
  timer.unref?.(); timers.set(round.id, timer);
}

async function createHorseRace(interaction, logger = console) {
  const existing = getOpenHorseRace(interaction.guildId);
  if (existing) {
    if (existing.status === 'racing') return interaction.reply({ content: 'Ván đua hiện tại đã khóa cược và đang chạy về đích.', flags: MessageFlags.Ephemeral });
    if (existing.closes_at <= Date.now()) {
      settleHorseRace(existing.id, interaction.client, logger).catch(() => {});
      return interaction.reply({ content: `🏁 **Ván đua vừa khóa cược**\n⏱️ Cuộc đua trực tiếp kéo dài **${RACE_ANIMATION_MS / 1000} giây**.`, flags: MessageFlags.Ephemeral });
    }
    else return interaction.reply({ content: `Ván đua hiện tại vẫn nhận cược đến <t:${Math.floor(existing.closes_at / 1000)}:T>.`, flags: MessageFlags.Ephemeral });
  }
  const now = Date.now();
  const market = generateRaceMarket(now);
  const fair = createFairness();
  const round = { id: crypto.randomBytes(4).toString('hex'), guild_id: String(interaction.guildId), game: 'duangua', channel_id: String(interaction.channelId), message_id: null, status: 'open', closes_at: now + ROUND_MS, result_json: JSON.stringify({ market, fair }), created_at: now };
  horseRaceRepository.createRound(round, { market, fair });
  const response = await interaction.reply({ embeds: [raceEmbed(round)], components: raceButtons(round), withResponse: true });
  const message = response?.resource?.message;
  if (message?.id) { round.message_id = message.id; horseRaceRepository.setMessageId(round.id, message.id); }
  scheduleRace(round, interaction.client, logger);
  return round;
}

async function handleHorseButton(interaction) {
  const [, roundId, horse] = interaction.customId.split(':');
  const round = getRound(roundId);
  if (!round || round.guild_id !== interaction.guildId || round.channel_id !== interaction.channelId) return interaction.reply({ content: 'Không tìm thấy ván đua này.', flags: MessageFlags.Ephemeral });
  if (round?.status === 'closed' && ['debuff', 'reason', 'mine'].includes(horse)) {
    const settled = { round, ...parseRoundData(round) };
    if (horse === 'debuff') {
      return interaction.reply({ embeds: [horseRaceView.detailEmbed('debuff', settled, HORSES, debuffImpactText)], flags: MessageFlags.Ephemeral });
    }
    if (horse === 'reason') {
      return interaction.reply({ embeds: [horseRaceView.detailEmbed('reason', settled, HORSES, debuffImpactText)], flags: MessageFlags.Ephemeral });
    }
    const own = settled.settlements?.find(item => item.userId === interaction.user.id);
    if (!own) return interaction.reply({ content: 'Bạn không đặt cược trong ván này.', flags: MessageFlags.Ephemeral });
    const bets = horseRaceRepository.getUserBets(round.id, interaction.user.id);
    return interaction.reply({ embeds: horseRaceView.personalEmbeds(round, own, bets, HORSES), flags: MessageFlags.Ephemeral });
  }
  if (round.status !== 'open' || round.closes_at <= Date.now()) return interaction.reply({ content: 'Ván đua đã khóa cược.', flags: MessageFlags.Ephemeral });
  const market = marketForRound(round);
  if (!HORSES[horse] || !market.horses[horse]) return interaction.reply({ content: 'Ngựa này không tham gia ván hiện tại.', flags: MessageFlags.Ephemeral });
  const maxBet = getGameBetLimit(round.guild_id, 'duangua');
  return interaction.showModal(horseRaceView.betModal(roundId, horse, market, HORSES, MIN_BET, maxBet));
}

async function handleHorseModal(interaction) {
  const [, roundId, horse] = interaction.customId.split(':');
  async function reject(content) {
    const round = getRound(roundId);
    const open = round && round.guild_id === interaction.guildId && round.channel_id === interaction.channelId
      && round.status === 'open' && round.closes_at > Date.now();
    await interaction.update({ components: open ? raceButtons(round) : [] });
    return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  }
  const amountText = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(amountText);
  if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount)) return reject('Số xu cược không hợp lệ.');
  let placed;
  try { placed = placeHorseBetTx({ roundId, userId: interaction.user.id, horse, amount }); }
  catch (error) {
    const content = error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để đặt cược.'
      : error.message === 'ROUND_CLOSED' ? 'Ván đua đã khóa cược.'
        : error.message === 'INVALID_HORSE' ? 'Ngựa này không tham gia ván hiện tại.'
        : error.message === 'BET_LIMIT' ? `Tổng cược tối đa của bạn trong ván này là ${formatCoins(error.maxBet)} :coin:.`
          : `Mức cược phải từ ${formatCoins(MIN_BET)} đến ${formatCoins(MAX_BET_PER_HORSE)} :coin:.`;
    return reject(content);
  }
  const market = marketForRound(placed.round);
  await interaction.reply({ content: `## ✅ ĐẶT CƯỢC THÀNH CÔNG\n🐎 **Ngựa:** ${horseLabel(horse, market)}\n💰 **Lần này:** ${formatCoins(amount)} :coin:\n🎟️ **Tổng cược trong ván:** ${formatCoins(placed.totalAmount)} :coin:`, flags: MessageFlags.Ephemeral });
  await refreshRace(placed.round, interaction.client);
  const publicMessage = `<@${interaction.user.id}> đặt cược **${formatCoins(amount)} :coin:** vào **${horseLabel(horse, market)}** 🐎`;
  await interaction.channel?.send({ content: publicMessage }).catch(() => {});
  return null;
}

function resumeHorseRaces(client, logger = console) {
  const rounds = horseRaceRepository.listActive();
  for (const round of rounds) {
    if (round.status === 'racing') settleHorseRace(round.id, client, logger).catch(() => {});
    else scheduleRace(round, client, logger);
  }
  return rounds.length;
}

module.exports = {
  ROUND_MS, RACE_ANIMATION_MS, RACE_FRAME_COUNT, MIN_BET, MAX_BET_PER_HORSE, HORSES, horseLabel, weightedWinner,
  HORSES_PER_RACE, SPECIAL_APPEARANCE_PERCENT, REGULAR_HORSE_KEYS, SPECIAL_HORSE_KEY,
  HORSE_CLASSES, HORSE_CLASS_BY_KEY, RACE_DEBUFFS, horseClass, rollRaceDebuff, marketWithDebuff, debuffImpactText,
  getOpenHorseRace, createHorseRace, handleHorseButton, handleHorseModal,
  settleHorseRace, resumeHorseRaces, raceEmbed, raceButtons, resultEmbed, resultRows, buildRacePlan, raceAnimationEmbed,
  generateRaceMarket, marketForRound,
};
