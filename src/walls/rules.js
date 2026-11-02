"use strict";
const { timeMinutes, DEFAULT_TIME_MINUTES } = require("../webGames/clock");

const SIZE = 9;
const DEFAULT_RULES = Object.freeze({
  wallLength: 2,
  wallLimit: 10,
  timeMinutes: DEFAULT_TIME_MINUTES,
});
function normalizeRules(input = {}) {
  const rules = { ...DEFAULT_RULES, ...input };
  timeMinutes(rules.timeMinutes);
  if (
    ![1, 2].includes(rules.wallLength) ||
    !Number.isInteger(rules.wallLimit) ||
    rules.wallLimit < 0 ||
    rules.wallLimit > 20
  )
    throw Object.assign(
      new Error(
        "Tường chỉ dài 1 hoặc 2 ô; số tường mỗi người phải là số nguyên từ 0 đến 20.",
      ),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({
    wallLength: rules.wallLength,
    wallLimit: rules.wallLimit,
    timeMinutes: rules.timeMinutes,
  });
}
function rulesText(input) {
  const rules = normalizeRules(input);
  return `Bàn 9×9 · Tường dài ${rules.wallLength} ô · ${rules.wallLimit} tường/người · Đến hàng đối diện trước để thắng · ${rules.timeMinutes} phút/người, không cộng giờ`;
}
module.exports = { SIZE, DEFAULT_RULES, normalizeRules, rulesText };
