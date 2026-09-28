const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { getGameBetLimit } = require('./gameBetLimitService');
const { consumeActiveEffect } = require('./effectStateService');
const { createFairness, fairShuffle, fairInt } = require('./fairnessService');
const { addExperienceField } = require('../utils/progressionView');

const CELL_COUNT = 20;
const MIN_MINES = 1;
const MAX_MINES = 7;
const MIN_BET = 10;
const MAX_BET = 100_000;
const MAX_PAYOUT = 10_000_000;
const HOUSE_FACTOR = 0.97;
const GRID_COLUMNS = 5;
const SPECIAL_MULTIPLIER_BONUS = 1.5;

function combination(n, r) {
  if (r < 0 || r > n) return 0;
  const k = Math.min(r, n - r);
  let value = 1;
  for (let i = 1; i <= k; i += 1) value = value * (n - k + i) / i;
  return value;
}

function multiplierFor(opened, mineCount, stake = MIN_BET) {
  if (opened <= 0) return 1;
  const remaining = CELL_COUNT - opened;
  if (remaining < mineCount) return Math.floor((MAX_PAYOUT / stake) * 100) / 100;
  const fair = combination(CELL_COUNT, mineCount) / combination(remaining, mineCount);
  // The star is hidden among safe cells; its 1.5x bonus must be priced into the base multiplier.
  const expectedStar = 1 + (opened / (CELL_COUNT - mineCount)) * (SPECIAL_MULTIPLIER_BONUS - 1);
  const capped = Math.min(fair * HOUSE_FACTOR ** opened / expectedStar, MAX_PAYOUT / stake);
  return Math.max(1.01, Math.floor(capped * 100) / 100);
}

function payoutFor(state) {
  return Math.min(MAX_PAYOUT, Math.floor(state.stake * currentMultiplier(state)));
}

function currentMultiplier(state) {
  const base = multiplierFor(state.opened.length, state.mineCount, state.stake);
  const boosted = base * (state.specialFound ? SPECIAL_MULTIPLIER_BONUS : 1);
  return Math.min(MAX_PAYOUT / state.stake, Math.floor(boosted * 100) / 100);
}

function sameSpecialLine(cell, specialCell) {
  if (!Number.isInteger(specialCell) || cell === specialCell) return false;
  return Math.floor(cell / GRID_COLUMNS) === Math.floor(specialCell / GRID_COLUMNS) || cell % GRID_COLUMNS === specialCell % GRID_COLUMNS;
}

function createMinePositions(count, serverSeed = null) {
  const cells = Array.from({ length: CELL_COUNT }, (_, index) => index);
  if (serverSeed) return fairShuffle(cells, serverSeed, 'mines-cells').slice(0, count);
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [cells[index], cells[target]] = [cells[target], cells[index]];
  }
  return cells.slice(0, count).sort((a, b) => a - b);
}

function createSpecialPosition(mines, serverSeed = null) {
  const mineSet = new Set(mines);
  const available = Array.from({ length: CELL_COUNT }, (_, index) => index).filter(index => !mineSet.has(index));
  return available[serverSeed ? fairInt(serverSeed, 'mines-special', 0, available.length) : crypto.randomInt(available.length)];
}

function getSession(id) { return db.prepare('SELECT * FROM mines_sessions WHERE id = ?').get(String(id)) || null; }
function getMinesByUser(guildId, userId) { return db.prepare('SELECT * FROM mines_sessions WHERE guild_id = ? AND user_id = ?').get(String(guildId), String(userId)) || null; }
function parseState(session) {
  const state = JSON.parse(session.state_json);
  if (!Number.isInteger(state.specialCell)) state.specialCell = createSpecialPosition(state.mines);
  state.specialFound = Boolean(state.specialFound);
  state.alertTriggered = Boolean(state.alertTriggered || state.alerts?.length);
  state.alerts ||= [];
  return state;
}
function saveState(session, state) { db.prepare('UPDATE mines_sessions SET state_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(state), Date.now(), session.id); }
function setMessageId(id, messageId) { db.prepare('UPDATE mines_sessions SET message_id = ?, updated_at = ? WHERE id = ?').run(String(messageId), Date.now(), String(id)); }

const startTx = db.transaction(({ guildId, userId, channelId, stake, mineCount, forcedMines = null, forcedSpecial = null }) => {
  const maxBet = getGameBetLimit(guildId, 'mines');
  if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error('INVALID_BET');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (!Number.isSafeInteger(mineCount) || mineCount < MIN_MINES || mineCount > MAX_MINES) throw new Error('INVALID_MINES');
  if (getMinesByUser(guildId, userId)) throw new Error('ACTIVE_SESSION');
  const account = spendCoins({ guildId, userId, amount: stake, reason: 'mines:reserve' });
  const fair = createFairness();
  const mines = forcedMines ? [...new Set(forcedMines)] : createMinePositions(mineCount, fair.serverSeed);
  if (mines.length !== mineCount || mines.some(index => !Number.isInteger(index) || index < 0 || index >= CELL_COUNT)) throw new Error('INVALID_MINES');
  const specialCell = forcedSpecial === null ? createSpecialPosition(mines, fair.serverSeed) : Number(forcedSpecial);
  if (!Number.isInteger(specialCell) || specialCell < 0 || specialCell >= CELL_COUNT || mines.includes(specialCell)) throw new Error('INVALID_SPECIAL');
  const state = { stake, mineCount, mines, specialCell, specialFound: false, alertTriggered: false, alerts: [], opened: [], status: 'playing', fair,
    blastShield: consumeActiveEffect(guildId, userId, 'mines_blast_shield'), shieldUsed: false };
  const now = Date.now();
  const session = { id: crypto.randomBytes(6).toString('hex'), guild_id: String(guildId), user_id: String(userId), channel_id: String(channelId), message_id: null, created_at: now, updated_at: now };
  db.prepare('INSERT INTO mines_sessions (id, guild_id, user_id, channel_id, message_id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)')
    .run(session.id, session.guild_id, session.user_id, session.channel_id, JSON.stringify(state), now, now);
  return { session, state, account };
});

function startMines(args) { return startTx(args); }

function settle(session, state, reason) {
  const won = reason === 'cashout' || reason === 'cleared';
  let payout = won ? payoutFor(state) : 0;
  const outcome = won ? (payout > state.stake ? 'win' : 'draw') : 'loss';
  const account = settleReservedGame({ guildId: session.guild_id, userId: session.user_id, payout, stake: state.stake, game: 'mines', outcome,
    operationId: `settle:mines:${session.id}`, countGame: reason !== 'forfeit' });
  db.prepare('DELETE FROM mines_sessions WHERE id = ?').run(session.id);
  state.status = reason;
  return { reason, outcome, payout, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
}

const playTx = db.transaction(({ sessionId, userId, action, cell = null }) => {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
  const state = parseState(session);
  if (action === 'forfeit') return { settled: true, session, state, result: settle(session, state, 'forfeit') };
  if (action === 'cashout') {
    if (!state.opened.length) throw new Error('CANNOT_CASHOUT');
    return { settled: true, session, state, result: settle(session, state, 'cashout') };
  }
  if (action !== 'open' || !Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || state.opened.includes(cell)) throw new Error('INVALID_CELL');
  if (state.mines.includes(cell)) {
    if (state.blastShield && !state.shieldUsed) {
      state.mines = state.mines.filter(index => index !== cell); state.opened.push(cell); state.opened.sort((a, b) => a - b);
      state.shieldUsed = true; state.lastSignal = `🛡️ Giáp Chống Nổ đã vô hiệu hóa mìn ở ô ${cell + 1}; ván tiếp tục.`;
      saveState(session, state); return { settled: false, session, state, shieldSaved: cell, result: null };
    }
    return { settled: true, session, state, exploded: cell, result: settle(session, state, 'mine') };
  }
  state.opened.push(cell);
  state.opened.sort((a, b) => a - b);
  if (cell === state.specialCell) {
    state.specialFound = true;
    state.lastSignal = `🌟 Tìm thấy ô đặc biệt! Multiplier hiện tại được nhân thêm x${SPECIAL_MULTIPLIER_BONUS.toFixed(2)}.`;
  } else if (sameSpecialLine(cell, state.specialCell)) {
    if (!state.alertTriggered) {
      state.alertTriggered = true; state.alerts.push(cell);
      state.lastSignal = '🚨 Báo động: ô vừa mở nằm cùng hàng ngang hoặc cột dọc với ô đặc biệt.';
    } else state.lastSignal = '💎 Ô an toàn, không có cảnh báo mới.';
  } else state.lastSignal = '💎 Ô an toàn, không phát hiện tín hiệu đặc biệt.';
  if (state.opened.length === CELL_COUNT - state.mines.length) return { settled: true, session, state, result: settle(session, state, 'cleared') };
  saveState(session, state);
  return { settled: false, session, state, result: null };
});

function playMines(args) { return playTx(args); }

function minesRows(sessionId, state, result = null) {
  const rows = [];
  const finished = Boolean(result);
  for (let start = 0; start < CELL_COUNT; start += 5) {
    const row = new ActionRowBuilder();
    for (let index = start; index < start + 5; index += 1) {
      const opened = state.opened.includes(index);
      const mine = finished && state.mines.includes(index);
      const exploded = result?.reason === 'mine' && result.exploded === index;
      const special = index === state.specialCell && (opened || finished);
      row.addComponents(new ButtonBuilder().setCustomId(`mines:${sessionId}:open:${index}`)
        .setLabel(mine ? '💣' : special ? '🌟' : opened ? '💎' : '·')
        .setStyle(exploded ? ButtonStyle.Danger : mine ? ButtonStyle.Secondary : special || opened ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(finished || opened));
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    ...(finished ? [new ButtonBuilder().setCustomId(`replay:mines:${state.stake}:${state.mineCount}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success)] : [
      new ButtonBuilder().setCustomId(`mines:${sessionId}:cashout`).setLabel(`Rút x${currentMultiplier(state).toFixed(2)}`).setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(!state.opened.length),
      new ButtonBuilder().setCustomId(`mines:${sessionId}:forfeit`).setLabel('Bỏ ván').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    ]),
  ));
  return rows;
}

function minesEmbed(state, userId, result = null) {
  const multiplier = currentMultiplier(state);
  const potential = payoutFor(state);
  const embed = new EmbedBuilder().setColor(result ? (result.outcome === 'win' ? 0x2ECC71 : 0xE74C3C) : 0x3498DB)
    .setTitle('💣 MINES')
    .setDescription(`## 👤 <@${userId}>\n### Chọn ô an toàn, tăng multiplier và rút trước khi trúng mìn.\n\n## 💰 x${multiplier.toFixed(2)} · CÓ THỂ NHẬN ${state.opened.length ? `${formatCoins(potential)} XU` : 'SAU Ô ĐẦU TIÊN'}`)
    .addFields(
      { name: '💵 TIỀN CƯỢC', value: `**${formatCoins(state.stake)} xu**`, inline: true },
      { name: '💣 SỐ MÌN', value: `**${state.mineCount}**`, inline: true },
      { name: '💎 Ô AN TOÀN', value: `**${state.opened.length}/${CELL_COUNT - state.mineCount}**`, inline: true },
      { name: '🌟 Ô ĐẶC BIỆT', value: state.specialFound ? `**Đã tìm thấy · bonus x${SPECIAL_MULTIPLIER_BONUS.toFixed(2)}**` : '**Đang ẩn trong bàn**' },
      ...(state.blastShield ? [{ name: '🛡️ GIÁP CHỐNG NỔ', value: state.shieldUsed ? '**Đã kích hoạt**' : '**Sẵn sàng**', inline: true }] : []),
    );
  if (!result && state.lastSignal) embed.addFields({ name: '📡 TÍN HIỆU RIÊNG', value: `### ${state.lastSignal}\nCác ô an toàn trên bàn vẫn được giữ nguyên là 💎.` });
  if (result) {
    const text = result.reason === 'mine' ? `💥 Trúng mìn, mất **${formatCoins(state.stake)} xu**.`
      : result.reason === 'forfeit' ? `🏳️ Đã bỏ ván và mất **${formatCoins(state.stake)} xu**.`
        : `💰 Đã rút **${formatCoins(result.payout)} xu** ở x${multiplier.toFixed(2)}.${state.specialFound ? '\n🌟 Phần thưởng đã bao gồm bonus ô đặc biệt.' : ''}`;
    embed.addFields({ name: '🏆 KẾT QUẢ', value: `### ${text}` });
    addExperienceField(embed, result);
    if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  } else embed.setFooter({ text: 'Tín hiệu hàng/cột chỉ hiện trong thông báo riêng • 🌟 = bonus multiplier • 💣 = thua ván' });
  return embed;
}

async function handleMinesButton(interaction) {
  const [, sessionId, action, rawCell] = interaction.customId.split(':');
  const session = getSession(sessionId);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Ván Mines đã kết thúc hoặc nút không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  if (session.user_id !== interaction.user.id) return interaction.reply({ content: 'Đây là ván Mines của người chơi khác.', flags: MessageFlags.Ephemeral });
  try {
    const played = playMines({ sessionId, userId: interaction.user.id, action, cell: rawCell === undefined ? null : Number(rawCell) });
    if (played.result) played.result.exploded = played.exploded;
    return interaction.update({ embeds: [minesEmbed(played.state, interaction.user.id, played.result)], components: minesRows(sessionId, played.state, played.result), allowedMentions: { parse: [] } });
  } catch (error) {
    const content = error.message === 'CANNOT_CASHOUT' ? 'Bạn phải mở ít nhất một ô an toàn trước khi rút.'
      : error.message === 'INVALID_CELL' ? 'Ô này đã mở hoặc không hợp lệ.' : 'Không thể thực hiện thao tác này.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  CELL_COUNT, MIN_MINES, MAX_MINES, MIN_BET, MAX_BET, MAX_PAYOUT, GRID_COLUMNS, SPECIAL_MULTIPLIER_BONUS,
  combination, multiplierFor, currentMultiplier, payoutFor, sameSpecialLine, createMinePositions, createSpecialPosition, getMinesByUser,
  startMines, playMines, setMessageId, minesRows, minesEmbed, handleMinesButton,
};
