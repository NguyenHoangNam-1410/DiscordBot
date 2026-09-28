const crypto = require('node:crypto');
const { db } = require('../db');
const { getAccount, spendCoins } = require('./economyService');
const { getCosmetic, getProfileAppearance, grantCosmetic, equipCosmetic } = require('./profileCosmeticService');
const { getCatalogItem } = require('./itemCatalogService');

const MAX_PRICE = 100_000_000;
const ROTATION_MS = 86_400_000;
function itemCode(id) { return String(id).replace(/[^a-z0-9_]+/g, '_').slice(0, 40); }
function integer(value, minimum, maximum, error = 'INVALID_SHOP_VALUE') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(error);
  return number;
}
function effectivePrice(item, now = Date.now()) {
  const active = item.discount_percent > 0 && (!item.discount_ends_at || item.discount_ends_at > now);
  return active ? Math.max(1, Math.floor(item.price * (100 - item.discount_percent) / 100)) : item.price;
}
function getShopItem(guildId, itemId) {
  const row = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? AND item_id = ?').get(String(guildId), String(itemId));
  return row ? { ...row, final_price: effectivePrice(row), catalog: getCatalogItem(row.cosmetic_id) } : null;
}

function upsertShopItem({ guildId, catalogId, displayName, price, stock = null, minGames = 0, minWins = 0, minBalance = 0, createdBy }) {
  const catalog = getCatalogItem(catalogId);
  if (!catalog || catalog.price <= 0 || catalog.shopEligible === false) throw new Error('UNKNOWN_SHOP_EFFECT');
  const normalizedStock = stock === null || Number(stock) === 0 ? null : integer(stock, 1, 1_000_000);
  const now = Date.now();
  const values = { guild: String(guildId), item: itemCode(catalogId), cosmetic: catalog.id,
    name: String(displayName || catalog.name).trim().slice(0, 80) || catalog.name,
    price: integer(price ?? catalog.price, 1, MAX_PRICE, 'INVALID_PRICE'), stock: normalizedStock,
    minGames: integer(minGames, 0, 1_000_000), minWins: integer(minWins, 0, 1_000_000),
    minBalance: integer(minBalance, 0, 1_000_000), admin: String(createdBy), now };
  db.prepare(`INSERT INTO shop_items
    (guild_id,item_id,cosmetic_id,display_name,price,stock,min_games,min_wins,min_balance,active,created_by,created_at,updated_at)
    VALUES (@guild,@item,@cosmetic,@name,@price,@stock,@minGames,@minWins,@minBalance,1,@admin,@now,@now)
    ON CONFLICT(guild_id,item_id) DO UPDATE SET display_name=excluded.display_name,price=excluded.price,
      stock=excluded.stock,min_games=excluded.min_games,min_wins=excluded.min_wins,min_balance=excluded.min_balance,
      active=1,listed=1,created_by=excluded.created_by,updated_at=excluded.updated_at`).run(values);
  return getShopItem(guildId, values.item);
}

function seedShop(guildId) {
  return db.prepare(`UPDATE shop_items SET listed=0,active=0,updated_at=?
    WHERE guild_id=? AND created_by='system' AND (listed<>0 OR active<>0)`).run(Date.now(), String(guildId)).changes;
}
function randomPick(pool, count) {
  const values = [...pool];
  for (let i = values.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [values[i], values[j]] = [values[j], values[i]]; }
  return values.slice(0, count);
}
function rotateShop(guildId, size = 8, now = Date.now()) {
  const count = integer(size, 6, 10); seedShop(guildId);
  const entries = db.prepare('SELECT * FROM shop_items WHERE guild_id = ? AND listed = 1').all(String(guildId))
    .map(row => ({ row, item: getCatalogItem(row.cosmetic_id) })).filter(entry => entry.item);
  if (!entries.length) {
    db.transaction(() => {
      db.prepare('UPDATE shop_items SET active=0 WHERE guild_id=?').run(String(guildId));
      db.prepare(`INSERT INTO shop_settings (guild_id,rotation_size,next_rotation_at,updated_at) VALUES (?,?,?,?)
        ON CONFLICT(guild_id) DO UPDATE SET rotation_size=excluded.rotation_size,next_rotation_at=excluded.next_rotation_at,updated_at=excluded.updated_at`)
        .run(String(guildId), count, now + ROTATION_MS, now);
    })();
    return [];
  }
  const chosen = new Map();
  for (const entry of [
    ...randomPick(entries.filter(x => x.item.type === 'chest'), 1),
    ...randomPick(entries.filter(x => x.item.type === 'consumable'), 4),
    ...randomPick(entries.filter(x => x.item.type === 'color'), 1),
  ]) chosen.set(entry.row.item_id, entry);
  const gameEntries = entries.filter(x => ['chest', 'consumable'].includes(x.item.type) && !chosen.has(x.row.item_id));
  for (const entry of randomPick(gameEntries, count - chosen.size)) chosen.set(entry.row.item_id, entry);
  for (const entry of randomPick(entries.filter(x => !chosen.has(x.row.item_id)), count - chosen.size)) chosen.set(entry.row.item_id, entry);
  const selected = [...chosen.keys()].slice(0, count);
  db.transaction(() => {
    db.prepare('UPDATE shop_items SET active = 0 WHERE guild_id = ?').run(String(guildId));
    const activate = db.prepare('UPDATE shop_items SET active = 1, updated_at = ? WHERE guild_id = ? AND item_id = ?');
    for (const id of selected) activate.run(now, String(guildId), id);
    db.prepare(`INSERT INTO shop_settings (guild_id,rotation_size,next_rotation_at,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET rotation_size=excluded.rotation_size,next_rotation_at=excluded.next_rotation_at,updated_at=excluded.updated_at`)
      .run(String(guildId), count, now + ROTATION_MS, now);
  })();
  return listShopItems(guildId, { activeOnly: true, skipRotation: true });
}
function ensureRotation(guildId, now = Date.now()) {
  seedShop(guildId);
  const listed = db.prepare('SELECT cosmetic_id FROM shop_items WHERE guild_id=? AND listed=1').all(String(guildId))
    .map(row => getCatalogItem(row.cosmetic_id)).filter(Boolean);
  if (!listed.length) {
    db.prepare('UPDATE shop_items SET active=0 WHERE guild_id=?').run(String(guildId));
    return null;
  }
  const settings = db.prepare('SELECT * FROM shop_settings WHERE guild_id = ?').get(String(guildId));
  if (!settings || settings.next_rotation_at <= now || settings.next_rotation_at > now + ROTATION_MS) return rotateShop(guildId, settings?.rotation_size || 8, now);
  const active = db.prepare('SELECT cosmetic_id FROM shop_items WHERE guild_id=? AND listed=1 AND active=1').all(String(guildId))
    .map(row => getCatalogItem(row.cosmetic_id)).filter(Boolean);
  const targetSize = Math.min(settings.rotation_size, listed.length);
  const availableGameItems = listed.filter(item => ['chest', 'consumable'].includes(item.type)).length;
  const minimumGameItems = Math.min(targetSize - 1, 5, availableGameItems);
  if (active.length !== targetSize
    || active.filter(item => ['chest', 'consumable'].includes(item.type)).length < minimumGameItems
    || active.filter(item => item.type === 'color').length > Math.min(1, targetSize)) return rotateShop(guildId, settings.rotation_size || 8, now);
  return null;
}
function listShopItems(guildId, { activeOnly = true, skipRotation = false } = {}) {
  if (!skipRotation) ensureRotation(guildId);
  const sql = activeOnly ? 'SELECT * FROM shop_items WHERE guild_id = ? AND listed = 1 AND active = 1 ORDER BY cosmetic_id'
    : 'SELECT * FROM shop_items WHERE guild_id = ? AND listed = 1 ORDER BY active DESC, cosmetic_id';
  return db.prepare(sql).all(String(guildId)).map(row => ({ ...row, final_price: effectivePrice(row), catalog: getCatalogItem(row.cosmetic_id) }));
}
function editShopItem(guildId, itemId, changes = {}) {
  const item = getShopItem(guildId, itemId); if (!item) throw new Error('SHOP_ITEM_NOT_FOUND');
  return upsertShopItem({ guildId, catalogId: item.cosmetic_id, createdBy: changes.adminId || item.created_by,
    displayName: changes.displayName ?? item.display_name, price: changes.price ?? item.price,
    stock: changes.stock === undefined ? item.stock : changes.stock, minGames: changes.minGames ?? item.min_games,
    minWins: changes.minWins ?? item.min_wins, minBalance: changes.minBalance ?? item.min_balance });
}
function removeShopItem(guildId, itemId) { return db.prepare('UPDATE shop_items SET listed=0,active=0,updated_at=? WHERE guild_id=? AND item_id=?').run(Date.now(), String(guildId), String(itemId)).changes > 0; }
function updateShopPrice(guildId, itemId, price) { return editShopItem(guildId, itemId, { price }); }
function setShopStock(guildId, itemId, stock) {
  const value = Number(stock) === 0 ? null : integer(stock, 1, 1_000_000);
  const result = db.prepare('UPDATE shop_items SET stock = ?, sold_count = 0, updated_at = ? WHERE guild_id = ? AND item_id = ?')
    .run(value, Date.now(), String(guildId), String(itemId));
  if (!result.changes) throw new Error('SHOP_ITEM_NOT_FOUND'); return getShopItem(guildId, itemId);
}
function setShopDiscount(guildId, itemId, percent, hours = 0) {
  const value = integer(percent, 0, 90); const duration = integer(hours, 0, 24 * 365);
  const ends = value && duration ? Date.now() + duration * 3_600_000 : null;
  const result = db.prepare('UPDATE shop_items SET discount_percent = ?, discount_ends_at = ?, updated_at = ? WHERE guild_id = ? AND item_id = ?')
    .run(value, ends, Date.now(), String(guildId), String(itemId));
  if (!result.changes) throw new Error('SHOP_ITEM_NOT_FOUND'); return getShopItem(guildId, itemId);
}

function getInventoryQuantity(guildId, userId, itemId) {
  return db.prepare('SELECT quantity FROM user_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?')
    .get(String(guildId), String(userId), String(itemId))?.quantity || 0;
}
function addInventory(guildId, userId, itemId, quantity = 1, now = Date.now()) {
  const item = getCatalogItem(itemId); if (!item) throw new Error('UNKNOWN_ITEM');
  const amount = integer(quantity, 1, 1_000_000);
  if (!item.stackable && getInventoryQuantity(guildId, userId, itemId) > 0) return { duplicate: true, quantity: 1 };
  db.prepare(`INSERT INTO user_inventory (guild_id,user_id,item_id,quantity,acquired_at,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+excluded.quantity,updated_at=excluded.updated_at`)
    .run(String(guildId), String(userId), item.id, item.stackable ? amount : 1, now, now);
  return { duplicate: false, quantity: getInventoryQuantity(guildId, userId, itemId) };
}
function consumeInventory(guildId, userId, itemId, quantity = 1) {
  const amount = integer(quantity, 1, 1_000_000); const current = getInventoryQuantity(guildId, userId, itemId);
  if (current < amount) throw new Error('ITEM_NOT_OWNED');
  db.prepare('UPDATE user_inventory SET quantity=quantity-?,updated_at=? WHERE guild_id=? AND user_id=? AND item_id=?')
    .run(amount, Date.now(), String(guildId), String(userId), String(itemId));
  return current - amount;
}
function getInventory(guildId, userId) {
  getProfileAppearance(guildId, userId);
  return db.prepare('SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY updated_at DESC')
    .all(String(guildId), String(userId)).map(row => ({ ...row, item: getCatalogItem(row.item_id) })).filter(row => row.item);
}
function requirementFailure(item, account) {
  if (account.games_played < item.min_games) return { code: 'MIN_GAMES', required: item.min_games, current: account.games_played };
  if (account.wins < item.min_wins) return { code: 'MIN_WINS', required: item.min_wins, current: account.wins };
  if (account.balance < item.min_balance) return { code: 'MIN_BALANCE', required: item.min_balance, current: account.balance };
  return null;
}
const purchaseTx = db.transaction(({ guildId, userId, itemId, quantity = 1 }) => {
  const amount = integer(quantity, 1, 100); const listing = getShopItem(guildId, itemId);
  if (!listing || !listing.active || !listing.catalog) throw new Error('SHOP_ITEM_NOT_FOUND');
  getProfileAppearance(guildId, userId);
  if (!listing.catalog.stackable && amount !== 1) throw new Error('NON_STACKABLE_QUANTITY');
  if (!listing.catalog.stackable && getInventoryQuantity(guildId, userId, listing.cosmetic_id)) throw new Error('ALREADY_OWNED');
  if (listing.stock !== null && listing.sold_count + amount > listing.stock) throw new Error('OUT_OF_STOCK');
  const account = getAccount(guildId, userId); const failure = requirementFailure(listing, account);
  if (failure) { const error = new Error('REQUIREMENT_NOT_MET'); error.requirement = failure; throw error; }
  const total = listing.final_price * amount; if (total > MAX_PRICE) throw new Error('INVALID_PRICE');
  const paid = spendCoins({ guildId, userId, amount: total, reason: `shop:${listing.item_id}` });
  addInventory(guildId, userId, listing.cosmetic_id, amount);
  if (getCosmetic(listing.cosmetic_id)) grantCosmetic(guildId, userId, listing.cosmetic_id);
  const now = Date.now();
  db.prepare('UPDATE shop_items SET sold_count=sold_count+?,updated_at=? WHERE guild_id=? AND item_id=?').run(amount, now, String(guildId), listing.item_id);
  db.prepare('INSERT INTO shop_purchases (guild_id,user_id,item_id,cosmetic_id,price,created_at) VALUES (?,?,?,?,?,?)')
    .run(String(guildId), String(userId), listing.item_id, listing.cosmetic_id, total, now);
  return { item: listing, catalog: listing.catalog, quantity: amount, paid: total, balance: paid.balance };
});
function purchaseShopItem(args) { return purchaseTx(args); }
function equipOwnedCosmetic(guildId, userId, catalogId) {
  if (!getInventoryQuantity(guildId, userId, catalogId)) throw new Error('ITEM_NOT_OWNED');
  return equipCosmetic(guildId, userId, catalogId);
}
function transferInventory({ guildId, fromUserId, toUserId, itemId, quantity = 1 }) {
  const item = getCatalogItem(itemId); if (!item || !item.tradeable) throw new Error('ITEM_NOT_TRADEABLE');
  if (String(fromUserId) === String(toUserId)) throw new Error('SELF_GIFT');
  if (!item.stackable && getInventoryQuantity(guildId, toUserId, itemId)) throw new Error('ALREADY_OWNED');
  return db.transaction(() => { consumeInventory(guildId, fromUserId, itemId, quantity); addInventory(guildId, toUserId, itemId, quantity);
    if (getCosmetic(itemId)) grantCosmetic(guildId, toUserId, itemId); return { item, quantity, remaining: getInventoryQuantity(guildId, fromUserId, itemId) }; })();
}
function cleanupShopPurchases(now = Date.now(), retentionDays = 7) {
  return db.prepare('DELETE FROM shop_purchases WHERE created_at < ?').run(now - retentionDays * 86_400_000).changes;
}

module.exports = { MAX_PRICE, ROTATION_MS, effectivePrice, upsertShopItem, getShopItem, listShopItems, editShopItem,
  removeShopItem, updateShopPrice, setShopStock, setShopDiscount, rotateShop, ensureRotation,
  purchaseShopItem, addInventory, consumeInventory, getInventoryQuantity, getInventory, equipOwnedCosmetic,
  transferInventory, requirementFailure, cleanupShopPurchases };
