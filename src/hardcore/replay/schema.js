"use strict";
module.exports = (db, migrate) =>
  migrate(48, "immutable survival replay snapshots", () =>
    db.exec(
      "CREATE TABLE hardcore_replays (session_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT,result_json TEXT,partial INTEGER NOT NULL DEFAULT 0,next_seq INTEGER NOT NULL DEFAULT 0);" +
        "CREATE INDEX idx_hc_replays_guild ON hardcore_replays(guild_id,ended_at);" +
        "CREATE TABLE hardcore_replay_frames (session_id TEXT NOT NULL REFERENCES hardcore_replays(session_id),seq INTEGER NOT NULL,turn INTEGER NOT NULL,floor INTEGER NOT NULL,action TEXT NOT NULL,context_json TEXT NOT NULL,state_blob BLOB NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(session_id,seq));",
    ),
  );
