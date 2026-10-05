"use strict";
const { createHash } = require("node:crypto");
const { MessageFlags } = require("discord.js");
const { db } = require("../db");
const repo = require("./hardcoreTowerRepository");
const engine = require("./hardcoreTowerEngine");
const catalog = require("../hardcore/tower/challengeCatalog");
const economy = require("./economyService");
const diamonds = require("./playerLevelService");
const { requireGameChannel } = require("../utils/gameChannel");
const queues = new Map();
async function withLock(key, fn) {
  const previous = queues.get(key) || Promise.resolve();
  let unlock;
  const gate = new Promise((resolve) => (unlock = resolve));
  const next = previous.catch(() => {}).then(() => gate);
  queues.set(key, next);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    unlock();
    if (queues.get(key) === next) queues.delete(key);
  }
}
const key = (guild, user, c) => guild + ":" + user + ":" + c;
const lockKey = (guild, user) => key(guild, user, "tower");
function challengeFor(row) {
  const c = catalog.get(row.challenge_id, row.content_version);
  if (!c) throw Error("UNKNOWN_CHALLENGE");
  return c;
}
const startTx = db.transaction(
  ({ guildId, userId, channelId, challenge, now = Date.now() }) => {
    const stored =
      challenge && catalog.get(challenge.challengeId, challenge.contentVersion);
    if (!stored || stored.publicationStatus !== "published")
      throw Error("CHALLENGE_NOT_PUBLISHED");
    challenge = stored;
    if (!catalog.playable(challenge, now)) throw Error("CHALLENGE_EXPIRED");
    let row = repo.byUser(guildId, userId, challenge.challengeId);
    if (row) {
      if (row.content_version !== challenge.contentVersion)
        throw Error("CHALLENGE_VERSION_MISMATCH");
      return row;
    }
    row = {
      id: createHash("sha256")
        .update(key(guildId, userId, challenge.challengeId))
        .digest("hex")
        .slice(0, 32),
      guild_id: String(guildId),
      user_id: String(userId),
      challenge_id: challenge.challengeId,
      content_version: challenge.contentVersion,
      channel_id: String(channelId),
    };
    repo.insert(row, engine.createState(challenge), now);
    repo.beginAttempt(row, now);
    return repo.session(row.id);
  },
);
const actionTx = db.transaction(
  ({
    id,
    guildId,
    userId,
    channelId,
    messageId,
    expectedTurn,
    expectedRouteStep,
    action,
    clock = Date.now,
  }) => {
    const now = clock();
    const row = repo.session(id);
    if (!row) throw Error("NO_TOWER_SESSION");
    if (row.guild_id !== String(guildId) || row.user_id !== String(userId))
      throw Error("NOT_TOWER_OWNER");
    if (row.channel_id !== String(channelId)) throw Error("WRONG_CHANNEL");
    if (messageId != null && row.message_id !== String(messageId))
      throw Error("STALE_ACTION");
    const c = challengeFor(row);
    let state = JSON.parse(row.state_json);
    if (!Number.isSafeInteger(expectedTurn) || state.turn !== expectedTurn)
      throw Error("STALE_ACTION");
    if (
      c.generatorVersion === 3 &&
      (!Number.isSafeInteger(expectedRouteStep) ||
        state.routeStep !== expectedRouteStep)
    )
      throw Error("STALE_ACTION");
    if (action === "replay" && !catalog.playable(c, now)) {
      if (state.status === "playing") throw Error("INVALID_ACTION");
      const target = catalog.active(now);
      if (!target) throw Error("NO_ACTIVE_TOWER");
      const next = startTx({
        guildId: row.guild_id,
        userId: row.user_id,
        channelId: row.channel_id,
        challenge: target,
        now,
      });
      if (next.channel_id !== row.channel_id) throw Error("WRONG_CHANNEL");
      let nextState = JSON.parse(next.state_json);
      if (nextState.status !== "playing") {
        const turn = nextState.turn + 1;
        nextState = engine.createState(target);
        nextState.turn = turn;
        repo.beginAttempt(next, now);
        repo.save(next, nextState, now);
      }
      state.turn++;
      state.replayedToSessionId = next.id;
      repo.save(row, state, now);
      if (messageId != null) repo.message(next.id, messageId);
      if (!catalog.playable(target, clock())) throw Error("CHALLENGE_EXPIRED");
      return {
        session: repo.session(next.id),
        state: nextState,
        challenge: target,
        result: repo.result(row.guild_id, row.user_id, target.challengeId),
      };
    }
    if (!catalog.playable(c, now)) throw Error("CHALLENGE_EXPIRED");
    if (action === "replay") {
      if (state.status === "playing") throw Error("INVALID_ACTION");
      const turn = state.turn + 1;
      state = engine.createState(c);
      state.turn = turn;
      repo.beginAttempt(row, now);
    } else {
      if (state.status !== "playing") throw Error("STALE_ACTION");
      engine.act(state, c, action);
      if (c.generatorVersion === 3 && state.status !== "playing")
        repo.attempt(row, now);
      repo.progress(row, state, now);
      if (state.status === "completed") {
        if (!catalog.playable(c, clock())) throw Error("CHALLENGE_EXPIRED");
        const operationId =
          "tower15:reward:" +
          row.guild_id +
          ":" +
          row.user_id +
          ":" +
          c.challengeId;
        const hash = engine.solutionHash(c);
        db.prepare(
          "UPDATE hardcore_tower_results SET solution_hash=? WHERE guild_id=? AND user_id=? AND challenge_id=?",
        ).run(hash, row.guild_id, row.user_id, c.challengeId);
        if (repo.reward(row, hash, now)) {
          economy.creditCoins({
            guildId: row.guild_id,
            userId: row.user_id,
            amount: c.reward.coins,
            reason: "tower15:reward",
            operationId,
          });
          diamonds.addDiamonds(row.guild_id, row.user_id, c.reward.diamonds, {
            reason: "tower15:reward",
            operationId,
            now,
          });
          state.rewardGranted = true;
        } else state.rewardGranted = false;
      }
    }
    repo.save(row, state, now);
    if (!catalog.playable(c, clock())) throw Error("CHALLENGE_EXPIRED");
    return {
      session: repo.session(row.id),
      state,
      challenge: c,
      result: repo.result(row.guild_id, row.user_id, c.challengeId),
    };
  },
);
function getRun(guild, user, challengeId) {
  const row = repo.byUser(guild, user, challengeId);
  return row
    ? {
        session: row,
        state: JSON.parse(row.state_json),
        challenge: challengeFor(row),
        result: repo.result(guild, user, challengeId),
      }
    : null;
}
const notice = {
  STALE_ACTION:
    "Bảng hoặc lượt này đã cũ. Dùng /choi sinhton thap để mở đúng tiến trình.",
  NOT_TOWER_OWNER: "Đây là Tháp của người chơi khác.",
  WRONG_CHANNEL: "Tiếp tục trong kênh bạn đã bắt đầu Tháp.",
  CHALLENGE_EXPIRED:
    "Challenge đã hết hạn; không còn nhận hành động hoặc thưởng.",
  INVALID_ACTION: "Hành động không dùng được trong lượt này.",
  CHALLENGE_NOT_PUBLISHED: "Challenge chưa qua kiểm chứng hoặc chưa được mở.",
  NO_ACTIVE_TOWER:
    "Chưa có Tháp tuần hiện tại được mở. Dùng /choi sinhton thap để kiểm tra lại.",
  NO_TOWER_SESSION: "Không tìm thấy session Tháp.",
};
async function openTower(interaction) {
  if (!interaction.guildId)
    return interaction.reply({
      content: "Tháp chỉ dùng trong server.",
      flags: MessageFlags.Ephemeral,
    });
  if (!(await requireGameChannel(interaction, "hardcore"))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const now = Date.now(),
    c = catalog.ensureWeekly(now) || catalog.recent(now);
  if (!c)
    return interaction.editReply({
      content: "Chưa có challenge Tháp Định Mệnh đang mở.",
    });
  return withLock(
    lockKey(interaction.guildId, interaction.user.id),
    async () => {
      try {
        let row = repo.byUser(
          interaction.guildId,
          interaction.user.id,
          c.challengeId,
        );
        if (!row) {
          if (!catalog.playable(c))
            return interaction.editReply({
              content:
                "Challenge đã hết hạn. Không có kết quả Tháp của bạn trong tuần này.",
            });
          row = startTx({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            challenge: c,
          });
        }
        if (row.channel_id !== interaction.channelId)
          return interaction.editReply({ content: notice.WRONG_CHANNEL });
        const run = getRun(row.guild_id, row.user_id, row.challenge_id);
        const view = require("./hardcoreTowerView");
        const message = await interaction.channel.send(
          view.payload(row, run.state, run.challenge, run.result),
        );
        repo.message(row.id, message.id);
        if (row.message_id && row.message_id !== message.id) {
          const old = await interaction.channel.messages
            .fetch(row.message_id)
            .catch(() => null);
          if (old) await old.edit({ components: [] }).catch(() => {});
        }
        return interaction.editReply({
          content:
            "Đã mở Tháp Định Mệnh tại " +
            message.url +
            ". Tiến trình được giữ nguyên.",
        });
      } catch (error) {
        return interaction.editReply({
          content: notice[error.message] || "Không thể mở Tháp lúc này.",
        });
      }
    },
  );
}
async function handleTowerButton(interaction, logger = console) {
  const [, id, turn, action, routeTag, sourceTag] =
    interaction.customId.split(":");
  const expectedRouteStep = /^r\d+$/.test(routeTag || "")
    ? Number(routeTag.slice(1))
    : undefined;
  const originMessageId = expectedRouteStep == null ? routeTag : sourceTag;
  const detailTab = /^view_(stats|effects|encounter|rules)$/.exec(action)?.[1];
  const sourceMessageId = detailTab
    ? originMessageId || interaction.message.id
    : interaction.message.id;
  const row = repo.session(id);
  if (
    !row ||
    row.user_id !== interaction.user.id ||
    row.guild_id !== interaction.guildId
  )
    return interaction.reply({
      content: row ? notice.NOT_TOWER_OWNER : notice.NO_TOWER_SESSION,
      flags: MessageFlags.Ephemeral,
    });
  if (detailTab && !originMessageId)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  else await interaction.deferUpdate();
  return withLock(lockKey(row.guild_id, row.user_id), async () => {
    try {
      const current = repo.session(id);
      const c = challengeFor(current);
      if (!catalog.readable(c) && action !== "replay")
        throw Error("CHALLENGE_EXPIRED");
      if (current.channel_id !== interaction.channelId)
        throw Error("WRONG_CHANNEL");
      if (
        current.message_id !== sourceMessageId ||
        (!detailTab && JSON.parse(current.state_json).turn !== Number(turn))
      )
        throw Error("STALE_ACTION");
      const view = require("./hardcoreTowerView");
      if (detailTab)
        return await interaction.editReply(
          view.privatePayload(
            current,
            JSON.parse(current.state_json),
            c,
            sourceMessageId,
            detailTab,
          ),
        );
      if (action === "top")
        return interaction.followUp({
          ...view.topPayload(repo.top(row.guild_id, c.challengeId), c),
          flags: MessageFlags.Ephemeral,
        });
      const run = actionTx({
        id,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        messageId: interaction.message.id,
        expectedTurn: Number(turn),
        expectedRouteStep,
        action,
      });
      return await interaction.editReply(
        view.payload(run.session, run.state, run.challenge, run.result),
      );
    } catch (error) {
      if (!notice[error.message])
        logger.error?.({ err: error }, "Tower action failed");
      if (detailTab)
        return interaction.editReply({
          content:
            notice[error.message] || "Không thể mở chi tiết Tháp lúc này.",
          embeds: [],
          components: [],
        });
      return interaction.followUp({
        content:
          notice[error.message] ||
          "Không thể cập nhật bảng Tháp. Dùng /choi sinhton thap để mở lại tiến trình đã lưu.",
        flags: MessageFlags.Ephemeral,
      });
    }
  });
}
module.exports = {
  startTx,
  actionTx,
  getRun,
  withLock,
  openTower,
  handleTowerButton,
};
