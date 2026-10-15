"use strict";
const { db } = require("../../db");
const banners = require("./banners");
const progress = require("../characters/progression");
const NOVICE_TICKETS = 30;
const openTx = db.transaction(({ userId, now = Date.now() }) => {
  const user = progress.identity(userId);
  const grant =
    db
      .prepare(
        "INSERT OR IGNORE INTO hardcore_character_accounts(user_id,novice_claimed_at,revision) VALUES(?,?,0)",
      )
      .run(user, now).changes === 1;
  if (grant) progress.addWallet(user, "novice_ticket", NOVICE_TICKETS, now);
  progress.ensureOwned(user, now);
  return {
    account: progress.account(user),
    tickets: progress.wallet(user, "novice_ticket"),
    granted: grant,
  };
});
const open = (args) =>
  require("../../services/playerLevelService").withBusyRetry(() =>
    openTx.immediate(args),
  );
const pullTx = db.transaction(
  ({
    guildId,
    userId,
    bannerId,
    poolVersion,
    expectedRevision,
    pulls,
    operationId,
    rng = banners.random,
    now = Date.now(),
  }) => {
    const user = progress.identity(userId);
    if (
      typeof guildId !== "string" ||
      !guildId ||
      ![1, 10].includes(pulls) ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    )
      throw Error("INVALID_CHARACTER_DRAW");
    const request = { guildId, bannerId, poolVersion, expectedRevision, pulls };
    const old = progress.operation(user, operationId, "draw", request);
    if (old) return old;
    const b = banners.get(bannerId);
    if (!b?.enabled) throw Error("CHARACTER_BANNER_CLOSED");
    if (poolVersion !== b.version) throw Error("STALE_CHARACTER_POOL");
    const a = progress.account(user);
    if (!a) throw Error("CHARACTER_GACHA_NOT_OPENED");
    if (a.revision !== expectedRevision) throw Error("STALE_CHARACTER_GACHA");
    const cost = b.payment.unitCost * pulls;
    if (b.payment.kind === "ticket") {
      const spent = db
        .prepare(
          "UPDATE hardcore_character_wallets SET quantity=quantity-?,updated_at=? WHERE user_id=? AND currency_id=? AND quantity>=?",
        )
        .run(cost, now, user, b.payment.currencyId, cost);
      if (spent.changes !== 1) throw Error("INSUFFICIENT_CHARACTER_TICKETS");
    } else
      require("../../services/playerLevelService").spendDiamonds(
        guildId,
        user,
        cost,
        {
          now,
          reason: "hardcore:character-gacha",
          operationId: "hc-cg:" + operationId,
        },
      );
    progress.ensureOwned(user, now);
    const results = [];
    for (let i = 0; i < pulls; i++) {
      const picked = banners.roll(b, rng);
      if (picked.kind === "item") {
        require("../inventory/service").grant(guildId, user, picked.id, 1, now);
        results.push(picked);
      } else results.push(progress.grantCharacter(user, picked.id, now));
    }
    const sparkGain = (b.spark?.perPull || 0) * pulls;
    if (sparkGain) progress.addWallet(user, b.spark.currencyId, sparkGain, now);
    db.prepare(
      "UPDATE hardcore_character_accounts SET revision=revision+1 WHERE user_id=? AND revision=?",
    ).run(user, expectedRevision);
    const receipt = {
      bannerId: b.id,
      poolVersion: b.version,
      pulls,
      payment: { ...b.payment, cost },
      results,
      sparkGain,
      sparkCurrency: b.spark?.currencyId || null,
      revision: expectedRevision + 1,
    };
    progress.record(user, operationId, "draw", request, receipt, now);
    db.prepare(
      "INSERT INTO hardcore_character_draws(operation_id,user_id,guild_id,banner_id,pool_version,pulls,payment_json,pool_json,results_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      operationId,
      user,
      guildId,
      b.id,
      b.version,
      pulls,
      JSON.stringify(receipt.payment),
      JSON.stringify(b),
      JSON.stringify(results),
      now,
    );
    return receipt;
  },
);
const pull = (args) =>
  require("../../services/playerLevelService").withBusyRetry(() =>
    pullTx.immediate(args),
  );
function history(userId, limit = 5) {
  return db
    .prepare(
      "SELECT banner_id,pulls,results_json,created_at FROM hardcore_character_draws WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?",
    )
    .all(progress.identity(userId), Math.max(1, Math.min(10, limit)))
    .map((r) => ({ ...r, results: JSON.parse(r.results_json) }));
}
module.exports = { NOVICE_TICKETS, open, pull, history };
