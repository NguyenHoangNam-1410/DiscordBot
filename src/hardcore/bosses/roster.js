"use strict";
const VERSION = 1;
const ROSTER = Object.freeze(
  [
    [50, "The Butcher", "butcher", "physical"],
    [100, "Infernal Machine", "machine", "magic"],
    [150, "Assur", "assur", "magic"],
    [200, "Master Control System", "control", "magic"],
    [250, "Necrobot Alpha", "necrobot", "mixed"],
    [300, "Quov Tsin", "quov", "magic"],
    [350, "Lucion", "lucion", "magic"],
    [400, "Bul-Kathos", "bul_kathos", "physical"],
    [450, "Spirit of Giyua", "giyua", "magic"],
    [500, "Ascendant Riftwalker", "riftwalker", "mixed"],
    [550, "Gharbad the Weak", "gharbad", "physical"],
    [600, "Phoboss", "phoboss", "magic"],
    [650, "Unstable Anomaly", "anomaly", "mixed"],
    [666, "Kabraxis, Keeper of the Seals", "kabraxis", "mixed"],
    [700, "Zakarum Avatar", "zakarum", "magic"],
    [750, "The Justicar", "justicar", "mixed"],
    [800, "Uldyssian the Tainted", "uldyssian", "mixed"],
    [850, "Archbishop Lazarus", "lazarus", "magic"],
    [900, "Xazax", "xazax", "magic"],
    [950, "Samael", "samael", "mixed"],
    [999, "Deimoss the Fleshweaver", "deimoss", "mixed"],
  ].map(([floor, name, id, damageType]) =>
    Object.freeze({ floor, name, id, damageType }),
  ),
);
const CHEST_FLOORS = Object.freeze([100, 200, 300, 400, 500, 700, 900]);
function enabled(s) {
  return (
    s?.gameplayVersion === 2 &&
    s.bossRosterVersion === VERSION &&
    !s.mode?.startsWith("tower") &&
    !s.towerChallengeId
  );
}
function at(floor) {
  return ROSTER.find((b) => b.floor === floor);
}
function factors(floor) {
  return floor === 999
    ? [7.2, 2]
    : floor === 950
      ? [6.4, 2.1]
      : floor === 900
        ? [5.8, 2]
        : floor >= 666
          ? [5.2, 1.9]
          : floor >= 500
            ? [4.8, 1.8]
            : floor >= 300
              ? [4.4, 1.7]
              : [4, 1.6];
}
module.exports = { VERSION, ROSTER, CHEST_FLOORS, enabled, at, factors };
