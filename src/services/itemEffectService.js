const crypto = require('node:crypto');
const { db } = require('../db');
const { channelHasGame } = require('./gameChannelService');
const games = require('./funGameService');
const mines = require('./minesService');
const { getCatalogItem } = require('./itemCatalogService');
const { consumeInventory, getInventoryQuantity, equipOwnedCosmetic } = require('./shopService');
const { getActiveEffect, addEffectCharge, consumeActiveEffect, listActiveEffects, removeActiveEffect } = require('./effectStateService');
const { formatCoins } = require('../utils/economy');
const { resultBlock } = require('../utils/rewardText');

const EFFECT_TTL = 7 * 86_400_000;
const HARD_QUESTION_DIAMONDS = 10;
const SHARED_GAME_EFFECTS = new Set([
  'baucua_magnifier', 'baucua_small_lens', 'baucua_blank_insurance',
  'taixiu_total_scope', 'taixiu_no_triple', 'taixiu_edge_insurance', 'dice_divine_eye',
  'horse_second_insurance', 'horse_jackpot', 'horse_consolation',
]);

function activateEffect(guildId, userId, itemId, effectId, { expiresAt = Date.now() + EFFECT_TTL, metadata = {} } = {}) {
  return db.transaction(() => {
    if (getActiveEffect(guildId, userId, effectId)) throw new Error('EFFECT_ALREADY_ACTIVE');
    consumeInventory(guildId, userId, itemId, 1);
    return addEffectCharge(guildId, userId, effectId, { expiresAt, charges: 1, metadata });
  })();
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

function useMinesScanner(guildId, userId, channelId, effect) {
  const session = mines.getMinesByUser(guildId, userId);
  if (!session || session.channel_id !== String(channelId)) throw new Error('NO_ACTIVE_MINES');
  const state = JSON.parse(session.state_json);
  if (state.blastShield && !state.shieldUsed) throw new Error('HIGHER_EFFECT_ACTIVE');
  const isRow = effect === 'mines_row_scanner'; const columns = 5; const rows = mines.CELL_COUNT / columns;
  const lineCells = line => Array.from({ length: isRow ? columns : rows }, (_, index) => isRow ? line * columns + index : index * columns + line);
  const candidates = Array.from({ length: isRow ? rows : columns }, (_, line) => line).filter(line => lineCells(line).some(cell => !state.opened.includes(cell)));
  if (!candidates.length) throw new Error('NO_RADAR_AREA');
  const line = candidates[crypto.randomInt(candidates.length)]; const cells = lineCells(line);
  const mineCount = cells.filter(cell => state.mines.includes(cell)).length;
  return `${isRow ? '↔️' : '↕️'} ${isRow ? 'Hàng' : 'Cột'} **${line + 1}** (ô ${cells.map(cell => cell + 1).join(', ')}) có chính xác **${mineCount} mìn**.`;
}

function useVietnameseExtraTime(guildId, channelId) {
  if (!channelHasGame(guildId, channelId, 'vuatiengviet')) throw new Error('WRONG_EFFECT_CHANNEL');
  const result = games.extendVuaChallenge(guildId);
  if (result.error === 'NO_SESSION') throw new Error('NO_ACTIVE_GAME');
  if (result.error === 'HARD_QUESTION_REQUIRED') throw new Error('HARD_QUESTION_REQUIRED');
  if (result.error === 'EXPIRED') throw new Error('QUESTION_EXPIRED');
  if (result.error) throw new Error('ALREADY_EXTENDED');
  return `⏱️ Đồng Hồ Gia Hạn cộng **${result.seconds} giây** cho câu khó hiện tại — hết hạn <t:${Math.floor(result.question.expiresAt / 1000)}:R>.`;
}

function removePendingEffect(guildId, userId) {
  const armed = new Set(Object.keys(ARMED_MESSAGES));
  const target = listActiveEffects(guildId, userId).find(row => armed.has(row.effect_id));
  if (!target) throw new Error('NO_EFFECT_TO_REMOVE');
  removeActiveEffect(guildId, userId, target.effect_id);
  const item = require('./itemCatalogService').CATALOG.find(entry => entry.effect === target.effect_id);
  return `🧼 Đã hủy hiệu ứng chờ **${item?.name || target.effect_id}**. Bạn có thể kích hoạt vật phẩm khác.`;
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
  require('./playerLevelService').addDiamonds(guildId, userId, HARD_QUESTION_DIAMONDS, { reason: 'vuatiengviet:living-dictionary' });
  const line = resultBlock({ userId, outcome: 'win', stake: 0, payout: reward, gemsGained: HARD_QUESTION_DIAMONDS, result: { ...account, experienceGained: 0 }, reason: `📖 Từ Điển Sống điền **${answer}**` });
  return `${line}\n\nCâu tiếp theo:\n${games.vuaQuestionText(result.nextQuestion)}`;
}

function useVietnameseHint(guildId, channelId, effect) {
  if (!channelHasGame(guildId, channelId, 'vuatiengviet')) throw new Error('WRONG_EFFECT_CHANNEL');
  const session = games.getVuaSession(guildId);
  if (!session) throw new Error('NO_ACTIVE_GAME');
  if (games.isExpiredChallenge(session.question)) throw new Error('QUESTION_EXPIRED');
  const syllables = String(session.question.answer).trim().split(/\s+/u);
  if (effect === 'quiz_word_count') {
    const plain = String(session.question.answer).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi-VN');
    const vowelCount = Array.from(plain).filter(letter => /[aeiouy]/u.test(letter)).length;
    return `🔢 Gợi ý riêng cho bạn: đáp án có **${syllables.length} tiếng** và **${vowelCount} nguyên âm**.`;
  }
  if (effect === 'quiz_first_word') return `🔎 Gợi ý riêng cho bạn: tiếng đầu tiên trong đáp án là **${syllables[0]}**.`;
  const lengths = syllables.map(word => Array.from(word).length);
  return `🔢 Gợi ý riêng cho bạn: số chữ cái mỗi tiếng là **[${lengths.join('] [')}]**.`;
}

const ARMED_MESSAGES = {
    blackjack_redraw: '🃏 Thẻ Rút Lại đã sẵn sàng cho ván Xì dách kế tiếp.',
    blackjack_swap: '🃏 Lệnh Bài Đổi Trắng đã sẵn sàng cho ván Xì dách kế tiếp.',
    blackjack_first_ace: '🅰️ Át Chủ Bài đã sẵn sàng cho ván Xì dách kế tiếp.',
    horse_second_insurance: '🏇 Bảo Hiểm Về Nhì đã sẵn sàng cho cuộc đua kế tiếp.',
    horse_jackpot: '🏇 Trúng Đậm đã sẵn sàng cho cuộc đua kế tiếp.',
    rps_counter: '✊ Bùa Khắc Chế đã sẵn sàng cho ván Oẳn tù tì với bot kế tiếp.',
    rps_draw_win: '✊ Đặc Quyền Kẻ Hèn đã sẵn sàng cho ván Oẳn tù tì với bot kế tiếp.',
    mines_blast_shield: '💣 Giáp Chống Nổ đã sẵn sàng cho ván Mines kế tiếp.',
    poker_insurance: '♠️ Bảo Hiểm Cược đã sẵn sàng cho ván Poker với bot kế tiếp.',
    chinchiro_soundproof_bowl: '🍚 Bát Cách Âm đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_weighted_dice: '🎲 Xúc Xắc Chì đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_otsuki_dice: '🎲 Xúc Xắc Của Quản Đốc đã sẵn sàng cho ván Chinchiro kế tiếp.',
    chinchiro_karma: '🪬 Bùa Trả Đũa đã sẵn sàng và chỉ tiêu khi bạn ra Hifumi.',
    taixiu_edge_insurance: '🛡️ Bảo Hiểm Sát Nút đã sẵn sàng; chỉ tiêu khi được hoàn ở ván Tài xỉu.',
    baucua_blank_insurance: '☂️ Bảo Hiểm Trắng Tay đã sẵn sàng; chỉ tiêu khi được hoàn ở ván Bầu cua.',
    horse_consolation: '🎫 Vé Khán Đài đã sẵn sàng; chỉ tiêu khi ngựa bạn chọn về ba.',
    rps_loss_shield: '🩹 Bùa Giảm Đau đã sẵn sàng; chỉ tiêu khi bạn thua bot.',
    blackjack_bust_guard: '🧷 Miếng Đệm Quắc đã sẵn sàng; chỉ tiêu khi bạn quắc đúng 22 điểm.',
    poker_fold_coupon: '🏳️ Phiếu Bỏ Bài đã sẵn sàng; chỉ tiêu khi bạn bỏ bài ở Flop chưa bỏ thêm xu.',
};
function armedMessage(item) { return ARMED_MESSAGES[item.effect]; }

function useItem({ guildId, userId, channelId, itemId }) {
  const item = getCatalogItem(itemId);
  if (!item || getInventoryQuantity(guildId, userId, itemId) < 1) throw new Error('ITEM_NOT_OWNED');
  if (SHARED_GAME_EFFECTS.has(item.effect)) throw new Error('MULTIPLAYER_ITEMS_DISABLED');
  if (item.type === 'gacha') throw new Error('ITEM_NOT_USABLE');
  if (String(item.effect).startsWith('coquay_')) throw new Error('COQUAY_IN_GAME_ITEM');
  if (item.type === 'color') { equipOwnedCosmetic(guildId, userId, item.id); const icon = item.emoji || '🎨'; return { item, message: `${icon} Đã trang bị **${item.name}**. Dùng \`/hoso\` để xem.`, ephemeral: true }; }
  if (item.effect === 'mines_row_scanner' || item.effect === 'mines_column_scanner') { const message = useMinesScanner(guildId, userId, channelId, item.effect); consumeInventory(guildId, userId, item.id); return { item, message, ephemeral: true }; }
  if (item.effect === 'quiz_extra_time') { const message = useVietnameseExtraTime(guildId, channelId); consumeInventory(guildId, userId, item.id); return { item, message }; }
  if (item.effect === 'remove_active_game_effect') { const message = db.transaction(() => { const value = removePendingEffect(guildId, userId); consumeInventory(guildId, userId, item.id); return value; })(); return { item, message, ephemeral: true }; }
  if (item.effect === 'mines_radar') { const message = useMinesRadar(guildId, userId, channelId); consumeInventory(guildId, userId, item.id); return { item, message, ephemeral: true }; }
  if (item.effect === 'quiz_living_dictionary') { const message = useLivingDictionary(guildId, channelId, userId); consumeInventory(guildId, userId, item.id); return { item, message }; }
  if (['quiz_first_word', 'quiz_syllable_lengths', 'quiz_word_count'].includes(item.effect)) {
    const message = useVietnameseHint(guildId, channelId, item.effect);
    consumeInventory(guildId, userId, item.id);
    return { item, message, ephemeral: true };
  }
  const message = armedMessage(item);
  if (message) { activateEffect(guildId, userId, item.id, item.effect); return { item, message }; }
  throw new Error('ITEM_NOT_USABLE');
}

module.exports = { getActiveEffect, activateEffect, consumeActiveEffect, useItem, useMinesRadar, useVietnameseHint };
