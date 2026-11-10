"use strict";

const { randomUUID } = require("node:crypto");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CODE = /^[a-f0-9]{8}$/i;
function tableFor(gameId) {
  if (!/^[a-z][a-z0-9]*$/.test(gameId)) throw new Error("Invalid game ID");
  return gameId + "_rooms";
}
// UUID-prefix ranges use the existing primary-key index, including legacy rooms.
function prefixRange(code) {
  const prefix = code.toLowerCase();
  return [prefix + "-", prefix + "."];
}
function createRoomIdentity(db, gameId, generate = randomUUID) {
  const table = tableFor(gameId);
  for (let attempt = 0; attempt < 64; attempt++) {
    const id = generate();
    if (!UUID.test(id)) throw new Error("Invalid room ID");
    const roomCode = id.slice(0, 8).toUpperCase();
    if (
      !db
        .prepare(`SELECT 1 FROM ${table} WHERE id>=? AND id<? LIMIT 1`)
        .get(...prefixRange(roomCode))
    )
      return { id, roomCode };
  }
  throw new Error("Không thể tạo mã phòng. Hãy thử lại.");
}
function resolveRoomId(db, gameId, reference) {
  if (typeof reference !== "string") return null;
  if (UUID.test(reference)) return reference;
  if (!CODE.test(reference)) return null;
  const table = tableFor(gameId);
  // Only newly created rooms opt in. Never infer a short URL for legacy JSON.
  return (
    db
      .prepare(
        `SELECT id FROM ${table} WHERE id>=? AND id<? AND json_extract(data_json,'$.roomCode')=?`,
      )
      .get(...prefixRange(reference), reference.toUpperCase())?.id || null
  );
}
const roomReference = (room, fallback) =>
  room?.roomCode || room?.id || fallback;
module.exports = { createRoomIdentity, resolveRoomId, roomReference };
