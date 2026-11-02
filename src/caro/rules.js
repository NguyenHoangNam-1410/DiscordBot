"use strict";

const DEFAULT_RULES = Object.freeze({
  size: 15,
  winLength: 5,
  blockBothEnds: false,
  exactLength: false,
  edgeBlocks: false,
});

function normalizeRules(input = {}) {
  const rules = { ...DEFAULT_RULES, ...input };
  if (
    !Number.isInteger(rules.size) ||
    rules.size < 9 ||
    rules.size > 25 ||
    !Number.isInteger(rules.winLength) ||
    rules.winLength < 3 ||
    rules.winLength > 6 ||
    rules.winLength > rules.size ||
    ["blockBothEnds", "exactLength", "edgeBlocks"].some(
      (key) => typeof rules[key] !== "boolean",
    )
  )
    throw Object.assign(
      new Error(
        "Luật không hợp lệ: bàn 9–25 ô mỗi cạnh, nối 3–6 quân; các luật chặn/đúng số quân phải là bật hoặc tắt.",
      ),
      { code: "INVALID_RULES" },
    );
  return Object.freeze(
    Object.fromEntries(
      Object.keys(DEFAULT_RULES).map((key) => [key, rules[key]]),
    ),
  );
}

function rulesText(input) {
  const r = normalizeRules(input);
  return `Bàn ${r.size}×${r.size} · ${r.exactLength ? "Đúng" : "Từ"} ${r.winLength} quân liên tiếp thắng · ${r.blockBothEnds ? "Chặn 2 đầu không thắng" : "Chặn 2 đầu vẫn thắng"}${r.blockBothEnds ? ` · Mép bàn ${r.edgeBlocks ? "có" : "không"} tính chặn` : ""}`;
}

module.exports = { DEFAULT_RULES, normalizeRules, rulesText };
