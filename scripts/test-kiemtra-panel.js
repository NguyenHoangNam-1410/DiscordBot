const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-kiemtra-panel.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { achievementPanel } = require("../src/commands/kiemtra");

// Discord từ chối tin nhắn có custom_id trùng nhau (lỗi ở trang đầu: "Trước" và "Trang 1/n" từng trùng).
for (const page of [0, 1, 2, 3, 99]) {
  const payload = achievementPanel("g", "u", "all", "all", page);
  const ids = payload.components.flatMap((row) => row.toJSON().components.map((item) => item.custom_id));
  assert.equal(new Set(ids).size, ids.length, `trang ${page}: custom_id bị trùng ${JSON.stringify(ids)}`);
}
const first = achievementPanel("g", "u").components.at(-1).toJSON().components;
assert(first[0].disabled && first[1].disabled && !first[2].disabled, "trang đầu: Trước và chỉ số bị khoá, Sau mở");
console.log(JSON.stringify({ ok: true, kiemtraPanel: true }));
process.exit(0);
