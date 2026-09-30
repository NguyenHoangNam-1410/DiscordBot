const { channelHasGame } = require('./gameChannelService');
const { getVuaSession, answerVuaSession, vuaQuestionText } = require('./funGameService');
const { rewardGame } = require('./economyService');
const { resultBlock } = require('../utils/rewardText');
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
  const line = resultBlock({ userId: message.author.id, outcome: 'win', stake: 0, payout: reward, gemsGained: diamonds ? 10 : 0, result: { ...account, experienceGained: 0 }, reason: `đúng **${result.question.answer}**` });
  await reply(message, `🎉 ${line}\n\nCâu tiếp theo:\n${vuaQuestionText(result.nextQuestion)}`);
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
