const crypto = require('node:crypto');
const { db } = require('../db');
const { getGamesByChannel, channelHasGame } = require('./gameChannelService');
const games = require('./funGameService');
const mines = require('./minesService');
const { getCatalogItem } = require('./itemCatalogService');
const { consumeInventory, getInventoryQuantity, equipOwnedCosmetic } = require('./shopService');
const { getActiveEffect, addEffectCharge, consumeActiveEffect } = require('./effectStateService');
const { formatCoins } = require('../utils/economy');
const { bonusDropText } = require('../utils/progressionView');

const EFFECT_TTL = 7 * 86_400_000;

function activateEffect(guildId, userId, itemId, effectId, { expiresAt = Date.now() + EFFECT_TTL, metadata = {} } = {}) {
  return db.transaction(() => {
    if (getActiveEffect(guildId, userId, effectId)) throw new Error('EFFECT_ALREADY_ACTIVE');
    consumeInventory(guildId, userId, itemId, 1);
    return addEffectCharge(guildId, userId, effectId, { expiresAt, charges: 1, metadata });
  })();
}

function activeSharedRound(guildId, channelId, game) {
  return db.prepare("SELECT * FROM multiplayer_rounds WHERE guild_id=? AND channel_id=? AND game=? AND status='open' AND closes_at>? ORDER BY created_at DESC LIMIT 1")
    .get(String(guildId), String(channelId), game, Date.now()) || null;
}

function storedRoundResult(round) {
  try { return JSON.parse(round.result_json || '{}'); } catch { return {}; }
}

function useBaucuaMagnifier(guildId, channelId) {
  const round = activeSharedRound(guildId, channelId, 'baucua');
  if (!round) throw new Error('NO_ACTIVE_SHARED_ROUND');
  const stored = storedRoundResult(round);
  const service = require('./multiplayerGameService');
  const result = service.rollResult('baucua', null, stored.fair?.serverSeed);
  const absent = Object.keys(service.BAUCUA).filter(symbol => !result.symbols.includes(symbol)).slice(0, 2);
  return { round, message: `🔎 Hai linh vật chắc chắn **không xuất hiện** trong ván \`${round.id}\`: ${absent.map(key => `${service.BAUCUA[key][0]} **${service.BAUCUA[key][1]}**`).join(' · ')}` };
}

function useMagneticDice(guildId, channelId) {
  const round = activeSharedRound(guildId, channelId, 'taixiu');
  if (!round) throw new Error('NO_ACTIVE_SHARED_ROUND');
  const stored = storedRoundResult(round);
  if (stored.modifiers?.noTriple) throw new Error('ROUND_EFFECT_ACTIVE');
  stored.modifiers = { ...(stored.modifiers || {}), noTriple: true };
  db.prepare('UPDATE multiplayer_rounds SET result_json=? WHERE id=?').run(JSON.stringify(stored), round.id);
  return { round, message: `🧲 Ván Tài xỉu \`${round.id}\` đã loại bỏ hoàn toàn khả năng ra **Bộ ba**.` };
}

function useDivineEye(guildId, userId, channelId, itemId) {
  const supportedGames = getGamesByChannel(guildId, channelId).map(row => row.game).filter(game => ['baucua', 'taixiu'].includes(game));
  if (!supportedGames.length) throw new Error('WRONG_EFFECT_CHANNEL');
  const round = supportedGames.map(game => activeSharedRound(guildId, channelId, game)).filter(Boolean)
    .sort((left, right) => right.created_at - left.created_at)[0];
  if (!round) throw new Error('NO_ACTIVE_SHARED_ROUND');
  const stored = storedRoundResult(round); const service = require('./multiplayerGameService');
  const result = service.rollResult(round.game, null, stored.fair?.serverSeed, stored.modifiers);
  const revealed = round.game === 'baucua'
    ? `${service.BAUCUA[result.symbols[0]][0]} **${service.BAUCUA[result.symbols[0]][1]}**`
    : `mặt **${result.dice[0]}**`;
  activateEffect(guildId, userId, itemId, 'dice_divine_eye', { expiresAt: round.closes_at + 60_000, metadata: { roundId: round.id, game: round.game } });
  return `👁️ Mắt Thần tiết lộ ${revealed} chắc chắn xuất hiện trong ván \`${round.id}\`. Ván này áp dụng giới hạn cược Mắt Thần.`;
}

function useMinesRadar(guildId, userId, channelId) {
  const session = mines.getMinesByUser(guildId, userId);
  if (!session || session.channel_id !== String(channelId)) throw new Error('NO_ACTIVE_MINES');
  const state = JSON.parse(session.state_json);
  if (state.blastShield && !state.shieldUsed) throw new Error('HIGHER_EFFECT_ACTIVE');
  const centers = Array.from({ length: mines.CELL_COUNT }, (_, index) => index).filter(index => !state.opened.includes(index));
  if (!centers.length) throw new Error('NO_RADAR_AREA');
  const center = centers[crypto.randomInt(centers.length)]; const row = Math.floor(center / 5); const column = center % 5;
  const cells = [];
  for (let r = Math.max(0, row - 1); r <= Math.min(3, row + 1); r += 1) {
    for (let c = Math.max(0, column - 1); c <= Math.min(4, column + 1); c += 1) cells.push(r * 5 + c);
  }
  const mineCount = cells.filter(cell => state.mines.includes(cell)).length;
  return `📡 Radar quét vùng quanh **ô ${center + 1}** (${cells.map(cell => cell + 1).join(', ')}) và phát hiện chính xác **${mineCount} mìn**.`;
}

function useLivingDictionary(guildId, channelId, userId) {
  if (!channelHasGame(guildId, channelId, 'vuatiengviet')) throw new Error('WRONG_EFFECT_CHANNEL');
  const session = games.getVuaSession(guildId);
  if (!session) throw new Error('NO_ACTIVE_GAME');
  if (!session.question.hard) throw new Error('HARD_QUESTION_REQUIRED');
  if (games.isExpiredChallenge(session.question)) throw new Error('QUESTION_EXPIRED');
  const answer = session.question.answer;
  const result = games.answerVuaSession(guildId, answer);
  const reward = require('./gameRewardService').getGameReward(guildId, 'vuatiengviet') * 10;
  const account = require('./economyService').rewardGame({ guildId, userId, amount: reward, game: 'vuatiengviet', outcome: 'win' });
  const bonus = bonusDropText(account.bonusDrops);
  return `📖 Từ Điển Sống điền đáp án **${answer}** và trao **${formatCoins(reward)} xu**.${bonus ? `\n🎊 Drop sau ván: ${bonus.replace(/\n/g, ' · ')}` : ''}\n\nCâu tiếp theo:\n${games.vuaQuestionText(result.nextQuestion)}`;
}

function useVietnameseHint(guildId, channelId, effect) {
  if (!channelHasGame(guildId, channelId, 'vuatiengviet')) throw new Error('WRONG_EFFECT_CHANNEL');
  const session = games.getVuaSession(guildId);
  if (!session) throw new Error('NO_ACTIVE_GAME');
  if (games.isExpiredChallenge(session.question)) throw new Error('QUESTION_EXPIRED');
  const syllables = String(session.question.answer).trim().split(/\s+/u);
  if (effect === 'quiz_first_word') return `🔎 Gợi ý riêng cho bạn: tiếng đầu tiên trong đáp án là **${syllables[0]}**.`;
  const lengths = syllables.map(word => Array.from(word).length);
  return `🔢 Gợi ý riêng cho bạn: số chữ cái mỗi tiếng là **[${lengths.join('] [')}]**.`;
}

function armedMessage(item) {
  const messages = {
    blackjack_redraw: '🃏 Thẻ Rút Lại đã sẵn sàng cho ván Xì dách kế tiếp.',
    blackjack_swap: '🃏 Lệnh Bài Đổi Trắng đã sẵn sàng cho ván Xì dách kế tiếp.',
    blackjack_first_ace: '🅰️ Át Chủ Bài đã sẵn sàng cho ván Xì dách kế tiếp.',
    horse_second_insurance: '🏇 Bảo Hiểm Về Nhì đã sẵn sàng cho cuộc đua kế tiếp.',
    horse_jackpot: '🏇 Trúng Đậm đã sẵn sàng cho cuộc đua kế tiếp.',
    rps_counter: '✊ Bùa Khắc Chế đã sẵn sàng cho ván Oẳn tù tì với bot kế tiếp.',
    rps_draw_win: '✊ Đặc Quyền Kẻ Hèn đã sẵn sàng cho ván Oẳn tù tì với bot kế tiếp.',
    mines_blast_shield: '💣 Giáp Chống Nổ đã sẵn sàng cho ván Mines kế tiếp.',
    poker_insurance: '♠️ Bảo Hiểm Cược đã sẵn sàng cho ván Poker kế tiếp.',
    chinchiro_soundproof_bowl: '🍚 Bát Cách Âm đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_weighted_dice: '🎲 Xúc Xắc Chì đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_otsuki_dice: '🎲 Xúc Xắc Của Quản Đốc đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_karma: '🪬 Bùa Trả Đũa đã sẵn sàng và chỉ tiêu khi bạn ra Hifumi.',
  };
  return messages[item.effect];
}

function useItem({ guildId, userId, channelId, itemId }) {
  const item = getCatalogItem(itemId);
  if (!item || getInventoryQuantity(guildId, userId, itemId) < 1) throw new Error('ITEM_NOT_OWNED');
  if (item.type === 'gacha') throw new Error('ITEM_NOT_USABLE');
  if (item.type === 'color') { equipOwnedCosmetic(guildId, userId, item.id); const icon = item.emoji || '🎨'; return { item, message: `${icon} Đã trang bị **${item.name}**. Dùng \`/hoso\` để xem.`, ephemeral: true }; }
  if (item.effect === 'baucua_magnifier') { const result = useBaucuaMagnifier(guildId, channelId); consumeInventory(guildId, userId, item.id); return { item, message: result.message, ephemeral: true }; }
  if (item.effect === 'taixiu_no_triple') { const result = db.transaction(() => { const value = useMagneticDice(guildId, channelId); consumeInventory(guildId, userId, item.id); return value; })(); return { item, message: result.message }; }
  if (item.effect === 'dice_divine_eye') return { item, message: useDivineEye(guildId, userId, channelId, item.id), ephemeral: true };
  if (item.effect === 'mines_radar') { const message = useMinesRadar(guildId, userId, channelId); consumeInventory(guildId, userId, item.id); return { item, message, ephemeral: true }; }
  if (item.effect === 'quiz_living_dictionary') { const message = useLivingDictionary(guildId, channelId, userId); consumeInventory(guildId, userId, item.id); return { item, message }; }
  if (item.effect === 'quiz_first_word' || item.effect === 'quiz_syllable_lengths') {
    const message = useVietnameseHint(guildId, channelId, item.effect);
    consumeInventory(guildId, userId, item.id);
    return { item, message, ephemeral: true };
  }
  const message = armedMessage(item);
  if (message) { activateEffect(guildId, userId, item.id, item.effect); return { item, message }; }
  throw new Error('ITEM_NOT_USABLE');
}

module.exports = { getActiveEffect, activateEffect, consumeActiveEffect, useItem, useBaucuaMagnifier, useMagneticDice, useMinesRadar, useVietnameseHint };
