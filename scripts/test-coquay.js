const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.resolve(__dirname, '../data/test-coquay.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require('../src/db');
const economy = require('../src/services/economyService');
const engine = require('../src/services/coquayEngine');
const coquay = require('../src/services/coquayService');
const { addInventory, getInventoryQuantity } = require('../src/services/shopService');
const gameConfig = require('../src/services/gameConfigService');
const balance = (guildId, userId) => economy.getAccount(guildId, userId).balance;
const START = economy.STARTING_COINS;
const rng = n => Math.floor(Math.random() * n);
const T = true; const F = false;
const noDrops = guildId => { for (const key of ['GAME_COIN_DROP_CHANCE', 'GAME_DIAMOND_DROP_CHANCE', 'GAME_ITEM_DROP_MULTIPLIER']) gameConfig.setGameConfig(guildId, key, 0, 'test'); };

(async () => {
  // 1) Nạp đạn: đúng số viên theo đợt, luôn có ít nhất 1 thật và 1 lép
  const ranges = { 1: [2, 3], 2: [4, 5], 3: [6, 8], 4: [6, 8] };
  const seen = { 1: new Set(), 2: new Set(), 3: new Set() };
  for (let i = 0; i < 3000; i += 1) {
    const state = engine.createState(100);
    for (let load = 1; load <= 4; load += 1) {
      const { live, blank } = engine.loadChamber(state, rng);
      const size = live + blank; const [min, max] = ranges[load];
      assert(size >= min && size <= max, `đợt ${load} có ${size} viên`);
      assert(live >= 1 && blank >= 1, 'mỗi đợt có ít nhất 1 thật và 1 lép');
      assert.equal(state.chamber.length, size); assert.equal(state.chamber.filter(Boolean).length, live);
      if (load <= 3) seen[load].add(size);
    }
  }
  assert.deepEqual([...seen[1]].sort(), [2, 3]); assert.deepEqual([...seen[2]].sort(), [4, 5]); assert.deepEqual([...seen[3]].sort(), [6, 7, 8]);

  // 2) Luật bắn
  const fixed = chamber => { const state = engine.createState(100); state.chamber = [...chamber]; state.loads = 1; state.lastLoad = { live: 1, blank: 1 }; return state; };
  let s = fixed([F, T, F]);
  assert.equal(engine.shoot(s, 'player', 'player', rng).live, false); assert.equal(s.turn, 'player', 'tự bắn lép giữ lượt'); assert.equal(s.hp.player, 3);
  engine.shoot(s, 'player', 'player', rng); assert.equal(s.hp.player, 2, 'tự bắn thật mất 1 máu'); assert.equal(s.turn, 'bot', 'tự bắn thật mất lượt');
  s = fixed([F, T]); engine.shoot(s, 'player', 'bot', rng); assert.equal(s.turn, 'bot', 'bắn đối phương lép vẫn chuyển lượt'); assert.equal(s.hp.bot, 3);
  s = fixed([T, F]); engine.shoot(s, 'player', 'bot', rng); assert.equal(s.turn, 'bot'); assert.equal(s.hp.bot, 2);
  assert.throws(() => engine.shoot(s, 'player', 'bot', rng), /NOT_YOUR_TURN/);
  // hết đạn thì nạp đợt mới, người cầm súng giữ lượt
  s = fixed([F]); const reload = engine.shoot(s, 'player', 'player', rng);
  assert(reload.reloaded && s.loads === 2 && s.chamber.length >= 4 && s.turn === 'player');
  // Cưa: đạn thật gây 2 sát thương, kể cả tự bắn; đạn lép thì mất tác dụng
  s = fixed([T, F, T]); engine.applyItem(s, 'player', 'saw'); engine.shoot(s, 'player', 'bot', rng); assert.equal(s.hp.bot, 1); assert.equal(s.saw, false);
  s = fixed([F, T]); engine.applyItem(s, 'player', 'saw'); engine.shoot(s, 'player', 'bot', rng); assert.equal(s.saw, false, 'cưa bị tiêu dù đạn lép');
  s = fixed([T, F]); engine.applyItem(s, 'player', 'saw'); engine.shoot(s, 'player', 'player', rng); assert.equal(s.hp.player, 1, 'tự bắn khi đã cưa mất 2 máu');
  // Bia Đỡ Đạn: chặn 1 sát thương khi đối phương bắn trúng, không chặn khi tự bắn
  s = fixed([F, T, F]); engine.applyItem(s, 'player', 'shield'); engine.shoot(s, 'player', 'bot', rng);
  const blocked = engine.shoot(s, 'bot', 'player', rng); assert.equal(blocked.blocked, 1); assert.equal(s.hp.player, 3); assert.equal(s.shield.player, false);
  s = fixed([T, F]); engine.applyItem(s, 'player', 'shield'); engine.shoot(s, 'player', 'player', rng); assert.equal(s.hp.player, 2); assert.equal(s.shield.player, true);
  s = fixed([T, F, T]); s.saw = true; s.turn = 'bot'; s.shield.player = true; engine.shoot(s, 'bot', 'player', rng); assert.equal(s.hp.player, 2, 'cưa + bia: trúng 2, chặn 1');
  // Còng: bắn ai cũng vậy, lần súng lẽ ra sang tay Bot thì quay lại tay mình
  s = fixed([F, T, F]); engine.applyItem(s, 'player', 'cuffs'); const cuffShot = engine.shoot(s, 'player', 'bot', rng);
  assert(cuffShot.cuffSkip); assert.equal(s.turn, 'player'); assert.equal(s.cuffed, null);
  s = fixed([T, F, F]); engine.applyItem(s, 'player', 'cuffs'); engine.shoot(s, 'player', 'player', rng); assert.equal(s.turn, 'player', 'tự bắn thật khi đã còng vẫn giữ súng');
  s = fixed([F, F, T]); engine.applyItem(s, 'player', 'cuffs'); engine.shoot(s, 'player', 'player', rng); assert.equal(s.cuffed, 'bot', 'tự bắn lép: còng vẫn chờ lần chuyển lượt');
  assert.throws(() => engine.applyItem(s, 'player', 'cuffs'), /ITEM_UNAVAILABLE/);
  // Kính lúp chỉ xem, không đổi viên đạn
  s = fixed([T, F]); assert.deepEqual(engine.applyItem(s, 'player', 'magnifier'), { key: 'magnifier', live: true }); assert.deepEqual(s.chamber, [T, F]);
  // chết là kết thúc ván
  s = fixed([T, F]); s.hp.bot = 1; engine.shoot(s, 'player', 'bot', rng); assert.equal(s.status, 'won');
  s = fixed([T, F]); s.hp.player = 1; engine.shoot(s, 'player', 'player', rng); assert.equal(s.status, 'lost');

  // 3) Bot: không nhìn nòng, chọn nước tối ưu từ thông tin công khai
  const botSrc = fs.readFileSync(require.resolve('../src/services/coquayEngine'), 'utf8');
  assert(!/chamber\[0\]/.test(botSrc.slice(botSrc.indexOf('function botTarget'), botSrc.indexOf('function bestPlayerTarget'))), 'bot không đọc viên đang lên nòng');
  s = fixed([T, T]); s.turn = 'bot'; assert.equal(engine.botTarget(s, rng), 'player', 'toàn đạn thật thì bắn người chơi');
  s = fixed([F, F]); s.turn = 'bot'; assert.equal(engine.botTarget(s, rng), 'bot', 'toàn đạn lép thì tự bắn để giữ lượt');
  const optimalValue = engine.solve().value(3, 3, 0, 0, 'player', 1);
  const rtp = optimalValue * coquay.PAYOUT_MULTIPLIER;
  assert(optimalValue > 0.5 && optimalValue < 0.6, `người chơi tối ưu thắng ${optimalValue}`);
  assert(coquay.PAYOUT_MULTIPLIER === 2 && rtp > 1.09 && rtp < 1.13, `RTP khi đánh tối ưu (người chơi đi trước) ${rtp}`);
  function play(botPolicy, n = 20000) {
    let wins = 0;
    for (let i = 0; i < n; i += 1) {
      const g = engine.createState(1); engine.loadChamber(g, rng);
      while (g.status === 'playing') engine.shoot(g, g.turn, g.turn === 'bot' ? botPolicy(g) : 'bot', rng);
      if (g.status === 'won') wins += 1;
    }
    return wins / n;
  }
  const naive = g => { const { live, total } = engine.remaining(g); return live * 2 >= total ? 'player' : 'bot'; };
  const vsSmart = play(g => engine.botTarget(g, rng)); const vsNaive = play(naive);
  assert(vsSmart < vsNaive - 0.08, `bot tối ưu phải khó hơn bot ngây thơ (${vsSmart} vs ${vsNaive})`);

  // 4) Service: cược, thắng/thua, vật phẩm
  const guild = 'coquay-guild'; noDrops(guild);
  const setState = (sessionId, patch) => {
    const row = db.prepare('SELECT state_json FROM coquay_sessions WHERE id=?').get(sessionId);
    db.prepare('UPDATE coquay_sessions SET state_json=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.state_json), ...patch }), sessionId);
  };
  economy.creditCoins({ guildId: guild, userId: 'winner', amount: 100_000, reason: 'test' });
  const win = coquay.startCoquay({ guildId: guild, userId: 'winner', channelId: 'c', stake: 50_000 });
  assert.equal(balance(guild, 'winner'), START + 100_000 - 50_000, 'cược một lần ngay từ đầu');
  assert(win.state.lastLoad.live >= 1 && win.state.lastLoad.blank >= 1 && win.state.chamber.length <= 3);
  assert.throws(() => coquay.startCoquay({ guildId: guild, userId: 'winner', channelId: 'c', stake: 100 }), /ACTIVE_SESSION/);
  setState(win.session.id, { chamber: [T, F], hp: { player: 3, bot: 1 } });
  const won = coquay.playCoquay({ sessionId: win.session.id, userId: 'winner', action: 'shoot', arg: 'bot' });
  assert.equal(won.result.outcome, 'win'); assert.equal(won.result.payout, 100_000);
  assert.equal(balance(guild, 'winner'), START + 100_000 - 50_000 + 100_000);
  assert.equal(coquay.getCoquayByUser(guild, 'winner'), null);

  const lose = coquay.startCoquay({ guildId: guild, userId: 'loser', channelId: 'c', stake: 500 });
  setState(lose.session.id, { chamber: [T, F], hp: { player: 1, bot: 3 } });
  const lost = coquay.playCoquay({ sessionId: lose.session.id, userId: 'loser', action: 'shoot', arg: 'self' });
  assert.equal(lost.result.outcome, 'loss'); assert.equal(balance(guild, 'loser'), START - 500);

  // bot tự động đánh sau lượt người chơi và luôn trả súng lại khi tới lượt người chơi
  const auto = coquay.startCoquay({ guildId: guild, userId: 'auto', channelId: 'c', stake: 100 });
  setState(auto.session.id, { chamber: [F, T, T, T, F] });
  const afterShot = coquay.playCoquay({ sessionId: auto.session.id, userId: 'auto', action: 'shoot', arg: 'bot' });
  assert(afterShot.lines.length >= 2 && /Bot/.test(afterShot.lines[1]), 'bot hành động ngay sau người chơi');
  assert(afterShot.result || afterShot.state.turn === 'player');
  if (!afterShot.result) coquay.playCoquay({ sessionId: auto.session.id, userId: 'auto', action: 'forfeit' });
  assert.equal(coquay.getCoquayByUser(guild, 'auto'), null, 'bỏ cuộc kết thúc ván');

  // vật phẩm: phải sở hữu, chỉ trừ khi dùng, mỗi loại 1 lần/ván
  const itemGame = coquay.startCoquay({ guildId: guild, userId: 'itemer', channelId: 'c', stake: 100 });
  setState(itemGame.session.id, { chamber: [T, F, F, T, F] });
  assert.throws(() => coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'item', arg: 'magnifier' }), /ITEM_NOT_OWNED/);
  for (const item of Object.values(coquay.ITEMS)) addInventory(guild, 'itemer', item.itemId, 2);
  const peek = coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'item', arg: 'magnifier' });
  assert.equal(peek.reveal, true); assert.equal(getInventoryQuantity(guild, 'itemer', 'coquay_magnifier'), 1);
  assert.throws(() => coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'item', arg: 'magnifier' }), /ITEM_USED|ITEM_UNAVAILABLE/);
  assert.equal(getInventoryQuantity(guild, 'itemer', 'coquay_magnifier'), 1, 'lỗi thì không trừ vật phẩm');
  coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'item', arg: 'saw' });
  coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'item', arg: 'cuffs' });
  const sawShot = coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'shoot', arg: 'bot' });
  assert.equal(sawShot.state.hp.bot, 1, 'cưa gây 2 sát thương'); assert.equal(sawShot.state.turn, 'player', 'còng giữ súng'); assert.equal(sawShot.lines.length, 1, 'bot bị còng không hành động');
  const rows = coquay.coquayRows(itemGame.session.id, sawShot.state, 'itemer', guild).map(row => row.toJSON());
  const itemButtons = rows[1].components; assert.equal(itemButtons.length, 4);
  assert.equal(itemButtons.find(button => button.custom_id.endsWith(':saw')).disabled, true, 'đã dùng cưa thì nút bị khóa');
  assert.equal(itemButtons.find(button => button.custom_id.endsWith(':shield')).disabled, false);
  assert.throws(() => coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'someone', action: 'shoot', arg: 'bot' }), /INVALID_SESSION/);
  // /vatpham sudung không dùng được vật phẩm Cò quay và không trừ
  const { useItem } = require('../src/services/itemEffectService');
  assert.throws(() => useItem({ guildId: guild, userId: 'itemer', channelId: 'c', itemId: 'coquay_decoy' }), /COQUAY_IN_GAME_ITEM/);
  assert.equal(getInventoryQuantity(guild, 'itemer', 'coquay_decoy'), 2);
  coquay.playCoquay({ sessionId: itemGame.session.id, userId: 'itemer', action: 'forfeit' });
  // không có vật phẩm thì không hiện hàng nút vật phẩm
  const bare = coquay.startCoquay({ guildId: guild, userId: 'bare', channelId: 'c', stake: 100 });
  assert.equal(coquay.coquayRows(bare.session.id, bare.state, 'bare', guild).length, 1);
  assert.doesNotThrow(() => coquay.coquayEmbed(bare.state, 'bare', { sessionId: bare.session.id }).toJSON());

  // 5) Hết hạn / quản trị
  const stale = require('../src/services/staleSessionService');
  db.prepare("UPDATE coquay_sessions SET message_id='m', updated_at=? WHERE id=?").run(Date.now() - 60 * 60_000, bare.session.id);
  stale.expireStaleSoloSessionsSync();
  assert.equal(coquay.getCoquayByUser(guild, 'bare'), null); assert.equal(balance(guild, 'bare'), START - 100, 'để quá hạn thì mất cược');
  const admin = coquay.startCoquay({ guildId: guild, userId: 'admin-end', channelId: 'c', stake: 700 });
  assert(coquay.forceEndCoquaySession(admin.session.id, guild, 'admin')); assert.equal(balance(guild, 'admin-end'), START, 'ketthucvan hoàn cược');

  // 6) Lệnh, nút, luật, gacha
  require('../src/services/gameChannelService').setGameChannel(guild, 'coquay', 'c');
  const replies = [];
  const command = require('../src/commands/coquay');
  await command.execute({ guildId: guild, channelId: 'c', user: { id: 'cmd' }, options: { getInteger: () => 200 },
    reply: async payload => { replies.push(payload); return { resource: { message: { id: 'msg-1' } } }; } });
  const cmdSession = coquay.getCoquayByUser(guild, 'cmd');
  assert(cmdSession && cmdSession.message_id === 'msg-1'); assert(replies[0].embeds[0].toJSON().title.includes('CÒ QUAY'));
  const router = require('../src/componentRouter');
  const updates = [];
  await router.routeComponentInteraction({ isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false, guildId: guild, channelId: 'c', user: { id: 'cmd' },
    customId: `coquay:${cmdSession.id}:forfeit`, update: async payload => updates.push(payload), reply: async payload => updates.push(payload), followUp: async () => null });
  assert(updates[0].embeds && coquay.getCoquayByUser(guild, 'cmd') === null, 'nút được định tuyến tới Cò quay');
  const choi = require('../src/commands/choi').data.toJSON();
  const sub = choi.options.find(option => option.name === 'coquay'); assert(sub && sub.options[0].name === 'cuoc');
  assert(require('../src/commands/luat').RULES.coquay[1].includes('giữ lượt'));
  const pool = require('../src/services/gachaPoolService').listGachaPool('x');
  for (const [id, tier] of [['coquay_magnifier', 'SR'], ['coquay_decoy', 'SR'], ['coquay_saw', 'SSR'], ['coquay_cuffs', 'UR']]) assert.equal(pool.find(entry => entry.itemId === id)?.tier, tier);

  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
  console.log(JSON.stringify({ ok: true, coquay: { optimalWin: +optimalValue.toFixed(4), rtp: +rtp.toFixed(4), vsSmartBot: +vsSmart.toFixed(3), vsNaiveBot: +vsNaive.toFixed(3) } }));
})().catch(error => { console.error(error); process.exitCode = 1; });
