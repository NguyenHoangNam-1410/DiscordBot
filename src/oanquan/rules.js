"use strict";
const { timeMinutes } = require("../webGames/clock");
const RULES_ID = "oanquan-v1";
const ROWS = Object.freeze({
  X: Object.freeze([1, 2, 3, 4, 5]),
  O: Object.freeze([7, 8, 9, 10, 11]),
});
const isQuan = (i) => i === 0 || i === 6;
function normalizeRules(input = {}) {
  const first = input.first ?? "host";
  if (
    !["host", "guest", "random"].includes(first) ||
    (input.allowYoungQuan !== undefined &&
      typeof input.allowYoungQuan !== "boolean")
  )
    throw Object.assign(new Error("Cấu hình Ô ăn quan không hợp lệ."), {
      code: "INVALID_RULES",
    });
  return Object.freeze({
    first,
    timeMinutes: timeMinutes(input.timeMinutes),
    allowYoungQuan: input.allowYoungQuan ?? true,
    rulesId: RULES_ID,
  });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return (
    "10 ô dân · 2 ô quan · 1 quan = 10 điểm · " +
    (r.allowYoungQuan ? "Ăn quan non" : "Quan cần ≥5 dân") +
    " · " +
    r.timeMinutes +
    " phút/người"
  );
}
module.exports = { RULES_ID, ROWS, isQuan, normalizeRules, rulesText };
