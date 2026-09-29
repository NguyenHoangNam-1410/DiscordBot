const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { formatCoins } = require('../utils/economy');
const { addExperienceField } = require('../utils/progressionView');

function raceButtons(round, market, horses, disabled = false) {
  const buttons = market.selected.map(key => new ButtonBuilder().setCustomId(`horserace:${round.id}:${key}`)
    .setLabel(`${horses[key].name} x${market.horses[key].multiplier}`).setEmoji(horses[key].emoji).setStyle(ButtonStyle.Primary).setDisabled(disabled));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 3) rows.push(new ActionRowBuilder().addComponents(...buttons.slice(index, index + 3)));
  return rows;
}
function raceEmbed(round, { stats, market, maxBet, horses, minBet, horseCount }) {
  const closes = Math.floor(round.closes_at / 1000);
  const odds = market.selected.map(key => { const horse = horses[key]; const quote = market.horses[key]; const chance = (quote.chance * 100).toFixed(1).replace('.0', ''); return `${horse.emoji} **${horse.name}** · x${quote.multiplier} · ${chance}% · ${quote.form}`; }).join('\n');
  return new EmbedBuilder().setColor(market.specialAppears ? 0xFFD700 : 0x2ECC71).setTitle(market.specialAppears ? '🌟 THIÊN MÃ XUẤT HIỆN · ĐANG NHẬN CƯỢC' : '🏇 ĐUA NGỰA · ĐANG NHẬN CƯỢC')
    .setDescription(`**${horseCount} ngựa** · ${market.periodLabel} · Khóa cược <t:${closes}:R>\n\n${odds}`)
    .addFields({ name: 'Người đã cược', value: String(stats.players), inline: true }, { name: 'Tổng pot', value: `${formatCoins(stats.pool)} xu`, inline: true }, { name: 'Giới hạn mỗi người/ván', value: `${formatCoins(minBet)}–${formatCoins(maxBet)} xu`, inline: true })
    .setFooter({ text: `Mã ván: ${round.id} • Multiplier gồm tiền cược hoàn lại` });
}
function raceAnimationEmbed(round, plan, frameIndex, { horses, frameCount, animationMs, progressBar }) {
  const frame = plan.frames[frameIndex];
  const tracks = plan.order.map(key => [key, horses[key]]).sort(([a], [b]) => frame.positions[b] - frame.positions[a])
    .map(([key, horse], index) => `${index === 0 ? '👑' : '▫️'} ${horse.emoji} **${horse.name}** ${progressBar(frame.positions[key], 10)} ${frame.positions[key]}%`).join('\n');
  return new EmbedBuilder().setColor(frameIndex === frameCount - 1 ? 0xF1C40F : 0x3498DB)
    .setTitle(`🏇 CHẶNG ${frameIndex + 1}/${frameCount} · ${Math.round(((frameIndex + 1) / frameCount) * (animationMs / 1000))}s`)
    .setDescription(`${tracks}\n\n🎙️ ${frame.commentary}`).setFooter({ text: `Mã ván: ${round.id} • ${plan.debuff?.emoji || '🌤️'} ${plan.debuff?.name || 'Điều kiện thường'} • Đang tiến về đích` });
}
function resultEmbed(settled, horses) {
  const medals = ['🥇', '🥈', '🥉']; const podium = settled.order.slice(0, 3).map((key, index) => `${medals[index]} ${horses[key].emoji} **${horses[key].name}**`).join('\n');
  const winner = horses[settled.winner]; const totalPot = settled.settlements.reduce((sum, item) => sum + item.stake, 0);
  const winners = settled.settlements.filter(item => item.bets.some(bet => bet.payout > 0)).sort((a, b) => b.payout - a.payout).slice(0, 15);
  const winnerSummary = winners.length
    ? winners.map(item => {
      const guessed = item.bets.filter(bet => bet.payout > 0).map(bet => `${horses[bet.choice]?.emoji || '🐎'} ${horses[bet.choice]?.name || bet.choice}`).join(', ');
      return `<@${item.userId}> đoán **${guessed}** · nhận **${formatCoins(item.payout)} xu**`;
    }).join('\n')
    : 'Không có người chơi đoán trúng.';
  return new EmbedBuilder().setColor(winner.special ? 0xFF69B4 : 0xFFD700).setTitle(winner.special ? '🌟 ĐUA NGỰA · CHUNG CUỘC' : '🏆 ĐUA NGỰA · CHUNG CUỘC')
    .setDescription(podium).addFields(
      { name: '🎯 Người đoán trúng', value: winnerSummary },
      { name: 'Tổng kết', value: `👥 **${settled.settlements.length}** người chơi · 💰 Pot **${formatCoins(totalPot)} xu**` },
    )
    .setFooter({ text: `Mã ván: ${settled.round.id} • Dùng các nút bên dưới để xem chi tiết` }).setTimestamp();
}
function resultRows(roundId) { return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('replay:duangua').setLabel('Mở cuộc đua mới').setEmoji('🔁').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`horserace:${roundId}:debuff`).setLabel('Debuff').setEmoji('🌪️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`horserace:${roundId}:reason`).setLabel('Lý do chiến thắng').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`horserace:${roundId}:mine`).setLabel('Kết quả của tôi').setEmoji('👤').setStyle(ButtonStyle.Primary),
)]; }
function detailEmbed(kind, settled, horses, impactText) {
  if (kind === 'debuff') { const debuff = settled.debuff; return new EmbedBuilder().setColor(0x5865F2).setTitle(`${debuff?.emoji || '🌤️'} DEBUFF · ${debuff?.name || 'Điều kiện thường'}`)
    .setDescription(debuff ? `${debuff.description}\n\n${impactText(debuff)}` : 'Ván này không có debuff.').setFooter({ text: `Mã ván: ${settled.round.id}` }); }
  const winner = horses[settled.winner]; return new EmbedBuilder().setColor(0xFFD700).setTitle(`🎙️ VÌ SAO ${winner?.name || 'NHÀ VÔ ĐỊCH'} CHIẾN THẮNG?`)
    .setDescription(settled.plan?.reason || 'Nhà vô địch có màn trình diễn tốt nhất ở thời điểm quyết định.').setFooter({ text: `Mã ván: ${settled.round.id}` });
}
function personalEmbeds(round, own, bets, horses) {
  const picks = bets.map(bet => `${horses[bet.choice]?.emoji || '🐎'} ${horses[bet.choice]?.name || bet.choice}: **${formatCoins(bet.amount)} xu**`).join('\n') || 'Không có dữ liệu cược.';
  const resultLabel = own.outcome === 'win' ? 'THẮNG' : own.outcome === 'draw' ? 'HÒA' : 'THUA'; const color = own.outcome === 'win' ? 0x2ECC71 : own.outcome === 'draw' ? 0xF1C40F : 0xE74C3C;
  const personal = new EmbedBuilder().setColor(color).setTitle(`👤 KẾT QUẢ CỦA BẠN · ${resultLabel}`).addFields(
    { name: 'Vé cược', value: picks }, { name: 'Thanh toán', value: `Cược **${formatCoins(own.stake)} xu** · Nhận **${formatCoins(own.payout)} xu**\nRòng **${own.payout - own.stake >= 0 ? '+' : ''}${formatCoins(own.payout - own.stake)} xu**${own.insurance ? ` · Bảo hiểm về nhì ${formatCoins(own.insurance)} xu` : ''}${own.consolation ? ` · Vé Khán Đài ${formatCoins(own.consolation)} xu` : ''}${own.jackpot ? ` · Trúng Đậm +${formatCoins(own.jackpot)} xu` : ''}` },
  ).setFooter({ text: `Mã ván: ${round.id} • Chỉ bạn thấy thông báo này` });
  addExperienceField(personal, own);
  const embeds = [personal];
  if (own.achievements?.length) embeds.push(new EmbedBuilder().setColor(0x9B59B6).setTitle('🏅 THÀNH TỰU MỚI').setDescription(own.achievements.map(item => `**${item.name}**\n${item.description || ''}`).join('\n\n')).setFooter({ text: 'Chỉ bạn thấy thành tựu này' }));
  return embeds;
}
function betModal(roundId, horseKey, market, horses, minBet, maxBet) { return new ModalBuilder().setCustomId(`horserace-modal:${roundId}:${horseKey}`).setTitle(`Cược ${horses[horseKey].name} x${market.horses[horseKey].multiplier}`)
  .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`Số xu (${minBet}–${maxBet})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6))); }
module.exports = { raceButtons, raceEmbed, raceAnimationEmbed, resultEmbed, resultRows, detailEmbed, personalEmbeds, betModal };
