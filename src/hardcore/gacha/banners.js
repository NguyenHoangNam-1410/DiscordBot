"use strict";
const crypto = require("node:crypto");
const definitions = require("./banners.json");
const characters = require("../characters");
const { ITEMS, ITEM_ALIASES } = require("../item");
const GEM_COST = 300,
  SSR_SPARK_COST = 200;
function validate(b) {
  if (
    !b ||
    !/^[a-z][a-z0-9_]{0,23}$/.test(b.id) ||
    !Number.isSafeInteger(b.version) ||
    b.version < 1 ||
    typeof b.name !== "string" ||
    !b.name ||
    b.name.length > 100 ||
    typeof b.enabled !== "boolean" ||
    !["ticket", "gems"].includes(b.payment?.kind) ||
    !/^[a-z][a-z0-9_]{0,39}$/.test(b.payment?.currencyId || "") ||
    !Number.isSafeInteger(b.payment.unitCost) ||
    b.payment.unitCost < 1 ||
    (b.payment.kind === "gems" && b.payment.unitCost !== GEM_COST) ||
    !Array.isArray(b.pool) ||
    !b.pool.length ||
    b.pool.some((x) => !Number.isSafeInteger(x.weight) || x.weight <= 0)
  )
    throw Error("INVALID_CHARACTER_BANNER");
  if (
    b.spark &&
    (!/^[a-z][a-z0-9_]{0,39}$/.test(b.spark.currencyId) ||
      b.spark.perPull !== 1)
  )
    throw Error("INVALID_BANNER_SPARK");
  if (!Number.isSafeInteger(b.pool.reduce((n, x) => n + x.weight, 0)))
    throw Error("INVALID_CHARACTER_BANNER");
  return b;
}
function resolve(b) {
  validate(b);
  const groups = b.pool.map((p) => {
    let entries;
    if (p.kind === "item" && p.rarity === "R" && p.source === "survival_r")
      entries = Object.values(ITEMS)
        .flat()
        .filter(
          (x) =>
            x.typeCode === "R" &&
            x.gachaEligible !== false &&
            x.category !== "consumable" &&
            !Object.hasOwn(ITEM_ALIASES, x.id),
        )
        .map((x) => ({
          kind: "item",
          id: x.id,
          name: x.name,
          rarity: "R",
          quantity: 1,
          catalogVersion: x.catalogVersion,
        }));
    else if (
      p.kind === "character" &&
      ["SR", "SSR"].includes(p.rarity) &&
      Array.isArray(p.characterIds) &&
      new Set(p.characterIds).size === p.characterIds.length
    )
      entries = p.characterIds.map((id) => {
        const c = characters.get(id);
        if (!c || c.rarity !== p.rarity)
          throw Error("INVALID_BANNER_CHARACTER");
        return {
          kind: "character",
          id: c.id,
          name: c.name,
          rarity: c.rarity,
          classKey: c.classKey,
        };
      });
    else throw Error("INVALID_BANNER_POOL");
    if (!entries.length) throw Error("EMPTY_CHARACTER_POOL");
    return { kind: p.kind, rarity: p.rarity, weight: p.weight, entries };
  });
  return {
    ...structuredClone(b),
    groups,
    totalWeight: groups.reduce((n, g) => n + g.weight, 0),
  };
}
function freeze(v) {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const registry = new Map();
for (const b of definitions.banners) {
  if (registry.has(b.id)) throw Error("DUPLICATE_BANNER");
  registry.set(b.id, freeze(resolve(b)));
}
const get = (id) => registry.get(id) || null;
const list = () => [...registry.values()].filter((b) => b.enabled);
const random = () => crypto.randomInt(2 ** 32) / 2 ** 32;
function unit(rng) {
  const n = rng();
  if (!Number.isFinite(n) || n < 0 || n >= 1)
    throw Error("INVALID_GACHA_RANDOM");
  return n;
}
function roll(b, rng = random) {
  let point = unit(rng) * b.totalWeight;
  const g = b.groups.find((g) => (point -= g.weight) < 0) || b.groups.at(-1);
  return { ...g.entries[Math.floor(unit(rng) * g.entries.length)] };
}
module.exports = {
  GEM_COST,
  SSR_SPARK_COST,
  get,
  list,
  validate,
  resolve,
  roll,
  random,
};
