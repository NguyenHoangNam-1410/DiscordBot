"use strict";
// Simulation-only module copies. No production source or Tower behavior is changed.
const fs = require("node:fs");
const Module = require("node:module");
const variant = process.env.HARDCORE_SIM_CHECKPOINTS || "baseline";
if (!["baseline", "700-10x10"].includes(variant))
  throw Error("INVALID_CHECKPOINT_EXPERIMENT");
const proposed = variant === "700-10x10";
const settings = Object.freeze({
  variant,
  fromClearedFloor: proposed ? 700 : null,
  intervalBefore: 5,
  pointsBefore: 5,
  intervalAfter: proposed ? 10 : 5,
  pointsAfter: proposed ? 10 : 5,
  healAtCheckpoint: "Full HP and +2 potions, respecting the existing cap",
});
function ordinal(floor) {
  return proposed && floor >= 700 ? 139 + (floor - 690) / 10 : floor / 5;
}
function patch(relative, before, after) {
  const filename = require.resolve(relative);
  if (require.cache[filename]) throw Error("EXPERIMENT_ENGINE_ALREADY_LOADED");
  const original = fs.readFileSync(filename, "utf8");
  if (original.split(before).length !== 2)
    throw Error("EXPERIMENT_SOURCE_CHANGED: " + filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(
    require("node:path").dirname(filename),
  );
  compiled._compile(original.replace(before, after), filename);
  compiled.loaded = true;
  require.cache[filename] = compiled;
}
function install() {
  if (!proposed) return;
  if (process.env.HARDCORE_GAMEPLAY_VERSION === "legacy")
    throw Error("EXPERIMENT_REQUIRES_V2");
  const applies =
    "state.gameplayVersion === 2 && !state.mode?.startsWith('tower') && !state.towerChallengeId";
  patch(
    "../src/hardcore/engine/progression",
    "if (floor % 5 === 0) {",
    "if (floor % ((" + applies + ") && floor >= 700 ? 10 : 5) === 0) {",
  );
  patch(
    "../src/hardcore/engine/actions",
    'addSource(state, { [key]: 5 }, "checkpoint");',
    "addSource(state, { [key]: (" +
      applies +
      ') && state.cleared >= 700 ? 10 : 5 }, "checkpoint");',
  );
}
module.exports = { settings, ordinal, install };
