// Runtime transaction for supported survival engines (V2/V3).
module.exports = function createModule(dependencies) {
  const {
    db,
    hardcoreRepository,
    hardcoreV2,
    fairStateContext,
    getSession,
    saveState,
  } = dependencies;
  const randomFloat = (...args) => dependencies.randomFloat(...args);
  const parseState = (...args) => dependencies.parseState(...args);
  const finishRun = (...args) => dependencies.finishRun(...args);
  const actionTx = db.transaction(
    ({ sessionId, userId, expectedTurn, action }) => {
      const session = getSession(sessionId);
      if (!session || session.user_id !== String(userId))
        throw new Error("INVALID_SESSION");
      const state = parseState(session);
      const replay = require("../replay/store");
      replay.ensure(session, state);
      const replayFloor = state.floor;
      const replayContext = {
        encounter: JSON.parse(
          JSON.stringify(replay.encounter(state.encounter)),
        ),
      };
      const played = fairStateContext.run(state, () => {
        if (state.turn !== expectedTurn) throw new Error("STALE_ACTION");
        state.turn += 1;
        let reason = hardcoreV2.act(state, session, action, randomFloat);
        if (
          require("../beta").is(state) &&
          ["death", "rngesus"].includes(reason)
        ) {
          require("../beta").markDeath(state, reason);
          saveState(session, state);
          return { settled: false, state, result: null };
        }
        if (
          !require("../beta").is(state) &&
          ["death", "rngesus"].includes(reason) &&
          hardcoreV2.reviveAfterDeath(state, session, randomFloat, reason)
        )
          reason = null;
        if (reason) {
          if (reason === "rngesus") state.hp = 0;
          return {
            settled: true,
            state,
            result: finishRun(session, state, reason),
          };
        }
        if (state.cleared > 0 && !require("../beta").is(state))
          hardcoreRepository.upsertRecord(session.guild_id, session.user_id, {
            bestFloor: state.cleared,
            runs: 0,
            deaths: 0,
            escapes: 0,
            completions: 0,
          });
        saveState(session, state);
        return { settled: false, state, result: null };
      });
      replay.append(session, played.state, action, replayFloor, replayContext);
      return played;
    },
  );

  function playHardcore(args) {
    if (
      dependencies.retireLegacySession(
        hardcoreRepository.getSession(args.sessionId),
      )
    )
      throw new Error("INVALID_SESSION");
    return actionTx(args);
  }
  return { actionTx, playHardcore };
};
