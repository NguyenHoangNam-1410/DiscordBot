"use strict";
const RELEASE = Object.freeze({
  version: "3.2.0",
  gameplay: 3,
  catalog: 2,
  date: "2026-10-19",
  baselineCommit: "c0c6213",
});
function isV2(state) {
  // Compatibility name for saved V2 and new V3 runs using the same engine.
  return [2, 3].includes(state?.gameplayVersion);
}
module.exports = { RELEASE, isV2 };
