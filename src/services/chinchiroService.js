const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { spendCoins, settleReservedGame, getAccount, creditCoins } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createFairness, fairInt, commitment } = require('./fairnessService');
const { getActiveEffect, consumeActiveEffect } = require('./effectStateService');
const { formatCoins } = require('../utils/economy');
const { addExperienceField, bonusDropText } = require('../utils/progressionView');

const MIN_BET = 10;
const MAX_BET = 100_000;
const DICE = ['[1]', '[2]', '[3]', '[4]', '[5]', '[6]'];
const EFFECT_PRIORITY = ['chinchiro_karma', 'chinchiro_otsuki_dice', 'chinchiro_weighted_dice', 'chinchiro_soundproof_bowl'];

function evaluateDice(dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  if (sorted.join(',') === '1,2,3') return { kind: 'hifumi', label: 'Hifumi 1-2-3' };
  if (sorted.join(',') === '4,5,6') return { kind: 'shigoro', label: 'Shigoro 4-5-6' };
  if (sorted[0] === sorted[2]) return sorted[0] === 1
    ? { kind: 'pin_zoro', label: 'Pin-Zoro 1-1-1' }
    : { kind: 'zoro', point: sorted[0], label: `Bão ${sorted[0]}-${sorted[0]}-${sorted[0]}` };
  if (sorted[0] === sorted[1]) return { kind: 'point', point: sorted[2], label: `Điểm ${sorted[2]}` };
  if (sorted[1] === sorted[2]) return { kind: 'point', point: sorted[0], label: `Điểm ${sorted[0]}` };
  return null;
}

function die(seed, scope, index, minimum = 1, maximum = 6) {
  return fairInt(seed, scope, index, maximum - minimum + 1) + minimum;
}

function rollTurn({ seed, side, maxRolls = 3, effect = null, shonben = false }) {
  if (shonben && fairInt(seed, `${side}:shonben`, 0, 100) === 0) {
    return { attempts: [], hand: { kind: 'shonben', label: 'Shonben - rớt xúc xắc' } };
  }
  const attempts = [];
  for (let attempt = 0; attempt < maxRolls; attempt += 1) {
    const dice = [0, 1, 2].map(index => {
      if (effect === 'chinchiro_otsuki_dice') return die(seed, `${side}:${attempt}:otsuki`, index, 4, 6);
      if (effect === 'chinchiro_weighted_dice' && index === 0) return die(seed, `${side}:${attempt}:weighted`, index, 4, 6);
      return die(seed, `${side}:${attempt}:normal`, index);
    });
    const hand = evaluateDice(dice);
    attempts.push({ dice, hand });
    if (hand) return { attempts, hand };
  }
  return { attempts, hand: { kind: 'menashi', label: 'Menashi - Vô tướng' } };
}

function highestEffect(guildId, userId) {
  for (const effectId of EFFECT_PRIORITY) if (getActiveEffect(guildId, userId, effectId)) return effectId;
  return null;
}

function dealerDecision(hand) {
  if (hand.kind === 'hifumi' || hand.kind === 'menashi' || (hand.kind === 'point' && hand.point === 1)) return 'win';
  if (['shigoro', 'zoro', 'pin_zoro'].includes(hand.kind) || (hand.kind === 'point' && hand.point === 6)) return 'loss';
  return null;
}

function playerDecision(player, dealer) {
  if (player.kind === 'shonben' || player.kind === 'menashi') return { outcome: 'loss', profitMultiplier: 0 };
  if (player.kind === 'hifumi') return { outcome: 'hifumi', profitMultiplier: 0 };
  if (player.kind === 'shigoro') return { outcome: 'win', profitMultiplier: 2 };
  if (player.kind === 'pin_zoro') return { outcome: 'win', profitMultiplier: 5 };
  if (player.kind === 'zoro') return { outcome: 'win', profitMultiplier: 3 };
  if (player.point > dealer.point) return { outcome: 'win', profitMultiplier: 1 };
  if (player.point === dealer.point) return { outcome: 'draw', profitMultiplier: 0 };
  return { outcome: 'loss', profitMultiplier: 0 };
}

function getSession(id) { return db.prepare('SELECT * FROM chinchiro_sessions WHERE id=?').get(String(id)) || null; }
function getActiveSession(id, guildId) { return db.prepare('SELECT * FROM chinchiro_sessions WHERE id=? AND guild_id=?').get(String(id), String(guildId)) || null; }
function forceEndChinchiroSession(id, guildId, adminId) {
  return db.transaction(() => {
    const session = getActiveSession(id, guildId); if (!session) return null;
    const state = JSON.parse(session.state_json);
    creditCoins({ guildId: session.guild_id, userId: session.user_id, amount: session.stake,
      reason: `chinchiro:admin-refund:${adminId}:${session.id}`, operationId: `refund:chinchiro-admin:${session.id}:${session.user_id}` });
    db.prepare('DELETE FROM chinchiro_sessions WHERE id=?').run(session.id);
    return { session, state, participants: [session.user_id] };
  })();
}
function getSessionByUser(guildId, userId) {
  return db.prepare('SELECT * FROM chinchiro_sessions WHERE guild_id=? AND user_id=?').get(String(guildId), String(userId)) || null;
}
function setMessageId(id, messageId) {
  db.prepare('UPDATE chinchiro_sessions SET message_id=?,updated_at=? WHERE id=?').run(String(messageId), Date.now(), String(id));
}

function settlement({ id, guildId, userId, stake, outcome, profitMultiplier = 0, extraPenalty = 0 }) {
  const payout = outcome === 'draw' ? stake : outcome === 'win' ? stake * (profitMultiplier + 1) : 0;
  const account = settleReservedGame({ guildId, userId, payout, stake, game: 'chinchiro', outcome,
    operationId: `settle:chinchiro:${id}` });
  return { outcome, payout, profit: payout - stake, extraPenalty, balance: account.balance,
    achievements: account.unlockedAchievements, experienceGained: account.experienceGained,
    levelUps: account.levelUps, bonusDrops: account.bonusDrops };
}

const startTx = db.transaction(({ guildId, channelId, userId, stake, forcedSeed = null }) => {
  if (!Number.isSafeInteger(stake) || stake < MIN_BET || stake > MAX_BET) throw new Error('INVALID_BET');
  const maxBet = getGameBetLimit(guildId, 'chinchiro');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (getSessionByUser(guildId, userId)) throw new Error('ACTIVE_SESSION');
  spendCoins({ guildId, userId, amount: stake, reason: 'chinchiro:reserve' });
  const fair = createFairness();
  if (forcedSeed !== null) { fair.serverSeed = String(forcedSeed); fair.commit = commitment(fair.serverSeed); }
  const id = crypto.randomBytes(6).toString('hex');
  const dealer = rollTurn({ seed: fair.serverSeed, side: 'dealer' });
  const immediate = dealerDecision(dealer.hand);
  const effect = immediate ? null : highestEffect(guildId, userId);
  const state = { stake, dealer, player: null, effect, fair, status: immediate ? 'complete' : 'waiting' };
  if (immediate) {
    const result = settlement({ id, guildId, userId, stake, outcome: immediate, profitMultiplier: immediate === 'win' ? 1 : 0 });
    state.result = result;
    return { immediate: true, state, result };
  }
  if (effect && effect !== 'chinchiro_karma') consumeActiveEffect(guildId, userId, effect);
  const now = Date.now();
  const session = { id, guild_id: String(guildId), channel_id: String(channelId), user_id: String(userId), message_id: null,
    stake, state_json: JSON.stringify(state), created_at: now, updated_at: now };
  db.prepare(`INSERT INTO chinchiro_sessions(id,guild_id,channel_id,user_id,message_id,stake,state_json,created_at,updated_at)
    VALUES(@id,@guild_id,@channel_id,@user_id,@message_id,@stake,@state_json,@created_at,@updated_at)`).run(session);
  return { immediate: false, session, state };
});

function startChinchiro(args) { return startTx(args); }

const shakeTx = db.transaction((sessionId, userId) => {
  const session = getSession(sessionId);
  if (!session || session.user_id !== String(userId)) throw new Error('INVALID_SESSION');
  const state = JSON.parse(session.state_json);
  const maxRolls = state.effect === 'chinchiro_soundproof_bowl' ? 4 : 3;
  state.player ||= { attempts: [], hand: null };
  if (!state.player.attempts.length && fairInt(state.fair.serverSeed, 'player:shonben', 0, 100) === 0) {
    state.player.hand = { kind: 'shonben', label: 'Shonben - rớt xúc xắc' };
  } else {
    const attemptIndex = state.player.attempts.length;
    const dice = [0, 1, 2].map(index => {
      if (state.effect === 'chinchiro_otsuki_dice') return die(state.fair.serverSeed, `player:${attemptIndex}:otsuki`, index, 4, 6);
      if (state.effect === 'chinchiro_weighted_dice' && index === 0) return die(state.fair.serverSeed, `player:${attemptIndex}:weighted`, index, 4, 6);
      return die(state.fair.serverSeed, `player:${attemptIndex}:normal`, index);
    });
    const hand = evaluateDice(dice);
    state.player.attempts.push({ dice, hand });
    if (hand) state.player.hand = hand;
    else if (state.player.attempts.length >= maxRolls) state.player.hand = { kind: 'menashi', label: 'Menashi - Vô tướng' };
  }
  if (!state.player.hand) {
    db.prepare('UPDATE chinchiro_sessions SET state_json=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(state), Date.now(), session.id);
    return { session, state, complete: false };
  }
  let decision = playerDecision(state.player.hand, state.dealer.hand);
  let extraPenalty = 0; let karmaTriggered = false;
  if (decision.outcome === 'hifumi' && state.effect === 'chinchiro_karma') {
    consumeActiveEffect(session.guild_id, session.user_id, 'chinchiro_karma');
    decision = { outcome: 'win', profitMultiplier: 2 }; karmaTriggered = true;
  } else if (decision.outcome === 'hifumi') {
    const balance = getAccount(session.guild_id, session.user_id).balance;
    extraPenalty = Math.min(state.stake, balance);
    if (extraPenalty > 0) spendCoins({ guildId: session.guild_id, userId: session.user_id, amount: extraPenalty, reason: `chinchiro:hifumi:${session.id}` });
    decision = { outcome: 'loss', profitMultiplier: 0 };
  }
  const result = settlement({ id: session.id, guildId: session.guild_id, userId: session.user_id, stake: state.stake,
    outcome: decision.outcome, profitMultiplier: decision.profitMultiplier, extraPenalty });
  result.karmaTriggered = karmaTriggered;
  state.status = 'complete'; state.result = result;
  db.prepare('DELETE FROM chinchiro_sessions WHERE id=?').run(session.id);
  return { session, state, result, complete: true };
});

function shakeChinchiro(sessionId, userId) { return shakeTx(sessionId, userId); }

function rollLines(turn) {
  if (!turn) return '_Chưa lắc_';
  if (!turn.attempts.length) return `💦 **${turn.hand.label}**`;
  return turn.attempts.map((attempt, index) => {
    const dice = attempt.dice.map(value => DICE[value - 1]).join(' ');
    return `Lắc ${index + 1}: ${dice}  ${attempt.hand ? `→ **${attempt.hand.label}**` : '→ Vô tướng'}`;
  }).join('\n');
}

function resultText(state) {
  const result = state.result;
  if (!result) return `🎲 Đã lắc **${state.player?.attempts?.length || 0}/${state.effect === 'chinchiro_soundproof_bowl' ? 4 : 3}** lượt. Bấm nút để lắc tiếp.`;
  if (result.karmaTriggered) return `🪬 **Bùa Trả Đũa kích hoạt!** Hifumi bị đẩy sang Nhà cái. Bạn lãi **+${formatCoins(result.profit)} xu**.`;
  if (result.outcome === 'win') return `🏆 **NGƯỜI CHƠI THẮNG!** Lãi **+${formatCoins(result.profit)} xu**.`;
  if (result.outcome === 'draw') return '🤝 **HÒA!** Hoàn lại toàn bộ tiền cược.';
  return result.extraPenalty
    ? `💥 **HIFUMI!** Mất tiền cược và bị phạt thêm **${formatCoins(result.extraPenalty)} xu**.`
    : `💥 **NGƯỜI CHƠI THUA!** Mất **${formatCoins(state.stake)} xu**.`;
}

function chinchiroEmbed(state, userId, sessionId = null) {
  const embed = new EmbedBuilder().setColor(state.result?.outcome === 'win' ? 0x2ECC71 : state.result?.outcome === 'loss' ? 0xE74C3C : 0xD4A017)
    .setTitle('🎲 BÀN CƯỢC CHINCHIRO · XÚC XẮC NGẦM')
    .setDescription(`**Người chơi:** <@${userId}> · **Tiền cược:** ${formatCoins(state.stake)} xu`)
    .addFields(
      { name: '💼 QUẢN ĐỐC (CÁI)', value: rollLines(state.dealer) },
      { name: '👤 NGƯỜI CHƠI', value: rollLines(state.player) },
      { name: '🏁 KẾT QUẢ', value: resultText(state) },
    );
  if (sessionId && !state.result) embed.setFooter({ text: `Mã ván: ${sessionId}` });
  if (state.effect) embed.addFields({ name: '✨ Vật phẩm', value: ({
    chinchiro_soundproof_bowl: 'Bát Cách Âm · tối đa 4 lần lắc', chinchiro_weighted_dice: 'Xúc Xắc Chì · viên đầu ra 4–6',
    chinchiro_otsuki_dice: 'Xúc Xắc Của Quản Đốc · chỉ có mặt 4–5–6', chinchiro_karma: 'Bùa Trả Đũa · tự động chặn Hifumi',
  })[state.effect] });
  if (state.result) {
    addExperienceField(embed, state.result);
    const drops = bonusDropText(state.result.bonusDrops); if (drops) embed.addFields({ name: '🎊 Drop sau ván', value: drops });
  }
  return embed;
}

function chinchiroRows(sessionId, state) {
  if (state.result) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:chinchiro:${state.stake}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`chinchiro:${sessionId}:shake`).setLabel('Lắc Xúc Xắc').setEmoji('🎲').setStyle(ButtonStyle.Primary))];
}

async function handleChinchiroButton(interaction) {
  const [, sessionId] = interaction.customId.split(':');
  const session = getSession(sessionId);
  if (!session || session.guild_id !== interaction.guildId || session.channel_id !== interaction.channelId) return interaction.reply({ content: 'Ván Chinchiro đã kết thúc hoặc nút không còn hợp lệ.', flags: MessageFlags.Ephemeral });
  if (session.user_id !== interaction.user.id) return interaction.reply({ content: 'Chỉ người đặt cược mới được lắc xúc xắc.', flags: MessageFlags.Ephemeral });
  const played = shakeChinchiro(sessionId, interaction.user.id);
  return interaction.update({ embeds: [chinchiroEmbed(played.state, interaction.user.id, sessionId)], components: chinchiroRows(sessionId, played.state), allowedMentions: { parse: [] } });
}

module.exports = {
  MIN_BET, MAX_BET, EFFECT_PRIORITY, evaluateDice, rollTurn, dealerDecision, playerDecision,
  startChinchiro, shakeChinchiro, getSessionByUser, setMessageId, chinchiroEmbed, chinchiroRows, handleChinchiroButton, forceEndChinchiroSession,
};
