"use strict";
const { timeMinutes } = require("../webGames/clock");
const WIDTH = 1600,
  HEIGHT = 600,
  HP = 100,
  MOVE = 60;
const CHARACTERS = Object.freeze(["bear", "cat", "robot"]);
const WEAPONS = Object.freeze({
  basic: {
    minAngle: 0,
    maxAngle: 90,
    name: "Đạn thường",
    damage: 25,
    radius: 20,
    ammo: -1,
    gravity: 1,
  },
  grenade: {
    minAngle: 20,
    maxAngle: 80,
    name: "Lựu đạn",
    damage: 40,
    radius: 35,
    ammo: 3,
    gravity: 1,
  },
  missile: {
    minAngle: 10,
    maxAngle: 70,
    name: "Tên lửa",
    damage: 50,
    radius: 25,
    ammo: 2,
    gravity: 0.5,
  },
  nuke: {
    minAngle: 30,
    maxAngle: 75,
    name: "Bom hạt nhân",
    damage: 80,
    radius: 60,
    ammo: 1,
    gravity: 1,
  },
});
function normalizeRules(input = {}) {
  const first = input.first ?? "host",
    turnSeconds = input.turnSeconds ?? 30;
  if (
    !["host", "guest", "random"].includes(first) ||
    !Number.isInteger(turnSeconds) ||
    turnSeconds < 15 ||
    turnSeconds > 120
  )
    throw Object.assign(
      Error("Chọn người đi trước hợp lệ và 15–120 giây mỗi lượt."),
      { code: "INVALID_RULES" },
    );
  return Object.freeze({
    first,
    timeMinutes: timeMinutes(input.timeMinutes),
    turnSeconds,
  });
}
function rulesText(input) {
  const r = normalizeRules(input);
  return (
    "100 HP · 60 bước/lượt · " +
    r.turnSeconds +
    " giây/lượt · " +
    r.timeMinutes +
    " phút/người · 4 vũ khí"
  );
}
module.exports = {
  WIDTH,
  HEIGHT,
  HP,
  MOVE,
  CHARACTERS,
  WEAPONS,
  normalizeRules,
  rulesText,
};
