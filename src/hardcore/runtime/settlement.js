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
    runDiamondReward,
    hardcoreV2,
    hardcoreEchoes,
    STALE_MS,
  } = dependencies;
  const recordRun = (...args) => dependencies.recordRun(...args);
  const parseState = (...args) => dependencies.parseState(...args);
  const killerName = (...args) => dependencies.killerName(...args);

  function finishRun(session, state, reason) {
    if (require("../beta").is(state)) {
      const simulatedPayout = ["cashout", "summit", "beta_end"].includes(reason)
        ? hardcoreV2.payout(state)
        : 0;
      const result = require("../beta").result(state, reason, simulatedPayout);
      require("../replay/store").close(session, state, reason, result);
      hardcoreRepository.deleteSession(session.id);
      return result;
    }
    godRngesus.recordDeath(session, reason);
    if (["death", "rngesus"].includes(reason))
      state.killedBy = killerName(state, reason);
    const diamonds =
      reason === "cashout" || reason === "summit" ? runDiamondReward(state) : 0;
    let payout =
      reason === "cashout" || reason === "summit"
        ? hardcoreV2.payout(state)
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
    if (["death", "rngesus"].includes(reason))
      hardcoreEchoes.onDeath(session, state);
    hardcoreEchoes.archive(session, state, reason, payout, diamonds);
    hardcoreEchoes.releaseAll(session);
    require("../replay/store").close(session, state, reason, {
      payout,
      diamonds,
    });
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
      const retired = dependencies.retireLegacySession(session);
      if (retired) return retired;
      const state = parseState(session);
      if (!forfeit && !require("../beta").is(state))
        creditCoins({
          guildId: session.guild_id,
          userId: session.user_id,
          amount: state.stake,
          reason: `hardcore:${label}:${adminId}:${session.id}`,
          operationId: `refund:hardcore-admin:${session.id}:${session.user_id}`,
        });
      if (
        !require("../beta").is(state) &&
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
      const replay = require("../replay/store");
      replay.ensure(session, state);
      replay.append(
        session,
        state,
        "end:" + (forfeit ? "forfeit" : label),
        state.floor,
      );
      replay.close(session, state, forfeit ? "forfeit" : label, {
        payout: forfeit || require("../beta").is(state) ? 0 : state.stake,
      });
      hardcoreRepository.deleteSession(session.id);
      return {
        session,
        state,
        participants: [session.user_id],
        forfeited: forfeit && !require("../beta").is(state) ? state.stake : 0,
      };
    })();
  }

  function cleanupStaleHardcoreSessions(now = Date.now()) {
    const retired = dependencies.retireLegacyHardcoreSessions();
    const rows = hardcoreRepository.listStale(now - STALE_MS);
    const cleanup = db.transaction(() => {
      for (const session of rows) {
        forceEndHardcoreSession(session.id, session.guild_id, "system", {
          label: "timeout-forfeit",
          forfeit: true,
        });
      }
    });
    cleanup();
    return retired + rows.length;
  }
  return { finishRun, forceEndHardcoreSession, cleanupStaleHardcoreSessions };
};
