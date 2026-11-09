"use strict";
const { timeMinutes } = require("../webGames/clock");
const { PIECE_CHARACTERS } = require("../xiangqi/view");
const WIDTH = 9,
  HEIGHT = 10,
  RULES_ID = "xiangqi-web-v1";
const NAMES = {
  K: "Tướng",
  A: "Sĩ",
  B: "Tượng",
  N: "Mã",
  R: "Xe",
  C: "Pháo",
  P: "Tốt",
};
const validCell = (n) => Number.isInteger(n) && n >= 0 && n < 90;
const coord = (n) =>
  validCell(n)
    ? String.fromCharCode(97 + (n % 9)) + (9 - Math.floor(n / 9))
    : null;
const index = (s) =>
  typeof s === "string" && /^[a-i][0-9]$/.test(s)
    ? (9 - Number(s[1])) * 9 + s.charCodeAt(0) - 97
    : null;
function normalizeRules(input = {}) {
  const first = input.first ?? "host";
  if (
    !["host", "guest", "random"].includes(first) ||
    (input.rulesId && input.rulesId !== RULES_ID)
  )
    throw Object.assign(
      new Error("Chọn chủ phòng, khách hoặc ngẫu nhiên cầm Đỏ."),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({
    first,
    timeMinutes: timeMinutes(input.timeMinutes),
    rulesId: RULES_ID,
  });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return (
    "9×10 · Đỏ đi trước · " +
    r.timeMinutes +
    " phút/người · Thả quân là đi ngay"
  );
}
module.exports = {
  WIDTH,
  HEIGHT,
  RULES_ID,
  NAMES,
  PIECE_CHARACTERS,
  validCell,
  coord,
  index,
  normalizeRules,
  rulesText,
};
