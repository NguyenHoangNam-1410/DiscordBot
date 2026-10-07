// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const {
    db,
    settleReservedGame,
    creditCoins,
    hardcoreRepository,
    godRngesus,
    addDiamonds,
    hardcoreInventory,
    potentialPayout,
    runDiamondReward,
    hardcoreV2,
    hardcoreEchoes,
    isV2,
    STALE_MS,
  } = dependencies;
  const recordRun = (...args) => dependencies.recordRun(...args);
  const parseState = (...args) => dependencies.parseState(...args);
  const killerName = (...args) => dependencies.killerName(...args);

  function finishRun(session, state, reason) {
    godRngesus.recordDeath(session, reason);
    if (["death", "rngesus"].includes(reason))
      state.killedBy = killerName(state, reason);
    const diamonds =
      reason === "cashout" || reason === "summit" ? runDiamondReward(state) : 0;
    let payout =
      reason === "cashout" || reason === "summit"
        ? isV2(state)
          ? hardcoreV2.payout(state)
          : potentialPayout(state)
        : 0;
    const outcome =
      payout > state.stake ? "win" : payout === state.stake ? "draw" : "loss";
    const account = settleReservedGame({
      guildId: session.guild_id,
      userId: session.user_id,
      payout,
      stake: state.stake,
      game: "hardcore",
      outcome,
      operationId: `settle:hardcore:${session.id}`,
      countGame: reason !== "forfeit",
    });
    if (diamonds > 0)
      addDiamonds(session.guild_id, session.user_id, diamonds, {
        reason: "hardcore:cashout",
        operationId: `settle:hardcore-diamonds:${session.id}`,
      });
    recordRun(session.guild_id, session.user_id, state, reason);
    if (isV2(state) && ["death", "rngesus"].includes(reason))
      hardcoreEchoes.onDeath(session, state);
    hardcoreEchoes.archive(session, state, reason, payout, diamonds);
    hardcoreEchoes.releaseAll(session);
    hardcoreRepository.deleteSession(session.id);
    return {
      reason,
      payout,
      diamonds,
      diamondsLost: diamonds ? 0 : runDiamondReward(state),
      outcome,
      balance: account.balance,
      achievements: account.unlockedAchievements,
      experienceGained: account.experienceGained,
      levelUps: account.levelUps,
      bonusDrops: account.bonusDrops,
    };
  }

  function forceEndHardcoreSession(
    id,
    guildId,
    adminId,
    { label = "admin-refund", forfeit = false } = {},
  ) {
    return db.transaction(() => {
      const session = hardcoreRepository.getActiveSession(id, guildId);
      if (!session) return null;
      const state = parseState(session);
      if (!forfeit)
        creditCoins({
          guildId: session.guild_id,
          userId: session.user_id,
          amount: state.stake,
          reason: `hardcore:${label}:${adminId}:${session.id}`,
          operationId: `refund:hardcore-admin:${session.id}:${session.user_id}`,
        });
      if (
        label === "setup-ui-failed" &&
        !forfeit &&
        state.turn === 0 &&
        state.initialLoadout
      ) {
        for (const itemId of [
          ...state.initialLoadout.itemIds,
          ...state.initialLoadout.ticketIds,
        ])
          hardcoreInventory.grant(session.guild_id, session.user_id, itemId, 1);
      }
      if (forfeit)
        recordRun(session.guild_id, session.user_id, state, "forfeit");
      hardcoreEchoes.archive(
        session,
        state,
        forfeit ? "forfeit" : label,
        forfeit ? 0 : state.stake,
      );
      hardcoreEchoes.releaseAll(session);
      hardcoreRepository.deleteSession(session.id);
      return {
        session,
        state,
        participants: [session.user_id],
        forfeited: forfeit ? state.stake : 0,
      };
    })();
  }

  function cleanupStaleHardcoreSessions(now = Date.now()) {
    const rows = hardcoreRepository.listStale(now - STALE_MS);
    const cleanup = db.transaction(() => {
      for (const session of rows) {
        const forfeit =
          isV2(parseState(session)) || Boolean(session.message_id);
        forceEndHardcoreSession(session.id, session.guild_id, "system", {
          label: forfeit ? "timeout-forfeit" : "timeout-refund",
          forfeit,
        });
      }
    });
    cleanup();
    return rows.length;
  }
  return { finishRun, forceEndHardcoreSession, cleanupStaleHardcoreSessions };
};
