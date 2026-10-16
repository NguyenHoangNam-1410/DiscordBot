"use strict";
const { db } = require("../../db");
const catalog = require("./index");
const SOUL_COST = Object.freeze({ SR: 20, SSR: 50 });
const DUPLICATE_CARDS = Object.freeze({ SR: 5, SSR: 50 });
const ASCENSION = Object.freeze({ SSR: "UR", UR: "LR", LR: null });
const nextRarity = (rarity) =>
  Object.hasOwn(ASCENSION, rarity) ? ASCENSION[rarity] : null;
function identity(user) {
  if (typeof user !== "string" || !user || user.length > 64)
    throw Error("INVALID_CHARACTER_USER");
  return user;
}
function getOwned(user) {
  const owned = Object.fromEntries(
    catalog.catalog.characters
      .filter((c) => c.starter)
      .map((c) => [
        c.id,
        { characterId: c.id, soulLevel: 0, rarity: c.rarity },
      ]),
  );
  for (const row of db
    .prepare(
      "SELECT character_id,soul_level,rarity FROM hardcore_owned_characters WHERE user_id=?",
    )
    .all(identity(user)))
    if (catalog.get(row.character_id))
      owned[row.character_id] = {
        characterId: row.character_id,
        soulLevel: row.soul_level,
        rarity: row.rarity,
      };
  return owned;
}
function ensureOwned(user, now) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO hardcore_owned_characters(user_id,character_id,soul_level,rarity,updated_at) VALUES(?,?,0,?,?)",
  );
  for (const c of catalog.catalog.characters.filter((c) => c.starter))
    insert.run(user, c.id, c.rarity, now);
}
function account(user) {
  return (
    db
      .prepare("SELECT * FROM hardcore_character_accounts WHERE user_id=?")
      .get(identity(user)) || null
  );
}
function wallet(user, currency) {
  return (
    db
      .prepare(
        "SELECT quantity FROM hardcore_character_wallets WHERE user_id=? AND currency_id=?",
      )
      .get(identity(user), currency)?.quantity || 0
  );
}
function addWallet(user, currency, amount, now) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(wallet(user, currency) + amount) ||
    wallet(user, currency) + amount < 0
  )
    throw Error("INVALID_CHARACTER_CURRENCY");
  db.prepare(
    "INSERT INTO hardcore_character_wallets(user_id,currency_id,quantity,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,currency_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at",
  ).run(user, currency, amount, now);
}
function cards(user, characterId) {
  if (!catalog.get(characterId)) throw Error("INVALID_CHARACTER_CARDS");
  return (
    db
      .prepare(
        "SELECT quantity FROM hardcore_character_card_balances WHERE user_id=? AND character_id=?",
      )
      .get(identity(user), characterId)?.quantity || 0
  );
}
function legacyCards(user, classKey, rarity) {
  return (
    db
      .prepare(
        "SELECT quantity FROM hardcore_character_cards WHERE user_id=? AND class_key=? AND rarity=?",
      )
      .get(identity(user), classKey, rarity)?.quantity || 0
  );
}
function addCards(user, characterId, n, now = Date.now()) {
  if (
    !catalog.get(characterId) ||
    !Number.isSafeInteger(n) ||
    n < 1 ||
    !Number.isSafeInteger(cards(user, characterId) + n)
  )
    throw Error("INVALID_CHARACTER_CARDS");
  db.prepare(
    "INSERT INTO hardcore_character_card_balances(user_id,character_id,quantity,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,character_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at",
  ).run(identity(user), characterId, n, now);
}
function ascensionSources(user, characterId) {
  const target = catalog.get(characterId);
  return catalog.catalog.characters
    .filter((c) => c.rarity === "SSR" && c.classKey === target?.classKey)
    .map((c) => ({ ...c, quantity: cards(user, c.id) }));
}
function operation(user, id, kind, request) {
  if (typeof id !== "string" || !id || id.length > 160)
    throw Error("INVALID_CHARACTER_OPERATION");
  const previous = db
    .prepare("SELECT * FROM hardcore_character_operations WHERE operation_id=?")
    .get(id);
  if (!previous) return null;
  if (
    previous.user_id !== user ||
    previous.kind !== kind ||
    previous.request_json !== JSON.stringify(request)
  )
    throw Error("INVALID_CHARACTER_OPERATION");
  return { ...JSON.parse(previous.receipt_json), duplicate: true };
}
function record(user, id, kind, request, receipt, now) {
  db.prepare(
    "INSERT INTO hardcore_character_operations(operation_id,user_id,kind,request_json,receipt_json,created_at) VALUES(?,?,?,?,?,?)",
  ).run(id, user, kind, JSON.stringify(request), JSON.stringify(receipt), now);
}
function grantCharacter(user, id, now) {
  const c = catalog.get(id);
  if (!c || !DUPLICATE_CARDS[c.rarity]) throw Error("INVALID_CHARACTER");
  const previous = getOwned(user)[id];
  if (previous) {
    const n = DUPLICATE_CARDS[c.rarity];
    addCards(user, id, n, now);
    return {
      kind: "character",
      id,
      name: c.name,
      rarity: c.rarity,
      classKey: c.classKey,
      duplicate: true,
      cards: n,
    };
  }
  db.prepare(
    "INSERT INTO hardcore_owned_characters(user_id,character_id,soul_level,rarity,updated_at) VALUES(?,?,0,?,?)",
  ).run(user, id, c.rarity, now);
  return {
    kind: "character",
    id,
    name: c.name,
    rarity: c.rarity,
    classKey: c.classKey,
    duplicate: false,
    cards: 0,
  };
}
const upgradeTx = db.transaction(
  ({ userId, characterId, expectedLevel, operationId, now = Date.now() }) => {
    const user = identity(userId),
      request = { characterId, expectedLevel };
    const previous = operation(user, operationId, "soul", request);
    if (previous) return previous;
    const c = catalog.get(characterId),
      owned = getOwned(user)[characterId];
    if (!c || !owned) throw Error("CHARACTER_NOT_OWNED");
    if (
      !Number.isSafeInteger(expectedLevel) ||
      expectedLevel < 0 ||
      expectedLevel > 5 ||
      owned.soulLevel !== expectedLevel
    )
      throw Error("STALE_CHARACTER_SOUL");
    const cost = SOUL_COST[c.rarity];
    if (!cost) throw Error("INVALID_CHARACTER_RARITY");
    if (!account(user) || cards(user, characterId) < cost)
      throw Error("INSUFFICIENT_CHARACTER_CARDS");
    ensureOwned(user, now);
    const spent = db
      .prepare(
        "UPDATE hardcore_character_card_balances SET quantity=quantity-?,updated_at=? WHERE user_id=? AND character_id=? AND quantity>=?",
      )
      .run(cost, now, user, characterId, cost);
    if (spent.changes !== 1) throw Error("INSUFFICIENT_CHARACTER_CARDS");
    db.prepare(
      "UPDATE hardcore_owned_characters SET soul_level=soul_level+1,updated_at=? WHERE user_id=? AND character_id=? AND soul_level=?",
    ).run(now, user, characterId, expectedLevel);
    db.prepare(
      "UPDATE hardcore_character_accounts SET revision=revision+1 WHERE user_id=?",
    ).run(user);
    const receipt = {
      characterId,
      soulLevel: expectedLevel + 1,
      cost,
      classKey: c.classKey,
      rarity: c.rarity,
    };
    record(user, operationId, "soul", request, receipt, now);
    return receipt;
  },
);
const upgrade = (args) =>
  require("../../services/playerLevelService").withBusyRetry(() =>
    upgradeTx.immediate(args),
  );
const ascendTx = db.transaction(
  ({
    userId,
    characterId,
    expectedRarity,
    sourceIds,
    operationId,
    now = Date.now(),
  }) => {
    const user = identity(userId);
    if (
      !Array.isArray(sourceIds) ||
      sourceIds.length < 1 ||
      sourceIds.length > 2 ||
      sourceIds.some((id) => typeof id !== "string")
    )
      throw Error("INVALID_ASCENSION_MATERIALS");
    const packs = new Map();
    for (const id of sourceIds)
      packs.set(id, (packs.get(id) || 0) + (sourceIds.length === 1 ? 2 : 1));
    const materials = [...packs]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([characterId, packs]) => ({ characterId, packs }));
    const request = { characterId, expectedRarity, materials };
    const previous = operation(user, operationId, "ascension", request);
    if (previous) return previous;
    const c = catalog.get(characterId),
      owned = getOwned(user)[characterId];
    if (!c || !owned) throw Error("CHARACTER_NOT_OWNED");
    const rarity = nextRarity(expectedRarity);
    if (
      c.rarity !== "SSR" ||
      owned.soulLevel !== 6 ||
      owned.rarity !== expectedRarity ||
      !rarity
    )
      throw Error("STALE_CHARACTER_ASCENSION");
    if (!account(user)) throw Error("INSUFFICIENT_CHARACTER_CARDS");
    for (const m of materials) {
      const source = catalog.get(m.characterId);
      if (!source || source.rarity !== "SSR" || source.classKey !== c.classKey)
        throw Error("INVALID_ASCENSION_MATERIALS");
      const cost = m.packs * 50;
      if (
        db
          .prepare(
            "UPDATE hardcore_character_card_balances SET quantity=quantity-?,updated_at=? WHERE user_id=? AND character_id=? AND quantity>=?",
          )
          .run(cost, now, user, m.characterId, cost).changes !== 1
      )
        throw Error("INSUFFICIENT_CHARACTER_CARDS");
    }
    if (
      db
        .prepare(
          "UPDATE hardcore_owned_characters SET rarity=?,updated_at=? WHERE user_id=? AND character_id=? AND rarity=? AND soul_level=6",
        )
        .run(rarity, now, user, characterId, expectedRarity).changes !== 1
    )
      throw Error("STALE_CHARACTER_ASCENSION");
    db.prepare(
      "UPDATE hardcore_character_accounts SET revision=revision+1 WHERE user_id=?",
    ).run(user);
    const receipt = {
      characterId,
      rarity,
      soulLevel: 6,
      materials: materials.map((m) => ({ ...m, cost: m.packs * 50 })),
    };
    record(user, operationId, "ascension", request, receipt, now);
    return receipt;
  },
);
const ascend = (args) =>
  require("../../services/playerLevelService").withBusyRetry(() =>
    ascendTx.immediate(args),
  );
module.exports = {
  SOUL_COST,
  DUPLICATE_CARDS,
  ASCENSION,
  nextRarity,
  identity,
  getOwned,
  ensureOwned,
  account,
  wallet,
  addWallet,
  cards,
  legacyCards,
  ascensionSources,
  ascend,
  addCards,
  operation,
  record,
  grantCharacter,
  upgrade,
};
