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

  // Nút chọn Oẳn tù tì phải xác nhận interaction
  const acknowledgeGuild = 'rps-ack';
  const ackDuel = rps.createDuel({ guildId: acknowledgeGuild, channelId: 'c', challengerId: 'alice', opponentId: 'bob', stake: 100 });
  rps.acceptDuel(ackDuel.id, 'bob');
  const ackCalls = [];
  const press = async (userId, choice) => {
    const calls = [];
    await rps.handleRpsDuelButton({ customId: `rpsduel:${ackDuel.id}:choose:${choice}`, guildId: acknowledgeGuild, channelId: 'c', user: { id: userId },
      update: async payload => { calls.push(payload); return payload; },
      reply: async payload => { calls.push({ reply: payload }); return payload; },
      message: { edit: async () => { throw new Error('không được sửa message mà không xác nhận interaction'); } } });
    return calls;
  };
  const firstPress = await press('alice', 'bua'); ackCalls.push(firstPress);
  assert.equal(firstPress.length, 1); assert(firstPress[0].embeds, 'lượt chọn đầu phải cập nhật embed qua interaction.update');
  const secondPress = await press('bob', 'keo'); ackCalls.push(secondPress);
  assert.equal(secondPress.length, 1); assert(secondPress[0].embeds && secondPress[0].components.length, 'lượt chọn cuối cập nhật embed kết quả kèm nút tái đấu');

  // Hủy đua ngựa đang chạy: dừng animation và không ghi đè thông báo hủy
  const horse = require('../src/services/horseRaceService');
  const horseRepo = require('../src/services/horseRaceRepository');
  const { createFairness } = require('../src/services/fairnessService');
  const raceGuild = 'cancel-race';
  const market = horse.generateRaceMarket(Date.now(), { forceSpecial: false });
  const raceId = crypto.randomBytes(4).toString('hex');
  horseRepo.createRound({ id: raceId, guild_id: raceGuild, channel_id: 'c', status: 'open', closes_at: Date.now() - 1, created_at: Date.now() }, { market, fair: createFairness() });
  db.prepare('UPDATE multiplayer_rounds SET message_id=? WHERE id=?').run('msg-1', raceId);
  economy.spendCoins({ guildId: raceGuild, userId: 'alice', amount: 100, reason: 'test-horse' });
  horseRepo.addBet(raceId, 'alice', market.selected[0], 100);
  const raceEdits = [];
  const fakeClient = { channels: { fetch: async () => ({ messages: { fetch: async () => ({ edit: async payload => {
    raceEdits.push(payload);
    if (raceEdits.length === 2) forceEndSharedRound(raceId, raceGuild, 'admin');
    return payload;
  } }) } }) } };
  const raceResult = await horse.settleHorseRace(raceId, fakeClient, { error() {}, warn() {}, info() {} }, market.selected[0]);
  assert.equal(raceResult, null, 'ván bị hủy không được chốt kết quả');
  assert.equal(raceEdits.length, 2, 'không được phát thêm frame sau khi ván bị hủy');
  assert.equal(db.prepare('SELECT status FROM multiplayer_rounds WHERE id=?').get(raceId).status, 'cancelled');
  assert.equal(balance(raceGuild, 'alice'), START, 'phải hoàn cược đua ngựa bị hủy');

  // Dọn ván bị hủy và lịch sử Gacha
  const oldTime = Date.now() - 30 * 86_400_000;
  const oldStatuses = ['closed', 'cancelled', 'open'];
  const oldRoundIds = oldStatuses.map(status => {
    const id = crypto.randomBytes(4).toString('hex');
    db.prepare('INSERT INTO multiplayer_rounds (id,guild_id,game,channel_id,message_id,status,closes_at,result_json,created_at) VALUES (?,?,?,?,NULL,?,?,?,?)').run(id, 'cleanup', 'baucua', 'c', status, oldTime, '{}', oldTime);
    db.prepare('INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, 'alice', 'bau', 10, oldTime, oldTime);
    return id;
  });
  const recentCancelled = crypto.randomBytes(4).toString('hex');
  db.prepare("INSERT INTO multiplayer_rounds (id,guild_id,game,channel_id,message_id,status,closes_at,result_json,created_at) VALUES (?,?,?,?,NULL,'cancelled',?,?,?)").run(recentCancelled, 'cleanup', 'baucua', 'c', Date.now(), '{}', Date.now());
  assert.equal(multiplayer.cleanupOldRounds({}), 2, 'chỉ xóa ván closed và cancelled đã quá hạn');
  const exists = id => Boolean(db.prepare('SELECT 1 FROM multiplayer_rounds WHERE id=?').get(id));
  assert.equal(exists(oldRoundIds[0]), false); assert.equal(exists(oldRoundIds[1]), false);
  assert.equal(exists(oldRoundIds[2]), true, 'ván đang mở không được xóa'); assert.equal(exists(recentCancelled), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM multiplayer_bets WHERE round_id IN (?,?)').get(oldRoundIds[0], oldRoundIds[1]).count, 0);

  const gachaService = require('../src/services/gachaService');
  const insertHistory = (userId, createdAt) => db.prepare("INSERT INTO gacha_history(guild_id,user_id,pulls,diamond_cost,results_json,created_at,operation_id,payment_type) VALUES('cleanup',?,1,100,'[]',?,NULL,'diamonds')").run(userId, createdAt);
  insertHistory('old', Date.now() - 200 * 86_400_000); insertHistory('mid', Date.now() - 100 * 86_400_000); insertHistory('new', Date.now() - 1_000);
  assert.equal(gachaService.cleanupGachaHistory(Date.now(), 180), 1, 'mặc định giữ 180 ngày');
  assert.equal(gachaService.cleanupGachaHistory(Date.now(), 30), 1, 'retention tùy chỉnh phải có tác dụng');
  assert.equal(gachaService.cleanupGachaHistory(Date.now(), 1), 0, 'retention tối thiểu 7 ngày');
  assert.deepEqual(db.prepare("SELECT user_id FROM gacha_history WHERE guild_id='cleanup'").all().map(row => row.user_id), ['new']);

  // Ván hết hạn: người làm hết hạn mất cược, người đã thao tác được hoàn
  const afk = 'afk-expiry';
  const expiryTime = Date.now() + rps.PLAY_TTL_MS + 1_000;
  const rpsExpiry = rps.createDuel({ guildId: afk, channelId: 'c', challengerId: 'alice', opponentId: 'bob', stake: 100 });
  rps.acceptDuel(rpsExpiry.id, 'bob');
  rps.chooseHand(rpsExpiry.id, 'alice', 'bua');
  const rpsExpired = rps.expireDuel(rpsExpiry.id, expiryTime);
  assert.deepEqual(rpsExpired.forfeited, ['bob']);
  assert.equal(balance(afk, 'alice'), START, 'người đã chọn được hoàn cược');
  assert.equal(balance(afk, 'bob'), START - 100, 'người không chọn kịp mất cược');
  const rpsBothAfk = rps.createDuel({ guildId: afk, channelId: 'c', challengerId: 'carol', opponentId: 'dave', stake: 100 });
  rps.acceptDuel(rpsBothAfk.id, 'dave');
  assert.deepEqual(rps.expireDuel(rpsBothAfk.id, expiryTime).forfeited.sort(), ['carol', 'dave']);
  assert.equal(balance(afk, 'carol'), START - 100); assert.equal(balance(afk, 'dave'), START - 100);
  assert.match(JSON.stringify(rps.duelEmbed(rps.getDuel(rpsExpiry.id)).toJSON()), /{"name":"Kết quả"/);
  const invitedOnly = rps.createDuel({ guildId: afk, channelId: 'c', challengerId: 'erin', opponentId: 'frank', stake: 100 });
  assert.deepEqual(rps.expireDuel(invitedOnly.id, Date.now() + rps.INVITE_TTL_MS + 1_000).forfeited, [], 'lời mời chưa chấp nhận không có ai mất cược');
  assert.equal(balance(afk, 'erin'), START);

  const bjExpiry = bjDuel.createBlackjackDuel({ guildId: afk, channelId: 'c', challengerId: 'gina', opponentId: 'hank', stake: 100 });
  bjDuel.acceptBlackjackDuel(bjExpiry.id, 'hank', Date.now(), ['9♣', '8♣', '4♠', '5♦', 'A♥']);
  bjDuel.playBlackjackDuel(bjExpiry.id, 'gina', 'stand');
  const bjExpired = bjDuel.expireBlackjackDuel(bjExpiry.id, Date.now() + bjDuel.PLAY_TTL_MS + 1_000);
  assert.deepEqual(bjExpired.forfeited, ['hank'], 'người chưa hoàn tất lượt phải mất cược');
  assert.equal(balance(afk, 'gina'), START); assert.equal(balance(afk, 'hank'), START - 100);

  const blackjackModule = require('../src/services/blackjackService');
  const tableId = crypto.randomBytes(4).toString('hex');
  const tableState = { phase: 'playing', turn: 1, dealer: ['10♣', '7♦'], deck: [], players: [
    { id: 'ivy', stake: 100, cards: ['9♣', '8♣'], status: 'stand' }, { id: 'jack', stake: 100, cards: ['5♣', '6♣'], status: 'playing' }] };
  for (const userId of ['ivy', 'jack', 'kate']) economy.spendCoins({ guildId: afk, userId, amount: userId === 'kate' ? 300 : 100, reason: 'test-table' });
  db.prepare("INSERT INTO blackjack_tables(id,guild_id,channel_id,message_id,dealer_id,ante,state_json,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'playing',?,?,?)")
    .run(tableId, afk, 'c', null, 'kate', 100, JSON.stringify(tableState), Date.now() - 1, Date.now(), Date.now());
  const expiredTableState = blackjackModule.expireBlackjackTableTx(blackjackModule.getBlackjackTable(tableId));
  assert.equal(expiredTableState.staller, 'jack');
  assert.equal(balance(afk, 'ivy'), START, 'người chơi đã dừng được hoàn cược');
  assert.equal(balance(afk, 'kate'), START, 'nhà cái được hoàn ký quỹ');
  assert.equal(balance(afk, 'jack'), START - 100, 'người đến lượt mà để bàn hết hạn mất cược');
  assert.match(JSON.stringify(blackjackModule.blackjackTableEmbed(blackjackModule.getBlackjackTable(tableId), expiredTableState).toJSON()), /mất tiền cược/);

  const pokerTable = require('../src/services/pokerMultiplayerService');
  const pokerTableId = crypto.randomBytes(4).toString('hex');
  const pokerPlayers = ['lena', 'mike', 'nora'].map(id => ({ id, name: id, stack: 500, committed: 50, streetBet: 0, lobbyAnte: 0, folded: false, allIn: false, hole: [] }));
  for (const player of pokerPlayers) economy.spendCoins({ guildId: afk, userId: player.id, amount: 50, reason: 'test-poker-table' });
  const pokerTableState = { mode: 'multiplayer', variant: 'texas', phase: 'betting', street: 'flop', turnUserId: 'mike', discardPending: [], pending: ['mike'], board: [], log: [], players: pokerPlayers };
  db.prepare('INSERT INTO poker_sessions(id,guild_id,channel_id,message_id,user_id,variant,state_json,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(pokerTableId, afk, 'c', null, 'lena', 'texas', JSON.stringify(pokerTableState), Date.now() - 1, Date.now(), Date.now());
  await pokerTable.expirePokerTable(db.prepare('SELECT * FROM poker_sessions WHERE id=?').get(pokerTableId), null, false);
  assert.equal(balance(afk, 'lena'), START); assert.equal(balance(afk, 'nora'), START);
  assert.equal(balance(afk, 'mike'), START - 50, 'người đến lượt mà để bàn Poker hết hạn mất cược');
  const lobbyId = crypto.randomBytes(4).toString('hex');
  const lobbyState = { ...pokerTableState, phase: 'lobby', street: 'lobby', turnUserId: null, pending: [], players: ['olga', 'pete'].map(id => ({ id, name: id, stack: 500, committed: 0, streetBet: 0, lobbyAnte: 50, folded: false, allIn: false, hole: [] })) };
  for (const player of lobbyState.players) economy.spendCoins({ guildId: afk, userId: player.id, amount: 50, reason: 'test-poker-lobby' });
  db.prepare('INSERT INTO poker_sessions(id,guild_id,channel_id,message_id,user_id,variant,state_json,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(lobbyId, afk, 'c', null, 'olga', 'texas', JSON.stringify(lobbyState), Date.now() - 1, Date.now(), Date.now());
  await pokerTable.expirePokerTable(db.prepare('SELECT * FROM poker_sessions WHERE id=?').get(lobbyId), null, false);
  assert.equal(balance(afk, 'olga'), START, 'bàn Poker hết hạn ở sảnh chờ không ai mất cược'); assert.equal(balance(afk, 'pete'), START);

  // Shrine giả gây chết trong Sinh tồn phải kết thúc run thay vì lỗi
  const shrineGuild = 'shrine-guild';
  const hardcoreForShrine = require('../src/services/hardcoreService');
  const shrineRun = hardcoreForShrine.startHardcore({ guildId: shrineGuild, channelId: 'c', userId: 'alice', stake: 100, classKey: 'barbarian', forcedEncounter: { type: 'shrine', kind: 'fake' } });
  const shrineState = JSON.parse(db.prepare('SELECT state_json FROM hardcore_sessions WHERE id=?').get(shrineRun.session.id).state_json);
  shrineState.hp = 1;
  db.prepare('UPDATE hardcore_sessions SET state_json=? WHERE id=?').run(JSON.stringify(shrineState), shrineRun.session.id);
  const shrineResult = hardcoreForShrine.playHardcore({ sessionId: shrineRun.session.id, userId: 'alice', expectedTurn: shrineState.turn, action: 'touch' });
  assert.equal(shrineResult.settled, true, 'chạm Shrine giả khi gần chết phải kết thúc run');
  assert.equal(shrineResult.result.outcome, 'loss');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hardcore_sessions WHERE id=?').get(shrineRun.session.id).count, 0);

  // Bàn Poker hết hạn trả về state; bấm nút vào bàn đã hết hạn không gây lỗi
  const expiredPokerId = crypto.randomBytes(4).toString('hex');
  const expiredPokerPlayers = ['quinn', 'ruth'].map(id => ({ id, name: id, stack: 500, committed: 50, streetBet: 0, lobbyAnte: 0, folded: false, allIn: false, hole: [] }));
  for (const player of expiredPokerPlayers) economy.spendCoins({ guildId: afk, userId: player.id, amount: 50, reason: 'test-poker-button' });
  db.prepare('INSERT INTO poker_sessions(id,guild_id,channel_id,message_id,user_id,variant,state_json,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(expiredPokerId, afk, 'c', null, 'quinn', 'texas', JSON.stringify({ mode: 'multiplayer', variant: 'texas', phase: 'betting', street: 'flop', turnUserId: 'ruth', discardPending: [], pending: ['ruth'], board: [], log: [], players: expiredPokerPlayers }), Date.now() - 1, Date.now(), Date.now());
  const pokerButtonUpdates = [];
  await require('../src/services/pokerService').handlePokerButton({ customId: `poker:${expiredPokerId}:call`, guildId: afk, channelId: 'c', user: { id: 'quinn' },
    update: async payload => { pokerButtonUpdates.push(payload); return payload; }, reply: async payload => { pokerButtonUpdates.push({ reply: payload }); return payload; } });
  assert.equal(pokerButtonUpdates.length, 1);
  assert(pokerButtonUpdates[0].embeds, 'bấm nút bàn Poker đã hết hạn phải cập nhật embed đóng bàn');
  assert.equal(balance(afk, 'quinn'), START); assert.equal(balance(afk, 'ruth'), START - 50);

  // Nút xác nhận Oẳn tù tì với bot sau khi hết hạn
  const rpsBot = require('../src/services/rpsBotService');
  const botRound = rpsBot.createRpsBotRound({ guildId: 'rps-bot-expiry', channelId: 'c', userId: 'alice', stake: 100, choice: 'bua' });
  db.prepare('UPDATE rps_bot_rounds SET expires_at=? WHERE id=?').run(Date.now() - 1, botRound.id);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const botUpdates = [];
    await rpsBot.handleRpsBotButton({ customId: `rpsbot:${botRound.id}:confirm`, user: { id: 'alice' },
      update: async payload => { botUpdates.push(payload); return payload; }, reply: async payload => { botUpdates.push({ reply: payload }); return payload; } });
    assert.equal(botUpdates.length, 1); assert(botUpdates[0].embeds && botUpdates[0].components.length === 0, `lần bấm ${attempt + 1}: phải đóng nút xác nhận đã hết hạn`);
  }
  assert.equal(balance('rps-bot-expiry', 'alice'), START, 'ván xác nhận hết hạn không được trừ cược');

  // RESET SERVER xóa cả phiên Vua tiếng Việt (DB và bộ nhớ)
  const vuaReset = 'vua-reset-guild';
  const funGame = require('../src/services/funGameService');
  funGame.startVuaSession(vuaReset);
  assert(funGame.getVuaSession(vuaReset));
  require('../src/services/adminDataService').resetServerPlayerData({ guildId: vuaReset });
  assert.equal(funGame.getVuaSession(vuaReset), null, 'phiên Vua tiếng Việt trong bộ nhớ phải bị xóa');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM game_sessions WHERE guild_id=? AND game='vuatiengviet'").get(vuaReset).count, 0);

  // Dò mìn: tối thiểu 2 mìn, Giáp Chống Nổ chỉ chặn một mìn trên mỗi bản đồ
  const minesSvc = require('../src/services/minesService');
  const effectState = require('../src/services/effectStateService');
  const minesAbuse = 'mines-shield-rules';
  assert.equal(minesSvc.MIN_MINES, 2);
  for (let index = 0; index < 2; index += 1) economy.creditCoins({ guildId: minesAbuse, userId: 'alice', amount: 100_000, reason: 'test-mines' });
  assert.throws(() => minesSvc.startMines({ guildId: minesAbuse, channelId: 'c', userId: 'alice', stake: 10, mineCount: 1 }), /INVALID_MINES/);
  assert.equal(minesSvc.getMinesByUser(minesAbuse, 'alice'), null, 'ván 1 mìn bị từ chối không được tạo session');
  assert.equal(balance(minesAbuse, 'alice'), START + 200_000, 'ván 1 mìn bị từ chối không được trừ cược');
  assert.equal(require('../src/commands/mines').data.toJSON().options.find(option => option.name === 'min').min_value, 2);
  effectState.addEffectCharge(minesAbuse, 'alice', 'mines_blast_shield');
  const shieldedMines = minesSvc.startMines({ guildId: minesAbuse, channelId: 'c', userId: 'alice', stake: 100_000, mineCount: 2, forcedMines: [0, 1], forcedSpecial: 19 });
  const firstHit = minesSvc.playMines({ sessionId: shieldedMines.session.id, userId: 'alice', action: 'open', cell: 0 });
  assert.equal(firstHit.settled, false); assert.equal(firstHit.state.shieldUsed, true, 'khiên chặn mìn đầu tiên');
  const secondHit = minesSvc.playMines({ sessionId: shieldedMines.session.id, userId: 'alice', action: 'open', cell: 1 });
  assert.equal(secondHit.settled, true, 'khiên chỉ dùng một lần: mìn thứ hai phải nổ'); assert.equal(secondHit.exploded, 1);
  assert.equal(secondHit.result.payout, 0);
  assert.equal(effectState.getActiveEffect(minesAbuse, 'alice', 'mines_blast_shield'), null, 'khiên đã tiêu hao, không dùng lại được ở ván sau');
  const noShield = minesSvc.startMines({ guildId: minesAbuse, channelId: 'c', userId: 'alice', stake: 10, mineCount: 2, forcedMines: [0, 1], forcedSpecial: 19 });
  assert(!noShield.state.blastShield, 'ván sau không còn khiên');
  assert.equal(minesSvc.playMines({ sessionId: noShield.session.id, userId: 'alice', action: 'open', cell: 0 }).settled, true);
  // Mở nhiều ô hơn số ô an toàn nhờ khiên không được tăng hệ số hay chạm mức trả tối đa
  for (const mineCount of [2, 3, 5, 7]) {
    const safe = minesSvc.CELL_COUNT - mineCount;
    for (let opened = 1; opened <= minesSvc.CELL_COUNT; opened += 1) {
      const multiplier = minesSvc.multiplierFor(opened, mineCount, 10);
      assert(Number.isFinite(multiplier) && multiplier >= 1.01);
      if (opened > safe) assert.equal(multiplier, minesSvc.multiplierFor(safe, mineCount, 10));
      if (opened > 1) assert(multiplier >= minesSvc.multiplierFor(opened - 1, mineCount, 10), 'hệ số không được giảm khi mở thêm ô');
    }
  }

  // Xóa xu không được để tiền đang khóa trong ván quay lại tài khoản
  const adminData = require('../src/services/adminDataService');
  const lockedGuild = 'clear-locked';
  const blackjackForClear = require('../src/services/blackjackService');
  const lockedBlackjack = blackjackForClear.startBlackjack({ guildId: lockedGuild, channelId: 'c', userId: 'alice', stake: 100, forcedDeck: ['2♣', '3♣', '4♠', '5♦', '6♥'] });
  assert.equal(balance(lockedGuild, 'alice'), START - 100);
  const cleared = adminData.clearPlayerData({ guildId: lockedGuild, userId: 'alice', scope: 'coins', adminId: 'admin' });
  assert.equal(cleared.forfeitedGames, 1); assert.equal(cleared.forfeitedStake, 100);
  assert.equal(balance(lockedGuild, 'alice'), 0);
  assert.equal(blackjackForClear.forceEndBlackjackSession(lockedBlackjack.session.id, lockedGuild, 'admin'), null, 'ván đã bị hủy, admin không thể hoàn cược');
  assert.throws(() => blackjackForClear.playAction({ sessionId: lockedBlackjack.session.id, userId: 'alice', action: 'stand' }), /INVALID_SESSION/);
  assert.equal(balance(lockedGuild, 'alice'), 0, 'xu đã xóa không được quay lại');

  const clearRound = openRound(lockedGuild, 'baucua');
  bet(lockedGuild, clearRound, 'bob', 'bau', 200);
  bet(lockedGuild, clearRound, 'carol', 'bau', 200);
  assert.equal(adminData.clearPlayerData({ guildId: lockedGuild, userId: 'bob', scope: 'all', adminId: 'admin' }).forfeitedStake, 200);
  const clearedRound = await multiplayer.settleRound(clearRound, null, console, ['bau', 'bau', 'bau']);
  assert(!clearedRound.settlements.some(item => item.userId === 'bob'), 'cược của người bị xóa xu không được thanh toán');
  assert.equal(balance(lockedGuild, 'bob'), 0, 'ván thắng cũng không được trả xu cho người đã bị xóa');
  assert(balance(lockedGuild, 'carol') > START - 200, 'người khác trong ván vẫn được thanh toán');

  const clearDuel = rps.createDuel({ guildId: lockedGuild, channelId: 'c', challengerId: 'dave', opponentId: 'erin', stake: 100 });
  rps.acceptDuel(clearDuel.id, 'erin');
  adminData.clearPlayerData({ guildId: lockedGuild, userId: 'dave', scope: 'coins', adminId: 'admin' });
  assert.equal(balance(lockedGuild, 'dave'), 0, 'người bị xóa xu không nhận lại cược duel');
  assert.equal(balance(lockedGuild, 'erin'), START, 'đối thủ được hoàn cược');
  assert.equal(rps.getDuel(clearDuel.id).status, 'expired');

  const clearPoker = require('../src/services/pokerService').startPoker({ guildId: lockedGuild, channelId: 'c', userId: 'frank', variant: 'texas' });
  assert.equal(adminData.clearPlayerData({ guildId: lockedGuild, userId: 'frank', scope: 'coins', adminId: 'admin' }).forfeitedGames, 1);
  assert.equal(balance(lockedGuild, 'frank'), 0);
  assert.equal(require('../src/services/pokerService').getSession(clearPoker.session.id), null);

  const bulkGuild = 'clear-bulk';
  const bulkMines = require('../src/services/minesService').startMines({ guildId: bulkGuild, channelId: 'c', userId: 'fay', stake: 100, mineCount: 2, forcedMines: [0, 1], forcedSpecial: 19 });
  const bulkBlackjack = blackjackForClear.startBlackjack({ guildId: bulkGuild, channelId: 'c', userId: 'gus', stake: 100, forcedDeck: ['2♣', '3♣', '4♠', '5♦', '6♥'] });
  const bulkTotals = adminData.clearAllPlayerData({ guildId: bulkGuild, scope: 'coins', adminId: 'admin' });
  assert.equal(bulkTotals.forfeitedGames, 2); assert.equal(bulkTotals.forfeitedStake, 200);
  for (const user of ['fay', 'gus']) assert.equal(balance(bulkGuild, user), 0);
  assert.equal(require('../src/services/minesService').getMinesByUser(bulkGuild, 'fay'), null);
  assert.equal(blackjackForClear.getSessionByUser(bulkGuild, 'gus'), null);
  void bulkMines; void bulkBlackjack;
  const diamondOnly = adminData.clearPlayerData({ guildId: 'clear-diamonds', userId: 'hal', scope: 'diamonds', adminId: 'admin' });
  assert.equal(diamondOnly.forfeitedGames, 0, 'chỉ xóa kim cương thì không hủy ván');

  // Lệnh prefix Xì dách mở bàn bằng ante và không còn cú pháp solo
  const prefixGuild = 'prefix-blackjack';
  require('../src/services/gameChannelService').setGameChannel(prefixGuild, 'blackjack', 'prefix-channel');
  const prefixReplies = [];
  const prefixMessage = content => ({ guildId: prefixGuild, channelId: 'prefix-channel', content, author: { id: 'dealer', bot: false, username: 'dealer' },
    reply: async payload => { prefixReplies.push(payload); return { id: `reply-${prefixReplies.length}` }; } });
  const gamePrefix = require('../src/services/gamePrefixService');
  assert.equal(await gamePrefix.handleGamePrefix(prefixMessage('!xidach solo <@123456789> 100')), true);
  assert.match(prefixReplies.at(-1).content, /Cách dùng/); assert(!/solo/.test(prefixReplies.at(-1).content), 'hướng dẫn không được nhắc solo');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM blackjack_tables WHERE guild_id=?').get(prefixGuild).count, 0);
  assert.equal(await gamePrefix.handleGamePrefix(prefixMessage('!xidach 100')), true);
  const prefixTable = db.prepare('SELECT * FROM blackjack_tables WHERE guild_id=?').get(prefixGuild);
  assert(prefixTable, '!xidach 100 phải mở bàn'); assert.equal(prefixTable.ante, 100); assert.equal(prefixTable.dealer_id, 'dealer');
  assert.equal(balance(prefixGuild, 'dealer'), START - 300, 'nhà cái phải ký quỹ ante × 3');
  assert(prefixReplies.at(-1).embeds, 'phải hiện bàn Xì dách');

  // Từ Điển Sống trao cả 10 kim cương của câu khó
  const dictGuild = 'dictionary-guild'; const dictChannel = 'dictionary-channel';
  require('../src/services/gameChannelService').setGameChannel(dictGuild, 'vuatiengviet', dictChannel);
  for (const key of ['GAME_COIN_DROP_CHANCE', 'GAME_DIAMOND_DROP_CHANCE', 'GAME_GACHA_DROP_CHANCE']) require('../src/services/gameConfigService').setGameConfig(dictGuild, key, 0, 'test');
  const funForDictionary = require('../src/services/funGameService');
  funForDictionary.startVuaSession(dictGuild, { forceHard: true });
  const levelsForDictionary = require('../src/services/playerLevelService');
  const diamondsBefore = levelsForDictionary.getPlayerProgression(dictGuild, 'alice').diamonds;
  require('../src/services/shopService').addInventory(dictGuild, 'alice', 'living_dictionary', 1);
  const dictionaryUse = require('../src/services/itemEffectService').useItem({ guildId: dictGuild, userId: 'alice', channelId: dictChannel, itemId: 'living_dictionary' });
  assert.equal(levelsForDictionary.getPlayerProgression(dictGuild, 'alice').diamonds, diamondsBefore + 10, 'phải nhận 10 kim cương như trả lời câu khó thông thường');
  assert.match(dictionaryUse.message, /10 kim cương/);
  assert.match(require('../src/services/itemCatalogService').getCatalogItem('living_dictionary').description, /10 kim cương/);

  // Dọn duel và bàn Xì dách đã kết thúc
  const recordCleanup = require('../src/services/gameRecordCleanupService');
  const recordGuild = 'record-cleanup';
  const oldRecordTime = Date.now() - 30 * 86_400_000;
  const makeDuel = (table, status, updatedAt) => {
    const id = crypto.randomBytes(4).toString('hex');
    if (table === 'rps_duels') db.prepare("INSERT INTO rps_duels(id,guild_id,channel_id,message_id,challenger_id,opponent_id,stake,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, recordGuild, 'c', null, 'a', 'b', 100, status, updatedAt, updatedAt, updatedAt);
    else db.prepare("INSERT INTO blackjack_duels(id,guild_id,channel_id,message_id,challenger_id,opponent_id,stake,state_json,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, recordGuild, 'c', null, 'a', 'b', 100, '{}', status, updatedAt, updatedAt, updatedAt);
    return id;
  };
  const makeTable = (status, updatedAt) => {
    const id = crypto.randomBytes(4).toString('hex');
    db.prepare("INSERT INTO blackjack_tables(id,guild_id,channel_id,message_id,dealer_id,ante,state_json,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, recordGuild, 'c', null, 'a', 100, '{}', status, updatedAt, updatedAt, updatedAt);
    return id;
  };
  const oldRecords = { rps_duels: ['completed', 'declined', 'expired'].map(status => makeDuel('rps_duels', status, oldRecordTime)), blackjack_duels: ['completed', 'expired'].map(status => makeDuel('blackjack_duels', status, oldRecordTime)), blackjack_tables: ['completed', 'expired'].map(status => makeTable(status, oldRecordTime)) };
  const keptRecords = { rps_duels: [makeDuel('rps_duels', 'playing', oldRecordTime), makeDuel('rps_duels', 'completed', Date.now())], blackjack_duels: [makeDuel('blackjack_duels', 'invited', oldRecordTime)], blackjack_tables: [makeTable('playing', oldRecordTime), makeTable('lobby', oldRecordTime), makeTable('completed', Date.now())] };
  const cleanupResult = recordCleanup.cleanupFinishedGameRecords();
  assert.deepEqual(cleanupResult, { rpsDuels: 3, blackjackDuels: 2, blackjackTables: 2 });
  for (const [table, ids] of Object.entries(oldRecords)) for (const id of ids) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id=?`).get(id).count, 0, `${table} cũ chưa được xóa`);
  for (const [table, ids] of Object.entries(keptRecords)) for (const id of ids) assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id=?`).get(id).count, 1, `${table} đang hoạt động hoặc còn mới không được xóa`);
  assert.deepEqual(recordCleanup.cleanupFinishedGameRecords(), { rpsDuels: 0, blackjackDuels: 0, blackjackTables: 0 });

  // Poker với bot: hoàn đúng số xu đã trừ, không tạo thêm xu từ stack bàn
  const poker = require('../src/services/pokerService');
  const pokerGuild = 'force-poker';
  const anteOnly = poker.startPoker({ guildId: pokerGuild, channelId: 'c', userId: 'alice', variant: 'texas' });
  assert.equal(balance(pokerGuild, 'alice'), START - anteOnly.state.ante);
  assert(anteOnly.state.players[0].stack > anteOnly.state.ante, 'stack bàn phải lớn hơn ante để kiểm tra lỗi tạo xu');
  assert.equal(poker.forceEndPokerSession(anteOnly.session.id, pokerGuild, 'admin').state.result.payout, anteOnly.state.ante);
  assert.equal(balance(pokerGuild, 'alice'), START, 'kết thúc ván Poker không được tạo hoặc mất xu');
  assert.equal(poker.forceEndPokerSession(anteOnly.session.id, pokerGuild, 'admin'), null);
  const raised = poker.startPoker({ guildId: pokerGuild, channelId: 'c', userId: 'bob', variant: 'texas' });
  poker.playerAction(raised.session.id, 'bob', 'raise', 20);
  assert(balance(pokerGuild, 'bob') < START - raised.state.ante, 'tố thêm phải trừ xu');
  poker.forceEndPokerSession(raised.session.id, pokerGuild, 'admin');
  assert.equal(balance(pokerGuild, 'bob'), START, 'phải hoàn cả ante và số xu đã tố');

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
  assert(expired.every(item => item.forfeit), 'ván treo sau khi đã có tin nhắn phải bị xử thua');
  for (const [table, id] of Object.entries(ids)) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id=?`).get(id).count, 0, `${table} chưa được dọn`);
    assert.equal(balance(g, owners[table]), START - 100, `${table}: người để ván hết hạn không được hoàn cược`);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM economy_transactions WHERE guild_id=? AND reason LIKE '%timeout-%'").get(g).count, 0, 'xử thua không tạo giao dịch hoàn tiền');
  assert.equal(stale.expireStaleSoloSessionsSync(now + stale.SOLO_SESSION_TTL_MS + 2_000).length, 0, 'không hoàn tiền hai lần');

  // Ván tạo xong nhưng tin nhắn không gửi được (message_id rỗng) được dọn sau 2 phút
  const orphan = mines.startMines({ guildId: g, channelId: 'c', userId: 'orphan', stake: 100, mineCount: 3, forcedMines: [0, 1, 2], forcedSpecial: 19 });
  assert.equal(stale.expireStaleSoloSessionsSync(Date.now() + 60_000).length, 0);
  const orphanExpired = stale.expireStaleSoloSessionsSync(Date.now() + stale.NO_MESSAGE_TTL_MS + 1_000);
  assert.equal(orphanExpired.length, 1);
  assert.equal(orphanExpired[0].forfeit, false, 'lỗi gửi tin nhắn không phải lỗi người chơi');
  assert.equal(balance(g, 'orphan'), START, 'ván chưa có tin nhắn phải được hoàn cược');
  assert.equal(mines.getMinesByUser(g, 'orphan'), null);
  void orphan;

  console.log(JSON.stringify({ ok: true, sessionLifecycle: true }));
})().catch(error => { console.error(error); process.exit(1); });
