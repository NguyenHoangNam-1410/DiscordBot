const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.resolve(__dirname, '../data/test-session-lifecycle.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require('../src/db');
const economy = require('../src/services/economyService');
const balance = (guildId, userId) => economy.getAccount(guildId, userId).balance;
const START = economy.STARTING_COINS;

function openRound(guildId, game) {
  const id = crypto.randomBytes(4).toString('hex');
  db.prepare("INSERT INTO multiplayer_rounds (id,guild_id,game,channel_id,message_id,status,closes_at,result_json,created_at) VALUES (?,?,?,?,NULL,'open',?,?,?)")
    .run(id, guildId, game, 'c', Date.now() + 60_000, '{}', Date.now());
  return id;
}
function bet(guildId, roundId, userId, choice, amount) {
  economy.spendCoins({ guildId, userId, amount, reason: 'test-bet' });
  db.prepare('INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(roundId, userId, choice, amount, Date.now(), Date.now());
}

(async () => {
  const { forceEndSharedRound } = require('../src/services/roundAdminService');
  const multiplayer = require('../src/services/multiplayerGameService');

  // Bầu cua, Tài xỉu, Đua ngựa: hoàn toàn bộ cược, ván bị hủy và không thể chốt lại
  for (const game of ['baucua', 'taixiu', 'duangua']) {
    const guild = `force-${game}`;
    const roundId = openRound(guild, game);
    bet(guild, roundId, 'alice', 'x', 100); bet(guild, roundId, 'alice', 'y', 50); bet(guild, roundId, 'bob', 'x', 200);
    assert.equal(forceEndSharedRound(roundId, 'other-guild', 'admin'), null, 'không được kết thúc ván của server khác');
    const result = forceEndSharedRound(roundId, guild, 'admin');
    assert.deepEqual(result.participants.sort(), ['alice', 'bob']);
    assert.equal(balance(guild, 'alice'), START);
    assert.equal(balance(guild, 'bob'), START);
    assert.equal(db.prepare('SELECT status FROM multiplayer_rounds WHERE id=?').get(roundId).status, 'cancelled');
    assert.equal(forceEndSharedRound(roundId, guild, 'admin'), null, 'không hoàn tiền hai lần');
    assert.equal(balance(guild, 'alice'), START);
    if (game !== 'duangua') assert.equal(await multiplayer.settleRound(roundId, null), null, 'ván đã hủy không được chốt');
  }

  // Oẳn tù tì đấu người
  const rps = require('../src/services/rpsDuelService');
  const rpsGuild = 'force-rps';
  const invited = rps.createDuel({ guildId: rpsGuild, channelId: 'c', challengerId: 'alice', opponentId: 'bob', stake: 100 });
  const invitedEnd = rps.forceEndRpsDuel(invited.id, rpsGuild, 'admin');
  assert.equal(invitedEnd.refunded, false);
  assert.equal(balance(rpsGuild, 'alice'), START);
  const playing = rps.createDuel({ guildId: rpsGuild, channelId: 'c', challengerId: 'carol', opponentId: 'dave', stake: 100 });
  rps.acceptDuel(playing.id, 'dave');
  assert.equal(balance(rpsGuild, 'carol'), START - 100);
  const playingEnd = rps.forceEndRpsDuel(playing.id, rpsGuild, 'admin');
  assert.equal(playingEnd.refunded, true);
  assert.equal(balance(rpsGuild, 'carol'), START);
  assert.equal(balance(rpsGuild, 'dave'), START);
  assert.equal(rps.forceEndRpsDuel(playing.id, rpsGuild, 'admin'), null);
  assert.equal(balance(rpsGuild, 'carol'), START);

  // Xì dách đấu người
  const bjDuel = require('../src/services/blackjackDuelService');
  const bjGuild = 'force-bj-duel';
  const duel = bjDuel.createBlackjackDuel({ guildId: bjGuild, channelId: 'c', challengerId: 'alice', opponentId: 'bob', stake: 100 });
  bjDuel.acceptBlackjackDuel(duel.id, 'bob', Date.now(), ['2♣', '3♣', '4♠', '5♦']);
  assert.equal(balance(bjGuild, 'alice'), START - 100);
  const duelEnd = bjDuel.forceEndBlackjackDuel(duel.id, bjGuild, 'admin');
  assert.equal(duelEnd.refunded, true);
  assert.equal(balance(bjGuild, 'alice'), START);
  assert.equal(balance(bjGuild, 'bob'), START);
  assert.equal(bjDuel.forceEndBlackjackDuel(duel.id, bjGuild, 'admin'), null);

  // /quantri ketthucvan tìm được mọi loại ván
  process.env.ADMIN_USER_ID = 'admin';
  const quantri = require('../src/commands/quantri');
  const quantriGuild = 'force-quantri';
  const quantriRound = openRound(quantriGuild, 'baucua');
  bet(quantriGuild, quantriRound, 'alice', 'bau', 300);
  const replies = [];
  await quantri.execute({ guildId: quantriGuild, user: { id: 'admin' }, memberPermissions: { has: () => true }, client: { channels: { fetch: async () => null } },
    options: { getSubcommand: () => 'ketthucvan', getString: () => quantriRound }, reply: async payload => { replies.push(payload); return payload; } });
  assert.match(replies[0].content, /Đã buộc kết thúc/);
  assert.equal(balance(quantriGuild, 'alice'), START);

  // Ván solo bị kẹt tự được dọn và hoàn cược
  const stale = require('../src/services/staleSessionService');
  const blackjack = require('../src/services/blackjackService');
  const mines = require('../src/services/minesService');
  const chinchiro = require('../src/services/chinchiroService');
  const hardcore = require('../src/services/hardcoreService');
  const g = 'stale-guild';
  const bjSession = blackjack.startBlackjack({ guildId: g, channelId: 'c', userId: 'bj', stake: 100, forcedDeck: ['2♣', '3♣', '4♠', '5♦', '6♥'] });
  const minesSession = mines.startMines({ guildId: g, channelId: 'c', userId: 'mines', stake: 100, mineCount: 3, forcedMines: [0, 1, 2], forcedSpecial: 19 });
  const chinchiroSession = chinchiro.startChinchiro({ guildId: g, channelId: 'c', userId: 'chin', stake: 100, forcedSeed: 'a' });
  const hardcoreSession = hardcore.startHardcore({ guildId: g, channelId: 'c', userId: 'hc', stake: 100, classKey: 'barbarian', forcedEncounter: { type: 'empty' } });
  const ids = { blackjack_sessions: bjSession.session.id, mines_sessions: minesSession.session.id, chinchiro_sessions: chinchiroSession.session?.id, hardcore_sessions: hardcoreSession.session.id };
  const owners = { blackjack_sessions: 'bj', mines_sessions: 'mines', chinchiro_sessions: 'chin', hardcore_sessions: 'hc' };
  for (const [table, id] of Object.entries(ids)) {
    assert(id, `${table} không tạo được session để kiểm tra`);
    assert.equal(balance(g, owners[table]), START - 100, `${table} chưa giữ cược`);
    db.prepare(`UPDATE ${table} SET message_id='123' WHERE id=?`).run(id);
  }
  const now = Date.now();
  assert.equal(stale.expireStaleSoloSessionsSync(now).length, 0, 'ván còn mới không được dọn');
  const expired = stale.expireStaleSoloSessionsSync(now + stale.SOLO_SESSION_TTL_MS + 1_000);
  assert.equal(expired.length, 4);
  for (const [table, id] of Object.entries(ids)) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id=?`).get(id).count, 0, `${table} chưa được dọn`);
    assert.equal(balance(g, owners[table]), START, `${table} chưa hoàn cược`);
  }
  assert(db.prepare("SELECT 1 FROM economy_transactions WHERE guild_id=? AND reason LIKE '%timeout-refund%'").get(g));
  assert.equal(stale.expireStaleSoloSessionsSync(now + stale.SOLO_SESSION_TTL_MS + 2_000).length, 0, 'không hoàn tiền hai lần');

  // Ván tạo xong nhưng tin nhắn không gửi được (message_id rỗng) được dọn sau 2 phút
  const orphan = mines.startMines({ guildId: g, channelId: 'c', userId: 'orphan', stake: 100, mineCount: 3, forcedMines: [0, 1, 2], forcedSpecial: 19 });
  assert.equal(stale.expireStaleSoloSessionsSync(Date.now() + 60_000).length, 0);
  assert.equal(stale.expireStaleSoloSessionsSync(Date.now() + stale.NO_MESSAGE_TTL_MS + 1_000).length, 1);
  assert.equal(balance(g, 'orphan'), START);
  assert.equal(mines.getMinesByUser(g, 'orphan'), null);
  void orphan;

  console.log(JSON.stringify({ ok: true, sessionLifecycle: true }));
})().catch(error => { console.error(error); process.exit(1); });
