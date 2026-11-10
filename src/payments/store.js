"use strict";

const { randomBytes } = require("node:crypto");

function createStore(db, { now = Date.now } = {}) {
  const orderById = db.prepare("SELECT * FROM bank_bet_orders WHERE id=?");
  const orderByRequest = db.prepare(
    "SELECT * FROM bank_bet_orders WHERE request_id=?",
  );
  function expire() {
    db.prepare(
      `UPDATE bank_bet_orders SET status='expired', ui_dirty=1, revision=revision+1
      WHERE status='pending' AND expires_at<=?`,
    ).run(now());
  }
  function usage(guildId, campaignId, userId, reserved = false) {
    const statuses = reserved ? "('paid','pending')" : "('paid')";
    return db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount
      FROM bank_bet_orders WHERE guild_id=? AND campaign_id=? AND user_id=? AND status IN ${statuses}`,
      )
      .get(guildId, campaignId, userId);
  }
  const create = db.transaction(
    (config, { guildId, channelId, userId, requestId, amount, side }) => {
      if (guildId !== config.guildId)
        throw new Error("Lệnh này chưa được bật cho server này.");
      const existing = orderByRequest.get(requestId);
      if (existing) {
        if (existing.user_id !== userId || existing.guild_id !== guildId)
          throw new Error("Mã yêu cầu không hợp lệ.");
        return existing;
      }
      const at = now();
      if (at >= config.closesAt)
        throw new Error("Đã chốt sổ, không nhận thêm chuyển khoản.");
      if (!config.sides.includes(side))
        throw new Error(`Chỉ nhận hai phe: ${config.sides.join(" và ")}.`);
      if (
        !Number.isSafeInteger(amount) ||
        amount < config.minAmount ||
        amount > config.maxTransactionAmount
      )
        throw new Error(
          `Mỗi giao dịch từ ${config.minAmount.toLocaleString("vi-VN")}đ đến ${config.maxTransactionAmount.toLocaleString("vi-VN")}đ.`,
        );
      expire();
      const used = usage(guildId, config.campaignId, userId, true);
      if (used.count >= config.maxTransactions)
        throw new Error(
          `Tối đa ${config.maxTransactions} giao dịch mỗi người, gồm QR đang chờ.`,
        );
      if (used.amount + amount > config.maxUserAmount)
        throw new Error(
          `Tổng tiền tối đa ${config.maxUserAmount.toLocaleString("vi-VN")}đ mỗi người, gồm QR đang chờ.`,
        );
      const id = "BET" + randomBytes(8).toString("hex").toUpperCase();
      db.prepare(
        `INSERT INTO bank_bet_orders
      (id,request_id,guild_id,channel_id,user_id,campaign_id,campaign_title,side,amount,memo,
       bank_code,bank_bin,account_number,main_account_number,account_name,created_at,expires_at,closes_at,max_user_amount,max_transactions)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        requestId,
        guildId,
        channelId,
        userId,
        config.campaignId,
        config.title,
        side,
        amount,
        `${side} ${id}`,
        config.bankCode,
        config.bankBin,
        config.accountNumber,
        config.mainAccountNumber,
        config.accountName,
        at,
        Math.min(at + config.waitMinutes * 60_000, config.closesAt),
        config.closesAt,
        config.maxUserAmount,
        config.maxTransactions,
      );
      return orderById.get(id);
    },
  );

  function receiverMatches(t, order) {
    const account = t.accountNumber;
    // VA is required: a transfer to the main account alone must never settle a VA order.
    return (
      t.bankCode === order.bank_code &&
      ((t.virtualAccount === order.account_number &&
        account === order.main_account_number) ||
        (account === order.account_number &&
          (!t.virtualAccount || t.virtualAccount === order.account_number)))
    );
  }
  const receive = db.transaction((config, t) => {
    const old = db
      .prepare("SELECT id FROM bank_bet_receipts WHERE provider_id=?")
      .get(t.id);
    if (old) return { duplicate: true };
    if (
      t.reference &&
      db
        .prepare(
          `SELECT id FROM bank_bet_receipts
      WHERE bank_code=? AND receiver=? AND reference=?`,
        )
        .get(t.bankCode, t.virtualAccount || t.accountNumber, t.reference)
    )
      return { duplicate: true };
    const codes = [
      ...new Set(
        t.description.toUpperCase().match(/\bBET[A-F0-9]{16}\b/g) || [],
      ),
    ];
    const order = codes.length === 1 ? orderById.get(codes[0]) : null;
    const currentReceiver = {
      bank_code: config.bankCode,
      account_number: config.accountNumber,
      main_account_number: config.mainAccountNumber,
    };
    if (!receiverMatches(t, order || currentReceiver))
      return { ignored: "receiver" };
    if (t.amount <= 0) return { ignored: "outgoing" };
    const at = now();
    let reason = "unknown_order";
    if (order) {
      const used = usage(order.guild_id, order.campaign_id, order.user_id);
      const sideTokens = t.description.toUpperCase().match(/[A-Z0-9]+/g) || [];
      if (order.status === "paid") reason = "extra_transfer";
      else if (t.amount !== order.amount) reason = "amount_mismatch";
      else if (
        !sideTokens.includes(order.side) ||
        config.sides.some((s) => s !== order.side && sideTokens.includes(s))
      )
        reason = "side_mismatch";
      else if (t.happenedAt === null) reason = "missing_time";
      else if (
        t.happenedAt < order.created_at - 60_000 ||
        t.happenedAt > at + 5 * 60_000
      )
        reason = "invalid_time";
      else if (t.happenedAt >= order.closes_at) reason = "after_close";
      else if (t.happenedAt >= order.expires_at) reason = "after_expiry";
      else if (
        used.count >= order.max_transactions ||
        used.amount + t.amount > order.max_user_amount
      )
        reason = "user_limit";
      else reason = "matched";
    }
    db.prepare(
      `INSERT INTO bank_bet_receipts
      (provider_id,reference,bank_code,receiver,amount,description,happened_at,received_at,order_id,reason)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      t.id,
      t.reference || null,
      t.bankCode,
      t.virtualAccount || t.accountNumber,
      t.amount,
      t.description,
      t.happenedAt,
      at,
      order?.id || null,
      reason,
    );
    if (order) {
      if (reason === "matched")
        db.prepare(
          `UPDATE bank_bet_orders SET status='paid', paid_at=?, provider_id=?,
        ui_dirty=1, revision=revision+1 WHERE id=?`,
        ).run(t.happenedAt, t.id, order.id);
      else if (order.status !== "paid")
        db.prepare(
          `UPDATE bank_bet_orders SET status='review',
        ui_dirty=1, revision=revision+1 WHERE id=?`,
        ).run(order.id);
    }
    return { reason, orderId: order?.id || null };
  });

  function totals(guildId, campaignId) {
    // Reclassify the player's entire confirmed balance to their latest actual bank transaction.
    return db
      .prepare(
        `WITH paid AS (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY paid_at DESC, provider_id DESC) AS rank
      FROM bank_bet_orders WHERE guild_id=? AND campaign_id=? AND status='paid'
    ), wallets AS (SELECT user_id,SUM(amount) AS amount,COUNT(*) AS transactions FROM paid GROUP BY user_id)
    SELECT paid.side, SUM(wallets.amount) AS amount,COUNT(*) AS players,SUM(wallets.transactions) AS transactions
    FROM paid JOIN wallets USING(user_id) WHERE paid.rank=1 GROUP BY paid.side`,
      )
      .all(guildId, campaignId);
  }
  function player(guildId, campaignId, userId) {
    const rows = db
      .prepare(
        `SELECT * FROM bank_bet_orders WHERE guild_id=? AND campaign_id=? AND user_id=?
      ORDER BY created_at DESC,id DESC LIMIT 10`,
      )
      .all(guildId, campaignId, userId);
    const latest = db
      .prepare(
        `SELECT side FROM bank_bet_orders WHERE guild_id=? AND campaign_id=? AND user_id=? AND status='paid'
      ORDER BY paid_at DESC,provider_id DESC LIMIT 1`,
      )
      .get(guildId, campaignId, userId);
    return {
      ...usage(guildId, campaignId, userId),
      side: latest?.side || null,
      rows,
    };
  }
  return {
    create: (...args) => create.immediate(...args),
    receive: (...args) => receive.immediate(...args),
    expire,
    totals,
    player,
    get: (id) => orderById.get(id),
    bindMessage(id, messageId) {
      db.prepare(
        "UPDATE bank_bet_orders SET message_id=?,ui_dirty=CASE WHEN status='pending' THEN 0 ELSE 1 END,revision=revision+1 WHERE id=?",
      ).run(messageId, id);
    },
    expireUnpublished(id) {
      return (
        db
          .prepare(
            "UPDATE bank_bet_orders SET status='expired',expires_at=MIN(expires_at,?),revision=revision+1 WHERE id=? AND message_id IS NULL AND status='pending'",
          )
          .run(now(), id).changes > 0
      );
    },
    pendingUI: () =>
      db
        .prepare(
          `SELECT * FROM bank_bet_orders WHERE ui_dirty=1 AND message_id IS NOT NULL
      AND next_attempt_at<=? ORDER BY created_at LIMIT 20`,
        )
        .all(now()),
    acknowledge(order) {
      db.prepare(
        "UPDATE bank_bet_orders SET ui_dirty=0 WHERE id=? AND revision=?",
      ).run(order.id, order.revision);
    },
    retry(order) {
      db.prepare("UPDATE bank_bet_orders SET next_attempt_at=? WHERE id=?").run(
        now() + 30_000,
        order.id,
      );
    },
  };
}

module.exports = { createStore };
