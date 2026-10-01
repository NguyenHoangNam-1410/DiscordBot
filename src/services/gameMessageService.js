const { channelHasGame } = require("./gameChannelService");
const { getVuaSession, answerVuaSession } = require("./funGameService");
const { rewardGame } = require("./economyService");
const { quizAnswerAnnouncement } = require("../utils/rewardText");
const { getGameReward } = require("./gameRewardService");
const { addDiamonds } = require("./playerLevelService");

async function handleVuaMessage(message, answer) {
  if (!getVuaSession(message.guildId)) return false;
  const result = answerVuaSession(message.guildId, answer);
  if (result.error === "EXPIRED") {
    await require("../commands/vuatiengviet").postNextQuestionMessage(
      message.guildId,
      message.channel,
    );
    return true;
  }
  if (!result.correct) return true;
  const reward =
    getGameReward(message.guildId, "vuatiengviet") *
    (result.question.hard ? 10 : 1);
  const account = rewardGame({
    guildId: message.guildId,
    userId: message.author.id,
    amount: reward,
    game: "vuatiengviet",
    outcome: "win",
  });
  const diamonds = result.question.hard
    ? addDiamonds(message.guildId, message.author.id, 10, {
        reason: "vuatiengviet:hard-answer",
      })
    : null;
  const announcement = quizAnswerAnnouncement({
    userId: message.author.id,
    reward,
    gems: diamonds ? 10 : 0,
    account,
    answer: result.question.answer,
  });
  await message.channel.send({
    content: announcement,
    allowedMentions: { users: [message.author.id] },
  });
  await require("../commands/vuatiengviet").postNextQuestionMessage(
    message.guildId,
    message.channel,
  );
  return true;
}

async function handleGameMessage(message) {
  if (!message.guildId || message.author?.bot) return false;
  const answer = String(message.content || "").trim();
  if (
    !answer ||
    answer.length > 50 ||
    answer.startsWith("/") ||
    answer.startsWith(process.env.COMMAND_PREFIX || "!")
  )
    return false;
  if (channelHasGame(message.guildId, message.channelId, "vuatiengviet"))
    return handleVuaMessage(message, answer);
  return false;
}

module.exports = { handleGameMessage };
