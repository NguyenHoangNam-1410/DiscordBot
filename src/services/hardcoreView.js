const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { formatCoins } = require('../utils/economy');
const { baseMultiplier, potentialPayout } = require('./hardcoreEngine');
const { addExperienceField } = require('../utils/progressionView');

function rankLabel(rank) { return { normal: 'Thường', elite: 'Elite', boss: 'BOSS', mimic: 'Mimic', ancient_mimic: 'Ancient Mimic' }[rank] || rank; }
function encounterText(state) {
  const encounter = state.encounter;
  if (state.phase === 'upgrade') return `🎁 **NÂNG CẤP SAU MỐC TẦNG ${encounter.milestone}**\nChọn một chỉ số. Nâng cấp chỉ tồn tại trong run.`;
  if (state.phase === 'summit') return '🏆 **ĐÃ CHINH PHỤC TẦNG 999**\nĐây là giới hạn kỹ thuật của Sinh tồn.';
  if (encounter.type === 'combat') return `👹 **${encounter.name}** · ${rankLabel(encounter.rank)}\n❤️ ${formatCoins(encounter.hp)}/${formatCoins(encounter.maxHp)} HP · ⚔️ ${formatCoins(encounter.damageMin)}–${formatCoins(encounter.damageMax)} · 🛡️ ${formatCoins(encounter.defense)}`;
  if (encounter.type === 'chest') return `📦 **HÒM BÍ ẨN**${encounter.inspected ? '\nBạn đã kiểm tra chiếc hòm này.' : '\nCó thể mở, kiểm tra hoặc bán.'}`;
  if (encounter.type === 'shrine') return '🗿 **SHRINE KHÔNG RÕ NGUỒN GỐC**\nChạm vào có thể nhận buff hoặc một bài học.';
  if (encounter.type === 'rngesus') return '☠️ **RNGesus · HP ∞ · KHÔNG THỂ BỊ ĐÁNH BẠI**\nBạn có đúng một quyết định.';
  if (encounter.type === 'trap') {
    const names = { tax_collector: '🧾 TAX COLLECTOR', potion_thief: '🦹 KẺ TRỘM BÌNH MÁU', wrong_portal: '🌀 WRONG PORTAL' };
    return `**${names[encounter.kind]}**\nBạn phải xử lý sự kiện để đi tiếp.`;
  }
  return '🕳️ **PHÒNG TRỐNG**\nKhông quái, không đồ, không lý do tồn tại.';
}
function chaosLabel(state) {
  const chance = state.lastChaosChance || 0;
  if (!chance) return '🟢 Chaos: Yên';
  if (chance < 0.01) return '🟢 Chaos: Thấp';
  if (chance < 0.03) return '🟡 Chaos: Bất ổn';
  return `🔴 Chaos: NGUY HIỂM${state.lastChaosSpike ? ' · SPIKE' : ''}`;
}
function hardcoreEmbed(state, userId, result, classes) {
  const classInfo = classes[state.classKey]; const payout = potentialPayout(state);
  const items = state.items.length ? state.items.slice(-4).map(item => `• ${item.name} (${item.rarity})`).join('\n') : 'Chưa có';
  const embed = new EmbedBuilder().setColor(result ? (result.outcome === 'win' ? 0x2ECC71 : 0xE74C3C) : state.floor > 100 ? 0x9B59B6 : 0xE67E22)
    .setTitle(`${classInfo.emoji} SINH TỒN · TẦNG ${state.floor}${state.floor > 100 ? ' · OVERRUN' : ''}`)
    .setDescription(`## 👤 <@${userId}>\n\n## ⚠️ TÌNH HUỐNG HIỆN TẠI\n### ${encounterText(state)}`)
    .addFields(
      { name: 'Nhân vật', value: `❤️ ${formatCoins(state.hp)}/${formatCoins(state.maxHp)}\n⚔️ ${formatCoins(state.damageMin)}–${formatCoins(state.damageMax)}\n🛡️ ${formatCoins(state.defense)} · ✨ ${state.energy}/${state.maxEnergy}`, inline: true },
      { name: 'Run', value: `Đã vượt: ${state.cleared}\nBoss: ${state.bosses}\n🍀 Luck: ${state.luck}\n🧪 Bình: ${state.potions}\n${chaosLabel(state)}`, inline: true },
      { name: '💰 PAYOUT NẾU RÚT', value: state.cleared ? `## ${formatCoins(payout)} xu\nx${baseMultiplier(state).toFixed(2)}` : '**Chưa thể rút**', inline: true },
      { name: 'Trang bị gần nhất', value: items, inline: false }, { name: '📜 DIỄN BIẾN', value: `### ${String(state.lastLog || '—').slice(0, 1000)}` },
    );
  if (result) {
    const text = result.reason === 'cashout' || result.reason === 'summit' ? `💰 Kết thúc run và nhận **${formatCoins(result.payout)} xu**.`
      : result.reason === 'forfeit' ? `🏳️ Bỏ run trước khi vượt tầng đầu, mất **${formatCoins(state.stake)} xu**.`
        : `💀 Run kết thúc tại tầng ${state.floor}. Mất toàn bộ payout tạm giữ.`;
    embed.addFields({ name: 'Kết quả', value: text }).setFooter({ text: `Số dư: ${formatCoins(result.balance)} xu` });
    addExperienceField(embed, result);
    if (result.achievements?.length) embed.addFields({ name: '🏅 Thành tựu mới', value: result.achievements.map(item => `**${item.name}**`).join('\n') });
  } else embed.setFooter({ text: `Lượt ${state.turn} • Cược ${formatCoins(state.stake)} xu • Tầng 100 hoàn thành • Tối đa 999` });
  return embed;
}
function button(sessionId, turn, action, label, emoji, style, disabled = false) {
  return new ButtonBuilder().setCustomId(`hardcore:${sessionId}:${turn}:${action}`).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
}
function hardcoreRows(sessionId, state, disabled, classes) {
  if (disabled) return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`replay:hardcore:${state.stake}:${state.classKey}`).setLabel('Chơi lại').setEmoji('🔁').setStyle(ButtonStyle.Success))];
  const turn = state.turn; const retreat = button(sessionId, turn, 'retreat', state.cleared ? 'Rút thưởng' : 'Bỏ run', state.cleared ? '💰' : '🏳️', ButtonStyle.Danger);
  if (state.phase === 'summit') return [new ActionRowBuilder().addComponents(retreat)];
  if (state.phase === 'upgrade') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'upgrade_attack', '+3 Damage', '⚔️', ButtonStyle.Primary), button(sessionId, turn, 'upgrade_hp', '+20 HP', '❤️', ButtonStyle.Success), button(sessionId, turn, 'upgrade_defense', '+4 Defense', '🛡️', ButtonStyle.Secondary), button(sessionId, turn, 'upgrade_luck', '+2 Luck', '🍀', ButtonStyle.Secondary), retreat)];
  const type = state.encounter.type;
  if (type === 'combat') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'attack', 'Tấn công', '⚔️', ButtonStyle.Primary), button(sessionId, turn, 'defend', 'Phòng thủ', '🛡️', ButtonStyle.Secondary), button(sessionId, turn, 'skill', classes[state.classKey].skill, '✨', ButtonStyle.Success, state.energy < 2), button(sessionId, turn, 'potion', `Bình máu (${state.potions})`, '🧪', ButtonStyle.Secondary, state.potions <= 0), retreat)];
  if (type === 'chest') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'open', 'Mở hòm', '🔓', ButtonStyle.Primary), button(sessionId, turn, 'inspect', 'Kiểm tra', '👁️', ButtonStyle.Secondary, state.encounter.inspected), button(sessionId, turn, 'sell', 'Bán hòm', '💵', ButtonStyle.Success), button(sessionId, turn, 'leave', 'Tránh Mimic', '🚪', ButtonStyle.Secondary, !state.encounter.revealed), retreat)];
  if (type === 'shrine') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'touch', 'Chạm Shrine', '🗿', ButtonStyle.Primary), button(sessionId, turn, 'ignore', 'Bỏ qua', '🚶', ButtonStyle.Secondary), retreat)];
  if (type === 'rngesus') return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'fight', 'Chiến đấu', '⚔️', ButtonStyle.Danger), button(sessionId, turn, 'flee', 'Bỏ chạy 65%', '🏃', ButtonStyle.Primary), button(sessionId, turn, 'bribe', 'Hối lộ −40%', '💸', ButtonStyle.Secondary), button(sessionId, turn, 'pray', 'Cầu nguyện 10%', '🙏', ButtonStyle.Success), button(sessionId, turn, 'escape_token', `Vé (${state.escapeTokens})`, '🪞', ButtonStyle.Secondary, state.escapeTokens <= 0))];
  return [new ActionRowBuilder().addComponents(button(sessionId, turn, 'continue', type === 'trap' ? 'Chấp nhận số phận' : 'Đi tiếp', '➡️', ButtonStyle.Primary), retreat)];
}
module.exports = { rankLabel, encounterText, chaosLabel, hardcoreEmbed, hardcoreRows };
