const emojiMap = require("../discordEmojiMap");
const STAT_EMOJI = Object.freeze({
  hp: emojiMap[":heart:"],
  attack: emojiMap[":crossed_swords:"],
  defense: emojiMap[":shield:"],
  accuracy: emojiMap[":dart:"],
  evasion: emojiMap[":dash:"],
  crit: emojiMap[":boom:"],
  resistance: emojiMap[":crystal_ball:"],
  energy: emojiMap[":sparkles:"],
  luck: emojiMap[":four_leaf_clover:"],
  potions: emojiMap[":test_tube:"],
  tickets: emojiMap[":ticket:"],
  payout: emojiMap[":moneybag:"],
});
const RARITY_TIERS = Object.freeze({
  common: "R",
  rare: "SR",
  legendary: "SSR",
  cursed: "UR",
});

function rarityLabel(rarity) {
  const tier = RARITY_TIERS[rarity] || rarity || "R";
  return rarity === "cursed" ? `${tier} · Nguyền` : tier;
}

function normalizeEquipment(items) {
  const merged = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.name) continue;
    const level =
      Number.isSafeInteger(item.level) && item.level > 0 ? item.level : 1;
    const key = `${item.name}:${item.rarity || "common"}:${item.definition?.base || ""}`;
    const previous = merged.get(key);
    if (previous) {
      previous.level += level;
      previous.cleansedLevels = Math.min(
        previous.level,
        (previous.cleansedLevels || 0) + (item.cleansedLevels || 0),
      );
      if (item.text) previous.text = item.text;
      if (item.definition) previous.definition = item.definition;
      previous.levelEffects = [
        ...(previous.levelEffects || []),
        ...(item.levelEffects || []),
      ];
    } else
      merged.set(key, {
        ...item,
        rarity: item.rarity || "common",
        text: item.text || null,
        level,
      });
  }
  return [...merged.values()];
}

function effectText(item, level) {
  if (!item) return "Không rõ tác dụng";
  if (item.effects)
    return effectText({ ...item.effects, text: item.text }, level);
  const effects = [];
  const sign = (value) => `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
  if (item.attack)
    effects.push(
      `${STAT_EMOJI.attack} ${sign(item.attack * level)} sát thương`,
    );
  if (item.defense)
    effects.push(`${STAT_EMOJI.defense} ${sign(item.defense * level)} Defense`);
  if (item.maxHp)
    effects.push(`${STAT_EMOJI.hp} ${sign(item.maxHp * level)} HP tối đa`);
  if (item.resistance)
    effects.push(
      `${STAT_EMOJI.resistance} ${sign(item.resistance * level)}% Resist`,
    );
  if (item.critChance)
    effects.push(
      `${STAT_EMOJI.crit} ${sign(Math.round(item.critChance * level * 100))}% chí mạng`,
    );
  if (item.luck)
    effects.push(`${STAT_EMOJI.luck} ${sign(item.luck * level)} Luck`);
  if (item.heal)
    effects.push(`${STAT_EMOJI.hp} hồi tối đa ${item.heal} khi nhặt`);
  if (item.potions)
    effects.push(`${STAT_EMOJI.potions} đã nhận ${item.potions * level}`);
  if (item.escapeTokens)
    effects.push(`${STAT_EMOJI.tickets} đã nhận ${item.escapeTokens * level}`);
  if (item.defenseSet !== undefined)
    effects.push(`${STAT_EMOJI.defense} đặt về ${item.defenseSet} khi nhặt`);
  if (item.bonusPenalty)
    effects.push(
      `${STAT_EMOJI.payout} −${Math.round((1 - (1 - item.bonusPenalty) ** level) * 100)}% cộng dồn`,
    );
  for (const [key, label] of Object.entries({
    accuracy: "Accuracy",
    evasion: "Evasion",
    maxEnergy: "Energy tối đa",
  }))
    if (item[key]) effects.push(`${sign(item[key] * level)} ${label}`);
  for (const [key, label] of Object.entries({
    potionPower: "hồi bình máu",
    bossDamage: "damage lên Boss",
    eliteDamage: "damage lên Elite",
    mimicDetection: "phát hiện Mimic",
    goblinChance: "bắt Goblin",
    legendaryFind: "cơ hội SSR",
    floorHpLoss: "HP mất mỗi tầng",
    mimicChance: "Mimic",
    damageTaken: "damage nhận vào",
  }))
    if (item[key])
      effects.push(`${sign(Math.round(item[key] * level * 100))}% ${label}`);
  return effects.join(" · ") || item.text || "Không rõ tác dụng";
}

module.exports = {
  STAT_EMOJI,
  RARITY_TIERS,
  rarityLabel,
  normalizeEquipment,
  effectText,
};
