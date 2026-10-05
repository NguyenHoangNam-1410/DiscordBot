"use strict";
// The retired handwritten fixture stays reproducible for historical result views.
// V3 persistence, UI and abuse coverage lives in test-hardcore-tower-runtime.js.
const assert = require("node:assert/strict");
const catalog = require("../src/hardcore/towerChallenges");
const engine = require("../src/services/hardcoreTowerEngine");
const c = catalog.get("tower-2026-W41-v1");
const random = Math.random;
Math.random = () => {
  throw Error("LEGACY_TOWER_RUNTIME_RNG");
};
try {
  const proof = engine.verify(c);
  assert.equal(proof.winningPaths.length, 1);
  assert.equal(c.canonicalSolution.length, 23);
  assert.deepEqual(proof.winningPaths[0].actions, c.canonicalSolution);
  assert.deepEqual(
    [
      proof.winningPaths[0].state.floor,
      proof.winningPaths[0].state.hp,
      proof.winningPaths[0].state.mana,
    ],
    [15, 14, 0],
  );
  console.log(
    "Archived tower v1: original 23-step solution and deterministic engine preserved.",
  );
} finally {
  Math.random = random;
}
