"use strict";

const fs = require("node:fs");
const path = require("node:path");
const CONFIG_PATH = path.resolve(__dirname, "../../data/bank-payments.json");

function readConfig(env = process.env, file = CONFIG_PATH) {
  if (!fs.existsSync(file)) return { enabled: false };
  return validateConfig(JSON.parse(fs.readFileSync(file, "utf8")), env);
}
function validateConfig(c, env = process.env) {
  if (c.enabled !== true) return { enabled: false };
  const guildId = String(c.guildId || env.GUILD_ID || "");
  const closesAt = Date.parse(c.closesAt);
  if (
    !/^\d{17,20}$/.test(guildId) ||
    !/^[a-zA-Z0-9_-]{1,48}$/.test(c.campaignId || "") ||
    typeof c.title !== "string" ||
    !c.title.trim() ||
    c.title.length > 100 ||
    c.bankBin !== "970448" ||
    c.bankCode !== "OCB" ||
    !/^[A-Z0-9]{4,19}$/.test(c.accountNumber || "") ||
    !/^\d{6,24}$/.test(c.mainAccountNumber || "") ||
    typeof c.accountName !== "string" ||
    !/^[A-Z ]{5,50}$/.test(c.accountName) ||
    !Array.isArray(c.sides) ||
    c.sides.length !== 2 ||
    new Set(c.sides).size !== 2 ||
    c.sides.join(",") !== "BLG,GENG" ||
    !Number.isFinite(closesAt) ||
    !/\+07:00$/.test(c.closesAt) ||
    !Number.isSafeInteger(c.minAmount) ||
    c.minAmount < 1 ||
    !Number.isSafeInteger(c.maxTransactionAmount) ||
    c.maxTransactionAmount < c.minAmount ||
    !Number.isSafeInteger(c.maxUserAmount) ||
    c.maxUserAmount < c.maxTransactionAmount ||
    c.maxUserAmount > 100_000_000 ||
    !Number.isSafeInteger(c.maxTransactions) ||
    c.maxTransactions < 1 ||
    c.maxTransactions > 10 ||
    !Number.isSafeInteger(c.waitMinutes) ||
    c.waitMinutes < 1 ||
    c.waitMinutes > 60
  )
    throw new Error(
      "Cấu hình nhận chuyển khoản không hợp lệ; kiểm tra data/bank-payments.json.",
    );
  if (
    typeof env.CASSO_WEBHOOK_SECRET !== "string" ||
    env.CASSO_WEBHOOK_SECRET.length < 20
  )
    throw new Error(
      "Thiếu CASSO_WEBHOOK_SECRET của tích hợp Casso Webhook V2.",
    );
  return Object.freeze({
    ...c,
    guildId,
    closesAt,
    secret: env.CASSO_WEBHOOK_SECRET,
  });
}

module.exports = { readConfig, validateConfig, CONFIG_PATH };
