"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");
const ENDPOINT = "/api/bank/casso";
const MAX_BODY = 32 * 1024;
function canonical(value, depth = 0) {
  if (depth > 12) throw new Error("Webhook nesting limit");
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => canonical(v, depth + 1));
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key], depth + 1)]),
  );
}
function verifySignature(header, payload, secret) {
  // Casso V2 signs the entire recursively sorted payload, not the raw request bytes.
  // https://github.com/CassoHQ/casso-webhook-v2-verify-signature
  if (typeof header !== "string" || !secret) return false;
  const parts = /^t=(\d{13}),v1=([a-f0-9]{128})$/.exec(header);
  if (!parts) return false;
  try {
    const expected = createHmac("sha512", secret)
      .update(`${parts[1]}.${JSON.stringify(canonical(payload))}`)
      .digest();
    return timingSafeEqual(expected, Buffer.from(parts[2], "hex"));
  } catch {
    return false;
  }
}
function bankTime(value) {
  // The provider's local timestamps use Vietnam time. A date alone cannot prove the cutoff.
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)
  )
    return null;
  const text = value.replace(" ", "T");
  const at = Date.parse(text + "+07:00");
  return Number.isFinite(at) &&
    new Date(at + 7 * 3600_000).toISOString().slice(0, 19) === text
    ? at
    : null;
}
function transaction(payload) {
  const d = payload?.data;
  if (
    payload?.error !== 0 ||
    !d ||
    typeof d !== "object" ||
    Array.isArray(d) ||
    !Number.isSafeInteger(d.id) ||
    d.id < 0 ||
    !Number.isSafeInteger(d.amount) ||
    Math.abs(d.amount) > 100_000_000_000 ||
    typeof d.description !== "string" ||
    d.description.length > 2000 ||
    typeof d.accountNumber !== "string" ||
    d.accountNumber.length > 40 ||
    (d.virtualAccountNumber != null &&
      (typeof d.virtualAccountNumber !== "string" ||
        d.virtualAccountNumber.length > 40)) ||
    (d.reference != null &&
      (typeof d.reference !== "string" || d.reference.length > 200)) ||
    typeof d.bankAbbreviation !== "string" ||
    d.bankAbbreviation.length > 20
  )
    return null;
  return {
    id: d.id,
    amount: d.amount,
    description: d.description,
    accountNumber: d.accountNumber.trim().toUpperCase(),
    virtualAccount: String(d.virtualAccountNumber || "")
      .trim()
      .toUpperCase(),
    reference: String(d.reference || "").trim(),
    bankCode: d.bankAbbreviation.toUpperCase(),
    happenedAt: bankTime(d.transactionDateTime),
  };
}
function respond(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function createHandler({ getConfig, getStore, logger }) {
  return async function handle(req, res) {
    const config = getConfig();
    if (!config?.enabled) return respond(res, 503, { success: false });
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return respond(res, 405, { success: false });
    }
    if (
      req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
      "application/json"
    )
      return respond(res, 415, { success: false });
    if (
      !/^t=\d{13},v1=[a-f0-9]{128}$/.test(
        req.headers["x-casso-signature"] || "",
      )
    )
      return respond(res, 401, { success: false });
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return respond(res, 413, { success: false });
      chunks.push(chunk);
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return respond(res, 400, { success: false });
    }
    if (
      !verifySignature(req.headers["x-casso-signature"], payload, config.secret)
    )
      return respond(res, 401, { success: false });
    const t = transaction(payload);
    if (!t) return respond(res, 400, { success: false });
    // Casso's signed "Gọi thử" fixture uses id=0; acknowledge but never book test money.
    if (t.id === 0) return respond(res, 200, { success: true });
    try {
      getStore().receive(config, t);
    } catch (error) {
      logger?.error(
        { code: error.code || error.name },
        "bank receipt persistence failed",
      );
      return respond(res, 503, { success: false });
    }
    // Persist first; Discord edits are handled by the durable background UI queue.
    return respond(res, 200, { success: true });
  };
}

module.exports = {
  ENDPOINT,
  verifySignature,
  bankTime,
  transaction,
  createHandler,
};
