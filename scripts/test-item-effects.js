const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.resolve(__dirname, '../data/test-item-effects.sqlite');
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require('../src/db');
const catalog = require('../src/services/itemCatalogService');
const pool = require('../src/services/gachaPoolService');
const gacha = require('../src/services/gachaService');
const effects = require('../src/services/effectStateService');
const shop = require('../src/services/shopService');
const economy = require('../src/services/economyService');
const itemEffects = require('../src/services/itemEffectService');
const { itemGames } = require('../src/services/itemGameService');
const channels = require('../src/services/gameChannelService');
const multiplayer = require('../src/services/multiplayerGameService');
const { createFairness } = require('../src/services/fairnessService');

const NEW_ITEMS = {
  vietnamese_first_letter: 'R', vietnamese_word_count: 'R', vietnamese_extra_time: 'SSR',
  mines_row_scanner: 'R', mines_column_scanner: 'R', baucua_small_lens: 'R', taixiu_total_scope: 'R',
  taixiu_edge_insurance: 'SR', baucua_blank_insurance: 'SSR', horse_consolation: 'R', rps_loss_shield: 'R',
  blackjack_bust_guard: 'R', poker_fold_coupon: 'R', effect_cleanser: 'SSR',
};
const fund = (guildId, userId, amount = 100_000) => economy.creditCoins({ guildId, userId, amount, reason: 'test-fund' });
const giveAndUse = (guildId, userId, channelId, itemId) => {
  shop.addInventory(guildId, userId, itemId, 1);
  return itemEffects.useItem({ guildId, userId, channelId, itemId });
};

// Catalog, pool and game filters
const poolEntries = pool.listGachaPool('catalog-guild');
for (const [id, rarity] of Object.entries(NEW_ITEMS)) {
  const item = catalog.getCatalogItem(id);
  assert(item, `thiếu item ${id}`);
  assert.equal(item.rarity, rarity, `sai bậc ${id}`);
  assert(item.emoji, `thiếu emoji ${id}`);
  assert(itemGames(item) || item.effect === 'remove_active_game_effect', `thiếu game ${id}`);
  const entry = poolEntries.find(row => row.itemId === id);
  assert(entry, `thiếu pool ${id}`);
  assert.equal(entry.tier, rarity, `sai bậc pool ${id}`);
}
assert(poolEntries.filter(row => row.kind === 'item').every(row => catalog.getCatalogItem(row.itemId)));
assert.equal(catalog.getCatalogItem(gacha.TICKETS[1]).tradeable, false);
assert.equal(catalog.getCatalogItem(gacha.TICKETS[10]).tradeable, false);
assert.equal(catalog.getCatalogItem(gacha.TICKETS[10]).shopEligible, false);

// Vé Gacha x10: ít nhất một SSR và nhân đôi trọng số UR
const base = pool.listGachaPool('ticket-guild').find(row => row.tier === 'UR' && row.kind === 'item');
const boosted = pool.listGachaPool('ticket-guild', { tierMultipliers: { UR: 2 } }).find(row => row.rewardKey === base.rewardKey);
assert.equal(boosted.effectiveWeight, base.effectiveWeight * 2);
shop.addInventory('ticket-guild', 'alice', gacha.TICKETS[10], 1);
const ticketPull = gacha.pullGacha({ guildId: 'ticket-guild', userId: 'alice', pulls: 10, rolls: Array(10).fill(0) });
assert.equal(ticketPull.paymentType, gacha.TICKETS[10]);
assert(ticketPull.results.some(result => result.kind === 'item' && ['SSR', 'UR'].includes(result.tier)));

// Vua tiếng Việt
const vuaGuild = 'vua-item-guild'; const vuaChannel = 'vua-channel';
channels.setGameChannel(vuaGuild, 'vuatiengviet', vuaChannel);
const fun = require('../src/services/funGameService');
const vua = fun.startVuaSession(vuaGuild, { forceHard: true });
const syllables = vua.question.answer.trim().split(/\s+/u);
const letter = giveAndUse(vuaGuild, 'alice', vuaChannel, 'vietnamese_first_letter');
assert(letter.ephemeral && letter.message.includes(Array.from(syllables[0])[0].toLocaleUpperCase('vi-VN')));
assert(giveAndUse(vuaGuild, 'alice', vuaChannel, 'vietnamese_word_count').message.includes(`**${syllables.length} tiếng**`));
const expiryBefore = fun.getVuaSession(vuaGuild).question.expiresAt;
const extra = giveAndUse(vuaGuild, 'alice', vuaChannel, 'vietnamese_extra_time');
assert.equal(fun.getVuaSession(vuaGuild).question.expiresAt, expiryBefore + 15_000);
assert(extra.message.includes('15 giây'));
shop.addInventory(vuaGuild, 'alice', 'vietnamese_extra_time', 1);
assert.throws(() => itemEffects.useItem({ guildId: vuaGuild, userId: 'alice', channelId: vuaChannel, itemId: 'vietnamese_extra_time' }), /ALREADY_EXTENDED/);
assert.equal(shop.getInventoryQuantity(vuaGuild, 'alice', 'vietnamese_extra_time'), 1);
fun.startVuaSession(vuaGuild, { forceHard: false });
assert.throws(() => itemEffects.useItem({ guildId: vuaGuild, userId: 'alice', channelId: vuaChannel, itemId: 'vietnamese_extra_time' }), /HARD_QUESTION_REQUIRED/);
fun.endVuaSession(vuaGuild);

// Mines
const mines = require('../src/services/minesService');
const minesGuild = 'mines-item-guild'; const minesChannel = 'mines-channel';
fund(minesGuild, 'alice');
const minesGame = mines.startMines({ guildId: minesGuild, channelId: minesChannel, userId: 'alice', stake: 10, mineCount: 3, forcedMines: [0, 1, 7], forcedSpecial: 19 });
const rowMessages = new Set(); const columnMessages = new Set();
for (let index = 0; index < 60; index += 1) {
  rowMessages.add(giveAndUse(minesGuild, 'alice', minesChannel, 'mines_row_scanner').message);
  columnMessages.add(giveAndUse(minesGuild, 'alice', minesChannel, 'mines_column_scanner').message);
}
const expectedRow = { 1: 2, 2: 1, 3: 0, 4: 0 }; const expectedColumn = { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0 };
for (const message of rowMessages) { const [, line, count] = message.match(/Hàng \*\*(\d)\*\*.*\*\*(\d) mìn\*\*/); assert.equal(Number(count), expectedRow[line], message); }
for (const message of columnMessages) { const [, line, count] = message.match(/Cột \*\*(\d)\*\*.*\*\*(\d) mìn\*\*/); assert.equal(Number(count), expectedColumn[line], message); }
mines.playMines({ sessionId: minesGame.session.id, userId: 'alice', action: 'forfeit' });
assert.throws(() => giveAndUse(minesGuild, 'alice', minesChannel, 'mines_row_scanner'), /NO_ACTIVE_MINES/);

// Bầu cua và Tài xỉu: thông tin
function openRound(guildId, channelId, game) {
  const round = { id: crypto.randomBytes(4).toString('hex'), guild_id: guildId, game, channel_id: channelId, closes_at: Date.now() - 1_000 };
  const fair = createFairness();
  db.prepare("INSERT INTO multiplayer_rounds (id,guild_id,game,channel_id,message_id,status,closes_at,result_json,created_at) VALUES (?,?,?,?,NULL,'open',?,?,?)")
    .run(round.id, guildId, game, channelId, Date.now() + 60_000, JSON.stringify({ fair: { serverSeed: fair.serverSeed, commitment: fair.commitment } }), Date.now());
  return { ...round, fair };
}
function addBet(guildId, roundId, userId, choice, amount) {
  fund(guildId, userId, amount);
  economy.spendCoins({ guildId, userId, amount, reason: 'test-bet' });
  db.prepare('INSERT INTO multiplayer_bets (round_id,user_id,choice,amount,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(roundId, userId, choice, amount, Date.now(), Date.now());
}
const sharedGuild = 'shared-item-guild'; const sharedChannel = 'shared-channel';
const baucuaRound = openRound(sharedGuild, sharedChannel, 'baucua');
const lens = giveAndUse(sharedGuild, 'alice', sharedChannel, 'baucua_small_lens');
const lensSymbol = Object.entries(multiplayer.BAUCUA).find(([, [emoji, name]]) => lens.message.includes(`${emoji} **${name}**`));
assert(lensSymbol, lens.message);
assert(!multiplayer.rollResult('baucua', null, baucuaRound.fair.serverSeed).symbols.includes(lensSymbol[0]));
db.prepare("UPDATE multiplayer_rounds SET status='closed' WHERE id=?").run(baucuaRound.id);

const taixiuRound = openRound(sharedGuild, sharedChannel, 'taixiu');
const scope = giveAndUse(sharedGuild, 'alice', sharedChannel, 'taixiu_total_scope');
const total = multiplayer.rollResult('taixiu', null, taixiuRound.fair.serverSeed).total;
const [, low, high] = scope.message.match(/\*\*(\d+)–(\d+)\*\*/);
assert(total >= Number(low) && total <= Number(high));
shop.addInventory(sharedGuild, 'alice', 'taixiu_magnetic_dice', 1);
assert.throws(() => itemEffects.useItem({ guildId: sharedGuild, userId: 'alice', channelId: sharedChannel, itemId: 'taixiu_magnetic_dice' }), /ROUND_EFFECT_ACTIVE/);
assert.equal(shop.getInventoryQuantity(sharedGuild, 'alice', 'taixiu_magnetic_dice'), 1);
db.prepare("UPDATE multiplayer_rounds SET status='closed' WHERE id=?").run(taixiuRound.id);

// Bảo hiểm Bầu cua
(async () => {
  const blankGuild = 'blank-insurance-guild';
  const blankRound = openRound(blankGuild, 'c', 'baucua');
  const blankSymbols = multiplayer.rollResult('baucua', null, blankRound.fair.serverSeed).symbols;
  const missing = Object.keys(multiplayer.BAUCUA).find(symbol => !blankSymbols.includes(symbol));
  addBet(blankGuild, blankRound.id, 'alice', missing, 1000);
  effects.addEffectCharge(blankGuild, 'alice', 'baucua_blank_insurance');
  const blankBefore = economy.getAccount(blankGuild, 'alice').balance;
  const blankSettled = await multiplayer.settleRound(blankRound.id, null);
  assert.equal(blankSettled.settlements[0].insurance, 350);
  assert.equal(economy.getAccount(blankGuild, 'alice').balance, blankBefore + 350);
  assert.equal(effects.getActiveEffect(blankGuild, 'alice', 'baucua_blank_insurance'), null);
  assert.match(multiplayer.resultEmbed(blankSettled).toJSON().fields[0].value, /Bảo hiểm hoàn \*\*35%\*\*/);

  const winRound = openRound(blankGuild, 'c', 'baucua');
  const winSymbol = multiplayer.rollResult('baucua', null, winRound.fair.serverSeed).symbols[0];
  addBet(blankGuild, winRound.id, 'bob', winSymbol, 1000);
  effects.addEffectCharge(blankGuild, 'bob', 'baucua_blank_insurance');
  const winSettled = await multiplayer.settleRound(winRound.id, null);
  assert.equal(winSettled.settlements[0].insurance, 0);
  assert.equal(effects.getActiveEffect(blankGuild, 'bob', 'baucua_blank_insurance').charges, 1);

  // Bảo hiểm Sát Nút
  const edgeGuild = 'edge-insurance-guild';
  let edgeTriggered = false; let edgeUntouched = false;
  for (let attempt = 0; attempt < 400 && !(edgeTriggered && edgeUntouched); attempt += 1) {
    const round = openRound(edgeGuild, 'c', 'taixiu');
    const roll = multiplayer.rollResult('taixiu', null, round.fair.serverSeed);
    const user = `edge-${attempt}`;
    effects.addEffectCharge(edgeGuild, user, 'taixiu_edge_insurance');
    if (roll.total === 10) { addBet(edgeGuild, round.id, user, 'tai', 1000); addBet(edgeGuild, round.id, user, 'chan', 200); }
    else if (roll.total === 11) { addBet(edgeGuild, round.id, user, 'xiu', 1000); }
    else addBet(edgeGuild, round.id, user, roll.total >= 11 ? 'xiu' : 'tai', 1000);
    const settled = await multiplayer.settleRound(round.id, null);
    const own = settled.settlements[0];
    if (roll.total === 10 || roll.total === 11) {
      assert.equal(own.insurance, 500);
      assert.equal(effects.getActiveEffect(edgeGuild, user, 'taixiu_edge_insurance'), null);
      edgeTriggered = true;
    } else {
      assert.equal(own.insurance, 0);
      assert.equal(effects.getActiveEffect(edgeGuild, user, 'taixiu_edge_insurance').charges, 1);
      edgeUntouched = true;
    }
  }
  assert(edgeTriggered && edgeUntouched, 'không gặp đủ tổng 10/11 để kiểm tra bảo hiểm sát nút');

  // Đua ngựa: Vé Khán Đài
  const horse = require('../src/services/horseRaceService');
  const horseRepo = require('../src/services/horseRaceRepository');
  const horseGuild = 'horse-item-guild';
  async function runRace(userId, armed) {
    const market = horse.generateRaceMarket(Date.now(), { forceSpecial: false });
    const fair = createFairness();
    const id = crypto.randomBytes(4).toString('hex');
    horseRepo.createRound({ id, guild_id: horseGuild, channel_id: 'c', status: 'open', closes_at: Date.now() - 1, created_at: Date.now() }, { market, fair });
    fund(horseGuild, userId);
    for (const key of market.selected) { economy.spendCoins({ guildId: horseGuild, userId, amount: 100, reason: 'test-horse' }); horseRepo.addBet(id, userId, key, 100); }
    for (const effectId of armed) effects.addEffectCharge(horseGuild, userId, effectId);
    const settled = await horse.settleHorseRace(id, null, { error() {}, warn() {}, info() {} }, market.selected[0]);
    return settled.settlements.find(row => row.userId === userId);
  }
  const consolationResult = await runRace('carol', ['horse_consolation']);
  assert.equal(consolationResult.consolation, 20);
  assert.equal(effects.getActiveEffect(horseGuild, 'carol', 'horse_consolation'), null);
  const stackedResult = await runRace('dave', ['horse_consolation', 'horse_jackpot']);
  assert.equal(stackedResult.consolation, 0);
  assert(stackedResult.jackpot > 0);
  assert.equal(effects.getActiveEffect(horseGuild, 'dave', 'horse_consolation').charges, 1);
  const untriggered = await runRace('erin', []);
  assert.equal(untriggered.consolation, 0);

  // Oẳn tù tì: Bùa Giảm Đau
  const rps = require('../src/services/rpsBotService');
  const rpsGuild = 'rps-item-guild';
  fund(rpsGuild, 'alice', 1_000_000);
  effects.addEffectCharge(rpsGuild, 'alice', 'rps_loss_shield');
  let rpsChecked = false; let rpsKeptOnWin = false;
  for (let attempt = 0; attempt < 80 && !rpsChecked; attempt += 1) {
    const round = rps.createRpsBotRound({ guildId: rpsGuild, channelId: 'c', userId: 'alice', stake: 100, choice: 'bua' });
    await rps.handleRpsBotButton({ customId: `rpsbot:${round.id}:confirm`, user: { id: 'alice' }, update: async () => {}, reply: async () => {} });
    const stored = JSON.parse(db.prepare('SELECT result_json FROM rps_bot_rounds WHERE id=?').get(round.id).result_json);
    const armed = effects.getActiveEffect(rpsGuild, 'alice', 'rps_loss_shield');
    if (stored.outcome === 'loss') {
      assert.equal(stored.lossRefund, 20);
      assert.equal(stored.payout, 20);
      assert.equal(armed, null);
      rpsChecked = true;
    } else { assert.equal(stored.lossRefund, 0); assert(armed); rpsKeptOnWin = true; }
  }
  assert(rpsChecked, 'không gặp ván thua Oẳn tù tì để kiểm tra bùa');
  void rpsKeptOnWin;

  // Xì dách: Miếng Đệm Quắc (quắc đúng 22 điểm)
  const blackjack = require('../src/services/blackjackService');
  const bjGuild = 'bj-item-guild';
  fund(bjGuild, 'alice');
  effects.addEffectCharge(bjGuild, 'alice', 'blackjack_bust_guard');
  const bustDeck = ['10♠', '4♦', '2♠', '6♥', 'K♦', '5♣', '10♣'];
  const bjStarted = blackjack.startBlackjack({ guildId: bjGuild, channelId: 'c', userId: 'alice', stake: 100, forcedDeck: bustDeck });
  const bjBefore = economy.getAccount(bjGuild, 'alice').balance;
  const bjResult = blackjack.playAction({ sessionId: bjStarted.session.id, userId: 'alice', action: 'hit' });
  assert.equal(bjResult.result.results[0].score, 22);
  assert.equal(bjResult.result.results[0].payout, 25);
  assert.equal(bjResult.result.outcome, 'loss');
  assert.equal(economy.getAccount(bjGuild, 'alice').balance, bjBefore + 25);
  assert.equal(effects.getActiveEffect(bjGuild, 'alice', 'blackjack_bust_guard'), null);
  effects.addEffectCharge(bjGuild, 'bob', 'blackjack_bust_guard'); fund(bjGuild, 'bob');
  const farBust = blackjack.startBlackjack({ guildId: bjGuild, channelId: 'c', userId: 'bob', stake: 100, forcedDeck: ['10♠', '4♦', '9♠', '6♥', 'K♦', '5♣', '10♣'] });
  const farResult = blackjack.playAction({ sessionId: farBust.session.id, userId: 'bob', action: 'hit' });
  assert(farResult.result.results[0].score > 22);
  assert.equal(farResult.result.results[0].payout, 0);
  assert(effects.getActiveEffect(bjGuild, 'bob', 'blackjack_bust_guard'));

  // Poker: Phiếu Bỏ Bài
  const poker = require('../src/services/pokerService');
  const pokerGuild = 'poker-item-guild';
  fund(pokerGuild, 'alice'); fund(pokerGuild, 'bob');
  effects.addEffectCharge(pokerGuild, 'alice', 'poker_fold_coupon');
  const pokerStart = poker.startPoker({ guildId: pokerGuild, channelId: 'c', userId: 'alice', variant: 'texas' });
  assert.equal(pokerStart.state.foldCoupon, true);
  const pokerFold = poker.playerAction(pokerStart.session.id, 'alice', 'fold');
  assert.equal(pokerFold.result.foldRefund, Math.floor(pokerFold.ante * 0.5));
  assert.equal(effects.getActiveEffect(pokerGuild, 'alice', 'poker_fold_coupon'), null);
  effects.addEffectCharge(pokerGuild, 'bob', 'poker_fold_coupon');
  const pokerRaise = poker.startPoker({ guildId: pokerGuild, channelId: 'c', userId: 'bob', variant: 'texas' });
  const afterRaise = poker.playerAction(pokerRaise.session.id, 'bob', 'raise', 10);
  if (afterRaise.phase === 'betting') {
    const foldLate = poker.playerAction(pokerRaise.session.id, 'bob', 'fold');
    assert.equal(foldLate.result.foldRefund, 0);
    assert(effects.getActiveEffect(pokerGuild, 'bob', 'poker_fold_coupon'));
  }

  // Nước Thanh Tẩy
  const cleanGuild = 'cleanser-guild';
  assert.throws(() => giveAndUse(cleanGuild, 'alice', 'c', 'effect_cleanser'), /NO_EFFECT_TO_REMOVE/);
  assert.equal(shop.getInventoryQuantity(cleanGuild, 'alice', 'effect_cleanser'), 1);
  giveAndUse(cleanGuild, 'alice', 'c', 'rps_counter_charm');
  assert(effects.getActiveEffect(cleanGuild, 'alice', 'rps_counter'));
  const cleansed = itemEffects.useItem({ guildId: cleanGuild, userId: 'alice', channelId: 'c', itemId: 'effect_cleanser' });
  assert(cleansed.message.includes('Bùa Khắc Chế'));
  assert.equal(effects.getActiveEffect(cleanGuild, 'alice', 'rps_counter'), null);
  assert.equal(shop.getInventoryQuantity(cleanGuild, 'alice', 'effect_cleanser'), 0);
  effects.addEffectCharge(cleanGuild, 'alice', 'dice_divine_eye', { metadata: { roundId: 'x' } });
  shop.addInventory(cleanGuild, 'alice', 'effect_cleanser', 1);
  assert.throws(() => itemEffects.useItem({ guildId: cleanGuild, userId: 'alice', channelId: 'c', itemId: 'effect_cleanser' }), /NO_EFFECT_TO_REMOVE/);
  assert(effects.getActiveEffect(cleanGuild, 'alice', 'dice_divine_eye'));

  console.log(JSON.stringify({ ok: true, newItems: Object.keys(NEW_ITEMS).length }));
})().catch(error => { console.error(error); process.exit(1); });
