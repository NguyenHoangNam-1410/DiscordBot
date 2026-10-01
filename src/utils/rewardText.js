// Định dạng thống nhất cho mọi tin nhắn kết quả/thưởng: mỗi metric luôn đi kèm icon.
//   xu :coin: · kim cương :gem: · EXP :test_tube:
const { RARITY_ICON } = require('./rarity');
const { appEmoji } = require('./appEmoji');

const ICON = Object.freeze({ coins: ':coin:', gems: ':gem:', exp: ':test_tube:' });
const OUTCOME_WORD = Object.freeze({ win: 'thắng', loss: 'thua', draw: 'hòa' });
const number = value => new Intl.NumberFormat('vi-VN').format(Math.abs(Math.trunc(Number(value) || 0)));
const sign = value => (value > 0 ? '+' : value < 0 ? '-' : '±');

// `1.000 :coin:` — dùng cho số tiền không mang dấu (cược, pot, số dư...).
const coins = value => `${number(value)} ${ICON.coins}`;
const gems = value => `${number(value)} ${ICON.gems}`;
const exp = value => `${number(value)} ${ICON.exp}`;
// `+1.000 :coin:` / `-500 :coin:` / `±0 :coin:` — thay đổi ròng.
const signedCoins = value => `${sign(Math.trunc(Number(value) || 0))}${number(value)} ${ICON.coins}`;

// Icon độ hiếm: dùng emoji ứng dụng r_icon / sr_icon / ssr_icon / ur_icon nếu có, không thì vòng tròn màu.
function rarityIcon(tier) { return appEmoji(`${String(tier).toLowerCase()}_icon`, RARITY_ICON[tier] || '🎁'); }

function dropText(drop) {
  if (drop.type === 'item') return `${rarityIcon(drop.rarity)} [${drop.rarity}] ${drop.name}${Number(drop.amount) > 1 ? ` ×${Number(drop.amount)}` : ''}`;
  if (drop.type === 'coins') return `+${coins(drop.amount)}`;
  if (drop.type === 'diamonds') return `+${gems(drop.amount)}`;
  return `+${number(drop.amount)} ${drop.type}`;
}
// `BUFF SỰ KIỆN: +3 :gem: · 🟠 [SSR] Bùa Khắc Chế` (rỗng nếu không có gì rơi).
function bonusLine(drops) {
  if (!Array.isArray(drops) || !drops.length) return '';
  return `🎉 **BUFF SỰ KIỆN:** ${drops.map(dropText).join(' · ')}`;
}
// `<@id> thắng: +102.000 :coin: +11 :test_tube:` — coin là thay đổi ròng (nhận về − tiền cược).
function resultLine({ userId = null, outcome, stake = 0, payout = 0, experienceGained = 0, gemsGained = 0, levelUps = [], reason = '', label = null }) {
  const net = Math.trunc(Number(payout) || 0) - Math.trunc(Number(stake) || 0);
  const who = label ?? (userId ? `<@${userId}>` : 'Bạn');
  const word = `${OUTCOME_WORD[outcome] || 'kết thúc'}${reason ? ` (${reason})` : ''}`;
  const parts = [signedCoins(net)];
  if (Number(gemsGained) > 0) parts.push(`+${gems(gemsGained)}`);
  if (Number(experienceGained) > 0) parts.push(`+${exp(experienceGained)}`);
  const level = levelUps?.length ? ` · 🎉 Lên cấp **${levelUps.at(-1).level}**` : '';
  return `**${who}** ${word}: **${parts.join(' ')}**${level}`;
}
// Thông báo công khai khi trả lời đúng Vua tiếng Việt (dùng chung cho trả lời thường và Từ Điển Sống).
function quizAnswerAnnouncement({ userId, reward, gems: gemsGained = 0, account = {}, answer, via = '' }) {
  const line = resultLine({ userId, outcome: 'win', stake: 0, payout: reward, gemsGained, levelUps: account.levelUps, reason: `đúng **${answer}**${via ? ` nhờ ${via}` : ''}` });
  return [`🎉 ${line}`, bonusLine(account.bonusDrops)].filter(Boolean).join('\n');
}

// Khối kết quả đầy đủ cho một người: dòng kết quả + dòng buff sự kiện.
function resultBlock({ userId, outcome, stake, payout, result = {}, reason = '', extra = [], gemsGained = 0 }) {
  return [resultLine({ userId, outcome, stake, payout, experienceGained: result.experienceGained, levelUps: result.levelUps, reason, gemsGained }),
    ...extra.filter(Boolean), bonusLine(result.bonusDrops)].filter(Boolean).join('\n');
}

// `+30.000 :coin: +100 :gem: +50 :test_tube: · 🟣 [SR] Bùa Khắc Chế ×1` — phần thưởng nhiệm vụ/thành tựu/cấp.
function rewardSummary({ coins: coinAmount = 0, diamonds = 0, experience = 0, item = null, quantity = 1, itemName = null, itemRarity = null }) {
  const parts = [];
  if (Number(coinAmount) > 0) parts.push(`+${coins(coinAmount)}`);
  if (Number(diamonds) > 0) parts.push(`+${gems(diamonds)}`);
  if (Number(experience) > 0) parts.push(`+${exp(experience)}`);
  if (item) parts.push(`${rarityIcon(itemRarity)} ${itemRarity ? `[${itemRarity}] ` : ''}${itemName || item} ×${Number(quantity) || 1}`);
  return parts.join(' ');
}

module.exports = { quizAnswerAnnouncement, rewardSummary, ICON, coins, gems, exp, signedCoins, rarityIcon, dropText, bonusLine, resultLine, resultBlock };
