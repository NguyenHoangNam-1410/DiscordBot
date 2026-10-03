"use strict";
const crypto = require("node:crypto");
const { db } = require("../db");
const WEEK = 7 * 24 * 60 * 60 * 1000;
function archive(session, state, reason, payout = 0, diamonds = 0) {
  db.prepare(
    `INSERT OR IGNORE INTO hardcore_run_archive VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    session.id,
    session.guild_id,
    session.user_id,
    state.gameplayVersion || 1,
    state.releaseVersion || "legacy-4",
    state.classKey,
    state.cleared,
    reason,
    state.stake,
    payout,
    diamonds,
    state.turn,
    session.created_at,
    Date.now(),
  );
}
function claim(session, state, now = Date.now()) {
  db.prepare("DELETE FROM hardcore_echoes WHERE expires_at<=?").run(now);
  const echo = db
    .prepare(
      `SELECT * FROM hardcore_echoes WHERE guild_id=? AND user_id<>? AND floor<=?
    AND expires_at>? AND claimed_until<=? ORDER BY is_nemesis DESC,kills DESC,ABS(floor-?) ASC LIMIT 1`,
    )
    .get(
      session.guild_id,
      session.user_id,
      state.floor * 2,
      now,
      now,
      state.floor,
    );
  if (!echo) return null;
  const changed = db
    .prepare(
      `UPDATE hardcore_echoes SET claimed_by=?,claimed_until=? WHERE id=? AND claimed_until<=? AND expires_at>?`,
    )
    .run(session.id, now + 30 * 60 * 1000, echo.id, now, now).changes;
  return changed ? { ...echo, profile: JSON.parse(echo.profile_json) } : null;
}
function release(session, id) {
  db.prepare(
    "UPDATE hardcore_echoes SET claimed_by=NULL,claimed_until=0 WHERE id=? AND claimed_by=?",
  ).run(id, session.id);
}
function owns(session, id, now = Date.now()) {
  return (
    db
      .prepare(
        "SELECT * FROM hardcore_echoes WHERE id=? AND guild_id=? AND claimed_by=? AND claimed_until>? AND expires_at>?",
      )
      .get(id, session.guild_id, session.id, now, now) || null
  );
}
function consume(session, id) {
  if (!owns(session, id)) throw new Error("ECHO_EXPIRED");
  db.prepare("DELETE FROM hardcore_echoes WHERE id=? AND claimed_by=?").run(
    id,
    session.id,
  );
}
function renew(session, id, now = Date.now()) {
  if (!owns(session, id, now)) throw new Error("ECHO_EXPIRED");
  db.prepare(
    "UPDATE hardcore_echoes SET claimed_until=? WHERE id=? AND claimed_by=?",
  ).run(now + 30 * 60 * 1000, id, session.id);
}
function snapshot(state) {
  const attributes = ["str", "dex", "vit", "ene"];
  const build = attributes.reduce(
    (best, key) => (state[key] > state[best] ? key : best),
    "str",
  );
  const items = [...state.items]
    .sort(
      (a, b) =>
        ({ cursed: 4, legendary: 3, rare: 2, common: 1 })[b.rarity] -
          { cursed: 4, legendary: 3, rare: 2, common: 1 }[a.rarity] ||
        b.level - a.level,
    )
    .slice(0, 3)
    .map((item) => ({
      ...structuredClone(item),
      level: Math.min(5, item.level),
    }));
  return {
    classKey: state.classKey,
    skill: require("./hardcoreStats").CLASSES[state.classKey].skill,
    build,
    items,
  };
}
function onDeath(session, state, now = Date.now()) {
  if (state.encounter.echoId) {
    const echo = owns(session, state.encounter.echoId, now);
    if (echo) {
      const profile = JSON.parse(echo.profile_json),
        loot = snapshot(state).items[0];
      if (loot) {
        const old = profile.items.find(
          (x) => x.definition.id === loot.definition.id,
        );
        if (old) old.level = Math.min(5, old.level + 1);
        else if (profile.items.length < 3)
          profile.items.push({ ...loot, level: 1 });
      }
      db.prepare(
        `UPDATE hardcore_echoes SET profile_json=?,kills=kills+1,is_nemesis=1,expires_at=?,claimed_by=NULL,claimed_until=0,updated_at=? WHERE id=?`,
      ).run(JSON.stringify(profile), now + WEEK, now, echo.id);
      return;
    }
  }
  if (state.cleared < 100) return;
  // A leased grave cannot be replaced beneath another live run.
  if (
    db
      .prepare(
        "SELECT id FROM hardcore_echoes WHERE guild_id=? AND user_id=? AND is_nemesis=0 AND claimed_until>? AND expires_at>?",
      )
      .get(session.guild_id, session.user_id, now, now)
  )
    return;
  db.prepare(
    "DELETE FROM hardcore_echoes WHERE expires_at<=? OR (guild_id=? AND user_id=? AND is_nemesis=0 AND claimed_until<=?)",
  ).run(now, session.guild_id, session.user_id, now);
  const count = db
    .prepare("SELECT COUNT(*) n FROM hardcore_echoes WHERE guild_id=?")
    .get(session.guild_id).n;
  if (count >= 10) {
    const oldest = db
      .prepare(
        "SELECT id FROM hardcore_echoes WHERE guild_id=? AND is_nemesis=0 AND claimed_until<=? ORDER BY updated_at LIMIT 1",
      )
      .get(session.guild_id, now);
    if (!oldest) return;
    db.prepare("DELETE FROM hardcore_echoes WHERE id=?").run(oldest.id);
  }
  db.prepare(
    `INSERT INTO hardcore_echoes(id,guild_id,user_id,name,floor,profile_json,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
  ).run(
    crypto.randomBytes(8).toString("hex"),
    session.guild_id,
    session.user_id,
    state.playerName || state.className,
    state.floor,
    JSON.stringify(snapshot(state)),
    now + WEEK,
    now,
  );
}
function releaseAll(session) {
  db.prepare(
    "UPDATE hardcore_echoes SET claimed_by=NULL,claimed_until=0 WHERE claimed_by=?",
  ).run(session.id);
}
module.exports = {
  archive,
  claim,
  release,
  owns,
  consume,
  renew,
  snapshot,
  onDeath,
  releaseAll,
};
