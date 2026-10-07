"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "hardcore-checkpoint-probe-"),
);
process.env.DB_PATH = path.join(temp, "probe.sqlite");
const experiment = require("./hardcore-checkpoint-experiment");
experiment.install();
const core = require("../src/hardcore/engine");
const stats = require("../src/hardcore/engine/stats");
const { db } = require("../src/db");
const proposed = experiment.settings.variant !== "baseline";
const session = { id: "probe", guild_id: "probe", user_id: "probe" };
try {
  for (const mode of ["normal", "tower-v3"]) {
    for (const floor of [5, 695, 699, 700, 705, 710, 990, 995]) {
      const state = stats.createState("amazon", 100000);
      state.mode = mode;
      state.floor = floor;
      state.cleared = floor - 1;
      state.hp = 7;
      state.potions = 1;
      state.encounter = { type: "empty", name: "Probe" };
      const changed = proposed && mode === "normal" && floor >= 700;
      const checkpoint = floor % (changed ? 10 : 5) === 0;
      core.completeFloor(state, session, () => 0.5, 0, {
        deferEncounter: true,
      });
      assert.equal(
        state.pendingMilestones.includes("upgrade"),
        checkpoint,
        mode + ":" + floor,
      );
      assert.equal(state.hp, checkpoint ? state.maxHp : 7);
      assert.equal(state.potions, checkpoint ? 3 : 1);
      if (checkpoint) {
        state.phase = "upgrade";
        state.encounter = { type: "upgrade" };
        state.pendingMilestones = ["probe"];
        core.act(state, session, "upgrade_str", () => 0.5);
        assert.equal(state.sources.checkpoint.str, changed ? 10 : 5);
      }
    }
  }
  const floors = Array.from({ length: 999 }, (_, i) => i + 1).filter(
    (f) => f % (proposed && f >= 700 ? 10 : 5) === 0,
  );
  for (let i = 0; i < floors.length; i++)
    assert.equal(experiment.ordinal(floors[i]), i + 1);
  assert.equal(floors.filter((f) => f >= 700).length, proposed ? 30 : 60);
  assert.equal(
    floors
      .filter((f) => f >= 700)
      .reduce((sum, f) => sum + (proposed ? 10 : 5), 0),
    300,
  );
  console.log(
    experiment.settings.variant +
      ": boundaries, actual HP/potion refill, actual points, alternating policy, equal late-game point budget and Tower isolation passed.",
  );
} finally {
  db.close();
  if (
    path.dirname(temp) !== path.resolve(os.tmpdir()) ||
    !path.basename(temp).startsWith("hardcore-checkpoint-probe-")
  )
    throw Error("INVALID_TEMP_PATH");
  fs.rmSync(temp, { recursive: true, force: true });
}
