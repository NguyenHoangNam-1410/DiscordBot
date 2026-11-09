"use strict";

const path = require("node:path");
const { MESSAGES } = require("./store");
const { roomPayload } = require("./discord");

function createGame({ store, db }) {
  return {
    id: "cotuong",
    name: "Cờ tướng",
    publicDir: path.join(__dirname, "public"),
    store,
    errors: MESSAGES,
    isOpen: (room) => ["waiting", "playing"].includes(room.status),
    actions: {
      move: async (roomId, userId, data) => {
        await require("./engine").initialize();
        return store.move(roomId, userId, data, data.version);
      },
      leave: (roomId, userId) => store.leave(roomId, userId),
    },
    discord: db
      ? {
          payload: roomPayload,
          pending: () =>
            db
              .prepare(
                "SELECT id FROM cotuong_rooms WHERE ui_dirty=1 AND json_extract(data_json,'$.messageId') IS NOT NULL",
              )
              .all(),
          acknowledge: (room) =>
            db
              .prepare(
                "UPDATE cotuong_rooms SET ui_dirty=0 WHERE id=? AND data_json=?",
              )
              .run(room.id, JSON.stringify(room)).changes,
          discard: (id) =>
            db
              .prepare("UPDATE cotuong_rooms SET ui_dirty=0 WHERE id=?")
              .run(id),
          restore: () =>
            db
              .prepare(
                "UPDATE cotuong_rooms SET ui_dirty=1 WHERE status IN ('waiting','playing') AND json_extract(data_json,'$.messageId') IS NOT NULL",
              )
              .run(),
        }
      : null,
  };
}

module.exports = { createGame };
