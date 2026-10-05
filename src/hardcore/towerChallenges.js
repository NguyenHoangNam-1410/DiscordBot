"use strict";
const engine = require("../services/hardcoreTowerEngine");
const CHALLENGES = [require("./tower/week-2026-W41")];
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
for (const c of CHALLENGES) {
  engine.verify(c);
  if (
    !Number.isFinite(Date.parse(c.startsAt)) ||
    Date.parse(c.endsAt) <= Date.parse(c.startsAt)
  )
    throw Error("INVALID_TOWER_DATES");
  freeze(c);
}
Object.freeze(CHALLENGES);
function get(id, version) {
  return (
    CHALLENGES.find(
      (c) =>
        c.challengeId === id &&
        (version == null || c.contentVersion === version),
    ) || null
  );
}
function active(now = Date.now()) {
  return (
    CHALLENGES.find(
      (c) => now >= Date.parse(c.startsAt) && now < Date.parse(c.endsAt),
    ) || null
  );
}
function readable(c, now = Date.now()) {
  return now >= Date.parse(c.startsAt) && now < Date.parse(c.endsAt) + 86400000;
}
function playable(c, now = Date.now()) {
  return now >= Date.parse(c.startsAt) && now < Date.parse(c.endsAt);
}
function recent(now = Date.now()) {
  return CHALLENGES.find((c) => readable(c, now)) || null;
}
module.exports = { CHALLENGES, get, active, recent, readable, playable };
