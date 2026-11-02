"use strict";

const DEFAULT_TIME_MINUTES = 30;
const MAX_TIME_MINUTES = 180;
const DEFAULT_CLOCK_MS = DEFAULT_TIME_MINUTES * 60_000;
const LEGACY_TURN_MS = 90_000;

function timeMinutes(value = DEFAULT_TIME_MINUTES) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIME_MINUTES)
    throw Object.assign(
      new Error("Thời gian mỗi người phải là số nguyên từ 1 đến 180 phút."),
      { code: "INVALID_RULES" },
    );
  return value;
}
function initialClock(minutes) {
  const ms = timeMinutes(minutes) * 60_000;
  return { clocks: { X: ms, O: ms }, clockStartedAt: null, turnDeadline: null };
}
function ensureClock(room, minutes, at) {
  if (!["waiting", "playing"].includes(room.status)) return false;
  let changed = false;
  if (!room.clocks) {
    const previousDeadline = room.turnDeadline;
    Object.assign(room, initialClock(minutes));
    // Old saves only know the start of the current turn, not earlier thinking time.
    if (room.status === "playing")
      room.clockStartedAt = Number.isFinite(previousDeadline)
        ? Math.min(at, previousDeadline - LEGACY_TURN_MS)
        : at;
    changed = true;
  }
  if (Object.hasOwn(room, "matchDeadline")) {
    delete room.matchDeadline;
    changed = true;
  }
  room.turnDeadline =
    room.status === "playing"
      ? room.clockStartedAt + room.clocks[room.turn]
      : null;
  return changed;
}
function remainingAt(room, at) {
  if (!room.clocks) return null;
  const remaining = { ...room.clocks };
  if (room.status === "playing" && Number.isFinite(room.clockStartedAt))
    remaining[room.turn] = Math.max(
      0,
      remaining[room.turn] - Math.max(0, at - room.clockStartedAt),
    );
  return remaining;
}
function flagged(room, at) {
  return room.status === "playing" && remainingAt(room, at)?.[room.turn] <= 0;
}
function stopClock(room, at) {
  const remaining = remainingAt(room, at);
  if (remaining) room.clocks = remaining;
  room.clockStartedAt = null;
  room.turnDeadline = null;
}
function startClock(room, at) {
  room.clockStartedAt = at;
  room.turnDeadline = at + room.clocks[room.turn];
}
function clockView(room, minutes, at) {
  return {
    clocks: remainingAt(room, at),
    clockStartedAt: room.status === "playing" ? at : null,
    clockInitialMs: timeMinutes(minutes) * 60_000,
    turnDeadline: room.status === "playing" ? room.turnDeadline : null,
  };
}
module.exports = {
  DEFAULT_TIME_MINUTES,
  MAX_TIME_MINUTES,
  DEFAULT_CLOCK_MS,
  timeMinutes,
  initialClock,
  ensureClock,
  remainingAt,
  flagged,
  stopClock,
  startClock,
  clockView,
};
