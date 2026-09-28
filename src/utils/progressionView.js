function formatExperience(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function experienceField(result) {
  const gained = Number(result?.experienceGained || 0);
  if (!Number.isFinite(gained) || gained <= 0) return null;
  const lines = [`**+${formatExperience(gained)} EXP**`];
  const levels = Array.isArray(result.levelUps) ? result.levelUps : [];
  if (levels.length) lines.push(`🎉 Lên **cấp ${levels.at(-1).level}**!`);
  return { name: '⭐ KINH NGHIỆM', value: lines.join('\n'), inline: true };
}

function addExperienceField(embed, result) {
  const field = experienceField(result);
  if (field) embed.addFields(field);
  const bonus = bonusDropText(result?.bonusDrops);
  if (bonus) embed.addFields({ name: '🎉 BUFF SỰ KIỆN', value: bonus, inline: true });
  return embed;
}

function bonusDropText(drops) {
  if (!Array.isArray(drops) || !drops.length) return '';
  const labels = { coins: 'xu', diamonds: '💎', free_pull: 'lượt Gacha miễn phí' };
  return drops.map(drop => `**+${Number(drop.amount).toLocaleString('vi-VN')} ${labels[drop.type] || drop.type}**`).join('\n');
}

function experienceLines(entries) {
  return entries
    .filter(entry => Number(entry?.experienceGained || 0) > 0 || bonusDropText(entry?.bonusDrops))
    .map(entry => `<@${entry.userId}>${Number(entry.experienceGained || 0) > 0 ? ` **+${formatExperience(entry.experienceGained)} EXP**` : ''}${entry.levelUps?.length ? ` · Cấp ${entry.levelUps.at(-1).level}` : ''}${bonusDropText(entry.bonusDrops) ? ` · ${bonusDropText(entry.bonusDrops).replace(/\n/g, ' · ')}` : ''}`);
}

module.exports = { experienceField, addExperienceField, experienceLines, bonusDropText };
