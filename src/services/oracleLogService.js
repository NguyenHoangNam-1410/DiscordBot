"use strict";
// Đọc log của scripts/oracle-arm-retry.sh để hiển thị tiến trình tạo VM Oracle ARM trong Discord.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_READ_BYTES = 2 * 1024 * 1024;
const DEFAULT_SLEEP_SECONDS = 150;
const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) (.*)$/;
const OCID = /ocid1(?:\.{1,2}[a-z0-9_-]+)+/gi;

function logPath() {
  return path.resolve(
    process.env.ORACLE_ARM_LOG || path.join(os.homedir(), "oracle-arm.log"),
  );
}

// OCID là định danh tài nguyên riêng của tài khoản: chỉ giữ 6 ký tự cuối để đối chiếu.
function maskOcids(text) {
  return String(text).replace(OCID, (id) => `ocid1…${id.slice(-6)}`);
}

function readLog(file = logPath()) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const { size, mtimeMs } = fs.fstatSync(fd);
    const length = Math.min(size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    let text = buffer.toString("utf8");
    // Cắt dòng dở dang ở đầu khi chỉ đọc phần đuôi của file lớn.
    if (size > length) text = text.slice(text.indexOf("\n") + 1);
    return { text, mtimeMs, truncated: size > length };
  } finally {
    fs.closeSync(fd);
  }
}

function classify(message) {
  if (/^TẠO THÀNH CÔNG/.test(message)) return "success";
  if (/^Hết capacity/.test(message)) return "capacity";
  if (/giới hạn tốc độ|429/.test(message)) return "ratelimit";
  if (/^Lỗi không thể thử lại/.test(message)) return "error";
  if (/^Lỗi tạm thời/.test(message)) return "transient";
  if (/^Đã thử \d+ lần, dừng/.test(message)) return "limit";
  if (/^Lần \d+/.test(message)) return "attempt";
  if (/^Bắt đầu/.test(message)) return "start";
  return "other";
}

function summarizeSuccess(extra) {
  try {
    const data = JSON.parse(extra.join("\n")).data || {};
    const parts = [
      data["display-name"] && `Tên: ${data["display-name"]}`,
      data.shape && `Shape: ${data.shape}`,
      data["shape-config"] &&
        `${data["shape-config"].ocpus} OCPU / ${data["shape-config"]["memory-in-gbs"]} GB`,
      data.region && `Region: ${data.region}`,
      data["lifecycle-state"] && `Trạng thái: ${data["lifecycle-state"]}`,
      data.id && `ID: ${maskOcids(data.id)}`,
    ].filter(Boolean);
    if (parts.length) return parts;
  } catch {
    // Không phải JSON hợp lệ: rơi xuống bản rút gọn bên dưới.
  }
  return [];
}

function summarizeError(extra) {
  const text = extra.join("\n");
  const code = /"code":\s*"([^"]+)"/.exec(text)?.[1];
  const message = /"message":\s*"([^"]+)"/.exec(text)?.[1];
  if (code || message)
    return [[code && `Mã: ${code}`, message].filter(Boolean).join(" · ")];
  return extra.slice(0, 3).map((line) => line.trim());
}

// Gom các dòng tiếp theo (JSON, thông báo lỗi nhiều dòng) vào đúng mục có timestamp phía trước.
function parseLog(text) {
  const entries = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const match = LINE.exec(raw);
    if (match) {
      entries.push({
        at: Date.parse(match[1]),
        message: match[2],
        extra: [],
      });
    } else if (entries.length && raw.trim()) entries.at(-1).extra.push(raw);
  }
  for (const entry of entries) {
    entry.kind = classify(entry.message);
    entry.details =
      entry.kind === "success"
        ? summarizeSuccess(entry.extra)
        : entry.kind === "error"
          ? summarizeError(entry.extra)
          : [];
    entry.message = maskOcids(entry.message);
  }
  return entries;
}

function summarize(entries, { now = Date.now(), sleepSeconds } = {}) {
  const count = (kind) => entries.filter((e) => e.kind === kind).length;
  const last = entries.at(-1) || null;
  const success =
    [...entries].reverse().find((e) => e.kind === "success") || null;
  const lastError = last?.kind === "error" ? last : null;
  const finalKinds = new Set(["success", "error", "limit"]);
  const staleAfterMs =
    ((sleepSeconds || DEFAULT_SLEEP_SECONDS) * 2 + 300 + 60) * 1000;
  let state = "running";
  if (!last) state = "empty";
  else if (success && last.kind === "success") state = "success";
  else if (finalKinds.has(last.kind)) state = last.kind;
  else if (now - last.at > staleAfterMs) state = "stale";
  return {
    state,
    attempts: Math.max(count("attempt"), 0),
    capacity: count("capacity"),
    ratelimit: count("ratelimit"),
    transient: count("transient"),
    first: entries[0]?.at || null,
    last,
    lastError,
  };
}

// Thành công luôn là mục cuối: script dừng ngay sau khi tạo được máy nên đây cũng là mục mới nhất của log.
function recent(entries, limit = 8) {
  const meaningful = entries.filter((e) => e.kind !== "attempt");
  return meaningful.slice(-Math.max(1, limit));
}

module.exports = {
  logPath,
  readLog,
  parseLog,
  summarize,
  recent,
  maskOcids,
  DEFAULT_SLEEP_SECONDS,
};
