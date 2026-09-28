const { channelHasGame } = require('./gameChannelService');
const { getVuaSession, answerVuaSession, vuaQuestionText } = require('./funGameService');
const { rewardGame } = require('./economyService');
const { bonusDropText } = require('../utils/progressionView');
const { formatCoins } = require('../utils/economy');
const { getGameReward } = require('./gameRewardService');
const { addDiamonds } = require('./playerLevelService');

async function reply(message, content) {
  return message.reply({ content, allowedMentions: { users: [], repliedUser: false } });
}

async function handleVuaMessage(message, answer) {
  if (!getVuaSession(message.guildId)) return false;
  const result = answerVuaSession(message.guildId, answer);
  if (result.error === 'EXPIRED') {
    await reply(message, `⌛ Câu khó đã hết thời gian và không còn hiệu lực.\n\nCâu thường mới:\n${vuaQuestionText(result.expiration.nextQuestion)}`);
    return true;
  }
  if (!result.correct) return true;
  const reward = getGameReward(message.guildId, 'vuatiengviet') * (result.question.hard ? 10 : 1);
  const account = rewardGame({ guildId: message.guildId, userId: message.author.id, amount: reward, game: 'vuatiengviet', outcome: 'win' });
  const diamonds = result.question.hard
    ? addDiamonds(message.guildId, message.author.id, 10, { reason: 'vuatiengviet:hard-answer' })
    : null;
  const bonus = bonusDropText(account.bonusDrops);
  const diamondText = diamonds ? ` và **10 kim cương** (số dư: **${diamonds.diamonds} 💎**)` : '';
  await reply(message, `🎉 <@${message.author.id}> trả lời đúng **${result.question.answer}** và nhận **${formatCoins(reward)} xu**${diamondText}!${bonus ? `\n🎊 Drop sau ván: ${bonus.replace(/\n/g, ' · ')}` : ''}\n\nCâu tiếp theo:\n${vuaQuestionText(result.nextQuestion)}\nSố dư: **${formatCoins(account.balance)} xu**.`);
  return true;
}

async function handleGameMessage(message) {
  if (!message.guildId || message.author?.bot) return false;
  const answer = String(message.content || '').trim();
  if (!answer || answer.length > 50 || answer.startsWith('/') || answer.startsWith(process.env.COMMAND_PREFIX || '!')) return false;
  if (channelHasGame(message.guildId, message.channelId, 'vuatiengviet')) return handleVuaMessage(message, answer);
  return false;
}

module.exports = { handleGameMessage };
