"use strict";
// Recover only balances whose identity is provable from immutable draw/soul receipts.
// Ambiguous pooled balances remain in the old table for reconciliation, never spent.
module.exports = function migrateCards(db) {
  const characters = require("./catalog.json").characters;
  const catalog = new Map(characters.map((c) => [c.id, c]));
  const groups = db
    .prepare("SELECT * FROM hardcore_character_cards WHERE quantity>0")
    .all();
  const users = new Set(groups.map((g) => g.user_id));
  const insert = db.prepare(
    "INSERT INTO hardcore_character_card_balances(user_id,character_id,quantity,updated_at) VALUES(?,?,?,?)",
  );
  const audit = db.prepare(
    "INSERT INTO hardcore_character_card_migrations(user_id,class_key,rarity,migrated_quantity,unattributed_quantity,reason,allocations_json) VALUES(?,?,?,?,?,?,?)",
  );
  for (const user of users) {
    const ledger = new Map();
    const adjust = (id, n) => {
      const c = catalog.get(id);
      if (!c) return;
      const key = c.classKey + ":" + c.rarity;
      if (!ledger.has(key)) ledger.set(key, new Map());
      const bucket = ledger.get(key);
      bucket.set(id, (bucket.get(id) || 0) + n);
    };
    for (const row of db
      .prepare(
        "SELECT kind,receipt_json FROM hardcore_character_operations WHERE user_id=? ORDER BY rowid",
      )
      .all(user)) {
      let r;
      try {
        r = JSON.parse(row.receipt_json);
      } catch {
        continue;
      }
      if (!r || typeof r !== "object") continue;
      if (["draw", "spark"].includes(row.kind) && Array.isArray(r.results))
        for (const reward of r.results || []) {
          if (
            reward.kind === "character" &&
            reward.duplicate &&
            Number.isSafeInteger(reward.cards) &&
            reward.cards > 0
          )
            adjust(reward.id, reward.cards);
        }
      if (row.kind === "soul" && Number.isSafeInteger(r.cost) && r.cost > 0)
        adjust(r.characterId, -r.cost);
    }
    for (const group of groups.filter((g) => g.user_id === user)) {
      const entries = [
        ...(ledger.get(group.class_key + ":" + group.rarity) || []),
      ];
      const total = entries.reduce((n, [, q]) => n + q, 0);
      const exact =
        entries.length &&
        entries.every(([, q]) => Number.isSafeInteger(q) && q >= 0) &&
        total === group.quantity;
      if (exact) {
        for (const [id, q] of entries)
          if (q > 0) insert.run(user, id, q, group.updated_at);
        db.prepare(
          "UPDATE hardcore_character_cards SET quantity=0 WHERE user_id=? AND class_key=? AND rarity=?",
        ).run(user, group.class_key, group.rarity);
      }
      audit.run(
        user,
        group.class_key,
        group.rarity,
        exact ? group.quantity : 0,
        exact ? 0 : group.quantity,
        exact ? "receipt_matched" : "requires_reconciliation",
        JSON.stringify(exact ? Object.fromEntries(entries) : {}),
      );
    }
  }
};
