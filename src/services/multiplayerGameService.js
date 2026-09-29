const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame } = require('./economyService');
const { formatCoins } = require('../utils/economy');
const { experienceLines } = require('../utils/progressionView');
const { getGameBetLimit } = require('./gameBetLimitService');
const { getActiveEffect, consumeActiveEffect, effectMetadata } = require('./effectStateService');
const { getGameConfig } = require('./gameConfigService');
const { createFairness, fairInt } = require('./fairnessService');

const ROUND_MS = 30_000;
const MIN_BET = 10;
const MAX_BET_PER_CHOICE = 100_000;
const MAX_BET_PER_ROUND = 500_000;
const retentionValue = Number(process.env.MULTIPLAYER_ROUND_RETENTION_DAYS);
const ROUND_RETENTION_DAYS = Number.isSafeInteger(retentionValue) && retentionValue >= 1 && retentionValue <= 90 ? retentionValue : 7;
const timers = new Map();

const BAUCUA = {
  bau: ['🍐', 'Bầu'], cua: ['🦀', 'Cua'], tom: ['🦐', 'Tôm'],
  ca: ['🐟', 'Cá'], ga: ['🐓', 'Gà'], nai: ['🦌', 'Nai'],
};
const TAIXIU = {
  tai: ['🔴', 'Tài 11–17'], xiu: ['🔵', 'Xỉu 4–10'], chan: ['⚪', 'Chẵn'],
  le: ['⚫', 'Lẻ'], bo_ba: ['🎯', 'Bộ ba bất kỳ'], tong: ['➕', 'Tổng cụ thể'],
};
const TOTAL_RATIOS = { 4: 69, 5: 34, 6: 20, 7: 13, 8: 9, 9: 7, 10: 7, 11: 7, 12: 7, 13: 9, 14: 13, 15: 20, 16: 34, 17: 69 };
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function gameLabel(game) { return game === 'baucua' ? 'BẦU CUA' : 'TÀI XỈU · SIC BO'; }
function choiceLabel(game, choice) {
  if (choice.startsWith('tong:')) return `Tổng ${choice.split(':')[1]}`;
  const item = (game === 'baucua' ? BAUCUA : TAIXIU)[choice];
  return item ? `${item[0]} ${item[1]}` : choice;
}

function rowsForRound(round, disabled = false) {
  const entries = Object.entries(round.game === 'baucua' ? BAUCUA : TAIXIU);
  const rows = [];
  for (let index = 0; index < entries.length; index += 3) {
    const row = new ActionRowBuilder();
    for (const [choice, [emoji, label]] of entries.slice(index, index + 3)) {
      row.addComponents(new ButtonBuilder()
        .setCustomId(`gamebet:${round.game}:${round.id}:${choice}`)
        .setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Primary).setDisabled(disabled));
    }
    rows.push(row);
  }
  return rows;
}

function roundStats(roundId) {
  return db.prepare('SELECT COUNT(DISTINCT user_id) AS players, COALESCE(SUM(amount), 0) AS pool FROM multiplayer_bets WHERE round_id = ?').get(roundId);
}

function roundEmbed(round) {
  const stats = roundStats(round.id);
  const maxBet = getGameBetLimit(round.guild_id, round.game);
  const closeUnix = Math.floor(round.closes_at / 1000);
  const description = round.game === 'baucua'
    ? 'Chọn một hoặc nhiều linh vật. Linh vật xuất hiện 1/2/3 lần trả lãi 1×/2×/3× tiền cược.'
    : 'Tài/Xỉu và Chẵn/Lẻ trả 1:1, nhưng thua khi ra bộ ba. Bộ ba bất kỳ trả 34:1. Tổng cụ thể trả theo độ hiếm.';
  const embed = new EmbedBuilder().setColor(round.game === 'baucua' ? 0xE67E22 : 0x8E44AD)
    .setTitle(`🎲 ${gameLabel(round.game)} · ĐANG NHẬN CƯỢC`)
    .setDescription(`## 🎯 CÁCH CHƠI\n${description}\n\n## ⏳ KHÓA CƯỢC <t:${closeUnix}:R>\nBấm nút bên dưới để đặt cược · Khóa lúc <t:${closeUnix}:T>`)
    .addFields(
      { name: 'Người đã cược', value: String(stats.players), inline: true },
      { name: 'Tổng pot', value: `${formatCoins(stats.pool)} xu`, inline: true },
      { name: 'Giới hạn mỗi người/ván', value: `${formatCoins(MIN_BET)}–${formatCoins(maxBet)} xu`, inline: true },
    )
    .setFooter({ text: `Mã ván: ${round.id} • Không thu phí mở ván` });
  return embed;
}

function effectiveBetLimit(round, userId) {
  const maxBet = getGameBetLimit(round.guild_id, round.game);
  const divineEye = getActiveEffect(round.guild_id, userId, 'dice_divine_eye');
  const metadata = effectMetadata(divineEye);
  return metadata.roundId === round.id
    ? Math.min(maxBet, getGameConfig(round.guild_id, 'DIVINE_EYE_MAX_BET'))
    : maxBet;
}

function getRound(roundId) {
  return db.prepare('SELECT * FROM multiplayer_rounds WHERE id = ?').get(roundId) || null;
}

function getOpenRound(guildId, game) {
  return db.prepare("SELECT * FROM multiplayer_rounds WHERE guild_id = ? AND game = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .get(String(guildId), game) || null;
}

async function fetchRoundMessage(round, client) {
  if (!round.message_id || !client) return null;
  const channel = await client.channels.fetch(round.channel_id).catch(() => null);
  return channel?.messages?.fetch(round.message_id).catch(() => null);
}

async function refreshRoundMessage(round, client) {
  const message = await fetchRoundMessage(round, client);
  if (message) await message.edit({ embeds: [roundEmbed(round)], components: rowsForRound(round) }).catch(() => {});
}

function validChoice(game, choice) {
  if (game === 'baucua') return Boolean(BAUCUA[choice]);
  if (TAIXIU[choice]) return true;
  if (!choice.startsWith('tong:')) return false;
  return Boolean(TOTAL_RATIOS[Number(choice.split(':')[1])]);
}

const placeBetTx = db.transaction(({ roundId, userId, choice, amount }) => {
  const round = getRound(roundId);
  if (!round || round.status !== 'open' || round.closes_at <= Date.now()) throw new Error('ROUND_CLOSED');
  if (!validChoice(round.game, choice)) throw new Error('INVALID_CHOICE');
  if (!Number.isSafeInteger(amount) || amount < MIN_BET || amount > MAX_BET_PER_CHOICE) throw new Error('INVALID_BET');
  const effectiveMaxBet = effectiveBetLimit(round, userId);
  const current = db.prepare('SELECT amount FROM multiplayer_bets WHERE round_id = ? AND user_id = ? AND choice = ?').get(roundId, String(userId), choice)?.amount || 0;
  const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS amount FROM multiplayer_bets WHERE round_id = ? AND user_id = ?').get(roundId, String(userId)).amount;
  if (current + amount > effectiveMaxBet || total + amount > effectiveMaxBet) { const error = new Error('BET_LIMIT'); error.maxBet = effectiveMaxBet; throw error; }
  const account = spendCoins({ guildId: round.guild_id, userId, amount, reason: `${round.game}:reserve:${roundId}` });
  const now = Date.now();
  db.prepare(`INSERT INTO multiplayer_bets (round_id, user_id, choice, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(round_id, user_id, choice) DO UPDATE SET amount = amount + excluded.amount, updated_at = excluded.updated_at`)
    .run(roundId, String(userId), choice, amount, now, now);
  return { round, account, choiceAmount: current + amount, totalAmount: total + amount };
});

function calculatePayout(game, choice, amount, result) {
  if (game === 'baucua') {
    const matches = result.symbols.filter(symbol => symbol === choice).length;
    return matches ? amount * (matches + 1) : 0;
  }
  const { dice, total, triple } = result;
  if (choice === 'tai') return !triple && total >= 11 && total <= 17 ? amount * 2 : 0;
  if (choice === 'xiu') return !triple && total >= 4 && total <= 10 ? amount * 2 : 0;
  if (choice === 'chan') return !triple && total % 2 === 0 ? amount * 2 : 0;
  if (choice === 'le') return !triple && total % 2 === 1 ? amount * 2 : 0;
  if (choice === 'bo_ba') return triple ? amount * 35 : 0;
  if (choice.startsWith('tong:')) {
    const target = Number(choice.split(':')[1]);
    return total === target ? amount * (TOTAL_RATIOS[target] + 1) : 0;
  }
  return 0;
}

function rollResult(game, forcedDice = null, serverSeed = null, modifiers = {}) {
  if (game === 'baucua') {
    const keys = Object.keys(BAUCUA);
    const symbols = forcedDice || [0, 1, 2].map(index => keys[serverSeed ? fairInt(serverSeed, game, index, keys.length) : crypto.randomInt(keys.length)]);
    return { symbols };
  }
  const dice = [...(forcedDice || [0, 1, 2].map(index => serverSeed ? fairInt(serverSeed, game, index, 6) + 1 : crypto.randomInt(1, 7)))];
  if (modifiers?.noTriple && dice.every(value => value === dice[0])) dice[2] = dice[2] % 6 + 1;
  return { dice, total: dice.reduce((sum, value) => sum + value, 0), triple: dice.every(value => value === dice[0]) };
}

const settleTx = db.transaction((roundId, forcedDice = null) => {
  const round = getRound(roundId);
  if (!round || round.status !== 'open') return null;
  let stored = {}; try { stored = JSON.parse(round.result_json || '{}'); } catch {}
  const result = rollResult(round.game, forcedDice, forcedDice ? null : stored.fair?.serverSeed, stored.modifiers);
  const bets = db.prepare('SELECT * FROM multiplayer_bets WHERE round_id = ?').all(roundId);
  const users = new Map();
  const individualBets = new Map();
  for (const bet of bets) {
    const summary = users.get(bet.user_id) || { stake: 0, payout: 0 };
    summary.stake += bet.amount;
    const payout = calculatePayout(round.game, bet.choice, bet.amount, result);
    summary.payout += payout;
    users.set(bet.user_id, summary);
    if (!individualBets.has(bet.user_id)) individualBets.set(bet.user_id, []);
    individualBets.get(bet.user_id).push({ choice: bet.choice, amount: bet.amount, payout });
  }
  const settlements = [];
  for (const [userId, summary] of users) {
    const eye = getActiveEffect(round.guild_id, userId, 'dice_divine_eye');
    if (effectMetadata(eye).roundId === round.id) consumeActiveEffect(round.guild_id, userId, 'dice_divine_eye');
    const outcome = summary.payout > summary.stake ? 'win' : summary.payout === summary.stake ? 'draw' : 'loss';
    const account = settleReservedGame({ guildId: round.guild_id, userId, payout: summary.payout, stake: summary.stake, game: round.game, outcome,
      operationId: `settle:${round.game}:${round.id}:${userId}` });
    settlements.push({ userId, ...summary, outcome, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops, bets: individualBets.get(userId) || [] });
  }
  db.prepare("UPDATE multiplayer_rounds SET status = 'closed', result_json = ? WHERE id = ?").run(JSON.stringify({ result, settlements, fair: stored.fair }), roundId);
  return { round: { ...round, status: 'closed' }, result, settlements, bets, fair: stored.fair };
});

function resultEmbed(settled) {
  const { round, result, settlements } = settled;
  const resultText = round.game === 'baucua'
    ? result.symbols.map(symbol => BAUCUA[symbol][0]).join('  ')
    : `${result.dice.map(value => DICE[value - 1]).join(' ')}\n**${result.total} điểm · ${result.triple ? 'BỘ BA' : result.total >= 11 ? 'TÀI' : 'XỈU'} · ${result.total % 2 ? 'LẺ' : 'CHẴN'}**`;
  const betLines = [];
  for (const item of settlements) {
    if (item.bets?.length > 1) {
      for (const bet of item.bets) {
        const betLabel = choiceLabel(round.game, bet.choice);
        betLines.push(`<@${item.userId}> → **${betLabel}**: ${formatCoins(bet.amount)} xu → ${formatCoins(bet.payout)} xu`);
      }
    } else if (item.bets?.length === 1) {
      const bet = item.bets[0];
      const betLabel = choiceLabel(round.game, bet.choice);
      betLines.push(`<@${item.userId}> → **${betLabel}**: ${formatCoins(bet.amount)} xu → ${formatCoins(bet.payout)} xu`);
    }
  }
  const summary = betLines.length > 0 ? betLines.slice(0, 15).join('\n') : 'Không có cửa cược thắng.';
  const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle(`🎲 ${gameLabel(round.game)} · KẾT QUẢ`)
    .setDescription(`## ${resultText}`)
    .addFields({ name: ':coin: THANH TOÁN', value: summary })
    .setFooter({ text: `Mã ván: ${round.id} • ${settlements.length} người tham gia` })
    .setTimestamp();
  const exp = experienceLines(settlements).slice(0, 15);
  if (exp.length) embed.addFields({ name: ':test_tube: EXP NHẬN ĐƯỢC', value: exp.join('\n') });
  const unlocked = settlements.flatMap(item => (item.achievements || []).map(achievement => `<@${item.userId}> mở khóa **${achievement.name}**`));
  if (unlocked.length) embed.addFields({ name: '🏅 Thành tựu mới', value: unlocked.slice(0, 10).join('\n') });
  return embed;
}

async function settleRound(roundId, client, logger = console, forcedDice = null) {
  clearTimeout(timers.get(roundId));
  timers.delete(roundId);
  let settled;
  try { settled = settleTx(roundId, forcedDice); }
  catch (error) { logger.error?.({ err: error, roundId }, 'multiplayer round settlement failed'); throw error; }
  if (!settled) return null;
  const message = await fetchRoundMessage(settled.round, client);
  if (message) await message.edit({ embeds: [resultEmbed(settled)], components: [...rowsForRound(settled.round, true), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:${settled.round.game}`).setLabel('Mở ván mới').setEmoji('🔁').setStyle(ButtonStyle.Success))], allowedMentions: { parse: [] } }).catch(error => logger.error?.({ err: error, roundId }, 'round result message update failed'));
  return settled;
}

function scheduleRound(round, client, logger = console) {
  clearTimeout(timers.get(round.id));
  const timer = setTimeout(() => settleRound(round.id, client, logger).catch(() => {}), Math.max(0, round.closes_at - Date.now()));
  timer.unref?.();
  timers.set(round.id, timer);
}

async function createRound(interaction, game, logger = console) {
  const existing = getOpenRound(interaction.guildId, game);
  if (existing) {
    if (existing.closes_at <= Date.now()) await settleRound(existing.id, interaction.client, logger);
    else return interaction.reply({ content: `Ván hiện tại vẫn đang nhận cược đến <t:${Math.floor(existing.closes_at / 1000)}:T>.`, flags: MessageFlags.Ephemeral });
  }
  const now = Date.now();
  const fair = createFairness();
  const round = { id: crypto.randomBytes(4).toString('hex'), guild_id: String(interaction.guildId), game, channel_id: String(interaction.channelId), message_id: null, status: 'open', closes_at: now + ROUND_MS, result_json: JSON.stringify({ fair }), created_at: now };
  db.prepare('INSERT INTO multiplayer_rounds (id, guild_id, game, channel_id, message_id, status, closes_at, result_json, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)')
    .run(round.id, round.guild_id, game, round.channel_id, round.status, round.closes_at, round.result_json, round.created_at);
  const response = await interaction.reply({ embeds: [roundEmbed(round)], components: rowsForRound(round), withResponse: true });
  const message = response?.resource?.message || null;
  if (message?.id) {
    round.message_id = message.id;
    db.prepare('UPDATE multiplayer_rounds SET message_id = ? WHERE id = ?').run(message.id, round.id);
  }
  scheduleRound(round, interaction.client, logger);
  return round;
}

async function handleBetButton(interaction) {
  const [, game, roundId, choice] = interaction.customId.split(':');
  const round = getRound(roundId);
  if (!round || round.game !== game || round.guild_id !== interaction.guildId || round.channel_id !== interaction.channelId || round.status !== 'open' || round.closes_at <= Date.now()) {
    return interaction.reply({ content: 'Ván cược đã đóng hoặc nút này không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  }
  const modal = new ModalBuilder().setCustomId(`gamebet-modal:${game}:${roundId}:${choice}`).setTitle(`Cược ${choiceLabel(game, choice)}`);
  const maxBet = effectiveBetLimit(round, interaction.user.id);
  if (choice === 'tong') {
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('Tổng điểm muốn cược (4–17)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(2)));
  }
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`Số xu (${MIN_BET}–${maxBet})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6)));
  return interaction.showModal(modal);
}

async function handleBetModal(interaction) {
  const [, game, roundId, rawChoice] = interaction.customId.split(':');
  let choice = rawChoice;
  if (rawChoice === 'tong') {
    const target = Number(interaction.fields.getTextInputValue('target').trim());
    if (!TOTAL_RATIOS[target]) return interaction.reply({ content: 'Tổng điểm phải là số nguyên từ 4 đến 17.', flags: MessageFlags.Ephemeral });
    choice = `tong:${target}`;
  }
  const amountText = interaction.fields.getTextInputValue('amount').trim();
  const amount = Number(amountText);
  if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount)) return interaction.reply({ content: 'Số xu cược không hợp lệ.', flags: MessageFlags.Ephemeral });
  try {
    const placed = placeBetTx({ roundId, userId: interaction.user.id, choice, amount });
    await interaction.reply({ content: `✅ Đã cược **${formatCoins(amount)} xu** vào **${choiceLabel(game, choice)}**. Tổng cược ván này: **${formatCoins(placed.totalAmount)} xu**.`, flags: MessageFlags.Ephemeral });
    await refreshRoundMessage(placed.round, interaction.client);
  } catch (error) {
    const content = error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để đặt cược.'
      : error.message === 'ROUND_CLOSED' ? 'Ván đã khóa cược.'
        : error.message === 'BET_LIMIT' ? `Tổng cược tối đa của bạn trong ván này là ${formatCoins(error.maxBet)} xu.`
          : 'Mức cược phải là số nguyên từ 10 đến 100.000 xu.';
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
  const publicMessage = `<@${interaction.user.id}> đặt cược **${formatCoins(amount)} xu** vào **${choiceLabel(game, choice)}** 🎲`;
  await interaction.channel?.send({ content: publicMessage }).catch(() => {});
  return null;
}

function resumeOpenRounds(client, logger = console) {
  const cutoff = Date.now() - ROUND_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const oldIds = db.prepare("SELECT id FROM multiplayer_rounds WHERE status = 'closed' AND created_at < ?").all(cutoff).map(row => row.id);
  const cleanup = db.transaction(() => {
    const deleteBets = db.prepare('DELETE FROM multiplayer_bets WHERE round_id = ?');
    const deleteRound = db.prepare('DELETE FROM multiplayer_rounds WHERE id = ?');
    for (const id of oldIds) { deleteBets.run(id); deleteRound.run(id); }
  });
  cleanup();
  if (oldIds.length) logger.info?.({ deletedRounds: oldIds.length, retentionDays: ROUND_RETENTION_DAYS }, 'multiplayer round history cleaned');
  const rounds = db.prepare("SELECT * FROM multiplayer_rounds WHERE status = 'open' AND game IN ('baucua', 'taixiu')").all();
  for (const round of rounds) scheduleRound(round, client, logger);
  return rounds.length;
}

module.exports = {
  ROUND_MS, ROUND_RETENTION_DAYS, TOTAL_RATIOS, BAUCUA, TAIXIU,
  calculatePayout, rollResult, effectiveBetLimit, getRound, getOpenRound, createRound,
  handleBetButton, handleBetModal, settleRound, resumeOpenRounds,
};
