const crypto = require('node:crypto');
const { normalizeVietnamese } = require('../utils/text');
const { db } = require('../db');
const { getGameConfig } = require('./gameConfigService');
const gameWordData = require('../../data/games/vietnamese-game-words.json');

const commandCooldowns = new Map();
const vuaSessions = new Map();
const HARD_DURATION_MS = 30_000;
const configuredHardChance = Number(process.env.HARD_QUESTION_CHANCE);
const HARD_QUESTION_CHANCE = Number.isFinite(configuredHardChance) ? Math.max(0, Math.min(1, configuredHardChance)) : 0.1;

const CURATED_VUA_QUESTIONS = [
  { answer: 'học sinh', hint: 'Người đang theo học' },
  { answer: 'tích cực', hint: 'Thái độ chủ động, tốt đẹp' },
  { answer: 'tưởng tượng', hint: 'Hình dung điều chưa có trước mắt' },
  { answer: 'quan trọng', hint: 'Có ý nghĩa lớn' },
  { answer: 'khỏe mạnh', hint: 'Có sức khỏe tốt' },
  { answer: 'động lực', hint: 'Điều thúc đẩy hành động' },
  { answer: 'nhận thức', hint: 'Sự hiểu biết' },
  { answer: 'tình nguyện', hint: 'Tự giác làm việc vì cộng đồng' },
  { answer: 'kinh nghiệm', hint: 'Điều tích lũy qua thực tế' },
  { answer: 'trách nhiệm', hint: 'Điều phải đảm nhận' },
  { answer: 'kiên nhẫn', hint: 'Bền bỉ chờ đợi' },
  { answer: 'tự tin', hint: 'Tin vào khả năng của mình' },
  { answer: 'đoàn kết', hint: 'Cùng chung sức' },
  { answer: 'sáng tạo', hint: 'Tạo ra điều mới' },
  { answer: 'hạnh phúc', hint: 'Trạng thái vui vẻ, mãn nguyện' },
];

const CURATED_HARD_VUA_QUESTIONS = [
  { answer: 'bất khả kháng', hint: 'Tình huống không thể lường trước hoặc kiểm soát' },
  { answer: 'chính trực', hint: 'Ngay thẳng và giữ nguyên tắc đạo đức' },
  { answer: 'khoan dung', hint: 'Biết tha thứ và cảm thông' },
  { answer: 'nghị lực', hint: 'Sức mạnh tinh thần giúp vượt khó' },
  { answer: 'thấu đáo', hint: 'Hiểu kỹ và đầy đủ mọi khía cạnh' },
  { answer: 'uyên bác', hint: 'Có kiến thức sâu rộng' },
  { answer: 'kiên định', hint: 'Vững vàng với lựa chọn của mình' },
  { answer: 'tương trợ', hint: 'Giúp đỡ lẫn nhau' },
];

const generatedVuaQuestions = gameWordData.vuaWords.map(answer => {
  const syllables = answer.split(/\s+/).length;
  const letters = Array.from(answer.replace(/\s+/g, '')).length;
  return { answer, hint: `${syllables} tiếng • ${letters} chữ cái` };
});
const VUA_QUESTIONS = [...new Map([...generatedVuaQuestions, ...CURATED_VUA_QUESTIONS]
  .map(question => [normalizeVietnamese(question.answer), question])).values()];
function isHardVuaQuestion(question) {
  const letters = Array.from(question.answer.replace(/\s+/g, '')).length;
  return question.answer.trim().split(/\s+/).length >= 3 || letters >= 13;
}
const NORMAL_VUA_QUESTIONS = VUA_QUESTIONS.filter(question => !isHardVuaQuestion(question));
const HARD_VUA_QUESTIONS = [...new Map([...VUA_QUESTIONS.filter(isHardVuaQuestion), ...CURATED_HARD_VUA_QUESTIONS]
  .map(question => [normalizeVietnamese(question.answer), question])).values()];
const RECENT_WORD_LIMIT = 2_000;

function saveSession(guildId, game, state) {
  db.prepare(`INSERT INTO game_sessions (guild_id, game, state_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .run(String(guildId), game, JSON.stringify(state), Date.now());
}

function loadSession(guildId, game) {
  const row = db.prepare('SELECT state_json FROM game_sessions WHERE guild_id = ? AND game = ?').get(String(guildId), game);
  if (!row) return null;
  try {
    return JSON.parse(row.state_json);
  } catch {
    db.prepare('DELETE FROM game_sessions WHERE guild_id = ? AND game = ?').run(String(guildId), game);
    return null;
  }
}

function deleteSession(guildId, game) {
  db.prepare('DELETE FROM game_sessions WHERE guild_id = ? AND game = ?').run(String(guildId), game);
}

function randomItem(items) {
  return items[crypto.randomInt(items.length)];
}

function shouldBeHard(options = {}) {
  if (options.forceHard === true) return true;
  if (options.forceHard === false) return false;
  const chance = Number.isFinite(options.hardChance) ? Math.max(0, Math.min(1, options.hardChance)) : HARD_QUESTION_CHANCE;
  return crypto.randomInt(1_000_000) < Math.floor(chance * 1_000_000);
}

function challengeMeta(hard, now = Date.now(), durationSeconds = HARD_DURATION_MS / 1000) {
  const duration = Number.isSafeInteger(durationSeconds) && durationSeconds > 0 ? durationSeconds : HARD_DURATION_MS / 1000;
  return { hard, expiresAt: hard ? now + duration * 1000 : null, durationSeconds: hard ? duration : null };
}

function isExpiredChallenge(value, now = Date.now()) {
  return Boolean(value?.hard && value.expiresAt && now >= value.expiresAt);
}

function consumeCommandCooldown(guildId, userId, game, milliseconds = 3000, now = Date.now()) {
  const key = `${guildId}:${userId}:${game}`;
  const remaining = Math.max(0, (commandCooldowns.get(key) || 0) - now);
  if (remaining > 0) return remaining;
  commandCooldowns.set(key, now + milliseconds);
  return 0;
}

function shuffleLetters(answer) {
  const original = Array.from(answer.replace(/\s+/g, ''));
  let shuffled = [...original];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    shuffled = [...original];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = crypto.randomInt(index + 1);
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    if (shuffled.join('') !== original.join('')) break;
  }
  return shuffled.join(' · ');
}

function makeVuaQuestion(base, hard = false, now = Date.now(), durationSeconds = HARD_DURATION_MS / 1000) {
  return { ...base, mixed: shuffleLetters(base.answer), ...challengeMeta(hard, now, durationSeconds) };
}

function nextVuaQuestion(recent = [], options = {}) {
  const hard = shouldBeHard(options);
  const pool = hard ? HARD_VUA_QUESTIONS : NORMAL_VUA_QUESTIONS;
  const recentSet = new Set(recent.map(normalizeVietnamese));
  const candidates = pool.filter(question => !recentSet.has(normalizeVietnamese(question.answer)));
  return makeVuaQuestion(randomItem(candidates.length ? candidates : pool), hard, options.now, options.hardDurationSeconds);
}

function configuredQuestionOptions(guildId, options = {}) {
  return {
    ...options,
    hardChance: getGameConfig(guildId, 'HARD_QUESTION_CHANCE'),
    hardDurationSeconds: getGameConfig(guildId, 'HARD_QUESTION_DURATION_SECONDS'),
  };
}

function startVuaSession(guildId, options = {}) {
  const question = nextVuaQuestion([], configuredQuestionOptions(guildId, options));
  const session = { question, recent: [normalizeVietnamese(question.answer)], rounds: 0 };
  vuaSessions.set(String(guildId), session);
  saveSession(guildId, 'vuatiengviet', session);
  return session;
}

function getVuaSession(guildId) {
  const key = String(guildId);
  if (!vuaSessions.has(key)) {
    const stored = loadSession(guildId, 'vuatiengviet');
    if (stored) {
      if (!stored.question?.mixed || stored.question.mixed.includes(' / ')) {
        stored.question = makeVuaQuestion(stored.question, Boolean(stored.question?.hard), Date.now(),
          getGameConfig(guildId, 'HARD_QUESTION_DURATION_SECONDS'));
      }
      stored.question.hard = Boolean(stored.question.hard || isHardVuaQuestion(stored.question));
      if (stored.question.hard && !stored.question.expiresAt) {
        stored.question.expiresAt = Date.now() + getGameConfig(guildId, 'HARD_QUESTION_DURATION_SECONDS') * 1000;
        stored.question.durationSeconds = getGameConfig(guildId, 'HARD_QUESTION_DURATION_SECONDS');
      }
      stored.question.expiresAt ||= null;
      stored.question.durationSeconds ||= stored.question.hard ? HARD_DURATION_MS / 1000 : null;
      stored.recent ||= [normalizeVietnamese(stored.question.answer)];
      vuaSessions.set(key, stored);
    }
  }
  return vuaSessions.get(key) || null;
}

function revealVuaLetter(guildId, userId) {
  const session = getVuaSession(guildId);
  if (!session) throw new Error('NO_ACTIVE_GAME');
  if (isExpiredChallenge(session.question)) throw new Error('QUESTION_EXPIRED');

  const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });
  const words = String(session.question.answer).normalize('NFC').trim().split(/\s+/u);
  const positions = words.flatMap((word, wordIndex) => [...segmenter.segment(word)]
    .filter(part => /\p{L}/u.test(part.segment))
    .map((part, letterIndex) => ({ wordIndex, letterIndex, letter: part.segment })));
  const revealedByUser = session.question.revealedLettersByUser || {};
  const previous = Array.isArray(revealedByUser[String(userId)]) ? revealedByUser[String(userId)] : [];
  const available = positions.map((position, index) => ({ ...position, index }))
    .filter(position => !previous.includes(position.index));
  if (!available.length) throw new Error('NO_UNREVEALED_LETTERS');

  const chosen = randomItem(available);
  const updated = {
    ...session,
    question: {
      ...session.question,
      revealedLettersByUser: { ...revealedByUser, [String(userId)]: [...previous, chosen.index] },
    },
  };
  saveSession(guildId, 'vuatiengviet', updated);
  vuaSessions.set(String(guildId), updated);
  return { letter: chosen.letter, wordPosition: chosen.wordIndex + 1, letterPosition: chosen.letterIndex + 1 };
}

function answerVuaSession(guildId, answer, now = Date.now()) {
  const session = getVuaSession(guildId);
  if (!session) return { ok: false, error: 'NO_SESSION' };
  if (isExpiredChallenge(session.question, now)) return { ok: false, error: 'EXPIRED', expiration: expireVuaChallenge(guildId, now) };
  if (normalizeVietnamese(answer) !== normalizeVietnamese(session.question.answer)) return { ok: true, correct: false, question: session.question };
  const question = session.question;
  session.question = nextVuaQuestion(session.recent, configuredQuestionOptions(guildId, { now }));
  session.recent = [...session.recent.filter(item => item !== normalizeVietnamese(session.question.answer)), normalizeVietnamese(session.question.answer)].slice(-RECENT_WORD_LIMIT);
  session.rounds += 1;
  saveSession(guildId, 'vuatiengviet', session);
  return { ok: true, correct: true, question, nextQuestion: session.question, rounds: session.rounds };
}

function skipVuaSession(guildId, options = {}) {
  const session = getVuaSession(guildId);
  if (!session) return null;
  const skipped = session.question;
  session.question = nextVuaQuestion(session.recent, configuredQuestionOptions(guildId, options));
  session.recent = [...session.recent.filter(item => item !== normalizeVietnamese(session.question.answer)), normalizeVietnamese(session.question.answer)].slice(-RECENT_WORD_LIMIT);
  saveSession(guildId, 'vuatiengviet', session);
  return { skipped, nextQuestion: session.question };
}

function vietnameseDayKey(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const skipVuaSessionForPlayerTx = db.transaction((guildId, userId, now = Date.now()) => {
  const session = getVuaSession(guildId);
  if (!session) return { error: 'NO_SESSION' };
  const limit = getGameConfig(guildId, 'VTV_DAILY_SKIP_LIMIT');
  const dayKey = vietnameseDayKey(now);
  const usage = db.prepare('SELECT skips_used FROM vua_daily_skips WHERE guild_id=? AND user_id=? AND day_key=?').get(String(guildId), String(userId), dayKey);
  const used = usage?.skips_used || 0;
  if (used >= limit) return { error: 'LIMIT_REACHED', used, limit };
  db.prepare(`INSERT INTO vua_daily_skips(guild_id,user_id,day_key,skips_used) VALUES(?,?,?,1)
    ON CONFLICT(guild_id,user_id,day_key) DO UPDATE SET skips_used=skips_used+1`).run(String(guildId), String(userId), dayKey);
  return { ...skipVuaSession(guildId), used: used + 1, limit };
});

function skipVuaSessionForPlayer(guildId, userId, now = Date.now()) {
  return skipVuaSessionForPlayerTx(String(guildId), String(userId), now);
}

function expireVuaChallenge(guildId, now = Date.now()) {
  const session = getVuaSession(guildId);
  if (!isExpiredChallenge(session?.question, now)) return null;
  const expired = session.question;
  session.question = nextVuaQuestion(session.recent, { forceHard: false, now });
  session.recent = [...session.recent, normalizeVietnamese(session.question.answer)].slice(-RECENT_WORD_LIMIT);
  saveSession(guildId, 'vuatiengviet', session);
  return { expired, nextQuestion: session.question };
}

const EXTRA_TIME_MS = 15_000;
function extendVuaChallenge(guildId, now = Date.now()) {
  const session = getVuaSession(guildId);
  if (!session) return { error: 'NO_SESSION' };
  const question = session.question;
  if (!question.hard) return { error: 'HARD_QUESTION_REQUIRED' };
  if (isExpiredChallenge(question, now)) return { error: 'EXPIRED' };
  if (question.extended) return { error: 'ALREADY_EXTENDED' };
  question.expiresAt += EXTRA_TIME_MS; question.extended = true;
  saveSession(guildId, 'vuatiengviet', session);
  return { ok: true, question, seconds: EXTRA_TIME_MS / 1000 };
}

function vuaQuestionText(question) {
  const hard = question.hard ? `🔥 **CÂU KHÓ x10** • Hết hạn <t:${Math.floor(question.expiresAt / 1000)}:R>\n` : '';
  return `${hard}## ${question.mixed}\n💡 Gợi ý: ${question.hint}`;
}

function endVuaSession(guildId) {
  const existed = Boolean(getVuaSession(guildId));
  vuaSessions.delete(String(guildId));
  deleteSession(guildId, 'vuatiengviet');
  return existed;
}

module.exports = {
  VUA_QUESTIONS,
  HARD_VUA_QUESTIONS,
  HARD_DURATION_MS,
  HARD_QUESTION_CHANCE,
  shouldBeHard,
  challengeMeta,
  isExpiredChallenge,
  shuffleLetters,
  randomItem,
  consumeCommandCooldown,
  startVuaSession,
  getVuaSession,
  revealVuaLetter,
  answerVuaSession,
  skipVuaSession,
  skipVuaSessionForPlayer,
  expireVuaChallenge,
  extendVuaChallenge,
  endVuaSession,
  vuaQuestionText,
};
