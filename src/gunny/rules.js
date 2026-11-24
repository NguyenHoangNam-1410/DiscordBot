"use strict";
const { timeMinutes } = require("../webGames/clock");
const WIDTH = 1600,
  HEIGHT = 600,
  HP = 500,
  STAMINA = 200,
  WALK_COST = 2,
  POW_MAX = 100;
// Turn order is decided by delay: whoever has the lowest delay acts next, so
// heavy weapons, items and slow aiming can hand the opponent two turns in a row.
const DELAY = Object.freeze({
  turn: 600,
  aimPerSecond: 10,
  pass: 400,
  timeout: 900,
});
// Classic Gunny projectile model: every weapon leaves the barrel with the same
// throw force (initial speed in px/s, vx = F·cos, vy = F·sin), then each
// 0.04 s Euler step applies a = (force − air·v) / mass on both axes, where the
// vertical force is gravity × weight × mass and the horizontal one is
// wind × windFactor. Weapons differ only by mass, weight, wind and drag.
const PHYSICS = Object.freeze({
  dt: 0.04,
  maxForce: 760, // px/s at 100% power
  gravity: 420, // px/s² for weight 1
  wind: 22, // px/s² per wind unit for windFactor 1 and mass 1
  air: 0.06, // air resistance per second for drag 1
});
const DAMAGE = Object.freeze({
  edge: 0.5, // fraction of damage left at the edge of the blast radius
  critChance: 0.08,
  critMultiplier: 1.5,
  selfMultiplier: 0.5,
  frozenMultiplier: 0.5,
});
const CHARACTERS = Object.freeze(["bear", "cat", "robot"]);
const WEAPONS = Object.freeze({
  basic: {
    minAngle: 0,
    maxAngle: 90,
    name: "Đạn thường",
    damage: 125,
    radius: 20,
    ammo: -1,
    mass: 1,
    weight: 1,
    windFactor: 1,
    drag: 1,
    delay: 200,
  },
  grenade: {
    minAngle: 20,
    maxAngle: 80,
    name: "Lựu đạn",
    damage: 200,
    radius: 35,
    ammo: 3,
    mass: 0.9,
    weight: 1.1,
    windFactor: 1.2,
    drag: 1.3,
    delay: 280,
  },
  missile: {
    minAngle: 10,
    maxAngle: 70,
    name: "Tên lửa",
    damage: 250,
    radius: 25,
    ammo: 2,
    mass: 1.2,
    weight: 0.5,
    windFactor: 0.6,
    drag: 0.6,
    delay: 320,
  },
  nuke: {
    minAngle: 30,
    maxAngle: 75,
    name: "Bom hạt nhân",
    damage: 400,
    radius: 60,
    ammo: 1,
    mass: 2,
    weight: 1.05,
    windFactor: 1,
    drag: 1,
    delay: 500,
  },
});
// Items cost shared stamina (the same pool used for walking) and add delay.
// Each item can be used once per turn; `perMatch` limits total uses.
const ITEMS = Object.freeze({
  triple: {
    name: "Đạn chùm ×3",
    cost: 100,
    delay: 120,
    description: "Bắn 3 viên tỏa góc ±4°, mỗi viên 60% sát thương.",
  },
  double: {
    name: "Bắn liên tiếp ×2",
    cost: 110,
    delay: 150,
    description:
      "Bắn 2 loạt liên tiếp cùng góc và lực, mỗi loạt 70% sát thương.",
  },
  power: {
    name: "Tăng lực +30%",
    cost: 60,
    delay: 80,
    description: "Phát bắn lượt này gây thêm 30% sát thương.",
  },
  freeze: {
    name: "Đạn băng",
    cost: 80,
    delay: 100,
    description:
      "Mục tiêu trúng đạn bị đóng băng: lượt kế không di chuyển, không dùng đạo cụ.",
  },
  poison: {
    name: "Đạn độc",
    cost: 70,
    delay: 90,
    description:
      "Mục tiêu trúng đạn mất 30 HP đầu mỗi lượt của họ trong 3 lượt.",
  },
  heal: {
    name: "Hồi máu +125",
    cost: 90,
    delay: 100,
    perMatch: 2,
    description:
      "Hồi ngay 125 HP (không vượt máu tối đa). Mỗi trận dùng 2 lần.",
  },
  fly: {
    name: "Bay",
    cost: 120,
    delay: 150,
    cooldown: 2,
    description:
      "Phát bắn lượt này không gây sát thương; bạn bay tới điểm đạn rơi. Hồi 2 lượt.",
  },
});
const SHOT_ITEMS = Object.freeze([
  "triple",
  "double",
  "freeze",
  "poison",
  "power",
]);
const BALLS = Object.freeze({
  triple: { angles: [0, -4, 4], power: [1, 0.94, 1.06], damage: 0.6 },
  double: { volleys: 2, damage: 0.7 },
});
const STATUS = Object.freeze({
  freezeTurns: 1,
  poisonTurns: 3,
  poisonDamage: 30,
});
const POW = Object.freeze({
  damage: 1.5,
  radius: 1.25,
  perShot: 12,
  perPass: 8,
  damageTaken: 0.12, // damage is ×5 for 500 HP: same POW pace as before
  damageTakenCap: 30,
});
const HEAL = 125;
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
    `${HP} HP · ${STAMINA} thể lực/lượt · ` +
    r.turnSeconds +
    " giây/lượt · " +
    r.timeMinutes +
    " phút/người · 4 vũ khí · 7 đạo cụ · delay & nộ"
  );
}
module.exports = {
  WIDTH,
  HEIGHT,
  HP,
  STAMINA,
  WALK_COST,
  POW_MAX,
  DELAY,
  PHYSICS,
  DAMAGE,
  CHARACTERS,
  WEAPONS,
  ITEMS,
  SHOT_ITEMS,
  BALLS,
  STATUS,
  POW,
  HEAL,
  normalizeRules,
  rulesText,
};
