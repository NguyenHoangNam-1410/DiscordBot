const bosses = require("../bosses/mechanics");
// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    performance,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    icon,
    formatCoins,
    hardcoreRepository,
    hardcoreView,
    potentialPayout,
    runDiamondReward,
    ITEMS,
    hardcoreV2,
    hardcoreV2View,
    isV2,
    CLASSES,
    getSession,
    hardcoreQueues,
  } = dependencies;
  const parseState = (...args) => dependencies.parseState(...args);
  const playHardcore = (...args) => dependencies.playHardcore(...args);
  const showHardcoreTurn = (...args) => dependencies.showHardcoreTurn(...args);

  function withHardcoreSession(sessionId, action) {
    const queue = hardcoreQueues.get(sessionId) || {
      tail: Promise.resolve(),
      renderedTurn: null,
      renderedMessageId: null,
    };
    const next = queue.tail.catch(() => {}).then(() => action(queue));
    queue.tail = next;
    hardcoreQueues.set(sessionId, queue);
    return next.finally(() => {
      if (queue.tail === next) hardcoreQueues.delete(sessionId);
    });
  }

  async function handleHardcoreButton(rawInteraction, logger) {
    const started = performance.now();
    const timing = {
      ackMs: 0,
      queueMs: 0,
      gameMs: 0,
      renderMs: 0,
      discordMs: 0,
    };
    const ingressAgeMs = Number.isFinite(rawInteraction.createdTimestamp)
      ? Math.max(0, Date.now() - rawInteraction.createdTimestamp)
      : null;
    const discordCall = async (call) => {
      const before = performance.now();
      try {
        return await call();
      } finally {
        timing.discordMs += performance.now() - before;
      }
    };
    // Keep Discord methods bound to the original interaction, including its reply state.
    const interaction = Object.create(rawInteraction);
    for (const method of [
      "deferReply",
      "deferUpdate",
      "editReply",
      "followUp",
    ]) {
      if (typeof rawInteraction[method] === "function")
        interaction[method] = (...args) =>
          discordCall(() => rawInteraction[method](...args));
    }
    let duplicateUpdateSkipped = false;
    const [, sessionId, rawTurn, rawAction, originMessageId] =
      interaction.customId.split(":");
    const action =
      rawAction === "purifier_select"
        ? "purifier_select_" +
          (interaction.values?.length === 1 ? interaction.values[0] : "")
        : rawAction;
    const detailAction =
      /^(?:view|page)_(stats|items|effects|encounter)_(\d{1,4})$/.exec(action);
    const openingDetails = Boolean(detailAction && !originMessageId);
    const retreatPrompt = action === "retreat";
    const retreatResponse = ["retreat_confirm", "retreat_cancel"].includes(
      action,
    );
    const privateRetreat = retreatPrompt || retreatResponse;
    // Opening a private panel has its own reply; navigation acknowledges that panel.
    try {
      const ackStart = performance.now();
      try {
        if (openingDetails || retreatPrompt)
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        else await interaction.deferUpdate();
      } finally {
        timing.ackMs = performance.now() - ackStart;
      }
      const respond = (content) =>
        openingDetails || privateRetreat
          ? interaction.editReply({ content, embeds: [], components: [] })
          : interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      const queuedAt = performance.now();
      // Private panels keep their own ordering without waiting on public Discord edits.
      const queueKey = detailAction ? `details:${sessionId}` : sessionId;
      return await withHardcoreSession(queueKey, async (queue) => {
        timing.queueMs = performance.now() - queuedAt;
        try {
          const session = getSession(sessionId);
          if (
            !session ||
            session.guild_id !== interaction.guildId ||
            session.channel_id !== interaction.channelId
          ) {
            return await respond(
              "Lượt Sinh tồn đã kết thúc hoặc nút không còn hợp lệ.",
            );
          }
          if (session.user_id !== interaction.user.id) {
            return await respond("Đây là lượt Sinh tồn của người chơi khác.");
          }
          const sourceMessageId =
            detailAction || retreatResponse
              ? originMessageId || interaction.message?.id
              : interaction.message?.id;
          if (session.message_id && session.message_id !== sourceMessageId) {
            return await respond(
              "Bảng Sinh tồn này đã cũ. Dùng `/sinhton tieptuc` để mở bảng hiện tại.",
            );
          }
          if (privateRetreat) {
            const state = parseState(session);
            if (state.turn !== Number(rawTurn))
              return respond(
                "Lượt chơi đã thay đổi. Hãy bấm Rút thưởng trên bảng hiện tại để xem lại phần thưởng.",
              );
            if (action === "retreat_cancel")
              return respond(
                "Đã hủy rút thưởng. Bạn có thể tiếp tục Sinh tồn.",
              );
            if (
              state.encounter.type === "rngesus" ||
              (isV2(state) &&
                (state.phase === "boss_chest" || bosses.retreatLocked(state)))
            )
              return respond(
                "Bạn phải xử lý tình huống hiện tại trước khi rút thưởng.",
              );
            if (retreatPrompt) {
              const canCashout = state.phase === "summit" || state.cleared > 0;
              const coins = canCashout
                ? isV2(state)
                  ? hardcoreV2.payout(state)
                  : potentialPayout(state)
                : 0;
              const diamonds = canCashout ? runDiamondReward(state) : 0;
              const prefix = `hardcore:${sessionId}:${state.turn}:`;
              hardcoreRepository.touchSession(sessionId);
              return interaction.editReply({
                content:
                  `**${canCashout ? "Xác nhận rút thưởng" : "Xác nhận bỏ run"}**\n` +
                  `Kết thúc Sinh tồn tại tầng **${state.floor}**. Bạn sẽ nhận:\n` +
                  `- ${icon("coin", "🪙")} **${formatCoins(coins)} xu**\n` +
                  `- ${icon("gem", "💎")} **${formatCoins(diamonds)} kim cương**\n\n` +
                  (canCashout
                    ? "Xu trên là tổng tiền được cộng vào tài khoản, không phải tiền lãi; tiền cược không được cộng thêm lần nữa. Trang bị trong run không được giữ lại."
                    : `Chưa vượt tầng nào: mất **${formatCoins(state.stake)} xu** tiền cược.`),
                embeds: [],
                components: [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setCustomId(
                        `${prefix}retreat_confirm:${sourceMessageId}`,
                      )
                      .setLabel(
                        canCashout ? "Xác nhận rút thưởng" : "Xác nhận bỏ run",
                      )
                      .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                      .setCustomId(`${prefix}retreat_cancel:${sourceMessageId}`)
                      .setLabel("Tiếp tục chơi")
                      .setStyle(ButtonStyle.Secondary),
                  ),
                ],
                allowedMentions: { parse: [] },
              });
            }
          }
          if (detailAction) {
            const state = parseState(session);
            const renderStart = performance.now();
            const payload = isV2(state)
              ? hardcoreV2View.privatePayload(
                  state,
                  sessionId,
                  sourceMessageId,
                  detailAction[1],
                  Number(detailAction[2]),
                )
              : hardcoreView.hardcorePrivatePayload(
                  state,
                  CLASSES,
                  ITEMS,
                  sessionId,
                  sourceMessageId,
                  detailAction[1],
                  Number(detailAction[2]),
                );
            timing.renderMs += performance.now() - renderStart;
            hardcoreRepository.touchSession(sessionId);
            return await interaction.editReply(payload);
          }
          const publicMessage = retreatResponse
            ? await discordCall(() =>
                interaction.channel.messages.fetch(sourceMessageId),
              )
            : null;
          const gameStart = performance.now();
          let played;
          try {
            played = playHardcore({
              sessionId,
              userId: interaction.user.id,
              expectedTurn: Number(rawTurn),
              action: retreatResponse ? "retreat" : action,
            });
          } finally {
            timing.gameMs += performance.now() - gameStart;
          }
          if (retreatResponse)
            await respond(
              `Đã kết thúc Sinh tồn. Nhận **${formatCoins(played.result.payout)} xu** và **${formatCoins(played.result.diamonds)} kim cương**.`,
            );
          const reply = await showHardcoreTurn(
            publicMessage
              ? {
                  user: interaction.user,
                  editReply: (payload) =>
                    discordCall(() => publicMessage.edit(payload)),
                  followUp: (payload) => interaction.followUp(payload),
                }
              : interaction,
            sessionId,
            played.state,
            played.result,
            played.settled,
            logger,
            timing,
          );
          queue.renderedTurn = played.state.turn;
          queue.renderedMessageId = sourceMessageId;
          return reply;
        } catch (error) {
          if (error.message !== "STALE_ACTION")
            logger?.error?.(
              { err: error, sessionId, action, originMessageId },
              "hardcore interaction failed",
            );
          if (detailAction)
            return respond(
              "Không thể mở bảng chi tiết Sinh tồn. Hãy thử lại hoặc dùng `/sinhton tieptuc` để mở UI mới. Run và vật phẩm của bạn vẫn được giữ nguyên.",
            );
          if (privateRetreat)
            return respond(
              "Không thể thực hiện xác nhận này. Hãy mở bảng Sinh tồn hiện tại bằng `/sinhton tieptuc` để xem trạng thái và tiếp tục.",
            );
          if (error.message === "STALE_ACTION") {
            const currentSession = getSession(sessionId);
            if (
              currentSession &&
              (!currentSession.message_id ||
                currentSession.message_id === interaction.message?.id)
            ) {
              const currentState = parseState(currentSession);
              // A preceding click already published this turn: acknowledge, do not resend.
              if (
                queue.renderedTurn === currentState.turn &&
                queue.renderedMessageId === interaction.message?.id
              ) {
                duplicateUpdateSkipped = true;
                return;
              }
              const reply = await showHardcoreTurn(
                interaction,
                sessionId,
                currentState,
                null,
                false,
                logger,
                timing,
              );
              queue.renderedTurn = currentState.turn;
              queue.renderedMessageId = interaction.message?.id;
              return reply;
            }
            return interaction.followUp({
              content:
                "Nút này thuộc bảng Sinh tồn cũ. Hãy mở bảng đang chơi để tiếp tục.",
              flags: MessageFlags.Ephemeral,
            });
          }
          const content =
            error.message === "INSUFFICIENT_DIAMONDS"
              ? "Không đủ kim cương để mua vật phẩm này. Xem số dư qua /hoso."
              : error.message === "NO_ENERGY"
                ? "Không đủ năng lượng dùng kỹ năng."
                : error.message === "NO_POTION"
                  ? "Bạn đã hết bình máu."
                  : error.message === "NO_RESCUE_POTIONS"
                    ? "Cứu Lost Adventurer cần ít nhất 2 bình máu."
                    : error.message === "FULL_HP"
                      ? "HP đang đầy."
                      : error.message === "ALREADY_INSPECTED"
                        ? "Bạn đã kiểm tra hòm này."
                        : error.message === "CANNOT_RETREAT"
                          ? "Không thể rút thưởng khi gặp RNGesus."
                          : error.message === "INSUFFICIENT_RUN_PAYOUT"
                            ? "Payout tích lũy của run chưa đủ trả phí dịch vụ."
                            : error.message === "NO_FORGE_ITEM"
                              ? "Bạn chưa có trang bị phù hợp để rèn."
                              : error.message === "NO_CURSE"
                                ? "Không có lời nguyền của đồ UR cần giải."
                                : error.message === "INSUFFICIENT_HP"
                                  ? "HP hiện tại chưa đủ cho lựa chọn này."
                                  : error.message === "NO_TICKET"
                                    ? "Bạn không còn Vé thoát."
                                    : "Không thể thực hiện lựa chọn này.";
          return interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral,
          });
        }
      });
    } finally {
      const totalMs = performance.now() - started;
      const data = {
        action,
        ...timing,
        totalMs,
        ingressAgeMs,
        duplicateUpdateSkipped,
      };
      for (const key of Object.keys(timing)) data[key] = Math.round(data[key]);
      data.totalMs = Math.round(totalMs);
      // Discord duration includes REST bucket waits/network; ingress age also includes delivery lag.
      if (totalMs >= 1000 || ingressAgeMs >= 1000 || timing.gameMs >= 100)
        logger?.warn?.(data, "slow hardcore interaction");
      else logger?.debug?.(data, "hardcore interaction timing");
    }
  }
  return { withHardcoreSession, handleHardcoreButton };
};
