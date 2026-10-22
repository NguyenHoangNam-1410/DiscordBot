"use strict";
// Spark là tiền tệ gắn với tài khoản, dùng chung giữa các banner: gộp số dư theo banner cũ vào ví "spark".
const SHARED_SPARK = "spark";
const LEGACY_SPARK = ["venance_spark", "rha_kor_spark"];
function mergeSparkWallets(db) {
  const marks = LEGACY_SPARK.map(() => "?").join(",");
  db.prepare(
    `INSERT INTO hardcore_character_wallets(user_id,currency_id,quantity,updated_at)
    SELECT user_id,'${SHARED_SPARK}',SUM(quantity),MAX(updated_at) FROM hardcore_character_wallets
    WHERE currency_id IN (${marks}) GROUP BY user_id
    ON CONFLICT(user_id,currency_id) DO UPDATE SET
      quantity=quantity+excluded.quantity,updated_at=MAX(updated_at,excluded.updated_at)`,
  ).run(...LEGACY_SPARK);
  db.prepare(
    `DELETE FROM hardcore_character_wallets WHERE currency_id IN (${marks})`,
  ).run(...LEGACY_SPARK);
}

module.exports = (db, migrate) => {
  migrate(44, "hardcore character accounts and versioned gacha", () => {
    db.exec(`
 CREATE TABLE hardcore_character_accounts (
 user_id TEXT PRIMARY KEY,novice_claimed_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991));
 CREATE TABLE hardcore_character_wallets (
 user_id TEXT NOT NULL REFERENCES hardcore_character_accounts(user_id),currency_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9007199254740991),updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,currency_id));
 CREATE TABLE hardcore_owned_characters (
 user_id TEXT NOT NULL,character_id TEXT NOT NULL,soul_level INTEGER NOT NULL DEFAULT 0 CHECK(soul_level BETWEEN 0 AND 6),
 rarity TEXT NOT NULL CHECK(rarity IN ('SR','SSR','UR','LR')),updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,character_id));
 CREATE TABLE hardcore_character_cards (
 user_id TEXT NOT NULL,class_key TEXT NOT NULL CHECK(class_key IN ('warrior','guardian','assassin','mage')),
 rarity TEXT NOT NULL CHECK(rarity IN ('SR','SSR')),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9007199254740991),updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,class_key,rarity));
 CREATE TABLE hardcore_character_operations (
 operation_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,request_json TEXT NOT NULL,
 receipt_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX idx_hc_character_ops_user ON hardcore_character_operations(user_id,created_at DESC);
 CREATE TABLE hardcore_character_draws (
 operation_id TEXT PRIMARY KEY REFERENCES hardcore_character_operations(operation_id),user_id TEXT NOT NULL,guild_id TEXT NOT NULL,
 banner_id TEXT NOT NULL,pool_version INTEGER NOT NULL,pulls INTEGER NOT NULL CHECK(pulls IN (1,10)),
 payment_json TEXT NOT NULL,pool_json TEXT NOT NULL,results_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX idx_hc_character_draws_user ON hardcore_character_draws(user_id,created_at DESC);
 `);
  });

  migrate(47, "per-character soul cards and exact card packs", () => {
    db.exec(`CREATE TABLE hardcore_character_card_balances (
      user_id TEXT NOT NULL, character_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 9007199254740991), updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,character_id));
      CREATE TABLE hardcore_character_card_migrations (
      user_id TEXT NOT NULL,class_key TEXT NOT NULL,rarity TEXT NOT NULL,
      migrated_quantity INTEGER NOT NULL,unattributed_quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,allocations_json TEXT NOT NULL,
      PRIMARY KEY(user_id,class_key,rarity));`);
    require("./cardMigration")(db);
  });

  migrate(54, "shared account-wide Spark wallet across banners", () => {
    mergeSparkWallets(db);
  });
};
module.exports.mergeSparkWallets = mergeSparkWallets;
module.exports.SHARED_SPARK = SHARED_SPARK;
