const { E, effectStatLabel } = require("./hardcoreIcons");
const { highlightStat, STAT_SEPARATOR } = require("./hardcoreUi");
const STAT_EMOJI = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries({
        hp: "hp",
        attack: "attack",
        defense: "defense",
        accuracy: "accuracy",
        evasion: "evasion",
        crit: "crit",
        resistance: "res",
        energy: "mana",
        luck: "luck",
        potions: "potion",
        tickets: "ticket",
        payout: "payout",
      }).map(([key, symbol]) => [
        key,
        { enumerable: true, get: () => E[symbol] },
      ]),
    ),
  ),
);
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

function effectText(item, level = 1) {
  if (!item) return "Không rõ tác dụng";
  if (item.effects)
    return effectText({ ...item.effects, text: item.text }, level);
  const effects = [];
  const sign = (value) => `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
  for (const key of [
    "str",
    "dex",
    "vit",
    "ene",
    "attack",
    "physical",
    "spell",
    "defense",
    "maxHp",
    "maxMana",
    "accuracy",
    "evasion",
    "maxEnergy",
    "luck",
  ])
    if (item[key])
      effects.push(
        `${highlightStat(effectStatLabel(key))} ${sign(item[key] * level)}`,
      );
  if (item.resistance)
    effects.push(
      `${highlightStat(effectStatLabel("resistance"))} ${sign(item.resistance * level)}%`,
    );
  if (item.critChance)
    effects.push(
      `${highlightStat(effectStatLabel("critChance"))} ${sign(Math.round(item.critChance * level * 100))}%`,
    );
  if (item.heal)
    effects.push(`${E.hp} **HP** hồi tối đa ${item.heal} khi nhặt`);
  if (item.potions)
    effects.push(`${E.potion} **Bình máu** đã nhận ${item.potions * level}`);
  if (item.escapeTokens)
    effects.push(`${E.ticket} **Vé** đã nhận ${item.escapeTokens * level}`);
  if (item.defenseSet !== undefined)
    effects.push(`${E.defense} **DEF** đặt về ${item.defenseSet} khi nhặt`);
  if (item.bonusPenalty)
    effects.push(
      `${highlightStat(effectStatLabel("bonusPenalty"))} −${Math.round((1 - (1 - item.bonusPenalty) ** level) * 100)}% cộng dồn`,
    );
  for (const key of [
    "potionPower",
    "bossDamage",
    "eliteDamage",
    "mimicDetection",
    "goblinChance",
    "legendaryFind",
    "floorHpLoss",
    "mimicChance",
    "damageTaken",
  ])
    if (item[key])
      effects.push(
        `${highlightStat(effectStatLabel(key))} ${sign(Math.round(item[key] * level * 100))}%`,
      );
  return effects.join(STAT_SEPARATOR) || item.text || "Không rõ tác dụng";
}

module.exports = {
  STAT_EMOJI,
  RARITY_TIERS,
  rarityLabel,
  normalizeEquipment,
  effectText,
};
