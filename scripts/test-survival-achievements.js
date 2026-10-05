const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDb = path.resolve(__dirname, "../data/test-survival-achievements.sqlite");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDb}${suffix}`, { force: true });
process.env.DB_PATH = testDb;

const { db } = require("../src/db");
const { getAchievements, ACHIEVEMENTS } = require("../src/services/achievementService");
const repo = require("../src/services/hardcoreRepository");
const { CLASSES } = require("../src/services/hardcoreStats");

assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
for (const key of Object.keys(CLASSES))
  assert(ACHIEVEMENTS.some((a) => a.metric === `hcClass_${key}` && a.target === 500), `thiếu mốc 500 cho ${key}`);
assert(ACHIEVEMENTS.filter((a) => a.metric.startsWith("hcClass_")).every((a) => a.target <= 500));

const G = "g", U = "u";
const progress = (id) => getAchievements(G, U).find((a) => a.id === id);
assert.equal(progress("hc_class_druid_50").progress, 0);

const arch = db.prepare("INSERT INTO hardcore_run_archive VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
const row = (id, cls, cleared) => arch.run(id, G, U, 2, "2.0.0", cls, cleared, "death", 1000, 0, 0, 10, 1, 2);
row("a", "druid", 60); row("b", "druid", 160); row("c", "paladin", 40); row("d", "amazon", 500);
assert(progress("hc_class_druid_50").complete && progress("hc_class_druid_150").complete);
assert(!progress("hc_class_druid_300").complete);
assert.equal(progress("hc_class_druid_300").progress, 160, "lấy tầng cao nhất của class đó");
assert(!progress("hc_class_paladin_50").complete, "class khác không cộng chéo");
assert.equal(progress("hc_class_paladin_50").progress, 40);
assert(progress("hc_class_amazon_500").complete);

assert.equal(progress("hc_event_5").progress, 0);
repo.addEventStats(G, U, { events: 6, chains: 2, kinds: ["healer", "goblin", "doors"] });
repo.addEventStats(G, U, { events: 20, chains: 2, kinds: ["goblin", "wrong_portal", "ambush", "mirror", "fountain"] });
assert(progress("hc_event_5").complete && progress("hc_event_25").complete && !progress("hc_event_100").complete);
assert.equal(progress("hc_event_100").progress, 26);
assert(progress("hc_chain_3").progress === 3 && progress("hc_chain_3").complete);
assert.equal(progress("hc_kinds_10").progress, 7, "loại sự kiện trùng chỉ tính một lần");
assert(progress("hc_kinds_5").complete && !progress("hc_kinds_10").complete);
repo.addEventStats(G, U, { events: 0, chains: 0, kinds: [] });
assert.equal(progress("hc_event_100").progress, 26);
console.log("survival achievements ok");
