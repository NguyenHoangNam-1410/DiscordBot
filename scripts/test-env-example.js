"use strict";
// Giữ .env.example đầy đủ: mọi biến môi trường mà bot đọc phải được liệt kê (dạng `NAME=` hoặc `# NAME=`).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const listed = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".js") ? [full] : [];
  });
}
const files = [...walk(path.join(root, "src")), ...["register-commands", "post-announcement", "simulate-rtp"].map((n) => path.join(root, "scripts", `${n}.js`))];
const used = new Set();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
  // biến đọc qua hàm trợ giúp: integerEnv("NAME", ...), envReward("NAME", ...)
  for (const m of text.matchAll(/(?:integerEnv|envReward)\(\s*"([A-Z][A-Z0-9_]+)"/g)) used.add(m[1]);
}
// khóa cấu hình cân bằng đọc từ process.env[key] trong gameConfigService
const config = fs.readFileSync(path.join(root, "src/services/gameConfigService.js"), "utf8");
for (const m of config.matchAll(/^  ([A-Z][A-Z0-9_]+): Object\.freeze\(\{([\s\S]*?)\n  \}\),/gm))
  if (!/retired: true/.test(m[2])) used.add(m[1]); // cấu hình đã ngừng dùng không cần liệt kê

const ignore = new Set(["NODE_ENV", "TZ"]);
const missing = [...used].filter((name) => !ignore.has(name) && !listed.has(name)).sort();
assert.deepEqual(missing, [], `Thiếu trong .env.example: ${missing.join(", ")}`);
assert(used.size > 40, "phải quét được đủ biến");
const unknown = [...listed].filter((name) => !used.has(name) && !name.startsWith("HARDCORE_SIM_")).sort();
assert.deepEqual(unknown, [], `Có trong .env.example nhưng code không đọc: ${unknown.join(", ")}`);
console.log(JSON.stringify({ ok: true, envExample: true, variables: listed.size }));
