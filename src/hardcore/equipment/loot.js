"use strict";
const rules = require("./rules");
function weight(state, item) {
  const level =
    state.items.find((i) => i.definition.id === item.id)?.level || 0;
  return level === 0
    ? 1
    : level <= 2
      ? 0.8
      : level <= 4
        ? 0.5
        : level === 5
          ? 0.25
          : 0.1;
}
function pick(state, candidates, rng) {
  if (state.lootRulesVersion !== 2)
    return candidates[
      Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
    ];
  const alternatives = candidates.filter(
    (i) => i.id !== state.lastRolledItemId,
  );
  const pool = alternatives.length ? alternatives : candidates;
  let roll = rng() * pool.reduce((n, i) => n + weight(state, i), 0);
  let chosen = pool.at(-1);
  for (const i of pool) {
    roll -= weight(state, i);
    if (roll < 0) {
      chosen = i;
      break;
    }
  }
  state.lastRolledItemId = chosen.id;
  return chosen;
}
function relation(i, k) {
  return i.affinity?.type === "universal"
    ? "universal"
    : i.affinity?.classes.includes(k)
      ? "match"
      : "off";
}
function offers(
  state,
  rarities,
  rng,
  source,
  { unique = true, consumables = true } = {},
) {
  const { ITEMS_V3, CONSUMABLE_ITEMS } = require("../item");
  if (!rules.enabled(state)) throw Error("EQUIPMENT_RULES_REQUIRED");
  const pity = state.affinityPity;
  if (
    pity?.version !== 1 ||
    !Number.isInteger(pity.missStreak) ||
    pity.missStreak < 0 ||
    pity.missStreak > 3
  )
    throw Error("INVALID_AFFINITY_PITY");
  let force = pity.missStreak === 3;
  const seen = new Set(),
    buckets = [];
  const items = rarities.map((rarity) => {
    const pool = ITEMS_V3[rarity];
    if (!pool) throw Error("INVALID_ITEM_RARITY");
    const extras = Object.values(CONSUMABLE_ITEMS).filter(
      (x) =>
        consumables &&
        x.randomEligible &&
        x.rarity === rarity &&
        !seen.has(x.id) &&
        !(state.lootRulesVersion === 2 && state.lastRolledItemId === x.id),
    );
    if (
      extras.length &&
      rng() < extras.length / (pool.length + extras.length)
    ) {
      const item =
        extras[Math.min(extras.length - 1, Math.floor(rng() * extras.length))];
      if (state.lootRulesVersion === 2) state.lastRolledItemId = item.id;
      seen.add(item.id);
      buckets.push("consumable");
      return structuredClone(item);
    }
    const roll = force ? 0 : rng(),
      bucket = roll < 0.55 ? "match" : roll < 0.8 ? "universal" : "off";
    force = false;
    const available = pool.filter((x) => !unique || !seen.has(x.id));
    let candidates = available.filter(
      (x) => relation(x, state.classKey) === bucket,
    );
    if (!candidates.length) {
      const fallback = bucket === "universal" ? "match" : "universal";
      candidates = available.filter(
        (x) => relation(x, state.classKey) === fallback,
      );
      if (!candidates.length) candidates = available;
      state.affinityFallbackAudit = [
        ...(state.affinityFallbackAudit || []),
        { source, rarity, bucket, floor: state.floor },
      ].slice(-20);
    }
    if (!candidates.length) throw Error("EMPTY_AFFINITY_POOL");
    const item = pick(state, candidates, rng);
    seen.add(item.id);
    buckets.push(bucket);
    return structuredClone(item);
  });
  const equipment = items.filter((x) => x.category !== "consumable");
  if (equipment.length) {
    pity.missStreak = equipment.some(
      (x) => relation(x, state.classKey) === "match",
    )
      ? 0
      : Math.min(3, pity.missStreak + 1);
    pity.lastSource = source;
  }
  state.lastAffinityRoll = {
    version: 1,
    source,
    buckets,
    ids: items.map((x) => x.id),
  };
  return items;
}
function single(state, rarity, rng, source, options = {}) {
  return offers(state, [rarity], rng, source, options)[0];
}
module.exports = { relation, offers, single, weight, pick };
