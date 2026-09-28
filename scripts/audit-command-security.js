// Diagnostic audit only: all balances and interactions below use an isolated temporary database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebot-audit-'));
process.env.DB_PATH = path.join(directory, 'audit.sqlite');
const { db } = require('../src/db');
const economy = require('../src/services/economyService');
const mines = require('../src/services/minesService');
const levels = require('../src/services/playerLevelService');
const { fairInt } = require('../src/services/fairnessService');
const { setGameConfig } = require('../src/services/gameConfigService');
const results = {};

async function run() {
  const guildId = 'audit';
  setGameConfig(guildId, 'ECONOMY_STARTING_COINS', 0, 'audit');
  for (const key of ['GAME_COIN_DROP_CHANCE', 'GAME_DIAMOND_DROP_CHANCE', 'GAME_GACHA_DROP_CHANCE']) {
    setGameConfig(guildId, key, 0, 'audit');
  }
  const rps = require('../src/services/rpsBotService');
  let winsWithoutStake = 0; let rejected = 0; let collected = 0;
  for (let i = 0; i < 120; i += 1) {
    const round = rps.createRpsBotRound({ guildId, channelId: 'c', userId: 'empty', stake: 100000, choice: 'bua' });
    await rps.handleRpsBotButton({ customId: `rpsbot:${round.id}:confirm`, guildId, channelId: 'c', user: { id: 'empty' },
      update: async () => {}, reply: async () => { rejected += 1; } });
    const balance = economy.getAccount(guildId, 'empty').balance;
    if (balance > 0) {
      winsWithoutStake += 1;
      collected += balance;
      while (economy.getAccount(guildId, 'empty').balance > 0) {
        economy.transferCoins({ guildId, fromUserId: 'empty', toUserId: 'collector', amount: Math.min(100000, economy.getAccount(guildId, 'empty').balance) });
      }
    }
  }
  results.rpsZeroBalance = { attempts: 120, winsWithoutStake, rejected, collected, vulnerable: winsWithoutStake > 0 };
  assert.equal(winsWithoutStake, 0, 'Oẳn tù tì không được trả thắng khi thiếu cược');
  assert.equal(rejected, 120, 'Mọi lượt xác nhận thiếu tiền phải bị từ chối');
  economy.creditCoins({ guildId, userId: 'funded', amount: 100 });
  const paidRound = rps.createRpsBotRound({ guildId, channelId: 'c', userId: 'funded', stake: 100, choice: 'bua' });
  let seed = 0;
  while (fairInt(String(seed), 'rps-bot', 0, 3) !== 1) seed += 1;
  db.prepare('UPDATE rps_bot_rounds SET fair_json=? WHERE id=?')
    .run(JSON.stringify({ serverSeed: String(seed) }), paidRound.id);
  let paidUpdates = 0;
  const paidInteraction = { customId: `rpsbot:${paidRound.id}:confirm`, guildId, channelId: 'c', user: { id: 'funded' },
    update: async () => { paidUpdates += 1; }, reply: async () => { throw new Error('Paid RPS round unexpectedly rejected'); } };
  await rps.handleRpsBotButton(paidInteraction);
  await rps.handleRpsBotButton(paidInteraction);
  assert.equal(economy.getAccount(guildId, 'funded').balance, 200);
  assert.equal(paidUpdates, 2);
  results.rpsFundedWinAndDuplicate = true;

  economy.creditCoins({ guildId, userId: 'farmer', amount: 1000 });
  for (let i = 0; i < 20; i += 1) {
    const round = mines.startMines({ guildId, userId: 'farmer', channelId: 'c', stake: 10, mineCount: 1 });
    mines.playMines({ sessionId: round.session.id, userId: 'farmer', action: 'forfeit' });
  }
  results.forfeitFarm = { rounds: 20, cost: 200, balanceBefore: 1000, balanceAfter: economy.getAccount(guildId, 'farmer').balance,
    level: levels.getPlayerProgression(guildId, 'farmer').level };
  assert.equal(results.forfeitFarm.balanceAfter, 800);
  assert.equal(results.forfeitFarm.level, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM game_history WHERE guild_id=? AND user_id=?").get(guildId, 'farmer').count, 0);

  economy.creditCoins({ guildId, userId: 'stats', amount: 20000 });
  const round = mines.startMines({ guildId, userId: 'stats', channelId: 'c', stake: 10000, mineCount: 1, forcedMines: [19], forcedSpecial: 18 });
  mines.playMines({ sessionId: round.session.id, userId: 'stats', action: 'open', cell: 0 });
  const settled = mines.playMines({ sessionId: round.session.id, userId: 'stats', action: 'cashout' });
  const history = db.prepare('SELECT stake,payout FROM game_history WHERE guild_id=? AND user_id=?').get(guildId, 'stats');
  results.reservedGameStats = { actualStake: 10000, history, experienceAwarded: settled.result.experienceGained,
    expectedExperience: levels.gameExperience('win', history.payout, 10000, guildId) };
  assert.equal(history.stake, 10000);
  assert.equal(settled.result.experienceGained, results.reservedGameStats.expectedExperience);
  assert.throws(() => mines.playMines({ sessionId: round.session.id, userId: 'stats', action: 'cashout' }), /INVALID_SESSION/);
  results.duplicateMinesCashoutBlocked = true;

  results.minesRtp = [1, 3, 7].flatMap(mineCount => [1, 5, 10].filter(opened => opened <= 20 - mineCount).map(opened => {
    const survival = mines.combination(20 - opened, mineCount) / mines.combination(20, mineCount);
    const specialChance = opened / (20 - mineCount);
    const state = { stake: 1000, mineCount, opened: Array(opened).fill(0), specialFound: false };
    const ordinary = mines.payoutFor(state);
    const special = mines.payoutFor({ ...state, specialFound: true });
    return { mineCount, opened, rtpPercent: +(100 * survival * ((1-specialChance)*ordinary + specialChance*special)/1000).toFixed(3) };
  }));
  assert(results.minesRtp.every(row => row.rtpPercent <= 100), 'Mines có chiến thuật rút cố định sinh xu');

  // Exercise the public wrappers with name-sensitive option resolution.
  const choices = [];
  await require('../src/commands/quantri').autocomplete({ guildId, options: {
    getSubcommand: () => 'themvatpham', getFocused: full => full ? { name: 'hieuung', value: 'quiz_hint' } : 'quiz_hint',
  }, respond: async values => choices.push(...values) });
  results.adminEffectAutocomplete = { query: 'quiz_hint', choices: choices.length,
    expectedChoices: require('../src/services/itemCatalogService').listCatalog({ shopEligible: true }).filter(item => item.effect === 'quiz_hint').length };
  assert.equal(choices.length, results.adminEffectAutocomplete.expectedChoices);
  const { remapOptions } = require('../src/utils/commandAlias');
  const mapped = remapOptions({ options: { getFocused: () => ({ name: 'hieuung', value: '' }) } }, { optionNames: { effect: 'hieuung' } });
  results.focusedOptionName = { expected: 'effect', actual: mapped.options.getFocused(true).name };
  assert.equal(results.focusedOptionName.actual, 'effect');

  let deny;
  await require('../src/commands/quantri').execute({ guildId, user: { id: 'outsider' }, memberPermissions: { has: () => false },
    options: { getSubcommand: () => 'datcauhinh' }, reply: async payload => { deny = payload.content; } });
  assert.match(deny, /Chỉ admin/);
  results.nonAdminConfigBlocked = true;
  console.log(JSON.stringify({ temporaryDatabase: process.env.DB_PATH, results }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
