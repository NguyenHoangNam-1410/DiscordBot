"use strict";
const RELEASE = Object.freeze({
  version: "3.1.0",
  gameplay: 3,
  catalog: 2,
  date: "2026-10-13",
  legacyCommit: "c0c6213",
  legacyRunVersion: 4,
});
function isV2(state) {
  // Compatibility name for saved V2 and new V3 runs using the same engine.
  return [2, 3].includes(state?.gameplayVersion);
}
function useV2() {
  return process.env.HARDCORE_GAMEPLAY_VERSION !== "legacy";
}
module.exports = { RELEASE, isV2, useV2 };
