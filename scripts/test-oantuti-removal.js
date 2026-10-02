const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-oantuti-removal.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

// Giả lập dữ liệu cũ: dựng DB mới rồi nhét lại dữ liệu Oẳn tù tì, bỏ mốc migration 26 và nạp lại db.js.
const first = require("../src/db").db;
const now = Date.now();
first.exec(`CREATE TABLE rps_duels (id TEXT PRIMARY KEY, guild_id TEXT, channel_id TEXT, message_id TEXT, challenger_id TEXT, opponent_id TEXT, stake INTEGER, status TEXT, winner_id TEXT, expires_at INTEGER, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE rps_bot_rounds (id TEXT PRIMARY KEY)`);
const account = first.prepare("INSERT INTO economy_accounts(guild_id,user_id,balance,last_daily_at,games_played,wins,losses,draws,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
account.run("g", "alice", 900, 0, 10, 4, 5, 1, now, now);
account.run("g", "bob", 900, 0, 3, 1, 2, 0, now, now);
first.prepare("INSERT INTO rps_duels VALUES('d1','g','c',NULL,'alice','bob',100,'playing',NULL,?,?,?)").run(now, now, now);
first.prepare("INSERT INTO rps_duels VALUES('d2','g','c',NULL,'alice','bob',100,'invited',NULL,?,?,?)").run(now, now, now);
const stat = first.prepare("INSERT INTO game_player_stats(guild_id,game,user_id,played,wins,losses,draws,coins_earned,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
stat.run("g", "oantuti", "alice", 6, 2, 3, 1, 500, now);
stat.run("g", "taixiu", "alice", 4, 2, 2, 0, 300, now);
first.prepare("INSERT INTO game_history(guild_id,user_id,game,outcome,stake,payout,created_at) VALUES('g','alice','oantuti','win',100,200,?)").run(now);
first.prepare("INSERT INTO game_history(guild_id,user_id,game,outcome,stake,payout,created_at) VALUES('g','alice','taixiu','win',100,200,?)").run(now);
first.prepare("INSERT INTO game_channels(guild_id,game,channel_id,updated_at) VALUES('g','oantuti','c',?)").run(now);
first.prepare("INSERT INTO game_bet_limits(guild_id,game,max_bet,updated_at) VALUES('g','oantuti',500,?)").run(now);
first.prepare("INSERT INTO game_settings(guild_id,setting_key,setting_value,updated_by,updated_at) VALUES('g','WIN_MULT_OANTUTI','1.6','x',?)").run(now);
const inv = first.prepare("INSERT INTO user_inventory(guild_id,user_id,item_id,quantity,acquired_at,updated_at) VALUES(?,?,?,?,?,?)");
for (const item of ["rps_loss_shield", "rps_counter_charm", "rps_coward_privilege", "horse_jackpot"]) inv.run("g", "alice", item, 2, now, now);
first.prepare("INSERT INTO gacha_pool_entries(guild_id,reward_key,kind,item_id,display_name,tier,amount,weight,updated_by,updated_at) VALUES('g','rps_counter_charm','item','rps_counter_charm','x','SR',1,1,'x',?)").run(now);
first.prepare("INSERT INTO user_item_effects(guild_id,user_id,effect_id,charges,updated_at) VALUES('g','alice','rps_counter',1,?)").run(now);
first.prepare("INSERT INTO user_item_effects(guild_id,user_id,effect_id,charges,updated_at) VALUES('g','alice','horse_jackpot',1,?)").run(now);
first.prepare("DELETE FROM schema_migrations WHERE version=26").run();
first.close();
delete require.cache[require.resolve("../src/db")];
const { db } = require("../src/db");

const one = (sql, ...args) => db.prepare(sql).get(...args);
const count = (sql, ...args) => one(sql, ...args).count;
assert.equal(one("SELECT balance FROM economy_accounts WHERE guild_id='g' AND user_id='alice'").balance, 1000, "ván đang chơi được hoàn cược");
assert.equal(one("SELECT balance FROM economy_accounts WHERE guild_id='g' AND user_id='bob'").balance, 1000);
assert.equal(count("SELECT COUNT(*) count FROM economy_transactions WHERE reason='oantuti-removed:refund'"), 2, "chỉ hoàn ván playing, không hoàn lời mời");
const alice = one("SELECT games_played,wins,losses,draws FROM economy_accounts WHERE guild_id='g' AND user_id='alice'");
assert.deepEqual({ ...alice }, { games_played: 4, wins: 2, losses: 2, draws: 0 }, "trừ chỉ số của game khỏi tổng");
assert.equal(count("SELECT COUNT(*) count FROM game_player_stats WHERE game='oantuti'"), 0);
assert.equal(count("SELECT COUNT(*) count FROM game_player_stats WHERE game='taixiu'"), 1, "game khác giữ nguyên");
assert.equal(count("SELECT COUNT(*) count FROM game_history WHERE game='oantuti'"), 0);
assert.equal(count("SELECT COUNT(*) count FROM game_history WHERE game='taixiu'"), 1);
assert.equal(count("SELECT COUNT(*) count FROM game_channels WHERE game='oantuti'"), 0);
assert.equal(count("SELECT COUNT(*) count FROM game_bet_limits WHERE game='oantuti'"), 0);
assert.equal(count("SELECT COUNT(*) count FROM game_settings WHERE setting_key='WIN_MULT_OANTUTI'"), 0);
assert.deepEqual(db.prepare("SELECT item_id FROM user_inventory").all().map((row) => row.item_id), ["horse_jackpot"], "chỉ xóa 3 vật phẩm Oẳn tù tì");
assert.equal(count("SELECT COUNT(*) count FROM gacha_pool_entries WHERE reward_key LIKE 'rps_%'"), 0);
assert.deepEqual(db.prepare("SELECT effect_id FROM user_item_effects").all().map((row) => row.effect_id), ["horse_jackpot"]);
for (const table of ["rps_duels", "rps_bot_rounds"]) assert.equal(count("SELECT COUNT(*) count FROM sqlite_master WHERE name=?", table), 0, `${table} phải bị xóa`);

// Cả danh mục lẫn kho vật phẩm mặc định không còn chút dấu vết nào của game.
const { listCatalog } = require("../src/services/itemCatalogService");
assert(!listCatalog().some((item) => /^rps_/.test(item.id)));
assert(!require("../src/services/gachaPoolService").listGachaPool("new-guild").some((item) => /^rps_/.test(item.rewardKey)));
assert(!require("../src/services/gameChannelService").GAMES.includes("oantuti"));
assert(!require("../src/commandRegistry").COMMAND_FILES.includes("oantuti"));
assert(!fs.existsSync(path.resolve(__dirname, "../src/commands/oantuti.js")));
console.log(JSON.stringify({ ok: true, oantutiRemoved: true }));
process.exit(0);
