// Saved V2/V3 state; V1 sessions are retired without loading the old engine.
module.exports = function createModule(dependencies) {
  const {
    db,
    creditCoins,
    hardcoreRepository,
    hardcoreV2,
    hardcoreEchoes,
    isV2,
    TRAP_KILLERS,
  } = dependencies;
  const obsolete = (state) =>
    state.gameplayVersion == null || state.gameplayVersion === 1;
  const retireTx = db.transaction((id) => {
    const session = hardcoreRepository.getSession(id);
    if (!session) return null;
    const state = hardcoreRepository.parseState(session);
    if (!obsolete(state)) return null;
    const stake =
      Number.isSafeInteger(state.stake) && state.stake > 0 ? state.stake : 0;
    if (stake)
      creditCoins({
        guildId: session.guild_id,
        userId: session.user_id,
        amount: stake,
        reason: "hardcore:v1-retired:" + session.id,
        operationId: "refund:hardcore-v1-retired:" + session.id,
      });
    hardcoreEchoes.archive(session, state, "v1-retired-refund", stake);
    db.prepare(
      "UPDATE hardcore_replays SET ended_at=?,reason=?,result_json=? WHERE session_id=? AND ended_at IS NULL",
    ).run(
      Date.now(),
      "v1-retired-refund",
      JSON.stringify({
        reason: "v1-retired-refund",
        payout: stake,
        diamonds: 0,
        cleared: state.cleared || 0,
        turns: state.turn || 0,
      }),
      session.id,
    );
    hardcoreEchoes.releaseAll(session);
    hardcoreRepository.deleteSession(session.id);
    return {
      session,
      state,
      participants: [session.user_id],
      forfeited: 0,
      refunded: stake,
    };
  });
  function retireLegacySession(session) {
    if (!session || !obsolete(hardcoreRepository.parseState(session)))
      return null;
    return retireTx(session.id);
  }
  function retireLegacyHardcoreSessions(guildId, userId) {
    const clauses = [
        "COALESCE(json_extract(state_json,'$.gameplayVersion'),1)=1",
      ],
      args = [];
    if (guildId != null) {
      clauses.push("guild_id=?");
      args.push(String(guildId));
    }
    if (userId != null) {
      clauses.push("user_id=?");
      args.push(String(userId));
    }
    return db.transaction(() => {
      const sessions = db
        .prepare(
          "SELECT * FROM hardcore_sessions WHERE " + clauses.join(" AND "),
        )
        .all(...args);
      let count = 0;
      for (const session of sessions) if (retireLegacySession(session)) count++;
      return count;
    })();
  }
  function parseState(session) {
    const state = hardcoreRepository.parseState(session);
    if (!isV2(state)) throw new Error("UNSUPPORTED_HARDCORE_VERSION");
    state.godRngesusEnabled = true;
    return hardcoreV2.normalize(state);
  }
  function getHardcoreRun(guildId, userId) {
    retireLegacyHardcoreSessions(guildId, userId);
    const session = hardcoreRepository.getByUser(guildId, userId);
    return session ? { session, state: parseState(session) } : null;
  }
  function killerName(state, reason) {
    if (reason === "rngesus") return "RNGesus";
    const e = state.encounter;
    if (e?.type === "combat" && e.name) return e.name;
    if (e?.type === "shrine") return "Fake Shrine";
    return (
      TRAP_KILLERS[e?.kind] ||
      hardcoreV2.EVENT_NAMES[e?.kind] ||
      "Lời nguyền / hiệu ứng"
    );
  }
  return {
    parseState,
    getHardcoreRun,
    killerName,
    retireLegacySession,
    retireLegacyHardcoreSessions,
  };
};
