"use strict";
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/services/hardcoreV2");
const stats = require("../src/services/hardcoreStats");
const world = require("../src/services/hardcoreWorld");
const view = require("../src/services/hardcoreV2View");
const { E, SKILL_ICONS } = require("../src/services/hardcoreIcons");
const session = {
  id: "druid",
  guild_id: "healing",
  user_id: "druid",
  channel_id: "c",
};
function druid() {
  const s = stats.createState("druid", 100);
  s.floor = 6;
  s.cleared = 5;
  s.encounter = world.makeEnemy(s, () => 0.5, "normal");
  s.encounter.hp = s.encounter.maxHp = 10000;
  return s;
}
function healed(log, before, after) {
  assert.ok(log.includes("hồi") || log.includes("Hồi"), log);
  assert.ok(
    log.includes(
      E.hp +
        " **" +
        (after - before) +
        " HP** cho bạn: " +
        before +
        " → **" +
        after +
        "**.",
    ),
    log,
  );
  assert.ok(!log.includes("undefined"));
}
// Healing occurs even on a miss, and reports actual recovery at the Max HP cap.
for (const roll of [0.5, 0.99]) {
  for (const missing of [30, 3, 0]) {
    const s = druid();
    s.hp -= missing;
    const before = s.hp,
      manaBefore = s.mana;
    const expected = Math.min(s.maxHp, before + Math.floor(s.maxHp * 0.12));
    const result = core.playerAttack(s, "skill", () => roll);
    assert.equal(s.hp, expected);
    assert.equal(s.mana, manaBefore - 2);
    healed(result.log, before, expected);
    assert.ok(result.log.includes(SKILL_ICONS.druid));
    if (roll === 0.99) assert.ok(result.log.includes("Đánh trượt"));
  }
}
{
  const s = druid();
  s.hp -= 30;
  assert.ok(
    !core.playerAttack(s, "attack", () => 0.5).log.includes(" HP** cho bạn:"),
  );
}
// Show skill healing before retaliation, rather than the HP left after the entire turn.
{
  const s = druid();
  s.hp -= 30;
  s.encounter.accuracy = 10000;
  s.encounter.damageMin = s.encounter.damageMax = 5;
  s.evasion = 0;
  const before = s.hp,
    afterHeal = before + Math.floor(s.maxHp * 0.12);
  core.act(s, session, "skill", () => 0.5);
  assert.ok(s.hp < afterHeal);
  healed(s.lastLog, before, afterHeal);
  assert.ok(s.lastLog.indexOf("Hồi ") < s.lastLog.indexOf("Bạn nhận "));
  const saved = JSON.parse(JSON.stringify(s));
  const e = view.embed(saved, "druid").toJSON();
  const log = e.fields
    .filter((f) => f.name.includes("Lượt vừa rồi"))
    .map((f) => f.value)
    .join("\n");
  healed(log, before, afterHeal);
  assert.ok(e.fields.every((f) => f.value.length <= 1024));
  assert.ok(
    e.fields
      .find((f) => f.name.includes("Druid"))
      .value.includes("hồi tối đa " + E.hp),
  );
  assert.ok(view.setupPreview("druid").skill.includes(E.hp));
  assert.ok(view.setupPreview("druid").shrine.includes(E.hp));
}
// Killing a monster still retains the healing line before floor completion.
{
  const s = druid();
  s.hp -= 30;
  s.encounter.hp = 1;
  const before = s.hp,
    after = before + Math.floor(s.maxHp * 0.12);
  core.act(s, session, "skill", () => 0.5);
  healed(s.lastLog, before, after);
  assert.ok(s.lastLog.includes("Hạ "));
}
// Shrine recovery is logged separately from checkpoint healing.
for (const floor of [5, 6]) {
  const s = druid();
  s.floor = floor;
  s.hp -= 30;
  s.classShrine = { classKey: "druid", from: 4, until: 7 };
  const before = s.hp,
    after = before + Math.floor(s.maxHp * 0.05);
  core.completeFloor(s, session, () => 0.5, 0);
  healed(s.lastLog, before, after);
  assert.ok(s.lastLog.includes(E.shrine + " Class Shrine · Druid"));
  if (floor === 5) {
    assert.equal(s.hp, s.maxHp);
    assert.ok(
      s.lastLog.indexOf("Class Shrine") < s.lastLog.indexOf("Checkpoint"),
    );
  } else assert.equal(s.hp, after);
}
db.close();
console.log(
  "Druid healing log: misses, zero/partial/full recovery, retaliation order, kill, shrine, checkpoint and persisted UI passed.",
);
