const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { formatCoins } = require('../utils/economy');
const { baseMultiplier, potentialPayout } = require('./hardcoreEngine');
const { resultBlock, coins } = require('../utils/rewardText');

function rankLabel(rank) { return { normal: 'Thường', elite: 'Elite', boss: 'BOSS', mimic: 'Mimic', ancient_mimic: 'Ancient Mimic' }[rank] || rank; }
function encounterText(state) {
  const encounter = state.encounter;
  if (state.phase === 'upgrade') return `🎁 **NÂNG CẤP SAU MỐC TẦNG ${encounter.milestone}**\nChọn đúng một nút để nhận nâng cấp trong phần còn lại của run. +HP tăng giới hạn tối đa và hồi 30 HP; Rút thưởng chốt payout.`;
  if (state.phase === 'summit') return '🏆 **ĐÃ CHINH PHỤC TẦNG 999**\nĐây là giới hạn Sinh tồn. Bấm **Rút thưởng** để nhận payout hiện tại.';
  if (encounter.type === 'combat') {
    const skillHint = state.classKey === 'assassin' ? 'Shadow Step gây thêm sát thương và né phản công.'
      : state.classKey === 'sorceress' ? 'Arcane Burst gây sát thương phép mạnh.'
        : 'Iron Will gây thêm sát thương.';
    return `👹 **${encounter.name}** · ${rankLabel(encounter.rank)}\n❤️ ${formatCoins(encounter.hp)}/${formatCoins(encounter.maxHp)} HP · ⚔️ ${formatCoins(encounter.damageMin)}–${formatCoins(encounter.damageMax)} · 🛡️ ${formatCoins(encounter.defense)}\n**Tấn công:** đánh và hồi 1 năng lượng. **Phòng thủ:** giảm đòn kế tiếp, hồi 1 năng lượng. **Kỹ năng:** tốn 2 năng lượng — ${skillHint}\n**Bình máu:** hồi 35% HP tối đa; quái vẫn đánh trả nếu còn sống.`;
  }
  if (encounter.type === 'chest') return `📦 **HÒM BÍ ẨN**\n${encounter.inspected ? 'Đã kiểm tra một lần; kết quả có thể không phát hiện được Mimic.' : 'Kiểm tra một lần để thử phát hiện Mimic; Mở để nhận đồ hoặc có thể phải đánh Mimic; Bán để lấy thêm 15% tiền cược vào payout.'}${encounter.revealed ? '\n🚨 Mimic đã bị phát hiện: **Tránh Mimic** để đi tiếp an toàn.' : ''}`;
  if (encounter.type === 'shrine') return '🗿 **SHRINE KHÔNG RÕ NGUỒN GỐC**\n**Chạm Shrine** để nhận hiệu ứng ngẫu nhiên (có cả hiệu ứng gây hại), hoặc **Bỏ qua** để đi tiếp.';
  if (encounter.type === 'rngesus') return '☠️ **RNGesus · HP ∞ · KHÔNG THỂ BỊ ĐÁNH BẠI**\nChiến đấu là chết. Bỏ chạy: 65% sống; Hối lộ: mất 40% payout; Cầu nguyện: 10% nhận Legendary, nếu trượt sẽ chết; Vé: tiêu thụ 1 vé để thoát.';
  if (encounter.type === 'trap') {
    const names = { tax_collector: '🧾 TAX COLLECTOR', potion_thief: '🦹 KẺ TRỘM BÌNH MÁU', wrong_portal: '🌀 WRONG PORTAL' };
    const detail = encounter.kind === 'tax_collector' ? 'Đi tiếp sẽ giảm payout 15%.'
      : encounter.kind === 'potion_thief' ? 'Đi tiếp có thể mất 1 bình máu.'
        : 'Đi tiếp sẽ giữ nguyên tầng và roll sự kiện mới.';
    return `**${names[encounter.kind]}**\nChọn **Chấp nhận số phận** để xử lý: ${detail}`;
  }
  return '🕳️ **PHÒNG TRỐNG**\nBấm **Đi tiếp** để vượt tầng. Có thể rút thưởng thay vì tiếp tục.';
}
function chaosLabel(state) {
  const chance = state.lastChaosChance || 0;
  if (!chance) return '🟢 Chaos: Yên';
  if (chance < 0.01) return '🟢 Chaos: Thấp';
  if (chance < 0.03) return '🟡 Chaos: Bất ổn';
  return `🔴 Chaos: NGUY HIỂM${state.lastChaosSpike ? ' · SPIKE' : ''}`;
}
function hardcoreEmbed(state, userId, result, classes, sessionId = null) {
  const classInfo = classes[state.classKey]; const payout = potentialPayout(state);
  const items = state.items.length ? state.items.slice(-4).map(item => `• ${item.name} (${item.rarity})`).join('\n') : 'Chưa có';
  const embed = new EmbedBuilder().setColor(result ? (result.outcome === 'win' ? 0x2ECC71 : 0xE74C3C) : state.floor > 100 ? 0x9B59B6 : 0xE67E22)
    .setTitle(`${classInfo.emoji} SINH TỒN · TẦNG ${state.floor}${state.floor > 100 ? ' · OVERRUN' : ''}`)
    .setDescription(`## 👤 <@${userId}>\n\n## ⚠️ TÌNH HUỐNG HIỆN TẠI\n### ${encounterText(state)}`)
    .addFields(
      { name: 'Nhân vật', value: `❤️ ${formatCoins(state.hp)}/${formatCoins(state.maxHp)}\n⚔️ ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}\n🛡️ ${formatCoins(state.defense)} · ✨ ${state.energy}/${state.maxEnergy}`, inline: true },
      { name: 'Run', value: `Đã vượt: ${state.cleared}\nBoss: ${state.bosses}\n🍀 Luck: ${state.luck}\n🧪 Bình: ${state.potions}\n${chaosLabel(state)}`, inline: true },
      { name: '💰 PAYOUT NẾU RÚT', value: state.cleared ? `## ${formatCoins(payout)} :coin:\nx${baseMultiplier(state).toFixed(2)}` : '**Chưa thể rút**', inline: true },
      { name: 'Trang bị gần nhất', value: items, inline: false }, { name: '📜 DIỄN BIẾN', value: `### ${String(state.lastLog || '—').slice(0, 1000)}` },
    );
  if (result) {
    const won = result.reason === 'cashout' || result.reason === 'summit';
    const reason = won ? `rút thưởng tầng ${state.floor}` : result.reason === 'forfeit' ? 'bỏ run' : `💀 tử trận tầng ${state.floor}`;
    embed.addFields({ name: '🏁 KẾT QUẢ', value: resultBlock({ userId, outcome: result.outcome, stake: state.stake, payout: result.payout, result, reason }) });
    if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  } else embed.setFooter({ text: `${sessionId ? `Mã ván: ${sessionId} • ` : ''}Lượt ${state.turn} • Cược ${formatCoins(state.stake)} :coin: • Tầng 100 hoàn thành • Tối đa 999` });
  return embed;
}
function button(sessionId, turn, action, label, emoji, style, disabled = false) {
  return new ButtonBuilder().setCustomId(`hardcore:${sessionId}:${turn}:${action}`).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
}
function hardcoreRows(sessionId, state, disabled, classes) {
  if (disabled) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:hardcore:${state.stake}:${state.classKey}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  const turn = state.turn; const retreat = button(sessionId, turn, 'retreat', state.cleared ? 'Rút thưởng' : 'Bỏ run', state.cleared ? '💰' : '🏳️', ButtonStyle.Danger);
  if (state.phase === 'summit') return [new ActionRowBuilder().addComponents(retreat)];
  if (state.phase === 'upgrade') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'upgrade_attack', '+5 Damage', '⚔️', ButtonStyle.Primary), button(sessionId, turn, 'upgrade_hp', '+30 HP', '❤️', ButtonStyle.Success), button(sessionId, turn, 'upgrade_defense', '+6 Defense', '🛡️', ButtonStyle.Secondary), button(sessionId, turn, 'upgrade_luck', '+2 Luck', '🍀', ButtonStyle.Secondary), retreat)];
  const type = state.encounter.type;
  if (type === 'combat') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'attack', 'Tấn công', '⚔️', ButtonStyle.Primary), button(sessionId, turn, 'defend', 'Phòng thủ', '🛡️', ButtonStyle.Secondary), button(sessionId, turn, 'skill', classes[state.classKey].skill, '✨', ButtonStyle.Success, state.energy < 2), button(sessionId, turn, 'potion', `Bình máu (${state.potions})`, '🧪', ButtonStyle.Secondary, state.potions <= 0), retreat)];
  if (type === 'chest') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'open', 'Mở hòm', '🔓', ButtonStyle.Primary), button(sessionId, turn, 'inspect', 'Kiểm tra', '👁️', ButtonStyle.Secondary, state.encounter.inspected), button(sessionId, turn, 'sell', 'Bán hòm', '💵', ButtonStyle.Success), button(sessionId, turn, 'leave', 'Tránh Mimic', '🚪', ButtonStyle.Secondary, !state.encounter.revealed), retreat)];
  if (type === 'shrine') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'touch', 'Chạm Shrine', '🗿', ButtonStyle.Primary), button(sessionId, turn, 'ignore', 'Bỏ qua', '🚶', ButtonStyle.Secondary), retreat)];
  if (type === 'rngesus') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'fight', 'Chiến đấu', '⚔️', ButtonStyle.Danger), button(sessionId, turn, 'flee', 'Bỏ chạy 65%', '🏃', ButtonStyle.Primary), button(sessionId, turn, 'bribe', 'Hối lộ −40%', '💸', ButtonStyle.Secondary), button(sessionId, turn, 'pray', 'Cầu nguyện 10%', '🙏', ButtonStyle.Success), button(sessionId, turn, 'escape_token', `Vé (${state.escapeTokens})`, '🪞', ButtonStyle.Secondary, state.escapeTokens <= 0))];
  return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'continue', type === 'trap' ? 'Chấp nhận số phận' : 'Đi tiếp', '➡️', ButtonStyle.Primary), retreat)];
}
module.exports = { rankLabel, encounterText, chaosLabel, hardcoreEmbed, hardcoreRows };
