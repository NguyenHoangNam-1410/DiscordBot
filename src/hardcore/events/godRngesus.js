"use strict";
const { db } = require("../../db");
const { restore } = require("./blessing");
const {
  GOD_RNGESUS_RATE,
  godRngesusChance,
  formatGodChance,
} = require("./rngesus");
const { RELIC_ITEMS } = require("../item");
const { E, eventIcon } = require("../shared/icons");

function favor(guildId, userId) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_rngesus_favor WHERE guild_id=? AND user_id=?",
      )
      .get(String(guildId), String(userId)) || {
      deaths_since_blessing: 0,
      rngesus_deaths: 0,
      blessings: 0,
    }
  );
}
function history(guildId, userId) {
  return db
    .prepare(
      "SELECT floor,chance,encountered_at FROM hardcore_god_rngesus_encounters WHERE guild_id=? AND user_id=? ORDER BY encountered_at DESC,rowid DESC LIMIT 3",
    )
    .all(String(guildId), String(userId));
}
const recordDeath = db.transaction((session, reason, now = Date.now()) => {
  if (reason !== "rngesus") return false;
  const inserted = db
    .prepare(
      "INSERT OR IGNORE INTO hardcore_rngesus_death_marks(session_id,guild_id,user_id,ended_at) VALUES(?,?,?,?)",
    )
    .run(
      String(session.id),
      String(session.guild_id),
      String(session.user_id),
      now,
    ).changes;
  if (!inserted) return false;
  db.prepare(
    "INSERT INTO hardcore_rngesus_favor(guild_id,user_id,deaths_since_blessing,rngesus_deaths,blessings,updated_at) VALUES(?,?,1,1,0,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET deaths_since_blessing=deaths_since_blessing+1,rngesus_deaths=rngesus_deaths+1,updated_at=excluded.updated_at",
  ).run(String(session.guild_id), String(session.user_id), now);
  return true;
});
const recordEncounter = db.transaction(
  (session, floor, chance, now = Date.now()) => {
    const inserted = db
      .prepare(
        "INSERT OR IGNORE INTO hardcore_god_rngesus_encounters(session_id,floor,guild_id,user_id,chance,encountered_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        String(session.id),
        floor,
        String(session.guild_id),
        String(session.user_id),
        chance,
        now,
      ).changes;
    if (inserted)
      db.prepare(
        "INSERT INTO hardcore_rngesus_favor(guild_id,user_id,deaths_since_blessing,rngesus_deaths,blessings,updated_at) VALUES(?,?,0,0,1,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET deaths_since_blessing=0,blessings=blessings+1,updated_at=excluded.updated_at",
      ).run(String(session.guild_id), String(session.user_id), now);
    return Boolean(inserted);
  },
);
function claimReveal(sessionId, floor, now = Date.now()) {
  return Boolean(
    db
      .prepare(
        "UPDATE hardcore_god_rngesus_encounters SET revealed_at=? WHERE session_id=? AND floor=? AND revealed_at IS NULL",
      )
      .run(now, String(sessionId), floor).changes,
  );
}
function tryEncounter(state, session, rng) {
  if (
    !state.godRngesusEnabled ||
    state.mode?.startsWith("tower") ||
    state.towerChallengeId ||
    state.floor < 1 ||
    state.floor > 999 ||
    state.godRngesusRollFloor === state.floor ||
    state.hp <= 0
  )
    return null;
  // Saved with the enclosing game transaction: reopening never rolls this floor again.
  state.godRngesusRollFloor = state.floor;
  const previous = favor(session.guild_id, session.user_id);
  const chance = godRngesusChance(previous.deaths_since_blessing);
  if (rng() >= chance) return null;
  if (!recordEncounter(session, state.floor, chance)) return null;
  const blessing = restore(state);
  const { hpBefore, manaBefore } = blessing;
  const definition = RELIC_ITEMS.fatebreaker_seal;
  state.relics ||= [];
  if (!state.relics.some((item) => item.id === definition.id))
    state.relics.push({
      id: definition.id,
      acquiredFloor: state.floor,
      source: "god_rngesus",
    });
  if (!state.activeRelic) state.activeRelic = definition.id;
  state.lastChaosChance = 0;
  state.lastChaosSpike = false;
  state.evCount = (state.evCount || 0) + 1;
  state.evKinds = Array.from(
    new Set([...(state.evKinds || []), "god_rngesus"]),
  );
  state.lastLog =
    (state.lastLog ? state.lastLog + "\n" : "") +
    eventIcon("god_rngesus") +
    " **God of RNGesus (" +
    formatGodChance(chance) +
    ")** ban phước: " +
    E.hp +
    " **HP " +
    hpBefore +
    " → " +
    state.hp +
    "** · " +
    E.mana +
    " **MP " +
    manaBefore +
    " → " +
    state.mana +
    "**; giải toàn bộ nguyền UR, xóa mọi ấn Rift.\n" +
    "💠 Nhận **Fatebreaker Seal [LR]**" +
    (state.activeRelic === definition.id
      ? ": không gặp RNGesus trong phần còn lại của run."
      : ": đang có nội tại LR khác hoạt động.") +
    "\nTỷ lệ God of RNGesus đã reset về **" +
    formatGodChance(GOD_RNGESUS_RATE.initial) +
    "**.";
  return {
    type: "god_rngesus",
    name: "God of RNGesus",
    encounterChance: chance,
    blessing,
  };
}
module.exports = {
  favor,
  history,
  recordDeath,
  recordEncounter,
  claimReveal,
  tryEncounter,
};
