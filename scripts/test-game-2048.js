const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-game-2048.sqlite");
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const svc = require("../src/services/game2048Service");
const channels = require("../src/services/gameChannelService");
const { getAccount } = require("../src/services/economyService");
const { getPlayerProgression } = require("../src/services/playerLevelService");

// Logic gộp ô
assert.deepEqual(svc.slideLine([2, 2, 2, 2]), {
  values: [4, 4, 0, 0],
  gained: 8,
});
assert.deepEqual(svc.slideLine([2, 2, 4, 0]), {
  values: [4, 4, 0, 0],
  gained: 4,
});
assert.deepEqual(svc.slideLine([4, 2, 2, 0]), {
  values: [4, 4, 0, 0],
  gained: 4,
});
assert.deepEqual(svc.slideLine([2, 4, 8, 16]), {
  values: [2, 4, 8, 16],
  gained: 0,
});
assert.deepEqual(svc.slideLine([0, 0, 0, 2]), {
  values: [2, 0, 0, 0],
  gained: 0,
});
// 4 4 8 -> 8 8 (mỗi ô chỉ gộp một lần)
assert.deepEqual(svc.slideLine([4, 4, 8, 0]), {
  values: [8, 8, 0, 0],
  gained: 8,
});

// Hướng dồn
const b = new Array(16).fill(0);
b[3] = 2; // hàng 0, cột 3
assert.equal(svc.shift(b, "left").board[0], 2);
assert.equal(svc.shift(b, "down").board[15], 2);
assert.equal(svc.shift(b, "right").moved, false);
assert.equal(svc.shift(b, "up").moved, false);
const col = new Array(16).fill(0);
col[0] = 2;
col[4] = 2;
col[8] = 4;
const down = svc.shift(col, "down");
assert.equal(down.board[12], 4);
assert.equal(down.board[8], 4);
assert.equal(down.gained, 4);

// Hết nước đi
const full = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
assert.equal(svc.canMove(full), false);
full[15] = 4;
assert.equal(svc.canMove(full), true);

// Khởi tạo: 2 ô, spawn chỉ vào ô trống
const board = svc.newBoard();
assert.equal(board.filter(Boolean).length, 2);
assert(board.every((v) => v === 0 || v === 2 || v === 4));
assert.equal(
  svc.applyMove(
    {
      board: full.map(() => 2).map((v, i) => (i % 2 ? 4 : 2)),
      score: 0,
      moves: 0,
      maxTile: 4,
    },
    "left",
  ),
  null,
);

// Hiển thị: mỗi ô rộng 3 emoji, ô ≥1000 viết gọn
assert.equal([...svc.tileCell(0)].length, 3);
assert.match(svc.tileCell(2), /2️⃣/);
assert.match(svc.tileCell(2048), /2️⃣\u{1F1F0}/u);
assert.equal(svc.boardText(new Array(16).fill(0)).split("\n").length, 7);

// Emoji ứng dụng: đủ bộ thì dùng, thiếu một ô thì quay về emoji Unicode
{
  const { setApplicationEmojisForTest } = require("../src/utils/appEmoji");
  const names = [
    "empty",
    ...Array.from({ length: 17 }, (_, i) => 2 ** (i + 1)),
  ];
  setApplicationEmojisForTest(
    names.map((n, i) => [`g2048_${n}`, String(100 + i)]),
  );
  const text = svc.boardText([
    2, 0, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 131072,
  ]);
  assert.equal(text.split("\n").length, 4);
  assert.match(
    text.split("\n")[0],
    /^<:g2048_2:101><:g2048_empty:100><:g2048_4:102><:g2048_8:103>$/,
  );
  setApplicationEmojisForTest(
    names.slice(0, 5).map((n, i) => [`g2048_${n}`, String(100 + i)]),
  );
  assert.equal(
    svc.boardText([2, 0, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64]).split("\n")
      .length,
    7,
  );
  setApplicationEmojisForTest([]);
}

// Thưởng
assert.deepEqual(svc.rewardFor(0, 2), { coins: 0, exp: 0 });
assert.deepEqual(svc.rewardFor(3000, 256), { coins: 100, exp: 12 });
assert.deepEqual(svc.rewardFor(24000, 2048), { coins: 800 + 150, exp: 60 });
assert.deepEqual(svc.rewardFor(10_000_000, 2048), {
  coins: svc.MAX_SCORE_COINS + svc.TARGET_BONUS_COINS,
  exp: svc.MAX_EXP,
});

// Kênh game
channels.addGameChannel("g", "2048", "c");
assert(channels.channelHasGame("g", "c", "2048"));

// Phiên chơi
const started = svc.startGame2048({
  guildId: "g",
  userId: "u",
  channelId: "c",
});
assert.throws(
  () => svc.startGame2048({ guildId: "g", userId: "u", channelId: "c" }),
  /ACTIVE_SESSION/,
);
const sid = started.session.id;
const before = getAccount("g", "u").balance;
// Đặt bàn cố định: có thể gộp để ghi điểm
db.prepare("UPDATE game2048_sessions SET state_json=? WHERE id=?").run(
  JSON.stringify({
    board: [2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    score: 2990,
    moves: 50,
    maxTile: 256,
    gameOver: false,
  }),
  sid,
);
assert.throws(
  () => svc.play2048({ sessionId: sid, userId: "other", action: "left" }),
  /SESSION_NOT_FOUND/,
);
assert.throws(
  () => svc.play2048({ sessionId: sid, userId: "u", action: "up" }),
  /NO_CHANGE/,
);
const moved = svc.play2048({
  sessionId: sid,
  userId: "u",
  action: "left",
  random: (n) => 0,
});
assert.equal(moved.result, null);
assert.equal(moved.state.score, 2990 + 4 + 8);
assert.equal(moved.state.moves, 51);
assert.equal(moved.state.board[0], 4);
assert.equal(moved.state.board[1], 8);

const payload = svc.renderPayload(moved.state, "u", sid);
assert.equal(payload.components.length, 3);
assert.deepEqual(payload.embeds, []);
assert.equal(payload.content.split("\n").length, 8);
assert.match(payload.content.split("\n")[0], /Điểm \*\*3\.002\*\*/);
const ids = payload.components.flatMap((row) =>
  row.components.map((c) => c.toJSON().custom_id),
);
assert.equal(new Set(ids).size, ids.length);
assert(ids.includes(`g2048:${sid}:end`));

const expBefore = getPlayerProgression("g", "u").experience;
const ended = svc.play2048({ sessionId: sid, userId: "u", action: "end" });
assert.equal(ended.result.coins, Math.floor(3002 / 30));
assert.equal(ended.result.exp, Math.floor(3002 / 250));
assert.equal(getAccount("g", "u").balance - before, ended.result.coins);
const progress = getPlayerProgression("g", "u");
assert(
  progress.level > 1 || progress.experience - expBefore === ended.result.exp,
);
assert.equal(svc.getGame2048ByUser("g", "u"), null);
// Bấm kết thúc lần hai không nhận lại thưởng
assert.throws(
  () => svc.play2048({ sessionId: sid, userId: "u", action: "end" }),
  /SESSION_NOT_FOUND/,
);
const finalPayload = svc.renderPayload(ended.state, "u", sid, ended.result);
assert.deepEqual(finalPayload.components, []);
assert.match(
  finalPayload.content.split("\n")[0],
  /^🏁 .*\+100 :coin: \+12 EXP/,
);

// Hết nước đi tự chốt và trả thưởng
const s2 = svc.startGame2048({ guildId: "g", userId: "v", channelId: "c" });
db.prepare("UPDATE game2048_sessions SET state_json=? WHERE id=?").run(
  JSON.stringify({
    board: [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 2, 4, 2, 0],
    score: 3000,
    moves: 20,
    maxTile: 4,
    gameOver: false,
  }),
  s2.session.id,
);
const over = svc.play2048({
  sessionId: s2.session.id,
  userId: "v",
  action: "right",
  random: () => 0,
});
assert(over.result, "hết nước đi phải tự chốt");
assert.equal(over.result.label, "over");
assert.equal(over.result.coins, 100);
assert.equal(svc.getGame2048ByUser("g", "v"), null);

// Chạm 2048 được cộng thưởng; hết giờ chốt theo điểm
const s3 = svc.startGame2048({ guildId: "g", userId: "w", channelId: "c" });
db.prepare(
  "UPDATE game2048_sessions SET state_json=?, updated_at=? WHERE id=?",
).run(
  JSON.stringify({
    board: new Array(16).fill(0),
    score: 21000,
    moves: 900,
    maxTile: 2048,
    gameOver: false,
  }),
  1,
  s3.session.id,
);
db.prepare("UPDATE game2048_sessions SET message_id='m' WHERE id=?").run(
  s3.session.id,
);
const stale =
  require("../src/services/staleSessionService").expireStaleSoloSessionsSync(
    Date.now(),
  );
const hit = stale.find((e) => e.game.table === "game2048_sessions");
assert(hit, "ván bị bỏ dở phải được chốt");
assert.equal(hit.result.result.coins, 700 + 150);
assert.equal(typeof hit.game.idleText(hit.row, hit.result), "string");
assert.equal(svc.getGame2048ByUser("g", "w"), null);

// Thành tựu
{
  const {
    getAchievements,
    ACHIEVEMENTS,
    achievementCategory,
  } = require("../src/services/achievementService");
  for (const metric of ["g2048Plays", "g2048Score", "g2048Tile", "g2048Wins"]) {
    assert(ACHIEVEMENTS.filter((a) => a.metric === metric).length >= 2, metric);
    assert.equal(achievementCategory({ metric }), "game2048");
  }
  const rec = db
    .prepare(
      "SELECT * FROM game2048_records WHERE guild_id='g' AND user_id='w'",
    )
    .get();
  assert.equal(rec.reach_2048, 1);
  assert.equal(rec.best_tile, 2048);
  const mine = (id) => getAchievements("g", "w").find((a) => a.id === id);
  assert(mine("g2048_tile_2048").complete, "ô 2048");
  assert(mine("g2048_wins_1").complete);
  assert(mine("g2048_score_20k").complete);
  assert.equal(mine("g2048_plays_10").progress, 1);
  assert(!mine("g2048_tile_8192").complete);
  // Ván không có nước đi nào không tính vào số ván
  const idle = svc.startGame2048({ guildId: "g", userId: "z", channelId: "c" });
  svc.play2048({ sessionId: idle.session.id, userId: "z", action: "end" });
  assert.equal(
    db
      .prepare("SELECT COUNT(*) c FROM game2048_records WHERE user_id='z'")
      .get().c,
    0,
  );
  // Dòng kết quả hiển thị thành tựu mới
  const s4 = svc.startGame2048({ guildId: "g", userId: "y", channelId: "c" });
  db.prepare("UPDATE game2048_sessions SET state_json=? WHERE id=?").run(
    JSON.stringify({
      board: new Array(16).fill(0),
      score: 6000,
      moves: 300,
      maxTile: 512,
      gameOver: false,
    }),
    s4.session.id,
  );
  const fin = svc.play2048({
    sessionId: s4.session.id,
    userId: "y",
    action: "end",
  });
  assert(fin.result.achievements.some((a) => a.id === "g2048_score_5k"));
  assert.match(
    svc.renderPayload(fin.state, "y", "x", fin.result).content,
    /🏆 .*Khởi động/,
  );
}

// batdau / tieptuc
(async () => {
  const command = require("../src/commands/2048");
  assert.deepEqual(
    command.data.toJSON().options.map((o) => o.name),
    ["batdau", "tieptuc"],
  );
  const replies = [];
  const edits = [];
  const fake = (sub, userId, channelId = "c") => ({
    guildId: "g",
    channelId,
    user: { id: userId },
    options: { getSubcommand: () => sub },
    client: {
      channels: {
        fetch: async () => ({
          messages: {
            fetch: async (id) => ({ edit: async (p) => edits.push([id, p]) }),
          },
        }),
      },
    },
    reply: async (payload) => {
      replies.push(payload);
      return { resource: { message: { id: `m${replies.length}` } } };
    },
  });
  // Chưa có ván: tieptuc báo lỗi
  await command.execute(fake("tieptuc", "r1"));
  assert.match(replies.pop().content, /không có ván 2048/);
  // batdau tạo ván và lưu id tin nhắn
  await command.execute(fake("batdau", "r1"));
  const first = svc.getGame2048ByUser("g", "r1");
  assert(first.message_id);
  // batdau lần hai bị từ chối, trỏ sang tieptuc
  await command.execute(fake("batdau", "r1"));
  assert.match(replies.pop().content, /\/2048 tieptuc/);
  assert.equal(svc.getGame2048ByUser("g", "r1").id, first.id);
  // tieptuc đăng bảng mới (kênh khác được phép) và khóa bảng cũ
  channels.addGameChannel("g", "2048", "c2");
  await command.execute(fake("tieptuc", "r1", "c2"));
  const resumed = svc.getGame2048ByUser("g", "r1");
  assert.equal(resumed.id, first.id);
  assert.equal(resumed.channel_id, "c2");
  assert.notEqual(resumed.message_id, first.message_id);
  assert.deepEqual(edits.pop(), [first.message_id, { components: [] }]);
  // Nút trên bảng cũ không còn hiệu lực, bảng mới thì có
  const press = (messageId, channelId, action = "left") => {
    const out = [];
    return svc
      .handleGame2048Button({
        customId: `g2048:${first.id}:${action}`,
        guildId: "g",
        channelId,
        user: { id: "r1" },
        message: { id: messageId },
        reply: async (p) => out.push(p),
        update: async (p) => out.push({ updated: true, ...p }),
      })
      .then(() => out[0]);
  };
  assert.match((await press(first.message_id, "c2")).content, /đã cũ/);
  const ok = await press(resumed.message_id, "c2", "end");
  assert(ok.updated || ok.content, "bảng mới hoạt động");
  // Ván bỏ dở 7 ngày mới bị chốt, 1 ngày thì chưa
  const idle = svc.startGame2048({
    guildId: "g",
    userId: "r2",
    channelId: "c",
  });
  svc.setMessageId(idle.session.id, "mm");
  const stale = require("../src/services/staleSessionService");
  db.prepare("UPDATE game2048_sessions SET updated_at=? WHERE id=?").run(
    Date.now() - 24 * 60 * 60_000,
    idle.session.id,
  );
  assert(
    !stale
      .expireStaleSoloSessionsSync(Date.now())
      .some((e) => e.row.id === idle.session.id),
  );
  db.prepare("UPDATE game2048_sessions SET updated_at=? WHERE id=?").run(
    Date.now() - svc.IDLE_TTL_MS - 1000,
    idle.session.id,
  );
  assert(
    stale
      .expireStaleSoloSessionsSync(Date.now())
      .some((e) => e.row.id === idle.session.id),
  );
  console.log("2048 tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
