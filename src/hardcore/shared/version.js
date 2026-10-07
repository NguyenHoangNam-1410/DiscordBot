"use strict";
const RELEASE = Object.freeze({
  version: "2.0.1",
  gameplay: 2,
  catalog: 2,
  date: "2026-10-03",
  legacyCommit: "c0c6213",
  legacyRunVersion: 4,
});
function isV2(state) {
  return state?.gameplayVersion === 2;
}
function useV2() {
  return process.env.HARDCORE_GAMEPLAY_VERSION !== "legacy";
}
module.exports = { RELEASE, isV2, useV2 };
