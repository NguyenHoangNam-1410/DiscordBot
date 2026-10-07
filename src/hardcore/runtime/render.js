// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    performance,
    formatCoins,
    godReveal,
    hardcoreView,
    ITEMS,
    hardcoreV2View,
    isV2,
    CLASSES,
    setMessageId,
  } = dependencies;

  function hardcoreEmbed(state, userId, result = null, sessionId = null) {
    if (isV2(state))
      return hardcoreV2View.embed(state, userId, result, sessionId);
    return hardcoreView.hardcoreEmbed(
      state,
      userId,
      result,
      CLASSES,
      sessionId,
      ITEMS,
    );
  }

  function hardcoreRows(sessionId, state, disabled = false) {
    if (isV2(state)) return hardcoreV2View.rows(sessionId, state, disabled);
    return hardcoreView.hardcoreRows(sessionId, state, disabled, CLASSES);
  }

  async function showHardcoreTurn(
    interaction,
    sessionId,
    state,
    result = null,
    settled = false,
    logger = null,
    timing = null,
  ) {
    try {
      const renderStart = performance.now();
      let payload;
      try {
        payload = {
          embeds: [
            hardcoreEmbed(state, interaction.user.id, result, sessionId),
          ],
          components: hardcoreRows(sessionId, state, settled),
          allowedMentions: { parse: [] },
        };
      } finally {
        if (timing) timing.renderMs += performance.now() - renderStart;
      }
      if (!settled)
        await godReveal.play(
          sessionId,
          state,
          interaction.user.id,
          (frame) => interaction.editReply(frame),
          { logger },
        );
      return await interaction.editReply({ content: "", ...payload });
    } catch (error) {
      logger?.warn(
        { err: error, sessionId },
        "could not update hardcore panel",
      );
      const fallback = {
        content:
          `⚠️ Bảng chi tiết chưa hiển thị được. **Sinh tồn · tầng ${state.floor} · lượt ${state.turn}**\n` +
          `❤️ ${state.hp}/${state.maxHp} HP\n${String(state.lastLog || "").slice(0, 700)}` +
          (result
            ? `\nKết quả: **${result.outcome === "win" ? "Thắng" : result.outcome === "draw" ? "Hòa" : "Thua"}** · Nhận ${formatCoins(result.payout)} xu.`
            : ""),
        embeds: [],
        components: hardcoreRows(sessionId, state, settled),
        allowedMentions: { parse: [] },
      };
      try {
        return await interaction.editReply(fallback);
      } catch (fallbackError) {
        logger?.warn(
          { err: fallbackError, sessionId },
          "could not restore hardcore panel",
        );
        const replacement = await interaction.followUp({
          ...fallback,
          withResponse: true,
        });
        const messageId = replacement?.resource?.message?.id || replacement?.id;
        if (messageId && !settled) setMessageId(sessionId, messageId);
        return replacement;
      }
    }
  }
  return { hardcoreEmbed, hardcoreRows, showHardcoreTurn };
};
