const RARITY_ICON = Object.freeze({ XU: '🪙', R: '🔵', SR: '🟣', SSR: '🟠', UR: '🔴' });
const LEGACY_RARITY_ICON = Object.freeze({ common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟠', mythic: '🔴' });

function itemIcon(item) {
  if (item?.type === 'color') return item.emoji || '🎨';
  return RARITY_ICON[item?.rarity] || LEGACY_RARITY_ICON[item?.rarity] || '▫️';
}

module.exports = { RARITY_ICON, itemIcon };
