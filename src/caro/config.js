"use strict";

function readConfig(env = process.env) {
  const enabled = /^(1|true)$/i.test(env.CARO_WEB_ENABLED || "");
  if (!enabled) return { enabled: false };
  const url = new URL(env.CARO_PUBLIC_URL || "http://127.0.0.1:3000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "CARO_PUBLIC_URL phải là địa chỉ HTTPS gốc (HTTP chỉ dùng cho localhost).",
    );
  const port = Number(env.CARO_WEB_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("CARO_WEB_PORT không hợp lệ.");
  return {
    enabled,
    origin: url.origin,
    secure: url.protocol === "https:",
    host: env.CARO_WEB_HOST || "127.0.0.1",
    port,
  };
}

module.exports = { readConfig };
