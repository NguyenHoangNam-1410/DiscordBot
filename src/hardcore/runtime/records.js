// Composed once by ./index. Cross-module calls are deferred until the feature is ready.
module.exports = function createModule(dependencies) {
  const { db, hardcoreRepository } = dependencies;
  const getHardcoreRun = (...args) => dependencies.getHardcoreRun(...args);

  function recordRun(guildId, userId, state, reason) {
    hardcoreRepository.addEventStats(guildId, userId, {
      events: state.evCount || 0,
      chains: state.chainCount || 0,
      kinds: state.evKinds || [],
      kills: state.kills || 0,
      bossKills: state.bossKills || 0,
      bosses: state.bossTally || {},
    });
    const death = ["death", "rngesus"].includes(reason) ? 1 : 0;
    const escape = ["cashout", "summit"].includes(reason) ? 1 : 0;
    const completion = state.completed ? 1 : 0;
    hardcoreRepository.upsertRecord(guildId, userId, {
      bestFloor: state.cleared,
      runs: 1,
      deaths: death,
      escapes: escape,
      completions: completion,
    });
  }

  function getHardcoreRecord(guildId, userId) {
    const record = hardcoreRepository.getRecord(guildId, userId) || {
      guild_id: String(guildId),
      user_id: String(userId),
      best_floor: 0,
      runs: 0,
      deaths: 0,
      escapes: 0,
      completions: 0,
    };
    const run = getHardcoreRun(guildId, userId);
    record.versions = db
      .prepare(
        `SELECT release_version,gameplay_version,COUNT(*) runs,MAX(cleared) best_floor,
    SUM(CASE WHEN reason IN ('cashout','summit') THEN 1 ELSE 0 END) escapes
    FROM hardcore_run_archive WHERE guild_id=? AND user_id=? AND reason IN ('cashout','summit','death','rngesus','forfeit') GROUP BY release_version,gameplay_version`,
      )
      .all(String(guildId), String(userId));
    record.activeVersion =
      run?.state.releaseVersion || (run ? "legacy-4" : null);
    if (!run) return record;
    return {
      ...record,
      best_floor: Math.max(record.best_floor, run.state.cleared),
      runs: record.runs + 1,
      completions: record.completions + (run.state.completed ? 1 : 0),
    };
  }

  function getHardcoreTop(guildId, limit = 10) {
    return hardcoreRepository.getTop(guildId, limit);
  }
  return { recordRun, getHardcoreRecord, getHardcoreTop };
};
