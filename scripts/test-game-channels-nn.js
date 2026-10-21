const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-game-channels-nn.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const channels = require("../src/services/gameChannelService");
const { requireGameChannel } = require("../src/utils/gameChannel");

const G = "nn-guild";
const replies = [];
const fake = (channelId) => ({
  guildId: G,
  channelId,
  reply: async (payload) => replies.push(payload.content),
});

(async () => {
  // Migration 51 phải cho phép nhiều dòng cùng (guild, game).
  assert.match(
    db.prepare("SELECT sql FROM sqlite_master WHERE name='game_channels'").get()
      .sql,
    /PRIMARY KEY\s*\(\s*guild_id\s*,\s*game\s*,\s*channel_id\s*\)/i,
  );

  assert.equal(await requireGameChannel(fake("a"), "taixiu"), false);
  assert.match(replies.pop(), /chưa được thiết lập/);

  channels.addGameChannel(G, "taixiu", "a");
  channels.addGameChannel(G, "taixiu", "b");
  channels.addGameChannel(G, "taixiu", "b"); // idempotent
  assert.equal(channels.getGameChannels(G, "taixiu").length, 2);
  assert.equal(await requireGameChannel(fake("a"), "taixiu"), true);
  assert.equal(await requireGameChannel(fake("b"), "taixiu"), true);
  assert.equal(await requireGameChannel(fake("c"), "taixiu"), false);
  assert.match(replies.pop(), /<#a>, <#b>/);

  // Một kênh vẫn chứa được nhiều game; gỡ kênh a chỉ ảnh hưởng game đó.
  channels.addGameChannel(G, "baucua", "a");
  assert.equal(channels.removeGameChannel(G, "taixiu", "a"), true);
  assert.equal(await requireGameChannel(fake("a"), "taixiu"), false);
  assert.equal(await requireGameChannel(fake("a"), "baucua"), true);

  // Vua tiếng Việt chỉ một kênh: thêm kênh mới thì thay kênh cũ.
  channels.addGameChannel(G, "vuatiengviet", "v1");
  channels.addGameChannel(G, "vuatiengviet", "v2");
  assert.deepEqual(
    channels.getGameChannels(G, "vuatiengviet").map((r) => r.channel_id),
    ["v2"],
  );
  assert.equal(channels.getGameChannel(G, "vuatiengviet").channel_id, "v2");
  assert.equal(channels.channelHasGame(G, "v1", "vuatiengviet"), false);

  // Migration từ bảng cũ (PK guild+game) giữ nguyên dữ liệu.
  db.exec(`DROP TABLE game_channels;
    CREATE TABLE game_channels (guild_id TEXT NOT NULL, game TEXT NOT NULL,
      channel_id TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (guild_id, game));
    INSERT INTO game_channels VALUES('old','poker','p',1);
    DELETE FROM schema_migrations WHERE version=51`);
  delete require.cache[require.resolve("../src/db")];
  require("../src/db");
  const { db: db2 } = require("../src/db");
  assert.equal(
    db2
      .prepare("SELECT channel_id FROM game_channels WHERE guild_id='old'")
      .get().channel_id,
    "p",
  );
  db2.prepare("INSERT INTO game_channels VALUES('old','poker','q',2)").run();
  console.log("game channels N-N tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
