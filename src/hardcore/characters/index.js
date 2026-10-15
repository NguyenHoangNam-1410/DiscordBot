"use strict";
const catalog = require("./catalog.json");
const CLASSES = Object.freeze({
  warrior: Object.freeze({
    name: "Chiến binh",
    primaryStat: "str",
    build: "STR",
  }),
  guardian: Object.freeze({
    name: "Thủ vệ",
    primaryStat: "vit",
    build: "VIT / DEF",
  }),
  assassin: Object.freeze({
    name: "Sát thủ",
    primaryStat: "dex",
    build: "DEX",
  }),
  mage: Object.freeze({ name: "Pháp sư", primaryStat: "ene", build: "ENE" }),
});
const RARITIES = Object.freeze(["SR", "SSR", "SSR+", "UR", "UR+", "LR"]);
function validate(entries = catalog.characters) {
  const ids = new Set();
  for (const c of entries) {
    if (
      !/^[a-z][a-z0-9_]{0,23}$/.test(c.id) ||
      ids.has(c.id) ||
      c.id === "all" ||
      typeof c.name !== "string" ||
      !c.name ||
      c.name.length > 80 ||
      typeof c.role !== "string" ||
      !c.role ||
      c.role.length > 500 ||
      typeof c.starter !== "boolean" ||
      !RARITIES.includes(c.rarity) ||
      !Object.hasOwn(CLASSES, c.classKey) ||
      !Object.hasOwn(require("../engine/stats").CLASSES, c.profileKey)
    )
      throw Error("INVALID_CHARACTER_CATALOG");
    if (
      c.souls.length !== 6 ||
      c.souls.some((s, i) => s.level !== i + 1 || !s.name || !s.description)
    )
      throw Error("INVALID_CHARACTER_SOULS");
    ids.add(c.id);
  }
  return true;
}
const get = (id) => catalog.characters.find((c) => c.id === id) || null;
function list({ rarity = "all", classKey = "all" } = {}) {
  return catalog.characters.filter(
    (c) =>
      (rarity === "all" || c.rarity === rarity) &&
      (classKey === "all" || c.classKey === classKey),
  );
}
// Starter ownership is an account entitlement, not a run reward. Future recruits
// must come from an explicit ownership store; absence never unlocks a nonstarter.
function ownedCharacters() {
  return Object.fromEntries(
    catalog.characters
      .filter((c) => c.starter)
      .map((c) => [c.id, { characterId: c.id, soulLevel: 0 }]),
  );
}
function preview(id) {
  const c = get(id);
  if (!c) throw Error("INVALID_CHARACTER");
  return require("../engine/stats").createState(c.profileKey, 0, {
    gameplayVersion: 3,
  });
}
module.exports = {
  catalog,
  CLASSES,
  RARITIES,
  get,
  list,
  ownedCharacters,
  preview,
  validate,
};
