"use strict";
const crypto = require("node:crypto");
const { db } = require("../db");
const { ITEMS } = require("../hardcore/item");
const { spendCoins } = require("./economyService");
const { spendDiamonds } = require("./playerLevelService");
const PRICES = Object.freeze({
  R: 10_000,
  SR: 50_000,
  SSR: 100_000,
  UR: 200_000,
});
const TICKETS = Object.freeze([
  {
    id: "survival_escape",
    name: "Vé chạy khỏi RNGesus",
    price: 100,
    text: "Tự dùng khi bỏ chạy RNGesus thất bại, giữ tối đa 1 vé trong mỗi run.",
  },
  {
    id: "survival_prayer",
    name: "Vé cầu nguyện RNGesus",
    price: 100,
    text: "Tăng tỷ lệ cầu nguyện thành công gấp đôi ở mọi lần gặp RNGesus trong run.",
  },
  {
    id: "survival_revive",
    name: "Vé hồi sinh",
    price: 300,
    text: "Tự hồi sinh một lần khi tử trận, với 50% Max HP.",
  },
]);
const CATALOG = Object.values(ITEMS).flat();
const DEFINITIONS = new Map(CATALOG.map((item) => [item.id, item]));
const RANK = { UR: 4, SSR: 3, SR: 2, R: 1, ticket: 0 };
const FILTERS = ["all", "UR", "SSR", "SR", "R", "ticket"];
function vietnamDay(now = Date.now()) {
  return new Date(now + 7 * 60 * 60_000).toISOString().slice(0, 10);
}
function product(id) {
  const ticket = TICKETS.find((entry) => entry.id === id);
  if (ticket) return { ...ticket, typeCode: "ticket", currency: "diamonds" };
  const definition = DEFINITIONS.get(id);
  return definition
    ? { ...definition, price: PRICES[definition.typeCode], currency: "coins" }
    : null;
}
const rotationTx = db.transaction((guildId, now) => {
  const day = vietnamDay(now);
  const row = db
    .prepare(
      "SELECT items_json FROM hardcore_shop_rotations WHERE guild_id=? AND day=?",
    )
    .get(String(guildId), day);
  if (row) return { day, itemIds: JSON.parse(row.items_json) };
  const pool = CATALOG.map((item) => item.id);
  const itemIds = [];
  for (let i = 0; i < 5; i++)
    itemIds.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  db.prepare(
    "INSERT INTO hardcore_shop_rotations(guild_id,day,items_json,created_at) VALUES(?,?,?,?)",
  ).run(String(guildId), day, JSON.stringify(itemIds), now);
  return { day, itemIds };
});
function shop(guildId, now = Date.now()) {
  const rotation = rotationTx(guildId, now);
  return {
    ...rotation,
    products: [
      ...TICKETS.map((item) => product(item.id)),
      ...rotation.itemIds.map(product),
    ],
  };
}
function inventory(guildId, userId, filter = "all") {
  if (!FILTERS.includes(filter)) throw new Error("INVALID_INVENTORY_FILTER");
  return db
    .prepare(
      "SELECT item_id,quantity,updated_at FROM hardcore_inventory WHERE guild_id=? AND user_id=? AND quantity>0",
    )
    .all(String(guildId), String(userId))
    .map((row) => {
      const entry = product(row.item_id);
      return entry
        ? { ...entry, quantity: row.quantity, updatedAt: row.updated_at }
        : null;
    })
    .filter((item) => item && (filter === "all" || item.typeCode === filter))
    .sort(
      (a, b) =>
        RANK[b.typeCode] - RANK[a.typeCode] ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}
function grant(guildId, userId, id, quantity, now = Date.now()) {
  if (!product(id) || !Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error("INVALID_HARDCORE_INVENTORY");
  const current =
    db
      .prepare(
        "SELECT quantity FROM hardcore_inventory WHERE guild_id=? AND user_id=? AND item_id=?",
      )
      .get(String(guildId), String(userId), id)?.quantity || 0;
  if (!Number.isSafeInteger(current + quantity))
    throw new Error("INVALID_QUANTITY");
  db.prepare(
    `INSERT INTO hardcore_inventory(guild_id,user_id,item_id,quantity,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`,
  ).run(String(guildId), String(userId), id, quantity, now);
}
const purchaseTx = db.transaction(
  ({
    guildId,
    userId,
    itemId,
    quantity = 1,
    day,
    operationId,
    now = Date.now(),
  }) => {
    if (!operationId || String(operationId).length > 100)
      throw new Error("INVALID_PURCHASE_ID");
    const prior = db
      .prepare("SELECT * FROM hardcore_shop_purchases WHERE interaction_id=?")
      .get(String(operationId));
    if (prior) {
      if (
        prior.guild_id !== String(guildId) ||
        prior.user_id !== String(userId) ||
        prior.item_id !== itemId ||
        prior.quantity !== quantity
      )
        throw new Error("INVALID_PURCHASE_ID");
      return { ...prior, duplicate: true };
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500)
      throw new Error("INVALID_QUANTITY");
    const today = shop(guildId, now);
    if (day !== today.day) throw new Error("SHOP_EXPIRED");
    const entry = today.products.find((item) => item.id === itemId);
    if (!entry) throw new Error("NOT_FOR_SALE");
    const cost = entry.price * quantity;
    if (entry.currency === "diamonds")
      spendDiamonds(guildId, userId, cost, {
        reason: "hardcore:shop",
        operationId: `hardcore-shop:${operationId}`,
        now,
      });
    else spendCoins({ guildId, userId, amount: cost, reason: "shop:hardcore" });
    grant(guildId, userId, itemId, quantity, now);
    db.prepare(
      "INSERT INTO hardcore_shop_purchases(interaction_id,guild_id,user_id,day,item_id,quantity,currency,cost,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      String(operationId),
      String(guildId),
      String(userId),
      day,
      itemId,
      quantity,
      entry.currency,
      cost,
      now,
    );
    return {
      item_id: itemId,
      quantity,
      cost,
      currency: entry.currency,
      duplicate: false,
    };
  },
);
function validateLoadout(loadout = {}) {
  const itemIds = loadout.itemIds ?? [],
    ticketIds = loadout.ticketIds ?? [];
  if (
    !Array.isArray(itemIds) ||
    itemIds.length > 5 ||
    new Set(itemIds).size !== itemIds.length ||
    itemIds.some((id) => !DEFINITIONS.has(id)) ||
    !Array.isArray(ticketIds) ||
    ticketIds.length > 3 ||
    new Set(ticketIds).size !== ticketIds.length ||
    ticketIds.some((id) => !TICKETS.some((ticket) => ticket.id === id))
  )
    throw new Error("INVALID_LOADOUT");
  return { itemIds: [...itemIds], ticketIds: [...ticketIds] };
}
function checkStock(guildId, userId, loadout) {
  const normalized = validateLoadout(loadout);
  const stock = new Map(
    inventory(guildId, userId).map((item) => [item.id, item.quantity]),
  );
  if (
    [...normalized.itemIds, ...normalized.ticketIds].some(
      (id) => (stock.get(id) || 0) < 1,
    )
  )
    throw new Error("INSUFFICIENT_HARDCORE_ITEMS");
  return normalized;
}
const consumeTx = db.transaction((guildId, userId, loadout) => {
  const normalized = checkStock(guildId, userId, loadout);
  const take = db.prepare(
    "UPDATE hardcore_inventory SET quantity=quantity-1,updated_at=? WHERE guild_id=? AND user_id=? AND item_id=? AND quantity>0",
  );
  for (const id of [...normalized.itemIds, ...normalized.ticketIds]) {
    if (take.run(Date.now(), String(guildId), String(userId), id).changes !== 1)
      throw new Error("INSUFFICIENT_HARDCORE_ITEMS");
  }
  return normalized;
});
function applyLoadout(state, loadout) {
  const normalized = validateLoadout(loadout);
  const core = require("./hardcoreV2");
  for (const id of normalized.itemIds)
    core.receiveItem(state, DEFINITIONS.get(id));
  if (normalized.ticketIds.includes("survival_escape")) state.escapeTokens = 1;
  state.prayerBoost = normalized.ticketIds.includes("survival_prayer");
  state.reviveTickets = normalized.ticketIds.includes("survival_revive")
    ? 1
    : 0;
  state.initialLoadout = normalized;
  state.hp = state.maxHp;
  state.mana = state.maxMana;
  delete state.discardedTicketsThisTurn;
  return state;
}
function preview(classKey, stake, loadout) {
  return applyLoadout(
    require("./hardcoreStats").createState(classKey, stake),
    loadout,
  );
}
module.exports = {
  PRICES,
  TICKETS,
  CATALOG,
  FILTERS,
  vietnamDay,
  product,
  shop,
  inventory,
  grant,
  purchase: purchaseTx,
  validateLoadout,
  checkStock,
  consume: consumeTx,
  applyLoadout,
  preview,
};
