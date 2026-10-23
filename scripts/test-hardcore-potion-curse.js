"use strict";
// Lời nguyền giảm sức chứa bình: luôn số nguyên, tăng đúng 1 mỗi cấp nguyền chưa giải (tối thiểu 1 bình).
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine");
const stats = require("../src/hardcore/engine/stats");
const item = require("../src/hardcore/item");
const itemCurses = require("../src/hardcore/itemCurses");

const crown = Object.values(item.ITEMS)
  .flat()
  .find((x) => x.id === "crown_of_ruin");
assert.equal(crown.curse.effects.potionCapacityLoss, 1);

for (const equipmentRules of [true, false]) {
  const s = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
  if (equipmentRules) require("../src/hardcore/equipment/rules").activate(s);
  assert.equal(s.maxPotions, 5);
  const seen = [];
  for (let level = 1; level <= 7; level += 1) {
    core.receiveItem(s, crown);
    stats.recompute(s);
    assert.equal(s.items[0].level, level);
    assert.ok(
      Number.isInteger(s.maxPotions),
      `maxPotions nguyên ở cấp ${level}`,
    );
    assert.ok(Number.isInteger(s.potions), `potions nguyên ở cấp ${level}`);
    assert.equal(
      s.maxPotions,
      Math.max(1, 5 - level),
      `mỗi cấp −1 bình (cấp ${level})`,
    );
    assert.ok(s.potions <= s.maxPotions);
    seen.push(s.maxPotions);
  }
  assert.deepEqual(seen, [4, 3, 2, 1, 1, 1, 1], "rules " + equipmentRules);
  // Giải nguyền từng cấp trả lại đúng 1 bình mỗi cấp
  s.items[0].cleansedLevels = 3;
  stats.recompute(s);
  assert.equal(s.maxPotions, Math.max(1, 5 - 4));
  s.items[0].cleansedLevels = s.items[0].level;
  stats.recompute(s);
  assert.equal(s.maxPotions, 5);
}

// Run đã lưu có số bình lẻ được làm tròn xuống khi tính lại
{
  const s = stats.createState("barbarian", 10000, { gameplayVersion: 3 });
  s.potions = 2.7;
  stats.recompute(s);
  assert.equal(s.potions, 2);
}

// Mô tả hiển thị theo cấp, không còn số lẻ
assert.equal(itemCurses.potionLoss(1, 3), 3);
assert.equal(itemCurses.potionLoss(1, 0), 0);
for (const level of [0.6, 1.6, 2.3, 2.7]) {
  const text = itemCurses.describeEffect("potionCapacityLoss", 1, level);
  assert.match(text, /−1 mỗi cấp nguyền/);
  assert.ok(!/\d\.\d/.test(text), text);
  assert.match(
    itemCurses.describeEffect("potionCapacityLoss", 1, level, true),
    /−1 mỗi cấp nguyền/,
  );
}

console.log(JSON.stringify({ ok: true, hardcorePotionCurse: true }));
