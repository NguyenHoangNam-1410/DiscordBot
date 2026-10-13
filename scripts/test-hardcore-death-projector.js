"use strict";
const assert = require("node:assert/strict"),
  Database = require("better-sqlite3");
require.cache[require.resolve("better-sqlite3")].exports = function () {
  return new Database(":memory:");
};
const { db } = require("../src/db");
require.cache[require.resolve("better-sqlite3")].exports = Database;
const core = require("../src/hardcore/engine"),
  stats = require("../src/hardcore/engine/stats"),
  world = require("../src/hardcore/engine/world"),
  boss = require("../src/hardcore/bosses/mechanics"),
  mech = require("../src/hardcore/bosses/mechanicsV2"),
  display = require("../src/hardcore/bosses/displayV2"),
  runtime = require("../src/hardcore/bosses/runtimeV2"),
  catalog = require("../src/hardcore/bosses/catalogV2");
function fixture(floor = 50, gameplayVersion = 3, mode = null) {
  const s = stats.createState("amazon", 10000, { gameplayVersion });
  s.bossRosterVersion = 2;
  s.floor = floor;
  if (mode) s.mode = mode;
  s.encounter = world.makeEnemy(
    s,
    "boss",
    null,
    () => 0.4,
    catalog.CATALOG.death_projector,
  );
  if (!s.encounter.boss)
    boss.seed(s, s.encounter, catalog.CATALOG.death_projector, () => 0.4);
  s.hp = s.maxHp = 100000;
  s.mana = s.maxMana = 10;
  core.prepareItemCombat(s, () => 0.4);
  return s;
}
let groups = 0;
function test(label, run) {
  run();
  groups++;
  console.log("PASS " + label);
}
try {
  test("Every depth holds two turns then randomly selects either other zone", () => {
    for (const floor of [50, 400, 700]) {
      const s = fixture(floor),
        x = runtime.current(s);
      assert.equal(mech.beamCycle(x), 2);
      x.m.beamZone = 0;
      let draws = 0;
      const draw = () => {
        draws++;
        return 0.99;
      };
      boss.endAction(s, draw, {});
      assert.equal(x.m.beamZone, 0);
      assert.equal(draws, 0);
      boss.endAction(s, draw, {});
      assert.equal(x.m.beamZone, 2);
      assert.equal(draws, 1); // A -> C instead of A -> B.
      boss.endAction(
        s,
        () => {
          throw Error("early reroll");
        },
        {},
      );
      assert.equal(x.m.beamZone, 2);
      boss.endAction(s, () => 0, {});
      assert.equal(x.m.beamZone, 0);
      for (const current of [0, 1, 2])
        for (const roll of [0, 0.99]) {
          x.m.beamZone = current;
          x.b.round = 1;
          boss.endAction(s, () => roll, {});
          assert.equal(x.m.beamZone, (current + 1 + Math.floor(roll * 2)) % 3);
          assert.notEqual(x.m.beamZone, current);
        }
    }
  });
  test("Counters and movement use current locked zone; UI and resume never reroll", () => {
    const s = fixture(),
      x = runtime.current(s);
    x.m.beamZone = 2;
    for (const zone of [0, 1, 2]) {
      x.m.zone = zone;
      assert.equal(boss.counter(s).skip, zone !== 2);
    }
    const before = JSON.stringify(s),
      ui = display.status(s),
      details = display.details(s);
    assert.match(ui, /Tia vào C/);
    assert.match(ui, /ngẫu nhiên/);
    assert.doesNotMatch(details, /A→B→C|tiến hai khu/);
    assert.match(details, /giữ một vùng trong 2 lượt/);
    assert.equal(JSON.stringify(s), before);
    const resumed = structuredClone(s);
    core.normalize(resumed);
    core.prepareItemCombat(resumed, () => {
      throw Error("resume reroll");
    });
    assert.equal(runtime.current(resumed).m.beamZone, 2);
    assert.equal(display.status(resumed), ui);
    x.m.zone = 0;
    boss.actComponent(s, "boss_death_projector__zone2", { hurt: core.hurt });
    assert.equal(x.m.zone, 2);
    assert.equal(x.m.beamZone, 2);
    assert.equal(boss.counter(s).skip, false);
  });
  test("Existing V3 saves adopt current telegraph once; corrupt direction rejected", () => {
    const s = fixture(),
      x = runtime.current(s);
    delete x.m.beamZone;
    const announced = mech.beamZone(x);
    const copy = structuredClone(s);
    core.normalize(copy);
    assert.equal(display.status(copy), display.status(s));
    boss.endAction(
      s,
      () => {
        throw Error("early reroll");
      },
      {},
    );
    assert.equal(x.m.beamZone, announced);
    x.m.beamZone = 3;
    assert.throws(() => core.normalize(s), /INVALID_BOSS_STATE/);
  });
  test("Legacy V2 and Tower retain their prior beam cycles", () => {
    for (const [version, mode] of [
      [2, null],
      [3, "tower_weekly"],
    ]) {
      const s = fixture(50, version, mode),
        x = runtime.current(s);
      assert.equal(x.m.beamZone, undefined);
      assert.equal(mech.beamCycle(x), 4);
      for (let i = 0; i < 4; i++)
        boss.endAction(
          s,
          () => {
            throw Error("legacy reroll");
          },
          {},
        );
      assert.equal(mech.beamZone(x), 1);
      assert.equal(x.m.beamZone, undefined);
      assert.match(display.details(s), /A→B→C/);
    }
  });
  console.log(
    groups + " deterministic Death Projector groups passed; no simulations.",
  );
} finally {
  db.close();
}
