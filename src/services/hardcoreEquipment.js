const RARITY_TIERS = Object.freeze({ common: 'R', rare: 'SR', legendary: 'SSR', cursed: 'UR' });

function rarityLabel(rarity) {
  const tier = RARITY_TIERS[rarity] || rarity || 'R';
  return rarity === 'cursed' ? `${tier} · Nguyền` : tier;
}

function normalizeEquipment(items) {
  const merged = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.name) continue;
    const level = Number.isSafeInteger(item.level) && item.level > 0 ? item.level : 1;
    const previous = merged.get(item.name);
    if (previous) {
      previous.level += level;
      if (item.text) previous.text = item.text;
    } else merged.set(item.name, { name: item.name, rarity: item.rarity || 'common', text: item.text || null, level });
  }
  return [...merged.values()];
}

function effectText(item, level) {
  if (!item) return 'Không rõ tác dụng';
  const effects = [];
  const sign = value => `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
  if (item.attack) effects.push(`${sign(item.attack * level)} sát thương`);
  if (item.defense) effects.push(`${sign(item.defense * level)} phòng thủ`);
  if (item.maxHp) effects.push(`${sign(item.maxHp * level)} HP tối đa`);
  if (item.resistance) effects.push(`${sign(item.resistance * level)}% kháng phép`);
  if (item.critChance) effects.push(`+${Math.round(item.critChance * level * 100)}% chí mạng`);
  if (item.luck) effects.push(`${sign(item.luck * level)} may mắn`);
  if (item.heal) effects.push(`hồi tối đa ${item.heal} HP mỗi cấp`);
  if (item.potions) effects.push(`đã nhận ${item.potions * level} bình máu`);
  if (item.escapeTokens) effects.push(`đã nhận ${item.escapeTokens * level} Vé Thoát Hiểm`);
  if (item.defenseSet !== undefined) effects.push(`phòng thủ về ${item.defenseSet} mỗi lần nhặt`);
  if (item.bonusPenalty) effects.push(`payout giảm ${Math.round((1 - (1 - item.bonusPenalty) ** level) * 100)}% cộng dồn`);
  return effects.join(' · ') || item.text || 'Không rõ tác dụng';
}

module.exports = { RARITY_TIERS, rarityLabel, normalizeEquipment, effectText };
