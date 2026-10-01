const { db } = require("../db");

function getActiveEffect(guildId, userId, effectId, now = Date.now()) {
  const row = db
    .prepare(
      "SELECT * FROM user_item_effects WHERE guild_id=? AND user_id=? AND effect_id=?",
    )
    .get(String(guildId), String(userId), String(effectId));
  if (!row || row.charges < 1 || (row.expires_at && row.expires_at <= now))
    return null;
  return row;
}
function addEffectCharge(
  guildId,
  userId,
  effectId,
  { expiresAt = null, charges = 1, metadata = {} } = {},
) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO user_item_effects (guild_id,user_id,effect_id,charges,expires_at,metadata_json,updated_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,effect_id) DO UPDATE SET
    charges=CASE WHEN user_item_effects.expires_at IS NOT NULL AND user_item_effects.expires_at<=excluded.updated_at
      THEN excluded.charges ELSE MAX(user_item_effects.charges,excluded.charges) END,
    expires_at=excluded.expires_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`,
  ).run(
    String(guildId),
    String(userId),
    effectId,
    charges,
    expiresAt,
    JSON.stringify(metadata || {}),
    now,
  );
  return getActiveEffect(guildId, userId, effectId, now);
}
function consumeActiveEffect(guildId, userId, effectId, now = Date.now()) {
  return db.transaction(() => {
    const effect = getActiveEffect(guildId, userId, effectId, now);
    if (!effect) return false;
    db.prepare(
      "UPDATE user_item_effects SET charges=charges-1,updated_at=? WHERE guild_id=? AND user_id=? AND effect_id=?",
    ).run(now, String(guildId), String(userId), effectId);
    return true;
  })();
}
function effectMetadata(effect) {
  try {
    return JSON.parse(effect?.metadata_json || "{}");
  } catch {
    return {};
  }
}

function consumeHighestEffect(guildId, userId, effectIds, now = Date.now()) {
  return db.transaction(() => {
    for (const effectId of effectIds) {
      const effect = getActiveEffect(guildId, userId, effectId, now);
      if (!effect) continue;
      consumeActiveEffect(guildId, userId, effectId, now);
      return { ...effect, metadata: effectMetadata(effect) };
    }
    return null;
  })();
}

function removeActiveEffect(guildId, userId, effectId) {
  return (
    db
      .prepare(
        "UPDATE user_item_effects SET charges=0,updated_at=? WHERE guild_id=? AND user_id=? AND effect_id=? AND charges>0",
      )
      .run(Date.now(), String(guildId), String(userId), String(effectId))
      .changes > 0
  );
}

function listActiveEffects(guildId, userId, now = Date.now()) {
  return db
    .prepare(
      `SELECT * FROM user_item_effects WHERE guild_id=? AND user_id=? AND charges>0
    AND (expires_at IS NULL OR expires_at>?) ORDER BY updated_at DESC`,
    )
    .all(String(guildId), String(userId), now);
}

module.exports = {
  getActiveEffect,
  addEffectCharge,
  consumeActiveEffect,
  consumeHighestEffect,
  removeActiveEffect,
  effectMetadata,
  listActiveEffects,
};
