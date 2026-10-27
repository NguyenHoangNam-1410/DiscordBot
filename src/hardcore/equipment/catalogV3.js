"use strict";
const CLASSES = [
  "rha_kor",
  "venance",
  "assassin",
  "amazon",
  "barbarian",
  "sorceress",
  "necromancer",
  "druid",
  "paladin",
];
function build() {
  const result = structuredClone(require("./catalog.json"));
  validate(result);
  return result;
}
function validate(items) {
  const counts = { common: 32, rare: 28, legendary: 24, cursed: 16 },
    ids = new Set();
  for (const [rarity, count] of Object.entries(counts)) {
    if (items[rarity]?.length !== count)
      throw Error("INVALID_V3_CATALOG_COUNT");
    for (const item of items[rarity]) {
      if (ids.has(item.id)) throw Error("DUPLICATE_V3_ITEM");
      if (
        item.rarity !== rarity ||
        item.catalogVersion !== 3 ||
        !Object.keys(item.effects || {}).length ||
        (rarity === "cursed" && !Object.keys(item.curse?.effects || {}).length)
      )
        throw Error("INVALID_V3_ITEM");
      for (const value of Object.values({
        ...item.effects,
        ...item.curse?.effects,
      }))
        if (!Number.isFinite(value)) throw Error("INVALID_V3_ITEM_EFFECT");
      if (item.passive) require("../itemPassives").validate(item.passive);
      ids.add(item.id);
      if (
        item.affinity.type !== "universal" &&
        (!item.affinity.classes.length ||
          item.affinity.classes.filter(
            (k) => !["venance", "rha_kor"].includes(k),
          ).length > 3 ||
          new Set(item.affinity.classes).size !==
            item.affinity.classes.length ||
          item.affinity.classes.some((k) => !CLASSES.includes(k)))
      )
        throw Error("INVALID_ITEM_AFFINITY");
      if (
        item.affinityEffect.version !== 1 ||
        item.affinity.classes.some(
          (k) => item.affinityEffect.effects[k]?.kind !== k,
        )
      )
        throw Error("INVALID_AFFINITY_EFFECT");
    }
    if (items[rarity].filter((x) => x.affinity.type === "universal").length < 3)
      throw Error("MISSING_UNIVERSAL_POOL");
    for (const k of CLASSES)
      if (
        items[rarity].filter((x) => x.affinity.classes.includes(k)).length < 3
      )
        throw Error("MISSING_CLASS_POOL");
    for (const k of CLASSES)
      if (
        items[rarity].filter(
          (x) => x.affinity.type === "class" && !x.affinity.classes.includes(k),
        ).length < 3
      )
        throw Error("MISSING_OFF_CLASS_POOL");
  }
  return true;
}
module.exports = { build, validate, CLASSES };
