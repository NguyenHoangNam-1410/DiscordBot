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
    const key = `${item.name}:${item.rarity || 'common'}:${item.definition?.base || ''}`;
    const previous = merged.get(key);
    if (previous) {
      previous.level += level;
      previous.cleansedLevels = Math.min(previous.level, (previous.cleansedLevels || 0) + (item.cleansedLevels || 0));
      if (item.text) previous.text = item.text;
      if (item.definition) previous.definition = item.definition;
    } else merged.set(key, { ...item, rarity: item.rarity || 'common', text: item.text || null, level });
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

function statText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(statText).join('\n');
  if (typeof value === 'object' && (value.stat || value.name) && (value.value != null || value.min != null))
    return `${value.stat || value.name} ${value.value ?? `${value.min} to ${value.max ?? value.min}`}`;
  if (typeof value === 'object') return Object.entries(value).map(([key, part]) => `${key} ${statText(part)}`).join('\n');
  const text = String(value);
  if (/^[\[{]/.test(text.trim())) { try { return statText(JSON.parse(text)); } catch { /* Plain text stats are supported too. */ } }
  return text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp);/g, ' ');
}

function convertMedianItem(row, rarity) {
  const name = String(row.name || row.item_name || row.title || '').trim();
  if (!name) return null;
  const base = String(row.base_type || row.base_item || row.base_name || row.base || row.item_base || '').trim().replace(/\s+/g, ' ');
  const source = String(row.type_code || row.source_type || row.source || row.category || row.item_type || row.type || row.quality || row.section || '');
  const text = statText(row.stats_json || row.stats || row.modifiers || row.properties || row.mods || row.description || '');
  const item = { id: row.id ?? name, name, base, source, variant: row.tier_or_variant || null };
  const totals = { attack: 0, defense: 0, resistance: 0, maxHp: 0, critChance: 0 };
  for (const line of text.split(/[\n;]|<br\s*\/?\s*>/i)) {
    if (/required|item level|socketed|chance to cast|based on character level|(?:strength|dexterity) damage bonus|life stolen|enemy.*resist/i.test(line)) continue;
    const numbers = [...line.matchAll(/[-+]?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
    if (!numbers.length) continue;
    const value = numbers.length >= 2 && /\bto\b|\d\s*[-–]\s*\d/.test(line) ? (Math.abs(numbers[0]) + Math.abs(numbers[1])) / 2 : numbers[0];
    if (/resist|all res|kháng/i.test(line)) totals.resistance += value * 0.3;
    else if (/critical|deadly strike|crushing blow/i.test(line)) totals.critChance += value / 1000;
    else if (/defen|armor|phòng thủ/i.test(line)) totals.defense += value * 0.05;
    else if (/life|vitality|hit points|maximum hp/i.test(line)) totals.maxHp += value * 0.15;
    else if (/damage|strength|dexterity|energy|sát thương/i.test(line)) totals.attack += value * 0.03;
  }
  for (const [key, value] of Object.entries(totals)) {
    if (value > 0) item[key] = key === 'critChance' ? Math.min(0.06, value) : Math.max(1, Math.round(Math.min({ attack: 14, defense: 30, resistance: 12, maxHp: 50 }[key], value)));
  }
  if (!Object.keys(totals).some(key => item[key])) item.attack = { common: 2, rare: 4, legendary: 9, cursed: 14 }[rarity];
  if (item.maxHp) item.heal = item.maxHp;
  if (rarity === 'cursed') item.bonusPenalty = 0.15;
  item.text = effectText(item, 1);
  return item;
}

// The Median catalog is optional and opened read-only; equipment stays inside the run.
function loadMedianEquipment(fallback, databasePath) {
  const path = require('node:path'); const fs = require('node:fs');
  const filename = path.resolve(databasePath || process.env.MEDIAN_XL_DB_PATH || path.join(__dirname, '../../data/median-xl.sqlite'));
  if (!fs.existsSync(filename)) return fallback;
  let database;
  try {
    database = new (require('better-sqlite3'))(filename, { readonly: true, fileMustExist: true });
    const rows = database.prepare('SELECT * FROM items').all();
    const result = { common: [], rare: [], legendary: [], cursed: [] };
    for (const row of rows) {
      const source = [row.type_code, row.source_type, row.source, row.category, row.item_type, row.type, row.quality, row.section, row.item_group].filter(Boolean).join(' ');
      const rarity = /\bRW\b|runeword/i.test(source) ? 'rare' : /\bSU\b|sacred unique|\bset\b/i.test(source) ? 'legendary'
        : /\bTU\b|tiered unique/i.test(source) ? 'common' : null;
      if (!rarity) continue;
      const item = convertMedianItem(row, rarity);
      if (item) result[rarity].push(item);
      if (rarity === 'legendary' && !/\bset\b/i.test(source)) {
        const cursed = convertMedianItem(row, 'cursed');
        if (cursed) result.cursed.push(cursed);
      }
    }
    return Object.fromEntries(Object.entries(result).map(([key, items]) => {
      const unique = new Map();
      for (const item of items) {
        const identity = `${item.name}:${item.base}`;
        const previous = unique.get(identity);
        const tier = entry => Number(String(entry.variant || '').match(/Tier\s+(\d+)/i)?.[1] || 0);
        if (!previous || tier(item) > tier(previous)) unique.set(identity, item);
      }
      return [key, unique.size ? [...unique.values()] : fallback[key]];
    }));
  } catch (error) {
    console.warn(`Median XL equipment unavailable: ${error.message}`);
    return fallback;
  } finally { database?.close(); }
}

module.exports = { RARITY_TIERS, rarityLabel, normalizeEquipment, effectText, convertMedianItem, loadMedianEquipment };
