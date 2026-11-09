"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  Database = require("better-sqlite3");
process.env.DB_PATH = ":memory:";
const { db } = require("../src/db");
async function main() {
  const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cotuong-migration-"),
    ),
    file = path.join(directory, "before.sqlite");
  try {
    await db.backup(file);
    const old = new Database(file);
    old.pragma("foreign_keys=ON");
    old.exec(
      "DROP TABLE cotuong_seats;DROP TABLE cotuong_channel_settings;DROP TABLE cotuong_rooms;DELETE FROM schema_migrations WHERE version=72;",
    );
    old
      .prepare(
        "INSERT INTO xiangqi_rounds(id,guild_id,channel_id,created_by,puzzle_id,puzzle_json,mate,reward,status,created_at,expires_at) VALUES('ct-old','migrate','channel','player','old-puzzle','{}',1,100,'open',1,9999999999999)",
      )
      .run();
    old
      .prepare(
        "INSERT INTO xiangqi_channel_locks VALUES('migrate','channel','token',9999999999999)",
      )
      .run();
    old
      .prepare(
        "INSERT INTO game_channels VALUES('migrate','cotuong','channel',1)",
      )
      .run();
    old
      .prepare("INSERT INTO game_rewards VALUES('migrate','cotuong',100,1)")
      .run();
    old
      .prepare(
        "INSERT INTO game_settings VALUES('migrate','maintenance:cotuong','1','admin',1)",
      )
      .run();
    old
      .prepare("INSERT INTO xiangqi_records VALUES('migrate','player',7,4,1)")
      .run();
    old
      .prepare(
        "INSERT INTO xiangqi_awards VALUES('migrate','player','old-puzzle','ct-old',1)",
      )
      .run();
    old
      .prepare(
        "INSERT INTO game_channels VALUES('migrate','covua','chess-channel',1)",
      )
      .run();
    old
      .prepare("INSERT INTO game_rewards VALUES('migrate','covua',250,1)")
      .run();
    old.close();
    const code = `const assert=require('node:assert/strict'),{db}=require('./src/db');
   const round=db.prepare("SELECT status,closed_at FROM xiangqi_rounds WHERE id='ct-old'").get();assert.equal(round.status,'admin_closed');assert(round.closed_at>0);
   assert.equal(db.prepare("SELECT count(*) n FROM xiangqi_channel_locks WHERE guild_id='migrate'").get().n,0);
   assert.equal(db.prepare("SELECT count(*) n FROM game_channels WHERE guild_id='migrate' AND game='cotuong'").get().n,0);
   assert.equal(db.prepare("SELECT count(*) n FROM game_rewards WHERE guild_id='migrate' AND game='cotuong'").get().n,0);
   assert.equal(db.prepare("SELECT count(*) n FROM game_settings WHERE guild_id='migrate' AND setting_key='maintenance:cotuong'").get().n,0);
   assert.equal(db.prepare("SELECT solved FROM xiangqi_records WHERE guild_id='migrate'").get().solved,7);
   assert.equal(db.prepare("SELECT count(*) n FROM xiangqi_awards WHERE guild_id='migrate'").get().n,1);
   assert.equal(db.prepare("SELECT reward FROM game_rewards WHERE guild_id='migrate' AND game='covua'").get().reward,250);
   assert.equal(db.prepare("SELECT count(*) n FROM game_channels WHERE guild_id='migrate' AND game='covua'").get().n,1);
   for(const table of ['cotuong_rooms','cotuong_seats','cotuong_channel_settings'])assert(db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table));db.close();`;
    const result = spawnSync(process.execPath, ["-e", code], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DB_PATH: file, LOG_LEVEL: "fatal" },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    console.log(
      JSON.stringify({
        ok: true,
        cotuongMigration:
          "v71→72 closes old puzzles and clears legacy settings/locks; preserves solved records/awards and chess configuration",
      }),
    );
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert(path.basename(resolved).startsWith("cotuong-migration-"));
    fs.rmSync(resolved, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
