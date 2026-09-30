const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { db } = require('../db');
const { getAccount, settleBet } = require('./economyService');
const { getGameBetLimit } = require('./gameBetLimitService');
const { createFairness, fairInt } = require('./fairnessService');
const { consumeHighestEffect, consumeActiveEffect } = require('./effectStateService');
const { formatCoins } = require('../utils/economy');
const { resultBlock, coins } = require('../utils/rewardText');

const HANDS = { bua: { label: 'Búa', emoji: '✊', beats: 'keo' }, keo: { label: 'Kéo', emoji: '✌️', beats: 'bao' }, bao: { label: 'Bao', emoji: '✋', beats: 'bua' } };

function createRpsBotRound({ guildId, channelId, userId, stake, choice, now = Date.now() }) {
  if (!Number.isSafeInteger(stake) || stake < 10 || stake > 100_000 || !Object.hasOwn(HANDS, choice)) throw new Error('INVALID_BET');
  const maxBet = getGameBetLimit(guildId, 'oantuti');
  if (stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  db.prepare('DELETE FROM rps_bot_rounds WHERE expires_at < ?').run(now - 86_400_000);
  const fair = createFairness(); const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO rps_bot_rounds(id,guild_id,channel_id,user_id,stake,choice,fair_json,status,result_json,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,\'pending\',NULL,?,?,?)')
    .run(id, String(guildId), String(channelId), String(userId), stake, choice, JSON.stringify(fair), now + 60_000, now, now);
  return { id, guild_id: String(guildId), channel_id: String(channelId), user_id: String(userId), stake, choice, fair, status: 'pending', expires_at: now + 60_000 };
}
function confirmRows(round) { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rpsbot:${round.id}:confirm`).setLabel('Xác nhận cược').setEmoji('✅').setStyle(ButtonStyle.Success))]; }
function pendingEmbed(round) { return new EmbedBuilder().setColor(0x5865F2).setTitle('✊ OẲN TÙ TÌ · XÁC NHẬN').setDescription(`Bạn chọn ${HANDS[round.choice].emoji} **${HANDS[round.choice].label}** · Cược **${formatCoins(round.stake)} :coin:**\n\nBấm xác nhận để bắt đầu.`).setFooter({ text: 'Hết hạn sau 60 giây; chưa trừ xu trước khi xác nhận' }); }
const settleTx = db.transaction((id, userId, now) => {
  const row = db.prepare('SELECT * FROM rps_bot_rounds WHERE id=?').get(String(id));
  if (!row || row.user_id !== String(userId)) throw new Error('INVALID_ROUND');
  if (row.status !== 'pending') return { ...row, fair: JSON.parse(row.fair_json), result: JSON.parse(row.result_json) };
  if (row.expires_at < now) { db.prepare("UPDATE rps_bot_rounds SET status='expired',updated_at=? WHERE id=?").run(now, id); return { ...row, status: 'expired', result: null }; }
  const maxBet = getGameBetLimit(row.guild_id, 'oantuti');
  if (row.stake > maxBet) { const error = new Error('BET_LIMIT'); error.maxBet = maxBet; throw error; }
  if (getAccount(row.guild_id, row.user_id).balance < row.stake) {
    const error = new Error('INSUFFICIENT_FUNDS'); error.code = 'INSUFFICIENT_FUNDS'; throw error;
  }
  const fair = JSON.parse(row.fair_json);
  const effect = consumeHighestEffect(row.guild_id, row.user_id, ['rps_draw_win', 'rps_counter']);
  const botChoice = effect?.effect_id === 'rps_counter'
    ? [row.choice, HANDS[row.choice].beats][fairInt(fair.serverSeed, 'rps-counter', 0, 2)]
    : Object.keys(HANDS)[fairInt(fair.serverSeed, 'rps-bot', 0, 3)];
  let outcome = row.choice === botChoice ? 'draw' : HANDS[row.choice].beats === botChoice ? 'win' : 'loss';
  const cowardWin = effect?.effect_id === 'rps_draw_win' && outcome === 'draw';
  if (cowardWin) outcome = 'win';
  let payout = cowardWin ? Math.floor(row.stake * 1.5) : outcome === 'win' ? row.stake * 2 : outcome === 'draw' ? row.stake : 0;
  let lossRefund = 0;
  if (outcome === 'loss' && !effect && consumeActiveEffect(row.guild_id, row.user_id, 'rps_loss_shield')) { lossRefund = Math.floor(row.stake * 0.2); payout += lossRefund; }
  const account = settleBet({ guildId: row.guild_id, userId: row.user_id, stake: row.stake, payout, game: 'oantuti', outcome, operationId: `settle:rpsbot:${row.id}` });
  const result = { botChoice, outcome, payout, itemEffect: effect?.effect_id || (lossRefund ? 'rps_loss_shield' : null), lossRefund, cowardWin, balance: account.balance, achievements: account.unlockedAchievements, experienceGained: account.experienceGained, levelUps: account.levelUps, bonusDrops: account.bonusDrops };
  db.prepare("UPDATE rps_bot_rounds SET status='completed',result_json=?,updated_at=? WHERE id=?").run(JSON.stringify(result), now, id);
  return { ...row, status: 'completed', fair, result };
});
function expiredEmbed(round) { return new EmbedBuilder().setColor(0x7F8C8D).setTitle('✊ OẲN TÙ TÌ · HẾT HẠN').setDescription(`⌛ Bạn đã không xác nhận trong 60 giây nên ván ${HANDS[round.choice].emoji} **${HANDS[round.choice].label}** bị hủy. Tiền cược chưa bị trừ.`); }
function resultEmbed(round) {
  const { result } = round;
  const item = result.itemEffect === 'rps_counter' ? '🧿 Bùa Khắc Chế đã giới hạn lựa chọn của bot.' : result.cowardWin ? '🎭 Đặc Quyền Kẻ Hèn đã kích hoạt.'
    : result.lossRefund ? `🩹 Bùa Giảm Đau hoàn **20% cược** = +${coins(result.lossRefund)}` : '';
  const reward = resultBlock({ userId: round.user_id, outcome: result.outcome, stake: round.stake, payout: result.payout, result, reason: result.cowardWin ? 'hòa → thắng' : '', extra: [item] });
  const embed = new EmbedBuilder().setColor(result.outcome === 'win' ? 0x2ECC71 : result.outcome === 'draw' ? 0xF1C40F : 0xE74C3C).setTitle('✊ OẲN TÙ TÌ ✋')
    .setDescription(`## 👤 BẠN\n# ${HANDS[round.choice].emoji} ${HANDS[round.choice].label}\n\n## 🤖 BOT\n# ${HANDS[result.botChoice].emoji} ${HANDS[result.botChoice].label}\n\n## 🏆 KẾT QUẢ\n${reward}`);
  if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  return embed;
}
async function handleRpsBotButton(interaction) { const [, id] = interaction.customId.split(':'); try { const round = settleTx(id, interaction.user.id, Date.now()); if (round.status === 'expired') return interaction.update({ embeds: [expiredEmbed(round)], components: [] }); return interaction.update({ embeds: [resultEmbed(round)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:oantuti:${round.stake}:${round.choice}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))] }); } catch (error) { return interaction.reply({ content: error.message === 'BET_LIMIT' ? `Giới hạn cược Oẳn tù tì hiện tại là **${formatCoins(error.maxBet)} :coin:**. Hãy tạo ván mới.` : error.code === 'INSUFFICIENT_FUNDS' ? 'Bạn không đủ xu để xác nhận cược.' : 'Ván này không hợp lệ.', flags: MessageFlags.Ephemeral }); } }
module.exports = { HANDS, createRpsBotRound, confirmRows, pendingEmbed, handleRpsBotButton };
